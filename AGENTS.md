# Agent Guide

This repository is the active codebase for **世界杯装杯指南**, a mobile-first 2026 World Cup H5 guide. It is no longer a generic Eazo starter. Treat product behavior, data pipelines, and docs as project-specific.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Bun
- PostgreSQL + Drizzle ORM
- Framer Motion
- i18next / react-i18next
- next-themes
- Eazo SDK for auth, user session handling, notifications, and MCP auth guard

## Core Product Surfaces

- `/`: today schedule screen with yesterday/today/tomorrow tabs, match cards, standings toggle, and match detail links.
- `/morning`: morning brief with matches, news, AI curation output, translations, and shareable talking points.
- `/teams`: team quick cards, roster details, team roasts, and player roasts.
- `/radar`: Polymarket probability vs odds-implied probability comparison.
- `/tools`: odds/probability calculators, terminology, and odds data view.
- `/match/[id]`: match detail view.
- `/news/[id]`: news detail view.
- `/admin`: admin panel for data source and AI Provider configuration.

## Important Commands

```bash
bun install
bun run dev
bun run lint
bun run build
bun run db:migrate
bun run db:seed:fifa
bun run data:init
bun run data:refresh
bun run worker
bun run tools:audit
```

Use Bun for local scripts unless a file explicitly requires Node, such as `scripts/audit-tools.mjs`.

## Project Structure

```text
src/app/                 Page routes and API routes
src/components/layout/   App shell, navigation, language and theme controls
src/components/screens/  Product screens
src/components/i18n/     Client i18n provider and switcher
src/components/theme/    Theme provider and toggle
src/data/                FIFA schedule and team profile snapshots
src/lib/admin/           Admin auth and runtime config storage
src/lib/ai/              News curation, team roasts, player roasts, task orchestration
src/lib/background/      Persistent job queue helpers
src/lib/data-sources/    Adapters, aggregation, rate policy, refresh runner
src/lib/db/              Drizzle schema, migrations, queries, FIFA seed
src/lib/i18n/            Locale helpers and server/client preference handling
src/lib/mcp/             MCP server tools
src/lib/translation/     Article translation cache and free translation path
src/lib/wc-data.ts       Shared DTOs, FIFA fallback mapping, compatibility exports
```

## Data Model And Persistence

The database schema is split by purpose:

- `src/lib/db/schema/world-cup.ts`: competitions, teams, venues, matches, market snapshots, ingestion runs.
- `src/lib/db/schema/data-cache.ts`: raw fetch cache, normalized snapshots, source usage events, background jobs.
- `src/lib/db/schema/users.ts`: Eazo user profile mirror.

Run migrations with `bun run db:migrate`. Seed the official FIFA schedule with `bun run db:seed:fifa`.

## Data Pipeline Rules

- Page APIs should stay fast and default to `cache-only`.
- Expensive work belongs in `runDataRefresh()` and the `background_jobs` worker path.
- Use `data_source_fetches` before hitting any remote provider.
- Write page-ready payloads into `data_snapshots`.
- Keep external API keys out of JSON config. `data/admin-config.json` stores only `apiKeyEnvName`; real values live in `.env`.
- Do not reintroduce demo/mock data for scores, markets, teams, or news. If a reliable source is missing, return an empty state or an existing stale snapshot.

## Current Data APIs

- `GET /api/data/matches?dateKey=today`
- `GET /api/data/radar`
- `GET /api/data/odds`
- `GET /api/data/teams`
- `GET /api/data/news?q=World%20Cup%202026&limit=60`
- `GET /api/data/morning?dateKey=yesterday`
- `GET /api/data/team-roasts`
- `GET /api/data/player-roasts`
- `GET /api/data/sources`
- `GET /api/data/cron/refresh`
- `POST /api/data/news/translate`

`dateKey` accepts `yesterday`, `today`, or `tomorrow`.

## Admin And Auth APIs

- `GET /api/admin/session`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/config`
- `PUT /api/admin/config`
- `GET /api/user/profile`
- `GET|POST|DELETE /api/mcp`
- `POST /api/notifications/test`
- `GET /api/notifications/cron/daily-digest`

`/api/user/profile` and `/api/mcp` use Eazo session auth. Admin routes use the admin password/session cookie flow.

## AI Behavior

- News curation reads factual news records, then uses the selected AI Provider to group events, summarize, and generate key points.
- Team roasts and player roasts read cached news plus yesterday/today/tomorrow matches as context.
- Xiaomi MiMo `mimo-v2.5-pro` is the default primary Provider in config; DeepSeek `deepseek-v4-flash` can be enabled as fallback.
- Kimi Code is for supported Coding Agent clients. For this web backend, use Moonshot/Kimi Platform compatible API if Kimi is required.
- AI output must be treated as expression over existing facts, not as a source of new facts.

## Frontend Conventions

- Keep screens mobile-first and consistent with the retro sports newspaper visual system.
- Preserve i18n through `react-i18next`; user-visible strings should go through locale helpers or locale JSON when practical.
- Keep theme behavior compatible with `next-themes`.
- Use existing screen/component patterns before adding new abstractions.
- Avoid betting language that implies advice, certainty, follow orders, or guaranteed return.

## Deployment Notes

- Vercel runs the Next.js app and cron routes.
- Railway runs the `railway.json` start command: `node --dns-result-order=ipv4first ./node_modules/.bin/tsx scripts/background-worker.ts`. Local development can still use `bun run worker`.
- Supabase provides PostgreSQL. Use the Supabase pooler URL for Vercel and Railway `DATABASE_URL`.
- `vercel.json` schedules `/api/data/cron/refresh` daily at `0 16 * * *` on the current Hobby deployment and `/api/notifications/cron/daily-digest` daily at `0 17 * * *`.
- Production must set `DATABASE_URL`, `DATABASE_SSL=require`, `DATABASE_PREPARE=false`, `CRON_SECRET`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET`.

## Documentation

- Product overview: `docs/project-intro.md`
- Data sources and refresh policy: `docs/data-sources.md`
- Database design: `docs/database.md`
- Visual content/data flow overview: `docs/content-framework-visual.html`
- Original planning record: `../doc/项目规划设计.md`
