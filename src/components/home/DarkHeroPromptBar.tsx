import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DarkHeroPromptBarProps {
  onSubmit: (prompt: string) => void;
  isGenerating: boolean;
}

const placeholders = [
  "What should AIson work on today?",
  "Create a week of branded content for my launch…",
  "Design an Instagram campaign for summer…",
  "Write engaging posts about our new product…",
];

export function DarkHeroPromptBar({ onSubmit, isGenerating }: DarkHeroPromptBarProps) {
  const [prompt, setPrompt] = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % placeholders.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = () => {
    if (!prompt.trim() || isGenerating) return;
    onSubmit(prompt.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [prompt]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
        className="relative"
      >
        {/* Ambient glow behind the input */}
        <div
          className={cn(
            "absolute -inset-4 rounded-3xl opacity-0 transition-opacity duration-700 blur-2xl",
            isFocused ? "opacity-60" : "opacity-30"
          )}
          style={{
            background: "radial-gradient(ellipse at center, hsla(16, 95%, 47%, 0.25) 0%, transparent 70%)",
          }}
        />

        {/* Input container */}
        <div
          className={cn(
            "relative rounded-2xl border transition-all duration-500",
            "bg-[hsl(222,30%,10%)]/80 backdrop-blur-xl",
            isFocused
              ? "border-[hsl(16,95%,47%)]/40 shadow-[0_0_40px_-10px_hsla(16,95%,47%,0.3)]"
              : "border-[hsl(222,20%,20%)]/60 hover:border-[hsl(16,95%,47%)]/20"
          )}
        >
          <div className="flex items-end gap-3 p-4 sm:p-5">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder={placeholders[placeholderIdx]}
              rows={1}
              className={cn(
                "flex-1 resize-none bg-transparent text-lg sm:text-xl font-light",
                "text-white/90 placeholder:text-white/25 placeholder:transition-opacity",
                "focus:outline-none leading-relaxed py-1"
              )}
              disabled={isGenerating}
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSubmit}
              disabled={!prompt.trim() || isGenerating}
              className={cn(
                "flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300",
                prompt.trim() && !isGenerating
                  ? "bg-[hsl(16,95%,47%)] text-white shadow-[0_0_20px_-4px_hsla(16,95%,47%,0.5)]"
                  : "bg-white/5 text-white/20 cursor-not-allowed"
              )}
            >
              {isGenerating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ArrowUp className="w-5 h-5" />
              )}
            </motion.button>
          </div>

          {/* Progress bar */}
          <AnimatePresence>
            {isGenerating && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-2xl overflow-hidden"
              >
                <div className="h-full bg-white/5">
                  <motion.div
                    className="h-full bg-[hsl(16,95%,47%)]"
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
  );
}
