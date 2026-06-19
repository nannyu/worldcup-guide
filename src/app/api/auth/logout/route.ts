import { type NextRequest, NextResponse } from "next/server";
import { clearCurrentSession } from "@/lib/auth/local";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  await clearCurrentSession(request, response);
  return response;
}
