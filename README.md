# AIson — AI Marketing Platform

Vite + React + TypeScript frontend with a Supabase backend (Postgres, Auth,
Edge Functions) and an MCP connector for Claude.

- **Run locally:** `docker compose up -d --build` → http://127.0.0.1:8080
- **Deployment state, hosting, and AI provider setup:** see [DEPLOYMENT.md](DEPLOYMENT.md)
- **Handoff notes / code map:** see [HANDOFF_SUMMARY.md](HANDOFF_SUMMARY.md)

## Development

```bash
npm install
npm run dev          # dev server on :8080
npm run build        # production build to dist/
```

Backend (requires the Supabase CLI, authenticated):

```bash
npx supabase functions deploy                                        # deploy edge functions
SUPABASE_DB_PASSWORD=$(cat .supabase-db-password) npx supabase db push   # apply migrations
```
