import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, count, eq, gt, gte } from "drizzle-orm";
import { db, isDatabaseConfigured } from "../client";
import { dataSnapshots, dataSourceFetches, dataSourceUsageEvents } from "../schema/data-cache";

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

type FileRawFetch = {
  payload: unknown;
  expiresAt: string;
  fetchedAt: string;
  statusCode?: number | null;
  sourceId?: string | null;
};

type FileSnapshot = {
  payload: unknown;
  expiresAt: string;
  computedAt: string;
  sourceMode: string;
  sourceId?: string | null;
  diagnostics?: unknown;
};

type FileUsageEvent = {
  eventId: string;
  sourceId: string;
  sourceType: string;
  adapter: string;
  quotaCost: number;
  statusCode?: number;
  fetchedAt: string;
};

type RuntimeCacheFile = {
  rawFetches: Record<string, FileRawFetch>;
  snapshots: Record<string, FileSnapshot>;
  usageEvents: FileUsageEvent[];
};

const runtimeCachePath = path.join(process.cwd(), "data", "runtime-cache.json");

async function readRuntimeCache(): Promise<RuntimeCacheFile> {
  try {
    const raw = await readFile(runtimeCachePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<RuntimeCacheFile>;
    return {
      rawFetches: parsed.rawFetches || {},
      snapshots: parsed.snapshots || {},
      usageEvents: parsed.usageEvents || [],
    };
  } catch {
    return { rawFetches: {}, snapshots: {}, usageEvents: [] };
  }
}

async function writeRuntimeCache(cache: RuntimeCacheFile): Promise<void> {
  await mkdir(path.dirname(runtimeCachePath), { recursive: true });
  await writeFile(runtimeCachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function pruneRuntimeCache(cache: RuntimeCacheFile, now = new Date()): RuntimeCacheFile {
  const rawFetches = Object.fromEntries(
    Object.entries(cache.rawFetches).filter(([, value]) => new Date(value.expiresAt) > now),
  );
  const snapshots = Object.fromEntries(
    Object.entries(cache.snapshots).filter(([, value]) => new Date(value.expiresAt) > now),
  );
  const usageFloor = new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000).getTime();
  const usageEvents = cache.usageEvents
    .filter((event) => new Date(event.fetchedAt).getTime() >= usageFloor)
    .slice(-5000);
  return { rawFetches, snapshots, usageEvents };
}

export async function readRawFetchCache<T>(cacheKey: string): Promise<StoredCache<T> | undefined> {
  if (!isDatabaseConfigured) {
    const cache = await readRuntimeCache();
    const row = cache.rawFetches[cacheKey];
    if (!row || new Date(row.expiresAt) <= new Date()) return undefined;
    return {
      payload: row.payload as T,
      expiresAt: new Date(row.expiresAt),
      fetchedAt: new Date(row.fetchedAt),
      statusCode: row.statusCode,
      sourceId: row.sourceId,
    };
  }
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
  if (!isDatabaseConfigured) {
    const now = new Date();
    const cache = pruneRuntimeCache(await readRuntimeCache(), now);
    cache.rawFetches[input.cacheKey] = {
      payload: input.payload,
      expiresAt: new Date(now.getTime() + Math.max(10, input.ttlSeconds) * 1000).toISOString(),
      fetchedAt: now.toISOString(),
      statusCode: input.statusCode,
      sourceId: input.sourceId,
    };
    await writeRuntimeCache(cache);
    return;
  }
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
  if (!isDatabaseConfigured) {
    const cache = await readRuntimeCache();
    const row = cache.snapshots[snapshotKey];
    if (!row) return undefined;
    if (!options.allowStale && new Date(row.expiresAt) <= new Date()) return undefined;
    return {
      payload: row.payload as T,
      expiresAt: new Date(row.expiresAt),
      computedAt: new Date(row.computedAt),
      sourceMode: row.sourceMode,
      sourceId: row.sourceId,
      diagnostics: row.diagnostics,
    };
  }
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
  sourceMode: "remote" | "fallback";
  sourceId?: string | null;
  payload: unknown;
  diagnostics: unknown;
  ttlSeconds: number;
}): Promise<void> {
  if (!isDatabaseConfigured) {
    const now = new Date();
    const cache = pruneRuntimeCache(await readRuntimeCache(), now);
    cache.snapshots[input.snapshotKey] = {
      payload: input.payload,
      diagnostics: input.diagnostics,
      sourceMode: input.sourceMode,
      sourceId: input.sourceId,
      computedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + Math.max(10, input.ttlSeconds) * 1000).toISOString(),
    };
    await writeRuntimeCache(cache);
    return;
  }
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

export async function countSourceUsageSince(sourceId: string, since: Date): Promise<number> {
  if (!isDatabaseConfigured) {
    const sinceMs = since.getTime();
    const cache = await readRuntimeCache();
    return cache.usageEvents.filter(
      (event) => event.sourceId === sourceId && new Date(event.fetchedAt).getTime() >= sinceMs,
    ).length;
  }
  try {
    const rows = await db
      .select({ value: count() })
      .from(dataSourceUsageEvents)
      .where(
        and(
          eq(dataSourceUsageEvents.sourceId, sourceId),
          gte(dataSourceUsageEvents.fetchedAt, since),
        ),
      );
    return Number(rows[0]?.value || 0);
  } catch (error) {
    logDbCacheError("count source usage", error);
    return 0;
  }
}

export async function recordSourceUsage(input: {
  eventId: string;
  sourceId: string;
  sourceType: string;
  adapter: string;
  quotaCost?: number;
  statusCode?: number;
  fetchedAt?: Date;
}): Promise<void> {
  if (!isDatabaseConfigured) {
    const now = new Date();
    const cache = pruneRuntimeCache(await readRuntimeCache(), now);
    if (!cache.usageEvents.some((event) => event.eventId === input.eventId)) {
      cache.usageEvents.push({
        eventId: input.eventId,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        adapter: input.adapter,
        quotaCost: Math.max(1, Math.round(input.quotaCost || 1)),
        statusCode: input.statusCode,
        fetchedAt: (input.fetchedAt || now).toISOString(),
      });
    }
    await writeRuntimeCache(cache);
    return;
  }
  try {
    await db
      .insert(dataSourceUsageEvents)
      .values({
        eventId: input.eventId,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        adapter: input.adapter,
        quotaCost: Math.max(1, Math.round(input.quotaCost || 1)),
        statusCode: input.statusCode,
        fetchedAt: input.fetchedAt || new Date(),
      })
      .onConflictDoNothing();
  } catch (error) {
    logDbCacheError("record source usage", error);
  }
}
