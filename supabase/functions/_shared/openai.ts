// Shared LLM provider for AIson edge functions.
//
// Chat/text is served by ONE OpenAI-compatible endpoint shared across all
// accounts. By default that is Groq running Meta's open-source Llama 3.3 70B
// (free, high quality) — set the single secret LLM_API_KEY and it works for
// everyone. Point it anywhere OpenAI-compatible by overriding LLM_BASE_URL /
// LLM_MODEL (e.g. OpenRouter, Together, a self-hosted vLLM, or OpenAI itself).
//
// Key resolution (first hit wins):
//   1. LLM_API_KEY   — one shared backend key for all users (recommended)
//   2. OPENAI_API_KEY — legacy shared OpenAI key
//   3. the user's own key from Account → API Keys (service_name "openai")
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decryptSecret } from "./crypto.ts";

const GROQ_BASE = "https://api.groq.com/openai/v1";
// Groq's currently-available open models (Llama 3.x was removed from the account).
const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"; // strong open model for complex work
const GROQ_FAST_MODEL = "openai/gpt-oss-20b";     // fast/cheap open model for simple work
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_STRONG_MODEL = "gpt-4o";

// A Groq key starts with "gsk_"; OpenAI/OpenRouter with "sk-".
function isGroqKey(key: string): boolean {
  return key.startsWith("gsk_");
}

function baseUrlFor(key: string): string {
  const override = Deno.env.get("LLM_BASE_URL");
  if (override) return override.replace(/\/$/, "");
  return isGroqKey(key) ? GROQ_BASE : OPENAI_BASE;
}

function modelFor(key: string): string {
  const override = Deno.env.get("LLM_MODEL");
  if (override) return override;
  return isGroqKey(key) ? GROQ_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL;
}

// Pick the cheapest model that can do the job, to save tokens & rate-limit budget.
// Complex signals → strong model; short/simple chat → fast model.
function pickModel(
  key: string,
  body: { messages?: unknown[]; tools?: unknown[]; response_format?: unknown },
): string {
  // An explicit LLM_MODEL override always wins.
  if (Deno.env.get("LLM_MODEL")) return Deno.env.get("LLM_MODEL")!;

  const chars = (() => { try { return JSON.stringify(body.messages || []).length; } catch { return 0; } })();
  const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
  const wantsJson = !!body.response_format;
  // Tool-calling, structured JSON extraction, or long context need the strong model.
  const complex = hasTools || wantsJson || chars > 3000;

  if (isGroqKey(key)) return complex ? GROQ_DEFAULT_MODEL : GROQ_FAST_MODEL;
  return complex ? OPENAI_STRONG_MODEL : OPENAI_DEFAULT_MODEL;
}

/** Resolve the shared chat/text key: LLM_API_KEY, then OPENAI_API_KEY, then the user's stored key. */
export async function resolveOpenAIKey(userId?: string | null): Promise<string | null> {
  const shared = Deno.env.get("LLM_API_KEY") || Deno.env.get("OPENAI_API_KEY");
  if (shared) return shared;
  if (!userId) return null;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("api_keys")
      .select("api_key")
      .eq("user_id", userId)
      .eq("service_name", "openai")
      .maybeSingle();
    if (!data?.api_key) return null;
    try {
      return await decryptSecret(data.api_key as string);
    } catch {
      return data.api_key as string;
    }
  } catch {
    return null;
  }
}

/** Image generation needs a real OpenAI key (Groq/Llama can't make images). */
export async function resolveImageKey(userId?: string | null): Promise<string | null> {
  const envKey = Deno.env.get("OPENAI_IMAGE_API_KEY") || Deno.env.get("OPENAI_API_KEY");
  if (envKey && envKey.startsWith("sk-")) return envKey;
  if (!userId) return null;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("api_keys")
      .select("api_key")
      .eq("user_id", userId)
      .eq("service_name", "openai")
      .maybeSingle();
    if (!data?.api_key) return null;
    let key: string;
    try {
      key = await decryptSecret(data.api_key as string);
    } catch {
      key = data.api_key as string;
    }
    return key.startsWith("sk-") ? key : null;
  } catch {
    return null;
  }
}

// Kept for compatibility with call sites; the concrete model is chosen per-key.
export function normalizeOpenAIModel(model?: string | null): string {
  return String(model || "").trim();
}

export function noProviderResponse(): Response {
  return new Response(
    JSON.stringify({
      error:
        "No AI provider configured. Set the LLM_API_KEY backend secret (free Groq key), or add your own key in Account → API Keys.",
    }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
}

/** OpenAI-compatible chat completion against the configured provider (Groq/Llama by default).
 *  Retries on rate-limit (429) and transient 5xx with backoff — the free Groq tier
 *  rate-limits under concurrent load, and one failed call shouldn't break the UX. */
export async function openaiChatCompletion(
  apiKey: string,
  body: { messages: unknown[]; tools?: unknown[]; response_format?: unknown; model?: string; max_tokens?: number },
): Promise<Response> {
  const url = `${baseUrlFor(apiKey)}/chat/completions`;
  // Route to the right-sized model for the request (saves tokens on simple work).
  const model = pickModel(apiKey, body);
  const payload = JSON.stringify({
    model,
    messages: body.messages,
    ...(body.tools ? { tools: body.tools } : {}),
    ...(body.response_format ? { response_format: body.response_format } : {}),
    ...(body.max_tokens ? { max_tokens: body.max_tokens } : {}),
  });
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  let lastRes: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers, body: payload });
    } catch (_e) {
      // network blip — back off and retry
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
    if (res.ok || (res.status !== 429 && res.status < 500)) return res;
    lastRes = res;
    // Honour Retry-After when present, else exponential-ish backoff with jitter.
    const ra = Number(res.headers.get("retry-after"));
    const wait = ra > 0 ? Math.min(ra * 1000, 4000) : 500 * (attempt + 1) + Math.floor(Math.random() * 400);
    await new Promise((r) => setTimeout(r, wait));
  }
  return lastRes ?? new Response(JSON.stringify({ error: { message: "provider unavailable" } }), { status: 502 });
}

/** Generate an image with OpenAI DALL-E 3 and return its URL (or null on failure). */
export async function openaiImageUrl(
  apiKey: string,
  prompt: string,
  size = "1024x1024",
): Promise<string | null> {
  if (!apiKey.startsWith("sk-")) return null; // only real OpenAI keys support images
  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: prompt.slice(0, 3900),
        n: 1,
        size,
        response_format: "url",
      }),
    });
    if (!response.ok) {
      console.warn("OpenAI image generation failed:", response.status, await response.text());
      return null;
    }
    const data = await response.json();
    return data?.data?.[0]?.url || null;
  } catch (e) {
    console.warn("OpenAI image generation error:", e);
    return null;
  }
}
