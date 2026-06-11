import { type NextRequest, NextResponse } from "next/server";
import { enqueueMorningRefresh } from "@/lib/background/tasks";
import { getAggregatedMorningBrief } from "@/lib/data-sources/aggregate";
import { applyCachedMorningBriefTranslations } from "@/lib/translation/article-translation";
import type { ScheduleDateKey } from "@/lib/wc-data";

function parseDateKey(value: string | null): ScheduleDateKey {
  if (value === "today" || value === "tomorrow") return value;
  return "yesterday";
}

export async function GET(request: NextRequest) {
  const dateKey = parseDateKey(request.nextUrl.searchParams.get("dateKey"));
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  let cacheMode: "cache-only" | "refresh" = "cache-only";
  let result = await getAggregatedMorningBrief(dateKey, { cacheMode });
  let isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const hasNews = () => result.brief.news.length > 0;
  const hasContent = () => hasNews() || result.brief.matches.length > 0;
  if (refreshRequested || !hasNews()) {
    try {
      const refreshed = await getAggregatedMorningBrief(dateKey, { cacheMode: "refresh", useAi: false });
      if (refreshed.brief.news.length > 0 || refreshed.brief.matches.length > 0) {
        result = refreshed;
        cacheMode = "refresh";
        isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
      }
    } catch (error) {
      result.diagnostics.push({
        id: "morning-sync-refresh",
        name: "早报同步刷新",
        adapter: "api-route",
        type: "news",
        ok: false,
        fromCache: false,
        message: error instanceof Error ? error.message : "同步刷新早报失败",
        updatedAt: new Date().toISOString(),
      });
    }
  }
  const brief = await applyCachedMorningBriefTranslations(result.brief);
  const backgroundTask = result.source === "fallback" || isStale || !hasNews() || !hasContent()
    ? await enqueueMorningRefresh(dateKey)
    : undefined;
  return NextResponse.json(
    { ok: true, dateKey, cacheMode, backgroundTask, ...result, brief },
    {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
