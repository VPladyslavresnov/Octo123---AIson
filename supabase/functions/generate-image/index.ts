import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const DEFAULT_MODEL = "openai/gpt-5";
const DEFAULT_GATEWAY_IMAGE_MODEL = "google/gemini-2.5-flash-image";

const DIRECT_OPENAI_MODELS = new Set(["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "dall-e-3"]);

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

function getProviderErrorMessage(errorText: string): string | null {
  try {
    const parsed = JSON.parse(errorText);
    if (parsed?.error?.message && typeof parsed.error.message === "string") {
      return parsed.error.message;
    }
  } catch {
    // ignore JSON parse failures
  }
  return null;
}

async function callOpenAIImage(prompt: string, openaiKey: string) {
  return await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    }),
  });
}

async function callGeminiImage(prompt: string, geminiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${geminiKey}`;
  return await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });
}

async function callXAIImage(prompt: string, xaiKey: string) {
  return await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${xaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-imagine-image-pro",
      prompt,
      n: 1,
      response_format: "url",
    }),
  });
}

async function callGatewayImage(prompt: string, model: string, lovableKey: string) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
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

    const { prompt, companyDetails, preferredModel, systemPrompt, brandProfile } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: "A valid prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitizedPrompt = prompt.trim().slice(0, 2000);

    // For image generation, keep the prompt concise. Image models work best with
    // short, descriptive prompts rather than long rule-based instructions.
    // Extract only key visual cues from systemPrompt and brandProfile.
    let enrichedPrompt = "";

    // Add concise brand context (not the full system prompt - image models can't follow long rules)
    if (brandProfile?.brand_name) {
      enrichedPrompt += `For ${String(brandProfile.brand_name).slice(0, 100)} brand. `;
    } else if (companyDetails?.company_name) {
      enrichedPrompt += `For ${String(companyDetails.company_name).slice(0, 100)}. `;
    }
    if (brandProfile?.visual_style) {
      enrichedPrompt += `Style: ${String(brandProfile.visual_style).slice(0, 200)}. `;
    }
    if (brandProfile?.tone_of_voice) {
      enrichedPrompt += `Tone: ${String(brandProfile.tone_of_voice).slice(0, 100)}. `;
    }
    // Inject brand colours into image prompt
    const brandColors = [
      ...(brandProfile?.primary_colors || []),
      ...(brandProfile?.secondary_colors || []),
    ].filter(Boolean).slice(0, 3);
    if (brandColors.length) {
      enrichedPrompt += `Use these brand colours prominently: ${brandColors.join(', ')}. `;
    } else if (companyDetails?.brand_colors && Array.isArray(companyDetails.brand_colors)) {
      const fallbackColors = companyDetails.brand_colors.filter(Boolean).slice(0, 3);
      if (fallbackColors.length) {
        enrichedPrompt += `Use these brand colours prominently: ${fallbackColors.join(', ')}. `;
      }
    }
    if (companyDetails?.target_audience) {
      enrichedPrompt += `Audience: ${String(companyDetails.target_audience).slice(0, 200)}. `;
    }

    enrichedPrompt += sanitizedPrompt;

    // Keep total prompt under 1500 chars for image models
    enrichedPrompt = enrichedPrompt.slice(0, 1500);

    const selectedModel = normalizeModel(preferredModel);
    console.log("Generating image for user:", userId, "model:", selectedModel);

    if (isDirectOpenAIModel(selectedModel) && !OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenAI is not configured on this backend yet." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isDirectOpenAIModel(selectedModel) && OPENAI_API_KEY) {
      const dalleResponse = await callOpenAIImage(enrichedPrompt, OPENAI_API_KEY);

      if (dalleResponse.ok) {
        const dalleData = await dalleResponse.json();
        const imageUrl = dalleData?.data?.[0]?.url;

        if (imageUrl) {
          console.log("OpenAI image generation successful for user:", userId);
          return new Response(JSON.stringify({ url: imageUrl, imageUrl }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const openAIErrorText = await dalleResponse.text();
        const providerMessage = getProviderErrorMessage(openAIErrorText);
        console.error("OpenAI image generation error:", dalleResponse.status, providerMessage || openAIErrorText);

        if (![400, 404].includes(dalleResponse.status)) {
          if (dalleResponse.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(
            JSON.stringify({ error: providerMessage || "Failed to generate image with OpenAI. Please try again." }),
            {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        console.warn("OpenAI image model unavailable; falling back to gateway image model");
      }
    }

    // Try xAI (Grok) image generation first if key is available
    const XAI_API_KEY = Deno.env.get("XAI_API_KEY");
    if (XAI_API_KEY) {
      console.log("Using xAI Grok API for image generation, user:", userId);
      const xaiResponse = await callXAIImage(enrichedPrompt, XAI_API_KEY);
      if (xaiResponse.ok) {
        const xaiData = await xaiResponse.json();
        const xaiUrl = xaiData?.data?.[0]?.url;
        if (xaiUrl) {
          console.log("xAI image generation successful for user:", userId);
          return new Response(JSON.stringify({ url: xaiUrl, imageUrl: xaiUrl }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const errText = await xaiResponse.text();
        console.warn("xAI image generation failed, falling back:", xaiResponse.status, errText);
      }
    }

    // Try Gemini API if key is available
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (GEMINI_API_KEY) {
      console.log("Using Google Gemini API for image generation, user:", userId);
      const geminiResponse = await callGeminiImage(enrichedPrompt, GEMINI_API_KEY);

      if (geminiResponse.ok) {
        const geminiData = await geminiResponse.json();
        const parts = geminiData?.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));

        if (imagePart?.inlineData?.data) {
          const dataUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
          console.log("Gemini image generation successful for user:", userId);
          return new Response(JSON.stringify({ url: dataUrl, imageUrl: dataUrl }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const errText = await geminiResponse.text();
        console.warn("Gemini image generation failed, falling back:", geminiResponse.status, errText);
      }
    }

    // Fallback to gateway
    const gatewayModel = DEFAULT_GATEWAY_IMAGE_MODEL;
    const response = await callGatewayImage(enrichedPrompt, gatewayModel, LOVABLE_API_KEY);

    if (!response.ok) {
      const gatewayErrorText = await response.text();
      const providerMessage = getProviderErrorMessage(gatewayErrorText);
      console.error("AI gateway error:", response.status, providerMessage || gatewayErrorText);

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
      return new Response(
        JSON.stringify({ error: providerMessage || "Failed to generate image. Please try again." }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "No image generated. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Gateway image generation successful for user:", userId);

    return new Response(JSON.stringify({ url: imageUrl, imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-image:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
