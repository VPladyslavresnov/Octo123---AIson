import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RichMessage } from "@/components/RichMessage";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBrandIntelligence } from "@/hooks/useBrandIntelligence";
import { presetPrompts } from "@/components/PresetPrompts";
import { buildContentGenerationPrompt } from "@/lib/contentPromptOrchestrator";
import { generateVargVideoInBrowser, getBrowserVargApiKey, getVargErrorMessage } from "@/lib/vargVideoClient";
import { AnimatePresence, motion } from "framer-motion";
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
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
  Wifi,
  X,
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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  imageUrl?: string;
  videoUrl?: string;
  saveType?: "text" | "image" | "video";
  saved?: boolean;
  pending?: boolean;
  statusDetail?: string;
}

const CHAT_SESSION_STORAGE_KEY = "aison-main-page-chat-session-v1";

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
const SAFE_TEXT_MODELS = new Set(["openai/gpt-4o", "openai/gpt-4o-mini", "gpt-4o", "gpt-4o-mini"]);
const SAFE_IMAGE_MODEL = "google/gemini-2.5-flash-image";

type VoiceDraft = {
  prompt: string;
  channel?: string;
  tone?: string;
};

function isCampaignRequest(value: string) {
  const normalized = value.toLowerCase();
  return /\b(campaign)\b/.test(normalized) && /\b(create|launch|start|new|generate)\b/.test(normalized);
}

function isContentGenerationRequest(value: string) {
  const normalized = value.toLowerCase();
  return (
    /\b(create|generate|write|make|draft|design|produce|shoot|render)\b/.test(normalized) &&
    /\b(post|content|caption|ad|visual|image|images|video|reel|clip|photo|photos|picture|pictures|photograph|graphic|poster|banner|thumbnail|mockup|illustration|logo|footage|animation)\b/.test(normalized)
  );
}

function inferCampaignGoal(input: string) {
  const value = input.toLowerCase();
  if (value.includes("lead")) return "leads";
  if (value.includes("sale") || value.includes("conversion")) return "sales";
  if (value.includes("traffic") || value.includes("website") || value.includes("booking")) return "traffic";
  if (value.includes("engagement") || value.includes("community")) return "engagement";
  return "awareness";
}

function inferTone(input: string) {
  const value = input.toLowerCase();
  if (value.includes("premium")) return "premium";
  if (value.includes("playful")) return "playful";
  if (value.includes("bold")) return "bold";
  if (value.includes("educational")) return "educational";
  if (value.includes("casual")) return "casual";
  return "professional";
}

function inferChannel(input: string) {
  const value = input.toLowerCase();
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("facebook") || value.includes("meta")) return "facebook";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("twitter") || value.includes(" x ")) return "twitter";
  return "instagram";
}

function inferContentType(input: string): "text" | "image" | "video" {
  const value = input.toLowerCase();
  if (/\b(video|reel|clip|footage|animation|animate)\b/.test(value)) return "video";
  if (/\b(image|images|visual|graphic|photo|photos|picture|pictures|photograph|shot|poster|banner|thumbnail|mockup|illustration|logo)\b/.test(value)) return "image";
  return "text";
}

function getCampaignName(input: string) {
  return input.replace(/^[^\w]*/, "").slice(0, 80).trim() || "New campaign";
}

function getSafePreferredModel(model?: string | null) {
  if (!model) return undefined;
  return SAFE_TEXT_MODELS.has(model) ? model : undefined;
}

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

function normalizeVoiceText(value: string) {
  return value.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function extractRequestedChannel(input: string) {
  const value = normalizeVoiceText(input);
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("facebook") || value.includes("meta")) return "facebook";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("twitter") || value.includes("x ")) return "twitter";
  return "";
}

function extractRequestedTone(input: string) {
  const value = normalizeVoiceText(input);
  const tones = ["professional", "premium", "playful", "bold", "educational", "casual", "friendly", "authoritative"];
  return tones.find((tone) => value.includes(tone)) || "";
}

function stripSpeechArtifacts(value: string) {
  return value.replace(/[*#`>_-]/g, " ").replace(/\s+/g, " ").trim();
}

function pickPreferredVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((voice) => /en(-|_)?gb/i.test(voice.lang) && /female|libby|sonia|serena|kate|susan|hazel/i.test(voice.name)) ||
    voices.find((voice) => /en(-|_)?gb/i.test(voice.lang)) ||
    voices.find((voice) => /female|samantha|victoria|ava|serena|allison|karen|zira/i.test(voice.name)) ||
    voices.find((voice) => /en(-|_)?(us|gb)/i.test(voice.lang)) ||
    voices[0] ||
    null
  );
}

