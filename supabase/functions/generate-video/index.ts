import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { claudeChatCompletion, hasClaude } from "../_shared/claude.ts";
import { noProviderResponse, openaiChatCompletion, resolveOpenAIKey } from "../_shared/openai.ts";
import { hasHiggsfield, higgsfieldEnqueue } from "../_shared/higgsfield.ts";

const DEFAULT_MODEL = "google/gemini-2.5-pro";
const OPENAI_FALLBACK_MODEL = "gpt-4o-mini";
const VARG_API_URL = "https://api.varg.ai/v1";
const VARG_DEFAULT_MODEL = "kling-v3";

const DIRECT_OPENAI_MODELS = new Set<string>(); // routed through shared provider (Groq/Llama)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeModel(model?: string | null): string {
  const value = String(model || "").trim();
  if (!value || value === "chatgpt" || value === "openai/chatgpt") return DEFAULT_MODEL;
  if (value.startsWith("gpt-")) return `openai/${value}`;
  return value;
}

function isDirectOpenAIModel(model: string): boolean {
  const bare = model.replace(/^openai\//, "");
  return DIRECT_OPENAI_MODELS.has(bare);
}

function getOpenAIModelName(model: string): string {
  return model.replace(/^openai\//, "");
}

function getProviderErrorMessage(errorText: string): string | null {
  try {
    const parsed = JSON.parse(errorText);
    if (parsed?.error?.message && typeof parsed.error.message === "string") {
      return parsed.error.message;
    }
  } catch {}
  return null;
}

function extractAssistantText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const merged = content.map((p: any) => (typeof p === "string" ? p : p?.text || p?.content || "")).join("").trim();
    if (merged) return merged;
  }
  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  if (typeof payload?.choices?.[0]?.text === "string") return payload.choices[0].text.trim();
  return "";
}

