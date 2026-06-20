import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, count, desc, eq, gt, gte, inArray, like } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../client";
import { dataSnapshots, dataSourceFetches, dataSourceUsageEvents } from "../schema/data-cache";

export interface StoredCache<T> {
  payload: T;
  storage: "database" | "file";
  expiresAt: Date;
  fetchedAt?: Date;
  computedAt?: Date;
  statusCode?: number | null;
  sourceMode?: string;
  sourceId?: string | null;
  diagnostics?: unknown;
}

export interface LatestSnapshotCache<T> extends StoredCache<T> {
  snapshotKey: string;
}

export interface SnapshotCacheRecord<T> extends StoredCache<T> {
  snapshotKey: string;
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
  feature?: string;
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

type RawFetchCacheInput = {
  cacheKey: string;
  sourceId: string;
  sourceType: string;
  adapter: string;
  requestUrl: string;
  requestParams: Record<string, string | number | undefined>;
  payload: unknown;
  statusCode?: number;
  ttlSeconds: number;
};

type SnapshotCacheInput = {
  snapshotKey: string;
  feature: string;
  sourceMode: "remote" | "fallback";
  sourceId?: string | null;
  payload: unknown;
  diagnostics: unknown;
  ttlSeconds: number;
};

type SourceUsageInput = {
  eventId: string;
  sourceId: string;
  sourceType: string;
  adapter: string;
  quotaCost?: number;
  statusCode?: number;
  fetchedAt?: Date;
};

const runtimeCachePath = path.join(process.cwd(), "data", "runtime-cache.json");

function canUseRuntimeFileCache(): boolean {
  return !isDatabaseConfigured && process.env.NODE_ENV !== "production";
}

function assertRuntimeCacheAllowed(operation: string) {
  if (!canUseRuntimeFileCache()) {
    throw new Error(`DATABASE_URL is required for ${operation} in production.`);
  }
}

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
  let serialized = JSON.stringify(cache, null, 2);
  // Size guard: if file exceeds 1MB, prune more aggressively
  if (Buffer.byteLength(serialized, "utf8") > 1_000_000) {
    const pruned: RuntimeCacheFile = {
      rawFetches: Object.fromEntries(Object.entries(cache.rawFetches).slice(-200)),
      snapshots: Object.fromEntries(Object.entries(cache.snapshots).slice(-100)),
      usageEvents: cache.usageEvents.slice(-200),
    };
    serialized = JSON.stringify(pruned, null, 2);
  }
  await writeFile(runtimeCachePath, `${serialized}\n`, "utf8");
}

function pruneRuntimeCache(cache: RuntimeCacheFile, now = new Date()): RuntimeCacheFile {
  const rawFetches = Object.fromEntries(
    Object.entries(cache.rawFetches)
      .filter(([, value]) => new Date(value.expiresAt) > now)
      .slice(-1000),
  );
  const snapshots = Object.fromEntries(
    Object.entries(cache.snapshots)
      .filter(([, value]) => new Date(value.expiresAt) > now)
      .slice(-500),
  );
  const usageFloor = new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000).getTime();
  const usageEvents = cache.usageEvents
    .filter((event) => new Date(event.fetchedAt).getTime() >= usageFloor)
    .slice(-1000);
  return { rawFetches, snapshots, usageEvents };
}

async function readRawFetchFile<T>(cacheKey: string): Promise<StoredCache<T> | undefined> {
  const cache = await readRuntimeCache();
  const row = cache.rawFetches[cacheKey];
  if (!row || new Date(row.expiresAt) <= new Date()) return undefined;
  return {
    payload: row.payload as T,
    storage: "file",
    expiresAt: new Date(row.expiresAt),
    fetchedAt: new Date(row.fetchedAt),
    statusCode: row.statusCode,
    sourceId: row.sourceId,
  };
}

async function upsertRawFetchFile(input: RawFetchCacheInput): Promise<void> {
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
}

async function readSnapshotFile<T>(
  snapshotKey: string,
  options: { allowStale?: boolean } = {},
): Promise<StoredCache<T> | undefined> {
  const cache = await readRuntimeCache();
  const row = cache.snapshots[snapshotKey];
  if (!row) return undefined;
  if (!options.allowStale && new Date(row.expiresAt) <= new Date()) return undefined;
  return {
    payload: row.payload as T,
    storage: "file",
    expiresAt: new Date(row.expiresAt),
    computedAt: new Date(row.computedAt),
    sourceMode: row.sourceMode,
    sourceId: row.sourceId,
    diagnostics: row.diagnostics,
  };
}

async function readLatestSnapshotFile<T>(
  feature: string,
  options: { allowStale?: boolean } = {},
): Promise<LatestSnapshotCache<T> | undefined> {
  const cache = await readRuntimeCache();
  const now = new Date();
  const rows = Object.entries(cache.snapshots)
    .filter(([snapshotKey, row]) => {
      const featureMatches = row.feature === feature || snapshotKey.startsWith(`${feature}:`);
      if (!featureMatches) return false;
      return options.allowStale || new Date(row.expiresAt) > now;
    })
    .sort(([, left], [, right]) => new Date(right.computedAt).getTime() - new Date(left.computedAt).getTime());
  const [snapshotKey, row] = rows[0] || [];
  if (!snapshotKey || !row) return undefined;
  return {
    snapshotKey,
    payload: row.payload as T,
    storage: "file",
    expiresAt: new Date(row.expiresAt),
    computedAt: new Date(row.computedAt),
    sourceMode: row.sourceMode,
    sourceId: row.sourceId,
    diagnostics: row.diagnostics,
  };
}

