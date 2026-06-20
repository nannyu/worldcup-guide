import { getDb } from "@/lib/db/client";
import { matches } from "@/lib/db/schema/world-cup";
import { type Bet } from "@/lib/db/schema/betting";
import { eq } from "drizzle-orm";
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
    const won = evaluateBetOutcome(bet, match);
    const payout = won ? Math.floor(Number(bet.amount) * Number(bet.oddsAtBet)) : 0;
    return { betId: bet.id, userId: bet.userId, won, payout };
  });

  const settled = await settleBets(matchId, results);
  return { settled };
}

function evaluateBetOutcome(bet: Bet, match: MatchRecord): boolean {
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;

  switch (bet.category) {
    case "moneyline": {
      if (bet.outcomeIndex === 0) return homeScore > awayScore;
      if (bet.outcomeIndex === 1) return awayScore > homeScore;
      return homeScore === awayScore;
    }
    case "spread": {
      const line = parseLine(bet.outcomeLabel);
      if (line === null) return false;
      const diff = homeScore - awayScore;
      if (bet.outcomeIndex === 0) return diff > line;
      return -diff > line;
    }
    case "total": {
      const line = parseLine(bet.outcomeLabel);
      if (line === null) return false;
      const total = homeScore + awayScore;
      if (bet.outcomeIndex === 0) return total > line;
      return total < line;
    }
    default:
      return false;
  }
}

function parseLine(label: string): number | null {
  const match = label.match(/[-+]?\d+\.?\d*/);
  if (!match) return null;
  return parseFloat(match[0]);
}
