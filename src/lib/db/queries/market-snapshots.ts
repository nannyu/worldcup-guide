import { getDb, getSql, isDatabaseConfigured } from "../client";
import { marketSnapshots, type MarketSnapshot } from "../schema/world-cup";
import type { OddsMatch, RadarMatch } from "@/lib/wc-data";

type MarketSnapshotInput = {
  matchId?: string | null;
  provider: string;
  externalMarketId: string;
  capturedAt: Date;
  homeProbability?: number | null;
  drawProbability?: number | null;
  awayProbability?: number | null;
  volume?: number | null;
  raw: unknown;
};

function numericString(value: number | null | undefined, scale: number): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value.toFixed(scale);
}

function parseCapturedAt(input: string | undefined): Date {
  const parsed = input ? new Date(input) : undefined;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function rawMatch<T>(row: MarketSnapshot, kind: "odds" | "radar"): T | undefined {
  const raw = row.raw as { kind?: string; match?: unknown } | undefined;
  if (!raw || raw.kind !== kind || typeof raw.match !== "object" || raw.match === null) return undefined;
  return raw.match as T;
}

export async function recordMarketSnapshots(inputs: MarketSnapshotInput[]): Promise<number> {
  const rows = inputs.filter((input) => input.externalMarketId);
  if (!rows.length || !isDatabaseConfigured) return 0;

  try {
    await getDb()
      .insert(marketSnapshots)
      .values(rows.map((input) => ({
        matchId: input.matchId || null,
        provider: input.provider.slice(0, 64),
        externalMarketId: input.externalMarketId.slice(0, 256),
        capturedAt: input.capturedAt,
        homeProbability: numericString(input.homeProbability, 4),
        drawProbability: numericString(input.drawProbability, 4),
        awayProbability: numericString(input.awayProbability, 4),
        volume: numericString(input.volume, 4),
        raw: input.raw,
      })));
    return rows.length;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[market-snapshots] write skipped:",
        error instanceof Error ? error.message : error,
      );
    }
    return 0;
  }
}

export function recordOddsMarketSnapshots(oddsMatches: OddsMatch[], provider: string): Promise<number> {
  return recordMarketSnapshots(oddsMatches.map((match) => ({
    provider,
    externalMarketId: match.id,
    capturedAt: parseCapturedAt(match.updatedAt),
    homeProbability: match.homeProbability / 100,
    drawProbability: match.drawProbability / 100,
    awayProbability: match.awayProbability / 100,
    raw: {
      kind: "odds",
      match,
      source: match.source,
      bookmakerCount: match.bookmakerCount,
    },
  })));
}

export function recordRadarMarketSnapshots(radarMatches: RadarMatch[], provider: string): Promise<number> {
  return recordMarketSnapshots(radarMatches.map((match) => ({
    provider,
    externalMarketId: match.id,
    capturedAt: parseCapturedAt(match.updatedAt),
    homeProbability: match.homeMarketProb / 100,
    awayProbability: match.awayMarketProb / 100,
    volume: match.volumeUsd,
    raw: {
      kind: "radar",
      match,
      source: provider,
      outcomes: match.outcomes,
    },
  })));
}

export async function readLatestOddsMarketSnapshots(): Promise<OddsMatch[]> {
  if (!isDatabaseConfigured) return [];
  try {
    const sql = getSql();
    const rows = await sql<MarketSnapshot[]>`
      select distinct on (external_market_id) *
      from market_snapshots
      where raw->>'kind' = 'odds'
      order by external_market_id, captured_at desc, id desc
    `;
    return rows
      .map((row) => rawMatch<OddsMatch>(row, "odds"))
      .filter((match): match is OddsMatch => Boolean(match));
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[market-snapshots] latest odds unavailable:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}

export async function readLatestRadarMarketSnapshots(): Promise<RadarMatch[]> {
  if (!isDatabaseConfigured) return [];
  try {
    const sql = getSql();
    const rows = await sql<MarketSnapshot[]>`
      select distinct on (external_market_id) *
      from market_snapshots
      where raw->>'kind' = 'radar'
      order by external_market_id, captured_at desc, id desc
    `;
    return rows
      .map((row) => rawMatch<RadarMatch>(row, "radar"))
      .filter((match): match is RadarMatch => Boolean(match));
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[market-snapshots] latest radar unavailable:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}
