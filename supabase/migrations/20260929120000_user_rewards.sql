-- Gamification: "Collect Your Stars" loyalty rewards.
-- One row per user holds all reward state:
--   * achievements  – JSON map of one-time achievement key -> ISO earned_at
--   * daily_stars   – running count of stars from daily logins (1 per unique day)
--   * streak fields – login-streak tracking for the 7/30-day milestone stars
-- Total stars = (sum of star values for earned achievements) + daily_stars,
-- computed on the client from the achievement definitions in src/lib/rewards.ts.
CREATE TABLE IF NOT EXISTS public.user_rewards (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  achievements    JSONB   NOT NULL DEFAULT '{}'::jsonb,
  daily_stars     INTEGER NOT NULL DEFAULT 0,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  longest_streak  INTEGER NOT NULL DEFAULT 0,
  last_login_date DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_rewards ENABLE ROW LEVEL SECURITY;

-- Each user can only see and change their own reward row.
CREATE POLICY "Users can view their own rewards"
  ON public.user_rewards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own rewards"
  ON public.user_rewards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rewards"
  ON public.user_rewards FOR UPDATE
  USING (auth.uid() = user_id);
