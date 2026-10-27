-- Runtime-manageable admins.
-- Admin access was previously a hard-coded email allowlist (ADMIN_EMAILS secret,
-- still honoured as the always-on founder fallback). This table lets an existing
-- admin promote any account to admin from the Admin page. The `admin` edge
-- function (service role) is the only writer; authenticated users may read only
-- their OWN row so the client can decide whether to show the Admin area.
CREATE TABLE IF NOT EXISTS public.admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  added_by   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- A user can check whether they themselves are an admin. No INSERT/UPDATE/DELETE
-- policies exist, so only the service-role edge function can grant/revoke.
CREATE POLICY "Users can see their own admin row"
  ON public.admins FOR SELECT
  USING (auth.uid() = user_id);
