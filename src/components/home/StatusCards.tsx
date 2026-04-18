import { motion } from "framer-motion";
import { Calendar, Brain, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusCardsProps {
  hasBrandProfile: boolean;
}

export function StatusCards({ hasBrandProfile }: StatusCardsProps) {
  const cards = [
    {
      icon: Calendar,
      text: "Your Instagram campaign is running — 47 posts scheduled",
      accent: "hsl(16, 95%, 47%)",
    },
    {
      icon: Brain,
      text: hasBrandProfile
        ? "Brand memory active: Friendly tone, Minimalist style"
        : "Brand memory ready — add your brand to activate",
      accent: "hsl(220, 70%, 55%)",
    },
    {
      icon: TrendingUp,
      text: "Last campaign reached 2,400 people",
      accent: "hsl(160, 60%, 45%)",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.9 }}
      className="w-full max-w-3xl mx-auto mt-12 sm:mt-16"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 + i * 0.12 }}
            whileHover={{ y: -2, scale: 1.01 }}
            className={cn(
              "relative rounded-xl p-4 overflow-hidden cursor-default",
              "bg-white/[0.04] backdrop-blur-md",
              "border border-white/[0.06]",
              "hover:border-white/[0.1] transition-all duration-300"
            )}
          >
            {/* Subtle top-left glow */}
            <div
              className="absolute -top-4 -left-4 w-16 h-16 rounded-full blur-2xl opacity-20"
              style={{ background: card.accent }}
            />

            <div className="relative flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${card.accent}15` }}
              >
                <card.icon className="w-4 h-4" style={{ color: card.accent }} />
              </div>
              <p className="text-[13px] leading-snug text-white/50 font-medium">
                {card.text}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
