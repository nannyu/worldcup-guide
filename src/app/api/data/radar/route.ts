import { type NextRequest, NextResponse } from "next/server";
import { enqueueRadarRefresh } from "@/lib/background/tasks";
import { getAggregatedRadar } from "@/lib/data-sources/aggregate";

export async function GET(request: NextRequest) {
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  const cacheMode = "cache-only";
  const result = await getAggregatedRadar({ cacheMode });
  const isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const hasRadarMatches = () => (result.radarMatches || []).length > 0;

  const backgroundTask = refreshRequested || result.source === "fallback" || isStale || !hasRadarMatches() ? await enqueueRadarRefresh() : undefined;
  return NextResponse.json(
    { ok: true, cacheMode, stale: isStale, backgroundTask, ...result },
    {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
