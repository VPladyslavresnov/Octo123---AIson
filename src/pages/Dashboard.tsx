import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Megaphone,
  CalendarClock,
  FileText,
  Clock,
  Wifi,
  Heart,
  CheckCircle2,
  Circle,
  ArrowRight,
  Brain,
  TrendingUp,
  Send,
  BarChart3,
} from "lucide-react";
import { useBrandIntelligence } from "@/hooks/useBrandIntelligence";

interface CampaignSummary {
  id: string;
  objective: string | null;
  status: string | null;
  created_at: string | null;
  tone: string | null;
  channels: string[] | null;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [profileName, setProfileName] = useState<string>("");
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [commandInput, setCommandInput] = useState("");
  const [metrics, setMetrics] = useState({
    totalCreatives: 0,
    scheduledPosts: 0,
    channelsConnected: 0,
    savedToLibrary: 0,
  });
  const [checklist, setChecklist] = useState({
    hasAccount: true,
    hasCompanyDetails: false,
    hasCreatives: false,
    hasCampaign: false,
  });
  const [loading, setLoading] = useState(true);

  const { brandProfile, loadExistingProfile } = useBrandIntelligence();

  useEffect(() => {
    loadDashboard();
    loadExistingProfile();
  }, []);

  const loadDashboard = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    const userId = session.user.id;

