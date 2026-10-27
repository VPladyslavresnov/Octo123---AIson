import { CheckCircle2, Loader2, AlertCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StrategyProgressItem } from "@/lib/strategyFlow";

interface StrategyProgressFeedProps {
  title?: string;
  steps: StrategyProgressItem[];
  compact?: boolean;
}

export function StrategyProgressFeed({
  title = "AIson research flow",
  steps,
  compact = false,
}: StrategyProgressFeedProps) {
  if (!steps.length) return null;

  return (
    <div className={cn("rounded-2xl border border-primary/20 bg-card/50 backdrop-blur-md", compact ? "p-4" : "p-5")}>
      <div className="mb-4">
        <p className="text-sm font-semibold text-foreground/80">{title}</p>
        <p className="text-xs text-muted-foreground">
          Showing the backend strategy flow while it prepares the final prompt.
        </p>
      </div>

      <div className="space-y-3">
        {steps.map((step) => {
          const Icon =
            step.state === "done" ? CheckCircle2 : step.state === "running" ? Loader2 : step.state === "error" ? AlertCircle : Circle;

          return (
            <div key={step.id} className="flex items-start gap-3">
              <div className="pt-0.5">
                <Icon
                  className={cn(
                    "w-4 h-4",
                    step.state === "done" && "text-emerald-500",
                    step.state === "running" && "text-primary animate-spin",
                    step.state === "error" && "text-red-500",
                    step.state === "pending" && "text-muted-foreground/40",
                  )}
                />
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm",
                    step.state === "pending" ? "text-muted-foreground/60" : "text-foreground/80",
                  )}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
