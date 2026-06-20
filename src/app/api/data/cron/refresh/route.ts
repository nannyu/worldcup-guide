import { type NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/api/cron-auth";
import { enqueueFullDataRefresh, getBackgroundTaskStates } from "@/lib/background/tasks";
import { runDataRefresh } from "@/lib/data-sources/refresh-runner";

export async function GET(request: NextRequest) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

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
