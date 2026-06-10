import { NextResponse } from "next/server";
import { getAggregatedTeams } from "@/lib/data-sources/aggregate";

export async function GET() {
  const result = await getAggregatedTeams();
  return NextResponse.json({ ok: true, ...result });
}
