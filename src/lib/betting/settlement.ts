import { getDb } from "@/lib/db/client";
import { matches, marketSnapshots } from "@/lib/db/schema/world-cup";
import { type Bet } from "@/lib/db/schema/betting";
import { eq, desc } from "drizzle-orm";
import {
  getPendingBetsForMatch,
  settleBets,
  type BetSettlementResult,
} from "@/lib/db/queries/betting";

type MatchRecord = {
  id: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

export type SettlementResult = {
  settled: number;
  skipped?: string;
};

/**
 * Resolve a RadarMatch market ID (e.g. "polymarket-0x...") to a FIFA match ID
 * by querying market_snapshots.
 */
export async function resolveMatchIdFromMarket(marketId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ matchId: marketSnapshots.matchId })
    .from(marketSnapshots)
    .where(eq(marketSnapshots.externalMarketId, marketId))
    .orderBy(desc(marketSnapshots.capturedAt))
    .limit(1);
  return row?.matchId ?? null;
}

type BetOutcome = "win" | "lose" | "push";

export async function settleMatchBets(matchId: string): Promise<SettlementResult> {
  const [matchRow] = await getDb()
    .select({
      id: matches.id,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      status: matches.status,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!matchRow || matchRow.status !== "finished") {
    return { settled: 0, skipped: "match not finished" };
  }

  const match: MatchRecord = {
    id: matchRow.id,
    homeScore: matchRow.homeScore,
    awayScore: matchRow.awayScore,
    status: matchRow.status,
  };

  const pendingBets = await getPendingBetsForMatch(matchId);
  if (pendingBets.length === 0) return { settled: 0 };

  const results: BetSettlementResult[] = pendingBets.map((bet) => {
    const outcome = evaluateBetOutcome(bet, match);
    const amount = Number(bet.amount);
    let payout = 0;
    let won = false;

    if (outcome === "win") {
      won = true;
      payout = Math.floor(amount * Number(bet.oddsAtBet));
    } else if (outcome === "push") {
      // Refund original amount on push
      payout = amount;
      won = false;
    }
    // "lose" → payout = 0

    return { betId: bet.id, userId: bet.userId, won, payout };
  });

  const settled = await settleBets(matchId, results);

  // Also settle any parlays that have legs in this match
  try {
    const { settleParlaysForMatch } = await import("./parlay-settlement");
    await settleParlaysForMatch(matchId);
  } catch {
    // parlay settlement is best-effort; don't block single bet settlement
  }

  return { settled };
}

export function evaluateBetOutcome(bet: Bet, match: MatchRecord): BetOutcome {
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;

  switch (bet.category) {
    case "moneyline": {
      if (bet.outcomeIndex === 2) return homeScore === awayScore ? "win" : "lose";
      if (bet.outcomeIndex === 0) return homeScore > awayScore ? "win" : homeScore < awayScore ? "lose" : "push";
      return awayScore > homeScore ? "win" : awayScore < homeScore ? "lose" : "push";
    }
    case "spread": {
      const line = parseLine(bet.outcomeLabel);
      if (line === null) return "lose";
      const diff = homeScore - awayScore;
      if (bet.outcomeIndex === 0) {
        return diff > line ? "win" : diff < line ? "lose" : "push";
      }
      const revDiff = -diff;
      return revDiff > line ? "win" : revDiff < line ? "lose" : "push";
    }
    case "total": {
      const line = parseLine(bet.outcomeLabel);
      if (line === null) return "lose";
      const total = homeScore + awayScore;
      if (bet.outcomeIndex === 0) {
        return total > line ? "win" : total < line ? "lose" : "push";
      }
      return total < line ? "win" : total > line ? "lose" : "push";
    }
    default:
      return "lose";
  }
}

function parseLine(label: string): number | null {
  const match = label.match(/[-+]?\d+\.?\d*/);
  if (!match) return null;
  return parseFloat(match[0]);
}
