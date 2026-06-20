import { type NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/api/rate-limit";
import { enqueueTeamsRefresh } from "@/lib/background/tasks";
import { getAggregatedTeams } from "@/lib/data-sources/aggregate";

export async function GET(request: NextRequest) {
  const blocked = rateLimit(request);
  if (blocked) return blocked;
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  const cacheMode = "cache-only";
  const result = await getAggregatedTeams({ cacheMode });
  const isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const backgroundTask = refreshRequested || result.source === "fallback" || isStale ? await enqueueTeamsRefresh() : undefined;
  return NextResponse.json(
    { ok: true, cacheMode, backgroundTask, source: result.source, teams: result.teams },
    {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