function buildCompactVargPrompt(args: {
  sourcePrompt: string;
  visualPrompt: string;
  companyDetails?: any;
  brandProfile?: any;
}) {
  const brandName = args.brandProfile?.brand_name || args.companyDetails?.company_name || "the brand";
  const audience = args.brandProfile?.target_audience_signals || args.companyDetails?.target_audience || "social media audience";
  const tone = args.brandProfile?.tone_of_voice || "premium and confident";
  const visualStyle = args.brandProfile?.visual_style || "polished, cinematic, premium social ad style";
  const colors = [
    ...(args.brandProfile?.primary_colors || []),
    ...(args.brandProfile?.secondary_colors || []),
  ].filter(Boolean).slice(0, 5).join(", ");

  return [
    `Create a premium short social video for ${brandName}.`,
    `Goal: ${args.sourcePrompt}`,
    `Audience: ${audience}.`,
    `Tone: ${tone}.`,
    `Visual style: ${visualStyle}.`,
    colors ? `Brand colours: ${colors}.` : "",
    "Format: vertical 9:16, clear motion, product-marketing quality, platform-native pacing.",
    "Show a real promotional concept with dynamic scenes, modern motion design, clean typography, and strong brand presence.",
    "Avoid generic stock-video feel. Keep it polished, cinematic, and ad-ready.",
    `Creative brief: ${args.visualPrompt}`.slice(0, 1200),
  ].filter(Boolean).join("\n");
}

