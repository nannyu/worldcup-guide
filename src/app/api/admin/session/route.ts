import { type NextRequest, NextResponse } from "next/server";
import { getAdminAuthInfo, verifyAdminRequest } from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    ok: true,
    authenticated: verifyAdminRequest(request),
    ...getAdminAuthInfo(),
  });
}
