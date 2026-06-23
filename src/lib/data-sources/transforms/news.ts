import { createHash } from "node:crypto";
import type { AiProviderConfig, DataSourceConfig } from "@/lib/admin/config";
import type { AiNewsCuration } from "@/lib/ai/news-curation";
import {
  fetchJsonFromSource,
  fetchTextFromSource,
  type SourceDiagnostic,
} from "../client";
import type {
  GdeltDocResponse,
  NewsApiResponse,
  CurrentsApiResponse,
  EspnSiteNewsResponse,
  EspnCoreNewsResponse,
} from "../types";
import type { NewsArticle, NewsAggregationMeta } from "@/lib/wc-data";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseGdeltDate(input: string | undefined): string {
  if (!input) return new Date().toISOString();
  const compact = input.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    const [, yyyy, mm, dd, hh, min, ss] = compact;
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`).toISOString();
  }
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

// ---------------------------------------------------------------------------
// Article identity / deduplication
// ---------------------------------------------------------------------------

export function articleId(url: string, fallback: string): string {
  return createHash("sha256").update(url || fallback).digest("hex").slice(0, 18);
}

export function normalizedTitleHash(title: string): string {
  return createHash("sha256")
    .update(title.replace(/[^\w一-鿿]/g, "").toLowerCase())
    .digest("hex")
    .slice(0, 18);
}

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

export function normalizeSummary(value: string | null | undefined, fallback = ""): string {
  const text = String(value || fallback || "").replace(/\s+/g, " ").trim();
  if (!text) return "新闻源返回了标题和链接，暂无摘要。";
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export function normalizeArticleText(value: string | null | undefined, fallback = ""): string {
  const text = String(value || fallback || "")
    .replace(/\[\+\d+\s+chars?\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 6500 ? `${text.slice(0, 6500).trim()}...` : text;
}

export function splitArticleParagraphs(input: string): string[] {
  return input
    .split(/\n{2,}|(?<=[.!?。！？])\s+(?=[A-Z一-鿿])/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 24)
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Article body helpers
// ---------------------------------------------------------------------------

export function fallbackArticleBody(article: NewsArticle): string[] {
  const sourceParagraphs = splitArticleParagraphs(article.sourceText || "");
  if (sourceParagraphs.length >= 2) return sourceParagraphs;
  return [
    article.summary,
    ...(article.aiKeyPoints || article.keyPointsZh || article.keyPointsEn || []),
    article.sourceText || "",
  ]
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph, index, all) => paragraph && all.indexOf(paragraph) === index)
    .slice(0, 6);
}

export function ensureArticleBody(article: NewsArticle): NewsArticle {
  const fallback = fallbackArticleBody(article);
  return {
    ...article,
    body: article.body?.length ? article.body : fallback,
    bodyZh: article.bodyZh?.length ? article.bodyZh : undefined,
    bodyEn: article.bodyEn?.length ? article.bodyEn : undefined,
    bodyUpdatedAt: article.bodyUpdatedAt || new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

export function uniqueArticles(articles: NewsArticle[], limit: number): NewsArticle[] {
  const seenUrls = new Set<string>();
  const seenTitleHashes = new Set<string>();
  const result: NewsArticle[] = [];
  for (const article of articles) {
    if (article.url && seenUrls.has(article.url)) continue;
    if (article.url) seenUrls.add(article.url);

    if (article.title) {
      const titleHash = normalizedTitleHash(article.title);
      if (seenTitleHashes.has(titleHash)) continue;
      seenTitleHashes.add(titleHash);
    }

    result.push(article);
    if (result.length >= limit) break;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Relevance scoring
// ---------------------------------------------------------------------------

export function articleSearchText(article: NewsArticle): string {
  return `${article.title} ${article.summary} ${article.sourceText || ""} ${article.domain || ""}`.toLowerCase();
}

export function worldCupRelevanceScore(article: NewsArticle): number {
  const text = articleSearchText(article);
  let score = 0;

  const weightedPatterns: Array<[number, RegExp]> = [
    [10, /fifa world cup|world cup 2026|2026 world cup|世界杯|美加墨/i],
    [7, /\bworld cup\b|fifa/i],
    [4, /qualif(?:y|ier|ication)|draw|group stage|squad|roster|lineup|selection|call[- ]?up|阵容|名单|小组赛|预选赛|分组/i],
    [3, /referee|official|var|stadium|host cit|tournament|裁判|执法|主办|球场|赛事/i],
    [2, /mexico|canada|united states|usa|england|scotland|morocco|egypt|pulisic|declan rice|墨西哥|加拿大|美国|英格兰|苏格兰|摩洛哥|埃及/i],
  ];
  for (const [weight, pattern] of weightedPatterns) {
    if (pattern.test(text)) score += weight;
  }

  if (!/\bworld cup\b|fifa|世界杯|美加墨|2026/i.test(text)) {
    const domesticOnly = /premier league|championship|league one|league two|transfer|takeover|man utd|manchester united|everton|burnley|wolves|colchester|英超|转会|俱乐部/i.test(text);
    if (domesticOnly) score -= 6;
  }

  return Math.max(0, score);
}

export function isChinaNewsArticle(article: NewsArticle): boolean {
  const sourceText = `${article.source} ${article.domain || ""} ${article.url || ""}`.toLowerCase();
  return sourceText.includes("chinanews") || sourceText.includes("中新网");
}

export function isStrongWorldCupArticle(article: NewsArticle): boolean {
  const text = articleSearchText(article);
  return worldCupRelevanceScore(article) >= 7
    && /\bworld cup\b|fifa world cup|world cup 2026|2026 world cup|世界杯|美加墨/i.test(text);
}

// ---------------------------------------------------------------------------
// Ranking / merging
// ---------------------------------------------------------------------------

export function rankWorldCupNews(articles: NewsArticle[]): NewsArticle[] {
  const scored = articles.map((article, index) => ({
    article,
    index,
    score: Math.max(0, worldCupRelevanceScore(article) - (isChinaNewsArticle(article) ? 3 : 0)),
    published: new Date(article.publishedAt).getTime(),
  }));
  const hasRelevantNews = scored.some((item) => item.score > 0);

  return scored
    .sort((left, right) => {
      if (hasRelevantNews && left.score !== right.score) return right.score - left.score;
      const leftSourceCount = left.article.sourceCount || 1;
      const rightSourceCount = right.article.sourceCount || 1;
      if (leftSourceCount !== rightSourceCount) return rightSourceCount - leftSourceCount;
      return (Number.isFinite(right.published) ? right.published : 0)
        - (Number.isFinite(left.published) ? left.published : 0)
        || left.index - right.index;
    })
    .map((item) => item.article);
}

export function canonicalArticleUrl(input: string): string {
  try {
    const url = new URL(input);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_")
        || ["cmpid", "ocid", "cid", "ref", "source"].includes(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return input.trim().toLowerCase();
  }
}

export function titleTokens(input: string): Set<string> {
  const normalized = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, " ")
    .trim();
  const words = normalized.split(/\s+/).filter((word) => word.length >= 3);
  return new Set(words);
}

export function titleSimilarity(left: string, right: string): number {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}

export function publishedDistanceHours(left: string, right: string): number {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / 3_600_000;
}

export function mergeNewsArticles(articles: NewsArticle[], limit: number): NewsArticle[] {
  const sorted = rankWorldCupNews(articles);
  const groups: NewsArticle[][] = [];

  for (const article of sorted) {
    const canonicalUrl = canonicalArticleUrl(article.url);
    const group = groups.find((items) => {
      const primary = items[0];
      return canonicalArticleUrl(primary.url) === canonicalUrl
        || (
          publishedDistanceHours(primary.publishedAt, article.publishedAt) <= 48
          && titleSimilarity(primary.title, article.title) >= 0.72
        );
    });
    if (group) group.push(article);
    else groups.push([article]);
  }

  return groups.slice(0, limit).map((items) => {
    const primary = items[0];
    const relatedSources = [...new Set(items.map((item) => item.source).filter(Boolean))];
    const relatedUrls = [...new Set(items.map((item) => item.url).filter(Boolean))];
    return {
      ...primary,
      relatedSources,
      relatedUrls,
      sourceCount: relatedSources.length,
    };
  });
}

// ---------------------------------------------------------------------------
// AI curation
// ---------------------------------------------------------------------------

export function applyAiCuration(
  articles: NewsArticle[],
  curation: AiNewsCuration | undefined,
): NewsArticle[] {
  if (!curation) return articles;
  const articleIds = new Set(articles.map((article) => article.id));
  const curatedPrimaryIds = new Set(
    curation.items.map((item) => item.articleId).filter((id) => articleIds.has(id)),
  );
  const hiddenIds = new Set(
    curation.items.flatMap((item) =>
      curatedPrimaryIds.has(item.articleId)
        ? item.relatedArticleIds.filter(
            (id) => id !== item.articleId && articleIds.has(id) && !curatedPrimaryIds.has(id),
          )
        : [],
    ),
  );
  const curatedById = new Map(curation.items.map((item) => [item.articleId, item]));
  return articles
    .filter((article) => !hiddenIds.has(article.id))
    .map((article) => {
      const item = curatedById.get(article.id);
      if (!item) return article;
      return {
        ...article,
        aiSummary: item.summary || undefined,
        aiKeyPoints: item.keyPoints,
        aiScore: item.score,
        aiComment: item.comment || undefined,
        editorialScore: item.editorialScore,
        category: item.category,
        titleZh: item.titleZh,
        titleEn: item.titleEn,
        summaryZh: item.summaryZh,
        summaryEn: item.summaryEn,
        keyPointsZh: item.keyPointsZh,
        keyPointsEn: item.keyPointsEn,
        commentZh: item.commentZh,
        commentEn: item.commentEn,
      };
    });
}

// ---------------------------------------------------------------------------
// Time window filtering
// ---------------------------------------------------------------------------

export interface NewsFetchWindow {
  publishedAfter?: Date;
  publishedBefore?: Date;
}

export function compactIsoDate(date: Date): string {
  return date.toISOString().replace(/\D/g, "").slice(0, 14);
}

export function filterArticlesByWindow(articles: NewsArticle[], window: NewsFetchWindow): NewsArticle[] {
  const after = window.publishedAfter?.getTime();
  const before = window.publishedBefore?.getTime();
  if (!after && !before) return articles;
  return articles.filter((article) => {
    const published = new Date(article.publishedAt).getTime();
    if (!Number.isFinite(published)) return true;
    if (after && published < after) return false;
    if (before && published > before) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// News source fetching
// ---------------------------------------------------------------------------

export async function fetchNewsSource(
  source: DataSourceConfig,
  query: string,
  limit: number,
  window: NewsFetchWindow = {},
): Promise<{ articles: NewsArticle[]; diagnostic: SourceDiagnostic }> {
  if (source.adapter === "rss-feed") {
    const { data, diagnostic } = await fetchTextFromSource(source);
    const rssArticles = transformRssArticles(data, limit, rssQueryForSource(source, query));
    const sourceFilteredArticles = source.id.includes("chinanews")
      ? rssArticles.filter(isStrongWorldCupArticle)
      : rssArticles;
    const articles = filterArticlesByWindow(sourceFilteredArticles, window);
    if (!articles.length) {
      diagnostic.ok = false;
      diagnostic.message = source.id.includes("chinanews")
        ? "fetched but no strong World Cup ChinaNews RSS articles"
        : "fetched but no usable RSS articles";
    }
    return { articles, diagnostic };
  }

  if (source.adapter === "espn-site-api") {
    const { data, diagnostic } = await fetchJsonFromSource<EspnSiteNewsResponse>(source, {
      limit,
    });
    const articles = filterArticlesByWindow(transformEspnSiteArticles(data, limit), window);
    if (!articles.length) {
      diagnostic.ok = false;
      diagnostic.message = "fetched but no usable ESPN Site API articles";
    }
    return { articles, diagnostic };
  }

  if (source.adapter === "currents-api") {
    const { data, diagnostic } = await fetchJsonFromSource<CurrentsApiResponse>(source, {
      query,
      language: "en",
      category: "sport",
      page_number: 1,
      page_size: limit,
      start_date: window.publishedAfter?.toISOString(),
      end_date: window.publishedBefore?.toISOString(),
    });
    const articles = filterArticlesByWindow(transformCurrentsArticles(data, limit), window);
    if (!articles.length) {
      diagnostic.ok = false;
      diagnostic.message = "fetched but no usable Currents articles";
    }
    return { articles, diagnostic };
  }

  if (source.adapter === "gdelt-doc") {
    const { data, diagnostic } = await fetchJsonFromSource<GdeltDocResponse>(source, {
      query,
      mode: "ArtList",
      format: "json",
      sort: "HybridRel",
      maxrecords: limit,
      timespan: window.publishedAfter || window.publishedBefore ? undefined : "1week",
      startdatetime: window.publishedAfter ? compactIsoDate(window.publishedAfter) : undefined,
      enddatetime: window.publishedBefore ? compactIsoDate(window.publishedBefore) : undefined,
    });
    return { articles: filterArticlesByWindow(transformGdeltArticles(data, limit), window), diagnostic };
  }

  if (source.adapter === "newsapi-org") {
    const { data, diagnostic } = await fetchJsonFromSource<NewsApiResponse>(source, {
      q: query,
      language: "en",
      sortBy: "publishedAt",
      pageSize: limit,
      from: window.publishedAfter?.toISOString(),
      to: window.publishedBefore?.toISOString(),
    });
    return { articles: filterArticlesByWindow(transformNewsApiArticles(data, limit), window), diagnostic };
  }

  const { data, diagnostic } = await fetchJsonFromSource<unknown>(source, { q: query, limit });
  return { articles: filterArticlesByWindow(transformGenericNews(data, limit), window), diagnostic };
}

// ---------------------------------------------------------------------------
// Source-specific transformers
// ---------------------------------------------------------------------------

export function transformGdeltArticles(data: GdeltDocResponse, limit: number): NewsArticle[] {
  return uniqueArticles(
    (data.articles || [])
      .filter((article) => article.url && article.title)
      .map((article, index) => ({
        id: `gdelt-${articleId(article.url || "", `${article.title}-${index}`)}`,
        title: article.title || "Untitled",
        url: article.url || "",
        source: article.domain || "GDELT",
        publishedAt: parseGdeltDate(article.seendate),
        summary: normalizeSummary(article.title),
        sourceText: normalizeArticleText(article.title),
        bodySource: "summary" as const,
        imageUrl: article.socialimage || undefined,
        domain: article.domain || undefined,
        language: article.language || undefined,
        country: article.sourcecountry || undefined,
      })),
    limit,
  );
}

export function transformNewsApiArticles(data: NewsApiResponse, limit: number): NewsArticle[] {
  return uniqueArticles(
    (data.articles || [])
      .filter((article) => article.url && article.title)
      .map((article, index) => ({
        id: `newsapi-${articleId(article.url || "", `${article.title}-${index}`)}`,
        title: article.title || "Untitled",
        url: article.url || "",
        source: article.source?.name || "NewsAPI",
        publishedAt: article.publishedAt || new Date().toISOString(),
        summary: normalizeSummary(article.description, article.content || article.title),
        sourceText: normalizeArticleText(article.content || article.description, article.title),
        bodySource: article.content ? "source-api" as const : "summary" as const,
        imageUrl: article.urlToImage || undefined,
        domain: undefined,
        language: "en",
      })),
    limit,
  );
}

export function articleDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function transformCurrentsArticles(data: CurrentsApiResponse, limit: number): NewsArticle[] {
  return uniqueArticles(
    (data.news || [])
      .filter((article) => article.url && article.title)
      .map((article, index) => {
        const domain = articleDomain(article.url || "");
        const published = new Date(article.published || "");
        return {
          id: `currents-${article.id || articleId(article.url || "", `${article.title}-${index}`)}`,
          title: article.title || "Untitled",
          url: article.url || "",
          source: domain || article.author || "Currents API",
          publishedAt: Number.isNaN(published.getTime())
            ? new Date().toISOString()
            : published.toISOString(),
          summary: normalizeSummary(article.description, article.title),
          sourceText: normalizeArticleText(article.description, article.title),
          bodySource: article.description ? "source-api" as const : "summary" as const,
          imageUrl: article.image || undefined,
          domain,
          language: article.language || "en",
        };
      }),
    limit,
  );
}

export function espnArticleUrl(article: NonNullable<EspnSiteNewsResponse["articles"]>[number]): string {
  return article.links?.web?.href || article.links?.mobile?.href || "";
}

export function transformEspnSiteArticles(data: EspnSiteNewsResponse, limit: number): NewsArticle[] {
  return uniqueArticles(
    (data.articles || [])
      .filter((article) => espnArticleUrl(article) && article.headline)
      .map((article, index) => {
        const url = espnArticleUrl(article);
        const image = article.images?.find((item) => item.url && item.type === "header") || article.images?.find((item) => item.url);
        const published = new Date(article.published || article.lastModified || "");
        const categoryText = (article.categories || [])
          .map((category) => category.description)
          .filter(Boolean)
          .join(", ");
        return {
          id: `espn-${article.id || article.nowId || articleId(url, `${article.headline}-${index}`)}`,
          title: article.headline || "Untitled",
          url,
          source: "ESPN",
          publishedAt: Number.isNaN(published.getTime()) ? new Date().toISOString() : published.toISOString(),
          summary: normalizeSummary(article.description, categoryText || article.headline),
          sourceText: normalizeArticleText(article.description, categoryText || article.headline),
          bodySource: article.description ? "source-api" as const : "summary" as const,
          imageUrl: image?.url,
          domain: "espn.com",
          language: "en",
        };
      }),
    limit,
  );
}

// ---------------------------------------------------------------------------
// RSS helpers
// ---------------------------------------------------------------------------

export function isChineseNewsSource(source: DataSourceConfig): boolean {
  return (
    source.id.includes("chinanews")
    || source.id.includes("people")
    || source.id.includes("sohu")
    || source.baseUrl.includes("chinanews.com")
    || source.baseUrl.includes("people.com.cn")
    || source.baseUrl.includes("sohu.com")
  );
}

export function rssQueryForSource(source: DataSourceConfig, query: string): string {
  if (!isChineseNewsSource(source)) return query;
  return `${query} 世界杯 美加墨 足球 FIFA 2026`;
}

export function decodeXmlText(input: string | undefined): string {
  return String(input || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtmlText(input: string | undefined): string {
  return String(input || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export function htmlToText(input: string | undefined): string {
  return decodeHtmlText(
    String(input || "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|h1|h2|h3|li|blockquote)>/gi, "\n\n")
      .replace(/<[^>]+>/g, " "),
  );
}

// ---------------------------------------------------------------------------
// HTML article extraction
// ---------------------------------------------------------------------------

export function isUsefulArticleParagraph(text: string): boolean {
  if (text.length < 40) return false;
  if (text.length > 1400) return false;
  return !/(cookie|privacy policy|advertisement|subscribe|newsletter|sign in|sign up|share this|read more|all rights reserved|javascript|browser does not support|this video can not be played)/i.test(text);
}

export function extractArticleTextFromHtml(html: string): string {
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(?:nav|header|footer|aside)\b[\s\S]*?<\/(?:nav|header|footer|aside)>/gi, " ");
  const articleScopes = [...cleaned.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((match) => match[0]);
  const scope = articleScopes.length ? articleScopes.join("\n") : cleaned;
  const paragraphs = [...scope.matchAll(/<(?:p|h2|h3|blockquote)\b[^>]*>([\s\S]*?)<\/(?:p|h2|h3|blockquote)>/gi)]
    .map((match) => htmlToText(match[1]))
    .filter(isUsefulArticleParagraph);
  const unique = [...new Set(paragraphs)];
  return normalizeArticleText(unique.join("\n\n"));
}

// ---------------------------------------------------------------------------
// ESPN article full-text fetching
// ---------------------------------------------------------------------------

export function isEspnArticle(article: NewsArticle): boolean {
  return article.id.startsWith("espn-")
    || article.domain === "espn.com"
    || /(^|\.)espn\.com$/i.test(articleDomain(article.url) || "");
}

export function espnArticleContentId(article: NewsArticle): string | undefined {
  const idMatch = article.id.match(/^espn-(\d+)/);
  if (idMatch?.[1]) return idMatch[1];
  const urlMatch = article.url.match(/\/id\/(\d+)/);
  return urlMatch?.[1];
}

export function espnCoreArticleSource(contentId: string): DataSourceConfig {
  return {
    id: "espn-soccer-rss",
    name: "ESPN Core Article API",
    type: "news",
    adapter: "espn-site-api",
    baseUrl: "https://content.core.api.espn.com",
    endpointPath: `/v1/sports/news/${encodeURIComponent(contentId)}`,
    apiKey: "",
    apiKeyPlacement: "none",
    apiKeyParamName: "",
    apiKeyHeaderName: "",
    enabled: true,
    priority: 5,
    refreshSeconds: 900,
    cacheTtlSeconds: 900,
    timeoutMs: 8000,
    notes: "Official ESPN Core API article body endpoint.",
  };
}

export async function fetchEspnCoreArticleText(article: NewsArticle): Promise<string | undefined> {
  if (!isEspnArticle(article)) return undefined;
  const contentId = espnArticleContentId(article);
  if (!contentId) return undefined;

  try {
    const { data } = await fetchJsonFromSource<EspnCoreNewsResponse>(espnCoreArticleSource(contentId));
    const story = data.headlines
      ?.map((headline) => headline.story)
      .find((value): value is string => Boolean(value?.trim()));
    if (!story) return undefined;
    const text = extractArticleTextFromHtml(story);
    return text.length >= 180 ? text : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Original article text fetching
// ---------------------------------------------------------------------------

export async function fetchOriginalArticleText(article: NewsArticle): Promise<string | undefined> {
  if (!/^https?:\/\//i.test(article.url)) return undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(article.url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "WorldCupGuideBot/1.0 (+local news reader)",
      },
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("text")) return undefined;
    const text = extractArticleTextFromHtml(await response.text());
    return text.length >= 180 ? text : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchArticleFullText(article: NewsArticle): Promise<{
  text: string;
  bodySource: NonNullable<NewsArticle["bodySource"]>;
} | undefined> {
  const providerText = await fetchEspnCoreArticleText(article);
  if (providerText) return { text: providerText, bodySource: "provider-api" };

  const existingText = normalizeArticleText(article.sourceText, article.summary);
  if (existingText.length >= 1200 && splitArticleParagraphs(existingText).length >= 3) return undefined;

  const originalText = await fetchOriginalArticleText(article);
  return originalText ? { text: originalText, bodySource: "original-page" } : undefined;
}

// ---------------------------------------------------------------------------
// Concurrency helper + enrichment
// ---------------------------------------------------------------------------

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function enrichArticlesWithSourceText(articles: NewsArticle[]): Promise<NewsArticle[]> {
  const enriched = await mapWithConcurrency(
    articles,
    4,
    async (article) => {
      const fullText = await fetchArticleFullText(article);
      const sourceText = normalizeArticleText(fullText?.text, article.sourceText || article.summary);
      return {
        ...article,
        sourceText,
        body: fullText ? splitArticleParagraphs(sourceText) : article.body,
        bodySource: fullText?.bodySource || article.bodySource || (article.sourceText ? "source-api" as const : "summary" as const),
        bodyUpdatedAt: fullText ? new Date().toISOString() : article.bodyUpdatedAt,
      };
    },
  );
  return enriched;
}

// ---------------------------------------------------------------------------
// XML / RSS parsing
// ---------------------------------------------------------------------------

export function xmlTagValue(xml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return decodeXmlText(match?.[1]);
}

export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/["()]/g, " ")
    .split(/\s+|\s+or\s+/)
    .map((term) => term.trim())
    .filter((term) => (
      /[㐀-鿿]/.test(term)
        ? term.length >= 2
        : term.length >= 4 && !["world", "football", "fifa", "2026"].includes(term)
    ));
}

export function transformRssArticles(xml: string, limit: number, query: string): NewsArticle[] {
  const channelTitle = xmlTagValue(xml, "title") || "RSS Feed";
  const channelLanguage = xmlTagValue(xml, "language") || xmlTagValue(xml, "dc:language") || "en";
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const terms = queryTerms(query);
  const articles = itemMatches
    .map((item, index) => {
      const title = xmlTagValue(item, "title");
      const link = xmlTagValue(item, "link") || xmlTagValue(item, "guid");
      const description = xmlTagValue(item, "description");
      const encodedContent = xmlTagValue(item, "content:encoded");
      const sourceText = normalizeArticleText(
        htmlToText(encodedContent || description),
        title,
      );
      const pubDate = xmlTagValue(item, "pubDate");
      const source = xmlTagValue(item, "source") || channelTitle;
      const parsedDate = new Date(pubDate);
      return {
        id: `rss-${articleId(link, `${title}-${index}`)}`,
        title: title || "Untitled",
        url: link,
        source,
        publishedAt: Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString(),
        summary: normalizeSummary(description, title),
        sourceText,
        bodySource: encodedContent ? "source-api" as const : "summary" as const,
        domain: source,
        language: channelLanguage.toLowerCase(),
      };
    })
    .filter((article) => article.url && article.title);

  const relevant = articles.filter((article) => {
    if (worldCupRelevanceScore(article) > 0) return true;
    if (!terms.length) return false;
    const haystack = `${article.title} ${article.summary}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });

  return uniqueArticles(relevant, limit);
}

