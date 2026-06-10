import { and, eq, gt } from "drizzle-orm";
import { db, isDatabaseConfigured } from "../client";
import { dataSnapshots, dataSourceFetches } from "../schema/data-cache";

export interface StoredCache<T> {
  payload: T;
  expiresAt: Date;
  fetchedAt?: Date;
  computedAt?: Date;
  statusCode?: number | null;
  sourceMode?: string;
  sourceId?: string | null;
  diagnostics?: unknown;
}

function logDbCacheError(operation: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[db-cache] ${operation} skipped:`, error instanceof Error ? error.message : error);
  }
}

export async function readRawFetchCache<T>(cacheKey: string): Promise<StoredCache<T> | undefined> {
  if (!isDatabaseConfigured) return undefined;
  try {
    const rows = await db
      .select()
      .from(dataSourceFetches)
      .where(and(eq(dataSourceFetches.cacheKey, cacheKey), gt(dataSourceFetches.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      payload: row.payload as T,
      expiresAt: row.expiresAt,
      fetchedAt: row.fetchedAt,
      statusCode: row.statusCode,
      sourceId: row.sourceId,
    };
  } catch (error) {
    logDbCacheError("read raw fetch cache", error);
    return undefined;
  }
}

export async function upsertRawFetchCache(input: {
  cacheKey: string;
  sourceId: string;
  sourceType: string;
  adapter: string;
  requestUrl: string;
  requestParams: Record<string, string | number | undefined>;
  payload: unknown;
  statusCode?: number;
  ttlSeconds: number;
}): Promise<void> {
  if (!isDatabaseConfigured) return;
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(10, input.ttlSeconds) * 1000);
    await db
      .insert(dataSourceFetches)
      .values({
        cacheKey: input.cacheKey,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        adapter: input.adapter,
        requestUrl: input.requestUrl,
        requestParams: input.requestParams,
        payload: input.payload,
        statusCode: input.statusCode,
        fetchedAt: now,
        expiresAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: dataSourceFetches.cacheKey,
        set: {
          sourceId: input.sourceId,
          sourceType: input.sourceType,
          adapter: input.adapter,
          requestUrl: input.requestUrl,
          requestParams: input.requestParams,
          payload: input.payload,
          statusCode: input.statusCode,
          fetchedAt: now,
          expiresAt,
          updatedAt: now,
        },
      });
  } catch (error) {
    logDbCacheError("write raw fetch cache", error);
  }
}

export async function readSnapshotCache<T>(
  snapshotKey: string,
  options: { allowStale?: boolean } = {},
): Promise<StoredCache<T> | undefined> {
  if (!isDatabaseConfigured) return undefined;
  try {
    const rows = await db
      .select()
      .from(dataSnapshots)
      .where(eq(dataSnapshots.snapshotKey, snapshotKey))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    if (!options.allowStale && row.expiresAt <= new Date()) return undefined;
    return {
      payload: row.payload as T,
      expiresAt: row.expiresAt,
      computedAt: row.computedAt,
      sourceMode: row.sourceMode,
      sourceId: row.sourceId,
      diagnostics: row.diagnostics,
    };
  } catch (error) {
    logDbCacheError("read snapshot cache", error);
    return undefined;
  }
}

export async function upsertSnapshotCache(input: {
  snapshotKey: string;
  feature: string;
  sourceMode: "remote" | "fallback" | "mock";
  sourceId?: string | null;
  payload: unknown;
  diagnostics: unknown;
  ttlSeconds: number;
}): Promise<void> {
  if (!isDatabaseConfigured) return;
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(10, input.ttlSeconds) * 1000);
    await db
      .insert(dataSnapshots)
      .values({
        snapshotKey: input.snapshotKey,
        feature: input.feature,
        sourceMode: input.sourceMode,
        sourceId: input.sourceId,
        payload: input.payload,
        diagnostics: input.diagnostics,
        computedAt: now,
        expiresAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: dataSnapshots.snapshotKey,
        set: {
          feature: input.feature,
          sourceMode: input.sourceMode,
          sourceId: input.sourceId,
          payload: input.payload,
          diagnostics: input.diagnostics,
          computedAt: now,
          expiresAt,
          updatedAt: now,
        },
      });
  } catch (error) {
    logDbCacheError("write snapshot cache", error);
  }
}
