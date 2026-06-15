# Database Design

The application uses PostgreSQL through Drizzle ORM. Set `DATABASE_URL` before running migrations, refreshing data, starting the worker, or starting production.

## Setup

```bash
bun run db:migrate
bun run db:seed:fifa
bun run data:init
```

`db:seed:fifa` is idempotent. It upserts the FIFA World Cup 2026 competition, teams, venues, and all 104 official matches.

`data:init` warms normalized snapshots and raw fetch caches in PostgreSQL. It also refreshes teams, odds, radar, yesterday/today/tomorrow matches, yesterday/today morning briefs, recent news windows, team roasts, and player roasts.

For Docker Compose self-hosting, use the single `init` service instead of running the commands separately:

```bash
docker compose --env-file .env.docker --profile init run --rm init
```

The Compose `init` service runs migrations first and then runs `data:init`. `data:init` seeds the FIFA schedule when `DATABASE_URL` is configured, so the initialization path stays idempotent. The Compose Postgres port is bound to `127.0.0.1` by default; web and worker containers reach it through the internal `postgres` service name.

## Tables

### Domain Data

- `competitions`: tournament and season identity.
- `teams`: FIFA team code, display data, and source payload.
- `venues`: stadium, city, country, and UTC offset.
- `matches`: official schedule, kickoff timestamp, participants/placeholders, score, status, and source payload.
- `news_articles`: canonical news records keyed by stable article ID. Refresh jobs store full body text, image URLs, AI curation fields, and queued translation output here so page snapshots can be hydrated with the newest article payload.
- `market_snapshots`: append-only probability and volume history for prediction markets.
- `ingestion_runs`: audit trail for scheduled/manual source synchronization.

### Users

- `users`: Eazo-authenticated user profile mirror, keyed by Eazo user ID. `GET /api/user/profile` decrypts `x-eazo-session`, returns the current user, and upserts this table in the background.

### Persistence, Caching, Usage, And Jobs

- `data_source_fetches`: raw external API responses keyed by source plus sanitized request URL. Prevents repeated provider calls within the configured TTL.
- `data_snapshots`: normalized feature payloads such as `matches:today`, `news:*`, `morning:*`, `radar`, `team-roasts`, and `player-roasts`. These are ready for page APIs to return without re-running adapters.
- `data_source_usage_events`: append-only source usage log for quota/rate diagnostics.
- `background_jobs`: persistent queue for slow work such as full data refreshes, article fetch/translation, AI curation, snapshot recomputation, team roasts, and player roasts.

## Read And Refresh Strategy

1. Page APIs default to `cache-only`: read a normalized snapshot from `data_snapshots`, including stale snapshots when allowed, and return immediately.
2. News snapshots store retained article IDs and are hydrated from `news_articles` before returning, so full-text enrichment and queued translations can update cached pages without forcing a remote refresh.
3. If no snapshot exists, schedule routes can enqueue `background_jobs`; regular page reads avoid external fetches in production request paths. News pages can also fall back to latest canonical `news_articles` ordered by `publishedAt`.
4. `?refresh=1` on selected data APIs uses refresh mode and is intended for admin/manual refresh flows, not high-traffic page loads.
5. `GET /api/data/cron/refresh` checks `CRON_SECRET` when configured.
6. Vercel Cron requests and `?wait=1` run `runDataRefresh()` synchronously. Other manual calls enqueue a full refresh job and return `202`.
7. Railway worker runs the Node/tsx production command from `railway.json`, claims queued jobs with row locks, executes refresh logic, and writes new raw fetches plus feature snapshots. Local development can still run `bun run worker`.
8. For each source, refresh logic reads `data_source_fetches` before making an external request.
9. If providers fail during refresh, the application uses the latest stale normalized snapshot, seeded official schedule, or repository FIFA JSON fallback.

In local development, missing `DATABASE_URL` falls back to `data/runtime-cache.json` so the UI can run without PostgreSQL. In production, `DATABASE_URL` is required and runtime file cache is disabled.

## Snapshot Features

Current refresh tasks write or consume these major feature snapshots:

- `matches:yesterday`, `matches:today`, `matches:tomorrow`
- `morning:yesterday`, `morning:today`
- `news:*`
- `teams`
- `odds`
- `radar`
- `source-status`
- `team-roasts`
- `player-roasts`

Team and player roast snapshot keys include the admin config `updatedAt`, so changing AI Provider configuration invalidates the previous generated set.

## Retention

- Keep `matches`, `teams`, `venues`, `competitions`, and `users` permanently unless a privacy deletion flow requires user removal.
- Keep `market_snapshots` for the full tournament; archive or aggregate after the event.
- Delete expired `data_source_fetches` and `data_snapshots` periodically.
- Keep `data_source_usage_events` and `ingestion_runs` for at least 30 days for provider diagnostics.
- Keep failed `background_jobs` long enough to debug retries and provider outages.

## Production Notes

- Use a managed PostgreSQL service with connection pooling.
- Run migrations during deployment, not on every request.
- Run `db:seed:fifa` after the first migration and whenever the bundled official schedule is updated.
- Run `data:init` after migration/seed to populate `data_snapshots` before opening the frontend.
- For Docker Compose deployments, run `docker compose --env-file .env.docker --profile init run --rm init` before starting `web` and `worker`.
- Deploy a Railway worker with the `railway.json` start command and the same database/source/AI environment variables.
- Schedule Vercel Cron or an external cron to call `/api/data/cron/refresh`. The current Vercel Hobby deployment uses daily cron because sub-daily cron schedules are plan-gated.
- Do not expose `DATABASE_URL` or provider API keys to client-side code.
- Use the Supabase pooler URL for Vercel and Railway `DATABASE_URL`, and `DATABASE_DIRECT_URL` or Supabase CLI for migrations when available.
