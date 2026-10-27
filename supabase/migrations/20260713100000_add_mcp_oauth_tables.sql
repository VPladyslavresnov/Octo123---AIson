-- MCP connector OAuth 2.1 storage (codes + tokens), service-role access only.
CREATE TABLE public.mcp_oauth_codes (
  code TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  redirect_uri TEXT,
  code_challenge TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.mcp_oauth_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on with no policies: only the service-role key (edge function) can touch these.
ALTER TABLE public.mcp_oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;
