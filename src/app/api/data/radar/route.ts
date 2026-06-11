import { type NextRequest, NextResponse } from "next/server";
import { enqueueRadarRefresh } from "@/lib/background/tasks";
import { getAggregatedRadar } from "@/lib/data-sources/aggregate";

export async function GET(request: NextRequest) {
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  let cacheMode: "cache-only" | "refresh" = "cache-only";
  let result = await getAggregatedRadar({ cacheMode });
  let isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const hasRadarMatches = () => (result.radarMatches || []).length > 0;

  if (refreshRequested || result.source === "fallback" || isStale || !hasRadarMatches()) {
    try {
      const refreshed = await getAggregatedRadar({ cacheMode: "refresh" });
      if ((refreshed.radarMatches || []).length > 0 || refreshRequested) {
        result = refreshed;
        cacheMode = "refresh";
        isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
      }
    } catch (error) {
      result.diagnostics.push({
        id: "radar-sync-refresh",
        name: "预测市场同步刷新",
        adapter: "api-route",
        type: "prediction-market",
        ok: false,
        fromCache: false,
        message: error instanceof Error ? error.message : "同步刷新预测市场失败",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const backgroundTask = result.source === "fallback" || isStale || !hasRadarMatches() ? await enqueueRadarRefresh() : undefined;
  return NextResponse.json(
    { ok: true, cacheMode, backgroundTask, ...result },
    {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
