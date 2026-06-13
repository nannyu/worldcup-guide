import { type NextRequest, NextResponse } from "next/server";
import { enqueueMatchesRefresh } from "@/lib/background/tasks";
import { getAggregatedMatches } from "@/lib/data-sources/aggregate";
import { normalizeScheduleDate, normalizeScheduleUtcDayBounds, type ScheduleDateKey } from "@/lib/wc-data";

function parseDateKey(value: string | null): ScheduleDateKey {
  if (value === "yesterday" || value === "tomorrow") return value;
  return "today";
}

export async function GET(request: NextRequest) {
  const dateKey = parseDateKey(request.nextUrl.searchParams.get("dateKey"));
  const dateRange = normalizeScheduleUtcDayBounds({
    date: request.nextUrl.searchParams.get("date"),
    startUtc: request.nextUrl.searchParams.get("startUtc"),
    endUtc: request.nextUrl.searchParams.get("endUtc"),
  });
  const sourceDate = dateRange?.date || normalizeScheduleDate(request.nextUrl.searchParams.get("date"));
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  const cacheMode = "cache-only";
  const result = await getAggregatedMatches(dateKey, { cacheMode, sourceDate, dateRange });
  const isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const backgroundTask = refreshRequested || result.source === "fallback" || isStale
    ? await enqueueMatchesRefresh(dateKey, { sourceDate, dateRange })
    : undefined;
  return NextResponse.json(
    { ok: true, dateKey, date: sourceDate, dateRange, cacheMode, backgroundTask, ...result },
    {
      headers: {
        "Cache-Control": "s-maxage=30, stale-while-revalidate=300",
      },
    },
  );
}
