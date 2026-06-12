import { type NextRequest, NextResponse } from "next/server";
import { enqueueNewsRefresh } from "@/lib/background/tasks";
import { getAggregatedNews, MORNING_BRIEF_NEWS_LIMIT } from "@/lib/data-sources/aggregate";
import { applyCachedArticleTranslation } from "@/lib/translation/article-translation";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || undefined;
  const limit = Number(request.nextUrl.searchParams.get("limit") || MORNING_BRIEF_NEWS_LIMIT);
  const publishedAfter = request.nextUrl.searchParams.get("from") || undefined;
  const publishedBefore = request.nextUrl.searchParams.get("to") || undefined;
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";
  const cacheMode = "cache-only";
  const result = await getAggregatedNews({ query, limit, publishedAfter, publishedBefore, cacheMode });
  const isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const hasArticles = () => (result.articles || []).length > 0;
  const articles = await Promise.all((result.articles || []).map((article) => applyCachedArticleTranslation(article)));
  const backgroundTask = refreshRequested || result.source === "fallback" || isStale || !hasArticles()
    ? await enqueueNewsRefresh({ query, limit, publishedAfter, publishedBefore })
    : undefined;
  return NextResponse.json(
    { ok: true, query, cacheMode, stale: isStale, backgroundTask, ...result, articles },
    {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