export function transformGenericNews(data: unknown, limit: number): NewsArticle[] {
  const items = Array.isArray(data)
    ? data
    : typeof data === "object" && data !== null && Array.isArray((data as { articles?: unknown }).articles)
      ? ((data as { articles: unknown[] }).articles)
      : [];

  return uniqueArticles(
    items
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item, index) => {
        const url = String(item.url || item.link || "");
        const title = String(item.title || item.headline || "Untitled");
        return {
          id: `generic-news-${articleId(url, `${title}-${index}`)}`,
          title,
          url,
          source: String(item.source || item.sourceName || item.domain || "Generic JSON"),
          publishedAt: String(item.publishedAt || item.date || item.seendate || new Date().toISOString()),
          summary: normalizeSummary(
            typeof item.summary === "string" ? item.summary : undefined,
            typeof item.description === "string" ? item.description : title,
          ),
          sourceText: normalizeArticleText(
            typeof item.content === "string" ? item.content : undefined,
            typeof item.summary === "string"
              ? item.summary
              : typeof item.description === "string"
                ? item.description
                : title,
          ),
          bodySource: typeof item.content === "string" ? "source-api" as const : "summary" as const,
          imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
          domain: typeof item.domain === "string" ? item.domain : undefined,
          language: typeof item.language === "string" ? item.language : undefined,
          country: typeof item.country === "string" ? item.country : undefined,
        };
      })
      .filter((article) => article.url && article.title),
    limit,
  );
}

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

