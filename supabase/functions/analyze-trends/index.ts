import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { claudeChatCompletion, hasClaude } from "../_shared/claude.ts";
import { noProviderResponse, openaiChatCompletion, resolveOpenAIKey } from "../_shared/openai.ts";

const DEFAULT_MODEL = "openai/gpt-5";
const OPENAI_FALLBACK_MODEL = "gpt-4o-mini";

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
  } catch {
    // ignore parse failures
  }
  return null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();

  if (!trimmed) return null;

  try {
    const direct = JSON.parse(trimmed);
    if (direct && typeof direct === "object" && !Array.isArray(direct)) {
      return direct as Record<string, unknown>;
    }
  } catch {
    // continue with extraction strategy
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const extracted = JSON.parse(jsonMatch[0]);
    if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
      return extracted as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function extractAssistantText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") return content.trim();

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

async function callOpenAI(prompt: string, modelName: string, openaiKey: string) {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
}

async function callAI(prompt: string, model: string, openaiKey: string | null) {
  const normalizedModel = normalizeModel(model);

  // All AI chat/text goes through Claude when configured
  if (hasClaude()) {
    const response = await claudeChatCompletion({
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    if (response.ok) return response;
    console.warn("Claude failed, falling back:", response.status);
  }

  if (isDirectOpenAIModel(normalizedModel) && openaiKey) {
    let openaiModel = getOpenAIModelName(normalizedModel);
    let response = await callOpenAI(prompt, openaiModel, openaiKey);

    if (!response.ok && [400, 404].includes(response.status) && openaiModel !== OPENAI_FALLBACK_MODEL) {
      console.warn(`Model ${openaiModel} unavailable, retrying with ${OPENAI_FALLBACK_MODEL}`);
      openaiModel = OPENAI_FALLBACK_MODEL;
      response = await callOpenAI(prompt, openaiModel, openaiKey);
    }

    return response;
  }

  if (openaiKey) {
    return await openaiChatCompletion(openaiKey, {
      model: normalizedModel,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
  }

  return noProviderResponse();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 20);
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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
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
    const OPENAI_API_KEY = await resolveOpenAIKey(userId);

    const { campaignId } = await req.json();

    if (!campaignId || typeof campaignId !== "string") {
      return new Response(JSON.stringify({ error: "A valid campaign ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: companyDetails } = await supabase
      .from("company_details")
      .select("*")
      .eq("user_id", userId)
      .single();

    const selectedModel = normalizeModel(companyDetails?.preferred_model);

    if (isDirectOpenAIModel(selectedModel) && !OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenAI is not configured on this backend yet." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trendPrompt = `Analyze current social media and marketing trends for:\nBusiness: ${String(companyDetails?.company_name || "a business").slice(0, 200)}\nIndustry: ${String(companyDetails?.business_type || "general").slice(0, 100)}\nLocation: ${String(companyDetails?.location || "global").slice(0, 100)}\nTarget Audience: ${String(companyDetails?.target_audience || "general audience").slice(0, 500)}\nCampaign Objective: ${String(campaign.objective || "").slice(0, 500)}\nCampaign Tone: ${String(campaign.tone || "").slice(0, 100)}\n\nProvide detailed insights including:\n1. Five trending themes relevant to this industry\n2. Five popular visual styles\n3. Five effective hooks and calls-to-action\n4. Eight to ten relevant hashtags\n5. Best posting times for different platforms\n6. A 2-3 sentence evidence summary explaining why these trends work\n\nReturn ONLY a valid JSON object with these keys: topThemes, topVisualStyles, topHooksCTAs, hashtagSuggestions, postingWindows, evidence`;

    console.log("Analyzing trends for user:", userId, "model:", selectedModel);

    const aiResponse = await callAI(trendPrompt, selectedModel, OPENAI_API_KEY);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      const providerMessage = getProviderErrorMessage(errorText);
      console.error("AI API error status:", aiResponse.status, providerMessage || errorText);
      return new Response(
        JSON.stringify({ error: providerMessage || "Failed to generate trend analysis. Please try another model." }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const aiData = await aiResponse.json();
    const trendDataText = extractAssistantText(aiData);
    const trendData = parseJsonObject(trendDataText);

    if (!trendData) {
      return new Response(
        JSON.stringify({ error: "The AI response for trend analysis was not valid JSON. Please try again." }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error: insertError } = await supabaseAdmin.from("trend_profiles").insert({
      campaign_id: campaignId,
      business_type: companyDetails?.business_type,
      location: companyDetails?.location,
      target_audience: companyDetails?.target_audience,
      top_themes: toStringArray(trendData.topThemes),
      top_visual_styles: toStringArray(trendData.topVisualStyles),
      top_hooks_ctas: toStringArray(trendData.topHooksCTAs),
      hashtag_suggestions: toStringArray(trendData.hashtagSuggestions),
      recommended_posting_windows:
        trendData.postingWindows && typeof trendData.postingWindows === "object" ? trendData.postingWindows : {},
      evidence:
        typeof trendData.evidence === "string"
          ? trendData.evidence
          : "Analysis based on current market trends and campaign objectives",
    });

    if (insertError) {
      console.error("Error storing trend profile:", insertError.message);
    }

    console.log("Generated trend analysis for user:", userId);

    return new Response(
      JSON.stringify({
        success: true,
        trends: trendData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in analyze-trends:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
