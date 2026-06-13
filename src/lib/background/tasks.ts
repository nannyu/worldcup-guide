import { createHash } from "node:crypto";
import { getPlayerRoastSnapshot } from "@/lib/ai/player-roasts";
import { getTeamRoastSnapshot } from "@/lib/ai/team-roasts";
import {
  getAggregatedMatches,
  getAggregatedMorningBrief,
  getAggregatedNews,
  getAggregatedOdds,
  getAggregatedRadar,
  getAggregatedTeams,
  MAX_AGGREGATED_NEWS_LIMIT,
  MORNING_BRIEF_NEWS_LIMIT,
  NEWS_TRANSLATION_LIMIT,
} from "@/lib/data-sources/aggregate";
import { runDataRefresh } from "@/lib/data-sources/refresh-runner";
import {
  claimNextBackgroundJob,
  completeBackgroundJob,
  enqueueBackgroundJob,
  failBackgroundJob,
  listBackgroundJobs,
  type BackgroundJobType,
} from "@/lib/db/queries/background-jobs";
import { recordIngestionRun } from "@/lib/db/queries/ingestion-runs";
import { teamsWithBuiltInProfilesFromOfficialSchedule } from "@/lib/team-profiles";
import { morningBriefTranslationArticle, translateArticleAndCache } from "@/lib/translation/article-translation";
import {
  normalizeScheduleDate,
  normalizeScheduleUtcDayBounds,
  type NewsArticle,
  type ScheduleDateKey,
  type ScheduleUtcDayBounds,
} from "@/lib/wc-data";

const MAX_BACKGROUND_JOB_ID_LENGTH = 240;
const MAX_NEWS_QUERY_LENGTH = 180;
const MAX_BACKGROUND_ARTICLE_TEXT_LENGTH = 4000;
const MAX_BACKGROUND_ARTICLE_PARAGRAPHS = 8;

function stableJobId(type: BackgroundJobType, parts: Array<string | number | undefined>) {
  const raw = [type, ...parts.map((part) => String(part || ""))].join(":");
  if (raw.length <= MAX_BACKGROUND_JOB_ID_LENGTH) return raw;
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return `${type}:${digest}`;
}

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeNewsQuery(query: string | undefined): string | undefined {
  return truncateText(query, MAX_NEWS_QUERY_LENGTH);
}

function normalizeLimit(limit: number | undefined): number {
  const value = Number(limit);
  return Number.isFinite(value)
    ? Math.min(Math.max(Math.round(value), 1), MAX_AGGREGATED_NEWS_LIMIT)
    : MORNING_BRIEF_NEWS_LIMIT;
}

function normalizeDateString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function trimTextList(values: string[] | undefined, maxLength: number): string[] | undefined {
  const trimmed = values
    ?.map((value) => truncateText(value, maxLength))
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_BACKGROUND_ARTICLE_PARAGRAPHS);
  return trimmed?.length ? trimmed : undefined;
}

function trimArticleForBackground(article: NewsArticle): NewsArticle {
  return {
    ...article,
    id: truncateText(article.id, 256) || article.id,
    title: truncateText(article.title, 500) || article.title,
    url: truncateText(article.url, 1000) || article.url,
    source: truncateText(article.source, 128) || article.source,
    summary: truncateText(article.summary, 1200) || "",
    sourceText: truncateText(article.sourceText, MAX_BACKGROUND_ARTICLE_TEXT_LENGTH),
    aiSummary: truncateText(article.aiSummary, 1200),
    imageUrl: truncateText(article.imageUrl, 1000),
    domain: truncateText(article.domain, 256),
    body: trimTextList(article.body, 1400),
    bodyEn: trimTextList(article.bodyEn, 1400),
    bodyZh: trimTextList(article.bodyZh, 1400),
    keyPointsEn: trimTextList(article.keyPointsEn, 300),
    keyPointsZh: trimTextList(article.keyPointsZh, 300),
    aiKeyPoints: trimTextList(article.aiKeyPoints, 300),
  };
}

function normalizeNewsRefreshOptions(options: {
  query?: string;
  limit?: number;
  publishedAfter?: string;
  publishedBefore?: string;
}) {
  return {
    query: normalizeNewsQuery(options.query),
    limit: normalizeLimit(options.limit),
    publishedAfter: normalizeDateString(options.publishedAfter),
    publishedBefore: normalizeDateString(options.publishedBefore),
  };
}

function payloadValue(payload: unknown, key: string): unknown {
  return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>)[key] : undefined;
}

function payloadString(payload: unknown, key: string): string | undefined {
  const value = payloadValue(payload, key);
  return typeof value === "string" && value ? value : undefined;
}

