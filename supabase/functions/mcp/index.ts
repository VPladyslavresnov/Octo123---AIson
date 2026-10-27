// AIson MCP server with OAuth 2.1 — Supabase Edge Function
// Modeled on the Warmline MCP connector:
// - MCP streamable HTTP (JSON-RPC 2.0 over POST) at the function root
// - OAuth endpoints: /.well-known/*, /register, /authorize, /token
// - Users log in with their AIson (Supabase Auth) email + password.
// Tools create marketing content through Claude and read AIson data
// (brand profile, campaigns, content library, strategy reports).

import { createClient } from "npm:@supabase/supabase-js@2";
import { claudeChatCompletion, hasClaude } from "../_shared/claude.ts";
import { openaiChatCompletion, resolveOpenAIKey } from "../_shared/openai.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const sb = createClient(SB_URL, SB_SERVICE);

const BASE = `${SB_URL}/functions/v1/mcp`;
// The login page lives wherever the AIson app is served (Supabase's gateway
// force-rewrites HTML responses to text/plain, so it can't live here).
const CONNECT_URL = Deno.env.get("MCP_CONNECT_URL") || "http://127.0.0.1:8080/connect.html";

/* ─────────────────── helpers ─────────────────── */

function b64urlOfBytes(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256b64url(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return b64urlOfBytes(new Uint8Array(buf));
}

function randToken(prefix: string) {
  return prefix + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extra },
  });
}

/* ─────────────────── auth ─────────────────── */

async function userIdFromToken(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data: tok } = await sb.from("mcp_oauth_tokens").select("user_id").eq("token", token).eq("kind", "access").limit(1);
  return tok && tok.length ? tok[0].user_id as string : null;
}

function unauthorized(id: unknown = null) {
  return json(
    { jsonrpc: "2.0", id, error: { code: -32001, message: "Unauthorized" } },
    401,
    { "WWW-Authenticate": `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"` },
  );
}

/* ─────────────────── MCP tools ─────────────────── */

const TOOLS = [
  {
    name: "create_content",
    description:
      "Generate on-brand marketing content (caption, hashtags, CTA) with AIson. Uses the user's stored brand profile, company details, and latest marketing strategy as context, and saves the result to the AIson content library unless save=false. Use when the user asks to create a post, caption, ad copy, or other marketing content.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What the content should be about (topic, offer, announcement...)." },
        channel: { type: "string", description: "Target channel: instagram, tiktok, facebook, linkedin, twitter. Default instagram." },
        tone: { type: "string", description: "Tone override: professional, casual, bold, playful... Defaults to the brand's tone." },
        save: { type: "boolean", description: "Save the generated content to the AIson library (default true)." },
        campaign_id: { type: "string", description: "Optional AIson campaign id to attach the content to." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "get_brand_info",
    description:
      "Get the user's AIson brand profile and company details: brand name, description, tone of voice, colors, key messages, content themes, target audience, industry.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_campaigns",
    description: "List the user's AIson marketing campaigns with status, channels, objective, tone and duration.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max campaigns to return (default 10)." } },
    },
  },
  {
    name: "list_content",
    description:
      "List recent content from the user's AIson library (captions, hashtags, type, campaign, creation date).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max items to return (default 10)." },
        content_type: { type: "string", description: "Filter by type: text, image, video, carousel, story." },
      },
    },
  },
  {
    name: "get_strategy",
    description: "Get the user's latest AIson marketing strategy report (title, summary, optimized generation prompt).",
    inputSchema: { type: "object", properties: {} },
  },
];

function ok(text: string) {
  return { content: [{ type: "text", text }] };
}
function err(text: string) {
  return { content: [{ type: "text", text }], isError: true };
}

