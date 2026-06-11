# Data Source Configuration

Runtime config is stored in `data/admin-config.json`. It stores source/provider metadata and API-key environment variable names only. Actual API keys live in `.env` and are resolved on the server at runtime.

External responses and normalized view payloads are persisted in PostgreSQL when `DATABASE_URL` is configured. If PostgreSQL is unavailable, the same cache layer falls back to `data/runtime-cache.json` and reports `runtime-file-snapshot` or `runtime file cache hit` in diagnostics. See `docs/database.md`.

## Redundancy Strategy

Sources are grouped by `type` and ordered by `priority` ascending.

For match/team features:

1. Read a normalized snapshot from PostgreSQL.
2. Page APIs default to `cache-only`, so a stale snapshot is acceptable for fast reads when the route allows stale reads.
3. `refresh=1`, cron refreshes, `bun run data:refresh`, and the Railway worker read enabled sources for the required `type`.
4. Before calling a provider, check its persisted raw response cache.
5. Try each source adapter in priority order.
6. Persist successful raw responses and normalized snapshots.
7. If providers fail, use a stale snapshot, seeded domain data, or the local FIFA JSON.
8. Return diagnostics so the UI/admin can show whether data came from remote, database, runtime file cache, or fallback.

News uses a multi-source path instead of first-success fallback:

1. Fetch every enabled news source concurrently.
2. Normalize RSS and JSON payloads into `NewsArticle[]`.
3. Remove tracking parameters and cluster matching URLs or similar titles.
4. Merge source attribution into each retained article.
5. Send the compact factual set to an enabled backend AI provider for final grouping, summaries and key points.
6. If AI is unavailable, return the deterministic deduplication result without generated text.

Team roasts and player roasts use the same cached snapshot pattern. They read cached news and yesterday/today/tomorrow matches as context, then generate a `team-roasts` or `player-roasts` snapshot through the selected AI Provider. If AI is unavailable or returns unusable text, rule-based fallback text is written instead.

## Local FIFA Fallback

