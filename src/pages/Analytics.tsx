import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchLatestReport, downloadReport } from "@/lib/reportExport";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { BrandProfile } from "@/hooks/useBrandIntelligence";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { buildBrandMemoryEngineReport } from "@/lib/brandMemoryEngine";
import {
  BarChart3,
  BookOpenText,
  Brain,
  CalendarClock,
  Download,
  Eye,
  FileText,
  Loader2,
  Heart,
  Layers3,
  MessageCircle,
  MousePointerClick,
  Presentation,
  Radar,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { getBypassRedirectTarget, shouldBypassAuth } from "@/lib/localAccessBypass";

type PostMetric = Database["public"]["Tables"]["post_analytics"]["Row"];
type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];

const reportTypes = ["Strategic report", "Campaigns", "Social networks", "Monthly performance"];
const contentTypeFilters = ["All", "Video", "Display", "Text"];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatPercent(value: number | null) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(1)}%`;
}

export default function Analytics() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<PostMetric[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState("Strategic report");
  const [downloadingReport, setDownloadingReport] = useState(false);

  const handleDownloadReport = async () => {
    setDownloadingReport(true);
    try {
      const report = await fetchLatestReport();
      if (!report || !report.research_report || !Object.keys(report.research_report).length) {
        toast.error("No strategy report yet. Generate one first (ask the assistant or use Content Studio), then download it here.");
        return;
      }
      downloadReport(report, brandProfile?.brand_name || undefined);
      toast.success("Report downloaded — open it and Print → Save as PDF to share with your client.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not download the report.");
    } finally {
      setDownloadingReport(false);
    }
  };
  const [contentType, setContentType] = useState("All");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    "impressions",
    "reach",
    "likes",
    "comments",
    "clicks",
  ]);

  useEffect(() => {
    loadAnalytics();
    // Reward: opening Analytics unlocks the "Data Explorer" star.
    window.dispatchEvent(new Event("aison:analytics-viewed"));
  }, []);

  const loadAnalytics = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      if (!shouldBypassAuth()) {
        navigate(getBypassRedirectTarget());
        return;
      }
    }

    const [analyticsRes, campaignsRes, brandRes] = await Promise.all([
      supabase.from("post_analytics").select("*").order("fetched_at", { ascending: false }).limit(100),
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }).limit(20),
      supabase
        .from("brand_profiles")
        .select("*")
        .order("scraped_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setMetrics((analyticsRes.data || []) as PostMetric[]);
    setCampaigns((campaignsRes.data || []) as CampaignRow[]);
    setBrandProfile((brandRes.data || null) as BrandProfile | null);
    setLoading(false);
  };

  const intelligenceReport = useMemo(
    () => buildBrandMemoryEngineReport(brandProfile, campaigns, metrics),
    [brandProfile, campaigns, metrics],
  );

  const totals = useMemo(() => {
    return metrics.reduce(
      (acc, row) => ({
        impressions: acc.impressions + (row.impressions || 0),
        reach: acc.reach + (row.reach || 0),
        likes: acc.likes + (row.likes || 0),
        comments: acc.comments + (row.comments || 0),
        clicks: acc.clicks + (row.clicks || 0),
        posts: acc.posts + 1,
      }),
      { impressions: 0, reach: 0, likes: 0, comments: 0, clicks: 0, posts: 0 },
    );
  }, [metrics]);

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((item) => item !== metric) : [...prev, metric],
    );
  };

  const overviewCards = [
    { key: "impressions", label: "Impressions", value: formatNumber(totals.impressions), icon: Eye },
    { key: "reach", label: "Reach", value: formatNumber(totals.reach), icon: Layers3 },
    { key: "likes", label: "Likes", value: formatNumber(totals.likes), icon: Heart },
    { key: "comments", label: "Comments", value: formatNumber(totals.comments), icon: MessageCircle },
    { key: "clicks", label: "CTR Clicks", value: formatNumber(totals.clicks), icon: MousePointerClick },
    { key: "posts", label: "Tracked posts", value: totals.posts.toString(), icon: FileText },
  ].filter((card) => selectedMetrics.includes(card.key) || card.key === "posts");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
                <p className="text-muted-foreground text-sm">
                  Brand Memory Engine, strategic reporting, and production logic based on brand and performance data.
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleDownloadReport} disabled={downloadingReport}>
                {downloadingReport ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Download report
              </Button>
              <Button variant="outline">
                <CalendarClock className="w-4 h-4 mr-2" />
                Schedule report
              </Button>
              <Button variant="outline">
                <Presentation className="w-4 h-4 mr-2" />
                Save report view
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Report setup</h2>
                <p className="text-sm text-muted-foreground">
                  This layer now mirrors the strategy-report structure from your example instead of showing only raw totals.
                </p>
              </div>
              <Badge variant="secondary">{metrics.length} analytics rows</Badge>
            </div>

            <div className="flex gap-2 flex-wrap mb-4">
              {reportTypes.map((type) => (
                <Button
                  key={type}
                  variant={reportType === type ? "default" : "outline"}
                  onClick={() => setReportType(type)}
                >
                  {type}
                </Button>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              {contentTypeFilters.map((type) => (
                <Button
                  key={type}
                  variant={contentType === type ? "default" : "outline"}
                  onClick={() => setContentType(type)}
                >
                  {type}
                </Button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold text-foreground mb-4">Visible metrics</h2>
            <div className="space-y-3">
              {[
                ["impressions", "Impressions"],
                ["reach", "Reach"],
                ["likes", "Likes"],
                ["comments", "Comments"],
                ["clicks", "CTR Clicks"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 text-sm text-foreground">
                  <Checkbox checked={selectedMetrics.includes(key)} onCheckedChange={() => toggleMetric(key)} />
                  {label}
                </label>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {overviewCards.map((card) => (
            <Card key={card.key} className="p-4 space-y-1">
              <div className="flex items-center justify-between">
                <card.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{reportType}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Brand Memory Engine</h2>
              <Badge variant="secondary">{intelligenceReport.healthScore}/100 health</Badge>
            </div>

            <p className="text-sm text-muted-foreground">{intelligenceReport.memorySummary}</p>
            <p className="text-sm text-muted-foreground">{intelligenceReport.audienceSummary}</p>
            <p className="text-sm text-muted-foreground">{intelligenceReport.marketPosition}</p>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Content pillars</p>
                <div className="flex flex-wrap gap-2">
                  {intelligenceReport.contentPillars.length > 0 ? (
                    intelligenceReport.contentPillars.map((pillar) => (
                      <Badge key={pillar} variant="secondary">{pillar}</Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No stable pillars detected yet.</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Top platform</p>
                {intelligenceReport.topPlatform ? (
                  <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
                    <p className="font-medium capitalize text-foreground">{intelligenceReport.topPlatform.platform}</p>
                    <p className="text-muted-foreground">
                      {formatPercent(intelligenceReport.topPlatform.avgEngagementRate)} avg engagement
                    </p>
                    <p className="text-muted-foreground">
                      {formatNumber(intelligenceReport.topPlatform.impressions)} impressions
                    </p>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">No platform performance data yet.</span>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Strongest signals</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {intelligenceReport.strongestSignals.map((signal) => (
                    <li key={signal}>• {signal}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Weak signals</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {intelligenceReport.weakSignals.map((signal) => (
                    <li key={signal}>• {signal}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Opportunities</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {intelligenceReport.opportunities.map((signal) => (
                    <li key={signal}>• {signal}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Stage 2 Production Brief</h2>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">Strategic angle</p>
                <p className="text-sm text-foreground">{intelligenceReport.productionBrief.strategicAngle}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">Audience</p>
                <p className="text-sm text-foreground">{intelligenceReport.productionBrief.audience}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">Execution notes</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {intelligenceReport.productionBrief.executionNotes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">Channel plan</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {intelligenceReport.productionBrief.channelPlan.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">CTA direction</p>
                <p className="text-sm text-foreground">{intelligenceReport.productionBrief.ctaDirection}</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-5 space-y-5">
          <div className="flex items-center gap-2">
            <BookOpenText className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Strategic Report Preview</h2>
            <Badge variant="outline">Example-based structure</Badge>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-5">
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Radar className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-medium text-foreground">1. Data interpretation & cleaning</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {intelligenceReport.reportSections.dataInterpretation.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-medium text-foreground">2. Performance breakdown</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {intelligenceReport.reportSections.performanceBreakdown.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="space-y-5">
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-medium text-foreground">3. Content DNA analysis</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {intelligenceReport.reportSections.contentDNA.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-medium text-foreground">4. Recommended strategy</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {intelligenceReport.reportSections.strategicRecommendations.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Recent performance table
            </h2>
            {metrics.length === 0 ? (
              <Card className="p-8 text-center">
                <BarChart3 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                <h3 className="font-semibold text-foreground text-sm mb-1">No analytics data yet</h3>
                <p className="text-xs text-muted-foreground">
                  Publish content and connect socials to unlock the self-learning loop.
                </p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px]">
                    <thead className="bg-muted/40">
                      <tr className="text-left text-sm text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Platform</th>
                        <th className="px-4 py-3 font-medium">Impressions</th>
                        <th className="px-4 py-3 font-medium">Reach</th>
                        <th className="px-4 py-3 font-medium">Likes</th>
                        <th className="px-4 py-3 font-medium">Comments</th>
                        <th className="px-4 py-3 font-medium">Clicks</th>
                        <th className="px-4 py-3 font-medium">Engagement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.slice(0, 12).map((metric) => (
                        <tr key={metric.id} className="border-t border-border">
                          <td className="px-4 py-3 capitalize font-medium text-foreground">{metric.platform}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{metric.impressions || 0}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{metric.reach || 0}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{metric.likes || 0}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{metric.comments || 0}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{metric.clicks || 0}</td>
                          <td className="px-4 py-3 text-sm text-primary">
                            {metric.engagement_rate != null ? `${(metric.engagement_rate * 100).toFixed(1)}%` : "n/a"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>

          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Normalized metrics</h2>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Tracked posts</span>
                <span className="text-foreground font-medium">{intelligenceReport.normalizedMetrics.totalPosts}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Campaigns</span>
                <span className="text-foreground font-medium">{intelligenceReport.normalizedMetrics.totalCampaigns}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Total impressions</span>
                <span className="text-foreground font-medium">{formatNumber(intelligenceReport.normalizedMetrics.totalImpressions)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Total reach</span>
                <span className="text-foreground font-medium">{formatNumber(intelligenceReport.normalizedMetrics.totalReach)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Total engagements</span>
                <span className="text-foreground font-medium">{formatNumber(intelligenceReport.normalizedMetrics.totalEngagements)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Avg engagement rate</span>
                <span className="text-foreground font-medium">{formatPercent(intelligenceReport.normalizedMetrics.avgEngagementRate)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Click-through proxy</span>
                <span className="text-foreground font-medium">{formatPercent(intelligenceReport.normalizedMetrics.clickThroughProxy)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
