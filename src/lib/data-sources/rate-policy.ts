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
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 600,
    note: "Public market API, kept conservative to avoid unnecessary polling.",
  },
  odds: {
    docsUrl: "https://the-odds-api.com/liveapi/guides/v4/",
    monthlyQuota: 500,
    quotaSafetyRatio: 0.8,
    quotaCost: 1,
    quietRefreshSeconds: 21600,
    tournamentRefreshSeconds: 7200,
    matchWindowRefreshSeconds: 3600,
    note: "Starter plan has 500 credits/month. h2h odds for one region cost 1 credit.",
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
    docsUrl: "https://www.espn.com/espn/rss/soccer/news",
    quietRefreshSeconds: 3600,
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 900,
    note: "RSS feed. Poll no faster than 15 minutes.",
  },
  "bbc-sport-football-rss": {
    docsUrl: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    quietRefreshSeconds: 3600,
    tournamentRefreshSeconds: 1800,
    matchWindowRefreshSeconds: 900,
    note: "RSS fallback. Poll no faster than 15 minutes.",
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
  return Math.max(10, desired, providerWindow, quotaIntervalSeconds(policy, activity.mode));
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
    effectiveRefreshSeconds: getEffectiveRefreshSeconds(source, now),
    policy,
  };
}
