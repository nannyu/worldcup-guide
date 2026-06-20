import { createHash } from "node:crypto";
import type { DataSourceConfig, DataSourceType } from "@/lib/admin/config";
import {
  countSourceUsageSince,
  readRawFetchCache,
  recordSourceUsage,
  upsertRawFetchCache,
} from "@/lib/db/queries/data-cache";
import { getEffectiveRefreshSeconds, getRatePolicyForSource } from "./rate-policy";

export interface SourceDiagnostic {
  id: string;
  name: string;
  adapter: string;
  type: DataSourceType;
  ok: boolean;
  fromCache: boolean;
  cacheStorage?: "database" | "file";
  status?: number;
  message: string;
  updatedAt: string;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
  status: number;
}

class LruMap<K, V> {
  private map = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }
}

const cache = new LruMap<string, CacheEntry>(5000);
const localUsage = new LruMap<string, number[]>(1000);

// Per-source async lock to serialize assert+fetch+record, preventing rate-limit race conditions
const fetchLocks = new Map<string, Promise<unknown>>();

function joinUrl(baseUrl: string, endpointPath: string): string {
  if (!baseUrl) return endpointPath;
  if (!endpointPath) return baseUrl;
  return `${baseUrl.replace(/\/$/, "")}/${endpointPath.replace(/^\//, "")}`;
}

function applyAuth(url: URL, headers: Headers, source: DataSourceConfig) {
  if (!source.apiKey || source.apiKeyPlacement === "none") return;

  if (source.apiKeyPlacement === "path") {
    const placeholder = /(?:%7B|\{)apiKey(?:%7D|\})/i;
    url.pathname = placeholder.test(url.pathname)
      ? url.pathname.replace(placeholder, encodeURIComponent(source.apiKey))
      : `${url.pathname.replace(/\/$/, "")}/${encodeURIComponent(source.apiKey)}`;
    return;
  }

  if (source.apiKeyPlacement === "query") {
    url.searchParams.set(source.apiKeyParamName || "key", source.apiKey);
    return;
  }

  if (source.apiKeyPlacement === "bearer") {
    headers.set(source.apiKeyHeaderName || "Authorization", `Bearer ${source.apiKey}`);
    return;
  }

  headers.set(source.apiKeyHeaderName || "X-API-Key", source.apiKey);
}

function redactRequestUrl(url: URL, source: DataSourceConfig): string {
  const redacted = new URL(url);
  if (!source.apiKey) return redacted.toString();

  if (source.apiKeyPlacement === "query") {
    redacted.searchParams.set(source.apiKeyParamName || "key", "[REDACTED]");
  } else if (source.apiKeyPlacement === "path") {
    redacted.pathname = redacted.pathname.replace(
      encodeURIComponent(source.apiKey),
      "[REDACTED]",
    );
  }
  return redacted.toString();
}

function usageWindowStart(windowSeconds: number, now: Date): Date {
  return new Date(now.getTime() - Math.max(1, windowSeconds) * 1000);
}

function dayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function countLocalUsage(sourceId: string, since: Date): number {
  const sinceMs = since.getTime();
  const values = (localUsage.get(sourceId) || []).filter((value) => value >= sinceMs);
  localUsage.set(sourceId, values);
  return values.length;
}

async function fetchWithRetry(
  url: URL,
  init: RequestInit,
  maxRetries = 1,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429 || attempt === maxRetries) return response;
    const retryAfter = response.headers.get("Retry-After");
    const delayMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 15000) : 5000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("unreachable");
}

async function countUsage(sourceId: string, since: Date): Promise<number> {
  const databaseCount = await countSourceUsageSince(sourceId, since);
  return Math.max(databaseCount, countLocalUsage(sourceId, since));
}

async function assertSourceCanFetch(source: DataSourceConfig, now: Date): Promise<void> {
  const policy = getRatePolicyForSource(source);
  if (policy.officialLimit && policy.officialWindowSeconds) {
    const used = await countUsage(source.id, usageWindowStart(policy.officialWindowSeconds, now));
    if (used >= policy.officialLimit) {
      throw new Error(
        `local rate gate: ${source.id} used ${used}/${policy.officialLimit} in ${policy.officialWindowSeconds}s`,
      );
    }
  }
  if (policy.dailyQuota) {
    const allowed = Math.max(1, Math.floor(policy.dailyQuota * (policy.quotaSafetyRatio ?? 0.8)));
    const used = await countUsage(source.id, dayStart(now));
    if (used >= allowed) {
      throw new Error(`local quota gate: ${source.id} used ${used}/${allowed} today`);
    }
  }
  if (policy.monthlyQuota) {
    const allowed = Math.max(1, Math.floor(policy.monthlyQuota * (policy.quotaSafetyRatio ?? 0.8)));
    const used = await countUsage(source.id, monthStart(now));
    if (used >= allowed) {
      throw new Error(`local quota gate: ${source.id} used ${used}/${allowed} this month`);
    }
  }
}