async function getEncryptionKey(): Promise<CryptoKey | null> {
  const masterKeyB64 = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterKeyB64) return null;
  const rawKey = Uint8Array.from(atob(masterKeyB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
}

async function decryptSecret(encryptedB64: string): Promise<string> {
  const key = await getEncryptionKey();
  if (!key) return encryptedB64;
  const combined = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

async function getUserVargKey(userId: string): Promise<string | null> {
  const envKey = Deno.env.get("VARG_API_KEY");
  if (envKey) return envKey;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data } = await admin
    .from("api_keys")
    .select("api_key, service_name")
    .eq("user_id", userId)
    .in("service_name", ["varg", "varg_api_key", "VARG_API_KEY"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.api_key) return null;

  try {
    return await decryptSecret(data.api_key);
  } catch {
    return data.api_key;
  }
}

async function generateVargVideo(args: {
  prompt: string;
  apiKey: string;
  model?: string | null;
  duration?: number;
  aspectRatio?: string;
}): Promise<{ url: string; jobId: string; mediaType: string } | null> {
  const createRes = await fetch(`${VARG_API_URL}/video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model || VARG_DEFAULT_MODEL,
      prompt: args.prompt,
      duration: args.duration || 5,
      aspect_ratio: args.aspectRatio || "9:16",
    }),
  });

  const createPayload = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    throw new Error(createPayload?.message || createPayload?.error || `Varg video creation failed with ${createRes.status}`);
  }

  const jobId = createPayload?.job_id || createPayload?.id;
  if (!jobId) throw new Error("Varg did not return a job id.");

  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const statusRes = await fetch(`${VARG_API_URL}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${args.apiKey}` },
    });
    const statusPayload = await statusRes.json().catch(() => ({}));
    if (!statusRes.ok) {
      if (statusRes.status >= 400 && statusRes.status < 500) {
        throw new Error(statusPayload?.message || statusPayload?.error || `Varg job check failed with ${statusRes.status}`);
      }
      continue;
    }

    const status = String(statusPayload?.status || "").toLowerCase();
    const outputUrl = statusPayload?.output?.url || statusPayload?.url || statusPayload?.video_url;
    if ((status === "completed" || status === "succeeded" || status === "success") && outputUrl) {
      return {
        url: outputUrl,
        jobId,
        mediaType: statusPayload?.output?.media_type || "video/mp4",
      };
    }

    if (status === "failed" || status === "error" || status === "cancelled") {
      throw new Error(statusPayload?.error?.message || statusPayload?.message || "Varg video generation failed.");
    }
  }

  throw new Error("Varg video generation timed out before returning a video URL.");
}

// xAI video generation using grok-imagine-video (async polling API)
async function generateXAIVideo(prompt: string, xaiKey: string): Promise<string | null> {
  // Step 1: Submit generation request
  const submitRes = await fetch("https://api.x.ai/v1/videos/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${xaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-imagine-video",
      prompt,
      duration: 5,
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    console.warn("xAI video submit failed:", submitRes.status, errText);
    return null;
  }

  const submitData = await submitRes.json();
  const requestId = submitData?.request_id;
  if (!requestId) {
    console.warn("xAI video: no request_id in response");
    return null;
  }

  console.log("xAI video request submitted, polling request_id:", requestId);

  // Step 2: Poll for result (max ~120 seconds, within edge function limits)
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));

    const pollRes = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
      headers: { Authorization: `Bearer ${xaiKey}` },
    });

    if (!pollRes.ok) {
      const errText = await pollRes.text();
      console.warn("xAI video poll error:", pollRes.status, errText);
      if (pollRes.status >= 400 && pollRes.status < 500) return null;
      continue;
    }

    const pollData = await pollRes.json();
    const status = pollData?.status;

    if (status === "completed" || status === "succeeded") {
      const videoUrl = pollData?.video_url || pollData?.url || pollData?.data?.[0]?.url;
      if (videoUrl) return videoUrl;
      console.warn("xAI video completed but no URL found:", JSON.stringify(pollData).slice(0, 500));
      return null;
    }

    if (status === "failed" || status === "error") {
      console.warn("xAI video generation failed:", JSON.stringify(pollData).slice(0, 300));
      return null;
    }

    // Still processing, continue polling
  }

  console.warn("xAI video generation timed out after polling");
  return null;
}

// Fallback: generate a video script via text AI
async function callOpenAI(prompt: string, systemPrompt: string, modelName: string, openaiKey: string) {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });
}

async function callScriptAI(
  prompt: string, systemPrompt: string, model: string,
  openaiKey: string | null,
) {
  const normalizedModel = normalizeModel(model);

  // All AI chat/text goes through Claude when configured
  if (hasClaude()) {
    const response = await claudeChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });
    if (response.ok) return response;
    console.warn("Claude failed, falling back:", response.status);
  }

  if (isDirectOpenAIModel(normalizedModel) && openaiKey) {
    let m = getOpenAIModelName(normalizedModel);
    let response = await callOpenAI(prompt, systemPrompt, m, openaiKey);
    if (!response.ok && [400, 404].includes(response.status) && m !== OPENAI_FALLBACK_MODEL) {
      m = OPENAI_FALLBACK_MODEL;
      response = await callOpenAI(prompt, systemPrompt, m, openaiKey);
    }
    return response;
  }

  if (openaiKey) {
    return await openaiChatCompletion(openaiKey, {
      model: normalizedModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });
  }

  return noProviderResponse();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const XAI_API_KEY = Deno.env.get("XAI_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const OPENAI_API_KEY = await resolveOpenAIKey(userId);
    const { prompt, companyDetails, preferredModel, aspectRatio, duration } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: "A valid prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitizedPrompt = prompt.trim().slice(0, 12000);
    const selectedModel = normalizeModel(preferredModel);

    // --- Primary engine: Higgsfield video (via bridge, fire-and-forget → Library) ---
    if (hasHiggsfield()) {
      const videoPrompt = [
        sanitizedPrompt,
        companyDetails?.company_name ? `Brand: ${String(companyDetails.company_name).slice(0, 200)}` : "",
        companyDetails?.target_audience ? `Audience: ${String(companyDetails.target_audience).slice(0, 500)}` : "",
        "Polished social video: clear motion, premium composition, platform-native pacing.",
      ].filter(Boolean).join("\n\n");
      const ok = await higgsfieldEnqueue("video", videoPrompt, userId, {
        aspectRatio: String(aspectRatio || "9:16"),
        duration: Number(duration) || undefined,
        caption: sanitizedPrompt,
      });
      if (ok) {
        return new Response(JSON.stringify({
          pending: true, provider: "higgsfield", type: "pending",
          message: "Generating your video with Higgsfield — it'll appear in your Library in a few minutes.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.warn("Higgsfield video enqueue failed, falling back to Varg/script.");
    }

    // --- Fallback engine: Varg Gateway video generation ---
    const vargKey = await getUserVargKey(userId);
    if (vargKey) {
      console.log("Attempting Varg video generation for user:", userId);
      const videoPrompt = [
        sanitizedPrompt,
        companyDetails?.company_name ? `Brand: ${String(companyDetails.company_name).slice(0, 200)}` : "",
        companyDetails?.target_audience ? `Audience: ${String(companyDetails.target_audience).slice(0, 500)}` : "",
        "Create a polished social video with clear motion, premium composition, and platform-native pacing.",
      ].filter(Boolean).join("\n\n");

      const vargResult = await generateVargVideo({
        prompt: videoPrompt,
        apiKey: vargKey,
        model: Deno.env.get("VARG_VIDEO_MODEL") || VARG_DEFAULT_MODEL,
        duration: Number(duration || Deno.env.get("VARG_VIDEO_DURATION") || 5),
        aspectRatio: String(aspectRatio || Deno.env.get("VARG_VIDEO_ASPECT_RATIO") || "9:16"),
      });

      if (vargResult?.url) {
        console.log("Varg video generation successful for user:", userId, "job:", vargResult.jobId);
        // Save the finished video to the user's library so it's kept in their account.
        let creativeId: string | null = null;
        try {
          const { data: saved } = await supabase.from("creatives").insert({
            user_id: userId,
            content_type: "video",
            visual_url: vargResult.url,
            caption: sanitizedPrompt.slice(0, 500),
            saved: true, // keep the finished video in the user's Library
            generation_metadata: { provider: "varg", job_id: vargResult.jobId, media_type: vargResult.mediaType, prompt: sanitizedPrompt.slice(0, 500) },
          }).select("id").single();
          creativeId = saved?.id ?? null;
        } catch (e) {
          console.warn("Could not save video to library:", e);
        }
        return new Response(JSON.stringify({
          content: vargResult.url,
          url: vargResult.url,
          videoUrl: vargResult.url,
          type: "video_url",
          provider: "varg",
          jobId: vargResult.jobId,
          mediaType: vargResult.mediaType,
          creativeId,
          saved: !!creativeId,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("Varg API key not configured. Falling back to legacy video/script path.");
    }

    // --- Legacy fallback: xAI video generation ---
    if (XAI_API_KEY) {
      console.log("Attempting xAI video generation for user:", userId);

      let videoPrompt = sanitizedPrompt;
      if (companyDetails?.company_name) {
        videoPrompt = `${sanitizedPrompt}. Brand: ${String(companyDetails.company_name).slice(0, 200)}`;
      }

      const videoUrl = await generateXAIVideo(videoPrompt, XAI_API_KEY);
      if (videoUrl) {
        console.log("xAI video generation successful for user:", userId);
        return new Response(JSON.stringify({ content: videoUrl, type: "video_url" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.warn("xAI video generation did not produce a result, falling back to script");
    }

    // --- Fallback: generate a video script via text AI ---
    let enrichedPrompt = sanitizedPrompt;
    let systemPrompt = "You are a professional video script writer. Create detailed video scripts with scene descriptions, camera angles, narration, visual elements, music suggestions, and timing.";

    if (companyDetails?.company_name) {
      const name = String(companyDetails.company_name).slice(0, 200);
      systemPrompt = `You are a professional video script writer for ${name}. Create detailed scripts aligned with the brand identity.`;
      if (!sanitizedPrompt.toLowerCase().includes(name.toLowerCase())) {
        enrichedPrompt += `\n\nBrand: ${name}`;
      }
    }
    enrichedPrompt += "\n\nProvide a detailed video script with scene numbers, timestamps, camera angles, narration, and music.";

    console.log("Generating video script (fallback) for user:", userId, "model:", selectedModel);
    const response = await callScriptAI(enrichedPrompt, systemPrompt, selectedModel, OPENAI_API_KEY);

    if (!response.ok) {
      const errorText = await response.text();
      const msg = getProviderErrorMessage(errorText);
      console.error("AI API error:", response.status, msg || errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to continue." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: msg || "Failed to generate video. Please try again." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const videoScript = extractAssistantText(data);

    if (!videoScript) {
      return new Response(JSON.stringify({ error: "No content generated. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Video script generation successful for user:", userId);
    return new Response(JSON.stringify({ content: videoScript, type: "script" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-video:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
