import { NextResponse } from "next/server";
import { getAggregatedOdds } from "@/lib/data-sources/aggregate";

export async function GET() {
  const result = await getAggregatedOdds();
  return NextResponse.json({ ok: true, ...result });
}
