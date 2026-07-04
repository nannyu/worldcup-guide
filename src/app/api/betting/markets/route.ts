import { type NextRequest, NextResponse } from "next/server";
import { and, count as drizzleCount, eq, inArray } from "drizzle-orm";
import { rateLimit } from "@/lib/api/rate-limit";
import { readLatestRadarMarketSnapshots } from "@/lib/db/queries/market-snapshots";
import { getDb } from "@/lib/db/client";
import { bets } from "@/lib/db/schema/betting";
import { getScheduleDateMeta } from "@/lib/wc-data";
import { getAggregatedMatches } from "@/lib/data-sources/aggregate";

export async function GET(request: NextRequest) {
  const blocked = rateLimit(request);
  if (blocked) return blocked;

  let todayMatchCount = 0;
  let todayMatches: Awaited<ReturnType<typeof getAggregatedMatches>>["matches"] = [];
  try {
    const scheduleDates = getScheduleDateMeta(new Date());
    const result = await getAggregatedMatches("today", {
      cacheMode: "cache-only",
      sourceDate: scheduleDates.today.date,
    });
    todayMatches = result.matches;
    todayMatchCount = result.matches.length;
  } catch {
    todayMatchCount = 0;
  }

  const radarMatches = await readLatestRadarMarketSnapshots();

  const moneylineMatches = radarMatches.filter(
    (m) => m.category === "moneyline" && m.status !== "finished",
  );

  const selectedMarkets = moneylineMatches.slice(0, 50);
  const marketIds = selectedMarkets.map((market) => market.id);
  const countRows = marketIds.length
    ? await getDb()
      .select({
        marketId: bets.marketId,
        outcomeIndex: bets.outcomeIndex,
        count: drizzleCount(),
      })
      .from(bets)
      .where(and(inArray(bets.marketId, marketIds), eq(bets.status, "pending")))
      .groupBy(bets.marketId, bets.outcomeIndex)
    : [];
  const countsByMarket = new Map<string, { outcomeIndex: number; count: number }[]>();
  for (const row of countRows) {
    const rows = countsByMarket.get(row.marketId) || [];
    rows.push({ outcomeIndex: row.outcomeIndex, count: row.count });
    countsByMarket.set(row.marketId, rows);
  }

  const enrichedMarkets = selectedMarkets.map((m) => ({
    id: m.id,
    title: m.title,
    category: m.category,
    settlementOutcome: m.settlementOutcome,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    homeFlag: m.homeFlag,
    awayFlag: m.awayFlag,
    homeMarketProb: m.homeMarketProb,
    awayMarketProb: m.awayMarketProb,
    status: m.status,
    kickoffBj: m.kickoffBj,
    volumeUsd: m.volumeUsd,
    outcomes: m.outcomes,
    betCounts: countsByMarket.get(m.id) || [],
  }));

  return NextResponse.json({
    ok: true,
    markets: enrichedMarkets,
    todayMatchCount,
    todayMatches: todayMatches.map((m) => ({
      id: m.id,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeFlag: m.homeFlag,
      awayFlag: m.awayFlag,
      kickoffBj: m.kickoffBj,
      status: m.status,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    })),
  });
}