- Source PDF: [FWC26-Match-Schedule_English.pdf](https://digitalhub.fifa.com/asset/4b5d4417-3343-4732-9cdf-14b6662af407/FWC26-Match-Schedule_English.pdf)
- Downloaded copy: `data/fifa/FWC26-Match-Schedule_English.pdf`
- Extracted JSON: `src/data/fifa-schedule.json`
- Runtime mapping: `src/lib/wc-data.ts`

The JSON contains all 104 matches from the FIFA PDF, including match number, stage, group, PDF date, PDF Eastern Time, derived local venue date/time, host city, venue label, team codes/placeholders, and converted Beijing kickoff time. The PDF states all times are Eastern Time, so Beijing time must be derived from ET rather than each venue's local time. This replaces the old hand-written schedule.

## Built-In Sources

| ID | Type | Adapter | Default | Role |
| --- | --- | --- | --- | --- |
| `openfootball-worldcup-json` | `schedule` | `openfootball-worldcup-json` | enabled | Free static 2026 fixture seed |
| `polymarket-gamma` | `prediction-market` | `polymarket-gamma` | enabled | Free market probability source |
| `worldcup26-ir` | `scores` | `worldcup26-api` | disabled | Candidate free live score source |
| `worldcupapi-com` | `scores` | `worldcupapi-com` | disabled | World Cup specific API, requires key |
| `football-data-org` | `scores` | `football-data-org` | disabled | 2026 World Cup fixtures and scores, requires key |
| `football-data-org-teams` | `team-content` | `football-data-org` | disabled | 48-team base profiles, crests and coaches |
| `the-odds-api-worldcup` | `odds` | `the-odds-api` | disabled | Multi-bookmaker h2h odds and de-vig probabilities |
| `thesportsdb-worldcup` | `scores` | `thesportsdb` | disabled | Low-priority fixture fallback |
| `thesportsdb-worldcup-teams` | `team-content` | `thesportsdb` | disabled | Low-priority team profile fallback |
| `openligadb-wm2026` | `scores` | `openligadb` | disabled | Community free fallback |
| `zafronix-worldcup` | `team-content` | `zafronix` | disabled | Historical/team/stadium candidate |
| `balldontlie-fifa` | `team-content` | `balldontlie-fifa` | disabled | Advanced stats candidate |
| `legal-highlights` | `highlights` | `generic-json` | disabled | Legal highlight links |
| `espn-soccer-rss` | `news` | `espn-site-api` | enabled | Primary ESPN FIFA World Cup JSON news source; old RSS URL is WAF-challenged |
| `chinanews-sports-rss` | `news` | `rss-feed` | enabled | Free Chinese sports RSS with World Cup football keyword filtering |
| `bbc-sport-football-rss` | `news` | `rss-feed` | enabled | First RSS fallback |
| `people-sports-rss` | `news` | `rss-feed` | disabled | Free Chinese sports RSS fallback; disabled by default because the feed can lag |
| `currents-worldcup-news` | `news` | `currents-api` | disabled | Keyword-based sport news fallback, requires key |
| `gdelt-worldcup-news` | `news` | `gdelt-doc` | enabled | Free GDELT DOC ArticleList source; may be rate limited |
| `newsapi-worldcup` | `news` | `newsapi-org` | disabled | Optional article discovery source, requires key |

## DataSourceConfig

```ts
type DataSourceConfig = {
  id: string;
  name: string;
  type: "schedule" | "scores" | "prediction-market" | "odds" | "highlights" | "news" | "team-content" | "custom";
  adapter:
    | "openfootball-worldcup-json"
    | "polymarket-gamma"
    | "worldcup26-api"
    | "worldcupapi-com"
    | "football-data-org"
    | "openligadb"
    | "the-odds-api"
    | "thesportsdb"
    | "zafronix"
    | "balldontlie-fifa"
    | "rss-feed"
    | "espn-site-api"
    | "currents-api"
    | "gdelt-doc"
    | "newsapi-org"
    | "generic-json";
  baseUrl: string;
  endpointPath: string;
  apiKey: string; // Server-side runtime value resolved from env; never returned to admin clients.
  apiKeyEnvName?: string;
  apiKeyConfigured?: boolean;
  apiKeyPlacement: "none" | "query" | "header" | "bearer" | "path";
  apiKeyParamName: string;
  apiKeyHeaderName: string;
  enabled: boolean;
  priority: number;
  refreshSeconds: number;
  cacheTtlSeconds: number;
  timeoutMs: number;
  notes: string;
};
```

## Current API Surface

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
- `GET /api/data/cron/refresh?mode=initialize`
- `GET /api/data/cron/refresh?wait=1`
- `POST /api/data/news/translate`
- `GET /api/admin/session`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/config`
- `PUT /api/admin/config`
- `GET /api/user/profile`
- `GET|POST|DELETE /api/mcp`

`dateKey` accepts `yesterday`, `today`, or `tomorrow`.
Append `refresh=1` to selected data APIs to bypass normalized snapshots and refresh the stored cache. Use this for admin/manual refresh flows, not high-traffic page loads.

## Adapter Status

- `openfootball-worldcup-json`: implemented and normalized into `Match[]`.
- `polymarket-gamma`: implemented and normalized into `RadarMatch[]` when World Cup/FIFA markets are present.
- `rss-feed`: implemented as a text/RSS source and normalized into `NewsArticle[]`.
- `espn-site-api`: implemented for `site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news`. The previous `www.espn.com/espn/rss/soccer/news` endpoint returns CloudFront WAF challenge responses in server-side fetches, so existing `espn-soccer-rss` configs are normalized to this JSON API.
- `currents-api`: implemented with the V2 search endpoint, `sport` category and World Cup query.
- `gdelt-doc`: implemented and normalized into `NewsArticle[]`; keep RSS/NewsAPI enabled as redundancy because GDELT can return 429 under rate pressure.
- `newsapi-org`: implemented and normalized into `NewsArticle[]`, disabled until an API key is configured.
- `football-data-org`: implemented for 2026 fixtures, scores and team profiles.
- `the-odds-api`: implemented for FIFA World Cup h2h odds; bookmaker overround is removed per book before averaging.
- `thesportsdb`: implemented as a low-priority fixtures and team-content fallback; free-key result limits apply.
- `worldcupapi-com`: implemented, but should remain disabled when the account key does not have data access.
- Other adapters are configured and fetch-ready, but remain disabled by default until their endpoint shape and quota are verified.

API keys are read from `.env` by environment variable name. `data/admin-config.json` stores only source metadata and the variable name. API keys are also stripped from persisted request URLs before raw responses are cached.

## News Aggregation

Default source order is ESPN FIFA World Cup Site API, ChinaNews Sports RSS, BBC Football RSS, Currents API and GDELT. Priority controls display and fetch configuration, but every enabled source is requested during each uncached aggregation run.

Chinese RSS feeds use the same `rss-feed` adapter. For Chinese sports portals, the aggregator appends Chinese World Cup terms such as `世界杯`、`美加墨` and `足球` to the relevance filter, so general sports headlines do not dominate the morning brief.

The response includes:

- `aggregation.fetchedSourceCount`
- `aggregation.successfulSourceCount`
- `aggregation.rawArticleCount`
- `aggregation.deduplicatedArticleCount`
- `aggregation.aiUsed`
- `aggregation.aiProvider`
- `aggregation.aiMessage`

Morning briefs request every enabled news source for the selected Beijing calendar day, keep up to 60 deduplicated records, and display the full retained `brief.news` list. The leading headline block is only a compact highlight summary and should not cap the underlying fetched news set.

AI curation supports enabled OpenAI-compatible providers and Gemini. Provider failure does not remove or replace factual source records.

The admin config stores `primaryAiProviderId`. The selected provider is tried first, followed by other enabled providers in configuration order. AI Provider API keys use the same env-var mechanism as data sources: config JSON stores only `apiKeyEnvName`, server-side reads the real value from `.env`, and admin API responses always redact `apiKey`. The current preferred provider is Xiaomi MiMo Token Plan through its OpenAI-compatible endpoint with `mimo-v2.5-pro`; DeepSeek `deepseek-v4-flash` remains enabled as fallback.

Kimi Code (`https://api.kimi.com/coding/v1`, model `kimi-for-coding`) is restricted to supported Coding Agent clients and returns `403` for this web backend. Use a Kimi Platform key with `https://api.moonshot.cn/v1` for production news curation.

## Team And Player Roasts

The teams page reads:

- `GET /api/data/teams`
- `GET /api/data/team-roasts`
- `GET /api/data/player-roasts`

The roast snapshots are generated by `src/lib/ai/team-roasts.ts` and `src/lib/ai/player-roasts.ts`.

Generation context:

- built-in official team profiles and roster data
- cached news from `getAggregatedNews(..., cacheMode: "cache-only")`
- cached matches for yesterday, today, and tomorrow
- admin-selected AI Provider plus fallback providers

Runtime behavior:

- Snapshot TTL is six hours.
- Snapshot keys include admin config `updatedAt`, so AI configuration changes trigger a new snapshot.
- Team roasts are generated with concurrency 4.
- Player roasts default to concurrency 6 and can be changed with `PLAYER_ROAST_AI_CONCURRENCY`.
- `TEAM_ROAST_AI_TIMEOUT_MS` and `PLAYER_ROAST_AI_TIMEOUT_MS` default to 180 seconds.
- AI output is validated for length, uniqueness, evidence references, and banned template-like phrases.
- Rule-based fallback text is used when AI is disabled, fails, times out, or returns unusable content.

## Refresh Policy

External fetches use dynamic refresh windows from `src/lib/data-sources/rate-policy.ts`.

The policy has three modes:

- `off-season`: no World Cup match is near; news and live data slow down.
- `tournament`: between seven days before the opener and two days after the final.
- `match-window`: from two hours before kickoff until roughly two hours after a normal match window; live scores, odds and news may refresh more often.

Official limits used in the current policy:

| Source | Official constraint used | Runtime policy |
| --- | --- | --- |
| football-data.org | Free plan lists 10 calls/minute. | Match scores can tighten during match windows, team profiles stay daily or slower. |
| The Odds API | Starter plan lists 500 credits/month; one h2h market in one region costs 1 credit. | Odds stay conservative and are additionally capped by monthly-budget-derived intervals. |
| Currents API | Free account documents 1,000 daily requests. | Reserve 50% of daily quota for manual/admin use; automated news refresh is no faster than 15 minutes. |
| GDELT | GDELT 2.0 updates every 15 minutes. | Never poll faster than 15 minutes. |
| NewsAPI | Developer tier lists 100 requests/day and is for development/testing only. | Disabled by default; if enabled, automated usage reserves 50% of daily quota. |
| ESPN Site API / BBC / ChinaNews RSS | Public endpoints do not publish app-specific quota in the feed URL. | Conservative polling: 15 minutes in match windows, slower outside. |
| TheSportsDB | Public page documents free legacy API and paid V2/livescore features, but no clear free-key rate number. | Low-priority fallback with conservative intervals. |

Every successful external call is recorded in `data_source_usage_events` when PostgreSQL is configured. The runtime also keeps in-memory usage counters so one server process cannot burst past the configured official window even without a database.

## Scheduled Fetching And Initialization

Runtime endpoint:

- `GET /api/data/cron/refresh`
- `GET /api/data/cron/refresh?mode=initialize`
- `GET /api/data/cron/refresh?wait=1`

The endpoint uses `CRON_SECRET` bearer auth when `CRON_SECRET` is set. `vercel.json` schedules `/api/data/cron/refresh` every 15 minutes; dynamic TTL and quota gates decide whether a real upstream request is allowed.

Vercel Cron requests and `wait=1` run the refresh synchronously. Other manual requests enqueue a full data refresh in `background_jobs` and return `202` with current background task state.

Local scripts:

```bash
bun run data:refresh
bun run data:init
bun run tools:audit
```

`data:init` runs directly through `scripts/refresh-data.ts`. When `DATABASE_URL` is configured it first seeds the FIFA official schedule, then warms teams, odds, radar, yesterday/today/tomorrow matches, yesterday/today morning briefs, and three daily news windows for the latest three UTC days. The news windows are passed to Currents, GDELT and NewsAPI where supported, and RSS results are filtered locally by publish time.

`data:init` also refreshes `team-roasts` and `player-roasts`. Scheduled refresh mode always attempts both roast snapshots with `cache-first`, so existing valid snapshots are reused until TTL/config changes require regeneration.
