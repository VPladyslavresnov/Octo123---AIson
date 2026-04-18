import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const DEFAULT_MODEL = "openai/gpt-5";
const OPENAI_FALLBACK_MODEL = "gpt-4o-mini";
const DEFAULT_GATEWAY_IMAGE_MODEL = "google/gemini-2.5-flash-image";

const DIRECT_OPENAI_MODELS = new Set(["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "dall-e-3"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ImageResponseSource = "openai" | "gateway";

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

async function callOpenAIChat(prompt: string, modelName: string, openaiKey: string) {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
    }),
  });
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

async function callTextAI(prompt: string, model: string, lovableKey: string, openaiKey: string | null) {
  const normalizedModel = normalizeModel(model);

  if (isDirectOpenAIModel(normalizedModel) && openaiKey) {
    let openaiModel = getOpenAIModelName(normalizedModel);
    let response = await callOpenAIChat(prompt, openaiModel, openaiKey);

    if (!response.ok && [400, 404].includes(response.status) && openaiModel !== OPENAI_FALLBACK_MODEL) {
      console.warn(`Model ${openaiModel} unavailable, retrying with ${OPENAI_FALLBACK_MODEL}`);
      openaiModel = OPENAI_FALLBACK_MODEL;
      response = await callOpenAIChat(prompt, openaiModel, openaiKey);
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
      messages: [{ role: "user", content: prompt }],
    }),
  });
}

