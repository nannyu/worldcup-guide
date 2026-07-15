import { createHash } from "node:crypto";
import { enqueueBackgroundJob, type BackgroundJobType } from "@/lib/db/queries/background-jobs";
import type { NewsArticle } from "@/lib/wc-data";

const MAX_BACKGROUND_JOB_ID_LENGTH = 240;
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

export function enqueueArticleTranslation(article: NewsArticle) {
  const backgroundArticle = trimArticleForBackground(article);
  return enqueueBackgroundJob({
    id: stableJobId("news.translate", [backgroundArticle.id]),
    type: "news.translate",
    payload: { article: backgroundArticle as unknown as Record<string, unknown> },
    priority: 70,
  });
}

export async function enqueueArticleTranslations(articles: NewsArticle[], limit: number) {
  const jobs = [];
  for (const article of articles.slice(0, limit)) {
    jobs.push(await enqueueArticleTranslation(article));
  }
  return jobs;
}
