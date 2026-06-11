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
  let cacheMode: "cache-only" | "refresh" = "cache-only";
  let result = await getAggregatedNews({ query, limit, publishedAfter, publishedBefore, cacheMode });
  let isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
  const hasArticles = () => (result.articles || []).length > 0;
  if (refreshRequested || result.source === "fallback" || isStale || !hasArticles()) {
    try {
      const refreshed = await getAggregatedNews({ query, limit, publishedAfter, publishedBefore, cacheMode: "refresh" });
      if ((refreshed.articles || []).length > 0) {
        result = refreshed;
        cacheMode = "refresh";
        isStale = result.diagnostics.some((item) => item.message?.includes("stale"));
      }
    } catch (error) {
      result.diagnostics.push({
        id: "news-sync-refresh",
        name: "新闻同步刷新",
        adapter: "api-route",
        type: "news",
        ok: false,
        fromCache: false,
        message: error instanceof Error ? error.message : "同步刷新新闻失败",
        updatedAt: new Date().toISOString(),
      });
    }
  }
  const articles = await Promise.all((result.articles || []).map((article) => applyCachedArticleTranslation(article)));
  const backgroundTask = result.source === "fallback" || isStale || !hasArticles()
    ? await enqueueNewsRefresh({ query, limit, publishedAfter, publishedBefore })
    : undefined;
  return NextResponse.json(
    { ok: true, query, cacheMode, backgroundTask, ...result, articles },
    {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
