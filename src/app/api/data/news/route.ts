import { type NextRequest, NextResponse } from "next/server";
import { enqueueNewsRefresh } from "@/lib/background/tasks";
import { getAggregatedNews, MAX_AGGREGATED_NEWS_LIMIT, MORNING_BRIEF_NEWS_LIMIT } from "@/lib/data-sources/aggregate";
import { applyCachedArticleTranslation } from "@/lib/translation/article-translation";

const MAX_PUBLIC_NEWS_QUERY_LENGTH = 180;

function normalizeQuery(value: string | null): string | undefined {
  const query = value?.replace(/\s+/g, " ").trim();
  if (!query) return undefined;
  return query.length > MAX_PUBLIC_NEWS_QUERY_LENGTH ? query.slice(0, MAX_PUBLIC_NEWS_QUERY_LENGTH) : query;
}

function normalizeLimit(value: string | null): number {
  const parsed = Number(value || MORNING_BRIEF_NEWS_LIMIT);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.round(parsed), 1), MAX_AGGREGATED_NEWS_LIMIT)
    : MORNING_BRIEF_NEWS_LIMIT;
}

function normalizeDate(value: string | null): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

export async function GET(request: NextRequest) {
  const query = normalizeQuery(request.nextUrl.searchParams.get("q"));
  const limit = normalizeLimit(request.nextUrl.searchParams.get("limit"));
  const publishedAfter = normalizeDate(request.nextUrl.searchParams.get("from"));
  const publishedBefore = normalizeDate(request.nextUrl.searchParams.get("to"));
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
