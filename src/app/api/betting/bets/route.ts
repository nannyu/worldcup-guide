import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/api/rate-limit";
import { placeBet, getUserBets, getOrCreateBalance, getBetCountPerOutcome } from "@/lib/db/queries/betting";
import { readLatestRadarMarketSnapshots } from "@/lib/db/queries/market-snapshots";

const PlaceBetSchema = z.object({
  marketId: z.string().min(1).max(256),
  matchId: z.string().min(1).max(128),
  category: z.enum(["moneyline", "spread", "total", "halftime", "corners", "goals", "assists", "shots", "prop"]),
  outcomeIndex: z.number().int().min(0).max(2),
  outcomeLabel: z.string().min(1).max(256),
  amount: z.number().int().min(1).max(1000),
});

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const blocked = rateLimit(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PlaceBetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid bet parameters" }, { status: 400 });
  }

  const data = parsed.data;

  const balance = await getOrCreateBalance(auth.user.id);
  if (balance.balance < data.amount) {
    return NextResponse.json({ ok: false, error: "Insufficient chips" }, { status: 400 });
  }

  const radarMatches = await readLatestRadarMarketSnapshots();
  const market = radarMatches.find((m) => m.id === data.marketId);
  if (!market) {
    return NextResponse.json({ ok: false, error: "Market not found" }, { status: 404 });
  }

  if (market.status === "finished") {
    return NextResponse.json({ ok: false, error: "Market already settled" }, { status: 400 });
  }

  const probability = data.outcomeIndex === 0
    ? market.homeMarketProb / 100
    : market.awayMarketProb / 100;

  if (probability <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid probability" }, { status: 400 });
  }

  const odds = 1 / probability;

  try {
    const bet = await placeBet({
      userId: auth.user.id,
      marketId: data.marketId,
      matchId: data.matchId,
      category: data.category,
      outcomeIndex: data.outcomeIndex,
      outcomeLabel: data.outcomeLabel,
      amount: data.amount,
      probabilityAtBet: probability,
      oddsAtBet: odds,
    });

    const updatedBalance = await getOrCreateBalance(auth.user.id);

    return NextResponse.json({
      ok: true,
      bet: {
        id: bet.id,
        marketId: bet.marketId,
        matchId: bet.matchId,
        category: bet.category,
        outcomeIndex: bet.outcomeIndex,
        outcomeLabel: bet.outcomeLabel,
        amount: bet.amount,
        oddsAtBet: bet.oddsAtBet,
        status: bet.status,
        createdAt: bet.createdAt,
      },
      balance: updatedBalance.balance,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json({ ok: false, error: "Insufficient chips" }, { status: 400 });
    }
    throw err;
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const status = request.nextUrl.searchParams.get("status") || undefined;
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 50, 100);
  const offset = Math.max(Number(request.nextUrl.searchParams.get("offset")) || 0, 0);

  const bets = await getUserBets(auth.user.id, { status, limit, offset });

  return NextResponse.json({ ok: true, bets });
}
