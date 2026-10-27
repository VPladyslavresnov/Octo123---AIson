# AIson — Deployment State & Runbook

_Last updated: 2026-07-15_

## Live URLs

| Component | URL |
|---|---|
| **Web app (production)** | https://aison-app-2026.web.app  (Firebase Hosting) |
| Connector login page | https://aison-app-2026.web.app/connect.html |
| Database + Auth + Edge Functions | https://rumhrujisuqumcbeusny.supabase.co  (Supabase project `aison`) |
| MCP connector (OAuth 2.1) | https://rumhrujisuqumcbeusny.supabase.co/functions/v1/mcp |

Local dev copy still works too: `docker compose up -d --build` → http://127.0.0.1:8080

The database password is in the git-ignored `.supabase-db-password`.

---

## ⚠️ ONE STEP LEFT TO GO FULLY LIVE: the free AI key

The app is wired to a **free, open-source model — Meta's Llama 3.3 70B — served by
Groq**, shared across all accounts. It needs one free API key. There is no
anonymous LLM endpoint anywhere; this 2-minute step is unavoidable, but it's free
and needs no credit card.

1. Go to **https://console.groq.com** → sign in with Google → **API Keys** → **Create API Key**. Copy it (starts with `gsk_`).
2. From this repo folder, set it as the one shared backend secret:
   ```bash
   npx supabase secrets set LLM_API_KEY=gsk_your_key_here
   ```
That's it — every account now uses Llama 3.3 70B for chat, captions, campaigns,
and strategy. Nothing else to configure.

### Swapping the model / provider (optional)
The endpoint is any OpenAI-compatible API. Override with two more secrets:
```bash
# Example: OpenRouter free Llama, or your own vLLM server, or OpenAI, etc.
npx supabase secrets set LLM_BASE_URL=https://openrouter.ai/api/v1 LLM_MODEL=meta-llama/llama-3.3-70b-instruct:free
```
- Default (no override): Groq + `llama-3.3-70b-versatile`.
- If you instead set `LLM_API_KEY` to an OpenAI key (`sk-...`), it auto-uses OpenAI + `gpt-4o-mini`.

### Images (optional, separate)
Open-source text models can't generate images. Image generation only runs if you
set a real **OpenAI** key (`sk-...`) — `OPENAI_IMAGE_API_KEY` (or `OPENAI_API_KEY`),
or a user pastes their own in Account → API Keys. Without it, text still works and
image steps are skipped gracefully.

### Video — VargAI (already configured)
Video generation uses **VargAI** (`api.varg.ai`). The `VARG_API_KEY` secret is
already set, so real videos work everywhere they're offered: the dedicated
video-generation flow (Content Studio / Main Page) **and** the chat bot — asking
the assistant to "make a video" now returns an actual Varg-rendered `.mp4`, not
just a script. Tunable via `VARG_VIDEO_MODEL` (default `kling-v3`),
`VARG_VIDEO_DURATION`, `VARG_VIDEO_ASPECT_RATIO`. Varg billing is metered
per-video on your Varg account. If Varg is ever unavailable, the chat path falls
back to short script drafts so the user still gets something.

### Provider priority (per request)
1. `ANTHROPIC_API_KEY` (Claude) if set — else
2. `LLM_API_KEY` (Groq/Llama, shared) — else
3. `OPENAI_API_KEY` (shared) — else
4. the user's own key from Account → API Keys.

**No third-party AI gateway is used** — requests go straight to the providers
listed above; there is no external proxy gateway, proxy API key, or build-time
tagger plugin anywhere in the codebase.

---

## Running it on YOUR OWN GoDaddy domain

Say your GoDaddy domain is `yourbrand.com` and you want the app at
`app.yourbrand.com` (a subdomain is the simplest — recommended).

