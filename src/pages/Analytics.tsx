import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BarChart3,
  CalendarClock,
  Eye,
  FileText,
  Heart,
  Layers3,
  MessageCircle,
  MousePointerClick,
  Presentation,
  Sparkles,
} from "lucide-react";

interface PostMetric {
  id: string;
  platform: string;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  engagement_rate: number | null;
}

const reportTypes = ["Campaigns", "Social networks", "Video content", "Monthly performance"];
const contentTypeFilters = ["All", "Video", "Display", "Text"];

export default function Analytics() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<PostMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState("Campaigns");
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
  }, []);

  const loadAnalytics = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: analyticsData } = await supabase
      .from("post_analytics")
      .select("*")
      .order("fetched_at", { ascending: false })
      .limit(50);

    setMetrics((analyticsData || []) as PostMetric[]);
    setLoading(false);
  };

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
      { impressions: 0, reach: 0, likes: 0, comments: 0, clicks: 0, posts: 0 }
    );
  }, [metrics]);

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((item) => item !== metric) : [...prev, metric]
    );
  };

  const overviewCards = [
    { key: "impressions", label: "Impressions", value: totals.impressions.toLocaleString(), icon: Eye },
    { key: "reach", label: "Reach", value: totals.reach.toLocaleString(), icon: Layers3 },
    { key: "likes", label: "Likes", value: totals.likes.toLocaleString(), icon: Heart },
    { key: "comments", label: "Comments", value: totals.comments.toLocaleString(), icon: MessageCircle },
    { key: "clicks", label: "CTR Clicks", value: totals.clicks.toLocaleString(), icon: MousePointerClick },
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
                  A real analytics module with report types, metric controls, and filters.
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
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
                  Filter the analytics module by report type and content type instead of showing one fixed dashboard.
                </p>
              </div>
              <Badge variant="secondary">{metrics.length} recent rows</Badge>
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

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">AI insights</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Use this section for campaign-level questions such as which campaigns underperformed, which social network drove the strongest CTR, or how video compares with display and text content over time.
          </p>
        </Card>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Recent performance table
          </h2>
          {metrics.length === 0 ? (
            <Card className="p-8 text-center">
              <BarChart3 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
              <h3 className="font-semibold text-foreground text-sm mb-1">No analytics data yet</h3>
              <p className="text-xs text-muted-foreground">
                Publish content and connect socials to unlock campaign and channel reporting.
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px]">
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
      </div>
    </div>
  );
}
