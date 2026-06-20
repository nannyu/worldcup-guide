import { type NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/api/rate-limit";
import { getLeaderboard } from "@/lib/db/queries/betting";

export async function GET(request: NextRequest) {
  const blocked = rateLimit(request);
  if (blocked) return blocked;

  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 50, 100);
  const rankings = await getLeaderboard(limit);

  return NextResponse.json({ ok: true, rankings });
}
