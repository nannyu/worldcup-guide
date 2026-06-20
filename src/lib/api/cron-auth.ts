import { type NextRequest, NextResponse } from "next/server";

export function authorizeCron(request: NextRequest): NextResponse | undefined {
  const expected = process.env.CRON_SECRET;
  if (!expected && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is required" }, { status: 500 });
  }
  if (expected && request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return undefined;
}
