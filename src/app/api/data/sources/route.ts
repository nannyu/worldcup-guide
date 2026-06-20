import { type NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/api/rate-limit";
import { getDataSourceStatus } from "@/lib/data-sources/aggregate";

export async function GET(request: NextRequest) {
  const blocked = rateLimit(request);
  if (blocked) return blocked;
  const status = await getDataSourceStatus();
  return NextResponse.json(
    { ok: true, ...status },
    { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=600" } },
  );
}
