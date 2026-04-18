import { useState } from "react";
import { motion } from "framer-motion";
import {
  Copy, Check, Download, Instagram, Linkedin, Twitter, Mail, Megaphone,
  Hash, MousePointerClick, Image, FileText, Sparkles, Globe, Video, Heart
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GeneratedBlock } from "./GenerationFeed";

const typeConfig: Record<string, { icon: typeof Sparkles; label: string }> = {
  "generated-video": { icon: Video, label: "Generated Video" },
  "generated-image": { icon: Image, label: "Generated Visual" },
  "social-post": { icon: FileText, label: "Social Post" },
  "caption": { icon: Sparkles, label: "Caption" },
  "headline-options": { icon: Megaphone, label: "Headlines" },
  "hashtags": { icon: Hash, label: "Hashtags" },
  "cta": { icon: MousePointerClick, label: "Call to Action" },
  "image-brief": { icon: Image, label: "Visual Brief" },
  "campaign-summary": { icon: FileText, label: "Campaign Summary" },
  "platform-adaptation": { icon: Globe, label: "Platform Version" },
};

const platformIcons: Record<string, typeof Instagram> = {
  instagram: Instagram,
  linkedin: Linkedin,
  twitter: Twitter,
  x: Twitter,
  email: Mail,
};

export function ContentCard({ block, darkMode }: { block: GeneratedBlock; darkMode?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const config = typeConfig[block.type] || typeConfig["social-post"];
  const Icon = config.icon;
  const PlatformIcon = block.platform ? platformIcons[block.platform.toLowerCase()] : null;
  const isMedia = block.type === "generated-image" || block.type === "generated-video";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(block.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadVideo = () => {
    const a = document.createElement("a");
    a.href = block.content;
    a.download = "aison-video.webm";
    a.click();
  };

  const handleSave = async () => {
    if (saved || saving) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to save content");
        return;
      }

      const contentType = block.type === "generated-image" ? "image"
        : block.type === "generated-video" ? "video"
        : "text";

      const { error } = await supabase.from("creatives").insert({
        user_id: session.user.id,
        content_type: contentType,
        saved: true,
        visual_url: isMedia ? block.content : null,
        alt_text: isMedia ? block.title : null,
        caption: isMedia ? null : block.content,
      });
      if (error) throw error;

      setSaved(true);
      toast.success("Saved to library");
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "group relative rounded-2xl border overflow-hidden transition-all duration-300",
        darkMode
          ? "bg-white/[0.04] backdrop-blur-md border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.06]"
          : "bg-background border-border/60 hover:border-primary/20 hover:shadow-medium"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center",
            darkMode ? "bg-[hsl(16,95%,47%)]/15" : "bg-primary/10"
          )}>
            <Icon className={cn("w-3.5 h-3.5", darkMode ? "text-[hsl(16,95%,47%)]" : "text-primary")} />
          </div>
          <span className={cn("text-sm font-semibold", darkMode ? "text-white" : "text-foreground")}>
            {block.title}
          </span>
          {PlatformIcon && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full",
              darkMode ? "bg-white/[0.06]" : "bg-muted"
            )}>
              <PlatformIcon className={cn("w-3 h-3", darkMode ? "text-white/40" : "text-muted-foreground")} />
              <span className={cn("text-[10px] font-medium capitalize", darkMode ? "text-white/40" : "text-muted-foreground")}>
                {block.platform}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Save / Like button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleSave}
            disabled={saved || saving}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
              saved
                ? ""
                : "opacity-0 group-hover:opacity-100",
              darkMode ? "hover:bg-white/[0.08]" : "hover:bg-muted"
            )}
            title={saved ? "Saved to library" : "Save to library"}
          >
            <Heart
              className={cn(
                "w-3.5 h-3.5 transition-colors",
                saved
                  ? "text-[hsl(16,95%,47%)] fill-[hsl(16,95%,47%)]"
                  : darkMode ? "text-white/40" : "text-muted-foreground"
              )}
            />
          </motion.button>
          {block.type === "generated-video" && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleDownloadVideo}
              className={cn(
                "opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-lg flex items-center justify-center",
                darkMode ? "hover:bg-white/[0.08] text-white/40" : "hover:bg-muted text-muted-foreground"
              )}
              title="Download video"
            >
              <Download className="w-3.5 h-3.5" />
            </motion.button>
          )}
          {!isMedia && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleCopy}
              className={cn(
                "opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-lg flex items-center justify-center",
                darkMode ? "hover:bg-white/[0.08]" : "hover:bg-muted"
              )}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className={cn("w-3.5 h-3.5", darkMode ? "text-white/40" : "text-muted-foreground")} />
              )}
            </motion.button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-4 pt-1">
        {block.type === "generated-video" ? (
          <video
            src={block.content}
            controls
            autoPlay
            muted
            loop
            playsInline
            className={cn("w-full rounded-xl max-h-[400px]", darkMode ? "bg-black/30" : "bg-muted/30")}
          />
        ) : block.type === "generated-image" ? (
          <img
            src={block.content}
            alt="Generated visual"
            className={cn("w-full rounded-xl max-h-[400px] object-contain", darkMode ? "bg-black/30" : "bg-muted/30")}
          />
        ) : block.type === "hashtags" ? (
          <div className="flex flex-wrap gap-1.5">
            {block.content.split(/\s+/).filter(t => t.startsWith("#")).map((tag, i) => (
              <span
                key={i}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium",
                  darkMode
                    ? "bg-[hsl(16,95%,47%)]/10 text-[hsl(16,95%,60%)]"
                    : "bg-primary/5 text-primary"
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : block.type === "headline-options" ? (
          <div className="space-y-2">
            {block.content.split("\n").filter(Boolean).map((line, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={cn(
                  "w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5",
                  darkMode ? "bg-[hsl(16,95%,47%)]/15 text-[hsl(16,95%,55%)]" : "bg-primary/10 text-primary"
                )}>
                  {i + 1}
                </span>
                <p className={cn("text-sm leading-relaxed", darkMode ? "text-white/60" : "text-foreground/80")}>
                  {line.replace(/^\d+[\.\)]\s*/, "")}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", darkMode ? "text-white/60" : "text-foreground/80")}>
            {block.content}
          </p>
        )}
      </div>

      {/* Subtle bottom accent */}
      <div className={cn(
        "h-px bg-gradient-to-r from-transparent to-transparent",
        darkMode ? "via-[hsl(16,95%,47%)]/10" : "via-primary/10"
      )} />
    </div>
  );
}
