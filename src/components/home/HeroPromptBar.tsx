import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroPromptBarProps {
  onSubmit: (prompt: string) => void;
  isGenerating: boolean;
}

const smartSuggestions = [
  "Promote this week's special offer",
  "Create daily content for my brand",
  "Write a launch campaign for a new product",
  "Generate engaging posts for Instagram",
  "Build a content plan for the next 7 days",
];

const placeholders = [
  "Create a week of on-brand content for my summer offer…",
  "Generate 3 Instagram posts and 1 email for our launch…",
  "Write engaging social content for my café this weekend…",
  "Design a campaign to promote our spring collection…",
];

export function HeroPromptBar({ onSubmit, isGenerating }: HeroPromptBarProps) {
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

  const handleSuggestionClick = (suggestion: string) => {
    setPrompt(suggestion);
    textareaRef.current?.focus();
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [prompt]);

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Main input container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className={cn(
          "relative rounded-2xl border-2 transition-all duration-300",
          "bg-background shadow-medium",
          isFocused
            ? "border-primary/40 shadow-strong ring-4 ring-primary/5"
            : "border-border/60 hover:border-primary/20 hover:shadow-strong"
        )}
      >
        <div className="flex items-end gap-2 p-3 sm:p-4">
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
              "flex-1 resize-none bg-transparent text-foreground text-base sm:text-lg",
              "placeholder:text-muted-foreground/50 placeholder:transition-opacity",
              "focus:outline-none leading-relaxed py-1.5"
            )}
            disabled={isGenerating}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSubmit}
            disabled={!prompt.trim() || isGenerating}
            className={cn(
              "flex-shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-all duration-200",
              prompt.trim() && !isGenerating
                ? "bg-primary text-primary-foreground shadow-lg hover:shadow-xl"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {isGenerating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ArrowUp className="w-5 h-5" />
            )}
          </motion.button>
        </div>

        {/* Generating indicator */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl overflow-hidden"
            >
              <div className="h-full bg-primary/20">
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
      </motion.div>

      {/* Smart suggestions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="flex flex-wrap gap-2 mt-4 justify-center"
      >
        {smartSuggestions.map((suggestion, i) => (
          <motion.button
            key={suggestion}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 + i * 0.08 }}
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleSuggestionClick(suggestion)}
            className={cn(
              "px-3.5 py-2 rounded-full text-sm font-medium transition-all duration-200",
              "bg-background border border-border/60 text-muted-foreground",
              "hover:border-primary/30 hover:text-foreground hover:shadow-sm",
              "cursor-pointer"
            )}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-primary/60" />
              {suggestion}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