### Step 1 — Start the domain in Firebase
Firebase Console → **Hosting** →
(https://console.firebase.google.com/project/aison-app-2026/hosting/main) →
**Add custom domain** → type `app.yourbrand.com` → Continue. Firebase shows you
**DNS records to add** — keep this page open.

### Step 2 — Add the records in GoDaddy
1. Log in to GoDaddy → **My Products** → next to your domain click **DNS** (or go
   to https://dcc.godaddy.com/control/dnsmanagement).
2. Firebase gives you one of two things:
   - **A verification `TXT` record first** (to prove you own the domain). In
     GoDaddy: **Add New Record** → Type `TXT`, Name = `@` (or as shown), Value =
     the string Firebase gives → **Save**. Back in Firebase click **Verify**.
   - **Then a record that points the subdomain at Firebase.** For a subdomain
     (`app`), Firebase usually gives a `CNAME` **or** two `A` records:
     - **CNAME (easiest):** Type `CNAME`, Name = `app`, Value = the target
       Firebase shows (looks like `aison-app-2026.web.app`) → **Save**.
     - **or A records:** Type `A`, Name = `app`, Value = each Firebase IP
       (e.g. `199.36.158.100`) → add one row per IP → **Save**.
   > GoDaddy's "Name" field is just the subdomain part — use `app`, not the full
   > `app.yourbrand.com`. For a root/apex domain use `@` and Firebase's two A records.
3. GoDaddy DNS changes take ~15 min–1 hr to propagate. Firebase then
   auto-issues a **free SSL certificate** (can take up to a few hours). The
   Firebase Hosting page shows the status — wait until it says **Connected**.

### Step 3 — Tell the backend about the new origin
So login and the Claude connector accept requests from your domain:
```bash
# from this repo folder — MCP connector login redirect
npx supabase secrets set MCP_CONNECT_URL=https://app.yourbrand.com/connect.html
```
Then Supabase Dashboard → **Authentication → URL Configuration**
(https://supabase.com/dashboard/project/rumhrujisuqumcbeusny/auth/url-configuration):
- **Site URL:** `https://app.yourbrand.com`
- **Redirect URLs:** add `https://app.yourbrand.com/**`

### Step 4 — Point the connector login page at your domain, then redeploy
Edit `public/connect.html` → set `MCP_BASE` stays the same (it points at Supabase,
not the app) — no change needed unless you move Supabase. Then:
```bash
npm run build
npx firebase-tools deploy --only hosting --project aison-app-2026
```

Your platform is now live at **`https://app.yourbrand.com`**.

> **Root domain instead** (`yourbrand.com`, no `app.`)? Same flow, but in GoDaddy
> use Name `@` with Firebase's two `A` records, and add a `www` CNAME → `yourbrand.com`
> if you also want `www`. GoDaddy forwarding is not needed — Firebase serves both.
>
> **Heads-up:** GoDaddy sometimes adds a default `A @ → parked page` record —
> delete it, or it competes with Firebase's records.

---

## Connecting Claude to AIson (the MCP)

1. Have an AIson account (sign up at https://aison-app-2026.web.app/signup — instant, no email confirmation).
2. Claude → Settings → Connectors → **Add custom connector**
   URL: `https://rumhrujisuqumcbeusny.supabase.co/functions/v1/mcp`
3. Connect → the AIson login page opens → sign in → you're back in Claude.
4. Try: _"use AIson to create an instagram post about our summer launch"_ or
   _"what campaigns do I have in AIson?"_

Tools: `create_content` (makes on-brand content via the shared model + saves it to
your library), `get_brand_info`, `list_campaigns`, `list_content`, `get_strategy`.

Claude Code instead: `claude mcp add --transport http aison https://rumhrujisuqumcbeusny.supabase.co/functions/v1/mcp`

---

## Day-2 commands

```bash
# Frontend
npm run build && npx firebase-tools deploy --only hosting --project aison-app-2026

# Backend
npx supabase functions deploy
SUPABASE_DB_PASSWORD=$(cat .supabase-db-password) npx supabase db push
npx supabase functions logs mcp        # or agent-chat, etc.
```

### If the app can't reach the backend ("service unavailable")
Supabase's **free tier pauses a project after ~1 week idle**. Restore it from the
dashboard (one click): https://supabase.com/dashboard/project/rumhrujisuqumcbeusny
— takes ~2 minutes, no data loss. For a platform with real users, upgrade to the
$25/mo Pro tier so it never pauses.

## Secrets currently set on the backend
`ENCRYPTION_MASTER_KEY` (API-key vault), `MCP_CONNECT_URL`, `VARG_API_KEY` (video).
**Not set (optional):** `LLM_API_KEY` ← **set this to go live**, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`/`OPENAI_IMAGE_API_KEY` (images/TTS), `FIRECRAWL_API_KEY` (brand
scraping), Meta/Instagram OAuth creds (social posting).
