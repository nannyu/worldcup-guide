import { type NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/api/rate-limit";
import { readLatestRadarMarketSnapshots } from "@/lib/db/queries/market-snapshots";
import { getBetCountPerOutcome } from "@/lib/db/queries/betting";
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

  const enrichedMarkets = await Promise.all(
    moneylineMatches.slice(0, 50).map(async (m) => {
      const counts = await getBetCountPerOutcome(m.id);
      return {
        id: m.id,
        title: m.title,
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
        betCounts: counts,
      };
    }),
  );

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
