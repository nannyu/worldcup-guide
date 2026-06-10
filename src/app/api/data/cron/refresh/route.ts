import { type NextRequest, NextResponse } from "next/server";
import { runDataRefresh } from "@/lib/data-sources/refresh-runner";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode") === "initialize" ? "initialize" : "scheduled";
  const result = await runDataRefresh(mode);
  return NextResponse.json({ ok: true, ...result });
}
