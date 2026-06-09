import { type NextRequest, NextResponse } from "next/server";
import { getAggregatedMatches } from "@/lib/data-sources/aggregate";
import type { ScheduleDateKey } from "@/lib/wc-data";

function parseDateKey(value: string | null): ScheduleDateKey {
  if (value === "yesterday" || value === "tomorrow") return value;
  return "today";
}

export async function GET(request: NextRequest) {
  const dateKey = parseDateKey(request.nextUrl.searchParams.get("dateKey"));
  const result = await getAggregatedMatches(dateKey);
  return NextResponse.json({ ok: true, dateKey, ...result });
}
