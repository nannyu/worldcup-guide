import { and, asc, eq, gte, lt } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../client";
import { matches } from "../schema/world-cup";
import {
  fifaRecordToMatch,
  mergeMatchWithOfficialSource,
  type FifaScheduleRecord,
  type Match,
} from "@/lib/wc-data";

export async function getStoredOfficialMatches<T>(bounds: { startUtc: string; endUtc: string }): Promise<T[]> {
  if (!isDatabaseConfigured) return [];
  try {
    const start = new Date(bounds.startUtc);
    const end = new Date(bounds.endUtc);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return [];
    const rows = await getDb()
      .select({ raw: matches.raw })
      .from(matches)
      .where(and(gte(matches.kickoffAt, start), lt(matches.kickoffAt, end)))
      .orderBy(asc(matches.matchNo));
    return rows.map((row) => row.raw as T);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[world-cup-db] stored matches unavailable:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}

function storedRowToMatch(row: {
  raw: unknown;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  canonicalPayload: unknown;
}): Match | undefined {
  const official = fifaRecordToMatch(row.raw as FifaScheduleRecord);
  const persisted = row.canonicalPayload
    && typeof row.canonicalPayload === "object"
    ? row.canonicalPayload as Match
    : undefined;
  const scoreAndStatus: Partial<Match> = {
    status: row.status === "finished" || row.status === "live" ? row.status : official.status,
  };
  if (row.homeScore !== null) scoreAndStatus.homeScore = row.homeScore;
  if (row.awayScore !== null) scoreAndStatus.awayScore = row.awayScore;
  return mergeMatchWithOfficialSource(official, {
    ...persisted,
    ...scoreAndStatus,
  } as Match);
}

export async function getStoredCanonicalMatches(bounds: { startUtc: string; endUtc: string }): Promise<Match[]> {
  if (!isDatabaseConfigured) return [];
  try {
    const start = new Date(bounds.startUtc);
    const end = new Date(bounds.endUtc);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return [];
    const rows = await getDb()
      .select({
        raw: matches.raw,
        status: matches.status,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
        canonicalPayload: matches.canonicalPayload,
      })
      .from(matches)
      .where(and(gte(matches.kickoffAt, start), lt(matches.kickoffAt, end)))
      .orderBy(asc(matches.matchNo));
    return rows
      .map(storedRowToMatch)
      .filter((match): match is Match => Boolean(match));
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[world-cup-db] stored canonical matches unavailable:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}

function hasPersistentMatchData(match: Match): boolean {
  return match.status !== "upcoming"
    || match.homeScore !== null
    || match.awayScore !== null
    || Boolean(match.events?.length)
    || Boolean(match.lineups?.length)
    || Boolean(match.statistics?.length)
    || Boolean(match.prediction)
    || Boolean(match.aiBriefZh)
    || Boolean(match.aiBriefEn);
}

function storedStatus(match: Match): "scheduled" | "live" | "finished" {
  if (match.status === "finished") return "finished";
  if (match.status === "live") return "live";
  return "scheduled";
}

export async function persistCanonicalMatches(matchesToPersist: Match[], sourceId: string): Promise<number> {
  if (!isDatabaseConfigured) return 0;
  const now = new Date();
  let written = 0;
  for (const match of matchesToPersist) {
    if (!match.id.startsWith("fifa-") || !hasPersistentMatchData(match)) continue;
    const values: {
      status: "scheduled" | "live" | "finished";
      canonicalPayload: Match;
      sourceId: string;
      sourceUpdatedAt: Date;
      updatedAt: Date;
      homeScore?: number;
      awayScore?: number;
    } = {
      status: storedStatus(match),
      canonicalPayload: match,
      sourceId,
      sourceUpdatedAt: now,
      updatedAt: now,
    };
    if (match.homeScore !== null) values.homeScore = match.homeScore;
    if (match.awayScore !== null) values.awayScore = match.awayScore;
    try {
      await getDb().update(matches).set(values).where(eq(matches.id, match.id));
      written += 1;
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[world-cup-db] canonical match persist skipped:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  return written;
}
