import { asc } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../client";
import { players, type PlayerRecord } from "../schema/world-cup";

export async function getStoredFifaPlayers(): Promise<PlayerRecord[]> {
  if (!isDatabaseConfigured) return [];
  try {
    return await getDb()
      .select()
      .from(players)
      .orderBy(asc(players.teamCode), asc(players.shirtNumber));
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[players-db] stored FIFA players unavailable:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}
