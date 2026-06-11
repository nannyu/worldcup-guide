import {
  getAggregatedMatches,
  getAggregatedMorningBrief,
  getAggregatedNews,
  getAggregatedOdds,
  getAggregatedRadar,
  getAggregatedTeams,
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
import { morningBriefTranslationArticle, translateArticleAndCache } from "@/lib/translation/article-translation";
import type { NewsArticle, ScheduleDateKey } from "@/lib/wc-data";

function stableJobId(type: BackgroundJobType, parts: Array<string | number | undefined>) {
  return [type, ...parts.map((part) => String(part || ""))].join(":");
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

export function enqueueTeamsRefresh() {
  return enqueueBackgroundJob({ id: "data:teams", type: "teams.refresh", priority: 50 });
}

export function enqueueOddsRefresh() {
  return enqueueBackgroundJob({ id: "data:odds", type: "odds.refresh", priority: 50 });
}

export function enqueueRadarRefresh() {
  return enqueueBackgroundJob({ id: "data:radar", type: "radar.refresh", priority: 50 });
}

export function enqueueMatchesRefresh(dateKey: ScheduleDateKey) {
  return enqueueBackgroundJob({
    id: stableJobId("matches.refresh", [dateKey]),
    type: "matches.refresh",
    payload: { dateKey },
    priority: 40,
  });
}

export function enqueueMorningRefresh(dateKey: ScheduleDateKey) {
  return enqueueBackgroundJob({
    id: stableJobId("morning.refresh", [dateKey]),
    type: "morning.refresh",
    payload: { dateKey },
    priority: 30,
  });
}

export function enqueueNewsRefresh(options: {
  query?: string;
  limit?: number;
  publishedAfter?: string;
  publishedBefore?: string;
}) {
  return enqueueBackgroundJob({
    id: stableJobId("news.refresh", [options.query, options.limit || MORNING_BRIEF_NEWS_LIMIT, options.publishedAfter, options.publishedBefore]),
    type: "news.refresh",
    payload: {
      query: options.query,
      limit: options.limit || MORNING_BRIEF_NEWS_LIMIT,
      publishedAfter: options.publishedAfter,
      publishedBefore: options.publishedBefore,
    },
    priority: 30,
  });
}

export function enqueueArticleTranslation(article: NewsArticle) {
  return enqueueBackgroundJob({
    id: stableJobId("news.translate", [article.id]),
    type: "news.translate",
    payload: { article: article as unknown as Record<string, unknown> },
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

export async function getBackgroundTaskStates() {
  return listBackgroundJobs(30);
}

export async function runBackgroundJobPayload(type: BackgroundJobType, payload: unknown) {
  if (type === "teams.refresh") return getAggregatedTeams({ cacheMode: "refresh" });
  if (type === "odds.refresh") return getAggregatedOdds({ cacheMode: "refresh" });
  if (type === "radar.refresh") return getAggregatedRadar({ cacheMode: "refresh" });

  if (type === "matches.refresh") {
    return getAggregatedMatches(payloadScheduleDateKey(payload), { cacheMode: "refresh" });
  }

  if (type === "morning.refresh") {
    const result = await getAggregatedMorningBrief(payloadScheduleDateKey(payload), { cacheMode: "refresh" });
    await translateArticleAndCache(morningBriefTranslationArticle(result.brief));
    await translateNewsArticles(result.brief.news);
    return result;
  }

  if (type === "news.refresh") {
    const limit = payloadNumber(payload, "limit") || MORNING_BRIEF_NEWS_LIMIT;
    const result = await getAggregatedNews({
      query: payloadString(payload, "query"),
      limit,
      publishedAfter: payloadString(payload, "publishedAfter"),
      publishedBefore: payloadString(payload, "publishedBefore"),
      cacheMode: "refresh",
    });
    await translateNewsArticles(result.articles, limit);
    return result;
  }

  if (type === "news.translate") {
    return translateArticleAndCache(payloadArticle(payload));
  }

  if (type === "refresh.full") {
    const mode = payloadString(payload, "mode") === "initialize" ? "initialize" : "scheduled";
    return runDataRefresh(mode);
  }

  throw new Error(`Unsupported background job type: ${type}`);
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
