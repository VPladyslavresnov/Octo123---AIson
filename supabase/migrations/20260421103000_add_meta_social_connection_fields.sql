ALTER TABLE public.social_connections
  ADD COLUMN IF NOT EXISTS platform_account_id text,
  ADD COLUMN IF NOT EXISTS page_id text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS scopes text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

DROP VIEW IF EXISTS public.social_connections_safe;

CREATE VIEW public.social_connections_safe AS
SELECT
  id,
  user_id,
  platform,
  account_name,
  platform_account_id,
  page_id,
  auto_publish,
  default_schedule,
  connected_at,
  token_expires_at,
  scopes,
  metadata
FROM public.social_connections;
