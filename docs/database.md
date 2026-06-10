# Database Design

The application uses PostgreSQL through Drizzle ORM. Set `DATABASE_URL` before running migrations or starting production.

## Setup

```bash
bun run db:migrate
bun run db:seed:fifa
```

`db:seed:fifa` is idempotent. It upserts the FIFA World Cup 2026 competition, teams, venues, and all 104 official matches.

## Tables

### Domain data

- `competitions`: tournament and season identity.
- `teams`: FIFA team code, display data, and source payload.
- `venues`: stadium, city, country, and UTC offset.
- `matches`: official schedule, kickoff timestamp, participants/placeholders, score, status, and source payload.
- `market_snapshots`: append-only probability and volume history for prediction markets.
- `ingestion_runs`: audit trail for scheduled/manual source synchronization.

### Persistence and caching

- `data_source_fetches`: raw external API responses keyed by source plus request URL. Prevents repeated provider calls within the configured TTL.
- `data_snapshots`: normalized feature payloads such as `matches:today` and the radar view. These are ready for the API to return without re-running adapters.

## Read Strategy

1. Read a fresh normalized snapshot from `data_snapshots`.
2. If missing, try enabled sources in priority order.
3. For each source, read `data_source_fetches` before making an external request.
4. Normalize a successful response and persist both raw response and feature snapshot.
5. If providers fail, use the latest stale normalized snapshot.
6. For schedules, read the seeded `matches` table.
7. Finally, use the repository FIFA JSON snapshot.

Database failures are non-fatal. The application logs the failure and continues through the fallback chain.

## Retention

- Keep `matches`, `teams`, `venues`, and `competitions` permanently.
- Keep `market_snapshots` for the full tournament; archive or aggregate after the event.
- Delete expired `data_source_fetches` and `data_snapshots` periodically.
- Keep `ingestion_runs` for at least 30 days for provider diagnostics.

## Production Notes

- Use a managed PostgreSQL service with connection pooling.
- Run migrations during deployment, not on every request.
- Run `db:seed:fifa` after the first migration and whenever the bundled official schedule is updated.
- Do not expose `DATABASE_URL` to client-side code.