function payloadNumber(payload: unknown, key: string): number | undefined {
  const value = payloadValue(payload, key);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function payloadScheduleDateKey(payload: unknown): ScheduleDateKey {
  const value = payloadString(payload, "dateKey");
  if (value === "yesterday" || value === "tomorrow") return value;
  return "today";
}

function payloadScheduleDate(payload: unknown): string | undefined {
  return normalizeScheduleDate(payloadString(payload, "date"));
}

function payloadScheduleUtcDayBounds(payload: unknown): ScheduleUtcDayBounds | undefined {
  return normalizeScheduleUtcDayBounds({
    date: payloadString(payload, "date"),
    startUtc: payloadString(payload, "startUtc"),
    endUtc: payloadString(payload, "endUtc"),
  });
}

function payloadScheduleOptions(payload: unknown): { sourceDate?: string; dateRange?: ScheduleUtcDayBounds } {
  const dateRange = payloadScheduleUtcDayBounds(payload);
  return {
    sourceDate: dateRange?.date || payloadScheduleDate(payload),
    dateRange,
  };
}

function payloadArticle(payload: unknown): NewsArticle {
  const article = payloadValue(payload, "article");
  if (typeof article !== "object" || article === null) throw new Error("background job article payload is invalid");
  return article as NewsArticle;
}

async function translateNewsArticles(articles: NewsArticle[], limit = NEWS_TRANSLATION_LIMIT) {
  for (const article of articles.slice(0, limit)) {
    await translateArticleAndCache(article);
  }
}

function featureForJobType(type: BackgroundJobType): string {
  if (type === "team-roasts.refresh") return "team-roasts";
  if (type === "player-roasts.refresh") return "player-roasts";
  if (type === "refresh.full") return "refresh";
  return type.split(".")[0] || type;
}

function resultCount(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const record = result as Record<string, unknown>;
  for (const key of ["teams", "oddsMatches", "radarMatches", "matches", "articles", "items"]) {
    const value = record[key];
    if (Array.isArray(value)) return value.length;
  }
  if (record.brief && typeof record.brief === "object") {
    const brief = record.brief as { matches?: unknown[]; news?: unknown[] };
    return (brief.matches?.length || 0) + (brief.news?.length || 0);
  }
  if (record.snapshot && typeof record.snapshot === "object") {
    const snapshot = record.snapshot as { items?: unknown[] };
    return snapshot.items?.length || 0;
  }
  if (Array.isArray(record.tasks)) return record.tasks.length;
  return 0;
}

function resultMetadata(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  return {
    source: record.source,
    mode: record.mode,
    message: record.message,
    diagnosticsCount: Array.isArray(record.diagnostics) ? record.diagnostics.length : undefined,
    taskCount: Array.isArray(record.tasks) ? record.tasks.length : undefined,
  };
}

async function auditBackgroundJob<T>(
  type: BackgroundJobType,
  payload: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();
  try {
    const result = await run();
    const count = resultCount(result);
    await recordIngestionRun({
      sourceId: type,
      feature: featureForJobType(type),
      status: "succeeded",
      startedAt,
      finishedAt: new Date(),
      recordsRead: count,
      recordsWritten: count,
      metadata: {
        payload,
        result: resultMetadata(result),
      },
    });
    return result;
  } catch (error) {
    await recordIngestionRun({
      sourceId: type,
      feature: featureForJobType(type),
      status: "failed",
      startedAt,
      finishedAt: new Date(),
      errorMessage: error instanceof Error ? error.message : "unknown error",
      metadata: { payload },
    });
    throw error;
  }
}

export function enqueueTeamsRefresh() {
  return enqueueBackgroundJob({ id: "data:teams", type: "teams.refresh", priority: 50 });
}

export function enqueueOddsRefresh() {
  return enqueueBackgroundJob({ id: "data:odds", type: "odds.refresh", priority: 50 });
}

export function enqueueRadarRefresh() {
  return enqueueBackgroundJob({ id: "data:radar", type: "radar.refresh", priority: 50 });
}

export function enqueueMatchesRefresh(
  dateKey: ScheduleDateKey,
  options: { sourceDate?: string; dateRange?: ScheduleUtcDayBounds } = {},
) {
  return enqueueBackgroundJob({
    id: stableJobId("matches.refresh", [
      dateKey,
      options.sourceDate,
      options.dateRange?.startUtc,
      options.dateRange?.endUtc,
    ]),
    type: "matches.refresh",
    payload: {
      dateKey,
      date: options.sourceDate,
      startUtc: options.dateRange?.startUtc,
      endUtc: options.dateRange?.endUtc,
    },
    priority: 40,
  });
}

export function enqueueMorningRefresh(
  dateKey: ScheduleDateKey,
  options: { sourceDate?: string; dateRange?: ScheduleUtcDayBounds } = {},
) {
  return enqueueBackgroundJob({
    id: stableJobId("morning.refresh", [
      dateKey,
      options.sourceDate,
      options.dateRange?.startUtc,
      options.dateRange?.endUtc,
    ]),
    type: "morning.refresh",
    payload: {
      dateKey,
      date: options.sourceDate,
      startUtc: options.dateRange?.startUtc,
      endUtc: options.dateRange?.endUtc,
    },
    priority: 30,
  });
}

export function enqueueNewsRefresh(options: {
  query?: string;
  limit?: number;
  publishedAfter?: string;
  publishedBefore?: string;
}) {
  const normalized = normalizeNewsRefreshOptions(options);
  return enqueueBackgroundJob({
    id: stableJobId("news.refresh", [
      normalized.query,
      normalized.limit,
      normalized.publishedAfter,
      normalized.publishedBefore,
    ]),
    type: "news.refresh",
    payload: normalized,
    priority: 30,
  });
}

export function enqueueArticleTranslation(article: NewsArticle) {
  const backgroundArticle = trimArticleForBackground(article);
  return enqueueBackgroundJob({
    id: stableJobId("news.translate", [backgroundArticle.id]),
    type: "news.translate",
    payload: { article: backgroundArticle as unknown as Record<string, unknown> },
    priority: 20,
  });
}

export function enqueueFullDataRefresh(mode: "scheduled" | "initialize" = "scheduled") {
  return enqueueBackgroundJob({
    id: stableJobId("refresh.full", [mode]),
    type: "refresh.full",
    payload: { mode },
    priority: mode === "initialize" ? 10 : 20,
    maxAttempts: 2,
  });
}

export function enqueueTeamRoastsRefresh() {
  return enqueueBackgroundJob({ id: "data:team-roasts", type: "team-roasts.refresh", priority: 60 });
}

export function enqueuePlayerRoastsRefresh() {
  return enqueueBackgroundJob({ id: "data:player-roasts", type: "player-roasts.refresh", priority: 60 });
}

export async function getBackgroundTaskStates() {
  return listBackgroundJobs(30);
}

async function executeBackgroundJobPayload(type: BackgroundJobType, payload: unknown) {
  if (type === "teams.refresh") return getAggregatedTeams({ cacheMode: "refresh" });
  if (type === "odds.refresh") return getAggregatedOdds({ cacheMode: "refresh" });
  if (type === "radar.refresh") return getAggregatedRadar({ cacheMode: "refresh" });

  if (type === "matches.refresh") {
    return getAggregatedMatches(payloadScheduleDateKey(payload), {
      cacheMode: "refresh",
      ...payloadScheduleOptions(payload),
    });
  }

  if (type === "morning.refresh") {
    const result = await getAggregatedMorningBrief(payloadScheduleDateKey(payload), {
      cacheMode: "refresh",
      ...payloadScheduleOptions(payload),
    });
    await translateArticleAndCache(morningBriefTranslationArticle(result.brief));
    await translateNewsArticles(result.brief.news);
    return result;
  }

  if (type === "news.refresh") {
    const limit = normalizeLimit(payloadNumber(payload, "limit"));
    const result = await getAggregatedNews({
      query: normalizeNewsQuery(payloadString(payload, "query")),
      limit,
      publishedAfter: normalizeDateString(payloadString(payload, "publishedAfter")),
      publishedBefore: normalizeDateString(payloadString(payload, "publishedBefore")),
      cacheMode: "refresh",
    });
    await translateNewsArticles(result.articles, limit);
    return result;
  }

  if (type === "news.translate") {
    return translateArticleAndCache(payloadArticle(payload));
  }

  if (type === "team-roasts.refresh") {
    return getTeamRoastSnapshot(teamsWithBuiltInProfilesFromOfficialSchedule(), { cacheMode: "refresh" });
  }

  if (type === "player-roasts.refresh") {
    return getPlayerRoastSnapshot(teamsWithBuiltInProfilesFromOfficialSchedule(), { cacheMode: "refresh" });
  }

  if (type === "refresh.full") {
    const mode = payloadString(payload, "mode") === "initialize" ? "initialize" : "scheduled";
    return runDataRefresh(mode);
  }

  throw new Error(`Unsupported background job type: ${type}`);
}

export async function runBackgroundJobPayload(type: BackgroundJobType, payload: unknown) {
  return auditBackgroundJob(type, payload, () => executeBackgroundJobPayload(type, payload));
}

export async function processNextBackgroundJob(workerId: string): Promise<boolean> {
  const job = await claimNextBackgroundJob(workerId);
  if (!job) return false;
  try {
    await runBackgroundJobPayload(job.type as BackgroundJobType, job.payload);
    await completeBackgroundJob(job.id);
  } catch (error) {
    await failBackgroundJob(job, error);
  }
  return true;
}
