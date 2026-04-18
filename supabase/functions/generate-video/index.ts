import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const DEFAULT_MODEL = "google/gemini-2.5-pro";
const OPENAI_FALLBACK_MODEL = "gpt-4o-mini";

const DIRECT_OPENAI_MODELS = new Set(["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]);

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
  lovableKey: string, openaiKey: string | null,
) {
  const normalizedModel = normalizeModel(model);

  if (isDirectOpenAIModel(normalizedModel) && openaiKey) {
    let m = getOpenAIModelName(normalizedModel);
    let response = await callOpenAI(prompt, systemPrompt, m, openaiKey);
    if (!response.ok && [400, 404].includes(response.status) && m !== OPENAI_FALLBACK_MODEL) {
      m = OPENAI_FALLBACK_MODEL;
      response = await callOpenAI(prompt, systemPrompt, m, openaiKey);
    }
    return response;
  }

  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: normalizedModel || DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });
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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const XAI_API_KEY = Deno.env.get("XAI_API_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
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
    const { prompt, companyDetails, preferredModel } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: "A valid prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitizedPrompt = prompt.trim().slice(0, 5000);
    const selectedModel = normalizeModel(preferredModel);

    // --- Try xAI video generation first (actual video file) ---
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
    const response = await callScriptAI(enrichedPrompt, systemPrompt, selectedModel, LOVABLE_API_KEY, OPENAI_API_KEY || null);

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
