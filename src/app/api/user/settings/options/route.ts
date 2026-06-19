import { NextResponse } from "next/server";
import { getUserPreferenceOptions } from "@/lib/user/preferences";

export async function GET() {
  return NextResponse.json({ ok: true, options: getUserPreferenceOptions() });
}
