import { createHash } from "node:crypto";
import { readSnapshotCache, upsertSnapshotCache } from "@/lib/db/queries/data-cache";
import { translateArticleWithFreeApi, type FreeArticleTranslation } from "@/lib/translation/free-translate";
import type { MorningBrief, NewsArticle } from "@/lib/wc-data";

export type TranslationSource = "article" | "cache" | "remote" | "fallback" | "queued";

export type TranslationPayload = {
  translation?: FreeArticleTranslation;
  message: string;
};

export type BatchTranslationItem = {
  articleId: string;
  translation?: FreeArticleTranslation;
  source: TranslationSource;
  message: string;
};

export function articleTranslationKey(article: NewsArticle): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      id: article.id,
      title: article.title,
      body: article.body || [],
      sourceText: article.sourceText || "",
      summary: article.summary,
    }))
    .digest("hex")
    .slice(0, 18);
  return `news-translation:v4-free-multi:${article.id}:${digest}`;
}

export async function readArticleTranslation(article: NewsArticle): Promise<BatchTranslationItem> {
  if (article.titleZh && article.summaryZh && article.bodyZh?.length) {
    return {
      articleId: article.id,
      source: "article",
      translation: {
        titleZh: article.titleZh,
        summaryZh: article.summaryZh,
        keyPointsZh: article.keyPointsZh || [],
        bodyZh: article.bodyZh,
        providerName: "existing",
      },
      message: "文章已包含中文翻译。",
    };
  }

  const cached = await readSnapshotCache<TranslationPayload>(articleTranslationKey(article));
  if (cached?.payload.translation) {
    return {
      articleId: article.id,
      source: "cache",
      ...cached.payload,
    };
  }

  return {
    articleId: article.id,
    source: "queued",
    message: "翻译任务已进入后台队列。",
  };
}

export async function translateArticleAndCache(article: NewsArticle): Promise<BatchTranslationItem> {
  const existing = await readArticleTranslation(article);
  if (existing.translation) return existing;

  const translation = await translateArticleWithFreeApi(article).catch((error: unknown) => {
    console.warn("[news-translation] free translate failed:", error instanceof Error ? error.message : error);
    return undefined;
  });
  const payload: TranslationPayload = {
    translation,
    message: translation
      ? `${translation.providerName} 已完成文章翻译。`
      : "免费翻译接口调用失败，未消耗 AI token。",
  };

  if (translation) {
    await upsertSnapshotCache({
      snapshotKey: articleTranslationKey(article),
      feature: "news-translation",
      sourceMode: "remote",
      sourceId: translation.providerName,
      payload,
      diagnostics: [],
      ttlSeconds: 30 * 24 * 60 * 60,
    });
  }

  return {
    articleId: article.id,
    source: translation ? "remote" : "fallback",
    ...payload,
  };
}

export async function applyCachedArticleTranslation(article: NewsArticle): Promise<NewsArticle> {
  const result = await readArticleTranslation(article);
  if (!result.translation) return article;
  return {
    ...article,
    titleZh: result.translation.titleZh || article.titleZh,
    summaryZh: result.translation.summaryZh || article.summaryZh,
    keyPointsZh: result.translation.keyPointsZh?.length ? result.translation.keyPointsZh : article.keyPointsZh,
    bodyZh: result.translation.bodyZh?.length ? result.translation.bodyZh : article.bodyZh,
  };
}

export function morningBriefTranslationArticle(brief: MorningBrief): NewsArticle {
  const id = `morning-brief:${brief.issueDate}:${brief.updatedAt}`;
  return {
    id,
    title: brief.title || "World Cup Morning Brief",
    summary: brief.summary || "",
    body: brief.quote ? [brief.quote] : [],
    url: "local://morning-brief",
    source: "morning-brief",
    publishedAt: brief.updatedAt || new Date().toISOString(),
  };
}

export async function applyCachedMorningBriefTranslations(brief: MorningBrief): Promise<MorningBrief> {
  const [briefTranslation, translatedNews] = await Promise.all([
    readArticleTranslation(morningBriefTranslationArticle(brief)),
    Promise.all(brief.news.map((article) => applyCachedArticleTranslation(article))),
  ]);

  const translation = briefTranslation.translation;
  return {
    ...brief,
    titleZh: translation?.titleZh || brief.titleZh,
    summaryZh: translation?.summaryZh || brief.summaryZh,
    quoteZh: translation?.bodyZh?.[0] || brief.quoteZh,
    news: translatedNews,
  };
}
