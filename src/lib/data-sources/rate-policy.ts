import fifaScheduleData from "@/data/fifa-schedule.json";
import type { DataSourceConfig, DataSourceType } from "@/lib/admin/config";

export type ActivityMode = "off-season" | "tournament" | "match-window";

export interface SourceRatePolicy {
  docsUrl: string;
  officialLimit?: number;
  officialWindowSeconds?: number;
  dailyQuota?: number;
  monthlyQuota?: number;
  quotaSafetyRatio?: number;
  quotaCost?: number;
  quietRefreshSeconds: number;
  tournamentRefreshSeconds: number;
  matchWindowRefreshSeconds: number;
  note: string;
}

interface FifaScheduleData {
  matches: Array<{ kickoffBeijing: string }>;
}

const schedule = fifaScheduleData as FifaScheduleData;
const matchWindowBeforeMs = 2 * 60 * 60 * 1000;
const matchWindowAfterMs = 4 * 60 * 60 * 1000;
const tournamentWarmupMs = 7 * 24 * 60 * 60 * 1000;
const tournamentCooldownMs = 2 * 24 * 60 * 60 * 1000;

const kickoffTimes = schedule.matches
  .map((match) => new Date(match.kickoffBeijing).getTime())
  .filter(Number.isFinite)
  .sort((a, b) => a - b);

const firstKickoff = kickoffTimes[0] || new Date("2026-06-12T05:00:00+08:00").getTime();
const lastKickoff = kickoffTimes.at(-1) || new Date("2026-07-20T03:00:00+08:00").getTime();

export function getWorldCupActivity(now = new Date()): {
  mode: ActivityMode;
  activeMatchCount: number;
  nextKickoffAt?: string;
} {
  const nowMs = now.getTime();
  const activeMatches = kickoffTimes.filter(
    (kickoff) => nowMs >= kickoff - matchWindowBeforeMs && nowMs <= kickoff + matchWindowAfterMs,
  );
  const nextKickoff = kickoffTimes.find((kickoff) => kickoff >= nowMs);
  if (activeMatches.length > 0) {
    return {
      mode: "match-window",
      activeMatchCount: activeMatches.length,
      nextKickoffAt: nextKickoff ? new Date(nextKickoff).toISOString() : undefined,
    };
  }
  if (nowMs >= firstKickoff - tournamentWarmupMs && nowMs <= lastKickoff + tournamentCooldownMs) {
    return {
      mode: "tournament",
      activeMatchCount: 0,
      nextKickoffAt: nextKickoff ? new Date(nextKickoff).toISOString() : undefined,
    };
  }
  return {
    mode: "off-season",
    activeMatchCount: 0,
    nextKickoffAt: nextKickoff ? new Date(nextKickoff).toISOString() : undefined,
  };
}

const defaultPolicyByType: Record<DataSourceType, SourceRatePolicy> = {
  schedule: {
    docsUrl: "local-fifa-pdf",
    quietRefreshSeconds: 86400,
    tournamentRefreshSeconds: 21600,
    matchWindowRefreshSeconds: 3600,
    note: "Static schedule sources should not be polled aggressively.",
  },
  scores: {
    docsUrl: "source-specific",
    officialLimit: 30,
    officialWindowSeconds: 60,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 900,
    matchWindowRefreshSeconds: 120,
    note: "Generic live-score fallback.",
  },
  "prediction-market": {
    docsUrl: "https://docs.polymarket.com/developers/gamma-markets-api/overview",
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 900,
    matchWindowRefreshSeconds: 120,
    note: "Public market API, 2min during match window, 15min during tournament.",
  },
  odds: {
    docsUrl: "https://the-odds-api.com/liveapi/guides/v4/",
    monthlyQuota: 500,
    quotaSafetyRatio: 0.8,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 3600,
    matchWindowRefreshSeconds: 1800,
    note: "Starter plan has 500 credits/month. 30min match window, 60min tournament.",
  },
  highlights: {
    docsUrl: "source-specific",
    quietRefreshSeconds: 86400,
    tournamentRefreshSeconds: 21600,
    matchWindowRefreshSeconds: 3600,
    note: "Highlight links are low-frequency metadata.",
  },
  news: {
    docsUrl: "source-specific",
    quietRefreshSeconds: 3600,
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 900,
    note: "News default follows common RSS/GDELT 15-minute freshness without hammering feeds.",
  },
  "team-content": {
    docsUrl: "source-specific",
    quietRefreshSeconds: 604800,
    tournamentRefreshSeconds: 86400,
    matchWindowRefreshSeconds: 86400,
    note: "Team profiles are slow-moving and should be cached for at least a day.",
  },
  custom: {
    docsUrl: "source-specific",
    quietRefreshSeconds: 3600,
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 900,
    note: "Custom source fallback policy.",
  },
};

