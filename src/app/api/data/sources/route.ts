import { NextResponse } from "next/server";
import { getDataSourceStatus } from "@/lib/data-sources/aggregate";

export async function GET() {
  const status = await getDataSourceStatus();
  return NextResponse.json({ ok: true, ...status });
}
