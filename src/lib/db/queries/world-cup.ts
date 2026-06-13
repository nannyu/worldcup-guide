import { and, asc, gte, lt } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../client";
import { matches } from "../schema/world-cup";

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
