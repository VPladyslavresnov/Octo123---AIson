import { motion, AnimatePresence } from "framer-motion";
import { ContentCard } from "./ContentCard";
import { Sparkles, Loader2 } from "lucide-react";

export interface GeneratedBlock {
  id: string;
  type: "social-post" | "caption" | "headline-options" | "hashtags" | "cta" | "image-brief" | "campaign-summary" | "platform-adaptation" | "generated-image" | "generated-video";
  platform?: string;
  title: string;
  content: string;
  metadata?: Record<string, string>;
}

interface GenerationFeedProps {
  blocks: GeneratedBlock[];
  isGenerating: boolean;
  contentType?: string;
  rawContent?: string | null;
  darkMode?: boolean;
}

export function GenerationFeed({ blocks, isGenerating, contentType, rawContent, darkMode }: GenerationFeedProps) {
  if (!isGenerating && blocks.length === 0 && !rawContent) {
    return null;
  }

  return (
    <div className="w-full max-w-3xl mx-auto mt-10 sm:mt-14">
      {/* Generation active header */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 mb-6"
          >
            <div className="relative">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-[hsl(16,95%,47%)]/15' : 'bg-primary/10'}`}>
                <Loader2 className={`w-4 h-4 animate-spin ${darkMode ? 'text-[hsl(16,95%,47%)]' : 'text-primary'}`} />
              </div>
              <div className={`absolute inset-0 rounded-full animate-ping ${darkMode ? 'bg-[hsl(16,95%,47%)]/20' : 'bg-primary/20'}`} />
            </div>
            <div>
              <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-foreground'}`}>AIson is creating your content…</p>
              <p className={`text-xs ${darkMode ? 'text-white/40' : 'text-muted-foreground'}`}>Generating on-brand assets</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content blocks */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {blocks.map((block, i) => (
            <motion.div
              key={block.id}
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              layout
            >
              <ContentCard block={block} darkMode={darkMode} />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Raw fallback */}
        {!blocks.length && rawContent && !isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border p-6 shadow-sm ${
              darkMode
                ? 'bg-white/[0.04] backdrop-blur-md border-white/[0.06]'
                : 'bg-background border-border/60'
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                darkMode ? 'bg-[hsl(16,95%,47%)]/15' : 'bg-primary/10'
              }`}>
                <Sparkles className={`w-3 h-3 ${darkMode ? 'text-[hsl(16,95%,47%)]' : 'text-primary'}`} />
              </div>
              <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-foreground'}`}>Generated Content</span>
            </div>
            {contentType === "image" ? (
              <img src={rawContent} alt="Generated" className="w-full rounded-xl max-h-[500px] object-contain" />
            ) : (
              <div className={`leading-relaxed whitespace-pre-wrap text-sm ${darkMode ? 'text-white/70' : 'text-foreground/80'}`}>
                {rawContent}
              </div>
            )}
          </motion.div>
        )}

        {/* Loading skeletons */}
        {isGenerating && blocks.length === 0 && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={`skeleton-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.15 }}
                className={`rounded-2xl border p-6 ${
                  darkMode
                    ? 'bg-white/[0.03] border-white/[0.05]'
                    : 'bg-background border-border/40 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-8 h-8 rounded-full animate-pulse ${darkMode ? 'bg-white/[0.06]' : 'bg-muted'}`} />
                  <div className={`h-4 w-32 rounded-full animate-pulse ${darkMode ? 'bg-white/[0.06]' : 'bg-muted'}`} />
                </div>
                <div className="space-y-2.5">
                  <div className={`h-3 w-full rounded-full animate-pulse ${darkMode ? 'bg-white/[0.05]' : 'bg-muted/80'}`} />
                  <div className={`h-3 w-4/5 rounded-full animate-pulse ${darkMode ? 'bg-white/[0.04]' : 'bg-muted/60'}`} />
                  <div className={`h-3 w-3/5 rounded-full animate-pulse ${darkMode ? 'bg-white/[0.03]' : 'bg-muted/40'}`} />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
