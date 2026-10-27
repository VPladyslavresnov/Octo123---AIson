import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// "Collect Your Stars" — AIson's loyalty gamification.
//
// A curated (deliberately NOT sprawling) set of one-time achievements plus a
// daily-login star. Stars are modest numbers so the two rewards feel reachable
// but earned:  50 ⭐ → discount,  100 ⭐ → a free month.
//
// State persists per-user in the `user_rewards` table (RLS-protected). If that
// table isn't reachable (e.g. before the migration is applied, or offline in a
// preview) we transparently fall back to localStorage so nothing ever breaks.
// ─────────────────────────────────────────────────────────────────────────────

export interface AchievementDef {
  key: string;
  title: string;
  blurb: string;   // what the user did (shown once earned)
  howTo: string;   // how to earn it (shown while locked)
  stars: number;
  emoji: string;   // fallback visual until custom art is dropped in
  image?: string;  // optional /rewards/<file>.png custom illustration
  accent: string;  // themed colour for the earned card
}

// The full achievement catalogue. Keep this tight — comprehensive, not overwhelming.
export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "welcome",        title: "Welcome Aboard",   blurb: "You created your AIson account.",            howTo: "Create your AIson account.",                 stars: 5,  emoji: "🎉", image: "/rewards/welcome.png",   accent: "#EA4306" },
  { key: "brand_setup",    title: "Brand Builder",    blurb: "You set up your brand & company details.",  howTo: "Complete your brand / company setup.",       stars: 5,  emoji: "🎨", image: "/rewards/brand.png",     accent: "#FF751A" },
  { key: "first_content",  title: "First Creation",   blurb: "You generated your first piece of content.", howTo: "Generate your first post or content.",       stars: 5,  emoji: "✨", image: "/rewards/create.png",    accent: "#FFC24B" },
  { key: "first_campaign", title: "Campaign Launcher", blurb: "You launched your first campaign.",          howTo: "Create your first campaign.",                stars: 5,  emoji: "🚀", image: "/rewards/campaign.png",  accent: "#5B8DEF" },
  { key: "first_analytics", title: "Data Explorer",   blurb: "You opened your Analytics for the first time.", howTo: "Open your Analytics dashboard.",           stars: 5,  emoji: "📊", image: "/rewards/analytics.png", accent: "#A7C4A0" },
  { key: "first_social",   title: "Plugged In",       blurb: "You connected your first social account.",   howTo: "Connect a social account in Connections.",   stars: 5,  emoji: "🔌", image: "/rewards/social.png",    accent: "#E8B4B8" },
  { key: "streak_7",       title: "On a Roll",        blurb: "You logged in 7 days in a row.",             howTo: "Log in 7 days in a row.",                    stars: 10, emoji: "🔥", image: "/rewards/streak7.png",   accent: "#FF751A" },
  { key: "streak_30",      title: "Unstoppable",      blurb: "You logged in 30 days in a row.",            howTo: "Log in 30 days in a row.",                   stars: 20, emoji: "🏆", image: "/rewards/streak30.png",  accent: "#EA4306" },
];

export const ACHIEVEMENT_BY_KEY: Record<string, AchievementDef> =
  Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]));

// Reward tiers unlocked by total stars.
export interface RewardTier {
  threshold: number;
  title: string;
  blurb: string;
  emoji: string;
}
export const REWARD_TIERS: RewardTier[] = [
  { threshold: 50,  title: "20% Discount",  blurb: "A discount on your next month.",  emoji: "🎁" },
  { threshold: 100, title: "One Month Free", blurb: "A full month on the house.",      emoji: "👑" },
];

// Event → achievement mapping. Any component can fire one of these window events
// and the RewardsEngine will award the matching achievement (idempotently).
export const EVENT_ACHIEVEMENTS: Record<string, string> = {
  "aison:content-created": "first_content",
  "aison:analytics-viewed": "first_analytics",
  "aison:campaign-created": "first_campaign",
  "aison:brand-ready": "brand_setup",
  "aison:social-connected": "first_social",
};

export interface RewardState {
  achievements: Record<string, string>; // key -> ISO earned_at
  dailyStars: number;
  currentStreak: number;
  longestStreak: number;
  lastLoginDate: string | null; // YYYY-MM-DD (local)
}

const EMPTY: RewardState = {
  achievements: {},
  dailyStars: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastLoginDate: null,
};

export function totalStars(s: RewardState): number {
  let sum = s.dailyStars;
  for (const key of Object.keys(s.achievements)) sum += ACHIEVEMENT_BY_KEY[key]?.stars ?? 0;
  return sum;
}

