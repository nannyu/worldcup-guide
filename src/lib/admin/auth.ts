import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE_NAME = "wc_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getAdminPassword(): string | null {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  return isProduction() ? null : "admin123";
}

function getSessionSecret(): string | null {
  if (process.env.ADMIN_SESSION_SECRET) return process.env.ADMIN_SESSION_SECRET;
  return isProduction() ? null : "worldcup-guide-dev-admin-secret";
}

function sign(value: string): string {
  const secret = getSessionSecret();
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function getAdminAuthInfo() {
  return {
    configured: Boolean(getAdminPassword() && getSessionSecret()),
    usingDevPassword: !process.env.ADMIN_PASSWORD && !isProduction(),
  };
}

export function createAdminSessionValue(): string {
  const payload = Buffer.from(
    JSON.stringify({ role: "admin", exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminRequest(request: NextRequest): boolean {
  const value = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!value) return false;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(sign(payload), signature)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      role?: string;
      exp?: number;
    };
    return parsed.role === "admin" && typeof parsed.exp === "number" && parsed.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function unauthorizedResponse() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export function setAdminCookie(response: NextResponse, value: string) {
  response.cookies.set(ADMIN_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: 0,
  });
}
