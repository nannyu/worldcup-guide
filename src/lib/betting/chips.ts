import { getScheduleDateMeta } from "@/lib/wc-data";
import { getAggregatedMatches } from "@/lib/data-sources/aggregate";
import { mintDailyChips, getOrCreateBalance, getMintForDate } from "@/lib/db/queries/betting";

export function todayBeijingDateKey(): string {
  return getScheduleDateMeta(new Date()).today.date;
}

export async function ensureDailyChips(userId: string): Promise<{
  minted: number;
  balance: number;
  alreadyMinted: boolean;
  dateKey: string;
  todayMatchCount: number;
}> {
  const dateKey = todayBeijingDateKey();

  const existing = await getMintForDate(userId, dateKey);
  if (existing) {
    const balance = await getOrCreateBalance(userId);
    return {
      minted: 0,
      balance: balance.balance,
      alreadyMinted: true,
      dateKey,
      todayMatchCount: existing.amount,
    };
  }

  let matchCount = 0;
  try {
    const now = new Date();
    const scheduleDates = getScheduleDateMeta(now);
    const result = await getAggregatedMatches("today", {
      cacheMode: "cache-only",
      sourceDate: scheduleDates.today.date,
    });
    matchCount = result.matches.length;
  } catch {
    // fallback: try to count from stored matches
    matchCount = 0;
  }

  if (matchCount === 0) {
    const balance = await getOrCreateBalance(userId);
    return {
      minted: 0,
      balance: balance.balance,
      alreadyMinted: false,
      dateKey,
      todayMatchCount: 0,
    };
  }

  const mint = await mintDailyChips(userId, dateKey, matchCount);
  const balance = await getOrCreateBalance(userId);

  return {
    minted: mint ? matchCount : 0,
    balance: balance.balance,
    alreadyMinted: !mint,
    dateKey,
    todayMatchCount: matchCount,
  };
}
