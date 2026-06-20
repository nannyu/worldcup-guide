import { getDb } from "@/lib/db/client";
import { matches } from "@/lib/db/schema/world-cup";
import { type Bet } from "@/lib/db/schema/betting";
import { eq } from "drizzle-orm";
import {
  getPendingParlaysForMatch,
  getParlayWithLegs,
  settleParlay,
} from "@/lib/db/queries/parlay";
import { evaluateBetOutcome } from "./settlement";

type MatchRecord = {
  id: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

type ParlaySettlementResult = {
  parlayId: string;
  status: string;
  payout: number;
};

/**
 * Settle all parlays that have a leg in the given match.
 * Called after settleMatchBets in the cron/background job.
 */
export async function settleParlaysForMatch(matchId: string): Promise<number> {
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

  if (!matchRow || matchRow.status !== "finished") return 0;

  const match: MatchRecord = {
    id: matchRow.id,
    homeScore: matchRow.homeScore,
    awayScore: matchRow.awayScore,
    status: matchRow.status,
  };

  const pendingParlays = await getPendingParlaysForMatch(matchId);
  if (pendingParlays.length === 0) return 0;

  let settled = 0;
  for (const parlay of pendingParlays) {
    const result = await evaluateAndSettleParlay(parlay.id, match);
    if (result) {
      await settleParlay(result.parlayId, { status: result.status, payout: result.payout });
      settled++;
    }
  }

  return settled;
}

async function evaluateAndSettleParlay(
  parlayId: string,
  currentMatch: MatchRecord,
): Promise<ParlaySettlementResult | null> {
  const data = await getParlayWithLegs(parlayId);
  if (!data) return null;

  const { parlay, legs } = data;

  // Categorize legs
  const resolvedLegs: { leg: Bet; outcome: "win" | "lose" | "push" }[] = [];
  const unresolvedLegs: Bet[] = [];

  for (const leg of legs) {
    if (leg.status !== "pending") {
      // Already settled from a previous match completion
      resolvedLegs.push({ leg, outcome: leg.status === "won" ? "win" : leg.status === "push" ? "push" : "lose" });
    } else if (leg.matchId === currentMatch.id) {
      // This leg's match just finished — evaluate it now
      const outcome = evaluateBetOutcome(leg, currentMatch);
      resolvedLegs.push({ leg, outcome });
    } else {
      // Not yet resolved
      unresolvedLegs.push(leg);
    }
  }

  // If any unresolved legs remain, parlay is not yet fully settled
  if (unresolvedLegs.length > 0) return null;

  // All legs resolved — determine parlay outcome
  const totalAmount = parlay.totalAmount;

  // Check for any loss
  if (resolvedLegs.some((r) => r.outcome === "lose")) {
    return { parlayId, status: "lost", payout: 0 };
  }

  // Separate pushes and wins
  const pushLegs = resolvedLegs.filter((r) => r.outcome === "push");
  const winLegs = resolvedLegs.filter((r) => r.outcome === "win");

  // Standard parlay push rules
  if (pushLegs.length > 0) {
    const remainingLegs = winLegs.length;

    // If all legs pushed or only 1 leg remains after pushes → void parlay
    if (remainingLegs <= 1) {
      return { parlayId, status: "partial_refund", payout: totalAmount };
    }

    // Recalculate odds with remaining legs only
    const recalcOdds = winLegs.reduce((acc, r) => acc * Number(r.leg.oddsAtBet), 1);
    const payout = Math.floor(totalAmount * recalcOdds);
    return { parlayId, status: "won", payout };
  }

  // All legs won — full payout
  const combinedOdds = Number(parlay.combinedOdds);
  const payout = Math.floor(totalAmount * combinedOdds);
  return { parlayId, status: "won", payout };
}

// Re-export evaluateBetOutcome for use in parlay settlement
export { evaluateBetOutcome } from "./settlement";
