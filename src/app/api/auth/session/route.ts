import { type NextRequest, NextResponse } from "next/server";
import { getCurrentLocalUser, publicUser } from "@/lib/auth/local";

export async function GET(request: NextRequest) {
  const user = await getCurrentLocalUser(request);
  return NextResponse.json({ ok: true, user: user ? publicUser(user) : null });
}
