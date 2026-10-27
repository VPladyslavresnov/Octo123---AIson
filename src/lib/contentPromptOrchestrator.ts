import { supabase } from "@/integrations/supabase/client";
import type { BrandProfile } from "@/hooks/useBrandIntelligence";
import { buildBrandMemoryEngineReport } from "@/lib/brandMemoryEngine";

interface OrchestratorParams {
  sourcePrompt: string;
  requestedContentType: string;
  companyDetails?: any;
  brandProfile?: BrandProfile | null;
  strategyResult?: any | null;
  styleSystemPrompt?: string;
}

export interface GenerationPromptBundle {
  systemPrompt: string;
  userPrompt: string;
  visualPrompt: string;
  contextSummary: string;
  latestStrategyReport: any | null;
}

const MAX_SYSTEM_CHARS = 14000;
const MAX_USER_CHARS = 22000;
const MAX_VISUAL_CHARS = 2600;

export async function buildContentGenerationPrompt(params: OrchestratorParams): Promise<GenerationPromptBundle> {
  const workspace = await loadWorkspaceIntelligence(params.brandProfile, params.companyDetails);
  const brandProfile = params.brandProfile || workspace.brandProfile;
  const companyDetails = params.companyDetails || workspace.companyDetails;
  const memoryReport = buildBrandMemoryEngineReport(
    brandProfile,
    workspace.campaigns as any,
    workspace.analytics as any,
  );
  const latestStrategyReport = params.strategyResult || workspace.strategyReports[0] || null;

  const brandIdentity = [
    line("Brand name", brandProfile?.brand_name || companyDetails?.company_name),
    line("Tagline", brandProfile?.tagline),
    line("Industry", brandProfile?.industry || companyDetails?.business_type),
    line("Website/source", brandProfile?.source_url || companyDetails?.website),
    line("Location", brandProfile?.location || companyDetails?.location),
    line("Brand description", brandProfile?.brand_description),
    line("Tone of voice", brandProfile?.tone_of_voice),
    line("Target audience", brandProfile?.target_audience_signals || companyDetails?.target_audience),
    line("Visual style", brandProfile?.visual_style),
    line("Posting style", brandProfile?.posting_style),
    line("Font style", brandProfile?.font_style),
    listLine("Primary colours", brandProfile?.primary_colors),
    listLine("Secondary colours", brandProfile?.secondary_colors),
    listLine("Key messages", brandProfile?.key_messages),
    listLine("Content themes", brandProfile?.content_themes),
    listLine("CTA patterns", brandProfile?.cta_patterns),
    listLine("Preferred hashtags", brandProfile?.hashtags),
    line("Emoji rules", brandProfile ? (brandProfile.emoji_usage ? "Allowed if natural and on-brand" : "Do not use emojis") : null),
  ].filter(Boolean).join("\n");

  const competitorContext = [
    listLine("Competitors named in brand memory", brandProfile?.competitors_mentioned),
    params.strategyResult?.resolvedCompetitors?.length
      ? `Strategy-resolved competitors:\n${params.strategyResult.resolvedCompetitors
          .map((competitor: any, index: number) => `${index + 1}. ${competitor.name}${competitor.account_url ? ` (${competitor.account_url})` : ""}: ${competitor.reason || "Relevant competitor"}`)
          .join("\n")}`
      : "",
    workspace.strategyReports.length
      ? `Competitors from saved strategy reports:\n${workspace.strategyReports
          .flatMap((report: any) => report.resolved_competitors || [])
          .filter(Boolean)
          .slice(0, 20)
          .map((competitor: string, index: number) => `${index + 1}. ${competitor}`)
          .join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n");

  const analyticsContext = [
    `Memory summary: ${memoryReport.memorySummary}`,
    `Audience summary: ${memoryReport.audienceSummary}`,
    `Market position: ${memoryReport.marketPosition}`,
    `Health score: ${memoryReport.healthScore}/100`,
    listLine("Strongest signals", memoryReport.strongestSignals),
    listLine("Weak signals", memoryReport.weakSignals),
    listLine("Opportunities", memoryReport.opportunities),
    listLine("Data interpretation", memoryReport.reportSections.dataInterpretation),
    listLine("Performance breakdown", memoryReport.reportSections.performanceBreakdown),
    listLine("Content DNA", memoryReport.reportSections.contentDNA),
    listLine("Strategic recommendations", memoryReport.reportSections.strategicRecommendations),
    `Production brief: ${memoryReport.productionBrief.strategicAngle}. Audience: ${memoryReport.productionBrief.audience}. CTA direction: ${memoryReport.productionBrief.ctaDirection}.`,
    listLine("Execution notes", memoryReport.productionBrief.executionNotes),
    listLine("Channel plan", memoryReport.productionBrief.channelPlan),
  ].filter(Boolean).join("\n");

  const savedReportsContext = workspace.strategyReports.length
    ? workspace.strategyReports
        .map((report: any, index: number) => {
          const research = report.research_report || {};
          return [
            `Saved strategy report ${index + 1}: ${report.title || "Untitled report"}`,
            line("Original request", report.source_prompt),
            line("Content type", report.requested_content_type),
            line("Prompt score", report.prompt_score == null ? null : `${report.prompt_score}/100`),
            listLine("Resolved competitors", report.resolved_competitors),
            line("Executive summary", research.executive_summary),
            line("Competitor landscape", research.competitor_analysis?.landscape_summary),
            listLine("Patterns to emulate", research.competitor_analysis?.patterns_to_emulate),
            listLine("Gaps to exploit", research.competitor_analysis?.gaps_to_exploit),
            line("Recommended angle", research.strategy?.recommended_angle),
            listLine("Recommended hooks", research.strategy?.recommended_hooks),
            listLine("Recommended CTAs", research.strategy?.recommended_ctas),
            line("Saved optimized prompt", report.optimized_prompt),
          ].filter(Boolean).join("\n");
        })
        .join("\n\n---\n\n")
    : "No saved strategy reports were found. Use available brand memory, campaigns, and the current request.";

  const currentStrategyContext = params.strategyResult
    ? [
        line("Current strategy optimized prompt", params.strategyResult.optimizedPrompt),
        line("Current strategy system context", params.strategyResult.optimizedSystemContext),
        line("Current strategy score", params.strategyResult.score == null ? null : `${params.strategyResult.score}/100`),
        line("Current strategy executive summary", params.strategyResult.report?.executive_summary),
        line("Current strategy competitor landscape", params.strategyResult.report?.competitor_analysis?.landscape_summary),
        listLine("Current strategy patterns to emulate", params.strategyResult.report?.competitor_analysis?.patterns_to_emulate),
        listLine("Current strategy gaps to exploit", params.strategyResult.report?.competitor_analysis?.gaps_to_exploit),
        line("Current strategy recommended angle", params.strategyResult.report?.strategy?.recommended_angle),
        listLine("Current strategy recommended hooks", params.strategyResult.report?.strategy?.recommended_hooks),
        listLine("Current strategy recommended CTAs", params.strategyResult.report?.strategy?.recommended_ctas),
      ].filter(Boolean).join("\n")
    : "No current strategy-engine output was returned. Use saved reports and local brand memory.";

  const campaignContext = workspace.campaigns.length
    ? workspace.campaigns
        .slice(0, 8)
        .map((campaign: any, index: number) => [
          `${index + 1}. Objective: ${campaign.objective || "n/a"}`,
          line("Campaign name", campaign.content_mix?.campaignName),
          line("Tone", campaign.tone),
          listLine("Channels", campaign.channels),
          listLine("Offers/topics", campaign.key_offers_or_topics),
          line("Audience", campaign.audience),
          line("Budget", campaign.budget),
        ].filter(Boolean).join(" | "))
        .join("\n")
    : "No campaigns found yet.";

  const exampleContext = brandProfile?.content_examples?.length
    ? brandProfile.content_examples
        .slice(0, 5)
        .map((example, index) => `${index + 1}. ${example}`)
        .join("\n")
    : "No copy examples found.";

  const contextSummary = [
    brandProfile?.brand_name || companyDetails?.company_name || "Brand",
    brandProfile?.tone_of_voice || "brand voice not specified",
    brandProfile?.target_audience_signals || companyDetails?.target_audience || "audience not specified",
    latestStrategyReport?.score != null ? `latest prompt score ${latestStrategyReport.score}` : null,
  ].filter(Boolean).join(" | ");

  const systemPrompt = trimToLimit([
    "You are AIson's senior marketing strategist, competitive analyst, brand guardian, and content producer.",
    "Use ALL provided intelligence. Do not generate generic content. The output must feel as if it was written by a strategist who studied the brand, competitors, prior reports, campaigns, analytics, and the user's immediate task.",
    "Prioritize specificity, brand memory, competitor differentiation, concrete hooks, strong CTAs, and channel-native execution.",
    "If instructions conflict, follow this priority: user's current request, saved strategy report, brand identity, analytics/memory report, campaign history, general best practices.",
    params.styleSystemPrompt ? `Additional selected style/preset rules:\n${params.styleSystemPrompt}` : "",
  ].filter(Boolean).join("\n\n"), MAX_SYSTEM_CHARS);

  const userPrompt = trimToLimit([
    "CURRENT USER TASK",
    params.sourcePrompt,
    "",
    "REQUESTED CONTENT TYPE",
    params.requestedContentType,
    "",
    "BRAND IDENTITY AND BRAND MEMORY",
    brandIdentity || "No structured brand identity found.",
    "",
    "CUSTOMER/COMPANY PROFILE",
    stringifyCompact(companyDetails),
    "",
    "COMPETITOR AND MARKET CONTEXT",
    competitorContext || "No competitor context found.",
    "",
    "ANALYTICS TAB / BRAND MEMORY ENGINE REPORT",
    analyticsContext,
    "",
    "CURRENT STRATEGY ENGINE OUTPUT",
    currentStrategyContext,
    "",
    "SAVED STRATEGY REPORTS AND OPTIMIZED PROMPTS",
    savedReportsContext,
    "",
    "RECENT CAMPAIGN CONTEXT",
    campaignContext,
    "",
    "REAL COPY EXAMPLES TO MIRROR",
    exampleContext,
    "",
    "OUTPUT REQUIREMENTS",
    "Create the requested content using the full context above. Make it detailed, specific, and ready to use.",
    "For social content, return a caption, hook, hashtags, CTA, visual direction, suggested posting time, and channel adaptation notes where relevant.",
    "For images, describe the exact scene, composition, brand colours, style, text overlays, mood, audience cue, and what competitor pattern we are differentiating from.",
    "For video, include concept, scenes, narration, visual notes, timing, CTA, and platform adaptation.",
  ].join("\n"), MAX_USER_CHARS);

  const visualPrompt = trimToLimit([
    `Create a ${params.requestedContentType} visual asset for: ${params.sourcePrompt}`,
    line("Brand", brandProfile?.brand_name || companyDetails?.company_name),
    line("Audience", brandProfile?.target_audience_signals || companyDetails?.target_audience),
    line("Visual style", brandProfile?.visual_style),
    listLine("Colours", [...(brandProfile?.primary_colors || []), ...(brandProfile?.secondary_colors || [])].filter(Boolean).slice(0, 5)),
    line("Strategic angle", latestStrategyReport?.report?.strategy?.recommended_angle || latestStrategyReport?.research_report?.strategy?.recommended_angle || memoryReport.productionBrief.strategicAngle),
    listLine("Content themes", brandProfile?.content_themes),
    listLine("Competitor gaps to exploit", latestStrategyReport?.report?.competitor_analysis?.gaps_to_exploit || latestStrategyReport?.research_report?.competitor_analysis?.gaps_to_exploit),
    "Make it premium, platform-native, and unmistakably on-brand.",
  ].filter(Boolean).join("\n"), MAX_VISUAL_CHARS);

  return {
    systemPrompt,
    userPrompt,
    visualPrompt,
    contextSummary,
    latestStrategyReport,
  };
}

async function loadWorkspaceIntelligence(brandProfile?: BrandProfile | null, companyDetails?: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { brandProfile: brandProfile || null, companyDetails: companyDetails || null, campaigns: [], analytics: [], strategyReports: [] };
  }

  // Resolve the account's active brand (profiles.active_brand_id) unless a specific
  // brand was passed in; fall back to the newest brand for older accounts.
  let activeBrandId: string | null = null;
  if (!brandProfile) {
    const { data: prof } = await (supabase.from("profiles").select("active_brand_id").eq("id", user.id).maybeSingle() as any);
    activeBrandId = (prof as any)?.active_brand_id || null;
  }

  const [profileResult, companyResult, campaignsResult, analyticsResult, strategyResult] = await Promise.all([
    brandProfile
      ? Promise.resolve({ data: brandProfile })
      : activeBrandId
        ? supabase.from("brand_profiles").select("*").eq("id", activeBrandId).maybeSingle()
        : supabase.from("brand_profiles").select("*").eq("user_id", user.id).order("scraped_at", { ascending: false }).limit(1).maybeSingle(),
    companyDetails
      ? Promise.resolve({ data: companyDetails })
      : supabase.from("company_details").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("campaigns").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("post_analytics").select("*").order("fetched_at", { ascending: false }).limit(80),
    (supabase.from("strategy_reports" as any) as any).select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
  ]);

  return {
    brandProfile: (profileResult as any).data || null,
    companyDetails: (companyResult as any).data || null,
    campaigns: (campaignsResult as any).data || [],
    analytics: (analyticsResult as any).data || [],
    strategyReports: (strategyResult as any).data || [],
  };
}

function line(label: string, value: unknown): string {
  if (value == null || value === "") return "";
  return `${label}: ${typeof value === "string" ? value : stringifyCompact(value)}`;
}

function listLine(label: string, values: unknown): string {
  if (!Array.isArray(values) || values.length === 0) return "";
  return `${label}:\n${values.filter(Boolean).slice(0, 20).map((value, index) => `${index + 1}. ${String(value)}`).join("\n")}`;
}

function stringifyCompact(value: unknown): string {
  if (!value) return "n/a";
  try {
    return JSON.stringify(value, null, 2).slice(0, 5000);
  } catch {
    return String(value).slice(0, 5000);
  }
}

function trimToLimit(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n\n[Context trimmed to fit model input budget.]`;
}
