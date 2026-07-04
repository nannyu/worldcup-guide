import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import { bets, userBalances, type Bet } from "../schema/betting";
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

  return db.transaction(async (tx) => {
    await tx.insert(userBalances).values({ userId: input.userId }).onConflictDoNothing();

    const [deducted] = await tx
      .update(userBalances)
      .set({
        balance: sql`COALESCE(${userBalances.balance}, 0) - ${input.amount}`,
        totalWagered: sql`COALESCE(${userBalances.totalWagered}, 0) + ${input.amount}`,
        betCount: sql`COALESCE(${userBalances.betCount}, 0) + 1`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(userBalances.userId, input.userId),
        sql`COALESCE(${userBalances.balance}, 0) >= ${input.amount}`,
      ))
      .returning({ userId: userBalances.userId });

    if (!deducted) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

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
  await db.transaction(async (tx) => {
    const [settled] = await tx
      .update(parlays)
      .set({
        status: result.status,
        payout: String(result.payout),
        settledAt: new Date(),
      })
      .where(and(eq(parlays.id, parlayId), eq(parlays.status, "pending")))
      .returning({ userId: parlays.userId });

    if (!settled || result.payout <= 0) return;

    if (result.status === "won") {
      await tx.update(userBalances).set({
        balance: sql`COALESCE(${userBalances.balance}, 0) + ${result.payout}`,
        totalWon: sql`COALESCE(${userBalances.totalWon}, 0) + ${result.payout}`,
        winCount: sql`COALESCE(${userBalances.winCount}, 0) + 1`,
        updatedAt: new Date(),
      }).where(eq(userBalances.userId, settled.userId));
    } else if (result.status === "partial_refund") {
      await tx.update(userBalances).set({
        balance: sql`COALESCE(${userBalances.balance}, 0) + ${result.payout}`,
        updatedAt: new Date(),
      }).where(eq(userBalances.userId, settled.userId));
    }
  });
}

export async function getBatchParlayLegs(parlayIds: string[]): Promise<Map<string, Bet[]>> {
  if (parlayIds.length === 0) return new Map();
  const db = getDb();
  const allLegs = await db
    .select()
    .from(bets)
    .where(inArray(bets.parlayId, parlayIds))
    .orderBy(asc(bets.createdAt));
  const legsByParlay = new Map<string, Bet[]>();
  for (const leg of allLegs) {
    if (!leg.parlayId) continue;
    const list = legsByParlay.get(leg.parlayId) || [];
    list.push(leg);
    legsByParlay.set(leg.parlayId, list);
  }
  return legsByParlay;
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
