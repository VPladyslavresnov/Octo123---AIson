import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBrandIntelligence } from "@/hooks/useBrandIntelligence";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  ArrowDown,
  ArrowUpRight,
  BarChart3,
  Brain,
  CalendarClock,
  Check,
  Copy,
  Heart,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Send,
  Settings2,
  Sparkles,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

interface CampaignSummary {
  id: string;
  objective: string | null;
  status: string | null;
  created_at: string | null;
  tone: string | null;
  channels: string[] | null;
}

interface VisualVariant {
  url: string | null;
  style: string;
  script?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  imageUrl?: string;
  variants?: VisualVariant[];
}

const suggestions = [
  "📊 How are my campaigns doing?",
  "🚀 Launch a new campaign",
  "💡 What content worked best?",
  "🎯 Review my brand profile",
  "📅 What's scheduled?",
  "⚙️ Update my target audience",
];

const metricCatalog = [
  { key: "totalCreatives", label: "Content Generated", icon: ImageIcon },
  { key: "scheduledPosts", label: "Scheduled Posts", icon: CalendarClock },
  { key: "channelsConnected", label: "Channels Connected", icon: Wifi },
  { key: "savedToLibrary", label: "Saved to Library", icon: Heart },
  { key: "totalImpressions", label: "Impressions", icon: BarChart3 },
  { key: "totalComments", label: "Comments", icon: MessageSquare },
] as const;

const defaultMetricSelection = ["totalCreatives", "scheduledPosts", "channelsConnected", "savedToLibrary"];

const MainPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [metrics, setMetrics] = useState({
    totalCreatives: 0,
    scheduledPosts: 0,
    channelsConnected: 0,
    savedToLibrary: 0,
    totalImpressions: 0,
    totalComments: 0,
  });
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("mainPageMetrics");
      if (saved) return JSON.parse(saved);
    } catch {}
    return defaultMetricSelection;
  });
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { brandProfile, loadExistingProfile } = useBrandIntelligence();

  useEffect(() => {
    try {
      localStorage.setItem("mainPageMetrics", JSON.stringify(selectedMetrics));
    } catch {}
  }, [selectedMetrics]);

  useEffect(() => {
    loadDashboard();
    loadExistingProfile();
  }, []);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q && userId && messages.length === 0) {
      sendMessage(q);
    }
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const loadDashboard = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const uid = session.user.id;
    setUserId(uid);

    const [creativesRes, scheduledRes, connectionsRes, savedRes, analyticsRes] = await Promise.all([
      supabase.from("creatives").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("social_connections_safe" as any).select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("creatives").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("saved", true),
      supabase.from("post_analytics").select("impressions, comments").limit(1000),
    ]);

    const analytics = analyticsRes.data || [];

    setMetrics({
      totalCreatives: creativesRes.count ?? 0,
      scheduledPosts: scheduledRes.count ?? 0,
      channelsConnected: connectionsRes.count ?? 0,
      savedToLibrary: savedRes.count ?? 0,
      totalImpressions: analytics.reduce((sum, row: any) => sum + (row.impressions || 0), 0),
      totalComments: analytics.reduce((sum, row: any) => sum + (row.comments || 0), 0),
    });
    setLoading(false);
  };

  const extractImageUrl = (content: string): string | null => {
    const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (markdownMatch) return markdownMatch[1];
    const dataMatch = content.match(/(data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+)/);
    if (dataMatch) return dataMatch[1];
    const urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp|svg))/i);
    if (urlMatch) return urlMatch[1];
    return null;
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in");
        navigate("/auth");
        return;
      }

      const chatHistory = [...messages, userMsg].map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const res = await supabase.functions.invoke("agent-chat", {
        body: { messages: chatHistory },
      });

      if (res.error) throw res.error;

      const content = res.data?.content || res.data?.reply || res.data?.response || "Something went wrong. Please try again.";
      let cleanedContent = content;
      let variants: VisualVariant[] | undefined;
      const variantMatch = content.match(/<<VARIANTS:(\[.*?\])>>/s);
      if (variantMatch) {
        try {
          variants = JSON.parse(variantMatch[1]);
          cleanedContent = content.replace(/<<VARIANTS:.*?>>/s, "").trim();
        } catch {}
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: cleanedContent,
        timestamp: new Date(),
        imageUrl: !variants ? (extractImageUrl(cleanedContent) || undefined) : undefined,
        variants,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error("Agent error:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const visibleMetrics = metricCatalog.filter((metric) => selectedMetrics.includes(metric.key));

  const brandTone = brandProfile?.tone_of_voice || "Brand intelligence";
  const brandIndustry = brandProfile?.industry || "Connect your brand profile";
  const brandName = brandProfile?.brand_name || "Brand Intelligence Pending";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading your workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="min-h-[560px] flex flex-col items-center justify-center text-center pt-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-16 h-16 rounded-[22px] border border-primary/20 bg-primary/10 flex items-center justify-center shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
            >
              <Sparkles className="w-8 h-8 text-primary" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mt-8 text-3xl font-bold tracking-tight text-foreground sm:text-5xl"
            >
              What can I help with?
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              I&apos;m your AI marketing agent. Ask me anything — campaigns, content,
              analytics, brand strategy.
            </motion.p>

            <AnimatePresence mode="wait">
              {messages.length === 0 ? (
                <motion.div
                  key="prompts"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-10 grid w-full max-w-5xl gap-3 md:grid-cols-2"
                >
                  {suggestions.map((item) => (
                    <button
                      key={item}
                      onClick={() => sendMessage(item)}
                      className="rounded-[18px] border border-border bg-card/70 px-5 py-4 text-left text-lg font-medium text-foreground transition-all hover:border-primary/30 hover:bg-card"
                    >
                      {item}
                    </button>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  ref={scrollContainerRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    setShowScrollBtn(el.scrollTop + el.clientHeight < el.scrollHeight - 160);
                  }}
                  className="mt-10 w-full max-w-5xl max-h-[320px] overflow-y-auto rounded-[22px] border border-border bg-card/40 px-5 py-5 text-left"
                >
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-[22px] px-5 py-4 ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                          {message.role === "assistant" ? (
                            <div className="space-y-3">
                              <ReactMarkdown className="prose prose-sm max-w-none dark:prose-invert">
                                {message.content}
                              </ReactMarkdown>

                              {message.imageUrl && (
                                <img src={message.imageUrl} alt="Generated result" className="rounded-xl border border-border" />
                              )}

                              {message.variants && message.variants.length > 0 && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  {message.variants.map((variant, index) => (
                                    <div key={`${message.id}-${index}`} className="rounded-xl border border-border p-2 bg-background/60">
                                      {variant.url ? (
                                        <img src={variant.url} alt={variant.style} className="rounded-lg aspect-square object-cover w-full" />
                                      ) : (
                                        <div className="rounded-lg aspect-square bg-muted flex items-center justify-center text-muted-foreground text-sm">
                                          No preview
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between mt-2 gap-2">
                                        <div>
                                          <p className="text-sm font-medium text-foreground">{variant.style}</p>
                                          {variant.script && <p className="text-xs text-muted-foreground line-clamp-2">{variant.script}</p>}
                                        </div>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={() => copyText(variant.url || "", `${message.id}-${index}`)}
                                          disabled={!variant.url}
                                        >
                                          {copiedId === `${message.id}-${index}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!message.variants && (
                                <div className="flex justify-end">
                                  <Button size="icon" variant="ghost" onClick={() => copyText(message.content, message.id)}>
                                    {copiedId === message.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative mt-10 w-full max-w-5xl">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Message AIson..."
                className="w-full min-h-[72px] resize-none rounded-[22px] border border-border bg-card/70 px-5 py-5 pr-20 text-lg text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
              <Button
                size="icon"
                className="absolute bottom-3.5 right-3.5 h-12 w-12 rounded-[16px] bg-primary/75 hover:bg-primary"
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground sm:text-sm">
              AIson can make mistakes. Review important info.
            </p>

            <AnimatePresence>
              {showScrollBtn && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="fixed bottom-32 right-10 z-20"
                >
                  <Button
                    size="icon"
                    variant="secondary"
                    className="rounded-full shadow-lg"
                    onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <section className="mt-8">
            <div className="mb-7 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-xl">Your Dashboard</h2>
              </div>
              <Popover open={customizeOpen} onOpenChange={setCustomizeOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="text-lg font-medium">
                    <Settings2 className="w-5 h-5 mr-2" />
                    Customize
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-medium text-foreground">Visible metrics</h3>
                      <p className="text-xs text-muted-foreground">Pick which cards should stay on the dashboard.</p>
                    </div>
                    <div className="space-y-2">
                      {metricCatalog.map((metric) => (
                        <label key={metric.key} className="flex items-center gap-3 text-sm">
                          <Checkbox
                            checked={selectedMetrics.includes(metric.key)}
                            onCheckedChange={(checked) => {
                              setSelectedMetrics((prev) =>
                                checked ? [...new Set([...prev, metric.key])] : prev.filter((item) => item !== metric.key)
                              );
                            }}
                          />
                          {metric.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
              {visibleMetrics.map((metric) => {
                const value = metrics[metric.key as keyof typeof metrics];
                return (
                  <Card key={metric.key} className="rounded-[20px] border-border bg-card/70 p-5">
                    <div className="flex items-start justify-between">
                      <metric.icon className="w-5 h-5 text-primary" />
                      <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                    </div>
                    <p className="mt-5 text-3xl font-bold text-foreground sm:text-4xl">
                      {typeof value === "number" ? value.toLocaleString() : value}
                    </p>
                    <p className="mt-2 text-base text-muted-foreground sm:text-lg">{metric.label}</p>
                  </Card>
                );
              })}
            </div>

            <button
              onClick={() => navigate("/account")}
              className="mt-8 flex w-full items-center justify-between gap-4 rounded-[20px] border border-emerald-500/25 bg-emerald-500/5 px-5 py-4 text-left transition-colors hover:border-emerald-500/40"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-emerald-500/15 p-2.5">
                  <Brain className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-semibold text-foreground sm:text-xl">{brandName}</span>
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-sm">
                    {brandTone}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-sm">
                    {brandIndustry}
                  </Badge>
                </div>
              </div>
              <span className="text-base font-medium text-primary">Details</span>
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MainPage;
