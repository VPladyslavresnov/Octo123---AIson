# AIson Project Handoff

## Project Type
- Vite + React + TypeScript frontend
- Supabase backend functions and migrations
- Dockerized local deployment with Nginx

## Main App Areas
- `src/pages/MainPage.tsx`
  - AI assistant style home page
  - voice mode
  - content generation in chat
  - Varg video generation path
- `src/pages/ContentStudio.tsx`
  - dedicated content generation page
  - strategy-prep + prompt orchestration
- `src/pages/Campaigns.tsx`, `src/pages/NewCampaign.tsx`, `src/pages/CampaignDetail.tsx`
  - campaign management flow
- `src/pages/Library.tsx`
  - saved text/image/video creatives
- `src/pages/Posting.tsx`
  - channel connection and posting UI
- `src/pages/Analytics.tsx`
  - strategy/report-oriented analytics view
- `src/pages/Account.tsx`
  - company profile, API keys, voice settings

## Important Logic Files
- `src/lib/contentPromptOrchestrator.ts`
  - combines brand profile, analytics, campaigns, strategy reports, and current task into a large generation prompt
- `src/lib/brandMemoryEngine.ts`
  - brand memory/report generation logic
- `src/lib/strategyFlow.ts`
  - strategy-preparation flow used before generation
- `src/lib/vargVideoClient.ts`
  - browser-side Varg video generation polling client
- `src/lib/metaLocalConnector.ts`
  - local/manual Meta connection helper
- `src/lib/localAccessBypass.ts`
  - localhost auth bypass switch added for local-only access

## Supabase Functions
- `supabase/functions/generate-text`
- `supabase/functions/generate-image`
- `supabase/functions/generate-video`
- `supabase/functions/generate-campaign-content`
- `supabase/functions/generate-strategy-prompt`
- `supabase/functions/agent-chat`
- `supabase/functions/meta-oauth`
- `supabase/functions/instagram-post`
- `supabase/functions/synthesize-assistant-speech`
- `supabase/functions/voice-respond`

## Migrations Added/Relevant
- `20260418095500_add_strategy_reports.sql`
- `20260418152000_add_assistant_voice_settings.sql`
- `20260421103000_add_meta_social_connection_fields.sql`

## Deployment / Run
- Docker files:
  - `Dockerfile`
  - `compose.yaml`
  - `nginx.conf`
- Local app has been run on:
  - `http://127.0.0.1:8080/home`

## Current Local Special State
- Localhost auth bypass was introduced so the app can open without a working login on local use.
- Nginx was configured to redirect `/`, `/auth`, `/signup`, and `/onboarding` to `/home` for local access.

## Sensitive Config Note
- The project currently contains local env files such as `.env` and `.env.local`.
- Review and rotate any exposed keys before sharing outside trusted use.

## Packaging Note
- This handoff package is meant to be reusable in a new chat or by another developer.
- Rebuildable/generated folders are usually not needed:
  - `node_modules`
  - `dist`
  - `.git`
  - temporary caches