async function readRecentSnapshotFiles<T>(
  feature: string,
  options: { allowStale?: boolean; limit?: number; snapshotKeyPrefix?: string } = {},
): Promise<Array<SnapshotCacheRecord<T>>> {
  const cache = await readRuntimeCache();
  const now = new Date();
  return Object.entries(cache.snapshots)
    .filter(([snapshotKey, row]) => {
      const featureMatches = row.feature === feature || snapshotKey.startsWith(`${feature}:`);
      if (!featureMatches) return false;
      if (options.snapshotKeyPrefix && !snapshotKey.startsWith(options.snapshotKeyPrefix)) return false;
      return options.allowStale || new Date(row.expiresAt) > now;
    })
    .sort(([, left], [, right]) => new Date(right.computedAt).getTime() - new Date(left.computedAt).getTime())
    .slice(0, Math.max(1, Math.min(options.limit || 10, 100)))
    .map(([snapshotKey, row]) => ({
      snapshotKey,
      payload: row.payload as T,
      storage: "file",
      expiresAt: new Date(row.expiresAt),
      computedAt: new Date(row.computedAt),
      sourceMode: row.sourceMode,
      sourceId: row.sourceId,
      diagnostics: row.diagnostics,
    }));
}

async function upsertSnapshotFile(input: SnapshotCacheInput): Promise<void> {
  const now = new Date();
  const cache = pruneRuntimeCache(await readRuntimeCache(), now);
  cache.snapshots[input.snapshotKey] = {
    feature: input.feature,
    payload: input.payload,
    diagnostics: input.diagnostics,
    sourceMode: input.sourceMode,
    sourceId: input.sourceId,
    computedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + Math.max(10, input.ttlSeconds) * 1000).toISOString(),
  };
  await writeRuntimeCache(cache);
}

async function countSourceUsageFile(sourceId: string, since: Date): Promise<number> {
  const sinceMs = since.getTime();
  const cache = await readRuntimeCache();
  return cache.usageEvents.filter(
    (event) => event.sourceId === sourceId && new Date(event.fetchedAt).getTime() >= sinceMs,
  ).length;
}

async function recordSourceUsageFile(input: SourceUsageInput): Promise<void> {
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
}

export async function readRawFetchCache<T>(cacheKey: string): Promise<StoredCache<T> | undefined> {
  if (!isDatabaseConfigured) {
    assertRuntimeCacheAllowed("read raw fetch cache");
    return readRawFetchFile<T>(cacheKey);
  }
  try {
    const rows = await getDb()
      .select()
      .from(dataSourceFetches)
      .where(and(eq(dataSourceFetches.cacheKey, cacheKey), gt(dataSourceFetches.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      payload: row.payload as T,
      storage: "database",
      expiresAt: row.expiresAt,
      fetchedAt: row.fetchedAt,
      statusCode: row.statusCode,
      sourceId: row.sourceId,
    };
  } catch (error) {
    logDbCacheError("read raw fetch cache", error);
    return readRawFetchFile<T>(cacheKey);
  }
}

export async function upsertRawFetchCache(input: RawFetchCacheInput): Promise<void> {
  if (!isDatabaseConfigured) {
    assertRuntimeCacheAllowed("write raw fetch cache");
    await upsertRawFetchFile(input);
    return;
  }
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(10, input.ttlSeconds) * 1000);
    await getDb()
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
    await upsertRawFetchFile(input);
  }
}

export async function readSnapshotCache<T>(
  snapshotKey: string,
  options: { allowStale?: boolean } = {},
): Promise<StoredCache<T> | undefined> {
  if (!isDatabaseConfigured) {
    assertRuntimeCacheAllowed("read snapshot cache");
    return readSnapshotFile<T>(snapshotKey, options);
  }
  try {
    const rows = await getDb()
      .select()
      .from(dataSnapshots)
      .where(eq(dataSnapshots.snapshotKey, snapshotKey))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    if (!options.allowStale && row.expiresAt <= new Date()) return undefined;
    return {
      payload: row.payload as T,
      storage: "database",
      expiresAt: row.expiresAt,
      computedAt: row.computedAt,
      sourceMode: row.sourceMode,
      sourceId: row.sourceId,
      diagnostics: row.diagnostics,
    };
  } catch (error) {
    logDbCacheError("read snapshot cache", error);
    return readSnapshotFile<T>(snapshotKey, options);
  }
}