function LoadingDots() {
  return (
    <span className="ml-1 inline-flex items-center gap-1 align-middle">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="h-1.5 w-1.5 rounded-full bg-current opacity-45 animate-bounce"
          style={{ animationDelay: `${dot * 0.16}s` }}
        />
      ))}
    </span>
  );
}

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
  const [companyDetails, setCompanyDetails] = useState<any>(null);
  const [hasActiveWorkspace, setHasActiveWorkspace] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [assistantVoiceMuted, setAssistantVoiceMuted] = useState(false);
  const [lastAudioUrl, setLastAudioUrl] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceModeActive, setVoiceModeActive] = useState(false);
  const [hasSeenSuggestions, setHasSeenSuggestions] = useState(() => {
    try {
      return localStorage.getItem("mainPageHasSeenSuggestions") === "true";
    } catch {
      return false;
    }
  });
  const [pendingVoiceDraft, setPendingVoiceDraft] = useState<VoiceDraft | null>(null);
  // Guided clarification session for a vague image/video request.
  const [creativeSession, setCreativeSession] = useState<
    { kind: "image" | "video"; request: string; answers: { q: string; a: string }[]; lastQuestion: string } | null
  >(null);
  const creativeSessionRef = useRef<typeof creativeSession>(null);
  useEffect(() => { creativeSessionRef.current = creativeSession; }, [creativeSession]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);
  const availableVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const speechTimeoutRef = useRef<number | null>(null);
  const lastSpokenTextRef = useRef("");
  const transcriptRef = useRef("");
  const voiceModeActiveRef = useRef(false);
  const isListeningRef = useRef(false);
  const { brandProfile, loadExistingProfile } = useBrandIntelligence();

  useEffect(() => {
    try {
      localStorage.setItem("mainPageMetrics", JSON.stringify(selectedMetrics));
    } catch {}
  }, [selectedMetrics]);

  useEffect(() => {
    try {
      localStorage.setItem("mainPageHasSeenSuggestions", hasSeenSuggestions ? "true" : "false");
    } catch {}
  }, [hasSeenSuggestions]);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      speechSynthesisRef.current = window.speechSynthesis;
      const loadVoices = () => {
        availableVoicesRef.current = window.speechSynthesis.getVoices();
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
      return () => {
        if (window.speechSynthesis.onvoiceschanged === loadVoices) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  useEffect(() => {
    voiceModeActiveRef.current = voiceModeActive;
  }, [voiceModeActive]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    loadDashboard();
    loadExistingProfile();
  }, []);

  // Proactive greeting for RETURNING users — a warm "welcome back" with options.
  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current || loading || !userId) return;
    const key = `aison_visited_${userId}`;
    let returning = false;
    try { returning = !!localStorage.getItem(key); localStorage.setItem(key, String(Date.now())); } catch { /* ignore */ }
    if (!returning || messages.length > 0) return; // first-timers / mid-conversation: skip
    greetedRef.current = true;
    const name = companyDetails?.company_name ? `, ${companyDetails.company_name}` : "";
    const stat = metrics.totalCreatives > 0 ? ` You've created **${metrics.totalCreatives}** pieces so far.` : "";
    const greeting = `👋 Welcome back${name} — long time no see!${stat}\n\nWhat would you like to do? I can **show your latest stats**, **create a fresh on-brand post**, or **plan a new campaign**. Just tell me — or tap a suggestion below.`;
    setMessages((prev) => (prev.length ? prev : [{ id: crypto.randomUUID(), role: "assistant", content: greeting, timestamp: new Date() }]));
  }, [loading, userId, metrics, companyDetails, messages.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.messages)) return;
      setMessages(
        parsed.messages.map((message: any) => ({
          ...message,
          timestamp: new Date(message.timestamp),
          pending: false,
          statusDetail: "",
        })),
      );
      if (typeof parsed?.hasSeenSuggestions === "boolean") {
        setHasSeenSuggestions(parsed.hasSeenSuggestions);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        CHAT_SESSION_STORAGE_KEY,
        JSON.stringify({
          hasSeenSuggestions,
          messages: messages.map((message) => ({
            ...message,
            timestamp: message.timestamp.toISOString(),
            pending: false,
            statusDetail: "",
          })),
        }),
      );
    } catch {}
  }, [hasSeenSuggestions, messages]);

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
      setUserId(null);
      setCompanyDetails(null);
      setHasActiveWorkspace(false);
      setMetrics({
        totalCreatives: 0,
        scheduledPosts: 0,
        channelsConnected: 0,
        savedToLibrary: 0,
        totalImpressions: 0,
        totalComments: 0,
      });
      setLoading(false);
      return;
    }

    const uid = session.user.id;
    setUserId(uid);

    const [creativesRes, scheduledRes, connectionsRes, savedRes, analyticsRes, companyRes, campaignsRes] = await Promise.all([
      supabase.from("creatives").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("social_connections_safe" as any).select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabase.from("creatives").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("saved", true),
      supabase.from("post_analytics").select("impressions, comments").limit(1000),
      supabase.from("company_details").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", uid),
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
    setCompanyDetails(companyRes.data || null);
    setAssistantVoiceMuted(!(companyRes.data?.assistant_voice_enabled ?? true));
    setHasActiveWorkspace((campaignsRes.count ?? 0) > 0 || Boolean(companyRes.data));
    setLoading(false);
  };

  const extractImageUrl = (content: string): string | null => {
    if (typeof content !== "string") return null;
    const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (markdownMatch) return markdownMatch[1];
    const dataMatch = content.match(/(data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+)/);
    if (dataMatch) return dataMatch[1];
    const urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp|svg))/i);
    if (urlMatch) return urlMatch[1];
    return null;
  };

  const extractVideoUrl = (content: string): string | null => {
    if (typeof content !== "string") return null;
    const urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(?:mp4|webm|mov)(?:\?[^\s"'<>]*)?)/i);
    return urlMatch?.[1] || null;
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const appendAssistantMessage = (content: string) => {
    const message: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      timestamp: new Date(),
      pending: true,
    };
    setMessages((prev) => [...prev, message]);
    return message.id;
  };

  const updateAssistantMessage = (id: string, updater: (message: Message) => Message) => {
    setMessages((prev) => prev.map((message) => (message.id === id ? updater(message) : message)));
  };

  const handleAudioEnded = () => {
    setIsSpeaking(false);
    if (voiceModeActiveRef.current) {
      window.setTimeout(() => {
        if (!isListeningRef.current) startVoiceListening();
      }, 250);
    }
  };

  const playAudioBase64 = (audioBase64: string, audioMimeType = "audio/wav") => {
    if (typeof window === "undefined") return;
    const binary = window.atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: audioMimeType });
    const audioUrl = URL.createObjectURL(blob);

    if (lastAudioUrl) {
      URL.revokeObjectURL(lastAudioUrl);
    }
    setLastAudioUrl(audioUrl);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const audio = new Audio(audioUrl);
    audioPlayerRef.current = audio;
    audio.onplay = () => setIsSpeaking(true);
    audio.onended = handleAudioEnded;
    audio.onerror = () => {
      setIsSpeaking(false);
      toast.error("AI voice playback failed. Text reply is still available.");
    };
    void audio.play().catch(() => {
      setIsSpeaking(false);
      toast.error("AI voice playback was blocked by the browser.");
    });
  };

  const browserSpeakText = (text: string) => {
    if (typeof window === "undefined" || !speechSynthesisRef.current) return;
    const cleanText = stripSpeechArtifacts(text);
    if (!cleanText) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    speechSynthesisRef.current.cancel();
    speechSynthesisRef.current.resume();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = availableVoicesRef.current.length
      ? availableVoicesRef.current
      : speechSynthesisRef.current.getVoices();
    const preferredVoice = pickPreferredVoice(voices);
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 1;
    utterance.pitch = 1.05;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = handleAudioEnded;
    utterance.onerror = () => {
      setIsSpeaking(false);
      toast.error("Voice reply failed in this browser. Text reply is still available.");
    };
    if (speechTimeoutRef.current) {
      window.clearTimeout(speechTimeoutRef.current);
    }
    speechTimeoutRef.current = window.setTimeout(() => {
      speechSynthesisRef.current?.speak(utterance);
    }, 120);
  };

  const speakText = async (text: string) => {
    if (!voiceModeActiveRef.current || assistantVoiceMuted) return;
    const cleanText = stripSpeechArtifacts(text);
    if (!cleanText) return;
    lastSpokenTextRef.current = cleanText;

    if (userId) {
      try {
        const { data, error } = await supabase.functions.invoke("synthesize-assistant-speech", {
          body: {
            text: cleanText,
            voice: companyDetails?.assistant_voice,
            speed: Number(companyDetails?.assistant_voice_speed ?? 1),
          },
        });

        if (!error && data?.audioBase64) {
          playAudioBase64(data.audioBase64, data.audioMimeType || "audio/wav");
          return;
        }
      } catch (error) {
        console.warn("OpenAI TTS fallback to browser voice:", error);
      }
    }

    browserSpeakText(cleanText);
  };

  const setAssistantContent = (
    assistantId: string,
    content: string,
    options?: { imageUrl?: string; videoUrl?: string; speak?: boolean; saveType?: Message["saveType"]; pending?: boolean; statusDetail?: string },
  ) => {
    updateAssistantMessage(assistantId, (message) => ({
      ...message,
      content,
      imageUrl: options?.imageUrl,
      videoUrl: options?.videoUrl,
      saveType: options?.saveType,
      saved: false,
      pending: options?.pending ?? false,
      statusDetail: options?.statusDetail ?? "",
    }));

    if (options?.speak) {
      void speakText(content);
    }
  };

  const saveMessageToLibrary = async (message: Message) => {
    if (message.role !== "assistant") return;
    if (!userId) {
      toast.error("Please sign in before saving to Library.");
      return;
    }

    const contentType = message.saveType || (message.videoUrl ? "video" : message.imageUrl ? "image" : "text");
    const hasContent = contentType === "image"
      ? Boolean(message.imageUrl)
      : contentType === "video"
        ? Boolean(message.videoUrl)
        : Boolean(message.content?.trim());
    if (!hasContent) {
      toast.error("There is no generated content to save yet.");
      return;
    }

    try {
      const creativeData: any = {
        user_id: userId,
        content_type: contentType === "video" ? "short_video" : contentType,
        saved: true,
        generation_metadata: {
          source: "main_page_assistant",
          saved_from_message_id: message.id,
        },
      };

      if (contentType === "image") {
        creativeData.visual_url = message.imageUrl;
        creativeData.caption = message.content && message.content !== "I generated a visual for you." ? message.content : null;
        creativeData.alt_text = "Generated by AIson assistant";
      } else if (contentType === "video") {
        creativeData.visual_url = message.videoUrl;
        creativeData.caption = message.content && !message.content.startsWith("I generated a video") ? message.content : null;
        creativeData.alt_text = "Generated by Varg via AIson assistant";
      } else {
        creativeData.caption = message.content;
      }

      const { error } = await supabase.from("creatives").insert(creativeData);
      if (error) throw error;

      setMessages((prev) => prev.map((item) => item.id === message.id ? { ...item, saved: true } : item));
      toast.success("Saved to Library");
      loadDashboard();
    } catch (error: any) {
      toast.error(error.message || "Failed to save to Library.");
    }
  };

  const askVoiceFollowup = (assistantId: string, prompt: string, draft: VoiceDraft) => {
    setPendingVoiceDraft(draft);
    setAssistantContent(assistantId, prompt, { speak: true });
  };

  const startVoiceListening = () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      toast.error("Voice input is not available in this browser.");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    transcriptRef.current = "";
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onerror = () => {
      setIsListening(false);
      toast.error("Voice input failed. You can still type your command.");
    };
    recognition.onend = () => {
      setIsListening(false);
      const transcript = transcriptRef.current.trim();
      if (voiceModeActive && transcript) {
        transcriptRef.current = "";
        setInput("");
        sendMessage(transcript);
      }
    };
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      transcriptRef.current = transcript;
      setInput(transcript);

      const finalResult = Array.from(event.results).some((result: any) => result.isFinal);
      if (finalResult && transcript) {
        transcriptRef.current = "";
        setInput("");
        try {
          recognition.stop();
        } catch {}
        sendMessage(transcript);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleCampaignFallback = async (msg: string, assistantId: string) => {
    if (!userId) {
      setAssistantContent(
        assistantId,
        "I can help plan the campaign here, but your local session isn’t active right now, so I can’t save it yet. Sign in from the sidebar account menu when you’re ready, and I’ll keep the chat flow on this page.",
        { speak: true },
      );
      return;
    }

    setAssistantContent(assistantId, "Building your campaign, creating the setup, and generating a first sample...", {
      speak: true,
      pending: true,
    });

    const goal = inferCampaignGoal(msg);
    const tone = inferTone(msg);
    const channel = inferChannel(msg);
    const campaignName = getCampaignName(msg);

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        user_id: userId,
        objective: goal,
        tone,
        channels: [channel],
        duration_days: 30,
        posting_cadence_per_week: 4,
        brand_source_url: brandProfile?.source_url || companyDetails?.brand_source_url || companyDetails?.website || null,
        status: "draft",
        content_mix: {
          campaignName,
          goal,
        },
        key_offers_or_topics: [campaignName],
      })
      .select()
      .single();

    if (campaignError || !campaign) throw campaignError || new Error("Campaign creation failed");

    const generation = await supabase.functions.invoke("generate-campaign-content", {
      body: {
        campaignId: campaign.id,
        preferredModel: companyDetails?.preferred_model || undefined,
        batchSize: 1,
        batchIndex: 0,
      },
    });

    if (generation.error) throw generation.error;
    const firstCreative = generation.data?.creatives?.[0];

    setAssistantContent(
      assistantId,
      [
        `Campaign ready. I created **${campaignName}** for **${channel}** with a **${tone}** tone.`,
        firstCreative?.caption ? `\n**First sample**\n${firstCreative.caption}` : "",
        "\nTell me to generate more, change the tone, or refine the angle.",
      ].filter(Boolean).join("\n"),
      { imageUrl: firstCreative?.visual_url || undefined, speak: true, saveType: firstCreative?.visual_url ? "image" : "text" },
    );
    setPendingVoiceDraft(null);

    loadDashboard();
  };

  // Generate an image/video from an already-crafted professional prompt.
  const generateCraftedCreative = async (
    assistantId: string,
    kind: "image" | "video",
    craftedPrompt: string,
    opts: { aspectRatio?: string; duration?: number },
  ) => {
    const brandProfilePayload = brandProfile
      ? {
          brand_name: brandProfile.brand_name,
          tone_of_voice: brandProfile.tone_of_voice,
          visual_style: brandProfile.visual_style,
          content_themes: brandProfile.content_themes,
          hashtags: brandProfile.hashtags,
          primary_colors: brandProfile.primary_colors,
          secondary_colors: brandProfile.secondary_colors,
        }
      : null;
    const fn = kind === "image" ? "generate-image" : "generate-video";
    const response = await supabase.functions.invoke(fn, {
      body: {
        prompt: craftedPrompt,
        companyDetails,
        preferredModel: kind === "image" ? SAFE_IMAGE_MODEL : getSafePreferredModel(companyDetails?.preferred_model),
        aspectRatio: opts.aspectRatio,
        duration: opts.duration,
        brandProfile: brandProfilePayload,
      },
    });
    if (response.error) throw response.error;
    if (response.data?.pending) {
      setAssistantContent(
        assistantId,
        response.data.message || `Generating your ${kind} now — it'll appear in your Library in a minute or two.`,
        { speak: true, pending: true, statusDetail: "Working on it…" },
      );
      window.dispatchEvent(new Event("aison:content-created"));
      loadDashboard();
      return;
    }
    const url = response.data?.url || response.data?.imageUrl || response.data?.videoUrl;
    setAssistantContent(
      assistantId,
      kind === "video" ? "I generated a video for you." : "I generated a visual for you.",
      {
        imageUrl: kind === "image" ? url : undefined,
        videoUrl: kind === "video" ? url : undefined,
        speak: true,
        saveType: kind === "video" ? "video" : "image",
      },
    );
    window.dispatchEvent(new Event("aison:content-created"));
    loadDashboard();
  };

  // Vague image/video request → interview the client one question at a time,
  // then compile a professional prompt (best practices) and generate.
  const runCreativeRefinement = async (
    assistantId: string,
    kind: "image" | "video",
    request: string,
    answers: { q: string; a: string }[],
  ) => {
    const brandProfilePayload = brandProfile
      ? {
          brand_name: brandProfile.brand_name,
          visual_style: brandProfile.visual_style,
          tone_of_voice: brandProfile.tone_of_voice,
          industry: brandProfile.industry,
          primary_colors: brandProfile.primary_colors,
          secondary_colors: brandProfile.secondary_colors,
        }
      : null;

    const { data, error } = await supabase.functions.invoke("refine-creative", {
      body: { kind, request, answers, brandProfile: brandProfilePayload, companyDetails },
    });
    if (error) throw error;

    if (data?.status === "question" && data.question) {
      setCreativeSession({ kind, request, answers, lastQuestion: String(data.question) });
      setAssistantContent(assistantId, String(data.question), { speak: true });
      return;
    }

    // ready → compose + generate
    setCreativeSession(null);
    setAssistantContent(
      assistantId,
      data?.summary ? `Perfect — creating: ${data.summary}` : `Great — creating your ${kind} now…`,
      { speak: true, pending: true, statusDetail: "Composing a professional prompt…" },
    );
    await generateCraftedCreative(assistantId, kind, data?.prompt || request, {
      aspectRatio: data?.aspect_ratio,
      duration: data?.duration,
    });
  };

  const handleContentFallback = async (msg: string, assistantId: string) => {
    if (!userId) {
      setAssistantContent(
        assistantId,
        "I’m staying in chat, but your local session isn’t active right now, so I can’t run generation against your saved workspace yet. Sign in and try again here without leaving the main page.",
        { speak: true },
      );
      return;
    }

    const contentType = inferContentType(msg);
    const safePreferredModel = getSafePreferredModel(companyDetails?.preferred_model);

    if (voiceModeActive && contentType === "text") {
      const requestedChannel = extractRequestedChannel(msg);
      const requestedTone = extractRequestedTone(msg);
      if (!requestedChannel || !requestedTone) {
        askVoiceFollowup(
          assistantId,
          !requestedChannel && !requestedTone
            ? "What channel would you like to use, and what tone of voice should I write in?"
            : !requestedChannel
              ? "Which channel would you like me to create this for?"
              : "What tone of voice would you like me to use?",
          {
            prompt: msg,
            channel: requestedChannel || undefined,
            tone: requestedTone || undefined,
          },
        );
        return;
      }
    }

    setAssistantContent(assistantId, `Generating ${contentType === "text" ? "content" : contentType} for you now...`, {
      speak: true,
      pending: true,
    });

    const promptBundle = await buildContentGenerationPrompt({
      sourcePrompt: msg,
      requestedContentType: contentType,
      companyDetails,
      brandProfile,
      styleSystemPrompt: contentType === "text" ? presetPrompts.promote : "",
    });

    const fn = contentType === "image" ? "generate-image" : contentType === "video" ? "generate-video" : "generate-text";

    let response = await supabase.functions.invoke(fn, {
      body: {
        prompt: contentType === "image" ? promptBundle.visualPrompt : promptBundle.userPrompt,
        systemPrompt: promptBundle.systemPrompt,
        companyDetails,
        preferredModel: contentType === "image" ? SAFE_IMAGE_MODEL : safePreferredModel,
        brandProfile: brandProfile
          ? {
              brand_name: brandProfile.brand_name,
              tone_of_voice: brandProfile.tone_of_voice,
              visual_style: brandProfile.visual_style,
              content_themes: brandProfile.content_themes,
              hashtags: brandProfile.hashtags,
              primary_colors: brandProfile.primary_colors,
              secondary_colors: brandProfile.secondary_colors,
        }
          : null,
      },
    });

    if (response.error && contentType === "text") {
      response = await supabase.functions.invoke("generate-text", {
        body: {
          prompt: promptBundle.userPrompt,
          systemPrompt: promptBundle.systemPrompt,
          companyDetails,
          preferredModel: safePreferredModel,
        },
      });
    }

    if (response.error && contentType === "image") {
      response = await supabase.functions.invoke("generate-image", {
        body: {
          prompt: promptBundle.visualPrompt,
          preferredModel: SAFE_IMAGE_MODEL,
          brandProfile: brandProfile
            ? {
                brand_name: brandProfile.brand_name,
                visual_style: brandProfile.visual_style,
                primary_colors: brandProfile.primary_colors,
                secondary_colors: brandProfile.secondary_colors,
              }
            : null,
        },
      });
    }

    if (response.error) throw response.error;

    // Higgsfield generates images/videos asynchronously (via the bridge) and
    // saves them into the Library when done — the function returns immediately
    // with { pending: true }. Show a friendly status instead of a broken card.
    if (response.data?.pending) {
      setAssistantContent(
        assistantId,
        response.data.message ||
          `Generating your ${contentType} now — it'll appear in your Library in a minute or two.`,
        { speak: true, pending: true, statusDetail: "Working on it…" },
      );
      setPendingVoiceDraft(null);
      loadDashboard();
      return;
    }

    const rawContent = response.data?.content || response.data?.url || response.data?.imageUrl || "The generation completed, but the response was empty.";
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent, null, 2);
    const videoUrl =
      contentType === "video"
        ? response.data?.videoUrl || response.data?.url || extractVideoUrl(content) || undefined
        : undefined;
    const imageUrl =
      contentType === "image"
        ? response.data?.url || response.data?.imageUrl || extractImageUrl(content) || undefined
        : extractImageUrl(content) || undefined;

    setAssistantContent(
      assistantId,
      videoUrl ? "I generated a video for you." : contentType === "image" && imageUrl ? "I generated a visual for you." : content,
      { imageUrl, videoUrl, speak: true, saveType: videoUrl ? "video" : imageUrl ? "image" : contentType === "video" ? "video" : "text" },
    );
    setPendingVoiceDraft(null);

    loadDashboard();
  };

  const handleVoiceToggle = () => {
    if (voiceModeActive) {
      setVoiceModeActive(false);
      setPendingVoiceDraft(null);
      setIsListening(false);
      setIsSpeaking(false);
      transcriptRef.current = "";
      speechSynthesisRef.current?.cancel();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      return;
    }

    setVoiceModeActive(true);
    speechSynthesisRef.current?.resume();
    availableVoicesRef.current = speechSynthesisRef.current?.getVoices() || availableVoicesRef.current;
    startVoiceListening();
  };

  const resolvePendingVoiceDraft = (msg: string) => {
    if (!pendingVoiceDraft) return null;
    const channel = pendingVoiceDraft.channel || extractRequestedChannel(msg) || inferChannel(msg);
    const tone = pendingVoiceDraft.tone || extractRequestedTone(msg) || inferTone(msg);
    return {
      prompt: `${pendingVoiceDraft.prompt}${channel ? ` for ${channel}` : ""}${tone ? ` in a ${tone} tone` : ""}`,
      channel,
      tone,
    };
  };

  const markInteracted = () => {
    if (!hasSeenSuggestions) {
      setHasSeenSuggestions(true);
    }
  };

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;

    markInteracted();

    const resolvedVoiceDraft = resolvePendingVoiceDraft(msg);
    const effectiveMessage = resolvedVoiceDraft?.prompt || msg;
    if (resolvedVoiceDraft) {
      setPendingVoiceDraft(null);
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: effectiveMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const assistantId = appendAssistantMessage("Thinking...");

      // If we're mid-interview for a vague image/video request, this message is
      // the answer to the last question — continue refining.
      const activeSession = creativeSessionRef.current;
      if (activeSession) {
        const nextAnswers = [...activeSession.answers, { q: activeSession.lastQuestion, a: effectiveMessage }];
        await runCreativeRefinement(assistantId, activeSession.kind, activeSession.request, nextAnswers);
        return;
      }

      // An explicit image/video creative request wins over the campaign keyword
      // (e.g. "generate image for marketing campaign" should make an image).
      const explicitCreativeType = isContentGenerationRequest(effectiveMessage)
        ? inferContentType(effectiveMessage)
        : "text";
      if ((explicitCreativeType === "image" || explicitCreativeType === "video") && userId) {
        await runCreativeRefinement(assistantId, explicitCreativeType, effectiveMessage, []);
        return;
      }

      if (isCampaignRequest(effectiveMessage)) {
        await handleCampaignFallback(effectiveMessage, assistantId);
        return;
      }

      if (isContentGenerationRequest(effectiveMessage)) {
        await handleContentFallback(effectiveMessage, assistantId);
        return;
      }

      if (!userId) {
         setAssistantContent(
          assistantId,
          "I’m keeping the conversation here, but I need an active local session before I can run workspace actions. Once you’re signed in, ask the same thing again and I’ll continue in this chat.",
          { speak: true },
        );
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

      const rawPayload = res.data?.content ?? res.data?.reply ?? res.data?.response ?? "Something went wrong. Please try again.";
      const content = typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload, null, 2);
      let cleanedContent = content;
      const variantMatch = typeof content === "string" ? content.match(/<<VARIANTS:(\[.*?\])>>/s) : null;
      if (variantMatch) {
        cleanedContent = content.replace(/<<VARIANTS:.*?>>/s, "").trim();
      }
      if (voiceModeActiveRef.current && !assistantVoiceMuted) {
        const voiceResponse = await supabase.functions.invoke("voice-respond", {
          body: { messages: chatHistory, returnAudio: true },
        });
        const voiceData = voiceResponse.data;
        const voiceText = voiceData?.assistantText || cleanedContent;

        setAssistantContent(assistantId, voiceText, {
          imageUrl: extractImageUrl(voiceText) || undefined,
          videoUrl: extractVideoUrl(voiceText) || undefined,
          saveType: extractVideoUrl(voiceText) ? "video" : extractImageUrl(voiceText) ? "image" : "text",
          speak: false,
        });

        if (voiceData?.audioBase64) {
          lastSpokenTextRef.current = stripSpeechArtifacts(voiceText);
          playAudioBase64(voiceData.audioBase64, voiceData.audioMimeType || "audio/wav");
        } else {
          void speakText(voiceText);
        }
      } else {
        setAssistantContent(assistantId, cleanedContent, {
          imageUrl: extractImageUrl(cleanedContent) || undefined,
          videoUrl: extractVideoUrl(cleanedContent) || undefined,
          saveType: extractVideoUrl(cleanedContent) ? "video" : extractImageUrl(cleanedContent) ? "image" : "text",
          speak: true,
        });
      }
      loadDashboard();
    } catch (error) {
      console.error("Agent error:", error);
      const messageText =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Something went wrong. Please try again.";
      setMessages((prev) => {
        const next = [...prev];
        const lastAssistantIndex = [...next].reverse().findIndex((item) => item.role === "assistant");
        if (lastAssistantIndex >= 0) {
          const index = next.length - 1 - lastAssistantIndex;
          next[index] = {
            ...next[index],
            content: messageText,
            pending: false,
            statusDetail: "",
          };
        }
        return next;
      });
      if (voiceModeActiveRef.current) {
        speakText(messageText);
      }
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
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="min-h-[500px] flex flex-col items-center justify-center text-center pt-2">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-primary/20 bg-primary/10 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
            >
              <Sparkles className="h-6 w-6 text-primary" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mt-6 text-2xl font-bold tracking-tight text-foreground sm:text-4xl"
            >
              What can I help with?
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base"
            >
              I&apos;m your AI marketing agent. Ask me anything — campaigns, content,
              analytics, brand strategy.
            </motion.p>

            <AnimatePresence mode="wait">
              {messages.length === 0 && !hasSeenSuggestions && !hasActiveWorkspace ? (
                <motion.div
                  key="prompts"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-8 grid w-full max-w-4xl gap-2.5 md:grid-cols-2"
                >
                  {suggestions.map((item) => (
                    <button
                      key={item}
                      onClick={() => sendMessage(item)}
                      className="rounded-[16px] border border-border bg-card/70 px-4 py-3 text-left text-base font-medium text-foreground transition-all hover:border-primary/30 hover:bg-card"
                    >
                      {item}
                    </button>
                  ))}
                </motion.div>
              ) : messages.length > 0 ? (
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
                  className="mt-8 w-full max-w-4xl max-h-[280px] overflow-y-auto rounded-[18px] border border-border bg-transparent px-4 py-4 text-left"
                >
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-[18px] px-4 py-3 ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                          {message.role === "assistant" ? (
                            <div className="space-y-2">
                              <div>
                                <RichMessage content={message.content} analyticsQuery={[...messages].reverse().find((mm) => mm.role === "user")?.content} />
                                {message.pending && <LoadingDots />}
                                {message.statusDetail && (
                                  <p className="mt-2 text-xs text-muted-foreground">{message.statusDetail}</p>
                                )}
                              </div>
                              {message.imageUrl && (
                                <img
                                  src={message.imageUrl}
                                  alt="Generated content"
                                  className="max-h-72 w-full rounded-xl border border-border object-contain bg-background/30"
                                />
                              )}
                              {message.videoUrl && (
                                <video
                                  src={message.videoUrl}
                                  controls
                                  playsInline
                                  className="max-h-72 w-full rounded-xl border border-border bg-background/30"
                                />
                              )}
                              <div className="flex justify-end gap-2">
                                {message.saveType && (
                                  <Button
                                    size="sm"
                                    variant={message.saved ? "secondary" : "outline"}
                                    onClick={() => saveMessageToLibrary(message)}
                                    disabled={message.saved}
                                    className="h-8 gap-1.5"
                                  >
                                    <Heart className={message.saved ? "h-3.5 w-3.5 fill-current" : "h-3.5 w-3.5"} />
                                    {message.saved ? "Saved" : "Save"}
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" onClick={() => copyText(message.content, message.id)}>
                                  {copiedId === message.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </Button>
                              </div>
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
              ) : (
                <div className="mt-8 h-[120px] w-full max-w-4xl rounded-[18px] border border-transparent bg-transparent" />
              )}
            </AnimatePresence>

            <div className="relative mt-8 w-full max-w-4xl">
              <p className="mb-2 text-center text-xs text-muted-foreground sm:text-sm">
                {voiceModeActive
                  ? isSpeaking
                    ? "AIson is speaking..."
                    : isListening
                      ? "Listening..."
                      : "Voice mode is on."
                  : "Voice first. Tap the mic inside the box, or type below."}
              </p>
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
                className="w-full min-h-[60px] resize-none rounded-[18px] border border-border bg-card/70 px-4 py-4 pr-28 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
              <Button
                size="icon"
                variant="ghost"
                className={`absolute bottom-3 right-14 h-10 w-10 rounded-[14px] ${voiceModeActive ? "text-primary" : "text-muted-foreground"}`}
                onClick={handleVoiceToggle}
                type="button"
              >
                {voiceModeActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className={`absolute bottom-3 right-24 h-10 w-10 rounded-[14px] ${assistantVoiceMuted ? "text-muted-foreground" : "text-primary"}`}
                onClick={() => setAssistantVoiceMuted((prev) => !prev)}
                type="button"
              >
                {assistantVoiceMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="absolute bottom-3 right-[136px] h-10 w-10 rounded-[14px] text-muted-foreground"
                onClick={() => {
                  if (audioPlayerRef.current && lastAudioUrl) {
                    audioPlayerRef.current.currentTime = 0;
                    void audioPlayerRef.current.play();
                  } else if (lastSpokenTextRef.current) {
                    void speakText(lastSpokenTextRef.current);
                  }
                }}
                type="button"
                disabled={!lastAudioUrl && !lastSpokenTextRef.current}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className="absolute bottom-3 right-3 h-10 w-10 rounded-[14px] bg-primary/75 hover:bg-primary"
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
              {voiceModeActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-background/35 backdrop-blur-[2px]"
                >
                  <div className="pointer-events-auto flex flex-col items-center gap-5">
                    <button
                      onClick={handleVoiceToggle}
                      className="flex h-44 w-44 items-center justify-center rounded-full border border-primary/35 bg-primary/10"
                      type="button"
                    >
                      <motion.div
                        animate={{
                          scale: isListening || isSpeaking ? [1, 1.08, 1] : 1,
                          opacity: isListening || isSpeaking ? [0.8, 1, 0.8] : 0.9,
                        }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                        className="flex h-28 w-28 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_60px_rgba(249,115,22,0.45)]"
                      >
                        <Sparkles className="h-10 w-10" />
                      </motion.div>
                    </button>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">
                        {isSpeaking ? "AIson is replying" : isListening ? "Listening to you" : "Voice mode ready"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        AI-generated voice. OpenAI TTS is used when available, with browser fallback if needed.
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={handleVoiceToggle} type="button">
                      <X className="mr-2 h-4 w-4" />
                      Close voice mode
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showScrollBtn && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="fixed bottom-28 right-8 z-20"
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

          <section className="mt-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-lg">Your Dashboard</h2>
              </div>
              <Popover open={customizeOpen} onOpenChange={setCustomizeOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="text-sm font-medium">
                    <Settings2 className="mr-2 h-4 w-4" />
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

            <div className="grid gap-3 xl:grid-cols-4 md:grid-cols-2">
              {visibleMetrics.map((metric) => {
                const value = metrics[metric.key as keyof typeof metrics];
                return (
                  <Card key={metric.key} className="rounded-[16px] border-border bg-card/70 p-2.5">
                    <div className="flex items-start justify-between">
                      <metric.icon className="h-3.5 w-3.5 text-primary" />
                      <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <p className="mt-2.5 text-lg font-bold text-foreground sm:text-xl">
                      {typeof value === "number" ? value.toLocaleString() : value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{metric.label}</p>
                  </Card>
                );
              })}
            </div>

            <button
              onClick={() => navigate("/account")}
              className="mt-6 flex w-full items-center justify-between gap-4 rounded-[18px] border border-emerald-500/25 bg-emerald-500/5 px-4 py-3.5 text-left transition-colors hover:border-emerald-500/40"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-emerald-500/15 p-2">
                  <Brain className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-base font-semibold text-foreground sm:text-lg">{brandName}</span>
                  <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-xs">
                    {brandTone}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-xs">
                    {brandIndustry}
                  </Badge>
                </div>
              </div>
              <span className="text-sm font-medium text-primary">Details</span>
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MainPage;