    const [profileRes, campaignsRes, creativesRes, scheduledRes, connectionsRes, savedRes, companyRes] =
      await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", userId).single(),
        supabase.from("campaigns").select("id, objective, status, created_at, tone, channels").eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
        supabase.from("creatives").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("social_connections_safe" as any).select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("creatives").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("saved", true),
        supabase.from("company_details").select("id").eq("user_id", userId).maybeSingle(),
      ]);

    setProfileName(profileRes.data?.full_name || session.user.email?.split("@")[0] || "");
    setCampaigns(campaignsRes.data || []);

    const totalCreatives = creativesRes.count ?? 0;
    const hasCampaigns = (campaignsRes.data?.length ?? 0) > 0;

    setMetrics({
      totalCreatives,
      scheduledPosts: scheduledRes.count ?? 0,
      channelsConnected: connectionsRes.count ?? 0,
      savedToLibrary: savedRes.count ?? 0,
    });

    setChecklist({
      hasAccount: true,
      hasCompanyDetails: !!companyRes.data,
      hasCreatives: totalCreatives > 0,
      hasCampaign: hasCampaigns,
    });

    setLoading(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const statusColor = (status: string | null) => {
    switch (status) {
      case "active":
        return "bg-emerald-500/15 text-emerald-400";
      case "paused":
        return "bg-amber-500/15 text-amber-400";
      case "completed":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-primary/10 text-primary";
    }
  };

  const getCampaignSubtitle = (c: CampaignSummary) => {
    const parts: string[] = [];
    if (c.tone) parts.push(`${c.tone.charAt(0).toUpperCase() + c.tone.slice(1)} tone`);
    if (c.channels?.length) parts.push(c.channels.map(ch => ch.charAt(0).toUpperCase() + ch.slice(1)).join(', '));
    if (parts.length === 0 && c.objective) parts.push(`${c.objective.charAt(0).toUpperCase() + c.objective.slice(1)} campaign`);
    return parts.join(' · ') || 'Campaign';
  };

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    // Route to AI Agent with the command pre-filled
    navigate(`/agent?q=${encodeURIComponent(commandInput.trim())}`);
    setCommandInput("");
  };

  const metricTiles = [
    { label: "Content Generated", value: metrics.totalCreatives, icon: FileText, color: "text-primary" },
    { label: "Scheduled Posts", value: metrics.scheduledPosts, icon: Clock, color: "text-blue-400" },
    { label: "Channels Connected", value: metrics.channelsConnected, icon: Wifi, color: "text-emerald-400" },
    { label: "Saved to Library", value: metrics.savedToLibrary, icon: Heart, color: "text-pink-400" },
  ];

  const quickActions = [
    { label: "Create Content", icon: Sparkles, path: "/content-studio", description: "Generate AI-powered marketing content" },
    { label: "Launch Campaign", icon: Megaphone, path: "/campaign/new", description: "Start a new marketing campaign" },
    { label: "View Schedule", icon: CalendarClock, path: "/scheduled", description: "Manage your posting calendar" },
    { label: "View Analytics", icon: BarChart3, path: "/analytics", description: "Check your performance metrics" },
  ];

  const checklistItems = [
    { label: "Create account", done: checklist.hasAccount, path: "/account" },
    { label: "Add company details", done: checklist.hasCompanyDetails, path: "/account" },
    { label: "Generate your first content", done: checklist.hasCreatives, path: "/content-studio" },
    { label: "Start a campaign", done: checklist.hasCampaign, path: "/campaign/new" },
  ];

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
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {getGreeting()}, {profileName || "there"} 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              Your marketing command center. What would you like to do today?
            </p>
          </div>

          {/* Conversational Input */}
          <form onSubmit={handleCommand} className="relative mt-4">
            <div className="flex items-center gap-3 p-2 rounded-xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
              <Sparkles className="w-5 h-5 text-primary ml-3 shrink-0" />
              <input
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Create a campaign for my new product launch targeting millennials..."
                className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm py-2"
              />
              <Button type="submit" size="sm" className="shrink-0 gap-2" disabled={!commandInput.trim()}>
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Go</span>
              </Button>
            </div>
          </form>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Metric Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metricTiles.map((m) => (
            <Card key={m.label} className="p-4 space-y-1">
              <div className="flex items-center justify-between">
                <m.icon className={`w-5 h-5 ${m.color}`} />
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-foreground">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </Card>
          ))}
        </section>

        {/* Brand Intelligence */}
        {brandProfile && (
          <Card className="p-5 border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-emerald-500/15 rounded-xl shrink-0">
                <Brain className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-foreground text-sm">Brand Intelligence Active</h3>
                  <button
                    onClick={() => navigate("/account")}
                    className="text-xs text-primary hover:underline"
                  >
                    View details
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {brandProfile.tone_of_voice && (
                    <Badge variant="secondary" className="text-xs">{brandProfile.tone_of_voice}</Badge>
                  )}
                  {brandProfile.visual_style && (
                    <Badge variant="secondary" className="text-xs">{brandProfile.visual_style}</Badge>
                  )}
                  {brandProfile.industry && (
                    <Badge variant="secondary" className="text-xs">{brandProfile.industry}</Badge>
                  )}
                  {brandProfile.content_themes?.slice(0, 2).map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quickActions.map((a) => (
              <Card
                key={a.label}
                onClick={() => navigate(a.path)}
                className="cursor-pointer p-4 hover:border-primary/30 hover:shadow-md transition-all group"
              >
                <a.icon className="w-6 h-6 text-primary mb-2 group-hover:scale-110 transition-transform" />
                <p className="font-medium text-foreground text-sm">{a.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Campaigns + Checklist */}
        <div className="grid lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Campaigns</h2>
            {campaigns.length === 0 ? (
              <Card className="p-6 text-center">
                <Megaphone className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                <h3 className="font-semibold text-foreground text-sm mb-1">No campaigns yet</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Launch your first campaign to start generating content.
                </p>
                <Button size="sm" onClick={() => navigate("/campaign/new")}>
                  Create Campaign
                </Button>
              </Card>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <Card
                    key={c.id}
                    onClick={() => navigate(`/campaign/${c.id}`)}
                    className="p-3 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">
                        {c.objective ? c.objective.charAt(0).toUpperCase() + c.objective.slice(1) : "Untitled Campaign"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{getCampaignSubtitle(c)}</p>
                    </div>
                    <Badge className={statusColor(c.status)}>{c.status || "draft"}</Badge>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Getting Started</h2>
            <Card className="p-4 space-y-3">
              {checklistItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => !item.done && navigate(item.path)}
                  className={`flex items-center gap-3 w-full text-left group ${item.done ? "opacity-60" : ""}`}
                >
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                  )}
                  <span className={`text-sm ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {item.label}
                  </span>
                  {!item.done && <ArrowRight className="w-3.5 h-3.5 ml-auto text-muted-foreground group-hover:text-primary transition-colors" />}
                </button>
              ))}
            </Card>
          </section>
        </div>

        {/* AI Recommendations placeholder */}
        <Card className="p-5 border-primary/10 bg-primary/5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm mb-1">AI Recommendations</h3>
              <p className="text-xs text-muted-foreground">
                Start creating campaigns and content to receive personalized AI-powered recommendations for improving your marketing performance.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
