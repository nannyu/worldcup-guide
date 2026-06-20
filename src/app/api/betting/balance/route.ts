import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOrCreateBalance, getMintForDate } from "@/lib/db/queries/betting";
import { todayBeijingDateKey } from "@/lib/betting/chips";
import { getScheduleDateMeta } from "@/lib/wc-data";
import { getAggregatedMatches } from "@/lib/data-sources/aggregate";

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const balance = await getOrCreateBalance(auth.user.id);
  const dateKey = todayBeijingDateKey();
  const todayMint = await getMintForDate(auth.user.id, dateKey);

  let todayMatchCount = 0;
  try {
    const scheduleDates = getScheduleDateMeta(new Date());
    const result = await getAggregatedMatches("today", {
      cacheMode: "cache-only",
      sourceDate: scheduleDates.today.date,
    });
    todayMatchCount = result.matches.length;
  } catch {
    todayMatchCount = todayMint?.amount ?? 0;
  }

  return NextResponse.json({
    ok: true,
    balance: balance.balance,
    totalMinted: balance.totalMinted,
    totalWagered: balance.totalWagered,
    totalWon: balance.totalWon,
    betCount: balance.betCount,
    winCount: balance.winCount,
    todayMinted: todayMint ? todayMint.amount : 0,
    todayMatchCount,
  });
}
