import { desc, inArray } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "../client";
import { newsArticles } from "../schema/world-cup";
import type { NewsArticle } from "@/lib/wc-data";

function publishedAtDate(article: NewsArticle): Date {
  const parsed = new Date(article.publishedAt);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(0);
}

export async function upsertCanonicalNewsArticles(articles: NewsArticle[]): Promise<number> {
  const unique = Array.from(new Map(articles.map((article) => [article.id, article])).values())
    .filter((article) => article.id && article.url);
  if (!unique.length || !isDatabaseConfigured) return 0;

  let written = 0;
  for (const article of unique) {
    try {
      await getDb()
        .insert(newsArticles)
        .values({
          articleId: article.id.slice(0, 256),
          url: article.url,
          title: article.title,
          source: article.source.slice(0, 128),
          publishedAt: publishedAtDate(article),
          summary: article.summary || "",
          domain: article.domain?.slice(0, 256),
          language: article.language?.slice(0, 32),
          country: article.country?.slice(0, 32),
          imageUrl: article.imageUrl,
          payload: article,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: newsArticles.articleId,
          set: {
            url: article.url,
            title: article.title,
            source: article.source.slice(0, 128),
            publishedAt: publishedAtDate(article),
            summary: article.summary || "",
            domain: article.domain?.slice(0, 256),
            language: article.language?.slice(0, 32),
            country: article.country?.slice(0, 32),
            imageUrl: article.imageUrl,
            payload: article,
            updatedAt: new Date(),
          },
        });
      written += 1;
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[news-articles] upsert skipped:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  return written;
}

export async function getCanonicalNewsArticlesByIds(articleIds: string[]): Promise<NewsArticle[]> {
  const ids = Array.from(new Set(articleIds.filter(Boolean).map((id) => id.slice(0, 256))));
  if (!ids.length || !isDatabaseConfigured) return [];

  try {
    const rows = await getDb()
      .select()
      .from(newsArticles)
      .where(inArray(newsArticles.articleId, ids));
    const byId = new Map(rows.map((row) => [row.articleId, row.payload as NewsArticle]));
    return articleIds
      .map((id) => byId.get(id.slice(0, 256)))
      .filter((article): article is NewsArticle => Boolean(article));
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[news-articles] read skipped:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}

export async function getLatestCanonicalNewsArticles(limit = 60): Promise<NewsArticle[]> {
  const normalizedLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.round(limit), 1), 100)
    : 60;
  if (!isDatabaseConfigured) return [];

  try {
    const rows = await getDb()
      .select()
      .from(newsArticles)
      .orderBy(desc(newsArticles.publishedAt))
      .limit(normalizedLimit);
    return rows
      .map((row) => row.payload as NewsArticle)
      .filter((article) => Boolean(article?.id && article.url));
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[news-articles] latest read skipped:",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}
