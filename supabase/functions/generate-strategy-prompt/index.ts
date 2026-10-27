import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { claudeChatCompletion, hasClaude } from "../_shared/claude.ts";
import { noProviderResponse, openaiChatCompletion, resolveOpenAIKey } from "../_shared/openai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_MODEL = "openai/gpt-5";
const OPENAI_FALLBACK_MODEL = "gpt-4o-mini";
const DIRECT_OPENAI_MODELS = new Set<string>(); // routed through shared provider (Groq/Llama)

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

function extractAssistantText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join("")
      .trim();
  }
  const text = payload?.output_text || payload?.choices?.[0]?.text;
  return typeof text === "string" ? text.trim() : "";
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

async function callAI(prompt: string, systemPrompt: string, model: string, openaiKey: string | null) {
  const normalizedModel = normalizeModel(model);

  // All AI chat/text goes through Claude when configured
  if (hasClaude()) {
    const response = await claudeChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });
    if (response.ok) return { source: "claude" as const, response };
    console.warn("Claude failed, falling back:", response.status);
  }

  const xaiKey = Deno.env.get("XAI_API_KEY");
  if (xaiKey) {
    const response = await callXAI(prompt, systemPrompt, xaiKey);
    if (response.ok) return { source: "xai" as const, response };
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (geminiKey) {
    const response = await callGemini(prompt, systemPrompt, geminiKey);
    if (response.ok) return { source: "gemini" as const, response };
  }

  if (isDirectOpenAIModel(normalizedModel) && openaiKey) {
    let openaiModel = getOpenAIModelName(normalizedModel);
    let response = await callOpenAI(prompt, systemPrompt, openaiModel, openaiKey);
    if (!response.ok && [400, 404].includes(response.status) && openaiModel !== OPENAI_FALLBACK_MODEL) {
      openaiModel = OPENAI_FALLBACK_MODEL;
      response = await callOpenAI(prompt, systemPrompt, openaiModel, openaiKey);
    }
    return { source: "openai" as const, response };
  }

  if (openaiKey) {
    const response = await openaiChatCompletion(openaiKey, {
      model: normalizedModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });
    return { source: "openai" as const, response };
  }

  return { source: "none" as const, response: noProviderResponse() };
}

