import { asc, eq } from "drizzle-orm";
import { db, isDatabaseConfigured } from "../client";
import { matches } from "../schema/world-cup";

export async function getStoredOfficialMatches<T>(easternDate: string): Promise<T[]> {
  if (!isDatabaseConfigured) return [];
  try {
    const rows = await db
      .select({ raw: matches.raw })
      .from(matches)
      .where(eq(matches.easternDate, easternDate))
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
