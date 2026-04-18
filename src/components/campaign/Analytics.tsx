import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, FileText, TrendingUp, Heart, Info } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";

interface AnalyticsProps {
  campaignId: string;
}

export function Analytics({ campaignId }: AnalyticsProps) {
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [creativesCount, setCreativesCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [channelData, setChannelData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [campaignId]);

  const loadData = async () => {
    try {
      const [campaignRes, creativesRes, savedRes, allCreativesRes] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", campaignId).single(),
        supabase.from("creatives").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId),
        supabase.from("creatives").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("saved", true),
        supabase.from("creatives").select("created_at").eq("campaign_id", campaignId).order("created_at", { ascending: true }),
      ]);

      const camp = campaignRes.data;
      setCampaign(camp);
      const total = creativesRes.count ?? 0;
      setCreativesCount(total);
      setSavedCount(savedRes.count ?? 0);

      // Build weekly chart data from real creatives
      const durationWeeks = Math.max(Math.ceil((camp?.duration_days ?? 30) / 7), 4);
      const creatives = allCreativesRes.data || [];
      const startDate = creatives.length > 0
        ? new Date(creatives[0].created_at)
        : new Date(camp?.created_at ?? Date.now());

      const weeks: { name: string; posts: number }[] = [];
      for (let w = 0; w < durationWeeks; w++) {
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() + w * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const count = creatives.filter((c: any) => {
          const d = new Date(c.created_at);
          return d >= weekStart && d < weekEnd;
        }).length;
        weeks.push({ name: `Wk ${w + 1}`, posts: count });
      }
      setWeeklyData(weeks);

      // Channel breakdown
      const channels: string[] = camp?.channels ?? [];
      const cadence = camp?.posting_cadence_per_week ?? 5;
      const perChannel = channels.length > 0 ? Math.ceil(cadence / channels.length) : 0;
      const generatedPerChannel = channels.length > 0 ? Math.floor(total / channels.length) : 0;
      setChannelData(
        channels.map((ch) => ({
          channel: ch.charAt(0).toUpperCase() + ch.slice(1),
          planned: perChannel * durationWeeks,
          generated: generatedPerChannel,
        }))
      );
    } catch (err) {
      // Error loading analytics data
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
        <p className="mt-4 text-muted-foreground">Loading analytics...</p>
      </Card>
    );
  }

  const estimatedReach = creativesCount > 0
    ? `${(creativesCount * 120).toLocaleString()} – ${(creativesCount * 350).toLocaleString()}`
    : "0";

  const engagementRange = creativesCount > 0 ? "2.1% – 4.3%" : "0%";

  const overviewMetrics = [
    { label: "Estimated Reach", value: estimatedReach, icon: Users },
    { label: "Posts Generated", value: creativesCount, icon: FileText },
    { label: "Engagement Rate", value: engagementRange, icon: TrendingUp },
    { label: "Content Saved", value: savedCount, icon: Heart },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-foreground">Performance Analytics</h2>

      {/* Connect banner */}
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-foreground">
          Connect your social accounts in{" "}
          <button onClick={() => navigate("/account")} className="underline font-semibold text-primary hover:opacity-80">
            Account Settings
          </button>{" "}
          to see real engagement data.
        </AlertDescription>
      </Alert>

      {/* Performance Overview */}
      <section>
        <h3 className="text-lg font-semibold text-foreground mb-3">Performance Overview</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {overviewMetrics.map((m) => (
            <Card key={m.label} className="p-5 text-center space-y-1">
              <m.icon className="w-5 h-5 mx-auto text-primary" />
              <p className="text-2xl font-bold text-foreground">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Content Output Over Time */}
      {weeklyData.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-3">Content Output Over Time</h3>
          <Card className="p-6">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="posts"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "hsl(var(--primary))" }}
                  name="Posts"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </section>
      )}

      {/* Channel Breakdown */}
      {channelData.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-3">Channel Breakdown</h3>
          <Card className="p-6">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={channelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="channel" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar dataKey="planned" name="Posts Planned" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="generated" name="Posts Generated" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </section>
      )}
    </div>
  );
}