async function callImageAI(
  prompt: string,
  model: string,
  lovableKey: string,
  openaiKey: string | null,
): Promise<{ response: Response; source: ImageResponseSource }> {
  const normalizedModel = normalizeModel(model);

  if (isDirectOpenAIModel(normalizedModel) && openaiKey) {
    const openAIResponse = await callOpenAIImage(prompt, openaiKey);

    if (openAIResponse.ok) {
      return { response: openAIResponse, source: "openai" };
    }

    if (![400, 404].includes(openAIResponse.status)) {
      return { response: openAIResponse, source: "openai" };
    }

    console.warn("OpenAI image model unavailable; falling back to gateway image model.");
  }

  // Always use an image-capable model for image generation
  const gatewayResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_GATEWAY_IMAGE_MODEL,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });

  return { response: gatewayResponse, source: "gateway" };
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

    const { campaignId, presetPrompt, imagePresetPrompt, preferredModel, batchSize, batchIndex } = await req.json();

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

    const selectedModel = normalizeModel(preferredModel);
    if (isDirectOpenAIModel(selectedModel) && !OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenAI is not configured on this backend yet." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brandStyle =
      (campaign.brand_style as { colors?: { primary?: string; secondary?: string; accent?: string } }) || {};
    const brandColors = brandStyle.colors || {};
    const colorInstruction = brandColors.primary
      ? `\n\nBRAND COLORS (IMPORTANT - use these colors prominently in the design):\n- Primary color: ${brandColors.primary}\n- Secondary color: ${brandColors.secondary || brandColors.primary}\n- Accent color: ${brandColors.accent || brandColors.primary}`
      : "";

    const companyBrandColors = (companyDetails?.brand_colors as string[]) || [];
    const fallbackColorInstruction =
      !brandColors.primary && companyBrandColors.length > 0
        ? `\n\nBRAND COLORS (use these colors prominently):\n- Primary: ${companyBrandColors[0]}\n- Secondary: ${companyBrandColors[1] || companyBrandColors[0]}\n- Accent: ${companyBrandColors[2] || companyBrandColors[0]}`
        : "";

    const brandColorContext = colorInstruction || fallbackColorInstruction;

    // Channel-specific style guides for native adaptation
    const channelStyles: Record<string, { caption: string; visual: string; aspect: string }> = {
      instagram: {
        caption: "Visual-first, 1-2 sentence hook, 5-10 hashtags, emoji-friendly, 125 chars max for the hook.",
        visual: "Square 1:1 lifestyle aesthetic, vibrant, photogenic, Instagram-native composition.",
        aspect: "1:1 square",
      },
      linkedin: {
        caption: "Professional thought-leadership tone, 3-5 sentences, insight-driven, no excessive emoji, end with a question or CTA.",
        visual: "Clean professional graphic, business-appropriate, infographic or polished product shot, 1.91:1 landscape feel.",
        aspect: "1.91:1 landscape",
      },
      twitter: {
        caption: "Punchy, 240 chars max, witty or contrarian hook, max 2 hashtags, no fluff.",
        visual: "Bold simple graphic with large readable text overlay, 16:9 friendly.",
        aspect: "16:9",
      },
      x: {
        caption: "Punchy, 240 chars max, witty or contrarian hook, max 2 hashtags, no fluff.",
        visual: "Bold simple graphic with large readable text overlay, 16:9 friendly.",
        aspect: "16:9",
      },
      tiktok: {
        caption: "Hook-driven, casual, trend-aware, 1-2 sentences, 3-5 trending hashtags, vertical-first thinking.",
        visual: "Vertical 9:16 dynamic scene, bold motion-friendly composition, eye-catching first frame.",
        aspect: "9:16 vertical",
      },
      facebook: {
        caption: "Conversational, 2-4 sentences, story-driven, encourages comments, light emoji.",
        visual: "Warm relatable scene, lifestyle or community-focused, 1.91:1 landscape.",
        aspect: "1.91:1 landscape",
      },
    };

    const selectedChannels: string[] = (campaign.channels && campaign.channels.length > 0)
      ? campaign.channels
      : ["instagram"];

    // Compute target post count: cadence/week × duration_weeks
    const cadencePerWeek = Number(campaign.posting_cadence_per_week) || 5;
    const durationDays = Number(campaign.duration_days) || 7;
    const totalPlannedPosts = Math.max(1, Math.min(50, Math.round(cadencePerWeek * (durationDays / 7))));

    const effectiveBatchSize = Math.max(1, Math.min(10, Number(batchSize) || 5));
    const currentBatchIndex = Math.max(0, Number(batchIndex) || 0);

    // How many already exist for this campaign?
    const { count: existingCount } = await supabase
      .from("creatives")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);

    const alreadyGenerated = existingCount || 0;
    const remaining = Math.max(0, totalPlannedPosts - alreadyGenerated);
    const thisBatchCount = Math.min(effectiveBatchSize, remaining || effectiveBatchSize);

    const createdCreatives = [];
    console.log(`Campaign ${campaignId}: planned=${totalPlannedPosts}, existing=${alreadyGenerated}, batchSize=${effectiveBatchSize}, generating=${thisBatchCount}`);

    for (let i = 0; i < thisBatchCount; i++) {
      const postIndex = alreadyGenerated + i;
      const channel = selectedChannels[postIndex % selectedChannels.length].toLowerCase();
      const style = channelStyles[channel] || channelStyles.instagram;

      // Alternate image/text but lean toward image (every 3rd is text-only)
      const contentType = (postIndex % 3 === 2) ? "text" : "image";

      const creative: {
        user_id: string;
        campaign_id: string;
        content_type: string;
        hashtags: string[];
        visual_url?: string;
        alt_text?: string;
        caption?: string;
        generation_metadata?: Record<string, unknown>;
      } = {
        user_id: userId,
        campaign_id: campaignId,
        content_type: contentType,
        hashtags: campaign.key_offers_or_topics || [],
        generation_metadata: { channel, post_index: postIndex, batch_index: currentBatchIndex },
      };

      const channelDirective = `\n\nTARGET CHANNEL: ${channel.toUpperCase()}\nNative style for this channel:\n- Caption: ${style.caption}\n- Visual: ${style.visual}`;

      if (contentType === "image") {
        const imageStylePrompt = imagePresetPrompt || presetPrompt;
        const presetContext = imageStylePrompt ? `\n\nImage style and brand direction:\n${String(imageStylePrompt).slice(0, 4000)}` : "";

        const imagePrompt = `Create a ${style.aspect} ${channel} social media image for ${String(companyDetails?.company_name || "a business").slice(0, 200)}.\nCampaign objective: ${String(campaign.objective || "").slice(0, 500)}.\nTone: ${String(campaign.tone || "professional").slice(0, 100)}.\n${style.visual}${brandColorContext}${presetContext}\n\nIMPORTANT: Visual must use brand colors and feel native to ${channel}.`;

        const { response: imageResponse, source } = await callImageAI(
          imagePrompt,
          selectedModel,
          LOVABLE_API_KEY,
          OPENAI_API_KEY || null,
        );

        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          console.error("Image generation failed:", imageResponse.status, getProviderErrorMessage(errorText) || errorText);
          continue;
        }

        const imageData = await imageResponse.json();
        const imageUrl =
          source === "openai"
            ? imageData?.data?.[0]?.url
            : imageData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (!imageUrl || typeof imageUrl !== "string") continue;

        creative.visual_url = imageUrl;
        creative.alt_text = `${channel} visual: ${String(campaign.objective || "").slice(0, 100)}`;

        const captionPresetContext = presetPrompt ? `\n\nFollow these style guidelines:\n${String(presetPrompt).slice(0, 2000)}` : "";
        const captionPrompt = `Write a ${channel}-native caption for ${String(companyDetails?.company_name || "a business").slice(0, 200)}.\nCampaign objective: ${String(campaign.objective || "").slice(0, 500)}\nTone: ${String(campaign.tone || "professional").slice(0, 100)}\n${channelDirective}${captionPresetContext}`;

        const captionResponse = await callTextAI(captionPrompt, selectedModel, LOVABLE_API_KEY, OPENAI_API_KEY || null);
        if (captionResponse.ok) {
          const captionData = await captionResponse.json();
          creative.caption = extractAssistantText(captionData);
        }

        if (!creative.caption) {
          creative.caption = `[${channel}] ${String(campaign.objective || "Discover our latest").slice(0, 140)}`;
        }
      } else {
        const textPresetContext = presetPrompt ? `\n\nFollow these style guidelines:\n${String(presetPrompt).slice(0, 2000)}` : "";

        const textPrompt = `Create a ${channel}-native social post for ${String(companyDetails?.company_name || "a business").slice(0, 200)}.\nCampaign objective: ${String(campaign.objective || "").slice(0, 500)}\nTone: ${String(campaign.tone || "professional").slice(0, 100)}\nTarget audience: ${String(companyDetails?.target_audience || "general audience").slice(0, 500)}\nBusiness type: ${String(companyDetails?.business_type || "").slice(0, 100)}\n${channelDirective}${textPresetContext}`;

        const textResponse = await callTextAI(textPrompt, selectedModel, LOVABLE_API_KEY, OPENAI_API_KEY || null);
        if (!textResponse.ok) {
          const errorText = await textResponse.text();
          console.error("Text generation failed:", textResponse.status, getProviderErrorMessage(errorText) || errorText);
          continue;
        }

        const textData = await textResponse.json();
        creative.caption = extractAssistantText(textData);
        if (!creative.caption) continue;
      }

      const { data: insertedCreative, error: insertError } = await supabase
        .from("creatives")
        .insert(creative)
        .select()
        .single();

      if (!insertError && insertedCreative) {
        createdCreatives.push(insertedCreative);
      }
    }

    const newTotal = alreadyGenerated + createdCreatives.length;
    const hasMore = newTotal < totalPlannedPosts;

    return new Response(
      JSON.stringify({
        success: true,
        count: createdCreatives.length,
        message: `Generated batch ${currentBatchIndex + 1} (${createdCreatives.length} posts). ${newTotal}/${totalPlannedPosts} total.`,
        creatives: createdCreatives,
        batchInfo: {
          totalPlanned: totalPlannedPosts,
          totalGenerated: newTotal,
          hasMore,
          nextBatchIndex: hasMore ? currentBatchIndex + 1 : null,
          channels: selectedChannels,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in generate-campaign-content:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
