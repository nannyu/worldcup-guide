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

    return {
      betId: bet.id,
      userId: bet.userId,
      won,
      payout,
      creditPayout: !bet.parlayId,
    };
  });

  const settled = await settleBets(matchId, results);
  const { settleParlaysForMatch } = await import("./parlay-settlement");
  const settledParlays = await settleParlaysForMatch(matchId);

  return { settled: settled + settledParlays };
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
