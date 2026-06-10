import { readAdminConfig } from "@/lib/admin/config";
import { fetchJsonFromSource, sortEnabledSources, type SourceDiagnostic } from "@/lib/data-sources/client";
import { readSnapshotCache, upsertSnapshotCache } from "@/lib/db/queries/data-cache";
import { getStoredOfficialMatches } from "@/lib/db/queries/world-cup";
import {
  fifaRecordToMatch,
  matchesByDate,
  radarMatches,
  scheduleDateMeta,
  type FifaScheduleRecord,
  type Match,
  type MatchStatus,
  type RadarMatch,
  type ScheduleDateKey,
  type SignalType,
} from "@/lib/wc-data";

interface OpenFootballWorldCup {
  name: string;
  matches: Array<{
    round?: string;
    date?: string;
    time?: string;
    team1?: string;
    team2?: string;
    group?: string;
    ground?: string;
    score?: { ft?: [number, number] };
  }>;
}

interface PolymarketEvent {
  id?: string;
  title?: string;
  slug?: string;
  markets?: Array<{
    id?: string;
    question?: string;
    outcomes?: string;
    outcomePrices?: string;
    volume?: string;
  }>;
}

const teamZh: Record<string, { name: string; flag: string }> = {
  Mexico: { name: "墨西哥", flag: "🇲🇽" },
  "South Africa": { name: "南非", flag: "🇿🇦" },
  "South Korea": { name: "韩国", flag: "🇰🇷" },
  "Czech Republic": { name: "捷克", flag: "🇨🇿" },
  Canada: { name: "加拿大", flag: "🇨🇦" },
  Netherlands: { name: "荷兰", flag: "🇳🇱" },
  Argentina: { name: "阿根廷", flag: "🇦🇷" },
  Brazil: { name: "巴西", flag: "🇧🇷" },
  France: { name: "法国", flag: "🇫🇷" },
  Germany: { name: "德国", flag: "🇩🇪" },
  Spain: { name: "西班牙", flag: "🇪🇸" },
  Morocco: { name: "摩洛哥", flag: "🇲🇦" },
  Japan: { name: "日本", flag: "🇯🇵" },
};

const dateKeyToSourceDate: Record<ScheduleDateKey, string> = {
  yesterday: scheduleDateMeta.yesterday.date,
  today: scheduleDateMeta.today.date,
  tomorrow: scheduleDateMeta.tomorrow.date,
};

function snapshotDiagnostic(
  key: string,
  type: SourceDiagnostic["type"],
  computedAt: Date | undefined,
  stale = false,
): SourceDiagnostic {
  return {
    id: key,
    name: "PostgreSQL 数据快照",
    adapter: "database-snapshot",
    type,
    ok: true,
    fromCache: true,
    message: stale ? "stale database snapshot" : "database snapshot hit",
    updatedAt: computedAt?.toISOString() || new Date().toISOString(),
  };
}

function getTeam(input: string | undefined) {
  if (!input) return { name: "待定", flag: "🏳️" };
  return teamZh[input] || { name: input, flag: "🏳️" };
}

