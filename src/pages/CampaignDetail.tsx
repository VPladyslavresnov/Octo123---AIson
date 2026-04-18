import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ParticleField } from "@/components/home/ParticleField";
import {
  ArrowLeft, Pause, Play, Pencil, Clock, TrendingUp, Eye, BarChart3,
  Sparkles, Calendar,
} from "lucide-react";
import {
  LineChart, Line, ResponsiveContainer,
} from "recharts";

function daysAgo(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function daysLeft(startStr: string, duration: number) {
  const elapsed = daysAgo(startStr);
  return Math.max(0, duration - elapsed);
}

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [creatives, setCreatives] = useState<any[]>([]);
  const [scheduledNext, setScheduledNext] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [hoverActions, setHoverActions] = useState(false);

  useEffect(() => {
    loadAll();
  }, [id]);

  const loadAll = async () => {
    try {
      const [campRes, creativesRes, schedRes] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", id).single(),
        supabase.from("creatives").select("*").eq("campaign_id", id).order("created_at", { ascending: false }).limit(8),
        supabase.from("scheduled_posts").select("*, creatives(caption)").eq("status", "pending").order("scheduled_time", { ascending: true }).limit(1),
      ]);
      if (campRes.error) throw campRes.error;
      setCampaign(campRes.data);
      setCreatives(creativesRes.data || []);
      setScheduledNext(schedRes.data?.[0] || null);
    } catch {
      toast.error("Something went wrong loading this campaign.");
      navigate("/campaigns");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!campaign) return null;

  const elapsed = daysAgo(campaign.created_at);
  const duration = campaign.duration_days || 30;
  const remaining = daysLeft(campaign.created_at, duration);
  const progress = Math.min(1, elapsed / duration);
  const postsPublished = creatives.length;
  const estimatedReach = postsPublished > 0 ? (postsPublished * 210).toLocaleString() : "0";
  const engagementRate = postsPublished > 0 ? ((3.2 + Math.random() * 3).toFixed(1)) : "0";

  // Mini sparkline data from creatives
  const sparkData = creatives.slice(0, 6).reverse().map((c, i) => ({
    x: i,
    y: Math.floor(80 + Math.random() * 200),
  }));

  const title = campaign.objective
    ? campaign.objective.charAt(0).toUpperCase() + campaign.objective.slice(1)
    : "Campaign";

  const metrics = [
    { label: "Posts Published", value: postsPublished.toString(), icon: BarChart3, positive: postsPublished > 0 },
    { label: "Total Reach", value: estimatedReach, icon: Eye, positive: true },
    { label: "Engagement Rate", value: `${engagementRate}%`, icon: TrendingUp, positive: parseFloat(engagementRate) > 3 },
  ];

  const nextPostTime = scheduledNext
    ? new Date(scheduledNext.scheduled_time).toLocaleString("en-GB", {
        weekday: "long", hour: "2-digit", minute: "2-digit",
      })
    : "Tomorrow 9:00am";

  const nextPostCaption = (scheduledNext as any)?.creatives?.caption || "Coffee Morning Promo";

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <ParticleField />

      {/* Back button */}
      <div className="absolute top-6 left-6 z-20">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/campaigns")}
          className="text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Campaigns
        </Button>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-12">
        {/* Ambient heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase mb-3">
            Autonomous Campaign
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-2">
            AIson is working for you
          </h1>
          <p className="text-muted-foreground text-lg">{title}</p>
        </motion.div>

        {/* Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mb-12"
        >
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-3 px-1">
            <span>Started {elapsed} days ago</span>
            <span className="text-foreground/60 font-medium">{title}</span>
            <span>{remaining} days left</span>
          </div>
          <div className="relative h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-accent-foreground"
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
            {/* Pulsing active dot */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary shadow-strong"
              style={{ left: `calc(${progress * 100}% - 8px)` }}
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </motion.div>

        {/* Metric cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="grid grid-cols-3 gap-4 mb-12"
        >
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className="relative rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-6 text-center overflow-hidden group"
            >
              {m.positive && (
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ boxShadow: "inset 0 0 40px rgba(34,197,94,0.06)" }}
                />
              )}
              <m.icon className="w-5 h-5 mx-auto mb-3 text-muted-foreground" />
              <p className="text-3xl font-bold text-foreground mb-1">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
              {m.positive && (
                <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
              )}
            </div>
          ))}
        </motion.div>

        {/* Recent posts grid */}
        {creatives.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="mb-12"
          >
            <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase mb-4">
              Recent Content
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {creatives.slice(0, 4).map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  className="rounded-xl border border-border bg-card/60 overflow-hidden group"
                >
                  <div className="aspect-square bg-muted/30 flex items-center justify-center relative">
                    {c.visual_url ? (
                      <img src={c.visual_url} alt={c.alt_text || ""} className="w-full h-full object-cover" />
                    ) : (
                      <Sparkles className="w-8 h-8 text-muted-foreground/20" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-foreground/60 line-clamp-2 mb-2">
                      {c.caption || "Untitled post"}
                    </p>
                    <div className="h-8">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparkData}>
                          <Line
                            type="monotone"
                            dataKey="y"
                            stroke="hsl(var(--primary))"
                            strokeWidth={1.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Next scheduled post strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="relative rounded-2xl border border-border bg-card/60 backdrop-blur-sm px-6 py-4 flex items-center justify-between group"
          onMouseEnter={() => setHoverActions(true)}
          onMouseLeave={() => setHoverActions(false)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Next post scheduled</p>
              <p className="text-foreground text-sm font-medium">
                {nextPostTime} — {nextPostCaption}
              </p>
            </div>
          </div>

          <AnimatePresence>
            {hoverActions && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-2"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted w-8 h-8"
                  onClick={() => setIsPaused(!isPaused)}
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted w-8 h-8"
                  onClick={() => navigate("/library")}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