async function recordSuccessfulFetch(
  source: DataSourceConfig,
  cacheKey: string,
  statusCode: number,
  fetchedAt: Date,
) {
  const policy = getRatePolicyForSource(source);
  const events = localUsage.get(source.id) || [];
  events.push(fetchedAt.getTime());
  localUsage.set(source.id, events);
  await recordSourceUsage({
    eventId: `${cacheKey}:${fetchedAt.getTime()}`,
    sourceId: source.id,
    sourceType: source.type,
    adapter: source.adapter,
    quotaCost: policy.quotaCost || 1,
    statusCode,
    fetchedAt,
  });
}

async function fetchAndRecordJson<T>(
  source: DataSourceConfig,
  url: URL,
  headers: Headers,
  requestParams: Record<string, string | number | undefined>,
  cacheKey: string,
  ttlSeconds: number,
  signal: AbortSignal,
): Promise<{ data: T; diagnostic: SourceDiagnostic }> {
  const now = Date.now();
  await assertSourceCanFetch(source, new Date());
  const response = await fetchWithRetry(url, { headers, signal, next: { revalidate: ttlSeconds } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as T;
  cache.set(cacheKey, { value: data, status: response.status, expiresAt: now + ttlSeconds * 1000 });
  await upsertRawFetchCache({
    cacheKey, sourceId: source.id, sourceType: source.type, adapter: source.adapter,
    requestUrl: redactRequestUrl(url, source), requestParams, payload: data,
    statusCode: response.status, ttlSeconds,
  });
  await recordSuccessfulFetch(source, cacheKey, response.status, new Date());
  return {
    data,
    diagnostic: {
      id: source.id, name: source.name, adapter: source.adapter, type: source.type,
      ok: true, fromCache: false, status: response.status, message: "fetched",
      updatedAt: new Date().toISOString(),
    },
  };
}

async function fetchAndRecordText(
  source: DataSourceConfig,
  url: URL,
  headers: Headers,
  requestParams: Record<string, string | number | undefined>,
  cacheKey: string,
  ttlSeconds: number,
  signal: AbortSignal,
): Promise<{ data: string; diagnostic: SourceDiagnostic }> {
  const now = Date.now();
  await assertSourceCanFetch(source, new Date());
  const response = await fetchWithRetry(url, { headers, signal, next: { revalidate: ttlSeconds } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.text();
  cache.set(cacheKey, { value: data, status: response.status, expiresAt: now + ttlSeconds * 1000 });
  await upsertRawFetchCache({
    cacheKey, sourceId: source.id, sourceType: source.type, adapter: source.adapter,
    requestUrl: redactRequestUrl(url, source), requestParams, payload: data,
    statusCode: response.status, ttlSeconds,
  });
  await recordSuccessfulFetch(source, cacheKey, response.status, new Date());
  return {
    data,
    diagnostic: {
      id: source.id, name: source.name, adapter: source.adapter, type: source.type,
      ok: true, fromCache: false, status: response.status, message: "fetched",
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function fetchJsonFromSource<T>(
  source: DataSourceConfig,
  params?: Record<string, string | number | undefined>,
): Promise<{ data: T; diagnostic: SourceDiagnostic }> {
  const url = new URL(joinUrl(source.baseUrl, source.endpointPath));
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const headers = new Headers({ accept: "application/json" });
  applyAuth(url, headers, source);

  const requestParams = params || {};
  const ttlSeconds = getEffectiveRefreshSeconds(source);
  const cacheKey = createHash("sha256")
    .update(`${source.id}:${url.toString()}`)
    .digest("hex");
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      data: cached.value as T,
      diagnostic: {
        id: source.id,
        name: source.name,
        adapter: source.adapter,
        type: source.type,
        ok: true,
        fromCache: true,
        status: cached.status,
        message: "cache hit",
        updatedAt: new Date().toISOString(),
      },
    };
  }

  const persisted = await readRawFetchCache<T>(cacheKey);
  if (persisted) {
    cache.set(cacheKey, {
      value: persisted.payload,
      status: persisted.statusCode || 200,
      expiresAt: persisted.expiresAt.getTime(),
    });
    return {
      data: persisted.payload,
      diagnostic: {
        id: source.id,
        name: source.name,
        adapter: source.adapter,
        type: source.type,
        ok: true,
        fromCache: true,
        cacheStorage: persisted.storage,
        status: persisted.statusCode || 200,
        message: persisted.storage === "database" ? "database cache hit" : "runtime file cache hit",
        updatedAt: persisted.fetchedAt?.toISOString() || new Date().toISOString(),
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), source.timeoutMs || 6000);
  try {
    // Serialize assert+fetch+record per source to prevent rate-limit race conditions
    const lockKey = source.id;
    const prev = fetchLocks.get(lockKey) || Promise.resolve();
    const next = prev.then(
      () => fetchAndRecordJson<T>(source, url, headers, requestParams, cacheKey, ttlSeconds, controller.signal),
    ).catch(
      () => fetchAndRecordJson<T>(source, url, headers, requestParams, cacheKey, ttlSeconds, controller.signal),
    );
    fetchLocks.set(lockKey, next);
    const result = await next;
    // Clean up this lock entry if it's still pointing to our resolved promise
    if (fetchLocks.get(lockKey) === next) fetchLocks.delete(lockKey);
    return result;
  } catch (error) {
    return Promise.reject({
      id: source.id,
      name: source.name,
      adapter: source.adapter,
      type: source.type,
      ok: false,
      fromCache: false,
      message: error instanceof Error ? error.message : "unknown error",
      updatedAt: new Date().toISOString(),
    } satisfies SourceDiagnostic);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTextFromSource(
  source: DataSourceConfig,
  params?: Record<string, string | number | undefined>,
): Promise<{ data: string; diagnostic: SourceDiagnostic }> {
  const url = new URL(joinUrl(source.baseUrl, source.endpointPath));
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const headers = new Headers({ accept: "application/rss+xml, application/xml, text/xml, text/plain, */*" });
  applyAuth(url, headers, source);

  const requestParams = params || {};
  const ttlSeconds = getEffectiveRefreshSeconds(source);
  const cacheKey = createHash("sha256")
    .update(`${source.id}:${url.toString()}:text`)
    .digest("hex");
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now && typeof cached.value === "string") {
    return {
      data: cached.value,
      diagnostic: {
        id: source.id,
        name: source.name,
        adapter: source.adapter,
        type: source.type,
        ok: true,
        fromCache: true,
        status: cached.status,
        message: "cache hit",
        updatedAt: new Date().toISOString(),
      },
    };
  }

  const persisted = await readRawFetchCache<string>(cacheKey);
  if (persisted && typeof persisted.payload === "string") {
    cache.set(cacheKey, {
      value: persisted.payload,
      status: persisted.statusCode || 200,
      expiresAt: persisted.expiresAt.getTime(),
    });
    return {
      data: persisted.payload,
      diagnostic: {
        id: source.id,
        name: source.name,
        adapter: source.adapter,
        type: source.type,
        ok: true,
        fromCache: true,
        cacheStorage: persisted.storage,
        status: persisted.statusCode || 200,
        message: persisted.storage === "database" ? "database cache hit" : "runtime file cache hit",
        updatedAt: persisted.fetchedAt?.toISOString() || new Date().toISOString(),
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), source.timeoutMs || 6000);
  try {
    const lockKey = `${source.id}:text`;
    const prev = fetchLocks.get(lockKey) || Promise.resolve();
    const next = prev.then(
      () => fetchAndRecordText(source, url, headers, requestParams, cacheKey, ttlSeconds, controller.signal),
    ).catch(
      () => fetchAndRecordText(source, url, headers, requestParams, cacheKey, ttlSeconds, controller.signal),
    );
    fetchLocks.set(lockKey, next);
    const result = await next;
    if (fetchLocks.get(lockKey) === next) fetchLocks.delete(lockKey);
    return result;
  } catch (error) {
    return Promise.reject({
      id: source.id,
      name: source.name,
      adapter: source.adapter,
      type: source.type,
      ok: false,
      fromCache: false,
      message: error instanceof Error ? error.message : "unknown error",
      updatedAt: new Date().toISOString(),
    } satisfies SourceDiagnostic);
  } finally {
    clearTimeout(timeout);
  }
}

export function sortEnabledSources(
  sources: DataSourceConfig[],
  type: DataSourceType,
): DataSourceConfig[] {
  return sources
    .filter((source) => source.enabled && source.type === type)
    .sort((a, b) => a.priority - b.priority);
}
