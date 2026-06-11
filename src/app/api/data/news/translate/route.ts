import { type NextRequest, NextResponse } from "next/server";
import { enqueueArticleTranslation } from "@/lib/background/tasks";
import { readArticleTranslation } from "@/lib/translation/article-translation";
import type { NewsArticle } from "@/lib/wc-data";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { article?: NewsArticle; articles?: NewsArticle[] } | null;
  const articles = body?.articles?.length ? body.articles : body?.article ? [body.article] : [];
  const validArticles = articles.filter((article) => article?.id && article?.title).slice(0, 12);
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
