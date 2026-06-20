import { getDb, getSql, isDatabaseConfigured } from "../client";
import { marketSnapshots, type MarketSnapshot } from "../schema/world-cup";
import type { Match, OddsMatch, RadarMatch } from "@/lib/wc-data";

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

function dateMs(input: Date | string | undefined): number {
  const time = input instanceof Date ? input.getTime() : Date.parse(String(input || ""));
  return Number.isFinite(time) ? time : NaN;
}

function preKickoffTarget(match: Pick<Match, "kickoffAt">): Date | undefined {
  const kickoffMs = Date.parse(match.kickoffAt || "");
  if (!Number.isFinite(kickoffMs)) return undefined;
  return new Date(kickoffMs - 60 * 1000);
}

function withPreKickoffMetadata(match: OddsMatch, row: MarketSnapshot, targetAt: Date): OddsMatch {
  const capturedAt = row.capturedAt instanceof Date ? row.capturedAt.toISOString() : String(row.capturedAt);
  return {
    ...match,
    probabilityCapturedAt: capturedAt,
    preMatchTargetAt: targetAt.toISOString(),
  };
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
    matchId: match.matchId || null,
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

export async function readPreKickoffOddsMarketSnapshots(matches: Match[]): Promise<OddsMatch[]> {
  if (!isDatabaseConfigured || !matches.length) return [];
  const sql = getSql();

  // Compute global time window across all matches
  const matchMeta = matches
    .map((match) => {
      const kickoffMs = Date.parse(match.kickoffAt || "");
      const targetAt = preKickoffTarget(match);
      return { match, kickoffMs, targetAt };
    })
    .filter((item) => item.targetAt && Number.isFinite(item.kickoffMs));

  if (!matchMeta.length) return [];

  const globalStart = Math.min(...matchMeta.map((m) => m.kickoffMs - 24 * 60 * 60 * 1000));
  const globalEnd = Math.max(...matchMeta.map((m) => m.kickoffMs));

  try {
    const rows = await sql<MarketSnapshot[]>`
      select *
      from market_snapshots
      where raw->>'kind' = 'odds'
        and captured_at <= ${new Date(globalEnd)}
        and captured_at >= ${new Date(globalStart)}
      order by captured_at desc, id desc
      limit 2000
    `;

    // Index rows by match for O(1) lookup
    const rowsByMatchId = new Map<string, MarketSnapshot[]>();
    const rowsByTeamKickoff = new Map<string, MarketSnapshot[]>();
    for (const row of rows) {
      const raw = row.raw as { match?: { matchId?: string; homeTeam?: string; awayTeam?: string; kickoffBj?: string } } | undefined;
      if (!raw?.match) continue;
      const m = raw.match;
      if (m.matchId) {
        const arr = rowsByMatchId.get(m.matchId) || [];
        arr.push(row);
        rowsByMatchId.set(m.matchId, arr);
      }
      if (m.homeTeam && m.awayTeam && m.kickoffBj) {
        const key = `${m.homeTeam}|${m.awayTeam}|${m.kickoffBj}`;
        const arr = rowsByTeamKickoff.get(key) || [];
        arr.push(row);
        rowsByTeamKickoff.set(key, arr);
      }
    }

    const results: OddsMatch[] = [];
    for (const { match, targetAt } of matchMeta) {
      // Find matching rows using three strategies
      const candidates = [
        ...(rowsByMatchId.get(match.id) || []),
        ...(rowsByTeamKickoff.get(`${match.homeTeam}|${match.awayTeam}|${match.kickoffBj}`) || []),
      ];
      // Deduplicate by row id
      const unique = Array.from(new Map(candidates.map((r) => [r.id, r])).values());

      const closest = unique
        .map((row) => ({ row, match: rawMatch<OddsMatch>(row, "odds") }))
        .filter((item): item is { row: MarketSnapshot; match: OddsMatch } => Boolean(item.match))
        .sort((left, right) => {
          const leftDistance = Math.abs(dateMs(left.row.capturedAt) - targetAt!.getTime());
          const rightDistance = Math.abs(dateMs(right.row.capturedAt) - targetAt!.getTime());
          return leftDistance - rightDistance || dateMs(right.row.capturedAt) - dateMs(left.row.capturedAt);
        })[0];
      if (closest) results.push(withPreKickoffMetadata(closest.match, closest.row, targetAt!));
    }

    return results;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[market-snapshots] pre-kickoff odds unavailable:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
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
      limit 500
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

export async function readMarketHistory(
  externalMarketId: string,
  limit = 50,
): Promise<{ time: string; market: number; odds: number }[]> {
  if (!isDatabaseConfigured || !externalMarketId) return [];
  try {
    const sql = getSql();
    const rows = await sql<MarketSnapshot[]>`
      select captured_at, home_probability, draw_probability, away_probability
      from market_snapshots
      where external_market_id = ${externalMarketId}
      order by captured_at asc
      limit ${limit}
    `;
    return rows.map((row) => {
      const homeProb = parseFloat(String(row.homeProbability ?? "0"));
      const drawProb = parseFloat(String(row.drawProbability ?? "0"));
      const awayProb = parseFloat(String(row.awayProbability ?? "0"));
      return {
        time: row.capturedAt instanceof Date ? row.capturedAt.toISOString() : String(row.capturedAt),
        market: Math.round(homeProb * 100),
        odds: Math.round((1 - drawProb) * 100),
      };
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[market-snapshots] history unavailable:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}
