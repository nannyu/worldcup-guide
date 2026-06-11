import { type NextRequest, NextResponse } from "next/server";
import { enqueueOddsRefresh } from "@/lib/background/tasks";
import { getAggregatedOdds } from "@/lib/data-sources/aggregate";

export async function GET(request: NextRequest) {
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  const cacheMode = "cache-only";
  const result = await getAggregatedOdds({ cacheMode });
  const isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const backgroundTask = refreshRequested || result.source === "fallback" || isStale ? await enqueueOddsRefresh() : undefined;
  return NextResponse.json(
    { ok: true, cacheMode, backgroundTask, ...result },
    {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
