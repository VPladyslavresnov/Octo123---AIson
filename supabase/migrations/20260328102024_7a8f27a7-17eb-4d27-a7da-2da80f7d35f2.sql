-- Fix the security definer view issue
DROP VIEW IF EXISTS public.social_connections_safe;

CREATE VIEW public.social_connections_safe
WITH (security_invoker = true) AS
SELECT id, user_id, platform, account_name, auto_publish, default_schedule, connected_at
FROM public.social_connections;