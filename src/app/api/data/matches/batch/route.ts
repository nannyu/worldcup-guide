import { type NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/api/rate-limit";
import { getAggregatedMatches } from "@/lib/data-sources/aggregate";
import { normalizeScheduleDate, normalizeScheduleUtcDayBounds, type ScheduleDateKey } from "@/lib/wc-data";

interface BatchDateQuery {
  dateKey: ScheduleDateKey;
  date?: string;
  startUtc?: string;
  endUtc?: string;
}

function parseDateKey(value: string | null): ScheduleDateKey {
  if (value === "yesterday" || value === "tomorrow") return value;
  return "today";
}

export async function POST(request: NextRequest) {
  const blocked = rateLimit(request);
  if (blocked) return blocked;

  let queries: BatchDateQuery[];
  try {
    const body = await request.json();
    queries = Array.isArray(body.queries) ? body.queries.slice(0, 30) : [];
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!queries.length) {
    return NextResponse.json({ ok: false, error: "No queries provided" }, { status: 400 });
  }

  const results = await Promise.all(
    queries.map(async (q) => {
      const dateKey = parseDateKey(q.dateKey);
      const dateRange = normalizeScheduleUtcDayBounds({
        date: q.date || null,
        startUtc: q.startUtc || null,
        endUtc: q.endUtc || null,
      });
      const sourceDate = dateRange?.date || normalizeScheduleDate(q.date || null);
      const result = await getAggregatedMatches(dateKey, { cacheMode: "cache-only", sourceDate, dateRange });
      return {
        dateKey,
        date: sourceDate,
        matches: result.matches,
        source: result.source,
      };
    }),
  );

  return NextResponse.json(
    { ok: true, results },
    { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=300" } },
  );
}
