import { type NextRequest, NextResponse } from "next/server";
import { enqueueOddsRefresh } from "@/lib/background/tasks";
import { getAggregatedOdds } from "@/lib/data-sources/aggregate";

export async function GET(request: NextRequest) {
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  let cacheMode: "cache-only" | "refresh" = "cache-only";
  let result = await getAggregatedOdds({ cacheMode });
  let isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const hasOdds = () => (result.oddsMatches || []).length > 0;

  if (refreshRequested || result.source === "fallback" || isStale || !hasOdds()) {
    try {
      const refreshed = await getAggregatedOdds({ cacheMode: "refresh" });
      if ((refreshed.oddsMatches || []).length > 0 || refreshRequested) {
        result = refreshed;
        cacheMode = "refresh";
        isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
      }
    } catch (error) {
      result.diagnostics.push({
        id: "odds-sync-refresh",
        name: "赔率同步刷新",
        adapter: "api-route",
        type: "odds",
        ok: false,
        fromCache: false,
        message: error instanceof Error ? error.message : "同步刷新赔率失败",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const backgroundTask = result.source === "fallback" || isStale || !hasOdds() ? await enqueueOddsRefresh() : undefined;
  return NextResponse.json(
    { ok: true, cacheMode, backgroundTask, ...result },
    {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
