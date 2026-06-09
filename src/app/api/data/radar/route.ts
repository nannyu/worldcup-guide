import { NextResponse } from "next/server";
import { getAggregatedRadar } from "@/lib/data-sources/aggregate";

export async function GET() {
  const result = await getAggregatedRadar();
  return NextResponse.json({ ok: true, ...result });
}
