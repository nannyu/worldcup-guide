import { type NextRequest, NextResponse } from "next/server";
import { enqueueArticleTranslation } from "@/lib/background/tasks";
import { readArticleTranslation } from "@/lib/translation/article-translation";
import type { NewsArticle } from "@/lib/wc-data";

const MAX_TRANSLATION_ARTICLES = 12;
const MAX_TRANSLATION_TEXT_LENGTH = 4000;
const MAX_TRANSLATION_PARAGRAPHS = 8;

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function trimTextList(values: string[] | undefined, maxLength: number): string[] | undefined {
  const trimmed = values
    ?.map((value) => truncateText(value, maxLength))
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_TRANSLATION_PARAGRAPHS);
  return trimmed?.length ? trimmed : undefined;
}

function sanitizeArticle(article: NewsArticle): NewsArticle {
  return {
    ...article,
    id: truncateText(article.id, 256) || article.id,
    title: truncateText(article.title, 500) || article.title,
    url: truncateText(article.url, 1000) || article.url,
    source: truncateText(article.source, 128) || article.source,
    summary: truncateText(article.summary, 1200) || "",
    sourceText: truncateText(article.sourceText, MAX_TRANSLATION_TEXT_LENGTH),
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

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { article?: NewsArticle; articles?: NewsArticle[] } | null;
  const articles = body?.articles?.length ? body.articles : body?.article ? [body.article] : [];
  const validArticles = articles
    .filter((article) => article?.id && article?.title)
    .slice(0, MAX_TRANSLATION_ARTICLES)
    .map(sanitizeArticle);
  if (!validArticles.length) {
    return NextResponse.json({ ok: false, error: "invalid_article" }, { status: 400 });
  }

  const results = await Promise.all(
    validArticles.map(async (article) => {
      const result = await readArticleTranslation(article);
      if (!result.translation) await enqueueArticleTranslation(article);
      return result;
    }),
  );

  if (body?.articles?.length) {
    return NextResponse.json({
      ok: results.some((item) => Boolean(item.translation)),
      queued: results.some((item) => item.source === "queued"),
      translations: results,
    });
  }

  const first = results[0];
  return NextResponse.json({
    ok: Boolean(first.translation),
    queued: first.source === "queued",
    source: first.source,
    translation: first.translation,
    message: first.message,
  });
}
