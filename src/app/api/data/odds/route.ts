import { type NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/api/rate-limit";
import { enqueueOddsRefresh } from "@/lib/background/tasks";
import { getAggregatedOdds } from "@/lib/data-sources/aggregate";

export async function GET(request: NextRequest) {
  const blocked = rateLimit(request);
  if (blocked) return blocked;
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  const cacheMode = "cache-only";
  const result = await getAggregatedOdds({ cacheMode });
  const isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const hasOdds = () => (result.oddsMatches || []).length > 0;

  const backgroundTask = refreshRequested || result.source === "fallback" || isStale || !hasOdds() ? await enqueueOddsRefresh() : undefined;
  return NextResponse.json(
    { ok: true, cacheMode, stale: isStale, backgroundTask, source: result.source, oddsMatches: result.oddsMatches },
    {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
