import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/api/rate-limit";
import { getOrCreateBalance } from "@/lib/db/queries/betting";
import { placeParlay, getUserParlays, getBatchParlayLegs } from "@/lib/db/queries/parlay";
import { readLatestRadarMarketSnapshots } from "@/lib/db/queries/market-snapshots";
import { resolveMatchIdFromMarket } from "@/lib/betting/settlement";

const ParlayLegSchema = z.object({
  marketId: z.string().min(1).max(256),
  category: z.enum(["moneyline", "spread", "total", "halftime", "corners", "goals", "assists", "shots", "prop"]),
  outcomeIndex: z.number().int().min(0).max(2),
  outcomeLabel: z.string().min(1).max(256),
});

const PlaceParlaySchema = z.object({
  legs: z.array(ParlayLegSchema).min(2).max(8),
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

  const parsed = PlaceParlaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid parlay parameters" }, { status: 400 });
  }

  const { legs, amount } = parsed.data;

  // Ensure balance record exists
  await getOrCreateBalance(auth.user.id);

  // Validate all markets exist and compute odds
  const radarMatches = await readLatestRadarMarketSnapshots();
  const marketMap = new Map(radarMatches.map((m) => [m.id, m]));

  const resolvedLegs = [];
  let combinedOdds = 1;

  for (const leg of legs) {
    const market = marketMap.get(leg.marketId);
    if (!market) {
      return NextResponse.json({ ok: false, error: `Market not found: ${leg.marketId}` }, { status: 404 });
    }
    if (market.status === "finished") {
      return NextResponse.json({ ok: false, error: `Market already settled: ${leg.marketId}` }, { status: 400 });
    }

    const resolvedMatchId = await resolveMatchIdFromMarket(leg.marketId);
    if (!resolvedMatchId) {
      return NextResponse.json({ ok: false, error: `Market not linked to a match: ${leg.marketId}` }, { status: 400 });
    }

    const probability = leg.outcomeIndex === 0
      ? market.homeMarketProb / 100
      : market.awayMarketProb / 100;

    if (probability <= 0) {
      return NextResponse.json({ ok: false, error: `Invalid probability for market: ${leg.marketId}` }, { status: 400 });
    }

    const odds = 1 / probability;
    combinedOdds *= odds;

    resolvedLegs.push({
      marketId: leg.marketId,
      matchId: resolvedMatchId,
      category: leg.category,
      outcomeIndex: leg.outcomeIndex,
      outcomeLabel: leg.outcomeLabel,
      probabilityAtBet: probability,
      oddsAtBet: odds,
    });
  }

  try {
    const parlay = await placeParlay({
      userId: auth.user.id,
      legs: resolvedLegs,
      amount,
      combinedOdds,
    });

    const updatedBalance = await getOrCreateBalance(auth.user.id);

    return NextResponse.json({
      ok: true,
      parlay: {
        id: parlay.id,
        legCount: parlay.legCount,
        totalAmount: parlay.totalAmount,
        combinedOdds: parlay.combinedOdds,
        status: parlay.status,
        createdAt: parlay.createdAt,
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

  const parlays = await getUserParlays(auth.user.id, { status, limit, offset });

  // Batch fetch all legs in a single query (avoids N+1)
  const parlayIds = parlays.map((p) => p.id);
  const legsByParlay = await getBatchParlayLegs(parlayIds);

  const parlaysWithLegs = parlays.map((parlay) => ({
    ...parlay,
    legs: legsByParlay.get(parlay.id) || [],
  }));

  return NextResponse.json({ ok: true, parlays: parlaysWithLegs });
}
