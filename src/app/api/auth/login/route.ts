import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db/queries";
import {
  createSession,
  isValidEmail,
  normalizeEmail,
  publicUser,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth/local";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(String(body?.email || ""));
  const password = String(body?.password || "");

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "邮箱格式不正确" }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !passwordOk) {
    return NextResponse.json({ ok: false, error: "邮箱或密码不正确" }, { status: 401 });
  }

  const session = await createSession(user.id);
  const response = NextResponse.json({ ok: true, user: publicUser(user) });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