function parseAIText(result: { source: string; response: Response }, payload: any) {
  return result.source === "gemini" ? extractGeminiText(payload) : extractAssistantText(payload);
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const masterKeyB64 = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterKeyB64) throw new Error("Encryption key not configured");
  const rawKey = Uint8Array.from(atob(masterKeyB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
}

async function decrypt(encryptedB64: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

function normalizeUrl(url: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
}

function getPlatformFromUrl(url: string): "instagram" | "facebook" | "linkedin" | "unknown" {
  try {
    const host = new URL(normalizeUrl(url)).hostname.replace("www.", "");
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("facebook.com")) return "facebook";
    if (host.includes("linkedin.com")) return "linkedin";
  } catch {
    // ignore
  }
  return "unknown";
}

async function resolveApifyToken(supabaseAdmin: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const envToken = Deno.env.get("APIFY_API_TOKEN");
  if (envToken) return envToken;

  const { data: row } = await supabaseAdmin
    .from("api_keys")
    .select("api_key")
    .eq("user_id", userId)
    .eq("service_name", "apify")
    .maybeSingle();

  if (!row?.api_key) return null;
  try {
    return await decrypt(row.api_key);
  } catch {
    return row.api_key;
  }
}

async function runApifyTask(token: string, taskId: string, input: Record<string, unknown>) {
  const response = await fetch(`https://api.apify.com/v2/actor-tasks/${taskId}/run-sync-get-dataset-items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Apify task failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function summarizeAccountItem(item: Record<string, unknown>) {
  const fields = [
    item.fullName,
    item.username,
    item.title,
    item.headline,
    item.bio,
    item.description,
    item.about,
    item.category,
    item.industry,
    item.website,
    item.externalUrl,
    item.followersCount,
    item.postsCount,
    item.latestPosts,
    item.latestPostCaptions,
  ]
    .flat()
    .filter((value) => value != null)
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value)));

  return fields.join(" | ").slice(0, 3500);
}

async function parseAccountViaApify(
  apifyToken: string | null,
  url: string,
): Promise<{ url: string; platform: string; summary: string; raw: Record<string, unknown> | null }> {
  const normalizedUrl = normalizeUrl(url);
  const platform = getPlatformFromUrl(normalizedUrl);

  if (!apifyToken) {
    return {
      url: normalizedUrl,
      platform,
      summary: "Apify token not configured, so account parsing was skipped.",
      raw: null,
    };
  }

  const taskEnvMap: Record<string, string | undefined> = {
    instagram: Deno.env.get("APIFY_INSTAGRAM_TASK_ID"),
    facebook: Deno.env.get("APIFY_FACEBOOK_TASK_ID"),
    linkedin: Deno.env.get("APIFY_LINKEDIN_TASK_ID"),
  };

  const taskId = taskEnvMap[platform];
  if (!taskId) {
    return {
      url: normalizedUrl,
      platform,
      summary: `No Apify task configured for ${platform}.`,
      raw: null,
    };
  }

  try {
    const results = await runApifyTask(apifyToken, taskId, {
      startUrls: [{ url: normalizedUrl }],
      urls: [normalizedUrl],
      maxItems: 1,
    });
    const item = (results[0] || null) as Record<string, unknown> | null;
    return {
      url: normalizedUrl,
      platform,
      summary: item ? summarizeAccountItem(item) : "No account data returned by Apify.",
      raw: item,
    };
  } catch (error) {
    return {
      url: normalizedUrl,
      platform,
      summary: error instanceof Error ? error.message : "Apify parsing failed.",
      raw: null,
    };
  }
}

async function discoverCompetitors(
  brandContext: Record<string, unknown>,
  sourcePrompt: string,
  preferredModel: string,
  openaiKey: string | null,
): Promise<Array<{ name: string; reason: string; account_url?: string }>> {
  const systemPrompt = "You are a competitor discovery analyst. Return JSON only.";
  const prompt = `Find likely direct competitors for this brand. Use only highly probable competitors, no generic market categories.

BRAND CONTEXT:
${JSON.stringify(brandContext).slice(0, 5000)}

USER GOAL:
${sourcePrompt.slice(0, 1000)}

Return exactly:
{
  "competitors": [
    { "name": "string", "reason": "string", "account_url": "optional url or empty string" }
  ]
}

Rules:
- Return between 0 and 5 competitors.
- Prefer companies or creators competing for the same audience.
- If uncertain, return fewer items, not guesses.`;

  const result = await callAI(prompt, systemPrompt, preferredModel, openaiKey);
  if (!result.response.ok) return [];
  const payload = await result.response.json();
  const text = parseAIText(result, payload);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed?.competitors) ? parsed.competitors : [];
  } catch {
    return [];
  }
}

async function buildReportAndPrompt(
  input: {
    companyDetails: any;
    brandProfile: any;
    clientAccounts: Array<{ url: string; platform: string; summary: string }>;
    competitorAccounts: Array<{ url: string; platform: string; summary: string; label: string }>;
    sourcePrompt: string;
    requestedContentType: string;
    requestedGoal: string;
  },
  preferredModel: string,
  openaiKey: string | null,
) {
  const systemPrompt = "You are AIson's strategic marketing research engine. Return JSON only.";
  const prompt = `Build a hyper-detailed strategic report and a production-ready prompt.

INPUT:
${JSON.stringify(input).slice(0, 14000)}

Return exactly:
{
  "report_title": "string",
  "executive_summary": "string",
  "client_branding": {
    "brand_name": "string",
    "tone_of_voice": "string",
    "visual_style": "string",
    "colors": ["string"],
    "target_audience": "string"
  },
  "competitor_analysis": {
    "landscape_summary": "string",
    "patterns_to_emulate": ["string"],
    "gaps_to_exploit": ["string"],
    "risks_to_avoid": ["string"]
  },
  "client_account_analysis": {
    "positioning_summary": "string",
    "content_patterns": ["string"],
    "strengths": ["string"],
    "weaknesses": ["string"]
  },
  "strategy": {
    "campaign_goal": "string",
    "content_goal": "string",
    "recommended_angle": "string",
    "recommended_hooks": ["string"],
    "recommended_ctas": ["string"],
    "recommended_formats": ["string"]
  },
  "prompt": {
    "optimized_prompt": "string",
    "system_context": "string",
    "quality_rationale": ["string"]
  }
}

Requirements:
- Prioritize quality of the final prompt over brevity.
- The prompt must be detailed enough to guide high-quality content generation for ${input.requestedContentType}.
- The report must combine client branding, client account patterns, and competitor patterns.
- Avoid posting/scheduling advice. Focus on research and prompt construction.`;

  const result = await callAI(prompt, systemPrompt, preferredModel, openaiKey);
  if (!result.response.ok) {
    throw new Error("Failed to build strategy report");
  }
  const payload = await result.response.json();
  const text = parseAIText(result, payload);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Could not parse strategy report");
  }
  return JSON.parse(match[0]);
}

async function scorePrompt(
  reportJson: any,
  preferredModel: string,
  openaiKey: string | null,
) {
  const systemPrompt = "You are a prompt quality evaluator. Return JSON only.";
  const prompt = `Evaluate the optimized prompt for expected satisfaction and strategic fidelity.

INPUT:
${JSON.stringify(reportJson).slice(0, 12000)}

Return exactly:
{
  "score": 0,
  "verdict": "string",
  "missing_factors": ["string"],
  "revision_prompt": "string"
}

Scoring rubric:
- strategic accuracy against client + competitor report
- specificity and detail
- fidelity to tone/branding/colors
- usefulness for generating ${reportJson?.strategy?.content_goal || "requested"} content
- likelihood of satisfying a demanding user

Aim for honest scoring.`;

  const result = await callAI(prompt, systemPrompt, preferredModel, openaiKey);
  if (!result.response.ok) {
    return { score: 70, verdict: "Evaluator unavailable", missing_factors: [], revision_prompt: "" };
  }
  const payload = await result.response.json();
  const text = parseAIText(result, payload);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { score: 70, verdict: "Evaluator unavailable", missing_factors: [], revision_prompt: "" };
  try {
    return JSON.parse(match[0]);
  } catch {
    return { score: 70, verdict: "Evaluator unavailable", missing_factors: [], revision_prompt: "" };
  }
}

async function reviseReportPrompt(
  reportJson: any,
  evaluation: any,
  preferredModel: string,
  openaiKey: string | null,
) {
  const systemPrompt = "You are AIson's prompt optimizer. Return JSON only.";
  const prompt = `Revise the prompt in this report to address the evaluator feedback while preserving the strategy.

REPORT:
${JSON.stringify(reportJson).slice(0, 12000)}

EVALUATION:
${JSON.stringify(evaluation).slice(0, 3000)}

Return exactly:
{
  "optimized_prompt": "string",
  "system_context": "string",
  "quality_rationale": ["string"]
}`;

  const result = await callAI(prompt, systemPrompt, preferredModel, openaiKey);
  if (!result.response.ok) return reportJson.prompt;
  const payload = await result.response.json();
  const text = parseAIText(result, payload);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return reportJson.prompt;
  try {
    return JSON.parse(match[0]);
  } catch {
    return reportJson.prompt;
  }
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
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;
    const OPENAI_API_KEY = await resolveOpenAIKey(userId);

    const {
      sourcePrompt,
      requestedContentType = "text",
      requestedGoal = "",
      competitorInputs = [],
      preferredModel,
    } = await req.json();

    if (!sourcePrompt || typeof sourcePrompt !== "string") {
      return new Response(JSON.stringify({ error: "sourcePrompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const selectedModel = normalizeModel(preferredModel);
    const [companyRes, brandRes, socialRes] = await Promise.all([
      supabaseAdmin.from("company_details").select("*").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("brand_profiles").select("*").eq("user_id", userId).order("scraped_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("social_connections_safe").select("platform, account_name").eq("user_id", userId),
    ]);

    const companyDetails = companyRes.data || {};
    const brandProfile = brandRes.data || {};
    const directCompetitors = Array.isArray(competitorInputs) ? competitorInputs.filter(Boolean) : [];

    const brandContext = {
      company_name: companyDetails?.company_name || brandProfile?.brand_name,
      website: companyDetails?.website || companyDetails?.brand_source_url || brandProfile?.source_url,
      industry: brandProfile?.industry || companyDetails?.business_type,
      target_audience: companyDetails?.target_audience || brandProfile?.target_audience_signals,
      tone_of_voice: brandProfile?.tone_of_voice,
      key_messages: brandProfile?.key_messages,
      content_themes: brandProfile?.content_themes,
      competitors_mentioned: brandProfile?.competitors_mentioned,
    };

    const discoveredCompetitors = directCompetitors.length
      ? directCompetitors.map((item: string) => ({ name: item, reason: "Provided directly by the user.", account_url: item }))
      : await discoverCompetitors(brandContext, sourcePrompt, selectedModel, OPENAI_API_KEY || null);

    const inferredClientUrls = [
      companyDetails?.website,
      companyDetails?.brand_source_url,
      brandProfile?.source_url,
      ...(socialRes.data || []).map((row: any) => row.account_name).filter(Boolean),
    ]
      .map((value: string) => normalizeUrl(value))
      .filter(Boolean)
      .filter((value: string, index: number, array: string[]) => array.indexOf(value) === index)
      .filter((value: string) => ["instagram", "facebook", "linkedin"].includes(getPlatformFromUrl(value)));

    const competitorUrls = discoveredCompetitors
      .map((item) => normalizeUrl(item.account_url || item.name))
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .filter((value) => ["instagram", "facebook", "linkedin"].includes(getPlatformFromUrl(value)));

    const apifyToken = await resolveApifyToken(supabaseAdmin, userId);

    const clientAccounts = await Promise.all(inferredClientUrls.slice(0, 6).map((url) => parseAccountViaApify(apifyToken, url)));
    const competitorAccountsBase = await Promise.all(competitorUrls.slice(0, 8).map((url) => parseAccountViaApify(apifyToken, url)));
    const competitorAccounts = competitorAccountsBase.map((account, index) => ({
      ...account,
      label: discoveredCompetitors[index]?.name || account.url,
    }));

    const reportInput = {
      companyDetails,
      brandProfile,
      clientAccounts: clientAccounts.map((item) => ({ url: item.url, platform: item.platform, summary: item.summary })),
      competitorAccounts: competitorAccounts.map((item) => ({
        url: item.url,
        platform: item.platform,
        label: item.label,
        summary: item.summary,
      })),
      sourcePrompt: sourcePrompt.slice(0, 5000),
      requestedContentType,
      requestedGoal: requestedGoal || sourcePrompt,
    };

    // Build the report. If the model output can't be parsed or the provider
    // rate-limits (common on free tiers), fall back to a solid basic prompt so
    // content generation still proceeds instead of hard-failing.
    let strategyReport: any;
    let evaluation: any = { score: null };
    try {
      strategyReport = await buildReportAndPrompt(reportInput, selectedModel, OPENAI_API_KEY || null);
      // Optional quality scoring — best-effort, never blocks. Skipped silently on
      // any error to avoid extra provider load / rate limits.
      try {
        evaluation = await scorePrompt(strategyReport, selectedModel, OPENAI_API_KEY || null);
        if ((evaluation?.score || 0) < 85) {
          strategyReport.prompt = await reviseReportPrompt(
            strategyReport,
            evaluation,
            selectedModel,
            OPENAI_API_KEY || null,
          );
          evaluation = await scorePrompt(strategyReport, selectedModel, OPENAI_API_KEY || null);
        }
      } catch (scoreErr) {
        console.warn("Strategy scoring/revision skipped:", scoreErr);
      }
    } catch (buildErr) {
      console.warn("Strategy report build failed, using basic prompt:", buildErr);
      const basicPrompt = [
        `Create high-quality ${requestedContentType} content for ${brandContext.company_name || "this brand"}.`,
        `Goal: ${requestedGoal || sourcePrompt}.`,
        brandContext.tone_of_voice ? `Tone: ${brandContext.tone_of_voice}.` : "",
        brandContext.target_audience ? `Target audience: ${brandContext.target_audience}.` : "",
        brandContext.industry ? `Industry: ${brandContext.industry}.` : "",
        (brandContext.key_messages && (brandContext.key_messages as string[]).length) ? `Key messages: ${(brandContext.key_messages as string[]).join("; ")}.` : "",
        `Brief: ${sourcePrompt.slice(0, 2000)}`,
      ].filter(Boolean).join("\n");
      strategyReport = {
        report_title: `${brandContext.company_name || "Brand"} content strategy`,
        prompt: {
          optimized_prompt: basicPrompt,
          system_context: `You are an expert marketing content creator for ${brandContext.company_name || "this brand"}. Stay on-brand, ${brandContext.tone_of_voice || "professional"} in tone, and audience-relevant.`,
        },
        _fallback: true,
      };
    }

    await supabaseAdmin.from("strategy_reports").insert({
      user_id: userId,
      title: strategyReport.report_title || "AIson strategic prompt report",
      requested_content_type: requestedContentType,
      source_prompt: sourcePrompt.slice(0, 5000),
      resolved_competitors: discoveredCompetitors.map((item) => item.name).slice(0, 10),
      client_accounts: clientAccounts,
      competitor_accounts: competitorAccounts,
      research_report: strategyReport,
      optimized_prompt: strategyReport?.prompt?.optimized_prompt || sourcePrompt,
      prompt_score: evaluation?.score || null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        score: evaluation?.score || null,
        report: strategyReport,
        optimizedPrompt: strategyReport?.prompt?.optimized_prompt || sourcePrompt,
        optimizedSystemContext: strategyReport?.prompt?.system_context || "",
        resolvedCompetitors: discoveredCompetitors,
        parsedClientAccounts: clientAccounts,
        parsedCompetitorAccounts: competitorAccounts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in generate-strategy-prompt:", error);
    return new Response(JSON.stringify({ error: `Strategy generation failed: ${error instanceof Error ? error.message : String(error)}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
