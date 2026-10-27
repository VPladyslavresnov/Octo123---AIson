import type { BrandProfile } from "@/hooks/useBrandIntelligence";
import type { Database } from "@/integrations/supabase/types";

type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type AnalyticsRow = Database["public"]["Tables"]["post_analytics"]["Row"];

interface PlatformSnapshot {
  platform: string;
  posts: number;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  videoViews: number;
  avgEngagementRate: number;
  engagementPerThousandImpressions: number | null;
}

export interface BrandMemoryEngineReport {
  healthScore: number;
  memorySummary: string;
  audienceSummary: string;
  marketPosition: string;
  contentPillars: string[];
  strongestSignals: string[];
  weakSignals: string[];
  opportunities: string[];
  topPlatform: PlatformSnapshot | null;
  platformSnapshots: PlatformSnapshot[];
  normalizedMetrics: {
    totalPosts: number;
    totalCampaigns: number;
    totalImpressions: number;
    totalReach: number;
    totalEngagements: number;
    avgEngagementRate: number;
    clickThroughProxy: number | null;
  };
  reportSections: {
    dataInterpretation: string[];
    performanceBreakdown: string[];
    contentDNA: string[];
    strategicRecommendations: string[];
  };
  productionBrief: {
    strategicAngle: string;
    audience: string;
    executionNotes: string[];
    channelPlan: string[];
    ctaDirection: string;
  };
}

