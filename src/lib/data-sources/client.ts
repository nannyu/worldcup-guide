import { createHash } from "node:crypto";
import type { DataSourceConfig, DataSourceType } from "@/lib/admin/config";
import { readRawFetchCache, upsertRawFetchCache } from "@/lib/db/queries/data-cache";

export interface SourceDiagnostic {
  id: string;
  name: string;
  adapter: string;
  type: DataSourceType;
  ok: boolean;
  fromCache: boolean;
  status?: number;
  message: string;
  updatedAt: string;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
  status: number;
}

const cache = new Map<string, CacheEntry>();

function joinUrl(baseUrl: string, endpointPath: string): string {
  if (!baseUrl) return endpointPath;
  if (!endpointPath) return baseUrl;
  return `${baseUrl.replace(/\/$/, "")}/${endpointPath.replace(/^\//, "")}`;
}

function applyAuth(url: URL, headers: Headers, source: DataSourceConfig) {
  if (!source.apiKey || source.apiKeyPlacement === "none") return;

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
        status: persisted.statusCode || 200,
        message: "database cache hit",
        updatedAt: persisted.fetchedAt?.toISOString() || new Date().toISOString(),
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), source.timeoutMs || 6000);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      next: { revalidate: Math.max(10, source.cacheTtlSeconds || source.refreshSeconds || 60) },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as T;
    cache.set(cacheKey, {
      value: data,
      status: response.status,
      expiresAt: now + Math.max(10, source.cacheTtlSeconds || 60) * 1000,
    });
    await upsertRawFetchCache({
      cacheKey,
      sourceId: source.id,
      sourceType: source.type,
      adapter: source.adapter,
      requestUrl: url.toString(),
      requestParams,
      payload: data,
      statusCode: response.status,
      ttlSeconds: source.cacheTtlSeconds || source.refreshSeconds || 60,
    });
    return {
      data,
      diagnostic: {
        id: source.id,
        name: source.name,
        adapter: source.adapter,
        type: source.type,
        ok: true,
        fromCache: false,
        status: response.status,
        message: "fetched",
        updatedAt: new Date().toISOString(),
      },
    };
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
