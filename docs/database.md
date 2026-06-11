# Database Design

The application uses PostgreSQL through Drizzle ORM. Set `DATABASE_URL` before running migrations, refreshing data, starting the worker, or starting production.

## Setup

```bash
npm run db:migrate
npm run db:seed:fifa
npm run data:init
```

`db:seed:fifa` is idempotent. It upserts the FIFA World Cup 2026 competition, teams, venues, and all 104 official matches.
`data:init` warms normalized snapshots and raw fetch caches in PostgreSQL.

## Tables

### Domain data

- `competitions`: tournament and season identity.
- `teams`: FIFA team code, display data, and source payload.
- `venues`: stadium, city, country, and UTC offset.
- `matches`: official schedule, kickoff timestamp, participants/placeholders, score, status, and source payload.
- `market_snapshots`: append-only probability and volume history for prediction markets.
- `ingestion_runs`: audit trail for scheduled/manual source synchronization.

### Persistence, caching, and jobs

- `data_source_fetches`: raw external API responses keyed by source plus request URL. Prevents repeated provider calls within the configured TTL.
- `data_snapshots`: normalized feature payloads such as `matches:today` and the radar view. These are ready for the API to return without re-running adapters.
- `background_jobs`: persistent queue for slow work such as source refresh, article fetch, free translation, AI curation, and snapshot recomputation.

## Read Strategy

1. Page APIs default to `cache-only`: read a normalized snapshot from `data_snapshots`, including stale snapshots when needed, and return immediately.
2. `?refresh=1` and cron refreshes enqueue `background_jobs` and return immediately. They do not fetch external providers, translate, or call AI inside the web request.
3. Railway worker runs `bun run worker`, claims jobs with row locks, then executes `refresh`: bypass normalized snapshots, try enabled sources in priority order, and write the new snapshot.
4. For each source, read `data_source_fetches` before making an external request.
5. Normalize a successful response and persist both raw response and feature snapshot.
6. If providers fail during refresh, use the latest stale normalized snapshot.
7. For schedules, read the seeded `matches` table.
8. Finally, use the repository FIFA JSON snapshot.

In local development, missing `DATABASE_URL` falls back to `data/runtime-cache.json` so the UI can run without PostgreSQL. In production, `DATABASE_URL` is required and runtime file cache is disabled.

## Retention

- Keep `matches`, `teams`, `venues`, and `competitions` permanently.
- Keep `market_snapshots` for the full tournament; archive or aggregate after the event.
- Delete expired `data_source_fetches` and `data_snapshots` periodically.
- Keep `ingestion_runs` for at least 30 days for provider diagnostics.

## Production Notes

- Use a managed PostgreSQL service with connection pooling.
- Run migrations during deployment, not on every request.
- Run `db:seed:fifa` after the first migration and whenever the bundled official schedule is updated.
- Run `data:init` after migration/seed to populate `data_snapshots` before opening the frontend.
- Deploy a Railway worker with `bun run worker` and the same database/source/AI environment variables.
- Schedule Vercel Cron or an external cron to call `/api/data/cron/refresh`; the route enqueues work and the Railway worker performs it.
- Do not expose `DATABASE_URL` to client-side code.
- Use Supabase pooler URL for Vercel `DATABASE_URL`, and `DATABASE_DIRECT_URL` for migrations when available.
