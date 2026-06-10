import { readAdminConfig } from "@/lib/admin/config";
import {
  getAggregatedMatches,
  getAggregatedMorningBrief,
  getAggregatedNews,
  getAggregatedOdds,
  getAggregatedRadar,
  getAggregatedTeams,
  getDataSourceStatus,
} from "@/lib/data-sources/aggregate";
import { getWorldCupActivity } from "@/lib/data-sources/rate-policy";
import type { ScheduleDateKey } from "@/lib/wc-data";

export interface RefreshTaskResult {
  name: string;
  ok: boolean;
  source?: string;
  count?: number;
  message?: string;
}

export interface RefreshRunResult {
  mode: "scheduled" | "initialize";
  startedAt: string;
  finishedAt: string;
  activity: ReturnType<typeof getWorldCupActivity>;
  tasks: RefreshTaskResult[];
}

async function task(name: string, run: () => Promise<RefreshTaskResult>): Promise<RefreshTaskResult> {
  try {
    return await run();
  } catch (error) {
    return {
      name,
      ok: false,
      message: error instanceof Error ? error.message : "unknown error",
    };
  }
}

function dayWindow(daysAgo: number, now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - daysAgo);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

async function refreshMatches(dateKey: ScheduleDateKey): Promise<RefreshTaskResult> {
  const result = await getAggregatedMatches(dateKey);
  return {
    name: `matches:${dateKey}`,
    ok: true,
    source: result.source,
    count: result.matches.length,
  };
}

async function refreshMorning(dateKey: ScheduleDateKey): Promise<RefreshTaskResult> {
  const result = await getAggregatedMorningBrief(dateKey);
  return {
    name: `morning:${dateKey}`,
    ok: true,
    source: result.source,
    count: result.brief.news.length + result.brief.matches.length,
  };
}

async function refreshNewsWindow(daysAgo: number): Promise<RefreshTaskResult> {
  const { start, end } = dayWindow(daysAgo);
  const result = await getAggregatedNews({
    query: "World Cup 2026 football soccer FIFA",
    limit: 20,
    publishedAfter: start,
    publishedBefore: end,
  });
  return {
    name: `news:last-${daysAgo}d`,
    ok: true,
    source: result.source,
    count: result.articles.length,
    message: result.aggregation.aiMessage,
  };
}

export async function runDataRefresh(mode: "scheduled" | "initialize" = "scheduled"): Promise<RefreshRunResult> {
  const startedAt = new Date();
  const activity = getWorldCupActivity(startedAt);
  const { dataSources } = await readAdminConfig();
  const enabledTypes = new Set(dataSources.filter((source) => source.enabled).map((source) => source.type));
  const tasks: RefreshTaskResult[] = [];

  tasks.push(await task("source-status", async () => {
    const status = await getDataSourceStatus();
    return { name: "source-status", ok: true, count: status.sources.length };
  }));

  if (mode === "initialize" || enabledTypes.has("team-content")) {
    tasks.push(await task("teams", async () => {
      const result = await getAggregatedTeams();
      return { name: "teams", ok: true, source: result.source, count: result.teams.length };
    }));
  }

  if (mode === "initialize" || enabledTypes.has("odds")) {
    tasks.push(await task("odds", async () => {
      const result = await getAggregatedOdds();
      return { name: "odds", ok: true, source: result.source, count: result.oddsMatches.length };
    }));
  }

  if (mode === "initialize" || enabledTypes.has("prediction-market")) {
    tasks.push(await task("radar", async () => {
      const result = await getAggregatedRadar();
      return { name: "radar", ok: true, source: result.source, count: result.radarMatches.length };
    }));
  }

  const scheduleKeys: ScheduleDateKey[] = mode === "initialize"
    ? ["yesterday", "today", "tomorrow"]
    : activity.mode === "match-window"
      ? ["yesterday", "today", "tomorrow"]
      : ["today", "tomorrow"];

  for (const dateKey of scheduleKeys) {
    tasks.push(await task(`matches:${dateKey}`, () => refreshMatches(dateKey)));
  }

  if (mode === "initialize") {
    for (const daysAgo of [0, 1, 2]) {
      tasks.push(await task(`news:last-${daysAgo}d`, () => refreshNewsWindow(daysAgo)));
    }
    for (const dateKey of ["yesterday", "today"] satisfies ScheduleDateKey[]) {
      tasks.push(await task(`morning:${dateKey}`, () => refreshMorning(dateKey)));
    }
  } else if (enabledTypes.has("news")) {
    tasks.push(await task("news:current", async () => {
      const result = await getAggregatedNews({ limit: activity.mode === "match-window" ? 20 : 12 });
      return {
        name: "news:current",
        ok: true,
        source: result.source,
        count: result.articles.length,
        message: result.aggregation.aiMessage,
      };
    }));
    tasks.push(await task("morning:today", () => refreshMorning("today")));
  }

  return {
    mode,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    activity,
    tasks,
  };
}
