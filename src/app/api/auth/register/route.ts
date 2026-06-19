import { NextResponse } from "next/server";
import { createEmailUser, getUserByEmail } from "@/lib/db/queries";
import {
  createSession,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  publicUser,
  setSessionCookie,
} from "@/lib/auth/local";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(String(body?.email || ""));
  const password = String(body?.password || "");
  const name = String(body?.name || "").trim();

  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "邮箱格式不正确" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ ok: false, error: "密码至少需要 6 位" }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json({ ok: false, error: "该邮箱已注册" }, { status: 409 });
  }

  const user = await createEmailUser({
    email,
    passwordHash: await hashPassword(password),
    name: name || email.split("@")[0],
  });
  const session = await createSession(user.id);
  const response = NextResponse.json({ ok: true, user: publicUser(user) });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
