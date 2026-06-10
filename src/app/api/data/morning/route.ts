import { type NextRequest, NextResponse } from "next/server";
import { getAggregatedMorningBrief } from "@/lib/data-sources/aggregate";
import type { ScheduleDateKey } from "@/lib/wc-data";

function parseDateKey(value: string | null): ScheduleDateKey {
  if (value === "today" || value === "tomorrow") return value;
  return "yesterday";
}

export async function GET(request: NextRequest) {
  const dateKey = parseDateKey(request.nextUrl.searchParams.get("dateKey"));
  const result = await getAggregatedMorningBrief(dateKey);
  return NextResponse.json({ ok: true, dateKey, ...result });
}
