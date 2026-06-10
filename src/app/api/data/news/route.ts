import { type NextRequest, NextResponse } from "next/server";
import { getAggregatedNews } from "@/lib/data-sources/aggregate";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || undefined;
  const limit = Number(request.nextUrl.searchParams.get("limit") || 12);
  const publishedAfter = request.nextUrl.searchParams.get("from") || undefined;
  const publishedBefore = request.nextUrl.searchParams.get("to") || undefined;
  const result = await getAggregatedNews({ query, limit, publishedAfter, publishedBefore });
  return NextResponse.json({ ok: true, query, ...result });
}
