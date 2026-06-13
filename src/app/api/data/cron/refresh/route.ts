import { type NextRequest, NextResponse } from "next/server";
import { enqueueFullDataRefresh, getBackgroundTaskStates } from "@/lib/background/tasks";
import { runDataRefresh } from "@/lib/data-sources/refresh-runner";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expected && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is required" }, { status: 500 });
  }
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode") === "initialize" ? "initialize" : "scheduled";
  if (request.nextUrl.searchParams.get("wait") === "1") {
    const result = await runDataRefresh(mode);
    return NextResponse.json({ ok: true, async: false, ...result });
  }

  const backgroundTask = await enqueueFullDataRefresh(mode);
  return NextResponse.json({
    ok: true,
    async: true,
    backgroundTask,
    tasks: await getBackgroundTaskStates(),
  }, { status: 202 });
}