export function shortenText(value: string | undefined, maxLength: number): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

export function articleFocusSentence(article: NewsArticle): string | undefined {
  const text = `${article.title} ${article.summary} ${article.sourceText || ""}`;
  if (/stadium|venue|host cit/i.test(text) && /england|scotland/i.test(text)) {
    return "英格兰和苏格兰的世界杯比赛场馆安排成为关注点";
  }
  if (/how to watch|socceroos|fixtures?|results?|观赛|直播|赛程|赛果/i.test(text)) {
    return "澳大利亚队观赛方式、赛程和赛果入口被集中整理";
  }
  if (/scotland/i.test(text) && /route|knockout|france|england tie|淘汰赛|晋级路径/i.test(text)) {
    return "苏格兰的淘汰赛路径、潜在对手和英格兰交锋可能性受到关注";
  }
  if (/scotland/i.test(text) && /squad|26 players|steve clarke|名单|阵容/i.test(text)) {
    return "苏格兰26人名单和克拉克的选人逻辑进入阵容讨论";
  }
  if (/world cup daily|opener|opening|mexico vs\.? sa|mexico.*south africa|揭幕|墨西哥.*南非/i.test(text)) {
    return "揭幕战墨西哥对南非以及超大规模赛事开局进入预热";
  }
  if (/weather|天气/i.test(text) && /opening|games?|比赛/i.test(text)) {
    return "揭幕阶段天气影响成为比赛准备变量";
  }
  if (/yellow card|red card|rules?|黄牌|红牌|新规|规则/i.test(text)) {
    return "黄牌清零、红牌判罚等2026世界杯新规被集中解读";
  }
  if (/中国元素|美加墨世界杯/i.test(text)) {
    return shortenText(article.titleZh || article.title, 40);
  }
  if (/巨星|新星|北美之夏/i.test(text)) {
    return "巨星与新星的北美之夏表现成为人物线索";
  }
  return /[㐀-鿿]/.test(article.title) ? shortenText(article.titleZh || article.title, 40) : undefined;
}

