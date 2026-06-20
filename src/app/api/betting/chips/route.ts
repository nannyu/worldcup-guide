import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ensureDailyChips } from "@/lib/betting/chips";

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const result = await ensureDailyChips(auth.user.id);

  return NextResponse.json({
    ok: true,
    minted: result.minted,
    alreadyMinted: result.alreadyMinted,
    balance: result.balance,
    dateKey: result.dateKey,
    todayMatchCount: result.todayMatchCount,
  });
}