const policyBySourceId: Record<string, Partial<SourceRatePolicy>> = {
  "api-football-worldcup-fixtures": {
    docsUrl: "https://www.api-football.com/documentation-v3",
    officialLimit: 300,
    officialWindowSeconds: 60,
    dailyQuota: 7500,
    quotaSafetyRatio: 0.8,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 300,
    matchWindowRefreshSeconds: 60,
    note: "API-Football Pro has 7,500 requests/day. Use one daily fixtures call per schedule date and cache for 60s during match windows.",
  },
  "api-football-worldcup-details": {
    docsUrl: "https://www.api-football.com/documentation-v3",
    officialLimit: 300,
    officialWindowSeconds: 60,
    dailyQuota: 7500,
    quotaSafetyRatio: 0.8,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 300,
    matchWindowRefreshSeconds: 60,
    note: "Uses the fixtures ids parameter to retrieve events, lineups, statistics, and player details in one batched call.",
  },
  "api-football-worldcup-teams": {
    docsUrl: "https://www.api-football.com/documentation-v3",
    officialLimit: 300,
    officialWindowSeconds: 60,
    dailyQuota: 7500,
    quotaSafetyRatio: 0.8,
    quotaCost: 1,
    quietRefreshSeconds: 604800,
    tournamentRefreshSeconds: 86400,
    matchWindowRefreshSeconds: 86400,
    note: "Team metadata changes slowly. Refresh at most daily during the tournament.",
  },
  "api-football-worldcup-standings": {
    docsUrl: "https://www.api-football.com/documentation-v3",
    officialLimit: 300,
    officialWindowSeconds: 60,
    dailyQuota: 7500,
    quotaSafetyRatio: 0.8,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 900,
    matchWindowRefreshSeconds: 300,
    note: "World Cup standings are authoritative team-page data. Tighten to 5 minutes only around match windows.",
  },
  "api-football-worldcup-squads": {
    docsUrl: "https://www.api-football.com/documentation-v3",
    officialLimit: 300,
    officialWindowSeconds: 60,
    dailyQuota: 7500,
    quotaSafetyRatio: 0.8,
    quotaCost: 1,
    quietRefreshSeconds: 604800,
    tournamentRefreshSeconds: 86400,
    matchWindowRefreshSeconds: 86400,
    note: "Squads are fetched per team and should be cached daily.",
  },
  "api-football-worldcup-injuries": {
    docsUrl: "https://www.api-football.com/documentation-v3",
    officialLimit: 300,
    officialWindowSeconds: 60,
    dailyQuota: 7500,
    quotaSafetyRatio: 0.8,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 3600,
    matchWindowRefreshSeconds: 1800,
    note: "Injuries change more often than squads but should not be hit on every page view.",
  },
  "api-football-worldcup-odds": {
    docsUrl: "https://www.api-football.com/documentation-v3",
    officialLimit: 300,
    officialWindowSeconds: 60,
    dailyQuota: 7500,
    quotaSafetyRatio: 0.8,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 900,
    matchWindowRefreshSeconds: 300,
    note: "Pre-match odds are canonical odds fallback behind live odds.",
  },
  "api-football-worldcup-live-odds": {
    docsUrl: "https://www.api-football.com/documentation-v3",
    officialLimit: 300,
    officialWindowSeconds: 60,
    dailyQuota: 7500,
    quotaSafetyRatio: 0.8,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 300,
    matchWindowRefreshSeconds: 60,
    note: "Live odds are refreshed at match cadence and cached through the raw fetch cache.",
  },
  "api-football-worldcup-predictions": {
    docsUrl: "https://www.api-football.com/documentation-v3",
    officialLimit: 300,
    officialWindowSeconds: 60,
    dailyQuota: 7500,
    quotaSafetyRatio: 0.8,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 900,
    note: "Predictions are fetched per fixture and cached; they are not second-by-second live data.",
  },
  "football-data-org": {
    docsUrl: "https://www.football-data.org/pricing",
    officialLimit: 10,
    officialWindowSeconds: 60,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 900,
    matchWindowRefreshSeconds: 120,
    note: "Free plan lists 10 calls/minute; use cached match payloads and only tighten during match windows.",
  },
  "football-data-org-teams": {
    docsUrl: "https://www.football-data.org/pricing",
    officialLimit: 10,
    officialWindowSeconds: 60,
    quietRefreshSeconds: 604800,
    tournamentRefreshSeconds: 86400,
    matchWindowRefreshSeconds: 86400,
    note: "Team data changes slowly; refresh at most daily during tournament.",
  },
  "the-odds-api-worldcup": {
    docsUrl: "https://the-odds-api.com/",
    monthlyQuota: 500,
    quotaSafetyRatio: 0.75,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 7200,
    matchWindowRefreshSeconds: 3600,
    note: "Free starter quota is 500 credits/month; current request uses one region and h2h market, costing 1 credit.",
  },
  "odds-api-io-worldcup": {
    docsUrl: "https://docs.odds-api.io/",
    officialLimit: 100,
    officialWindowSeconds: 3600,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 900,
    note: "Free key is observed at 100 requests/hour. Use only as tools-page odds fallback and batch /odds/multi by 10 events.",
  },
  "thesportsdb-worldcup": {
    docsUrl: "https://www.thesportsdb.com/api.php",
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 3600,
    matchWindowRefreshSeconds: 900,
    note: "Free legacy key does not publish a clear quota; keep as low-priority conservative fallback.",
  },
  "thesportsdb-worldcup-teams": {
    docsUrl: "https://www.thesportsdb.com/api.php",
    quietRefreshSeconds: 604800,
    tournamentRefreshSeconds: 86400,
    matchWindowRefreshSeconds: 86400,
    note: "Team endpoint is a fallback and free key has result limits.",
  },
  "espn-soccer-rss": {
    docsUrl: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news",
    quietRefreshSeconds: 3600,
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 900,
    note: "ESPN Site API FIFA World Cup news endpoint. Poll no faster than 15 minutes.",
  },
  "chinanews-sports-rss": {
    docsUrl: "https://www.chinanews.com/rss/",
    quietRefreshSeconds: 3600,
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 900,
    note: "Chinese sports RSS. Poll no faster than 15 minutes and filter to World Cup football terms.",
  },
  "bbc-sport-football-rss": {
    docsUrl: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    quietRefreshSeconds: 3600,
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 900,
    note: "RSS fallback. Poll no faster than 15 minutes.",
  },
  "people-sports-rss": {
    docsUrl: "http://www.people.com.cn/rss/sports.xml",
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 3600,
    matchWindowRefreshSeconds: 1800,
    note: "Chinese sports RSS fallback. Default disabled because the feed can lag behind current news.",
  },
  "currents-worldcup-news": {
    docsUrl: "https://currentsapi.services/en/docs/",
    dailyQuota: 1000,
    quotaSafetyRatio: 0.5,
    quotaCost: 1,
    quietRefreshSeconds: 3600,
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 900,
    note: "Free account documents 1,000 daily requests. Reserve half for manual/admin use.",
  },
  "gdelt-worldcup-news": {
    docsUrl: "https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/",
    quietRefreshSeconds: 3600,
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 900,
    note: "GDELT 2.0 updates every 15 minutes, so faster polling adds no freshness.",
  },
  "newsapi-worldcup": {
    docsUrl: "https://newsapi.org/pricing",
    dailyQuota: 100,
    quotaSafetyRatio: 0.5,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 7200,
    matchWindowRefreshSeconds: 3600,
    note: "Developer plan is 100 requests/day and for development/testing only.",
  },
};

