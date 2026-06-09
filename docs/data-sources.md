# Data Source Configuration

Runtime config is stored in `data/admin-config.json`. This file is ignored by Git because it may contain API keys.

## Redundancy Strategy

Sources are grouped by `type` and ordered by `priority` ascending.

For each feature:

1. Read enabled sources for the required `type`.
2. Try each source adapter in priority order.
3. Use the first source that returns normalized data.
4. If every remote schedule source fails, fall back to the local FIFA official schedule snapshot in `src/data/fifa-schedule.json`.
5. Return diagnostics so the UI/admin can show whether data came from remote or fallback.

## Local FIFA Fallback

- Source PDF: [FWC26-Match-Schedule_English.pdf](https://digitalhub.fifa.com/asset/4b5d4417-3343-4732-9cdf-14b6662af407/FWC26-Match-Schedule_English.pdf)
- Downloaded copy: `data/fifa/FWC26-Match-Schedule_English.pdf`
- Extracted JSON: `src/data/fifa-schedule.json`
- Runtime mapping: `src/lib/wc-data.ts`

The JSON contains all 104 matches from the FIFA PDF, including match number, stage, group, PDF date, PDF Eastern Time, derived local venue date/time, host city, venue label, team codes/placeholders, and converted Beijing kickoff time. The PDF states all times are Eastern Time, so Beijing time must be derived from ET rather than each venue's local time. This replaces the old hand-written schedule mock.

## Built-In Sources

| ID | Type | Adapter | Default | Role |
| --- | --- | --- | --- | --- |
| `openfootball-worldcup-json` | `schedule` | `openfootball-worldcup-json` | enabled | Free static 2026 fixture seed |
| `polymarket-gamma` | `prediction-market` | `polymarket-gamma` | enabled | Free market probability source |
| `worldcup26-ir` | `scores` | `worldcup26-api` | disabled | Candidate free live score source |
| `worldcupapi-com` | `scores` | `worldcupapi-com` | disabled | World Cup specific API, requires key |
| `football-data-org` | `scores` | `football-data-org` | disabled | General football fallback, requires key |
| `openligadb-wm2026` | `scores` | `openligadb` | disabled | Community free fallback |
| `zafronix-worldcup` | `team-content` | `zafronix` | disabled | Historical/team/stadium candidate |
| `balldontlie-fifa` | `team-content` | `balldontlie-fifa` | disabled | Advanced stats candidate |
| `legal-highlights` | `highlights` | `generic-json` | disabled | Legal highlight links |

## DataSourceConfig

```ts
type DataSourceConfig = {
  id: string;
  name: string;
  type: "schedule" | "scores" | "prediction-market" | "odds" | "highlights" | "team-content" | "custom";
  adapter:
    | "openfootball-worldcup-json"
    | "polymarket-gamma"
    | "worldcup26-api"
    | "worldcupapi-com"
    | "football-data-org"
    | "openligadb"
    | "zafronix"
    | "balldontlie-fifa"
    | "generic-json";
  baseUrl: string;
  endpointPath: string;
  apiKey: string;
  apiKeyPlacement: "none" | "query" | "header" | "bearer";
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
- `GET /api/data/sources`

`dateKey` accepts `yesterday`, `today`, or `tomorrow`.

## Adapter Status

- `openfootball-worldcup-json`: implemented and normalized into `Match[]`.
- `polymarket-gamma`: implemented and normalized into `RadarMatch[]` when World Cup/FIFA markets are present.
- Other adapters are configured and fetch-ready, but remain disabled by default until their endpoint shape and quota are verified.
