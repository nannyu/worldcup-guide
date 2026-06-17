import { type NextRequest, NextResponse } from "next/server";
import { unauthorizedResponse, verifyAdminRequest } from "@/lib/admin/auth";
import { getAnalyticsReport } from "@/lib/db/queries/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!verifyAdminRequest(request)) return unauthorizedResponse();

  const days = Number(request.nextUrl.searchParams.get("days") || 7);
  const report = await getAnalyticsReport(days);
  return NextResponse.json(
    { ok: true, report },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
