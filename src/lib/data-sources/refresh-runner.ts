import { getPlayerRoastSnapshot } from "@/lib/ai/player-roasts";
import { getTeamRoastSnapshot } from "@/lib/ai/team-roasts";
import { readAdminConfig } from "@/lib/admin/config";
import {
  getAggregatedMatches,
  getAggregatedMorningBrief,
  getAggregatedNews,
  getAggregatedOdds,
  getAggregatedRadar,
  getAggregatedTeams,
  getDataSourceStatus,
  MORNING_BRIEF_NEWS_LIMIT,
  NEWS_TRANSLATION_LIMIT,
} from "@/lib/data-sources/aggregate";
import { getWorldCupActivity } from "@/lib/data-sources/rate-policy";
import { recordIngestionRun } from "@/lib/db/queries/ingestion-runs";
import { teamsWithBuiltInProfilesFromOfficialSchedule } from "@/lib/team-profiles";
import { morningBriefTranslationArticle, translateArticleAndCache } from "@/lib/translation/article-translation";
import {
  allScheduleDayGroups,
  beijingScheduleUtcDayBounds,
  getScheduleDateMeta,
  type ScheduleDateKey,
  type ScheduleUtcDayBounds,
} from "@/lib/wc-data";

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

function featureForTaskName(name: string): string {
  return name.split(":")[0] || name;
}

async function task(name: string, run: () => Promise<RefreshTaskResult>): Promise<RefreshTaskResult> {
  const startedAt = new Date();
  try {
    const result = await run();
    await recordIngestionRun({
      sourceId: name,
      feature: featureForTaskName(name),
      status: result.ok ? "succeeded" : "failed",
      startedAt,
      finishedAt: new Date(),
      recordsRead: result.count || 0,
      recordsWritten: result.count || 0,
      errorMessage: result.ok ? undefined : result.message,
      metadata: {
        task: name,
        source: result.source,
        message: result.message,
      },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await recordIngestionRun({
      sourceId: name,
      feature: featureForTaskName(name),
      status: "failed",
      startedAt,
      finishedAt: new Date(),
      errorMessage: message,
      metadata: { task: name },
    });
    return {
      name,
      ok: false,
      message,
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

async function refreshMatches(
  dateKey: ScheduleDateKey,
  options: { sourceDate?: string; dateRange?: ScheduleUtcDayBounds } = {},
): Promise<RefreshTaskResult> {
  const result = await getAggregatedMatches(dateKey, { cacheMode: "refresh", ...options });
  return {
    name: options.sourceDate ? `matches:${options.sourceDate}` : `matches:${dateKey}`,
    ok: true,
    source: result.source,
    count: result.matches.length,
  };
}

function historicalScheduleDates(): Array<{ date: string; bounds: ScheduleUtcDayBounds }> {
  const today = getScheduleDateMeta().today.date;
  return allScheduleDayGroups.flatMap((day) => {
    if (day.date >= today) return [];
    const bounds = beijingScheduleUtcDayBounds(day.date);
    return bounds ? [{ date: day.date, bounds }] : [];
  });
}

async function refreshMorning(dateKey: ScheduleDateKey): Promise<RefreshTaskResult> {
  const result = await getAggregatedMorningBrief(dateKey, { cacheMode: "refresh" });
  await translateArticleAndCache(morningBriefTranslationArticle(result.brief));
  for (const article of result.brief.news.slice(0, NEWS_TRANSLATION_LIMIT)) {
    await translateArticleAndCache(article);
  }
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
    limit: MORNING_BRIEF_NEWS_LIMIT,
    publishedAfter: start,
    publishedBefore: end,
    cacheMode: "refresh",
  });
  for (const article of result.articles.slice(0, NEWS_TRANSLATION_LIMIT)) {
    await translateArticleAndCache(article);
  }
  return {
    name: `news:last-${daysAgo}d`,
    ok: true,
    source: result.source,
    count: result.articles.length,
    message: result.aggregation.aiMessage,
  };
}

async function refreshTeamRoasts(mode: "scheduled" | "initialize"): Promise<RefreshTaskResult> {
  const snapshot = await getTeamRoastSnapshot(teamsWithBuiltInProfilesFromOfficialSchedule(), {
    cacheMode: mode === "initialize" ? "refresh" : "cache-first",
  });
  return {
    name: "team-roasts",
    ok: Boolean(snapshot),
    source: snapshot?.aiUsed ? snapshot.aiProvider || "ai" : "rules",
    count: snapshot?.items.length || 0,
    message: snapshot?.message,
  };
}

async function refreshPlayerRoasts(mode: "scheduled" | "initialize"): Promise<RefreshTaskResult> {
  const snapshot = await getPlayerRoastSnapshot(teamsWithBuiltInProfilesFromOfficialSchedule(), {
    cacheMode: mode === "initialize" ? "refresh" : "cache-first",
  });
  return {
    name: "player-roasts",
    ok: Boolean(snapshot),
    source: snapshot?.aiUsed ? snapshot.aiProvider || "ai" : "rules",
    count: snapshot?.items.length || 0,
    message: snapshot?.message,
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
      const result = await getAggregatedTeams({ cacheMode: "refresh" });
      return { name: "teams", ok: true, source: result.source, count: result.teams.length };
    }));
  }

  if (mode === "initialize" || enabledTypes.has("odds")) {
    tasks.push(await task("odds", async () => {
      const result = await getAggregatedOdds({ cacheMode: "refresh" });
      return { name: "odds", ok: true, source: result.source, count: result.oddsMatches.length };
    }));
  }

  if (mode === "initialize" || enabledTypes.has("prediction-market")) {
    tasks.push(await task("radar", async () => {
      const result = await getAggregatedRadar({ cacheMode: "refresh" });
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

  if (mode === "initialize" || activity.mode !== "off-season") {
    for (const historical of historicalScheduleDates()) {
      tasks.push(await task(`matches:history:${historical.date}`, () =>
        refreshMatches("today", { sourceDate: historical.date, dateRange: historical.bounds })));
    }
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
      const result = await getAggregatedNews({ limit: MORNING_BRIEF_NEWS_LIMIT, cacheMode: "refresh" });
      for (const article of result.articles.slice(0, NEWS_TRANSLATION_LIMIT)) {
        await translateArticleAndCache(article);
      }
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

  tasks.push(await task("team-roasts", () => refreshTeamRoasts(mode)));
  tasks.push(await task("player-roasts", () => refreshPlayerRoasts(mode)));

  return {
    mode,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    activity,
    tasks,
  };
}
