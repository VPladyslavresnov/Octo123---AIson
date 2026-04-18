import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ContentTypeSelector, ContentType } from "@/components/ContentTypeSelector";
import { createImageBlock, createVideoBlock } from "@/components/home/parseContentBlocks";
import { PresetPrompts, PresetType, presetPrompts, imagePresetPrompts } from "@/components/PresetPrompts";
import { GeneratedContent } from "@/components/GeneratedContent";
import { FileUpload } from "@/components/FileUpload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sparkles, Calendar, AlertTriangle, ExternalLink, Zap,
  ArrowUp, Loader2, SlidersHorizontal, MessageSquare, Send,
  Wrench, Image, FileText, Hash, MousePointerClick, X
} from "lucide-react";
import { toast } from "sonner";
import { useBrandIntelligence, type BrandProfile } from "@/hooks/useBrandIntelligence";
import { motion, AnimatePresence } from "framer-motion";
import { GenerationFeed, type GeneratedBlock } from "@/components/home/GenerationFeed";
import { parseContentBlocks } from "@/components/home/parseContentBlocks";
import { cn } from "@/lib/utils";
import { createVideoFromImage } from "@/lib/createVideoFromImage";
import { ParticleField } from "@/components/home/ParticleField";

const DEFAULT_MODEL = "openai/gpt-5";

function buildBrandSystemPrompt(profile: BrandProfile): string {
  const lines = [
    `You are an expert social media content creator for ${profile.brand_name || 'this brand'}.`,
    '',
    '⚠️ BRAND GUIDELINES — TREAT AS ABSOLUTE RULES (ZERO DEVIATION):',
    profile.tone_of_voice ? `- Tone of voice: ${profile.tone_of_voice} — EVERY word must match this tone` : '',
    profile.visual_style ? `- Visual style: ${profile.visual_style}` : '',
    profile.key_messages?.length ? `- Key messages (weave into content): ${profile.key_messages.join(', ')}` : '',
    profile.content_themes?.length ? `- Content themes (stay within these): ${profile.content_themes.join(', ')}` : '',
    profile.posting_style ? `- Posting style: ${profile.posting_style}` : '',
    `- Uses emojis: ${profile.emoji_usage ? 'yes — use them' : 'no — NEVER use emojis'}`, '',
    profile.hashtags?.length ? `- REQUIRED HASHTAGS (always include at least 2): ${profile.hashtags.join(' ')}` : '',
    profile.cta_patterns?.length ? `- CTA PATTERNS (use similar phrasing): ${profile.cta_patterns.join(', ')}` : '',
    '',
  ];
  if (profile.content_examples?.length) {
    lines.push('COPY STYLE — study these real examples and mirror the voice exactly:');
    profile.content_examples.slice(0, 3).forEach((ex, i) => lines.push(`${i + 1}. "${ex}"`));
    lines.push('');
  }
  if (profile.target_audience_signals) { lines.push(`TARGET AUDIENCE: ${profile.target_audience_signals}`, ''); }
  const allColors = [...(profile.primary_colors || []), ...(profile.secondary_colors || [])].filter(Boolean).slice(0, 3);
  if (allColors.length) { lines.push(`BRAND COLOURS (reference in visual descriptions): ${allColors.join(', ')}`, ''); }
  lines.push(
    'OUTPUT FORMAT: Return JSON only with these fields:',
    '{ "caption": "...", "hashtags": ["..."], "cta": "...", "visual_direction": "...", "best_posting_time": "...",',
    '  "platform_variant": { "instagram": "...", "linkedin": "...", "twitter": "..." } }'
  );
  return lines.filter(l => l !== '').join('\n');
}