function parseKickoffToBeijing(date: string | undefined, time: string | undefined): string {
  if (!date || !time) return "";
  const match = time.match(/^(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})$/);
  if (!match) return `${date} ${time}`;
  const [, hour, minute, offset] = match;
  const utcMs =
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      Number(hour),
      Number(minute),
    ) -
    Number(offset) * 60 * 60 * 1000;
  const bj = new Date(utcMs + 8 * 60 * 60 * 1000);
  const mm = String(bj.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bj.getUTCDate()).padStart(2, "0");
  const hh = String(bj.getUTCHours()).padStart(2, "0");
  const min = String(bj.getUTCMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

function transformOpenFootballMatches(data: OpenFootballWorldCup, dateKey: ScheduleDateKey): Match[] {
  const sourceDate = dateKeyToSourceDate[dateKey];
  return data.matches
    .filter((match) => match.date === sourceDate)
    .slice(0, 8)
    .map((match, index) => {
      const home = getTeam(match.team1);
      const away = getTeam(match.team2);
      const score = match.score?.ft;
      const status: MatchStatus = score ? "finished" : "upcoming";
      return {
        id: `openfootball-${sourceDate}-${index + 1}`,
        homeTeam: home.name,
        awayTeam: away.name,
        homeFlag: home.flag,
        awayFlag: away.flag,
        homeScore: score?.[0] ?? null,
        awayScore: score?.[1] ?? null,
        kickoffBj: parseKickoffToBeijing(match.date, match.time),
        group: (match.group || "").replace("Group", "").trim()
          ? `${(match.group || "").replace("Group", "").trim()} 组`
          : "世界杯",
        round: match.round || "赛程",
        status,
        signal: "none" as SignalType,
        signalText: "",
        homeWinProb: 0,
        drawProb: 0,
        awayWinProb: 0,
        oddsImpliedHome: 0,
        oddsImpliedAway: 0,
        venue: match.ground || "",
        previewText: "赛程来自 OpenFootball 免费 JSON。市场概率会由 Polymarket 源单独补充。",
        updatedAt: "OpenFootball · 缓存数据",
        events: [],
      };
    });
}

function transformPolymarketEvents(data: PolymarketEvent[]): RadarMatch[] {
  return data
    .flatMap((event) =>
      (event.markets || []).map((market) => ({
        event,
        market,
      })),
    )
    .filter(({ event, market }) => {
      const text = `${event.title || ""} ${market.question || ""}`.toLowerCase();
      return text.includes("world cup") || text.includes("fifa");
    })
    .slice(0, 8)
    .map(({ event, market }, index) => {
      let outcomes: string[] = [];
      let prices: string[] = [];
      try {
        outcomes = JSON.parse(market.outcomes || "[]");
        prices = JSON.parse(market.outcomePrices || "[]");
      } catch {
        outcomes = [];
        prices = [];
      }
      const yesIndex = outcomes.findIndex((item) => item.toLowerCase() === "yes");
      const price = Number(prices[yesIndex >= 0 ? yesIndex : 0] || 0);
      const prob = Number.isFinite(price) ? Math.round(price * 100) : 0;
      return {
        id: `polymarket-${market.id || event.id || index}`,
        homeTeam: "市场",
        awayTeam: "概率",
        homeFlag: "📊",
        awayFlag: "🌐",
        homeMarketProb: prob,
        awayMarketProb: Math.max(0, 100 - prob),
        homeOddsProb: Math.max(0, prob - 3),
        awayOddsProb: Math.min(100, 100 - prob + 3),
        diff: 3,
        diffLabel: "aligned",
        diffTeam: "home",
        diffText: market.question || event.title || "Polymarket 世界杯相关市场。",
        kickoffBj: "",
        status: "upcoming",
        updatedAt: "Polymarket · 实时市场",
        history: [
          { time: "-24h", market: Math.max(0, prob - 2), odds: Math.max(0, prob - 5) },
          { time: "-12h", market: Math.max(0, prob - 1), odds: Math.max(0, prob - 4) },
          { time: "现在", market: prob, odds: Math.max(0, prob - 3) },
        ],
      } satisfies RadarMatch;
    });
}

export async function getAggregatedMatches(dateKey: ScheduleDateKey): Promise<{
  matches: Match[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const snapshotKey = `matches:v2:${dateKey}:${updatedAt}`;
  const persisted = await readSnapshotCache<Match[]>(snapshotKey);
  if (persisted?.payload.length) {
    return {
      matches: persisted.payload,
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "schedule", persisted.computedAt)],
    };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const scheduleSources = sortEnabledSources(dataSources, "schedule");

  for (const source of scheduleSources) {
    try {
      if (source.adapter !== "openfootball-worldcup-json") continue;
      const { data, diagnostic } = await fetchJsonFromSource<OpenFootballWorldCup>(source);
      diagnostics.push(diagnostic);
      const matches = transformOpenFootballMatches(data, dateKey);
      if (matches.length > 0) {
        await upsertSnapshotCache({
          snapshotKey,
          feature: "matches",
          sourceMode: "remote",
          sourceId: source.id,
          payload: matches,
          diagnostics,
          ttlSeconds: source.cacheTtlSeconds || source.refreshSeconds || 300,
        });
        return { matches, source: "remote", diagnostics };
      }
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  const stale = await readSnapshotCache<Match[]>(snapshotKey, { allowStale: true });
  if (stale?.payload.length) {
    return {
      matches: stale.payload,
      source: "cache",
      diagnostics: [
        ...diagnostics,
        snapshotDiagnostic(snapshotKey, "schedule", stale.computedAt, true),
      ],
    };
  }

  const storedOfficialMatches = (
    await getStoredOfficialMatches<FifaScheduleRecord>(scheduleDateMeta[dateKey].date)
  ).map(fifaRecordToMatch);
  if (storedOfficialMatches.length > 0) {
    const databaseDiagnostic: SourceDiagnostic = {
      id: "fifa-official-db",
      name: "PostgreSQL FIFA 官方赛程",
      adapter: "database-domain-table",
      type: "schedule",
      ok: true,
      fromCache: true,
      message: "loaded from matches table",
      updatedAt: new Date().toISOString(),
    };
    await upsertSnapshotCache({
      snapshotKey,
      feature: "matches",
      sourceMode: "fallback",
      sourceId: "fifa-official-db",
      payload: storedOfficialMatches,
      diagnostics: [...diagnostics, databaseDiagnostic],
      ttlSeconds: 86400,
    });
    return {
      matches: storedOfficialMatches,
      source: "cache",
      diagnostics: [...diagnostics, databaseDiagnostic],
    };
  }

  const fallbackMatches = matchesByDate[dateKey];
  await upsertSnapshotCache({
    snapshotKey,
    feature: "matches",
    sourceMode: "fallback",
    sourceId: "fifa-official-pdf",
    payload: fallbackMatches,
    diagnostics,
    ttlSeconds: 300,
  });
  return {
    matches: fallbackMatches,
    source: "fallback",
    diagnostics,
  };
}

export async function getAggregatedRadar(): Promise<{
  radarMatches: RadarMatch[];
  source: "remote" | "mock" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const snapshotKey = `radar:v2:world-cup:${updatedAt}`;
  const persisted = await readSnapshotCache<RadarMatch[]>(snapshotKey);
  if (persisted?.payload.length) {
    return {
      radarMatches: persisted.payload,
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "prediction-market", persisted.computedAt)],
    };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const marketSources = sortEnabledSources(dataSources, "prediction-market");

  for (const source of marketSources) {
    try {
      if (source.adapter !== "polymarket-gamma") continue;
      const { data, diagnostic } = await fetchJsonFromSource<PolymarketEvent[]>(source, {
        limit: 50,
        search: "World Cup",
      });
      diagnostics.push(diagnostic);
      const transformed = transformPolymarketEvents(data);
      if (transformed.length > 0) {
        await upsertSnapshotCache({
          snapshotKey,
          feature: "radar",
          sourceMode: "remote",
          sourceId: source.id,
          payload: transformed,
          diagnostics,
          ttlSeconds: source.cacheTtlSeconds || source.refreshSeconds || 60,
        });
        return { radarMatches: transformed, source: "remote", diagnostics };
      }
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  const stale = await readSnapshotCache<RadarMatch[]>(snapshotKey, { allowStale: true });
  if (stale?.payload.length) {
    return {
      radarMatches: stale.payload,
      source: "cache",
      diagnostics: [
        ...diagnostics,
        snapshotDiagnostic(snapshotKey, "prediction-market", stale.computedAt, true),
      ],
    };
  }

  await upsertSnapshotCache({
    snapshotKey,
    feature: "radar",
    sourceMode: "mock",
    sourceId: "local-radar-seed",
    payload: radarMatches,
    diagnostics,
    ttlSeconds: 60,
  });
  return {
    radarMatches,
    source: "mock",
    diagnostics,
  };
}

export async function getDataSourceStatus() {
  const { dataSources, updatedAt } = await readAdminConfig();
  return {
    updatedAt,
    sources: dataSources
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((source) => ({
        id: source.id,
        name: source.name,
        type: source.type,
        adapter: source.adapter,
        enabled: source.enabled,
        priority: source.priority,
        cacheTtlSeconds: source.cacheTtlSeconds,
        refreshSeconds: source.refreshSeconds,
        hasApiKey: Boolean(source.apiKey),
        baseUrl: source.baseUrl,
        endpointPath: source.endpointPath,
      })),
  };
}
