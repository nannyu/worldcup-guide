import { type NextRequest, NextResponse } from "next/server";
import { parseAnalyticsEvents } from "@/lib/analytics/events";
import { recordAnalyticsEvents } from "@/lib/db/queries/analytics";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as unknown;
  const events = parseAnalyticsEvents(body, request);
  if (!events.length) {
    return NextResponse.json({ ok: false, error: "invalid_events" }, { status: 400 });
  }

  const stored = await recordAnalyticsEvents(events);
  return NextResponse.json({ ok: true, received: events.length, stored });
}
