import { getSql, isDatabaseConfigured } from "../client";

export interface CacheCleanupResult {
  snapshotsDeleted: number;
  fetchesDeleted: number;
  usageEventsDeleted: number;
  marketSnapshotsDeleted: number;
  backgroundJobsDeleted: number;
}

const SNAPSHOTS_TO_KEEP_PER_FEATURE = 10;
const USAGE_EVENTS_RETENTION_DAYS = 7;
const MARKET_SNAPSHOTS_TO_KEEP_PER_MARKET = 50;
const FETCHES_RETENTION_HOURS = 48;
const BACKGROUND_JOBS_RETENTION_DAYS = 7;

export async function pruneStaleCacheData(): Promise<CacheCleanupResult> {
  const empty: CacheCleanupResult = {
    snapshotsDeleted: 0,
    fetchesDeleted: 0,
    usageEventsDeleted: 0,
    marketSnapshotsDeleted: 0,
    backgroundJobsDeleted: 0,
  };

  if (!isDatabaseConfigured) return empty;

  try {
    const sql = getSql();
    const results = await Promise.all([
      pruneSnapshots(sql),
      pruneFetches(sql),
      pruneUsageEvents(sql),
      pruneMarketSnapshots(sql),
      pruneBackgroundJobs(sql),
    ]);

    return {
      snapshotsDeleted: results[0],
      fetchesDeleted: results[1],
      usageEventsDeleted: results[2],
      marketSnapshotsDeleted: results[3],
      backgroundJobsDeleted: results[4],
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[cache-cleanup] pruning failed:",
        error instanceof Error ? error.message : error,
      );
    }
    return empty;
  }
}

async function pruneSnapshots(sql: ReturnType<typeof getSql>): Promise<number> {
  const result = await sql`
    DELETE FROM data_snapshots
    WHERE snapshot_key IN (
      SELECT snapshot_key
      FROM (
        SELECT
          snapshot_key,
          ROW_NUMBER() OVER (
            PARTITION BY feature
            ORDER BY updated_at DESC
          ) AS rn
        FROM data_snapshots
      ) ranked
      WHERE ranked.rn > ${SNAPSHOTS_TO_KEEP_PER_FEATURE}
    )
  `;
  return result.count ?? 0;
}

async function pruneFetches(sql: ReturnType<typeof getSql>): Promise<number> {
  const cutoff = new Date(Date.now() - FETCHES_RETENTION_HOURS * 60 * 60 * 1000);
  const result = await sql`
    DELETE FROM data_source_fetches
    WHERE expires_at < ${cutoff}
  `;
  return result.count ?? 0;
}

async function pruneUsageEvents(sql: ReturnType<typeof getSql>): Promise<number> {
  const cutoff = new Date(Date.now() - USAGE_EVENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await sql`
    DELETE FROM data_source_usage_events
    WHERE fetched_at < ${cutoff}
  `;
  return result.count ?? 0;
}

async function pruneMarketSnapshots(sql: ReturnType<typeof getSql>): Promise<number> {
  const result = await sql`
    DELETE FROM market_snapshots
    WHERE id IN (
      SELECT id
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY provider, external_market_id
            ORDER BY captured_at DESC
          ) AS rn
        FROM market_snapshots
      ) ranked
      WHERE ranked.rn > ${MARKET_SNAPSHOTS_TO_KEEP_PER_MARKET}
    )
  `;
  return result.count ?? 0;
}

async function pruneBackgroundJobs(sql: ReturnType<typeof getSql>): Promise<number> {
  const cutoff = new Date(Date.now() - BACKGROUND_JOBS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await sql`
    DELETE FROM background_jobs
    WHERE status IN ('succeeded', 'failed')
      AND finished_at < ${cutoff}
  `;
  return result.count ?? 0;
}
