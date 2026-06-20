import { type NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/api/rate-limit";
import { getCanonicalNewsArticlesByIds } from "@/lib/db/queries/news-articles";
import { applyCachedArticleTranslation } from "@/lib/translation/article-translation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing article id" }, { status: 400 });
  }

  const articles = await getCanonicalNewsArticlesByIds([decodeURIComponent(id)]);
  if (!articles.length) {
    return NextResponse.json({ ok: false, error: "Article not found" }, { status: 404 });
  }

  const article = await applyCachedArticleTranslation(articles[0]);
  return NextResponse.json(
    { ok: true, article },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=3600" } },
  );
}
