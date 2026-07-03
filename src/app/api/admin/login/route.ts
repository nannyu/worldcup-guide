import { type NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  createAdminSessionValue,
  getAdminAuthInfo,
  getAdminPassword,
  setAdminCookie,
} from "@/lib/admin/auth";

// Simple in-memory login rate limiter (per IP)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  record.count++;
  return record.count > MAX_LOGIN_ATTEMPTS;
}

/** Constant-time password comparison to prevent timing attacks. */
function safePasswordEqual(input: string, expected: string): boolean {
  const inputBuf = Buffer.from(input);
  const expectedBuf = Buffer.from(expected);
  if (inputBuf.length !== expectedBuf.length) {
    // Compare against expected to consume constant time regardless of length mismatch
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return timingSafeEqual(inputBuf, expectedBuf);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (isLoginRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "too_many_attempts" },
      { status: 429 },
    );
  }

  const expectedPassword = getAdminPassword();
  const authInfo = getAdminAuthInfo();

  if (!authInfo.configured || !expectedPassword) {
    return NextResponse.json(
      { ok: false, error: "admin_auth_not_configured" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || !safePasswordEqual(body.password, expectedPassword)) {
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 401 });
  }

  // Clear rate limit record on successful login
  loginAttempts.delete(ip);

  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    usingDevPassword: authInfo.usingDevPassword,
  });
  setAdminCookie(response, createAdminSessionValue());
  return response;
}
