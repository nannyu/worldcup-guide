/**
 * Radar / Polymarket transformer functions.
 *
 * Extracted from aggregate.ts during modularisation.
 * Every export here was previously a file-private function in aggregate.ts.
 */

import { type DataSourceConfig } from "@/lib/admin/config";
import { type SourceDiagnostic } from "@/lib/data-sources/client";
import {
  type Match,
  type MatchPrediction,
  type RadarMatch,
} from "@/lib/wc-data";
import { type PolymarketEvent, type ApiFootballPredictionResponse } from "../types";

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

export function parseStringArray(input: string | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return input.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

export function parseMarketVolume(input: string | undefined): number {
  const value = Number(String(input || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

export function parsePolymarketVolume(input: string | number | undefined): number {
  const value = typeof input === "number" ? input : Number(String(input || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

export function isYesNo(outcomes: string[]) {
  return outcomes.length >= 2
    && outcomes[0]?.toLowerCase() === "yes"
    && outcomes[1]?.toLowerCase() === "no";
}

export function normalizePolymarketOutcomeLabel(
  market: NonNullable<PolymarketEvent["markets"]>[number],
  outcome: string,
  index: number,
) {
  if (isYesNo(parseStringArray(market.outcomes)) && index === 0 && market.groupItemTitle) {
    const title = market.groupItemTitle.replace(/^Draw\s*\(.+\)$/i, "Draw");
    return title || outcome;
  }
  return outcome;
}

export function classifyPolymarketMarket(
  eventTitle: string,
  marketTitle: string,
): NonNullable<RadarMatch["category"]> {
  const text = `${eventTitle} ${marketTitle}`.toLowerCase();
  if (/half[-\s]?time|halftime/.test(text)) return "halftime";
  if (/corner/.test(text)) return "corners";
  if (/assist/.test(text)) return "assists";
  if (/shot/.test(text)) return "shots";
  if (/player to score|to score|goalscorer|golden boot/.test(text)) return "goals";
  if (/spread/.test(text)) return "spread";
  if (/\bo\/u\b|over\/under|total goals|total score/.test(text)) return "total";
  if (/\bvs\.?\b/.test(eventTitle) && (/ win on \d{4}-\d{2}-\d{2}/.test(text) || /end in a draw/.test(text))) {
    return "moneyline";
  }
  return "prop";
}

export function parseEventTeams(eventTitle: string | undefined): [string, string] | undefined {
  const match = String(eventTitle || "").match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s+-\s+.+)?$/i);
  if (!match) return undefined;
  return [match[1].trim(), match[2].trim()];
}

export function extractMarketLine(marketTitle: string, groupItemTitle: string | undefined): string | undefined {
  const text = `${groupItemTitle || ""} ${marketTitle}`;
  const spread = text.match(/\(([+-]?\d+(?:\.\d+)?)\)/);
  if (spread) return spread[1];
  const total = text.match(/\b(?:O\/U|over\/under)\s+(\d+(?:\.\d+)?)/i);
  if (total) return total[1];
  return undefined;
}

export function isWorldCupPolymarketEvent(event: PolymarketEvent): boolean {
  const text = [
    event.title,
    event.slug,
    ...(event.markets || []).flatMap((market) => [market.question, market.groupItemTitle]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\bfifwc\b|fifa world cup|world cup|世界杯/.test(text);
}

export function isPolymarketRadarMatch(match: RadarMatch): boolean {
  return match.id.startsWith("polymarket-") || /polymarket/i.test([match.updatedAt, match.diffText].filter(Boolean).join(" "));
}

/* ------------------------------------------------------------------ */
/*  Prediction helpers (feed into radar transforms)                    */
/* ------------------------------------------------------------------ */

export function parsePercentValue(input: string | number | undefined): number {
  const value = typeof input === "number" ? input : Number(String(input || "").replace("%", "").trim());
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

export function apiFootballFixtureIdFromMatchId(id: string): number | undefined {
  const value = Number(id.replace(/^api-football-/, ""));
  return Number.isFinite(value) ? value : undefined;
}

import { canonicalTeamName } from "./matches";

function inferMoneylineSettlementOutcome(
  eventTeams: [string, string] | undefined,
  label: string,
): RadarMatch["settlementOutcome"] {
  const normalized = canonicalTeamName(label);
  if (!normalized) return undefined;
  if (normalized.includes("draw")) return "draw";
  if (eventTeams?.[0] && normalized === canonicalTeamName(eventTeams[0])) return "home";
  if (eventTeams?.[1] && normalized === canonicalTeamName(eventTeams[1])) return "away";
  return undefined;
}

export function normalizePredictionPercent(
  input: ApiFootballPredictionResponse["response"],
): Map<number, MatchPrediction> {
  const predictions = new Map<number, MatchPrediction>();
  for (const item of input || []) {
    const fixtureId = item.fixture?.id;
    if (!fixtureId) continue;
    const home = parsePercentValue(item.predictions?.percent?.home);
    const draw = parsePercentValue(item.predictions?.percent?.draw);
    const away = parsePercentValue(item.predictions?.percent?.away);
    const winnerName = item.predictions?.winner?.name || undefined;
    const homeName = item.teams?.home?.name || "";
    const awayName = item.teams?.away?.name || "";
    const winnerKey = canonicalTeamName(winnerName);
    const winnerSide = winnerKey && winnerKey === canonicalTeamName(homeName)
      ? "home"
      : winnerKey && winnerKey === canonicalTeamName(awayName)
        ? "away"
        : !winnerName && draw >= home && draw >= away
          ? "draw"
          : undefined;
    predictions.set(fixtureId, {
      source: "API-Football Pro · Predictions",
      winnerName,
      winnerSide,
      advice: item.predictions?.advice || item.predictions?.winner?.comment || undefined,
      homePercent: home,
      drawPercent: draw,
      awayPercent: away,
    });
  }
  return predictions;
}

/* ------------------------------------------------------------------ */
/*  Main radar transforms                                              */
/* ------------------------------------------------------------------ */

export function transformPolymarketEvents(
  data: PolymarketEvent[],
  options: { includeClosedMarkets?: boolean } = {},
): RadarMatch[] {
  return data.filter(isWorldCupPolymarketEvent).flatMap((event, eventIndex) => {
    const eventTitle = event.title || "World Cup prediction";
    const eventTeams = parseEventTeams(eventTitle);
    const eventVolume = parsePolymarketVolume(event.volume);
    return (event.markets || []).flatMap((market, marketIndex) => {
      if (market.active === false || (!options.includeClosedMarkets && market.closed === true)) return [];
      const outcomes = parseStringArray(market.outcomes);
      const prices = parseStringArray(market.outcomePrices).map((price) => Number(price));
      const yes = prices[0];
      const no = prices[1];
      if (!Number.isFinite(yes) || outcomes.length < 2) return [];
      const yesProb = Math.round(yes * 100);
      const noProb = Number.isFinite(no) ? Math.round(no * 100) : Math.max(0, 100 - yesProb);
      const volumeUsd = parseMarketVolume(market.volume) || eventVolume;
      const title = market.question || eventTitle;
      const category = classifyPolymarketMarket(eventTitle, title);
      const normalizedOutcomes = outcomes.map((outcome, index) => ({
        label: normalizePolymarketOutcomeLabel(market, outcome, index),
        probability: Math.max(0, Math.min(100, Math.round((prices[index] || 0) * 100))),
      }));
      const primaryLabel = normalizedOutcomes[0]?.label || outcomes[0] || "Yes";
      const secondaryLabel = normalizedOutcomes[1]?.label || outcomes[1] || "No";
      const settlementOutcome = category === "moneyline"
        ? inferMoneylineSettlementOutcome(eventTeams, primaryLabel)
        : undefined;
      return [{
        id: `polymarket-${market.id || event.id || `${eventIndex}-${marketIndex}`}`,
        title,
        eventTitle,
        eventSlug: event.slug,
        category,
        line: extractMarketLine(title, market.groupItemTitle),
        settlementOutcome,
        marketLabel: normalizedOutcomes.map((outcome) => outcome.label).join(" / "),
        homeTeam: eventTeams?.[0] || primaryLabel,
        awayTeam: eventTeams?.[1] || secondaryLabel,
        homeFlag: "▴",
        awayFlag: "▾",
        homeMarketProb: yesProb,
        awayMarketProb: noProb,
        homeOddsProb: yesProb,
        awayOddsProb: noProb,
        diff: 0,
        diffLabel: "aligned" as const,
        diffTeam: "home" as const,
        diffText: "此卡展示 Polymarket 预测市场价格和资金热度；传统赔率对照源未匹配时，不强行制造分歧。",
        kickoffBj: "",
        status: market.closed === true ? "finished" as const : "upcoming" as const,
        updatedAt: market.closed === true ? "Polymarket · closed" : "Polymarket",
        volume: market.volume,
        volumeUsd,
        bestBid: market.bestBid,
        bestAsk: market.bestAsk,
        lastTradePrice: market.lastTradePrice,
        volume24hr: parsePolymarketVolume(event.volume24hr),
        outcomes: normalizedOutcomes,
        history: [],
      }];
    });
  }).sort((left, right) => (right.volumeUsd || 0) - (left.volumeUsd || 0));
}

export function transformApiFootballPredictionsToRadar(
  matches: Match[],
  predictionsByFixtureId: Map<number, MatchPrediction>,
): RadarMatch[] {
  return matches.flatMap((match) => {
    const fixtureId = match.providerFixtureId || apiFootballFixtureIdFromMatchId(match.id);
    const prediction = fixtureId ? predictionsByFixtureId.get(fixtureId) || match.prediction : match.prediction;
    if (!prediction) return [];
    const homeProb = prediction.homePercent;
    const drawProb = prediction.drawPercent;
    const awayProb = prediction.awayPercent;
    const awayOrDraw = Math.max(awayProb, drawProb);
    const diff = Math.abs(homeProb - awayProb);
    return [{
      id: `api-football-prediction-${fixtureId || match.id}`,
      matchId: match.id,
      title: `${match.homeTeam} vs ${match.awayTeam}`,
      eventTitle: `${match.homeTeam} vs ${match.awayTeam}`,
      category: "moneyline" as const,
      marketLabel: "Home / Draw / Away prediction",
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeFlag: match.homeFlag,
      awayFlag: match.awayFlag,
      homeMarketProb: homeProb,
      awayMarketProb: awayProb,
      homeOddsProb: match.oddsImpliedHome || homeProb,
      awayOddsProb: match.oddsImpliedAway || awayProb,
      diff,
      diffLabel: diff >= 18 ? "significant" as const : diff >= 10 ? "notable" as const : "aligned" as const,
      diffTeam: homeProb >= awayOrDraw ? "home" as const : "away" as const,
      diffText: prediction.advice || `API-Football 预测：主胜 ${homeProb}% / 平 ${drawProb}% / 客胜 ${awayProb}%。`,
      kickoffBj: match.kickoffBj,
      status: match.status,
      updatedAt: prediction.updatedAt || match.updatedAt,
      volume: "API model",
      volumeUsd: 0,
      outcomes: [
        { label: match.homeTeam, probability: homeProb },
        { label: "Draw", probability: drawProb },
        { label: match.awayTeam, probability: awayProb },
      ],
      history: [],
    }];
  });
}