// ---------------------------------------------------------------------------
// Fallback summary + AI provider ordering
// ---------------------------------------------------------------------------

export function buildFallbackNewsSummary(news: NewsArticle[], aggregation: NewsAggregationMeta): string {
  if (!news.length) return "新闻源暂未返回可用条目。";

  const rankedNews = rankWorldCupNews(news);
  const relevantNews = rankedNews.filter((article) => worldCupRelevanceScore(article) > 0);
  const summaryNews = relevantNews.length ? relevantNews : rankedNews;

  const themeRules: Array<[string, RegExp]> = [
    ["裁判与赛事执法", /referee|official|var|disciplin|裁判|执法/i],
    ["球队阵容与选人", /squad|roster|lineup|selection|call[- ]?up|阵容|名单|首发/i],
    ["球员状态与伤病", /injur|fitness|return|recover|伤病|复出|状态/i],
    ["足协与赛事治理", /fifa|federation|ban|appeal|governance|足协|禁赛|治理/i],
    ["球队备战动态", /training|friendly|preparation|coach|manager|备战|训练|主帅/i],
    ["市场与商业信号", /market|sponsor|ticket|broadcast|rights|商业|门票|转播/i],
  ];
  const themeLabels = themeRules
    .map(([label, pattern]) => ({
      label,
      count: summaryNews.filter((article) => pattern.test(`${article.title} ${article.summary} ${article.sourceText || ""}`)).length,
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 3)
    .map((item) => item.label);
  const themes = themeLabels.length ? themeLabels.join("、") : "赛前动态、球队新闻与赛事运营";
  const topicRules: Array<[string, RegExp]> = [
    ["比赛场馆与城市指南", /stadium|venue|host cit|场馆|球场|城市/i],
    ["观赛方式、赛程与结果入口", /how to watch|fixture|schedule|results?|直播|赛程|赛果/i],
    ["小组出线和淘汰赛路径", /route|knockout|draw|group|path|小组|淘汰赛|晋级/i],
    ["参赛名单与阵容选择", /squad|roster|players picked|lineup|selection|call[- ]?up|名单|阵容|首发/i],
    ["揭幕战和赛事开局", /daily|opener|opening|mexico|south africa|揭幕|开幕|墨西哥|南非/i],
    ["裁判安排和赛事执法", /referee|official|var|裁判|执法/i],
    ["核心球员状态与球队备战", /pulisic|declan rice|injur|fitness|training|coach|manager|备战|训练|伤病|状态/i],
    ["FIFA 规则、治理与争议", /fifa|ban|appeal|governance|disciplin|禁赛|治理|争议/i],
  ];
  const highlights = summaryNews
    .map((article) => {
      const text = `${article.title} ${article.summary} ${article.sourceText || ""}`;
      return topicRules.find(([, pattern]) => pattern.test(text))?.[0];
    })
    .filter((topic): topic is string => Boolean(topic))
    .filter((topic, index, all) => all.indexOf(topic) === index)
    .slice(0, 4)
    .filter(Boolean)
    .join("、");
  const focusText = summaryNews
    .slice(0, 8)
    .map(articleFocusSentence)
    .filter((item): item is string => Boolean(item))
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 5)
    .join("；");
  const total = aggregation.deduplicatedArticleCount || news.length;
  const scopeText = relevantNews.length
    ? ""
    : `目前可用条目相关性有限，已从 ${total} 条新闻中优先挑选最接近世界杯主题的内容。`;
  const highlightText = focusText
    ? `具体焦点是：${focusText}。`
    : highlights
      ? `重点包括${highlights}，相关报道已在下方新闻列表展开。`
      : `重点报道已在下方新闻列表展开。`;

  return `今日世界杯新闻主线集中在${themes}。${highlightText}${scopeText}`;
}

export function orderAiProviders(providers: AiProviderConfig[], primaryProviderId?: string): AiProviderConfig[] {
  return providers
    .slice()
    .sort((left, right) => {
      if (left.id === primaryProviderId) return -1;
      if (right.id === primaryProviderId) return 1;
      return 0;
    });
}
