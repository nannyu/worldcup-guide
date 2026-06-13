import { type NextRequest, NextResponse } from "next/server";
import { enqueueMorningRefresh } from "@/lib/background/tasks";
import { getAggregatedMorningBrief } from "@/lib/data-sources/aggregate";
import { applyCachedMorningBriefTranslations } from "@/lib/translation/article-translation";
import { normalizeScheduleDate, normalizeScheduleUtcDayBounds, type ScheduleDateKey } from "@/lib/wc-data";

function parseDateKey(value: string | null): ScheduleDateKey {
  if (value === "today" || value === "tomorrow") return value;
  return "yesterday";
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
  const result = await getAggregatedMorningBrief(dateKey, { cacheMode, sourceDate, dateRange });
  const isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const hasNews = () => result.brief.news.length > 0;
  const hasContent = () => hasNews() || result.brief.matches.length > 0;
  const brief = await applyCachedMorningBriefTranslations(result.brief);
  const backgroundTask = refreshRequested || result.source === "fallback" || isStale || !hasNews() || !hasContent()
    ? await enqueueMorningRefresh(dateKey, { sourceDate, dateRange })
    : undefined;
  return NextResponse.json(
    { ok: true, dateKey, date: sourceDate, dateRange, cacheMode, stale: isStale, backgroundTask, ...result, brief },
    {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
