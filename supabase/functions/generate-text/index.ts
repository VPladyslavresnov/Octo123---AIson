import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const DEFAULT_MODEL = "openai/gpt-5";
const OPENAI_FALLBACK_MODEL = "gpt-4o-mini";

// Models that exist on api.openai.com and can be called directly
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

// Only returns true for models available on api.openai.com directly
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
  } catch {
    // ignore JSON parse errors
  }
  return null;
}

function extractAssistantText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const merged = content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join("")
      .trim();

    if (merged) return merged;
  }

  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  if (typeof payload?.choices?.[0]?.text === "string") return payload.choices[0].text.trim();

  return "";
}

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

async function callGemini(prompt: string, systemPrompt: string, geminiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
  return await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    }),
  });
}

function extractGeminiText(data: any): string {
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" ? text.trim() : "";
}

async function callXAI(prompt: string, systemPrompt: string, xaiKey: string) {
  return await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${xaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-3-mini-fast",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });
}

async function callAI(
  prompt: string,
  systemPrompt: string,
  model: string,
  lovableKey: string,
  openaiKey: string | null,
) {
  const normalizedModel = normalizeModel(model);

  // Try xAI (Grok) first if key is available
  const xaiKey = Deno.env.get("XAI_API_KEY");
  if (xaiKey) {
    console.log("Using xAI Grok API directly");
    const xaiResponse = await callXAI(prompt, systemPrompt, xaiKey);
    if (xaiResponse.ok) {
      return { source: "xai" as const, response: xaiResponse };
    }
    const errText = await xaiResponse.text();
    console.warn("xAI API failed, falling back:", xaiResponse.status, errText);
  }

  // Try Gemini API if key is available
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (geminiKey) {
    console.log("Using Google Gemini API directly");
    const geminiResponse = await callGemini(prompt, systemPrompt, geminiKey);
    if (geminiResponse.ok) {
      return { source: "gemini" as const, response: geminiResponse };
    }
    const errText = await geminiResponse.text();
    console.warn("Gemini API failed, falling back:", geminiResponse.status, errText);
  }

  if (isDirectOpenAIModel(normalizedModel) && openaiKey) {
    let openaiModel = getOpenAIModelName(normalizedModel);
    console.log("Using OpenAI API directly with model:", openaiModel);

    let response = await callOpenAI(prompt, systemPrompt, openaiModel, openaiKey);

    if (!response.ok && [400, 404].includes(response.status) && openaiModel !== OPENAI_FALLBACK_MODEL) {
      console.warn(`Model ${openaiModel} unavailable, retrying with ${OPENAI_FALLBACK_MODEL}`);
      openaiModel = OPENAI_FALLBACK_MODEL;
      response = await callOpenAI(prompt, systemPrompt, openaiModel, openaiKey);
    }

    return { source: "openai" as const, response };
  }

  console.log("Using Lovable AI Gateway with model:", normalizedModel);
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
  return { source: "gateway" as const, response };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("Missing required environment variables");
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    const { prompt, companyDetails, systemPrompt: clientSystemPrompt, preferredModel, brandProfile } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: "A valid prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitizedPrompt = prompt.trim().slice(0, 5000);
    const selectedModel = normalizeModel(preferredModel);

    if (isDirectOpenAIModel(selectedModel) && !OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenAI is not configured on this backend yet." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt = clientSystemPrompt || "";

    if (!systemPrompt) {
      systemPrompt = "You are a marketing content expert. Generate engaging social media content. Always return: a post caption, 3-5 relevant hashtags, and a suggested posting time.";

      if (companyDetails?.company_name) {
        const companyName = String(companyDetails.company_name).slice(0, 200);
        const industry = String(companyDetails.business_type || "general").slice(0, 100);
        const audience = String(companyDetails.target_audience || "general audience").slice(0, 500);
        const tone = String(companyDetails.tone || "professional yet approachable").slice(0, 100);
        const brandColors = companyDetails.brand_colors ? JSON.stringify(companyDetails.brand_colors) : null;

        systemPrompt = `You are a marketing content expert. Generate on-brand social media content for ${companyName}, a ${industry} business targeting ${audience}. Tone: ${tone}.${brandColors ? ` Brand colors: ${brandColors}.` : ""} Always return: a post caption, 3-5 relevant hashtags, and a suggested posting time.`;
      }
    }

    // Enrich with brand profile colours if available
    if (brandProfile) {
      const bpColors = [
        ...(brandProfile.primary_colors || []),
        ...(brandProfile.secondary_colors || []),
      ].filter(Boolean).slice(0, 3);
      if (bpColors.length) {
        systemPrompt += `\n\nIMPORTANT: When suggesting visual direction or image descriptions, always reference these brand colours: ${bpColors.join(', ')}.`;
      }
    }

    let enrichedPrompt = sanitizedPrompt;
    if (companyDetails?.company_name && !sanitizedPrompt.toLowerCase().includes(String(companyDetails.company_name).toLowerCase())) {
      enrichedPrompt = `${sanitizedPrompt}\n\nBrand Context: ${String(companyDetails.company_name).slice(0, 200)} | Industry: ${String(companyDetails.business_type || "general").slice(0, 100)} | Target Audience: ${String(companyDetails.target_audience || "general audience").slice(0, 500)}`;
    }

    console.log("Generating text for user:", userId, "model:", selectedModel);

    const result = await callAI(enrichedPrompt, systemPrompt, selectedModel, LOVABLE_API_KEY, OPENAI_API_KEY || null);
    const response = result.response;

    if (!response.ok) {
      const errorText = await response.text();
      const providerMessage = getProviderErrorMessage(errorText);
      console.error("AI API error:", response.status, providerMessage || errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 401) {
        return new Response(JSON.stringify({ error: "Authentication failed. Please verify your API key." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ error: providerMessage || "Failed to generate text. Please try another model." }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    const generatedText = result.source === "gemini" ? extractGeminiText(data) : extractAssistantText(data);

    if (!generatedText) {
      return new Response(JSON.stringify({ error: "No content generated. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Text generation successful for user:", userId);

    return new Response(JSON.stringify({ content: generatedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-text:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
