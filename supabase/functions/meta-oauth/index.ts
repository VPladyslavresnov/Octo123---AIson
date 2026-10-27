import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptSecret } from "../_shared/crypto.ts";

const META_API_VERSION = Deno.env.get("META_API_VERSION") || "v23.0";
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const DEFAULT_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SignedState = {
  userId: string;
  platform: string;
  nonce: string;
  createdAt: number;
  signature: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      return await handleCallback(req);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createAdminClient();
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(jwt);
    if (error || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const platform = body.platform === "facebook" ? "facebook" : "instagram";
    const redirectUri = getRedirectUri(req);
    const state = await signState({
      userId: user.id,
      platform,
      nonce: crypto.randomUUID(),
      createdAt: Date.now(),
    });

    const authUrl = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
    authUrl.searchParams.set("client_id", getRequiredEnv("META_APP_ID"));
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", JSON.stringify(state));
    authUrl.searchParams.set("scope", (Deno.env.get("META_OAUTH_SCOPES") || DEFAULT_SCOPES.join(",")).trim());
    authUrl.searchParams.set("response_type", "code");

    return json({ authUrl: authUrl.toString(), redirectUri });
  } catch (error: any) {
    console.error("Meta OAuth start failed:", error);
    return json({ error: error.message || "Failed to start Meta OAuth" }, 500);
  }
});

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const frontendUrl = Deno.env.get("FRONTEND_URL") || Deno.env.get("APP_URL") || "http://127.0.0.1:8080";

  if (!code || !stateParam) {
    return redirect(`${frontendUrl}/posting?meta=error&reason=missing_code`);
  }

  try {
    const state = JSON.parse(decodeURIComponent(stateParam)) as SignedState;
    const verified = await verifyState(state);
    if (!verified) {
      return redirect(`${frontendUrl}/posting?meta=error&reason=invalid_state`);
    }

    const redirectUri = getRedirectUri(req);
    const shortLivedToken = await exchangeCodeForToken(code, redirectUri);
    const longLivedToken = await exchangeForLongLivedToken(shortLivedToken.access_token);
    const account = await resolveInstagramAccount(longLivedToken.access_token);
    const encryptedToken = await encryptSecret(account.pageAccessToken || longLivedToken.access_token);
    const expiresAt = longLivedToken.expires_in
      ? new Date(Date.now() + longLivedToken.expires_in * 1000).toISOString()
      : null;

    const supabase = createAdminClient();
    const { error } = await supabase.from("social_connections").upsert({
      user_id: state.userId,
      platform: "instagram",
      account_name: account.username || account.pageName || "Instagram Business Account",
      platform_account_id: account.instagramUserId,
      page_id: account.pageId,
      access_token_encrypted: encryptedToken,
      connected_at: new Date().toISOString(),
      token_expires_at: expiresAt,
      scopes: DEFAULT_SCOPES,
      metadata: {
        provider: "meta",
        pageName: account.pageName,
        facebookUserId: account.facebookUserId,
      },
    }, { onConflict: "user_id,platform" });

    if (error) throw error;

    return redirect(`${frontendUrl}/posting?meta=connected`);
  } catch (error: any) {
    console.error("Meta OAuth callback failed:", error);
    return redirect(`${frontendUrl}/posting?meta=error&reason=${encodeURIComponent(error.message || "callback_failed")}`);
  }
}

async function exchangeCodeForToken(code: string, redirectUri: string) {
  const tokenUrl = new URL(`${META_GRAPH_URL}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", getRequiredEnv("META_APP_ID"));
  tokenUrl.searchParams.set("client_secret", getRequiredEnv("META_APP_SECRET"));
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);
  return await graphJson(tokenUrl);
}

async function exchangeForLongLivedToken(accessToken: string) {
  const tokenUrl = new URL(`${META_GRAPH_URL}/oauth/access_token`);
  tokenUrl.searchParams.set("grant_type", "fb_exchange_token");
  tokenUrl.searchParams.set("client_id", getRequiredEnv("META_APP_ID"));
  tokenUrl.searchParams.set("client_secret", getRequiredEnv("META_APP_SECRET"));
  tokenUrl.searchParams.set("fb_exchange_token", accessToken);
  return await graphJson(tokenUrl);
}

async function resolveInstagramAccount(accessToken: string) {
  const accountsUrl = new URL(`${META_GRAPH_URL}/me/accounts`);
  accountsUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username,name}");
  accountsUrl.searchParams.set("access_token", accessToken);

  const accounts = await graphJson(accountsUrl);
  const page = accounts.data?.find((item: any) => item.instagram_business_account?.id);
  if (!page?.instagram_business_account?.id) {
    throw new Error("No Instagram Professional account linked to a Facebook Page was found.");
  }

  return {
    facebookUserId: accounts.id,
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
    instagramUserId: page.instagram_business_account.id,
    username: page.instagram_business_account.username || page.instagram_business_account.name,
  };
}

async function graphJson(url: URL) {
  const response = await fetch(url.toString());
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Meta Graph request failed with ${response.status}`);
  }
  return payload;
}

async function signState(payload: Omit<SignedState, "signature">): Promise<SignedState> {
  const signature = await hmac(JSON.stringify(payload));
  return { ...payload, signature };
}

async function verifyState(state: SignedState): Promise<boolean> {
  if (!state.userId || !state.createdAt || !state.signature) return false;
  if (Date.now() - state.createdAt > 10 * 60 * 1000) return false;
  const expected = await hmac(JSON.stringify({
    userId: state.userId,
    platform: state.platform,
    nonce: state.nonce,
    createdAt: state.createdAt,
  }));
  return timingSafeEqual(expected, state.signature);
}

async function hmac(input: string): Promise<string> {
  const secret = getRequiredEnv("META_APP_SECRET");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function getRedirectUri(req: Request): string {
  return Deno.env.get("META_REDIRECT_URI") || `${new URL(req.url).origin}/functions/v1/meta-oauth`;
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function createAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}
