import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, getSql } from "../client";
import { bets, type Bet } from "../schema/betting";
import { parlays, type Parlay } from "../schema/parlay";

// ─── Place Parlay ───

export type ParlayLegInput = {
  marketId: string;
  matchId: string;
  category: string;
  outcomeIndex: number;
  outcomeLabel: string;
  probabilityAtBet: number;
  oddsAtBet: number;
};

export type PlaceParlayInput = {
  userId: string;
  legs: ParlayLegInput[];
  amount: number;
  combinedOdds: number;
};

export async function placeParlay(input: PlaceParlayInput): Promise<Parlay> {
  const db = getDb();
  const parlayId = randomUUID();
  const legCount = input.legs.length;

  // Atomic balance deduction
  const deductionResult = await getSql().unsafe(`
    UPDATE user_balances
    SET balance = COALESCE(balance, 0) - $1,
        total_wagered = COALESCE(total_wagered, 0) + $1,
        bet_count = COALESCE(bet_count, 0) + 1,
        updated_at = now()
    WHERE user_id = $2
      AND COALESCE(balance, 0) >= $1
  `, [input.amount, input.userId]);

  if (deductionResult.count === 0) {
    throw new Error("INSUFFICIENT_BALANCE");
  }

  return db.transaction(async (tx) => {
    const [parlay] = await tx
      .insert(parlays)
      .values({
        id: parlayId,
        userId: input.userId,
        legCount,
        totalAmount: input.amount,
        combinedOdds: String(input.combinedOdds),
      })
      .returning();

    // Insert all legs with parlay_id
    await tx.insert(bets).values(
      input.legs.map((leg) => ({
        id: randomUUID(),
        userId: input.userId,
        marketId: leg.marketId,
        matchId: leg.matchId,
        category: leg.category,
        outcomeIndex: leg.outcomeIndex,
        outcomeLabel: leg.outcomeLabel,
        amount: input.amount,
        probabilityAtBet: String(leg.probabilityAtBet),
        oddsAtBet: String(leg.oddsAtBet),
        parlayId,
      })),
    );

    return parlay;
  });
}

// ─── Queries ───

export async function getParlayWithLegs(parlayId: string): Promise<{ parlay: Parlay; legs: Bet[] } | null> {
  const db = getDb();
  const [parlay] = await db.select().from(parlays).where(eq(parlays.id, parlayId)).limit(1);
  if (!parlay) return null;

  const legs = await db.select().from(bets).where(eq(bets.parlayId, parlayId)).orderBy(asc(bets.createdAt));
  return { parlay, legs };
}

export async function getPendingParlayIdsForMatch(matchId: string): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ parlayId: bets.parlayId })
    .from(bets)
    .where(
      and(
        eq(bets.matchId, matchId),
        eq(bets.status, "pending"),
        sql`${bets.parlayId} IS NOT NULL`,
      ),
    );
  return rows.map((r) => r.parlayId!).filter(Boolean);
}

export async function getPendingParlaysForMatch(matchId: string): Promise<Parlay[]> {
  const parlayIds = await getPendingParlayIdsForMatch(matchId);
  if (parlayIds.length === 0) return [];
  return getDb().select().from(parlays).where(
    and(inArray(parlays.id, parlayIds), eq(parlays.status, "pending")),
  );
}

export async function settleParlay(
  parlayId: string,
  result: { status: string; payout: number },
): Promise<void> {
  const db = getDb();
  await db
    .update(parlays)
    .set({
      status: result.status,
      payout: String(result.payout),
      settledAt: new Date(),
    })
    .where(eq(parlays.id, parlayId));

  if (result.status === "won" && result.payout > 0) {
    // Credit payout
    const [parlay] = await db.select({ userId: parlays.userId }).from(parlays).where(eq(parlays.id, parlayId)).limit(1);
    if (parlay) {
      await getSql().unsafe(`
        UPDATE user_balances
        SET balance = COALESCE(balance, 0) + $1,
            total_won = COALESCE(total_won, 0) + $1,
            win_count = COALESCE(win_count, 0) + 1,
            updated_at = now()
        WHERE user_id = $2
      `, [result.payout, parlay.userId]);
    }
  } else if (result.status === "partial_refund" && result.payout > 0) {
    // Refund on void parlay
    const [parlay] = await db.select({ userId: parlays.userId }).from(parlays).where(eq(parlays.id, parlayId)).limit(1);
    if (parlay) {
      await getSql().unsafe(`
        UPDATE user_balances
        SET balance = COALESCE(balance, 0) + $1,
            updated_at = now()
        WHERE user_id = $2
      `, [result.payout, parlay.userId]);
    }
  }
}

export async function getUserParlays(
  userId: string,
  options?: { status?: string; limit?: number; offset?: number },
): Promise<Parlay[]> {
  const conditions = [eq(parlays.userId, userId)];
  if (options?.status) conditions.push(eq(parlays.status, options.status));

  return getDb()
    .select()
    .from(parlays)
    .where(and(...conditions))
    .orderBy(desc(parlays.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
}