export async function readLatestSnapshotCache<T>(
  feature: string,
  options: { allowStale?: boolean } = {},
): Promise<LatestSnapshotCache<T> | undefined> {
  if (!isDatabaseConfigured) {
    assertRuntimeCacheAllowed("read latest snapshot cache");
    return readLatestSnapshotFile<T>(feature, options);
  }
  try {
    const where = options.allowStale
      ? eq(dataSnapshots.feature, feature)
      : and(eq(dataSnapshots.feature, feature), gt(dataSnapshots.expiresAt, new Date()));
    const rows = await getDb()
      .select()
      .from(dataSnapshots)
      .where(where)
      .orderBy(desc(dataSnapshots.computedAt))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      snapshotKey: row.snapshotKey,
      payload: row.payload as T,
      storage: "database",
      expiresAt: row.expiresAt,
      computedAt: row.computedAt,
      sourceMode: row.sourceMode,
      sourceId: row.sourceId,
      diagnostics: row.diagnostics,
    };
  } catch (error) {
    logDbCacheError("read latest snapshot cache", error);
    return readLatestSnapshotFile<T>(feature, options);
  }
}

export async function readRecentSnapshotCaches<T>(
  feature: string,
  options: { allowStale?: boolean; limit?: number; snapshotKeyPrefix?: string } = {},
): Promise<Array<SnapshotCacheRecord<T>>> {
  if (!isDatabaseConfigured) {
    assertRuntimeCacheAllowed("read recent snapshot caches");
    return readRecentSnapshotFiles<T>(feature, options);
  }
  try {
    const clauses = [eq(dataSnapshots.feature, feature)];
    if (!options.allowStale) clauses.push(gt(dataSnapshots.expiresAt, new Date()));
    if (options.snapshotKeyPrefix) clauses.push(like(dataSnapshots.snapshotKey, `${options.snapshotKeyPrefix}%`));
    const rows = await getDb()
      .select()
      .from(dataSnapshots)
      .where(and(...clauses))
      .orderBy(desc(dataSnapshots.computedAt))
      .limit(Math.max(1, Math.min(options.limit || 10, 100)));
    return rows.map((row) => ({
      snapshotKey: row.snapshotKey,
      payload: row.payload as T,
      storage: "database",
      expiresAt: row.expiresAt,
      computedAt: row.computedAt,
      sourceMode: row.sourceMode,
      sourceId: row.sourceId,
      diagnostics: row.diagnostics,
    }));
  } catch (error) {
    logDbCacheError("read recent snapshot caches", error);
    return readRecentSnapshotFiles<T>(feature, options);
  }
}

export async function upsertSnapshotCache(input: SnapshotCacheInput): Promise<void> {
  if (!isDatabaseConfigured) {
    assertRuntimeCacheAllowed("write snapshot cache");
    await upsertSnapshotFile(input);
    return;
  }
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(10, input.ttlSeconds) * 1000);
    await getDb()
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
    await upsertSnapshotFile(input);
  }
}

export async function countSourceUsageSince(sourceId: string, since: Date): Promise<number> {
  if (!isDatabaseConfigured) {
    assertRuntimeCacheAllowed("count source usage");
    return countSourceUsageFile(sourceId, since);
  }
  try {
    const rows = await getDb()
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
    return countSourceUsageFile(sourceId, since);
  }
}

export async function recordSourceUsage(input: SourceUsageInput): Promise<void> {
  if (!isDatabaseConfigured) {
    assertRuntimeCacheAllowed("record source usage");
    await recordSourceUsageFile(input);
    return;
  }
  try {
    await getDb()
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
    await recordSourceUsageFile(input);
  }
}

export type LatestSourceUsage = {
  sourceId: string;
  sourceType: string;
  adapter: string;
  statusCode?: number | null;
  fetchedAt: Date;
};

export async function getLatestSourceUsageByIds(sourceIds: string[]): Promise<Map<string, LatestSourceUsage>> {
  const ids = Array.from(new Set(sourceIds.filter(Boolean)));
  const result = new Map<string, LatestSourceUsage>();
  if (!ids.length) return result;

  if (!isDatabaseConfigured) {
    const cache = await readRuntimeCache();
    const rows = cache.usageEvents
      .filter((event) => ids.includes(event.sourceId))
      .sort((left, right) => new Date(right.fetchedAt).getTime() - new Date(left.fetchedAt).getTime());
    for (const row of rows) {
      if (result.has(row.sourceId)) continue;
      result.set(row.sourceId, {
        sourceId: row.sourceId,
        sourceType: row.sourceType,
        adapter: row.adapter,
        statusCode: row.statusCode,
        fetchedAt: new Date(row.fetchedAt),
      });
    }
    return result;
  }

  try {
    const rows = await getDb()
      .select()
      .from(dataSourceUsageEvents)
      .where(inArray(dataSourceUsageEvents.sourceId, ids))
      .orderBy(desc(dataSourceUsageEvents.fetchedAt))
      .limit(Math.max(ids.length * 5, 50));
    for (const row of rows) {
      if (result.has(row.sourceId)) continue;
      result.set(row.sourceId, {
        sourceId: row.sourceId,
        sourceType: row.sourceType,
        adapter: row.adapter,
        statusCode: row.statusCode,
        fetchedAt: row.fetchedAt,
      });
    }
  } catch (error) {
    logDbCacheError("latest source usage", error);
  }
  return result;
}
