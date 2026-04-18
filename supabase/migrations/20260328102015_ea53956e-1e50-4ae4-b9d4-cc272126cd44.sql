-- Remove direct client SELECT on api_keys (reads now go through manage-api-keys edge function)
DROP POLICY IF EXISTS "Users can view their own API keys" ON public.api_keys;

-- Remove direct client INSERT on api_keys (writes now go through manage-api-keys edge function)
DROP POLICY IF EXISTS "Users can insert their own API keys" ON public.api_keys;

-- Remove direct client UPDATE on api_keys  
DROP POLICY IF EXISTS "Users can update their own API keys" ON public.api_keys;

-- Keep DELETE policy but also remove it since edge function handles deletion with service role
DROP POLICY IF EXISTS "Users can delete their own API keys" ON public.api_keys;

-- Remove direct client SELECT on social_connections access_token_encrypted
-- We keep the existing policies but will create a view without the token column
-- Actually, the social_connections table needs SELECT for listing connections (without tokens)
-- So we create a security barrier view instead

-- Create a safe view for social connections that excludes the token
CREATE OR REPLACE VIEW public.social_connections_safe AS
SELECT id, user_id, platform, account_name, auto_publish, default_schedule, connected_at
FROM public.social_connections;