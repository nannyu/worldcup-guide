import {
  enqueueCacheCleanup,
  enqueueMatchesRefresh,
  enqueueMorningRefresh,
  enqueueNewsRefresh,
  enqueueOddsRefresh,
  enqueuePlayerRoastsRefresh,
  enqueueRadarRefresh,
  enqueueTeamRoastsRefresh,
  enqueueTeamsRefresh,
} from "@/lib/background/tasks";
import { getWorldCupActivity, type ActivityMode } from "@/lib/data-sources/rate-policy";
import { getLastJobTimestamp } from "@/lib/db/queries/background-jobs";
import {
  allScheduleDayGroups,
  beijingScheduleUtcDayBounds,
  getScheduleDateMeta,
  type ScheduleDateKey,
} from "@/lib/wc-data";

type ScheduledRefresh = {
  id: string;
  intervalMs: number;
  enqueue: () => Promise<unknown>;
};

export type SchedulerRunResult = {
  activityMode: ActivityMode;
  enqueued: string[];
  skipped: string[];
  errors: Array<{ id: string; message: string }>;
};

const lastEnqueuedAt = new Map<string, number>();
let warmedUpFromDb = false;

function envMs(name: string, fallbackMs: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 1000 ? value : fallbackMs;
}

function intervalFor(mode: ActivityMode, values: {
  matchWindow: number;
  tournament: number;
  offSeason: number;
}): number {
  if (mode === "match-window") return values.matchWindow;
  if (mode === "tournament") return values.tournament;
  return values.offSeason;
}

function matchDateKeys(mode: ActivityMode): ScheduleDateKey[] {
  return mode === "match-window" ? ["yesterday", "today", "tomorrow"] : ["today", "tomorrow"];
}

function historicalMatchRefreshes(mode: ActivityMode): ScheduledRefresh[] {
  if (mode === "off-season") return [];
  const today = getScheduleDateMeta().today.date;
  const intervalMs = envMs("WORKER_HISTORICAL_MATCH_REFRESH_MS", 6 * 60 * 60_000);
  return allScheduleDayGroups
    .filter((day) => day.date < today)
    .flatMap((day) => {
      const bounds = beijingScheduleUtcDayBounds(day.date);
      return bounds
        ? [{
            id: `matches:history:${day.date}`,
            intervalMs,
            enqueue: () => enqueueMatchesRefresh("today", { sourceDate: day.date, dateRange: bounds }),
          }]
        : [];
    });
}

function scheduledRefreshes(mode: ActivityMode): ScheduledRefresh[] {
  const matchIntervalMs = intervalFor(mode, {
    matchWindow: envMs("WORKER_MATCH_WINDOW_REFRESH_MS", 60_000),
    tournament: envMs("WORKER_TOURNAMENT_MATCH_REFRESH_MS", 15 * 60_000),
    offSeason: envMs("WORKER_QUIET_MATCH_REFRESH_MS", 60 * 60_000),
  });
  const newsIntervalMs = intervalFor(mode, {
    matchWindow: envMs("WORKER_MATCH_WINDOW_NEWS_REFRESH_MS", 15 * 60_000),
    tournament: envMs("WORKER_TOURNAMENT_NEWS_REFRESH_MS", 30 * 60_000),
    offSeason: envMs("WORKER_QUIET_NEWS_REFRESH_MS", 60 * 60_000),
  });
  const marketIntervalMs = intervalFor(mode, {
    matchWindow: envMs("WORKER_MATCH_WINDOW_MARKET_REFRESH_MS", 10_000),
    tournament: envMs("WORKER_TOURNAMENT_MARKET_REFRESH_MS", 15 * 60_000),
    offSeason: envMs("WORKER_QUIET_MARKET_REFRESH_MS", 6 * 60 * 60_000),
  });
  const oddsIntervalMs = intervalFor(mode, {
    matchWindow: envMs("WORKER_MATCH_WINDOW_ODDS_REFRESH_MS", 30 * 60_000),
    tournament: envMs("WORKER_TOURNAMENT_ODDS_REFRESH_MS", 60 * 60_000),
    offSeason: envMs("WORKER_QUIET_ODDS_REFRESH_MS", 6 * 60 * 60_000),
  });

  return [
    ...matchDateKeys(mode).map((dateKey) => ({
      id: `matches:${dateKey}`,
      intervalMs: matchIntervalMs,
      enqueue: () => enqueueMatchesRefresh(dateKey),
    })),
    ...historicalMatchRefreshes(mode),
    {
      id: "news:current",
      intervalMs: newsIntervalMs,
      enqueue: () => enqueueNewsRefresh({}),
    },
    {
      id: "morning:today",
      intervalMs: newsIntervalMs,
      enqueue: () => enqueueMorningRefresh("today"),
    },
    {
      id: "radar",
      intervalMs: marketIntervalMs,
      enqueue: enqueueRadarRefresh,
    },
    {
      id: "odds",
      intervalMs: oddsIntervalMs,
      enqueue: enqueueOddsRefresh,
    },
    {
      id: "teams",
      intervalMs: envMs("WORKER_TEAMS_REFRESH_MS", 24 * 60 * 60_000),
      enqueue: enqueueTeamsRefresh,
    },
    {
      id: "team-roasts",
      intervalMs: envMs("WORKER_TEAM_ROASTS_REFRESH_MS", 6 * 60 * 60_000),
      enqueue: enqueueTeamRoastsRefresh,
    },
    {
      id: "player-roasts",
      intervalMs: envMs("WORKER_PLAYER_ROASTS_REFRESH_MS", 6 * 60 * 60_000),
      enqueue: enqueuePlayerRoastsRefresh,
    },
    {
      id: "cache-cleanup",
      intervalMs: envMs("WORKER_CACHE_CLEANUP_REFRESH_MS", 24 * 60 * 60_000),
      enqueue: enqueueCacheCleanup,
    },
  ];
}

export async function enqueueDueRefreshJobs(now = new Date()): Promise<SchedulerRunResult> {
  const activity = getWorldCupActivity(now);
  const nowMs = now.getTime();
  const result: SchedulerRunResult = {
    activityMode: activity.mode,
    enqueued: [],
    skipped: [],
    errors: [],
  };

  const jobs = scheduledRefreshes(activity.mode);

  // On first call after process start, warm up lastEnqueuedAt from DB to prevent thundering herd
  if (!warmedUpFromDb) {
    warmedUpFromDb = true;
    await Promise.all(
      jobs.map(async (job) => {
        const ts = await getLastJobTimestamp(job.id);
        if (ts > 0) lastEnqueuedAt.set(job.id, ts);
      }),
    );
  }

  for (const job of jobs) {
    const last = lastEnqueuedAt.get(job.id) || 0;
    if (nowMs - last < job.intervalMs) {
      result.skipped.push(job.id);
      continue;
    }

    try {
      await job.enqueue();
      lastEnqueuedAt.set(job.id, nowMs);
      result.enqueued.push(job.id);
    } catch (error) {
      result.errors.push({
        id: job.id,
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return result;
}
