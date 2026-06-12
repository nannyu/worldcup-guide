import { desc, inArray } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../client";
import { ingestionRuns, type IngestionRun } from "../schema/world-cup";

export type RecordIngestionRunInput = {
  sourceId: string;
  feature: string;
  status: "succeeded" | "failed";
  startedAt: Date;
  finishedAt?: Date;
  recordsRead?: number;
  recordsWritten?: number;
  errorMessage?: string;
  metadata?: unknown;
};

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export async function recordIngestionRun(input: RecordIngestionRunInput): Promise<IngestionRun | undefined> {
  if (!isDatabaseConfigured) return undefined;

  try {
    const rows = await getDb()
      .insert(ingestionRuns)
      .values({
        sourceId: truncate(input.sourceId, 128) || "unknown",
        feature: truncate(input.feature, 64) || "unknown",
        status: input.status,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt || new Date(),
        recordsRead: Math.max(0, Math.round(input.recordsRead || 0)),
        recordsWritten: Math.max(0, Math.round(input.recordsWritten || 0)),
        errorMessage: truncate(input.errorMessage, 2000),
        metadata: input.metadata,
      })
      .returning();
    return rows[0];
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[ingestion-runs] record skipped:",
        error instanceof Error ? error.message : error,
      );
    }
    return undefined;
  }
}

export async function listRecentIngestionRuns(limit = 200): Promise<IngestionRun[]> {
  if (!isDatabaseConfigured) return [];
  try {
    return getDb()
      .select()
      .from(ingestionRuns)
      .orderBy(desc(ingestionRuns.startedAt))
      .limit(limit);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[ingestion-runs] list skipped:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}

export async function listRecentIngestionRunsForSources(sourceIds: string[], limit = 200): Promise<IngestionRun[]> {
  const ids = Array.from(new Set(sourceIds.filter(Boolean).map((sourceId) => sourceId.slice(0, 128))));
  if (!ids.length || !isDatabaseConfigured) return [];
  try {
    return getDb()
      .select()
      .from(ingestionRuns)
      .where(inArray(ingestionRuns.sourceId, ids))
      .orderBy(desc(ingestionRuns.startedAt))
      .limit(limit);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[ingestion-runs] source list skipped:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}
