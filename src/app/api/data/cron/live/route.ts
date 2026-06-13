import { type NextRequest, NextResponse } from "next/server";
import { getAggregatedMatches } from "@/lib/data-sources/aggregate";
import { allMatches, scheduleDateMeta, type Match, type ScheduleDateKey } from "@/lib/wc-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const allowedDateKeys = new Set<ScheduleDateKey>(["yesterday", "today", "tomorrow"]);
const matchRefreshSeconds = 60;
const quietRefreshSeconds = 3600;
const matchWindowBeforeMs = 10 * 60 * 1000;
const matchWindowAfterMs = 3 * 60 * 60 * 1000;

function authorize(request: NextRequest): NextResponse | undefined {
  const expected = process.env.CRON_SECRET;
  if (!expected && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is required" }, { status: 500 });
  }
  if (expected && request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return undefined;
}

function parseDateKeys(request: NextRequest): ScheduleDateKey[] {
  const requested = request.nextUrl.searchParams
    .get("dateKeys")
    ?.split(",")
    .map((value) => value.trim())
    .filter((value): value is ScheduleDateKey => allowedDateKeys.has(value as ScheduleDateKey));

  if (requested?.length) return Array.from(new Set(requested));
  return ["yesterday", "today"];
}

function activeMatchCountForDateKey(dateKey: ScheduleDateKey, now = new Date()): number {
  const date = scheduleDateMeta[dateKey].date;
  const nowMs = now.getTime();
  return allMatches.filter((match) => {
    if (!match.kickoffAt || !match.kickoffAt.startsWith(date)) return false;
    const kickoffMs = new Date(match.kickoffAt).getTime();
    return Number.isFinite(kickoffMs)
      && nowMs >= kickoffMs - matchWindowBeforeMs
      && nowMs <= kickoffMs + matchWindowAfterMs;
  }).length;
}

function cacheComputedAt(matchesResult: Awaited<ReturnType<typeof getAggregatedMatches>>): Date | undefined {
  const candidates = matchesResult.diagnostics
    .map((item) => new Date(item.updatedAt))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());
  return candidates[0];
}

function shouldRefreshLiveMatches(activeMatchCount: number, cacheAgeSeconds: number | null): boolean {
  if (cacheAgeSeconds === null) return true;
  if (activeMatchCount > 0) {
    return cacheAgeSeconds >= matchRefreshSeconds;
  }
  return cacheAgeSeconds >= quietRefreshSeconds;
}

function summarizeMatches(matches: Match[]) {
  return matches.map((match) => ({
    id: match.id,
    status: match.status,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    events: match.events?.length || 0,
    lineups: match.lineups?.length || 0,
    statistics: match.statistics?.length || 0,
    updatedAt: match.updatedAt,
  }));
}

export async function GET(request: NextRequest) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  const dateKeys = parseDateKeys(request);
  const results = [];
  const now = new Date();

  for (const dateKey of dateKeys) {
    const cached = await getAggregatedMatches(dateKey, { cacheMode: "cache-only" });
    const activeMatchCount = activeMatchCountForDateKey(dateKey, now);
    const refreshIntervalSeconds = activeMatchCount > 0 ? matchRefreshSeconds : quietRefreshSeconds;
    const computedAt = cacheComputedAt(cached);
    const cacheAgeSeconds = computedAt
      ? Math.max(0, Math.floor((now.getTime() - computedAt.getTime()) / 1000))
      : null;
    const shouldRefresh = shouldRefreshLiveMatches(activeMatchCount, cacheAgeSeconds);
    const result = shouldRefresh
      ? await getAggregatedMatches(dateKey, { cacheMode: "refresh", liveScoresOnly: true })
      : cached;
    results.push({
      dateKey,
      activeMatchCount,
      refreshIntervalSeconds,
      cacheAgeSeconds,
      refreshed: shouldRefresh,
      source: result.source,
      count: result.matches.length,
      diagnostics: result.diagnostics.map((item) => ({
        id: item.id,
        name: item.name,
        ok: item.ok,
        fromCache: item.fromCache,
        status: item.status,
        message: item.message,
        updatedAt: item.updatedAt,
      })),
      matches: summarizeMatches(result.matches),
    });
  }

  return NextResponse.json({
    ok: true,
    mode: "live",
    refreshedAt: new Date().toISOString(),
    dateKeys,
    results,
  });
}
