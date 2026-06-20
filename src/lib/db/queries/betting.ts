import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, count as drizzleCount, sql } from "drizzle-orm";
import { getDb } from "../client";
import { bets, chipMints, userBalances, type Bet, type ChipMint, type UserBalance } from "../schema/betting";
import { users } from "../schema/users";

// ─── Chip Minting ───

export async function getMintForDate(userId: string, dateKey: string): Promise<ChipMint | undefined> {
  const rows = await getDb()
    .select()
    .from(chipMints)
    .where(and(eq(chipMints.userId, userId), eq(chipMints.dateKey, dateKey)))
    .limit(1);
  return rows[0];
}

export async function mintDailyChips(userId: string, dateKey: string, amount: number): Promise<ChipMint | null> {
  const db = getDb();
  const existing = await getMintForDate(userId, dateKey);
  if (existing) return null;

  const rows = await db
    .insert(chipMints)
    .values({ userId, dateKey, amount })
    .onConflictDoNothing()
    .returning();

  if (rows.length === 0) return null;

  await incrementBalance(userId, { minted: amount });
  return rows[0];
}

// ─── Balance ───

export async function getOrCreateBalance(userId: string): Promise<UserBalance> {
  const db = getDb();
  const rows = await db.select().from(userBalances).where(eq(userBalances.userId, userId)).limit(1);
  if (rows[0]) return rows[0];

  const inserted = await db
    .insert(userBalances)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return inserted[0];

  const retry = await db.select().from(userBalances).where(eq(userBalances.userId, userId)).limit(1);
  return retry[0];
}

export async function incrementBalance(
  userId: string,
  delta: { minted?: number; wagered?: number; won?: number },
): Promise<UserBalance> {
  const db = getDb();
  await db
    .insert(userBalances)
    .values({ userId })
    .onConflictDoNothing();

  const sets: Record<string, unknown> = { updatedAt: new Date() };
  if (delta.minted) {
    sets.balance = sql`COALESCE(${userBalances.balance}, 0) + ${delta.minted}`;
    sets.totalMinted = sql`COALESCE(${userBalances.totalMinted}, 0) + ${delta.minted}`;
  }
  if (delta.wagered) {
    sets.balance = sql`COALESCE(${userBalances.balance}, 0) - ${delta.wagered}`;
    sets.totalWagered = sql`COALESCE(${userBalances.totalWagered}, 0) + ${delta.wagered}`;
    sets.betCount = sql`COALESCE(${userBalances.betCount}, 0) + 1`;
  }
  if (delta.won) {
    sets.balance = sql`COALESCE(${userBalances.balance}, 0) + ${delta.won}`;
    sets.totalWon = sql`COALESCE(${userBalances.totalWon}, 0) + ${delta.won}`;
    sets.winCount = sql`COALESCE(${userBalances.winCount}, 0) + 1`;
  }

  await db.update(userBalances).set(sets).where(eq(userBalances.userId, userId));

  const rows = await db.select().from(userBalances).where(eq(userBalances.userId, userId)).limit(1);
  return rows[0];
}

// ─── Bets ───

export type PlaceBetInput = {
  userId: string;
  marketId: string;
  matchId: string;
  category: string;
  outcomeIndex: number;
  outcomeLabel: string;
  amount: number;
  probabilityAtBet: number;
  oddsAtBet: number;
};

export async function placeBet(input: PlaceBetInput): Promise<Bet> {
  const db = getDb();
  const betId = randomUUID();

  return db.transaction(async (tx) => {
    const [bal] = await tx.select().from(userBalances).where(eq(userBalances.userId, input.userId)).limit(1);
    const currentBalance = bal?.balance ?? 0;
    if (currentBalance < input.amount) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    await tx.update(userBalances).set({
      balance: sql`COALESCE(${userBalances.balance}, 0) - ${input.amount}`,
      totalWagered: sql`COALESCE(${userBalances.totalWagered}, 0) + ${input.amount}`,
      betCount: sql`COALESCE(${userBalances.betCount}, 0) + 1`,
      updatedAt: new Date(),
    }).where(eq(userBalances.userId, input.userId));

    const [bet] = await tx
      .insert(bets)
      .values({
        id: betId,
        userId: input.userId,
        marketId: input.marketId,
        matchId: input.matchId,
        category: input.category,
        outcomeIndex: input.outcomeIndex,
        outcomeLabel: input.outcomeLabel,
        amount: input.amount,
        probabilityAtBet: String(input.probabilityAtBet),
        oddsAtBet: String(input.oddsAtBet),
      })
      .returning();

    return bet;
  });
}

export async function getUserBets(
  userId: string,
  options?: { status?: string; limit?: number; offset?: number },
): Promise<Bet[]> {
  const conditions = [eq(bets.userId, userId)];
  if (options?.status) conditions.push(eq(bets.status, options.status));

  return getDb()
    .select()
    .from(bets)
    .where(and(...conditions))
    .orderBy(desc(bets.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
}

export async function getPendingBetsForMatch(matchId: string): Promise<Bet[]> {
  return getDb()
    .select()
    .from(bets)
    .where(and(eq(bets.matchId, matchId), eq(bets.status, "pending")));
}

export async function getUnsettledBetCountForMatch(matchId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: drizzleCount() })
    .from(bets)
    .where(and(eq(bets.matchId, matchId), eq(bets.status, "pending")));
  return row?.count ?? 0;
}

export type BetSettlementResult = {
  betId: string;
  userId: string;
  won: boolean;
  payout: number;
};

export async function settleBets(matchId: string, results: BetSettlementResult[]): Promise<number> {
  if (results.length === 0) return 0;

  const db = getDb();
  return db.transaction(async (tx) => {
    let settled = 0;

    for (const r of results) {
      const status = r.won ? "won" : "lost";

      await tx
        .update(bets)
        .set({
          status,
          payout: String(r.payout),
          settledAt: new Date(),
        })
        .where(eq(bets.id, r.betId));

      if (r.won && r.payout > 0) {
        await tx.update(userBalances).set({
          balance: sql`COALESCE(${userBalances.balance}, 0) + ${r.payout}`,
          totalWon: sql`COALESCE(${userBalances.totalWon}, 0) + ${r.payout}`,
          winCount: sql`COALESCE(${userBalances.winCount}, 0) + 1`,
          updatedAt: new Date(),
        }).where(eq(userBalances.userId, r.userId));
      }

      settled++;
    }

    return settled;
  });
}

// ─── Leaderboard ───

export type LeaderboardEntry = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  balance: number;
  totalMinted: number;
  totalWagered: number;
  totalWon: number;
  betCount: number;
  winCount: number;
};

export async function getLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const rows = await getDb()
    .select({
      userId: userBalances.userId,
      name: users.name,
      avatarUrl: users.avatarUrl,
      balance: userBalances.balance,
      totalMinted: userBalances.totalMinted,
      totalWagered: userBalances.totalWagered,
      totalWon: userBalances.totalWon,
      betCount: userBalances.betCount,
      winCount: userBalances.winCount,
    })
    .from(userBalances)
    .innerJoin(users, eq(users.id, userBalances.userId))
    .orderBy(desc(userBalances.balance))
    .limit(limit);

  return rows;
}

export async function getBetCountPerOutcome(marketId: string): Promise<{ outcomeIndex: number; count: number }[]> {
  const rows = await getDb()
    .select({
      outcomeIndex: bets.outcomeIndex,
      count: drizzleCount(),
    })
    .from(bets)
    .where(and(eq(bets.marketId, marketId), eq(bets.status, "pending")))
    .groupBy(bets.outcomeIndex);

  return rows;
}
