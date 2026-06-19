import { type NextRequest, NextResponse } from "next/server";
import { getCurrentLocalUser, hashPassword, verifyPassword } from "@/lib/auth/local";
import { updateUserPassword } from "@/lib/db/queries";

export async function PUT(request: NextRequest) {
  const user = await getCurrentLocalUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");

  if (newPassword.length < 6) {
    return NextResponse.json({ ok: false, error: "新密码至少需要 6 位" }, { status: 400 });
  }

  const passwordOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ ok: false, error: "当前密码不正确" }, { status: 401 });
  }

  await updateUserPassword(user.id, await hashPassword(newPassword));
  return NextResponse.json({ ok: true });
}
