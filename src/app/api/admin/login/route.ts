import { type NextRequest, NextResponse } from "next/server";
import {
  createAdminSessionValue,
  getAdminAuthInfo,
  getAdminPassword,
  setAdminCookie,
} from "@/lib/admin/auth";

export async function POST(request: NextRequest) {
  const expectedPassword = getAdminPassword();
  const authInfo = getAdminAuthInfo();

  if (!authInfo.configured || !expectedPassword) {
    return NextResponse.json(
      { ok: false, error: "admin_auth_not_configured" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || body.password !== expectedPassword) {
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    usingDevPassword: authInfo.usingDevPassword,
  });
  setAdminCookie(response, createAdminSessionValue());
  return response;
}
