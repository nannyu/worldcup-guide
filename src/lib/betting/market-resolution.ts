import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { marketSnapshots } from "@/lib/db/schema/world-cup";
import { allMatches, type Match, type RadarMatch } from "@/lib/wc-data";

type MoneylineSettlementOutcome = "home" | "away" | "draw";

export type ResolvedBetSelection = {
  matchId: string;
  category: "moneyline" | "spread" | "total" | "halftime" | "corners" | "goals" | "assists" | "shots" | "prop";
  outcomeIndex: number;
  outcomeLabel: string;
  probability: number;
  odds: number;
};

export type BetSelectionInput = {
  category: ResolvedBetSelection["category"];
  outcomeIndex: number;
  outcomeLabel: string;
};

export type BetSelectionResolution =
  | { ok: true; selection: ResolvedBetSelection }
  | { ok: false; error: string; status: number };

function canonicalText(input: string | undefined): string {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(fc|cf|national team)\b/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function kickoffMs(match: Match): number {
  const parsed = Date.parse(match.kickoffAt || "");
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function matchSortScore(match: Match, now = Date.now()): number {
  const kickoff = kickoffMs(match);
  if (!Number.isFinite(kickoff)) return Number.MAX_SAFE_INTEGER;
  return match.status === "finished" ? Math.abs(now - kickoff) + 10 ** 12 : Math.abs(kickoff - now);
}

export function resolveMatchForRadarMarket(market: RadarMatch): Match | undefined {
  if (market.matchId) {
    const exact = allMatches.find((match) => match.id === market.matchId);
    if (exact) return exact;
  }

  const home = canonicalText(market.homeTeam);
  const away = canonicalText(market.awayTeam);
  if (!home || !away) return undefined;

  const exactPair = allMatches.filter((match) =>
    canonicalText(match.homeTeam) === home && canonicalText(match.awayTeam) === away,
  );
  const reversedPair = allMatches.filter((match) =>
    canonicalText(match.homeTeam) === away && canonicalText(match.awayTeam) === home,
  );
  const candidates = exactPair.length ? exactPair : reversedPair;

  return candidates
    .slice()
    .sort((left, right) => matchSortScore(left) - matchSortScore(right))[0];
}

function rawRadarMatch(raw: unknown): RadarMatch | undefined {
  const payload = raw as { kind?: string; match?: unknown } | undefined;
  if (!payload || payload.kind !== "radar" || typeof payload.match !== "object" || payload.match === null) {
    return undefined;
  }
  return payload.match as RadarMatch;
}

export async function resolveMatchIdFromMarket(marketId: string, market?: RadarMatch): Promise<string | null> {
  const [row] = await getDb()
    .select({ matchId: marketSnapshots.matchId, raw: marketSnapshots.raw })
    .from(marketSnapshots)
    .where(eq(marketSnapshots.externalMarketId, marketId))
    .orderBy(desc(marketSnapshots.capturedAt))
    .limit(1);

  if (row?.matchId) return row.matchId;

  const fallbackMarket = market || rawRadarMatch(row?.raw);
  return fallbackMarket ? resolveMatchForRadarMarket(fallbackMarket)?.id ?? null : null;
}

function outcomeProbability(market: RadarMatch, selectedIndex: number): number {
  const outcome = market.outcomes?.[selectedIndex];
  const probability = outcome?.probability ?? (selectedIndex === 0 ? market.homeMarketProb : market.awayMarketProb);
  return probability / 100;
}

function outcomeLabel(market: RadarMatch, selectedIndex: number, fallback: string): string {
  return market.outcomes?.[selectedIndex]?.label || fallback;
}

function isNoOutcome(label: string): boolean {
  return canonicalText(label) === "no";
}

function inferMoneylineOutcome(market: RadarMatch, selectedIndex: number): MoneylineSettlementOutcome | undefined {
  if (market.settlementOutcome && selectedIndex === 0) return market.settlementOutcome;

  const outcomes = market.outcomes || [];
  if (outcomes.length >= 3) {
    if (selectedIndex === 0) return "home";
    if (selectedIndex === 1) return "draw";
    if (selectedIndex === 2) return "away";
  }

  const selectedLabel = canonicalText(outcomes[selectedIndex]?.label || "");
  if (selectedLabel.includes("draw")) return "draw";
  if (selectedLabel && selectedLabel === canonicalText(market.homeTeam)) return "home";
  if (selectedLabel && selectedLabel === canonicalText(market.awayTeam)) return "away";

  if (selectedIndex === 0 && !isNoOutcome(outcomes[0]?.label || "")) return "home";
  if (selectedIndex === 1 && outcomes.length <= 2 && !isNoOutcome(outcomes[1]?.label || "")) return "away";
  return undefined;
}

function moneylineOutcomeIndex(outcome: MoneylineSettlementOutcome): number {
  if (outcome === "home") return 0;
  if (outcome === "away") return 1;
  return 2;
}

export async function resolveRadarBetSelection(
  market: RadarMatch,
  input: BetSelectionInput,
): Promise<BetSelectionResolution> {
  const category = market.category || input.category;
  const selectedLabel = outcomeLabel(market, input.outcomeIndex, input.outcomeLabel);
  if (isNoOutcome(selectedLabel)) {
    return { ok: false, error: "This market side is not supported for settlement", status: 400 };
  }

  const probability = outcomeProbability(market, input.outcomeIndex);
  if (probability <= 0 || !Number.isFinite(probability)) {
    return { ok: false, error: "Invalid probability", status: 400 };
  }

  const matchId = await resolveMatchIdFromMarket(market.id, market);
  if (!matchId) {
    return { ok: false, error: "Market not linked to a match", status: 400 };
  }

  let outcomeIndex = input.outcomeIndex;
  if (category === "moneyline") {
    const outcome = inferMoneylineOutcome(market, input.outcomeIndex);
    if (!outcome) {
      return { ok: false, error: "Unsupported moneyline selection", status: 400 };
    }
    outcomeIndex = moneylineOutcomeIndex(outcome);
  }

  return {
    ok: true,
    selection: {
      matchId,
      category,
      outcomeIndex,
      outcomeLabel: selectedLabel,
      probability,
      odds: 1 / probability,
    },
  };
}
