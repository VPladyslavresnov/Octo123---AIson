import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { awardAchievement, recordDailyLogin, EVENT_ACHIEVEMENTS } from "@/lib/rewards";

// Headless engine mounted once inside the authenticated app shell. It records the
// daily login (account-created + daily star + streak milestones) and listens for
// the app's "something happened" window events, awarding the matching one-time
// achievement. Celebration toasts fire on any newly-earned star.
export function RewardsEngine() {
  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !cancelled) recordDailyLogin(session.user.id);
    });

    const eventHandlers: Array<[string, () => void]> = Object.entries(EVENT_ACHIEVEMENTS).map(
      ([evt, key]) => {
        const handler = () => {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) awardAchievement(session.user.id, key);
          });
        };
        window.addEventListener(evt, handler);
        return [evt, handler];
      }
    );

    // Celebrate any newly-earned star with a toast.
    const onStar = (e: Event) => {
      const d = (e as CustomEvent).detail as { title: string; blurb: string; stars: number; emoji: string };
      if (!d) return;
      toast.success(`${d.emoji} +${d.stars} ${d.stars === 1 ? "star" : "stars"} — ${d.title}!`, {
        description: d.blurb,
      });
    };
    window.addEventListener("aison:star-earned", onStar);

    return () => {
      cancelled = true;
      eventHandlers.forEach(([evt, h]) => window.removeEventListener(evt, h));
      window.removeEventListener("aison:star-earned", onStar);
    };
  }, []);

  return null;
}
