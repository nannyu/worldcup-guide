import { type NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/api/rate-limit";
import { enqueueRadarRefresh } from "@/lib/background/tasks";
import { getAggregatedRadar } from "@/lib/data-sources/aggregate";
import { readMarketHistory } from "@/lib/db/queries/market-snapshots";

export async function GET(request: NextRequest) {
  const blocked = rateLimit(request);
  if (blocked) return blocked;
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  const cacheMode = "cache-only";
  const result = await getAggregatedRadar({ cacheMode });
  const isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const hasRadarMatches = () => (result.radarMatches || []).length > 0;

  const radarMatches = result.radarMatches || [];

  // Attach history for top 10 matches
  const topMatches = radarMatches.slice(0, 10);
  if (topMatches.length) {
    const histories = await Promise.all(
      topMatches.map((m) => readMarketHistory(m.id, 50)),
    );
    for (let i = 0; i < topMatches.length; i++) {
      if (histories[i].length) {
        topMatches[i].history = histories[i];
      }
    }
  }

  const backgroundTask = refreshRequested || result.source === "fallback" || isStale || !hasRadarMatches() ? await enqueueRadarRefresh() : undefined;
  return NextResponse.json(
    { ok: true, cacheMode, stale: isStale, backgroundTask, source: result.source, radarMatches },
    {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
