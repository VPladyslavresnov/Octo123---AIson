import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Star, Lock, Check, Flame, Gift, Crown, Sparkles } from "lucide-react";
import { Confetti } from "@/components/Confetti";
import { loadSummary, type RewardSummary, type AchievementDef } from "@/lib/rewards";

// Tries the achievement's custom illustration, falling back to its emoji until
// the real art is dropped into /public/rewards/.
function Badge({ def, muted }: { def: AchievementDef; muted?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (def.image && !broken) {
    return (
      <img
        src={def.image}
        alt={def.title}
        onError={() => setBroken(true)}
        className={`w-14 h-14 object-contain ${muted ? "opacity-40 grayscale" : "drop-shadow-[0_4px_10px_rgba(234,67,6,0.35)]"}`}
        draggable={false}
      />
    );
  }
  return <span className={`text-4xl ${muted ? "opacity-40 grayscale" : ""}`}>{def.emoji}</span>;
}

function fmtDate(iso: string | null) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  catch { return ""; }
}

export function RewardsPanel({ userId }: { userId: string | null }) {
  const [summary, setSummary] = useState<RewardSummary | null>(null);
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const refresh = () => { loadSummary(userId).then((s) => { if (alive) setSummary(s); }); };
    refresh();

    const onUpdate = () => refresh();
    const onStar = () => {
      setConfetti(true);
      window.setTimeout(() => setConfetti(false), 100);
      refresh();
    };
    window.addEventListener("aison:stars-updated", onUpdate);
    window.addEventListener("aison:star-earned", onStar);
    return () => {
      alive = false;
      window.removeEventListener("aison:stars-updated", onUpdate);
      window.removeEventListener("aison:star-earned", onStar);
    };
  }, [userId]);

  if (!summary) {
    return <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Loading your stars…</div>;
  }

  const { total, state, achievements, tiers, nextTier } = summary;
  const earnedCount = achievements.filter((a) => a.earned).length;

  return (
    <div className="relative">
      <Confetti fire={confetti} />

      {/* ── Hero: mascot + total stars ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-primary/10 via-card to-card p-8 text-center">
        {/* soft glow */}
        <div className="pointer-events-none absolute inset-0 opacity-40"
             style={{ background: "radial-gradient(60% 60% at 50% 0%, rgba(234,67,6,0.25), transparent 70%)" }} />
        <div className="relative flex flex-col items-center">
          <div className="relative mb-3">
            <div className="absolute inset-0 -z-10 blur-2xl rounded-full bg-primary/30" />
            <img src="/mascot/mascot-wave.png" alt="Aison" draggable={false}
                 className="w-28 h-28 object-contain rp-float drop-shadow-[0_12px_26px_rgba(234,67,6,0.4)]" />
            <div className="absolute -right-1 -top-1 rotate-12"><Star className="w-7 h-7 fill-amber-300 text-amber-300 rp-twinkle" /></div>
            <div className="absolute -left-2 top-6 -rotate-12"><Star className="w-4 h-4 fill-amber-200 text-amber-200 rp-twinkle" style={{ animationDelay: ".6s" }} /></div>
          </div>
          <div className="flex items-center gap-2">
            <Star className="w-8 h-8 fill-amber-300 text-amber-300" />
            <span className="text-5xl font-extrabold text-foreground tabular-nums">{total}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            stars collected · {earnedCount}/{achievements.length} achievements
          </p>

          {/* streak */}
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-1.5 text-sm">
            <Flame className={`w-4 h-4 ${state.currentStreak > 0 ? "text-orange-400" : "text-muted-foreground"}`} />
            <span className="font-medium text-foreground">{state.currentStreak}-day streak</span>
            <span className="text-muted-foreground">· best {state.longestStreak} · +1 ⭐ each day you log in</span>
          </div>
        </div>
      </div>

      {/* ── Reward goals ── */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiers.map(({ tier, reached, remaining }) => {
          const pct = Math.min(100, Math.round((total / tier.threshold) * 100));
          const Icon = tier.threshold >= 100 ? Crown : Gift;
          return (
            <div key={tier.threshold}
                 className={`rounded-2xl border p-4 ${reached ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{tier.emoji} {tier.title}</p>
                  <p className="text-xs text-muted-foreground">Collect {tier.threshold} stars — {tier.blurb}</p>
                </div>
                {reached && <span className="text-xs font-semibold text-primary flex items-center gap-1"><Check className="w-4 h-4" /> Unlocked</span>}
              </div>
              <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-orange-400"
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {reached ? "Reward unlocked 🎉" : <><b className="text-foreground">{remaining}</b> more {remaining === 1 ? "star" : "stars"} to go</>}
              </p>
            </div>
          );
        })}
      </div>

      {nextTier && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          <Sparkles className="inline w-4 h-4 text-primary mr-1" />
          Keep going — you're <b className="text-foreground">{nextTier.threshold - total}</b> stars from <b className="text-foreground">{nextTier.title}</b>!
        </p>
      )}

      {/* ── Achievement grid ── */}
      <h3 className="mt-6 mb-3 text-sm font-semibold text-foreground flex items-center gap-2">
        <Star className="w-4 h-4 text-amber-300 fill-amber-300" /> Achievements
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {achievements.map(({ def, earned, earnedAt }, i) => (
          <motion.div
            key={def.key}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className={`relative rounded-2xl border p-4 flex flex-col items-center text-center gap-2 transition-all ${
              earned ? "border-primary/40 bg-gradient-to-b from-primary/5 to-card" : "border-border bg-card/60"
            }`}
          >
            {earned && (
              <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3 h-3 text-primary-foreground" />
              </span>
            )}
            {!earned && (
              <span className="absolute top-2 right-2 text-muted-foreground"><Lock className="w-3.5 h-3.5" /></span>
            )}
            <div className="h-16 flex items-center justify-center"><Badge def={def} muted={!earned} /></div>
            <p className={`text-sm font-semibold ${earned ? "text-foreground" : "text-muted-foreground"}`}>{def.title}</p>
            <p className="text-[11px] leading-snug text-muted-foreground min-h-[28px]">
              {earned ? def.blurb : def.howTo}
            </p>
            <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              earned ? "bg-amber-300/15 text-amber-300" : "bg-muted text-muted-foreground"
            }`}>
              <Star className={`w-3 h-3 ${earned ? "fill-amber-300" : ""}`} /> +{def.stars}
            </div>
            {earned && earnedAt && <p className="text-[10px] text-muted-foreground">Earned {fmtDate(earnedAt)}</p>}
          </motion.div>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Stars are earned automatically as you use AIson. Rewards are applied to your account when you reach each goal.
      </p>

      <style>{`
        @keyframes rp-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes rp-twinkle { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(.6);opacity:.5} }
        .rp-float { animation: rp-float 3.4s ease-in-out infinite; }
        .rp-twinkle { animation: rp-twinkle 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .rp-float,.rp-twinkle{ animation:none } }
      `}</style>
    </div>
  );
}