// ── local date helpers ───────────────────────────────────────────────────────
function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayDiff(fromStr: string, toStr: string): number {
  const [ay, am, ad] = fromStr.split("-").map(Number);
  const [by, bm, bd] = toStr.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

// ── storage (DB first, localStorage fallback + mirror) ───────────────────────
const lsKey = (uid: string) => `aison_rewards_${uid}`;

function readLocal(uid: string): RewardState {
  try {
    const raw = localStorage.getItem(lsKey(uid));
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...EMPTY };
}
function writeLocal(uid: string, s: RewardState) {
  try { localStorage.setItem(lsKey(uid), JSON.stringify(s)); } catch { /* ignore */ }
}

function fromRow(row: any): RewardState {
  return {
    achievements: (row?.achievements && typeof row.achievements === "object") ? row.achievements : {},
    dailyStars: Number(row?.daily_stars) || 0,
    currentStreak: Number(row?.current_streak) || 0,
    longestStreak: Number(row?.longest_streak) || 0,
    lastLoginDate: row?.last_login_date ?? null,
  };
}

export async function readState(uid: string): Promise<RewardState> {
  try {
    const { data, error } = await supabase
      .from("user_rewards" as any)
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const s = fromRow(data);
      writeLocal(uid, s); // keep the local mirror fresh
      return s;
    }
    // No row yet — seed from any local state we might have.
    return readLocal(uid);
  } catch {
    // Table missing / offline — use the local mirror.
    return readLocal(uid);
  }
}

async function writeState(uid: string, s: RewardState): Promise<void> {
  writeLocal(uid, s); // always mirror locally first
  try {
    await supabase.from("user_rewards" as any).upsert({
      user_id: uid,
      achievements: s.achievements,
      daily_stars: s.dailyStars,
      current_streak: s.currentStreak,
      longest_streak: s.longestStreak,
      last_login_date: s.lastLoginDate,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  } catch { /* stay on local mirror */ }
}

// Serialise all reads/writes per user so rapid-fire events can't double-award.
const chains: Record<string, Promise<unknown>> = {};
function queue<T>(uid: string, fn: (s: RewardState) => Promise<T> | T): Promise<T> {
  const run = async () => {
    const s = await readState(uid);
    return fn(s);
  };
  const prev = chains[uid] ?? Promise.resolve();
  const next = prev.then(run, run);
  chains[uid] = next.catch(() => {});
  return next;
}

// ── celebration ──────────────────────────────────────────────────────────────
function celebrate(def: AchievementDef, dailyStars = 0) {
  try {
    window.dispatchEvent(new CustomEvent("aison:star-earned", {
      detail: { title: def.title, blurb: def.blurb, stars: def.stars, emoji: def.emoji, dailyStars },
    }));
  } catch { /* ignore */ }
}

// ── public API ───────────────────────────────────────────────────────────────

/** Award a one-time achievement if not already earned. Safe to call repeatedly. */
export function awardAchievement(uid: string, key: string): Promise<boolean> {
  const def = ACHIEVEMENT_BY_KEY[key];
  if (!def) return Promise.resolve(false);
  return queue(uid, async (s) => {
    if (s.achievements[key]) return false;
    const next: RewardState = { ...s, achievements: { ...s.achievements, [key]: new Date().toISOString() } };
    await writeState(uid, next);
    celebrate(def);
    window.dispatchEvent(new Event("aison:stars-updated"));
    return true;
  });
}

/**
 * Record a login for today: awards the "welcome" achievement, one daily star per
 * unique day, advances the login streak, and unlocks the 7/30-day streak stars.
 */
export function recordDailyLogin(uid: string): Promise<void> {
  return queue(uid, async (s) => {
    const today = todayStr();
    let next: RewardState = { ...s };
    let changed = false;

    // First-ever login = account created.
    if (!next.achievements["welcome"]) {
      next.achievements = { ...next.achievements, welcome: new Date().toISOString() };
      changed = true;
      celebrate(ACHIEVEMENT_BY_KEY["welcome"]);
    }

    if (next.lastLoginDate !== today) {
      const gap = next.lastLoginDate ? dayDiff(next.lastLoginDate, today) : null;
      next.currentStreak = gap === 1 ? next.currentStreak + 1 : 1;
      next.longestStreak = Math.max(next.longestStreak, next.currentStreak);
      next.dailyStars = next.dailyStars + 1;
      next.lastLoginDate = today;
      changed = true;

      // Streak milestones.
      for (const [days, key] of [[7, "streak_7"], [30, "streak_30"]] as const) {
        if (next.currentStreak >= days && !next.achievements[key]) {
          next.achievements = { ...next.achievements, [key]: new Date().toISOString() };
          celebrate(ACHIEVEMENT_BY_KEY[key]);
        }
      }
    }

    if (changed) {
      await writeState(uid, next);
      window.dispatchEvent(new Event("aison:stars-updated"));
    }
  });
}

// ── view-model for the Rewards UI ────────────────────────────────────────────
export interface RewardSummary {
  total: number;
  state: RewardState;
  achievements: { def: AchievementDef; earned: boolean; earnedAt: string | null }[];
  tiers: { tier: RewardTier; reached: boolean; remaining: number }[];
  nextTier: RewardTier | null;
}

export async function loadSummary(uid: string): Promise<RewardSummary> {
  const state = await readState(uid);
  const total = totalStars(state);
  return {
    total,
    state,
    achievements: ACHIEVEMENTS.map((def) => ({
      def,
      earned: !!state.achievements[def.key],
      earnedAt: state.achievements[def.key] ?? null,
    })),
    tiers: REWARD_TIERS.map((tier) => ({
      tier,
      reached: total >= tier.threshold,
      remaining: Math.max(0, tier.threshold - total),
    })),
    nextTier: REWARD_TIERS.find((t) => total < t.threshold) ?? null,
  };
}
