import { motion } from "framer-motion";
import { Shield, Palette, Zap, Instagram, Linkedin, Twitter, Mail } from "lucide-react";

interface StatusIndicatorsProps {
  hasBrandProfile: boolean;
  isGenerating: boolean;
}

export function StatusIndicators({ hasBrandProfile, isGenerating }: StatusIndicatorsProps) {
  const indicators = [
    ...(hasBrandProfile
      ? [{ icon: Shield, label: "Brand voice active", active: true }]
      : []),
    { icon: Palette, label: "On-brand output", active: true },
    { icon: Zap, label: "Multi-channel ready", active: true },
  ];

  const platforms = [
    { icon: Instagram, label: "Instagram" },
    { icon: Linkedin, label: "LinkedIn" },
    { icon: Twitter, label: "X" },
    { icon: Mail, label: "Email" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.2 }}
      className="w-full max-w-3xl mx-auto mt-10 sm:mt-14"
    >
      {/* Status chips */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
        {indicators.map((ind, i) => (
          <motion.div
            key={ind.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.3 + i * 0.1 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-border/50 shadow-sm"
          >
            <ind.icon className="w-3 h-3 text-primary" />
            <span className="text-[11px] font-medium text-muted-foreground">{ind.label}</span>
            <div className="w-1.5 h-1.5 rounded-full bg-success" />
          </motion.div>
        ))}
      </div>

      {/* Platform readiness */}
      <div className="flex items-center justify-center gap-4">
        <span className="text-[11px] text-muted-foreground/60 font-medium">Ready for</span>
        <div className="flex items-center gap-2">
          {platforms.map((p) => (
            <div
              key={p.label}
              className="w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center"
              title={p.label}
            >
              <p.icon className="w-3.5 h-3.5 text-muted-foreground/60" />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