export function getRatePolicyForSource(source: DataSourceConfig): SourceRatePolicy {
  const base = defaultPolicyByType[source.type] || defaultPolicyByType.custom;
  return { ...base, ...(policyBySourceId[source.id] || {}) };
}

function quotaIntervalSeconds(policy: SourceRatePolicy, mode: ActivityMode): number {
  const safety = policy.quotaSafetyRatio ?? 0.8;
  const quotaCost = Math.max(1, policy.quotaCost || 1);
  const dailyBudget = policy.dailyQuota
    ? Math.max(1, Math.floor((policy.dailyQuota * safety) / quotaCost))
    : 0;
  const monthlyBudget = policy.monthlyQuota
    ? Math.max(1, Math.floor((policy.monthlyQuota * safety) / 31 / quotaCost))
    : 0;
  const budget = dailyBudget && monthlyBudget ? Math.min(dailyBudget, monthlyBudget) : dailyBudget || monthlyBudget;
  if (!budget) return 0;
  const multiplier = mode === "match-window" ? 0.6 : mode === "tournament" ? 1 : 2;
  return Math.ceil((86400 / budget) * multiplier);
}

function configuredRefreshSeconds(source: DataSourceConfig): number {
  const values = [source.cacheTtlSeconds, source.refreshSeconds]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 10);
  return values.length ? Math.max(...values) : 0;
}

export function getEffectiveRefreshSeconds(source: DataSourceConfig, now = new Date()): number {
  const policy = getRatePolicyForSource(source);
  const activity = getWorldCupActivity(now);
  const desired =
    activity.mode === "match-window"
      ? policy.matchWindowRefreshSeconds
      : activity.mode === "tournament"
        ? policy.tournamentRefreshSeconds
        : policy.quietRefreshSeconds;
  const providerWindow = policy.officialLimit && policy.officialWindowSeconds
    ? Math.ceil(policy.officialWindowSeconds / Math.max(1, policy.officialLimit)) + 1
    : 0;
  return Math.max(
    10,
    configuredRefreshSeconds(source),
    desired,
    providerWindow,
    quotaIntervalSeconds(policy, activity.mode),
  );
}

export function getSourceRefreshPlan(source: DataSourceConfig, now = new Date()) {
  const policy = getRatePolicyForSource(source);
  const activity = getWorldCupActivity(now);
  return {
    sourceId: source.id,
    sourceName: source.name,
    type: source.type,
    activityMode: activity.mode,
    activeMatchCount: activity.activeMatchCount,
    nextKickoffAt: activity.nextKickoffAt,
    configuredRefreshSeconds: configuredRefreshSeconds(source),
    effectiveRefreshSeconds: getEffectiveRefreshSeconds(source, now),
    policy,
  };
}