async function brandContext(userId: string) {
  const [{ data: brand }, { data: company }, { data: strategy }] = await Promise.all([
    sb.from("brand_profiles").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("company_details").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("strategy_reports").select("title,optimized_prompt,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { brand, company, strategy };
}

async function createContent(userId: string, args: Record<string, unknown>) {
  const prompt = String(args?.prompt || "").slice(0, 4000);
  if (!prompt) return err("No prompt provided.");
  const openaiKey = await resolveOpenAIKey(userId);
  if (!hasClaude() && !openaiKey) {
    return err("Content generation is unavailable: no AI provider configured. Add your OpenAI API key in the AIson app (Account → API Keys), or set ANTHROPIC_API_KEY on the backend.");
  }

  const channel = String(args?.channel || "instagram");
  const save = args?.save !== false;
  const { brand, company, strategy } = await brandContext(userId);
  const tone = String(args?.tone || brand?.tone_of_voice || "professional");

  const contextLines = [
    brand ? `Brand: ${brand.brand_name || ""} — ${brand.brand_description || ""}. Tone of voice: ${brand.tone_of_voice || ""}. Key messages: ${(brand.key_messages || []).join("; ")}. Content themes: ${(brand.content_themes || []).join(", ")}. Brand colors: ${(brand.primary_colors || []).join(", ")}. CTA patterns: ${(brand.cta_patterns || []).join("; ")}. Emoji usage: ${brand.emoji_usage ? "yes" : "no"}.` : "",
    company ? `Company: ${company.company_name || ""}. Website: ${company.website || ""}. Target audience: ${company.target_audience || ""}.` : "",
    strategy?.optimized_prompt ? `Current marketing strategy guidance:\n${String(strategy.optimized_prompt).slice(0, 3000)}` : "",
  ].filter(Boolean).join("\n\n");

  const genBody = {
    messages: [
      {
        role: "system",
        content: `You are AIson, an AI marketing content engine. Generate a ${channel} post in a ${tone} tone.\n\n${contextLines}\n\nReturn ONLY valid JSON: {"caption":"...","hashtags":["..."],"cta":"..."}`,
      },
      { role: "user", content: prompt },
    ],
  };
  // Claude when configured on the backend, otherwise the user's OpenAI key.
  const response = hasClaude()
    ? await claudeChatCompletion(genBody)
    : await openaiChatCompletion(openaiKey!, genBody);
  if (!response.ok) return err(`Generation failed (${response.status}).`);
  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content || "";
  let parsed = { caption: "", hashtags: [] as string[], cta: "" };
  try {
    const match = String(raw).match(/\{[\s\S]*\}/);
    if (match) parsed = { ...parsed, ...JSON.parse(match[0]) };
  } catch { /* fall through */ }
  if (!parsed.caption) parsed.caption = String(raw).trim();
  if (!parsed.caption) return err("The model returned no content. Try rephrasing the prompt.");

  let savedNote = "";
  if (save) {
    const { data: row, error } = await sb.from("creatives").insert({
      user_id: userId,
      campaign_id: (args?.campaign_id as string) || null,
      content_type: "text",
      caption: parsed.caption,
      hashtags: parsed.hashtags || [],
      generation_metadata: { source: "mcp", channel, tone, prompt: prompt.slice(0, 500) },
    }).select("id").single();
    savedNote = error ? `\n\n(Warning: could not save to library: ${error.message})` : `\n\nSaved to the AIson library (id ${row.id}).`;
  }

  const hashtags = (parsed.hashtags || []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  return ok(
    `Generated ${channel} content (${tone} tone):\n\n${parsed.caption}` +
      (hashtags ? `\n\n${hashtags}` : "") +
      (parsed.cta ? `\n\nCTA: ${parsed.cta}` : "") +
      savedNote,
  );
}

async function getBrandInfo(userId: string) {
  const { brand, company } = await brandContext(userId);
  if (!brand && !company) {
    return ok("No brand profile or company details yet. Open the AIson app (Account / Onboarding) to set them up.");
  }
  const lines: string[] = [];
  if (brand) {
    lines.push(
      `Brand: ${brand.brand_name || "(unnamed)"}`,
      brand.tagline ? `Tagline: ${brand.tagline}` : "",
      brand.brand_description ? `Description: ${brand.brand_description}` : "",
      brand.tone_of_voice ? `Tone of voice: ${brand.tone_of_voice}` : "",
      brand.industry ? `Industry: ${brand.industry}` : "",
      (brand.primary_colors || []).length ? `Primary colors: ${(brand.primary_colors || []).join(", ")}` : "",
      (brand.key_messages || []).length ? `Key messages: ${(brand.key_messages || []).join("; ")}` : "",
      (brand.content_themes || []).length ? `Content themes: ${(brand.content_themes || []).join(", ")}` : "",
      brand.target_audience_signals ? `Audience signals: ${brand.target_audience_signals}` : "",
    );
  }
  if (company) {
    lines.push(
      `Company: ${company.company_name || "(unnamed)"}`,
      company.website ? `Website: ${company.website}` : "",
      company.target_audience ? `Target audience: ${company.target_audience}` : "",
    );
  }
  return ok(lines.filter(Boolean).join("\n"));
}

async function listCampaigns(userId: string, args: Record<string, unknown>) {
  const limit = Math.min(Number(args?.limit) || 10, 50);
  const { data } = await sb.from("campaigns")
    .select("id,objective,channels,tone,status,duration_days,created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (!data?.length) return ok("No campaigns yet. Create one in the AIson app or ask me to generate campaign content.");
  const text = data.map((c, i) =>
    `${i + 1}. [${c.status}] ${c.objective || "campaign"} — channels: ${(c.channels || []).join(", ") || "-"}, tone: ${c.tone || "-"}, ${c.duration_days || "?"} days (id ${c.id})`
  ).join("\n");
  return ok(`Campaigns:\n${text}`);
}

async function listContent(userId: string, args: Record<string, unknown>) {
  const limit = Math.min(Number(args?.limit) || 10, 50);
  let q = sb.from("creatives")
    .select("id,content_type,caption,hashtags,visual_url,campaign_id,created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (args?.content_type) q = q.eq("content_type", String(args.content_type));
  const { data } = await q;
  if (!data?.length) return ok("The AIson content library is empty. Ask me to create_content to add something.");
  const text = data.map((c, i) => {
    const cap = String(c.caption || "").replace(/\s+/g, " ").slice(0, 140);
    const tags = (c.hashtags || []).slice(0, 5).join(" ");
    return `${i + 1}. [${c.content_type}] ${cap}${tags ? ` — ${tags}` : ""}${c.visual_url ? " (has visual)" : ""} — ${String(c.created_at).slice(0, 10)} (id ${c.id})`;
  }).join("\n");
  return ok(`Recent AIson content:\n${text}`);
}

async function getStrategy(userId: string) {
  const { data } = await sb.from("strategy_reports")
    .select("title,source_prompt,optimized_prompt,created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return ok("No strategy reports yet. Generate one from the AIson Analytics/Content Studio pages.");
  return ok(
    `Latest strategy report (${String(data.created_at).slice(0, 10)}): ${data.title || "(untitled)"}\n\n` +
      `Request: ${String(data.source_prompt).slice(0, 400)}\n\n` +
      `Optimized guidance:\n${String(data.optimized_prompt).slice(0, 2500)}`,
  );
}

/* ─────────────────── request handler ─────────────────── */

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const sub = url.pathname.replace(/^\/(functions\/v1\/)?mcp/, "") || "/";

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  /* ── OAuth discovery metadata ── */
  if (sub.includes("/.well-known/oauth-protected-resource")) {
    return json({
      resource: BASE,
      authorization_servers: [BASE],
      bearer_methods_supported: ["header"],
    });
  }
  if (sub.includes("/.well-known/oauth-authorization-server") || sub.includes("/.well-known/openid-configuration")) {
    return json({
      issuer: BASE,
      authorization_endpoint: `${BASE}/authorize`,
      token_endpoint: `${BASE}/token`,
      registration_endpoint: `${BASE}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["aison"],
    });
  }

  /* ── Dynamic client registration ── */
  if (sub === "/register" && req.method === "POST") {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const clientId = "aison_client_" + crypto.randomUUID().replace(/-/g, "");
    return json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: body.redirect_uris || [],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: body.client_name || "MCP client",
    }, 201);
  }

  /* ── Authorization endpoint ── */
  if (sub === "/authorize" && req.method === "GET") {
    if (!url.searchParams.get("redirect_uri")) return json({ error: "missing redirect_uri" }, 400);
    return new Response(null, {
      status: 302,
      headers: { ...CORS, Location: CONNECT_URL + "?" + url.searchParams.toString() },
    });
  }

  if (sub === "/authorize" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || "").trim();
    const password = String(b.password || "");
    const redirectUri = String(b.redirect_uri || "");
    const state = String(b.state || "");
    const codeChallenge = String(b.code_challenge || "");

    if (!redirectUri) return json({ error: "missing redirect_uri" }, 400);
    if (!email || !password) return json({ error: "Enter your AIson email and password." }, 400);

    // Validate credentials against Supabase Auth
    const authClient = createClient(SB_URL, SB_ANON);
    const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({ email, password });
    if (signInError || !signIn?.user) {
      return json({ error: "Email or password not recognised." }, 401);
    }

    const code = randToken("aison_code_");
    await sb.from("mcp_oauth_codes").insert({
      code,
      user_id: signIn.user.id,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge || null,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    const dest = new URL(redirectUri);
    dest.searchParams.set("code", code);
    if (state) dest.searchParams.set("state", state);
    return json({ redirect: dest.toString() });
  }

  /* ── Token endpoint ── */
  if (sub === "/token" && req.method === "POST") {
    let grantType = "", code = "", verifier = "", redirectUri = "", refreshToken = "";
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const b = await req.json();
      grantType = b.grant_type || ""; code = b.code || ""; verifier = b.code_verifier || "";
      redirectUri = b.redirect_uri || ""; refreshToken = b.refresh_token || "";
    } else {
      const form = await req.formData();
      grantType = (form.get("grant_type") || "").toString();
      code = (form.get("code") || "").toString();
      verifier = (form.get("code_verifier") || "").toString();
      redirectUri = (form.get("redirect_uri") || "").toString();
      refreshToken = (form.get("refresh_token") || "").toString();
    }

    if (grantType === "authorization_code") {
      const { data: rows } = await sb.from("mcp_oauth_codes").select("*").eq("code", code).limit(1);
      const row = rows && rows[0];
      if (!row) return json({ error: "invalid_grant", error_description: "Unknown code" }, 400);
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return json({ error: "invalid_grant", error_description: "Code expired" }, 400);
      }
      if (row.redirect_uri && redirectUri && row.redirect_uri !== redirectUri) {
        return json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
      }
      if (row.code_challenge) {
        if (!verifier) return json({ error: "invalid_grant", error_description: "Missing code_verifier" }, 400);
        const check = await sha256b64url(verifier);
        if (check !== row.code_challenge) {
          return json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
        }
      }
      await sb.from("mcp_oauth_codes").delete().eq("code", code);

      const access = randToken("aison_at_");
      const refresh = randToken("aison_rt_");
      await sb.from("mcp_oauth_tokens").insert([
        { token: access, user_id: row.user_id, kind: "access" },
        { token: refresh, user_id: row.user_id, kind: "refresh" },
      ]);
      return json({ access_token: access, token_type: "Bearer", refresh_token: refresh, scope: "aison" });
    }

    if (grantType === "refresh_token") {
      const { data: rows } = await sb.from("mcp_oauth_tokens").select("*").eq("token", refreshToken).eq("kind", "refresh").limit(1);
      const row = rows && rows[0];
      if (!row) return json({ error: "invalid_grant", error_description: "Unknown refresh token" }, 400);
      const access = randToken("aison_at_");
      await sb.from("mcp_oauth_tokens").insert({ token: access, user_id: row.user_id, kind: "access" });
      return json({ access_token: access, token_type: "Bearer", refresh_token: refreshToken, scope: "aison" });
    }

    return json({ error: "unsupported_grant_type" }, 400);
  }

  /* ── MCP JSON-RPC ── */
  if (sub === "/" || sub === "") {
    if (req.method === "GET") return json({ ok: true, server: "aison-mcp" });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    const { id, method, params } = body as { id: unknown; method: string; params: Record<string, unknown> };

    // Require auth up-front so clients trigger the OAuth flow immediately.
    const userId = await userIdFromToken(req);
    if (!userId) return unauthorized(id ?? null);

    if (method === "initialize") {
      return json({
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: (params?.protocolVersion as string) || "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "aison", version: "1.0.0" },
          instructions:
            "AIson is the user's AI marketing platform. Use create_content to generate on-brand marketing content (it applies the user's stored brand profile and strategy automatically, and saves results to their AIson library). Use get_brand_info, list_campaigns, list_content, and get_strategy to answer questions about the user's brand, campaigns, existing content, and marketing strategy. Proactively offer create_content when the user is drafting social posts, ads, or announcements.",
        },
      });
    }
    if ((method || "").startsWith("notifications/")) return new Response(null, { status: 202, headers: CORS });
    if (method === "ping") return json({ jsonrpc: "2.0", id, result: {} });
    if (method === "tools/list") return json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    if (method === "tools/call") {
      const toolName = (params as Record<string, unknown>)?.name as string;
      const args = ((params as Record<string, unknown>)?.arguments || {}) as Record<string, unknown>;
      try {
        let result;
        if (toolName === "create_content") result = await createContent(userId, args);
        else if (toolName === "get_brand_info") result = await getBrandInfo(userId);
        else if (toolName === "list_campaigns") result = await listCampaigns(userId, args);
        else if (toolName === "list_content") result = await listContent(userId, args);
        else if (toolName === "get_strategy") result = await getStrategy(userId);
        else return json({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${toolName}` } });
        return json({ jsonrpc: "2.0", id, result });
      } catch (e) {
        return json({ jsonrpc: "2.0", id, error: { code: -32000, message: `Tool error: ${e}` } });
      }
    }
    return json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }

  return json({ error: "not_found", path: sub }, 404);
});