function cleanList(values: Array<string | null | undefined> = []): string[] {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(1)}%`;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function buildPlatformSnapshots(analytics: AnalyticsRow[]): PlatformSnapshot[] {
  const grouped = new Map<string, AnalyticsRow[]>();

  analytics.forEach((row) => {
    const key = (row.platform || "unknown").toLowerCase();
    grouped.set(key, [...(grouped.get(key) || []), row]);
  });

  return [...grouped.entries()]
    .map(([platform, rows]) => {
      const impressions = rows.reduce((sum, row) => sum + (row.impressions || 0), 0);
      const reach = rows.reduce((sum, row) => sum + (row.reach || 0), 0);
      const likes = rows.reduce((sum, row) => sum + (row.likes || 0), 0);
      const comments = rows.reduce((sum, row) => sum + (row.comments || 0), 0);
      const shares = rows.reduce((sum, row) => sum + (row.shares || 0), 0);
      const clicks = rows.reduce((sum, row) => sum + (row.clicks || 0), 0);
      const videoViews = rows.reduce((sum, row) => sum + (row.video_views || 0), 0);
      const engagementRates = rows
        .map((row) => (row.engagement_rate == null ? null : row.engagement_rate * 100))
        .filter((value): value is number => value != null);
      const engagements = likes + comments + shares;

      return {
        platform,
        posts: rows.length,
        impressions,
        reach,
        likes,
        comments,
        shares,
        clicks,
        videoViews,
        avgEngagementRate: average(engagementRates),
        engagementPerThousandImpressions: impressions > 0 ? (engagements / impressions) * 1000 : null,
      };
    })
    .sort((a, b) => {
      const scoreA = a.avgEngagementRate * 100 + (a.clicks || 0);
      const scoreB = b.avgEngagementRate * 100 + (b.clicks || 0);
      return scoreB - scoreA;
    });
}

export function buildBrandMemoryEngineReport(
  profile: BrandProfile | null,
  campaigns: CampaignRow[],
  analytics: AnalyticsRow[],
): BrandMemoryEngineReport {
  const platformSnapshots = buildPlatformSnapshots(analytics);
  const topPlatform = platformSnapshots[0] || null;
  const weakestPlatform = platformSnapshots[platformSnapshots.length - 1] || null;

  const totalImpressions = analytics.reduce((sum, row) => sum + (row.impressions || 0), 0);
  const totalReach = analytics.reduce((sum, row) => sum + (row.reach || 0), 0);
  const totalEngagements = analytics.reduce(
    (sum, row) => sum + (row.likes || 0) + (row.comments || 0) + (row.shares || 0),
    0,
  );
  const avgEngagementRate = average(
    analytics
      .map((row) => (row.engagement_rate == null ? null : row.engagement_rate * 100))
      .filter((value): value is number => value != null),
  );
  const clickThroughProxy = totalReach > 0 ? (analytics.reduce((sum, row) => sum + (row.clicks || 0), 0) / totalReach) * 100 : null;

  const campaignThemes = dedupe(
    campaigns.flatMap((campaign) => cleanList((campaign.key_offers_or_topics as string[] | null) || [])),
  );
  const campaignChannels = dedupe(campaigns.flatMap((campaign) => cleanList(campaign.channels || [])));
  const contentPillars = dedupe([
    ...cleanList(profile?.content_themes || []),
    ...campaignThemes,
  ]).slice(0, 6);

  const profileCompleteness = [
    profile?.brand_name,
    profile?.brand_description,
    profile?.tone_of_voice,
    profile?.target_audience_signals,
    profile?.industry,
    profile?.visual_style,
  ].filter(Boolean).length;
  const healthScore = Math.min(
    100,
    Math.round(profileCompleteness * 10 + Math.min(analytics.length, 10) * 4 + Math.min(campaigns.length, 5) * 4),
  );

  const strongestSignals = dedupe([
    ...(topPlatform
      ? [
          `${topPlatform.platform} currently leads with ${formatPercent(topPlatform.avgEngagementRate)} average engagement`,
          `${topPlatform.posts} tracked posts show the clearest signal on ${topPlatform.platform}`,
        ]
      : []),
    ...(profile?.tone_of_voice ? [`${profile.tone_of_voice} tone is part of the brand memory baseline`] : []),
    ...contentPillars.slice(0, 2).map((pillar) => `${pillar} is a repeatable content pillar`),
    ...cleanList(profile?.key_messages || []).slice(0, 2).map((message) => `Message to preserve: ${message}`),
  ]).slice(0, 5);

  const weakSignals = dedupe([
    ...(weakestPlatform && weakestPlatform !== topPlatform
      ? [`${weakestPlatform.platform} is the weakest current signal and needs different creative treatment`]
      : []),
    ...(analytics.length === 0 ? ["No live post analytics yet, so the engine is still operating with partial memory"] : []),
    ...(campaignChannels.length <= 1 ? ["Channel coverage is narrow, which limits competitive learning across formats"] : []),
    ...(profile?.cta_patterns?.length ? [] : ["CTA mechanics are not yet clearly defined in the brand memory layer"]),
  ]).slice(0, 4);

  const opportunities = dedupe([
    ...(topPlatform ? [`Double down on ${topPlatform.platform} while adapting winning hooks to adjacent channels`] : []),
    ...(profile?.target_audience_signals ? [`Build more content explicitly around ${profile.target_audience_signals}`] : []),
    ...(contentPillars.length ? [`Turn ${contentPillars[0]} into a recurring series with measurable weekly output`] : []),
    ...(clickThroughProxy != null ? [`Improve CTA strength to move click-through proxy beyond ${formatPercent(clickThroughProxy)}`] : ["Start capturing click and reach signals to unlock stronger optimization loops"]),
  ]).slice(0, 4);

  const memorySummary = profile
    ? `${profile.brand_name || "This brand"} is positioned in ${profile.industry || "its market"} with a ${profile.tone_of_voice || "distinct"} voice, ${profile.visual_style || "defined"} visual direction, and ${contentPillars.length || 0} reusable content pillars.`
    : "No persistent brand profile is connected yet, so the platform can only infer strategy from campaigns and performance data.";

  const audienceSummary = profile?.target_audience_signals
    ? `Core audience signal: ${profile.target_audience_signals}.`
    : "Audience definition is still thin. The platform should collect stronger audience cues from onboarding, comments, clicks, and platform-level response.";

  const marketPosition = profile
    ? `${profile.brand_name || "The brand"} should compete on ${cleanList(profile.key_messages || []).slice(0, 2).join(" and ") || "clear positioning"}, not just on generic content output.`
    : "Current market position is under-defined because the Brand Memory Engine lacks a structured brand source of truth.";

  const dataInterpretation = [
    `Tracked dataset currently includes ${analytics.length} analytics rows across ${platformSnapshots.length || 0} social platforms and ${campaigns.length} campaigns.`,
    `Core measurable signals available today: impressions, reach, likes, comments, shares, clicks, and engagement rate.${analytics.some((row) => row.video_views) ? " Video views are also available for some posts." : ""}`,
    analytics.length
      ? `Normalized proxy used by the engine: engagements per 1,000 impressions = ${topPlatform?.engagementPerThousandImpressions?.toFixed(1) || "n/a"} on the best-performing platform.`
      : "No normalized post-performance proxy can be calculated yet because no analytics data has been captured.",
  ];

  const performanceBreakdown = [
    topPlatform
      ? `${topPlatform.platform} is the current top performer with ${formatCompactNumber(topPlatform.impressions)} impressions and ${formatPercent(topPlatform.avgEngagementRate)} average engagement.`
      : "No platform is leading yet because no live analytics rows are available.",
    weakestPlatform && weakestPlatform !== topPlatform
      ? `${weakestPlatform.platform} is lagging behind, suggesting the same message is not translating equally well across channels.`
      : "Cross-channel comparison is still limited.",
    campaigns.length
      ? `Current campaign set emphasizes ${campaignThemes.slice(0, 3).join(", ") || "broad messaging"} with ${campaignChannels.join(", ") || "limited channel coverage"}.`
      : "No campaigns have been launched yet, so the intelligence loop cannot compare strategic themes over time.",
  ];

  const contentDNA = [
    profile?.brand_description || "The brand DNA summary is not yet captured in profile form.",
    contentPillars.length
      ? `Content DNA currently clusters around ${contentPillars.join(", ")}.`
      : "No stable content pillars have been identified yet.",
    profile?.visual_style
      ? `Visual language should stay ${profile.visual_style} with ${profile.primary_colors?.slice(0, 2).join(" and ") || "the established"} brand colors.`
      : "Visual identity needs stronger codification inside the memory engine.",
    profile?.tone_of_voice
      ? `Voice baseline: ${profile.tone_of_voice}. This should be preserved across every campaign brief.`
      : "Voice is not strongly defined, which risks inconsistent output.",
  ];

  const strategicRecommendations = [
    ...opportunities,
    "Run the engine in a two-stage flow: first produce strategic analysis, then translate it into a production brief before generating content.",
    "After each publishing cycle, push performance outcomes back into the brand memory so future briefs can prioritize proven hooks, formats, and CTAs.",
  ].slice(0, 5);

  return {
    healthScore,
    memorySummary,
    audienceSummary,
    marketPosition,
    contentPillars,
    strongestSignals,
    weakSignals,
    opportunities,
    topPlatform,
    platformSnapshots,
    normalizedMetrics: {
      totalPosts: analytics.length,
      totalCampaigns: campaigns.length,
      totalImpressions,
      totalReach,
      totalEngagements,
      avgEngagementRate,
      clickThroughProxy,
    },
    reportSections: {
      dataInterpretation,
      performanceBreakdown,
      contentDNA,
      strategicRecommendations,
    },
    productionBrief: {
      strategicAngle: topPlatform
        ? `Build the next campaign around what is already working on ${topPlatform.platform}, but with tighter positioning and clearer CTA mechanics.`
        : "Build the next campaign around the brand's clearest differentiators and use the first wave of posts to establish measurable baselines.",
      audience: profile?.target_audience_signals || "Primary audience needs refinement; start with the currently stated ICP and learn from response data.",
      executionNotes: dedupe([
        ...(profile?.tone_of_voice ? [`Maintain a ${profile.tone_of_voice} tone across copy.`] : []),
        ...(profile?.visual_style ? [`Keep visuals ${profile.visual_style} and anchored in brand colors.`] : []),
        ...(contentPillars.length ? [`Create around pillars: ${contentPillars.slice(0, 3).join(", ")}.`] : []),
        "Prioritize posts that are easy to compare by channel, angle, and CTA.",
      ]).slice(0, 4),
      channelPlan: platformSnapshots.length
        ? platformSnapshots.slice(0, 3).map((snapshot) => `Use ${snapshot.platform} for ${snapshot.posts > 3 ? "scaled testing" : "baseline validation"} and optimize against engagement plus clicks.`)
        : campaignChannels.slice(0, 3).map((channel) => `Use ${channel} as an initial test channel and collect response data.`),
      ctaDirection: cleanList(profile?.cta_patterns || [])[0] || "Use one clear CTA per asset and make click intent measurable.",
    },
  };
}
