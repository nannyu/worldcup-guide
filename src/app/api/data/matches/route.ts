import { type NextRequest, NextResponse } from "next/server";
import { enqueueMatchesRefresh } from "@/lib/background/tasks";
import { getAggregatedMatches } from "@/lib/data-sources/aggregate";
import type { ScheduleDateKey } from "@/lib/wc-data";

function parseDateKey(value: string | null): ScheduleDateKey {
  if (value === "yesterday" || value === "tomorrow") return value;
  return "today";
}

export async function GET(request: NextRequest) {
  const dateKey = parseDateKey(request.nextUrl.searchParams.get("dateKey"));
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  const cacheMode = "cache-only";
  const result = await getAggregatedMatches(dateKey, { cacheMode });
  const isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const backgroundTask = refreshRequested || result.source === "fallback" || isStale ? await enqueueMatchesRefresh(dateKey) : undefined;
  return NextResponse.json(
    { ok: true, dateKey, cacheMode, backgroundTask, ...result },
    {
      headers: {
        "Cache-Control": "s-maxage=30, stale-while-revalidate=300",
      },
    },
  );
}