const ContentStudio = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"basic" | "pro">("basic");
  const [contentType, setContentType] = useState<ContentType>("text");
  const [selectedPreset, setSelectedPreset] = useState<PresetType>(null);
  const [prompt, setPrompt] = useState(searchParams.get("prompt") || "");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [companyDetails, setCompanyDetails] = useState<any>(null);
  const [blocks, setBlocks] = useState<GeneratedBlock[]>([]);
  const [fixMode, setFixMode] = useState<null | "choose" | "prompt">(null);
  const [fixTarget, setFixTarget] = useState<string | null>(null);
  const [fixPrompt, setFixPrompt] = useState("");
  const [isFixing, setIsFixing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { brandProfile, loadExistingProfile } = useBrandIntelligence();

  useEffect(() => { loadCompanyDetails(); loadExistingProfile(); }, []);

  const loadCompanyDetails = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.from("company_details").select("*").eq("user_id", session.user.id).single();
      if (!error && data) setCompanyDetails(data);
    } catch {}
  };

  const ensureAuthenticated = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return true;
    toast.error("Please sign in to generate content.");
    navigate("/auth?redirect=/content-studio");
    return false;
  };

  const getInvokeErrorMessage = async (error: unknown, fallback: string) => {
    const response = (error as any)?.context;
    if (response && typeof response.clone === "function" && typeof response.text === "function") {
      const rawBody = await response.clone().text().catch(() => "");
      if (rawBody) {
        try { const parsed = JSON.parse(rawBody); if (typeof parsed?.error === "string" && parsed.error.trim()) return parsed.error; } catch { return rawBody; }
      }
    }
    const message = (error as any)?.message;
    if (typeof message === "string" && message.trim()) return message;
    return fallback;
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("Please enter a prompt"); return; }
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) return;

    setIsLoading(true);
    setBlocks([]);
    try {
      let systemPrompt = selectedPreset ? (contentType === "image" ? imagePresetPrompts[selectedPreset] : presetPrompts[selectedPreset]) : "";
      if (brandProfile) {
        const brandSystemPrompt = buildBrandSystemPrompt(brandProfile);
        systemPrompt = brandSystemPrompt + (systemPrompt ? `\n\nADDITIONAL STYLE: ${systemPrompt}` : '');
      }

      let effectivePrompt = prompt;
      if (contentType === "image" && selectedPreset) {
        const presetText = imagePresetPrompts[selectedPreset];
        if (prompt.trim() === presetText.trim()) {
          const presetLabels = { promote: "promotional", daily: "daily brand", engage: "engaging" };
          effectivePrompt = `Create a ${presetLabels[selectedPreset]} social media image for ${(companyDetails as any)?.company_name || "the brand"}`;
        }
      }

      let functionName = "generate-text";
      if (contentType === "image") functionName = "generate-image";
      if (contentType === "video") functionName = "generate-video";

      const textPromise = supabase.functions.invoke(functionName, {
        body: {
          prompt: effectivePrompt, systemPrompt, file: uploadedFile, companyDetails,
          preferredModel: (companyDetails as any)?.preferred_model || DEFAULT_MODEL,
          brandProfile: brandProfile ? {
            brand_name: brandProfile.brand_name, tone_of_voice: brandProfile.tone_of_voice,
            visual_style: brandProfile.visual_style, content_themes: brandProfile.content_themes,
            hashtags: brandProfile.hashtags,
            primary_colors: brandProfile.primary_colors, secondary_colors: brandProfile.secondary_colors,
          } : null
        }
      });

      const shouldGenerateImage = mode === "basic" && (contentType === "text" || contentType === "video");
      const imagePromise = shouldGenerateImage
        ? supabase.functions.invoke("generate-image", {
            body: {
              prompt: `Create a social media visual for: ${effectivePrompt}${brandProfile?.primary_colors?.length ? `. Use these brand colours prominently: ${[...(brandProfile.primary_colors || []), ...(brandProfile.secondary_colors || [])].filter(Boolean).slice(0, 3).join(', ')}` : ''}`,
              companyDetails, preferredModel: "google/gemini-2.5-flash-image",
              brandProfile: brandProfile ? { brand_name: brandProfile.brand_name, visual_style: brandProfile.visual_style, primary_colors: brandProfile.primary_colors, secondary_colors: brandProfile.secondary_colors } : null,
            }
          }).catch((err) => {
            console.warn("Image generation failed:", err);
            return null;
          })
        : Promise.resolve(null);

      const [textResult, imageResult] = await Promise.all([textPromise, imagePromise]);
      if (textResult.error) throw textResult.error;
      const nextContent = textResult.data?.content ?? textResult.data?.url ?? textResult.data?.imageUrl;
      const responseType = textResult.data?.type; // "video_url" or "script" or undefined
      if (!nextContent || typeof nextContent !== "string") throw new Error("No content was returned.");

      setGeneratedContent(nextContent);

      // If backend returned an actual video URL, show it directly
      if (responseType === "video_url") {
        const parsed = [createVideoBlock(nextContent)];
        // Also add any generated image
        const imageUrl = imageResult?.data?.url || imageResult?.data?.imageUrl;
        if (imageUrl && typeof imageUrl === "string") {
          parsed.push(createImageBlock(imageUrl));
        }
        setBlocks(parsed);
      } else {
        const parsed = parseContentBlocks(nextContent, contentType);
        const imageUrl = imageResult?.data?.url || imageResult?.data?.imageUrl;
        const imageError = imageResult?.error || imageResult?.data?.error;
        if (imageUrl && typeof imageUrl === "string") {
          parsed.unshift(createImageBlock(imageUrl));
          try {
            const videoUrl = await createVideoFromImage(imageUrl, 5, 30);
            parsed.unshift(createVideoBlock(videoUrl));
          } catch {}
        } else if (shouldGenerateImage && imageError) {
          console.warn("Image generation error:", imageError);
          toast("Visual generation unavailable — text content ready", { description: "Image generation credits may be exhausted" });
        }
        setBlocks(parsed);
      }
      toast.success("Content generated!");
    } catch (error: any) {
      const message = await getInvokeErrorMessage(error, "Content generation failed. Please try again.");
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefine = async (refinementPrompt: string) => {
    if (!generatedContent) return;
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) return;
    setIsRefining(true);
    try {
      const fullPrompt = `${prompt}\n\nRefinement request: ${refinementPrompt}`;
      let functionName = "generate-text";
      if (contentType === "image") functionName = "generate-image";
      if (contentType === "video") functionName = "generate-video";
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { prompt: fullPrompt, systemPrompt: selectedPreset ? presetPrompts[selectedPreset] : "",
          previousContent: generatedContent, companyDetails,
          preferredModel: (companyDetails as any)?.preferred_model || DEFAULT_MODEL,
        }
      });
      if (error) throw error;
      const nextContent = data?.content ?? data?.url ?? data?.imageUrl;
      if (!nextContent || typeof nextContent !== "string") throw new Error("No refined content was returned.");
      setGeneratedContent(nextContent);
      setBlocks(parseContentBlocks(nextContent, contentType));
      toast.success("Content refined!");
    } catch (error: any) {
      const message = await getInvokeErrorMessage(error, "Refinement failed. Please try again.");
      toast.error(message);
    } finally {
      setIsRefining(false);
    }
  };

  const fixElementTypes = [
    { key: "image", label: "Image", icon: Image },
    { key: "social", label: "Social Post", icon: FileText },
    { key: "hashtags", label: "Hashtags", icon: Hash },
    { key: "cta", label: "Call to Action", icon: MousePointerClick },
  ];

  const handleFixElement = async () => {
    if (!fixTarget || !fixPrompt.trim()) return;
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) return;

    setIsFixing(true);
    try {
      // Find the existing block to fix
      const typeMap: Record<string, string> = {
        image: "generated-image",
        social: "social-post",
        hashtags: "hashtags",
        cta: "cta",
      };
      const blockType = typeMap[fixTarget];
      const existingBlock = blocks.find(b => b.type === blockType);
      const existingContent = existingBlock?.content || "";

      // Build brand-strict system prompt
      let systemPrompt = "";
      if (brandProfile) {
        systemPrompt = buildBrandSystemPrompt(brandProfile);
        systemPrompt += "\n\nCRITICAL: The brand guidelines above are ABSOLUTE. Every word, color reference, tone choice, and style decision MUST align with the brand profile. Treat it as a bible — zero deviation.";
      }

      if (fixTarget === "image") {
        // Regenerate image
        const brandColors = [
          ...(brandProfile?.primary_colors || []),
          ...(brandProfile?.secondary_colors || []),
        ].filter(Boolean).slice(0, 3);

        const { data, error } = await supabase.functions.invoke("generate-image", {
          body: {
            prompt: `${fixPrompt}${brandColors.length ? `. Use these brand colours prominently: ${brandColors.join(', ')}` : ''}`,
            companyDetails,
            preferredModel: "google/gemini-2.5-flash-image",
            brandProfile: brandProfile ? {
              brand_name: brandProfile.brand_name,
              visual_style: brandProfile.visual_style,
              primary_colors: brandProfile.primary_colors,
              secondary_colors: brandProfile.secondary_colors,
            } : null,
          },
        });

        if (error) throw error;
        const imageUrl = data?.url || data?.imageUrl;
        if (imageUrl && typeof imageUrl === "string") {
          setBlocks(prev => {
            const updated = prev.filter(b => b.type !== "generated-image" && b.type !== "generated-video");
            updated.unshift(createImageBlock(imageUrl));
            return updated;
          });
          // Try video from new image
          try {
            const videoUrl = await createVideoFromImage(imageUrl, 5, 30);
            setBlocks(prev => {
              const updated = prev.filter(b => b.type !== "generated-video");
              updated.unshift(createVideoBlock(videoUrl));
              return updated;
            });
          } catch {}
        }
      } else {
        // Fix text element
        const elementLabel = fixTarget === "social" ? "social media post/caption" : fixTarget === "hashtags" ? "hashtags" : "call to action";
        const fixSystemPrompt = systemPrompt + `\n\nYou are fixing ONLY the ${elementLabel}. Return ONLY the fixed ${elementLabel} text, nothing else. No JSON, no labels, no explanations.`;

        const { data, error } = await supabase.functions.invoke("generate-text", {
          body: {
            prompt: `Current ${elementLabel}: "${existingContent}"\n\nFix instruction: ${fixPrompt}`,
            systemPrompt: fixSystemPrompt,
            companyDetails,
            preferredModel: (companyDetails as any)?.preferred_model || DEFAULT_MODEL,
          },
        });

        if (error) throw error;
        const newContent = data?.content;
        if (newContent && typeof newContent === "string") {
          setBlocks(prev => prev.map(b => b.type === blockType ? { ...b, content: newContent.trim() } : b));
        }
      }

      toast.success(`${fixTarget === "social" ? "Social post" : fixTarget === "hashtags" ? "Hashtags" : fixTarget === "cta" ? "Call to action" : "Image"} updated!`);
      setFixMode(null);
      setFixTarget(null);
      setFixPrompt("");
    } catch (error: any) {
      const message = await getInvokeErrorMessage(error, "Fix failed. Please try again.");
      toast.error(message);
    } finally {
      setIsFixing(false);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [prompt]);

  // ─── BASIC MODE — Dark Chat-Style ──────────────────────────
  if (mode === "basic") {
    const brandName = brandProfile?.brand_name || companyDetails?.company_name || null;
    const brandTone = brandProfile?.tone_of_voice || null;
    const brandLocation = brandProfile?.location || companyDetails?.location || null;

    return (
      <div className="min-h-screen flex flex-col relative bg-background">
        {/* Particle background */}
        <ParticleField />

        {/* Brand context bar */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 flex items-center justify-between px-5 sm:px-8 py-4"
        >
          <div className="flex items-center gap-3">
            {brandName ? (
              <>
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                  {brandName.charAt(0).toUpperCase()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground/80">{brandName}</span>
                  {brandTone && <span className="text-xs text-muted-foreground">· {brandTone}</span>}
                  {brandLocation && <span className="text-xs text-muted-foreground">· {brandLocation}</span>}
                  <div className="w-2 h-2 rounded-full bg-emerald-400 ml-1" />
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-muted-foreground">Content Studio</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setMode("pro")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground/60 border border-border hover:border-border/80 transition-all"
          >
            <SlidersHorizontal className="w-3 h-3" />
            Pro
          </button>
        </motion.div>

        {/* Instruction line */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="relative z-10 text-center text-sm text-muted-foreground/50 font-light mt-2 mb-4"
        >
          Just describe what you want — AIson handles the rest
        </motion.p>

        {/* Main content area — scrollable */}
        <div className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-6 pb-40">
          {/* Empty state — before generation */}
          {blocks.length === 0 && !isLoading && !generatedContent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col items-center justify-center pt-16 sm:pt-24"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Sparkles className="w-7 h-7 text-primary/60" />
              </div>
              <p className="text-muted-foreground/50 text-base font-light mb-8 text-center max-w-sm">
                Tell AIson what you need — social posts, campaigns, visuals — and watch it create.
              </p>

              {/* Quick suggestions */}
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                  "Promote this week's special offer",
                  "Create a behind-the-scenes story",
                  "Announce a new product launch",
                  "Drive weekend bookings",
                ].map((suggestion, i) => (
                  <motion.button
                    key={suggestion}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.08 }}
                    whileHover={{ scale: 1.03, y: -1 }}
                    onClick={() => setPrompt(suggestion)}
                    className="px-3.5 py-2 rounded-full text-xs font-medium text-muted-foreground bg-card/40 border border-border hover:border-primary/30 hover:text-foreground/60 transition-all"
                  >
                    {suggestion}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Generated content feed */}
          <div className="max-w-3xl mx-auto">
            <GenerationFeed
              blocks={blocks}
              isGenerating={isLoading}
              contentType={contentType}
              rawContent={generatedContent}
              darkMode
            />

            {/* Action buttons — after generation */}
            {blocks.length > 0 && !isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-4 mt-8"
              >
                <div className="flex items-center justify-center gap-3">
                  <button className="px-5 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-strong transition-all">
                    Publish now
                  </button>
                  <button
                    onClick={() => navigate("/scheduled")}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground bg-card/40 border border-border hover:border-border/80 hover:text-foreground/70 transition-all"
                  >
                    Schedule
                  </button>
                  <button
                    onClick={() => setFixMode(fixMode ? null : "choose")}
                    className={cn(
                      "px-5 py-2.5 rounded-xl text-sm font-medium border transition-all flex items-center gap-2",
                      fixMode
                        ? "text-primary border-primary/30 bg-primary/10"
                        : "text-muted-foreground bg-card/40 border-border hover:border-border/80 hover:text-foreground/70"
                    )}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Fix
                  </button>
                </div>

                {/* Fix element picker */}
                <AnimatePresence>
                  {fixMode === "choose" && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto" }}
                      exit={{ opacity: 0, y: -8, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-card/60 backdrop-blur-md border border-border rounded-xl p-4">
                        <p className="text-sm text-muted-foreground mb-3 text-center">What do you want to fix?</p>
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {fixElementTypes.map(({ key, label, icon: ElIcon }) => {
                            const blockExists = blocks.some(b => {
                              const typeMap: Record<string, string> = { image: "generated-image", social: "social-post", hashtags: "hashtags", cta: "cta" };
                              return b.type === typeMap[key];
                            });
                            return (
                              <button
                                key={key}
                                disabled={!blockExists}
                                onClick={() => { setFixTarget(key); setFixMode("prompt"); }}
                                className={cn(
                                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                                  blockExists
                                    ? "text-foreground/70 border-border bg-card/40 hover:border-primary/40 hover:text-foreground hover:bg-primary/10"
                                    : "text-muted-foreground/30 border-border/30 bg-transparent cursor-not-allowed"
                                )}
                              >
                                <ElIcon className="w-4 h-4" />
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {fixMode === "prompt" && fixTarget && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto" }}
                      exit={{ opacity: 0, y: -8, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-card/60 backdrop-blur-md border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm text-muted-foreground">
                            Fixing: <span className="text-primary font-semibold">{fixElementTypes.find(e => e.key === fixTarget)?.label}</span>
                          </p>
                          <button
                            onClick={() => { setFixMode("choose"); setFixTarget(null); setFixPrompt(""); }}
                            className="text-muted-foreground hover:text-foreground/60 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={fixPrompt}
                            onChange={e => setFixPrompt(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && fixPrompt.trim()) handleFixElement(); }}
                            placeholder={`Describe how to fix the ${fixElementTypes.find(e => e.key === fixTarget)?.label.toLowerCase()}…`}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground/80 placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
                            disabled={isFixing}
                            autoFocus
                          />
                          <button
                            onClick={handleFixElement}
                            disabled={!fixPrompt.trim() || isFixing}
                            className={cn(
                              "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
                              fixPrompt.trim() && !isFixing
                                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-strong"
                                : "bg-muted text-muted-foreground/30 cursor-not-allowed"
                            )}
                          >
                            {isFixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                            Fix
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>

        {/* Bottom chat-style input bar */}
        <div className="sticky bottom-0 z-30 pointer-events-none -mx-4 sm:-mx-6">
          <div className="pointer-events-auto bg-gradient-to-t from-background via-background/95 to-transparent pt-10 pb-5 px-4 sm:px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="max-w-2xl mx-auto"
            >
              {/* Ambient glow */}
              <div className="absolute inset-x-0 -top-8 h-20 pointer-events-none" style={{
                background: "radial-gradient(ellipse at center bottom, hsl(var(--primary) / 0.08) 0%, transparent 70%)",
              }} />

              <div className={cn(
                "relative rounded-2xl border transition-all duration-500",
                "bg-card/80 backdrop-blur-xl",
                "border-border/50",
                "focus-within:border-primary/30 focus-within:shadow-strong"
              )}>
                <div className="flex items-end gap-3 p-3 sm:p-4">
                  <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
                    }}
                    placeholder="Describe what you want to create…"
                    rows={1}
                    className="flex-1 resize-none bg-transparent text-base text-foreground/80 placeholder:text-muted-foreground/40 focus:outline-none leading-relaxed py-1.5 font-light"
                    disabled={isLoading}
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleGenerate}
                    disabled={!prompt.trim() || isLoading}
                    className={cn(
                      "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
                      prompt.trim() && !isLoading
                        ? "bg-primary text-primary-foreground shadow-strong"
                        : "bg-muted text-muted-foreground/20 cursor-not-allowed"
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </motion.button>
                </div>

                {/* Progress bar */}
                <AnimatePresence>
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-2xl overflow-hidden"
                    >
                      <div className="h-full bg-muted/30">
                        <motion.div
                          className="h-full bg-primary"
                          animate={{ x: ["-100%", "100%"] }}
                          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                          style={{ width: "40%" }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // ─── PROFESSIONAL MODE (unchanged) ─────────────────────────
  return (
    <div className="min-h-screen bg-gradient-light">
      <header className="bg-background border-b border-border shadow-soft sticky top-16 z-10">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-primary rounded-lg">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Content Studio</h1>
            </div>
            <Button onClick={() => navigate("/campaigns")} variant="outline" className="gap-2">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Campaigns</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {!brandProfile && !companyDetails && (
          <Alert className="mb-6 border-primary/30 bg-accent">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-foreground">
              Add your website URL in{" "}
              <button onClick={() => navigate("/account")} className="underline font-semibold hover:opacity-80 inline-flex items-center gap-1">
                Account <ExternalLink className="w-3 h-3" />
              </button>{" "}
              to get on-brand content powered by brand intelligence.
            </AlertDescription>
          </Alert>
        )}
        {brandProfile && (
          <div className="mb-6 bg-success/5 border border-success/20 rounded-xl p-4 flex items-start gap-3">
            <div className="p-1.5 bg-success/10 rounded-lg mt-0.5"><Sparkles className="h-5 w-5 text-success" /></div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Brand profile active — {brandProfile.brand_name || 'Your Brand'}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {brandProfile.tone_of_voice && `${brandProfile.tone_of_voice} tone`}
                {brandProfile.tone_of_voice && brandProfile.visual_style && ' · '}
                {brandProfile.visual_style && `${brandProfile.visual_style} style`}
                {(brandProfile.tone_of_voice || brandProfile.visual_style) && ' · '}
                All generated content will match your brand.
              </p>
            </div>
          </div>
        )}
        {!brandProfile && companyDetails && (
          <Alert className="mb-6 border-primary/30 bg-accent">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-foreground">
              Add your website URL in{" "}
              <button onClick={() => navigate("/account")} className="underline font-semibold hover:opacity-80 inline-flex items-center gap-1">
                Account <ExternalLink className="w-3 h-3" />
              </button>{" "}
              to unlock AI-powered brand intelligence for better content.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-background rounded-2xl p-6 shadow-medium border border-primary/10">
              <h2 className="text-xl font-semibold mb-4 text-foreground">Content Type</h2>
              <ContentTypeSelector selectedType={contentType} onSelectType={(type) => {
                setContentType(type);
                if (type === "image" && selectedPreset) setPrompt(imagePresetPrompts[selectedPreset]);
              }} />
            </div>

            <div className="bg-background rounded-2xl p-6 shadow-medium border border-primary/10">
              <h2 className="text-xl font-semibold mb-4 text-foreground">Style Preset</h2>
              <PresetPrompts selectedPreset={selectedPreset} onSelectPreset={(preset) => {
                setSelectedPreset(preset);
                if (preset && contentType === "image") setPrompt(imagePresetPrompts[preset]);
              }} />
            </div>

            <FileUpload contentType={contentType} onFileSelect={setUploadedFile} />

            <div className="bg-background rounded-2xl p-6 shadow-medium border border-primary/10">
              <h2 className="text-xl font-semibold mb-4 text-foreground">Your Prompt</h2>
              <Textarea placeholder={`Describe the ${contentType} you want to create...`}
                value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-[150px] text-base" />
              <Button onClick={handleGenerate} disabled={isLoading || !prompt.trim()}
                className="w-full mt-4 bg-gradient-primary text-primary-foreground hover:scale-105 transition-all" size="lg">
                {isLoading ? (
                  <><div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />Generating...</>
                ) : (
                  <><Sparkles className="w-5 h-5 mr-2" />Generate Content</>
                )}
              </Button>
            </div>
          </div>

          <div>
            <GeneratedContent content={generatedContent} contentType={contentType}
              isLoading={isLoading} onRefine={handleRefine} isRefining={isRefining} />
          </div>
        </div>

        <div className="flex justify-center mt-10 mb-6">
          <button onClick={() => setMode("basic")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
            <MessageSquare className="w-4 h-4" />
            Switch to Basic Mode
          </button>
        </div>
      </main>
    </div>
  );
};

export default ContentStudio;
