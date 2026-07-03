import { createHash } from "node:crypto";
import { readAdminConfig, type AiProviderConfig, type DataSourceConfig } from "@/lib/admin/config";
import { addAiMatchBriefsToMorningMatches } from "@/lib/ai/match-briefs";
import { generateMorningQuote } from "@/lib/ai/morning-quote";
import { curateNewsWithAi, type AiNewsCuration } from "@/lib/ai/news-curation";
import {
  fetchJsonFromSource,
  sortEnabledSources,
  type SourceDiagnostic,
} from "@/lib/data-sources/client";
import { getEffectiveRefreshSeconds, getSourceRefreshPlan } from "@/lib/data-sources/rate-policy";
import {
  getLatestSourceUsageByIds,
  readLatestSnapshotCache,
  readRecentSnapshotCaches,
  readSnapshotCache,
  upsertSnapshotCache,
} from "@/lib/db/queries/data-cache";
import { listRecentIngestionRuns } from "@/lib/db/queries/ingestion-runs";
import {
  readLatestOddsMarketSnapshots,
  readLatestRadarMarketSnapshots,
  readPreKickoffOddsMarketSnapshots,
  recordOddsMarketSnapshots,
  recordRadarMarketSnapshots,
} from "@/lib/db/queries/market-snapshots";
import {
  getCanonicalNewsArticlesByIds,
  getLatestCanonicalNewsArticles,
  upsertCanonicalNewsArticles,
} from "@/lib/db/queries/news-articles";
import {
  getStoredCanonicalMatches,
  persistCanonicalMatches,
} from "@/lib/db/queries/world-cup";
import { teamsWithBuiltInProfilesFromOfficialSchedule } from "@/lib/team-profiles";
import {
  allMatches,
  fifaMatchesInUtcDayBounds,
  matchTeamPairKey,
  normalizeMatchPlaceholderTeams,
  resolveKnownBracketPlaceholderTeams,
  scheduleDateMeta,
  type Match,
  type MatchPrediction,
  type MorningBrief,
  type MorningQuote,
  type NewsAggregationMeta,
  type NewsArticle,
  type OddsMatch,
  type RadarMatch,
  type ScheduleDateKey,
  type ScheduleUtcDayBounds,
  type Team,
} from "@/lib/wc-data";

// ---------------------------------------------------------------------------
// Types (wire-format shapes for API responses)
// ---------------------------------------------------------------------------

import type {
  ApiFootballFixture,
  ApiFootballLiveOddsResponse,
  ApiFootballOddsResponse,
  ApiFootballResponse,
  ApiFootballTeamResponse,
  CurrentsApiResponse,
  EspnSiteNewsResponse,
  FootballDataMatchesResponse,
  FootballDataTeamsResponse,
  GdeltDocResponse,
  MorningBriefStoredPayload,
  MorningQuoteSnapshotPayload,
  NewsApiResponse,
  NewsSnapshotPayload,
  OpenFootballWorldCup,
  OddsApiIoEvent,
  PolymarketEvent,
  TheOddsApiEvent,
  TheSportsDbEventsResponse,
  TheSportsDbTeamsResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Transforms (extracted modules)
// ---------------------------------------------------------------------------

import {
  sourceDateFor,
  utcDayBoundsForBeijingDate,
  dateRangeFor,
  matchInDateRange,
  uniqueMatches,
  matchKickoffDistance,
  officialMatchForRemoteMatch,
  canonicalizeMatchesWithOfficialSchedule,
  transformOpenFootballMatches,
  transformFootballDataMatches,
  transformApiFootballMatches,
  mergeApiFootballFixtureDetails,
  transformWorldCupApiMatches,
  transformTheSportsDbMatches,
  enabledSourceById,
  fetchApiFootballFixturesForIds,
  fetchApiFootballPredictionsForFixtureIds,
} from "./transforms/matches";

import {
  enrichOddsMatchesWithStoredMatches,
  nearestMatchForOddsMatch,
  mergeOddsIntoMatches,
  transformApiFootballPreMatchOdds,
  transformApiFootballLiveOdds,
  transformTheOddsApi,
  fetchOddsApiIoOdds,
  enrichMatchesWithLatestCanonicalOdds as enrichOddsLatestCanonicalOdds,
} from "./transforms/odds";

import {
  ensureArticleBody,
  fetchNewsSource,
  mergeNewsArticles,
  enrichArticlesWithSourceText,
  applyAiCuration,
  worldCupRelevanceScore,
  buildFallbackNewsSummary,
  articleFocusSentence,
  shortenText,
  orderAiProviders,
  type NewsFetchWindow,
} from "./transforms/news";

import {
  transformFootballDataTeams,
  transformApiFootballTeams,
  mergeTeamLists,
  enrichApiFootballTeamsWithAuxSources,
  transformTheSportsDbTeams,
} from "./transforms/teams";

import {
  transformPolymarketEvents,
  transformApiFootballPredictionsToRadar,
  isPolymarketRadarMatch,
  apiFootballFixtureIdFromMatchId,
} from "./transforms/radar";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const defaultNewsQuery = `"World Cup 2026" football OR "FIFA World Cup"`;
export const MAX_AGGREGATED_NEWS_LIMIT = 60;
export const MORNING_BRIEF_NEWS_LIMIT = 60;
export const NEWS_TRANSLATION_LIMIT = 30;

// ---------------------------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------------------------

function dateRangeSnapshotKey(bounds: ScheduleUtcDayBounds): string {
  return `${bounds.startUtc}:${bounds.endUtc}`;
}

function dateInBeijing(input: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(input));
}

function providerDatesForRange(bounds: ScheduleUtcDayBounds, fallbackDate: string): string[] {
  const startMs = Date.parse(bounds.startUtc);
  const endMs = Date.parse(bounds.endUtc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return [fallbackDate];
  return Array.from(new Set([
    dateInBeijing(startMs),
    dateInBeijing(Math.max(startMs, endMs - 1)),
    dateInBeijing(Math.floor((startMs + endMs) / 2)),
  ]));
}

// ---------------------------------------------------------------------------
// Match helpers (canonicalisation with official schedule)
// ---------------------------------------------------------------------------

const officialMatchesByTeamPair = allMatches.reduce<Map<string, Match[]>>((lookup, match) => {
  const key = matchTeamPairKey(match);
  lookup.set(key, [...(lookup.get(key) || []), match]);
  return lookup;
}, new Map());

async function storeAndReadCanonicalMatches(
  matches: Match[],
  sourceId: string,
  dateRange: ScheduleUtcDayBounds,
): Promise<Match[]> {
  const canonicalMatches = canonicalizeMatchesWithOfficialSchedule(matches);
  await persistCanonicalMatches(canonicalMatches, sourceId);
  const storedMatches = await getStoredCanonicalMatches(dateRange);
  return storedMatches.length
    ? storedMatches
    : canonicalMatches.filter((match) => matchInDateRange(match, dateRange));
}

// ---------------------------------------------------------------------------
// Morning brief constants & rolling news window
// ---------------------------------------------------------------------------

const MORNING_NEWS_WINDOW_HOURS = 24;
const MORNING_NEWS_WINDOW_BUCKET_MINUTES = 15;
const POLYMARKET_WORLD_CUP_TAG_ID = 102232;

function rollingRecentNewsWindow(now = new Date()): { start: Date; cacheKey: string } {
  const bucketMs = MORNING_NEWS_WINDOW_BUCKET_MINUTES * 60 * 1000;
  const bucketedNowMs = Math.floor(now.getTime() / bucketMs) * bucketMs;
  const start = new Date(bucketedNowMs - MORNING_NEWS_WINDOW_HOURS * 60 * 60 * 1000);
  return {
    start,
    cacheKey: `last${MORNING_NEWS_WINDOW_HOURS}h:${start.toISOString()}`,
  };
}

// ---------------------------------------------------------------------------
// AggregationReadOptions & cache helpers
// ---------------------------------------------------------------------------

export interface AggregationReadOptions {
  cacheMode?: "cache-first" | "cache-only" | "refresh";
  liveScoresOnly?: boolean;
  useAi?: boolean;
  sourceDate?: string;
  dateRange?: ScheduleUtcDayBounds;
}

function isCacheFirst(options: AggregationReadOptions | undefined): boolean {
  return options?.cacheMode === "cache-first" || options?.cacheMode === "cache-only";
}

function isCacheOnly(options: AggregationReadOptions | undefined): boolean {
  return options?.cacheMode === "cache-only";
}

function shouldUseSnapshot<T>(
  snapshot: { payload: T } | undefined,
  hasData: (payload: T) => boolean,
  options?: AggregationReadOptions,
): snapshot is { payload: T } {
  if (!snapshot) return false;
  if (options?.cacheMode === "refresh") return false;
  return isCacheFirst(options) || hasData(snapshot.payload);
}

function snapshotDiagnostic(
  key: string,
  type: SourceDiagnostic["type"],
  cache: { computedAt?: Date; storage?: "database" | "file" } | Date | undefined,
  stale = false,
): SourceDiagnostic {
  const computedAt = cache instanceof Date ? cache : cache?.computedAt;
  const storage = cache instanceof Date ? "database" : cache?.storage || "database";
  const isDatabase = storage === "database";
  return {
    id: key,
    name: isDatabase ? "PostgreSQL 数据快照" : "本地运行缓存",
    adapter: isDatabase ? "database-snapshot" : "runtime-file-snapshot",
    type,
    ok: true,
    fromCache: true,
    cacheStorage: storage,
    message: stale
      ? (isDatabase ? "stale database snapshot" : "stale runtime file snapshot")
      : (isDatabase ? "database snapshot hit" : "runtime file snapshot hit"),
    updatedAt: computedAt?.toISOString() || new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Snapshot key helper
// ---------------------------------------------------------------------------

function snapshotKeyFor(prefix: string, value: string, updatedAt: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 16);
  return `${prefix}:${digest}:${updatedAt}`;
}

// ---------------------------------------------------------------------------
// Odds enrichment wrapper (adapts AggregationReadOptions -> boolean)
// ---------------------------------------------------------------------------

async function enrichMatchesWithLatestCanonicalOdds(
  matches: Match[],
  options: AggregationReadOptions = {},
): Promise<Match[]> {
  const normalizedMatches = matches.map(normalizeMatchPlaceholderTeams);
  const resolvedMatches = await resolveMatchesWithStoredBracketContext(normalizedMatches);
  return enrichOddsLatestCanonicalOdds(resolvedMatches, options.liveScoresOnly);
}

function matchHasBracketReference(match: Match): boolean {
  return [match.homeTeam, match.awayTeam, match.homeCode, match.awayCode].some((value) =>
    /^[WL]\s*\d{1,3}$/i.test(String(value || "").trim())
    || /^(WINNER|LOSER)(\s+OF)?\s+MATCH\s+\d{1,3}$/i.test(String(value || "").trim())
    || /^第\d{1,3}场[胜负]者$/.test(String(value || "").trim())
  );
}

function tournamentScheduleUtcBounds(): ScheduleUtcDayBounds | undefined {
  const times = allMatches
    .map((match) => Date.parse(match.kickoffAt || ""))
    .filter((time) => Number.isFinite(time));
  if (!times.length) return undefined;
  return {
    startUtc: new Date(Math.min(...times) - 60 * 60 * 1000).toISOString(),
    endUtc: new Date(Math.max(...times) + 60 * 60 * 1000).toISOString(),
  };
}

async function resolveMatchesWithStoredBracketContext(matches: Match[]): Promise<Match[]> {
  if (!matches.some(matchHasBracketReference)) return matches;
  const bounds = tournamentScheduleUtcBounds();
  const context = bounds ? await getStoredCanonicalMatches(bounds) : [];
  return resolveKnownBracketPlaceholderTeams(matches, context);
}

// ---------------------------------------------------------------------------
// Morning brief: article preview & stored payload helpers
// ---------------------------------------------------------------------------

function newsArticlePreview(article: NewsArticle): NewsArticle {
  return {
    id: article.id,
    title: article.title,
    titleZh: article.titleZh,
    titleEn: article.titleEn,
    url: article.url,
    source: article.source,
    publishedAt: article.publishedAt,
    summary: article.summary,
    summaryZh: article.summaryZh,
    summaryEn: article.summaryEn,
    imageUrl: article.imageUrl,
    domain: article.domain,
    language: article.language,
    country: article.country,
    sourceText: article.sourceText,
    bodySource: article.bodySource,
    bodyUpdatedAt: article.bodyUpdatedAt,
    bodyZh: article.bodyZh,
    bodyEn: article.bodyEn,
    body: article.body,
    relatedSources: article.relatedSources,
    relatedUrls: article.relatedUrls,
    sourceCount: article.sourceCount,
    aiSummary: article.aiSummary,
    aiKeyPoints: article.aiKeyPoints,
    aiScore: article.aiScore,
    aiComment: article.aiComment,
    keyPointsZh: article.keyPointsZh,
    keyPointsEn: article.keyPointsEn,
    commentZh: article.commentZh,
    commentEn: article.commentEn,
  };
}

function morningBriefStoredPayload(brief: MorningBrief): MorningBriefStoredPayload {
  const { news, ...rest } = brief;
  return {
    schemaVersion: 2,
    brief: rest,
    articleIds: news.map((article) => article.id),
    newsPreview: news.map(newsArticlePreview),
  };
}

function isStoredMorningPayload(payload: MorningBriefStoredPayload): payload is Exclude<MorningBriefStoredPayload, MorningBrief> {
  return typeof payload === "object"
    && payload !== null
    && "schemaVersion" in payload
    && (payload as { schemaVersion?: unknown }).schemaVersion === 2;
}

async function hydrateMorningBriefPayload(payload: MorningBriefStoredPayload): Promise<MorningBrief> {
  if (!isStoredMorningPayload(payload)) return payload;
  const canonical = await getCanonicalNewsArticlesByIds(payload.articleIds);
  const canonicalById = new Map(canonical.map((article) => [article.id, article]));
  const previewById = new Map(payload.newsPreview.map((article) => [article.id, article]));
  return {
    ...payload.brief,
    news: payload.articleIds
      .map((id) => canonicalById.get(id) || previewById.get(id))
      .filter((article): article is NewsArticle => Boolean(article)),
  };
}

async function hydrateNewsSnapshotPayload(payload: NewsSnapshotPayload): Promise<NewsSnapshotPayload> {
  const articleIds = payload.articleIds?.length
    ? payload.articleIds
    : payload.articles.map((article) => article.id);
  const canonical = await getCanonicalNewsArticlesByIds(articleIds);
  if (!canonical.length) {
    return {
      ...payload,
      articles: payload.articles.map(ensureArticleBody),
    };
  }

  const canonicalById = new Map(canonical.map((article) => [article.id, article]));
  return {
    ...payload,
    articles: payload.articles
      .map((article) => ensureArticleBody(canonicalById.get(article.id) || article)),
  };
}

function canonicalNewsDiagnostic(count: number): SourceDiagnostic {
  return {
    id: "news-articles",
    name: "Persistent news articles",
    adapter: "generic-json",
    type: "news",
    ok: count > 0,
    fromCache: true,
    message: `loaded ${count} articles from canonical news storage`,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Morning brief: match persistence
// ---------------------------------------------------------------------------

async function persistMorningBriefMatches(brief: MorningBrief): Promise<MorningBrief> {
  await persistCanonicalMatches(brief.matches, "ai-match-briefs");
  return brief;
}

// ---------------------------------------------------------------------------
// Morning quote helpers
// ---------------------------------------------------------------------------

function morningQuoteSnapshotPrefix(dateKey: ScheduleDateKey, dateRange: ScheduleUtcDayBounds): string {
  return `morning-quote:v1:${dateKey}:${dateRangeSnapshotKey(dateRange)}:`;
}

function selectMorningQuoteNews(news: NewsArticle[]): NewsArticle[] {
  return news
    .map((article, index) => ({
      article,
      index,
      score: article.aiScore ?? worldCupRelevanceScore(article) * 8,
      sourceCount: article.sourceCount || article.relatedSources?.length || 1,
      published: new Date(article.publishedAt).getTime(),
    }))
    .sort((left, right) =>
      right.score - left.score
      || right.sourceCount - left.sourceCount
      || (Number.isFinite(right.published) ? right.published : 0) - (Number.isFinite(left.published) ? left.published : 0)
      || left.index - right.index,
    )
    .slice(0, 5)
    .map((item) => item.article);
}

function matchUpdateFingerprint(match: Match) {
  return {
    id: match.id,
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    updatedAt: match.updatedAt,
    aiBriefZh: match.aiBriefZh,
    events: match.events?.map((event) => ({
      minute: event.minute,
      type: event.type,
      player: event.player,
      team: event.team,
      description: event.description,
    })) || [],
  };
}

function morningQuoteInputHash(news: NewsArticle[], matches: Match[]): string {
  const payload = {
    news: news.map((article) => ({
      id: article.id,
      title: article.titleZh || article.title,
      summary: article.summaryZh || article.aiSummary || article.summary,
      aiScore: article.aiScore,
      publishedAt: article.publishedAt,
      sourceCount: article.sourceCount,
    })),
    matches: matches.map(matchUpdateFingerprint),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

async function readMorningQuoteHistory(
  dateKey: ScheduleDateKey,
  dateRange: ScheduleUtcDayBounds,
  limit = 12,
): Promise<MorningQuote[]> {
  const rows = await readRecentSnapshotCaches<MorningQuoteSnapshotPayload>("morning-quote", {
    allowStale: true,
    limit,
    snapshotKeyPrefix: morningQuoteSnapshotPrefix(dateKey, dateRange),
  });
  const seen = new Set<string>();
  return rows
    .map((row) => row.payload)
    .filter((quote): quote is MorningQuote => Boolean(quote?.id && quote.text))
    .filter((quote) => {
      const key = `${quote.inputHash}:${quote.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function applyMorningQuoteHistory(brief: MorningBrief, history: MorningQuote[]): MorningBrief {
  const latest = history[0];
  return {
    ...brief,
    quote: latest?.text || brief.quote,
    quoteHistory: history,
  };
}

async function finalizeMorningBrief(
  brief: MorningBrief,
  dateKey: ScheduleDateKey,
  dateRange: ScheduleUtcDayBounds,
): Promise<MorningBrief> {
  const persisted = await persistMorningBriefMatches(brief);
  const history = await readMorningQuoteHistory(dateKey, dateRange);
  return applyMorningQuoteHistory(persisted, history);
}

async function getOrCreateMorningQuote(input: {
  dateKey: ScheduleDateKey;
  dateRange: ScheduleUtcDayBounds;
  news: NewsArticle[];
  matches: Match[];
  aiProviders: AiProviderConfig[];
  primaryAiProviderId?: string;
  adminUpdatedAt: string;
  disabled?: boolean;
}): Promise<{ quote?: MorningQuote; history: MorningQuote[] }> {
  const keyNews = selectMorningQuoteNews(input.news);
  if (!keyNews.length && !input.matches.length) {
    return { history: await readMorningQuoteHistory(input.dateKey, input.dateRange) };
  }

  const inputHash = morningQuoteInputHash(keyNews, input.matches);
  const snapshotPrefix = morningQuoteSnapshotPrefix(input.dateKey, input.dateRange);
  const snapshotKey = `${snapshotPrefix}${inputHash}:${input.adminUpdatedAt}`;
  const persisted = await readSnapshotCache<MorningQuoteSnapshotPayload>(snapshotKey, { allowStale: true });
  if (persisted?.payload) {
    return {
      quote: persisted.payload,
      history: await readMorningQuoteHistory(input.dateKey, input.dateRange),
    };
  }

  const quote = await generateMorningQuote({
    providers: orderAiProviders(input.aiProviders, input.primaryAiProviderId),
    news: keyNews,
    matches: input.matches,
    dateKey: input.dateKey,
    inputHash,
    disabled: input.disabled,
  });
  await upsertSnapshotCache({
    snapshotKey,
    feature: "morning-quote",
    sourceMode: quote.source === "ai" ? "remote" : "fallback",
    sourceId: quote.providerName || "rules-morning-quote",
    payload: quote,
    diagnostics: {
      inputHash,
      newsArticleIds: quote.newsArticleIds,
      matchIds: quote.matchIds,
    },
    ttlSeconds: 180 * 24 * 60 * 60,
  });
  const history = await readMorningQuoteHistory(input.dateKey, input.dateRange);
  return { quote, history: history.some((item) => item.id === quote.id) ? history : [quote, ...history] };
}

// ---------------------------------------------------------------------------
// Build morning brief
// ---------------------------------------------------------------------------

function buildMorningBrief(input: {
  matches: Match[];
  news: NewsArticle[];
  sourceLabel: string;
  dateKey: ScheduleDateKey;
  sourceDate?: string;
  aggregation: NewsAggregationMeta;
  curation?: AiNewsCuration;
  quote?: MorningQuote;
  quoteHistory?: MorningQuote[];
}): MorningBrief {
  const finishedMatches = input.matches.filter((match) => match.status === "finished");
  const headlineMatch = finishedMatches[0] || input.matches[0];
  const topNews = input.news[0];
  const issueDate = input.sourceDate || scheduleDateMeta[input.dateKey].date;
  const edition = `${issueDate} 早报`;
  const fallbackTitle = headlineMatch
    ? `世界杯早报：${headlineMatch.homeTeam} vs ${headlineMatch.awayTeam}`
    : "世界杯早报：新闻、赛程与市场信号";
  const matchSummary = input.matches.length
    ? finishedMatches.length
      ? `${scheduleDateMeta[input.dateKey].listLabel}共 ${input.matches.length} 场，已完赛 ${finishedMatches.length} 场。`
      : `${scheduleDateMeta[input.dateKey].listLabel}共 ${input.matches.length} 场，赛况更新后进入战局快报。`
    : "";
  const newsSummary = buildFallbackNewsSummary(input.news, input.aggregation);
  const fallbackSummary = [newsSummary, matchSummary].filter(Boolean).join(" ");
  return {
    issueDate,
    edition,
    title: input.curation?.title || topNews?.titleZh || fallbackTitle,
    summary: input.curation?.summary || fallbackSummary,
    quote: input.quote?.text || (topNews ? articleFocusSentence(topNews) || shortenText(topNews.summaryZh || topNews.summary, 96) : ""),
    quoteHistory: input.quoteHistory || [],
    sourceLabel: input.sourceLabel,
    updatedAt: new Date().toISOString(),
    matches: input.matches,
    news: input.news,
    gossipItems: [],
    aggregation: input.aggregation,
  };
}

// ---------------------------------------------------------------------------
// Source status helpers
// ---------------------------------------------------------------------------

function sourceFeature(source: DataSourceConfig): string {
  if (source.type === "schedule" || source.type === "scores") return "matches";
  if (source.type === "prediction-market") return "radar";
  if (source.type === "team-content") return "teams";
  if (source.type === "odds") return "odds";
  if (source.type === "news") return "news";
  return source.type;
}

function latestDate(...dates: Array<Date | undefined | null>): Date | undefined {
  return dates
    .filter((date): date is Date => date instanceof Date && Number.isFinite(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];
}

// ===========================================================================
//  MAIN EXPORT FUNCTIONS
// ===========================================================================

// ---------------------------------------------------------------------------
// getAggregatedOdds
// ---------------------------------------------------------------------------

export async function getAggregatedOdds(options: AggregationReadOptions = {}): Promise<{
  oddsMatches: OddsMatch[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const snapshotKey = `odds:v2:world-cup:${updatedAt}`;
  const persisted = await readSnapshotCache<OddsMatch[]>(snapshotKey);
  if (shouldUseSnapshot(persisted, (payload) => payload.length > 0, options)) {
    const oddsMatches = await enrichOddsMatchesWithStoredMatches(persisted.payload);
    return {
      oddsMatches,
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "odds", persisted)],
    };
  }

  if (isCacheFirst(options)) {
    const stale = await readSnapshotCache<OddsMatch[]>(snapshotKey, { allowStale: true });
    if (stale) {
      const oddsMatches = await enrichOddsMatchesWithStoredMatches(stale.payload);
      return {
        oddsMatches,
        source: "cache",
        diagnostics: [snapshotDiagnostic(snapshotKey, "odds", stale, true)],
      };
    }
  }

  if (isCacheOnly(options)) {
    const latestOdds = await enrichOddsMatchesWithStoredMatches(await readLatestOddsMarketSnapshots());
    return {
      oddsMatches: latestOdds,
      source: latestOdds.length ? "cache" : "fallback",
      diagnostics: [],
    };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const sources = sortEnabledSources(dataSources, "odds");
  for (const source of sources) {
    try {
      if (source.adapter === "api-football") {
        if (source.endpointPath === "/odds/live") {
          const { data, diagnostic } = await fetchJsonFromSource<ApiFootballLiveOddsResponse>(source, {
            league: 1,
            season: 2026,
          });
          diagnostics.push(diagnostic);
          const fixtureIds = (data.response || [])
            .map((record) => record.fixture?.id)
            .filter((id): id is number => Number.isFinite(id));
          const fixturesById = await fetchApiFootballFixturesForIds(dataSources, fixtureIds, diagnostics);
          const oddsMatches = await enrichOddsMatchesWithStoredMatches(transformApiFootballLiveOdds(data, fixturesById));
          if (!oddsMatches.length) continue;
          await recordOddsMarketSnapshots(oddsMatches, source.id);
          await upsertSnapshotCache({
            snapshotKey,
            feature: "odds",
            sourceMode: "remote",
            sourceId: source.id,
            payload: oddsMatches,
            diagnostics,
            ttlSeconds: getEffectiveRefreshSeconds(source),
          });
          return { oddsMatches, source: "remote", diagnostics };
        }

        const { data, diagnostic } = await fetchJsonFromSource<ApiFootballOddsResponse>(source, {
          league: 1,
          season: 2026,
        });
        diagnostics.push(diagnostic);
        const fixtureIds = (data.response || [])
          .map((record) => record.fixture?.id)
          .filter((id): id is number => Number.isFinite(id));
        const fixturesById = await fetchApiFootballFixturesForIds(dataSources, fixtureIds, diagnostics);
        const oddsMatches = await enrichOddsMatchesWithStoredMatches(transformApiFootballPreMatchOdds(data, fixturesById));
        if (!oddsMatches.length) continue;
        await recordOddsMarketSnapshots(oddsMatches, source.id);
        await upsertSnapshotCache({
          snapshotKey,
          feature: "odds",
          sourceMode: "remote",
          sourceId: source.id,
          payload: oddsMatches,
          diagnostics,
          ttlSeconds: getEffectiveRefreshSeconds(source),
        });
        return { oddsMatches, source: "remote", diagnostics };
      }

      if (source.adapter === "the-odds-api") {
        const { data, diagnostic } = await fetchJsonFromSource<TheOddsApiEvent[]>(source, {
          regions: "eu",
          markets: "h2h",
          oddsFormat: "decimal",
          dateFormat: "iso",
        });
        diagnostics.push(diagnostic);
        const oddsMatches = await enrichOddsMatchesWithStoredMatches(transformTheOddsApi(data));
        if (!oddsMatches.length) continue;
        await recordOddsMarketSnapshots(oddsMatches, source.id);
        await upsertSnapshotCache({
          snapshotKey,
          feature: "odds",
          sourceMode: "remote",
          sourceId: source.id,
          payload: oddsMatches,
          diagnostics,
          ttlSeconds: getEffectiveRefreshSeconds(source),
        });
        return { oddsMatches, source: "remote", diagnostics };
      }

      if (source.adapter === "odds-api-io") {
        const oddsMatches = await enrichOddsMatchesWithStoredMatches(await fetchOddsApiIoOdds(source, diagnostics));
        if (!oddsMatches.length) continue;
        await recordOddsMarketSnapshots(oddsMatches, source.id);
        await upsertSnapshotCache({
          snapshotKey,
          feature: "odds",
          sourceMode: "remote",
          sourceId: source.id,
          payload: oddsMatches,
          diagnostics,
          ttlSeconds: getEffectiveRefreshSeconds(source),
        });
        return { oddsMatches, source: "remote", diagnostics };
      }
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  const stale = await readSnapshotCache<OddsMatch[]>(snapshotKey, { allowStale: true });
  if (stale?.payload.length) {
    const oddsMatches = await enrichOddsMatchesWithStoredMatches(stale.payload);
    return {
      oddsMatches,
      source: "cache",
      diagnostics: [...diagnostics, snapshotDiagnostic(snapshotKey, "odds", stale, true)],
    };
  }

  return { oddsMatches: [], source: "fallback", diagnostics };
}

// ---------------------------------------------------------------------------
// getAggregatedTeams
// ---------------------------------------------------------------------------

export async function getAggregatedTeams(options: AggregationReadOptions = {}): Promise<{
  teams: Team[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const snapshotKey = `teams:v5:world-cup:${updatedAt}`;
  const persisted = await readSnapshotCache<Team[]>(snapshotKey);
  if (shouldUseSnapshot(persisted, (payload) => payload.length > 0, options)) {
    return {
      teams: persisted.payload,
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "team-content", persisted)],
    };
  }

  if (isCacheFirst(options)) {
    const stale = await readSnapshotCache<Team[]>(snapshotKey, { allowStale: true });
    if (stale) {
      return {
        teams: stale.payload,
        source: "cache",
        diagnostics: [snapshotDiagnostic(snapshotKey, "team-content", stale, true)],
      };
    }
  }

  if (isCacheOnly(options)) {
    return { teams: teamsWithBuiltInProfilesFromOfficialSchedule(), source: "fallback", diagnostics: [] };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const sources = sortEnabledSources(dataSources, "team-content");
  const teamLists: Team[][] = [];
  let primarySourceId: string | null = null;

  for (const source of sources) {
    try {
      let teams: Team[] = [];
      if (source.adapter === "api-football") {
        if (source.endpointPath !== "/teams") continue;
        const { data, diagnostic } = await fetchJsonFromSource<ApiFootballResponse<ApiFootballTeamResponse>>(source, {
          league: 1,
          season: 2026,
        });
        diagnostics.push(diagnostic);
        teams = transformApiFootballTeams(data);
      } else if (source.adapter === "football-data-org") {
        const { data, diagnostic } = await fetchJsonFromSource<FootballDataTeamsResponse>(source, {
          season: 2026,
        });
        diagnostics.push(diagnostic);
        teams = transformFootballDataTeams(data);
      } else if (source.adapter === "thesportsdb") {
        const { data, diagnostic } = await fetchJsonFromSource<TheSportsDbTeamsResponse>(source, {
          l: "FIFA_World_Cup",
        });
        diagnostics.push(diagnostic);
        teams = transformTheSportsDbTeams(data);
      }
      if (teams.length) {
        teamLists.push(teams);
        primarySourceId ||= source.id;
      }
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  const officialTeams = teamsWithBuiltInProfilesFromOfficialSchedule();
  const teams = await enrichApiFootballTeamsWithAuxSources(
    mergeTeamLists([officialTeams, ...teamLists]),
    dataSources,
    diagnostics,
  );
  if (teams.length) {
    const remoteSucceeded = diagnostics.some((diagnostic) => diagnostic.ok && !diagnostic.fromCache);
    const ttlSeconds = sources.length
      ? Math.min(...sources.map((source) => getEffectiveRefreshSeconds(source)))
      : 86400;
    await upsertSnapshotCache({
      snapshotKey,
      feature: "teams",
      sourceMode: remoteSucceeded ? "remote" : "fallback",
      sourceId: primarySourceId || "fifa-official-schedule",
      payload: teams,
      diagnostics,
      ttlSeconds,
    });
    return { teams, source: remoteSucceeded ? "remote" : "fallback", diagnostics };
  }

  const stale = await readSnapshotCache<Team[]>(snapshotKey, { allowStale: true });
  if (stale?.payload.length) {
    return {
      teams: stale.payload,
      source: "cache",
      diagnostics: [
        ...diagnostics,
        snapshotDiagnostic(snapshotKey, "team-content", stale, true),
      ],
    };
  }
  return { teams: [], source: "fallback", diagnostics };
}

// ---------------------------------------------------------------------------
// getAggregatedMatches
// ---------------------------------------------------------------------------

export async function getAggregatedMatches(dateKey: ScheduleDateKey, options: AggregationReadOptions = {}): Promise<{
  matches: Match[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const sourceDate = sourceDateFor(dateKey, options);
  const dateRange = dateRangeFor(dateKey, options);
  const providerDates = providerDatesForRange(dateRange, sourceDate);
  const snapshotKey = `matches:v6:${dateKey}:${dateRangeSnapshotKey(dateRange)}:${updatedAt}`;
  const persisted = await readSnapshotCache<Match[]>(snapshotKey);
  if (shouldUseSnapshot(persisted, (payload) => payload.length > 0, options)) {
    return {
      matches: await enrichMatchesWithLatestCanonicalOdds(persisted.payload, options),
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "schedule", persisted)],
    };
  }

  if (isCacheFirst(options)) {
    const stale = await readSnapshotCache<Match[]>(snapshotKey, { allowStale: true });
    if (stale) {
      return {
        matches: await enrichMatchesWithLatestCanonicalOdds(stale.payload, options),
        source: "cache",
        diagnostics: [snapshotDiagnostic(snapshotKey, "schedule", stale, true)],
      };
    }
  }

  if (isCacheOnly(options)) {
    const storedOfficialMatches = await getStoredCanonicalMatches(dateRange);
    const fallbackMatches = fifaMatchesInUtcDayBounds(dateRange);
    const canonicalMatches = storedOfficialMatches.length ? storedOfficialMatches : fallbackMatches;
    return {
      matches: await enrichMatchesWithLatestCanonicalOdds(canonicalMatches, options),
      source: storedOfficialMatches.length ? "cache" : "fallback",
      diagnostics: [],
    };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const scoreSources = sortEnabledSources(dataSources, "scores");

  for (const source of scoreSources) {
    try {
      let matches: Match[] = [];
      if (source.adapter === "api-football") {
        const data: ApiFootballResponse<ApiFootballFixture> = { response: [] };
        for (const providerDate of providerDates) {
          const result = await fetchJsonFromSource<ApiFootballResponse<ApiFootballFixture>>(source, {
            league: 1,
            season: 2026,
            date: providerDate,
            timezone: "Asia/Shanghai",
          });
          diagnostics.push(result.diagnostic);
          data.response?.push(...(result.data.response || []));
        }
        const fixtureIds = (data.response || [])
          .map((fixture) => fixture.fixture?.id)
          .filter((id): id is number => Number.isFinite(id));
        const detailSource = dataSources.find((item) =>
          item.id === "api-football-worldcup-details"
          && item.enabled
          && item.apiKey
        );
        let detailData: ApiFootballResponse<ApiFootballFixture> | undefined;
        if (detailSource && fixtureIds.length) {
          try {
            const detail = await fetchJsonFromSource<ApiFootballResponse<ApiFootballFixture>>(detailSource, {
              ids: fixtureIds.join("-"),
              timezone: "Asia/Shanghai",
            });
            diagnostics.push(detail.diagnostic);
            detailData = detail.data;
          } catch (error) {
            diagnostics.push(error as SourceDiagnostic);
          }
        }
        const predictionSource = enabledSourceById(dataSources, "api-football-worldcup-predictions");
        const predictionsByFixtureId = await fetchApiFootballPredictionsForFixtureIds(
          predictionSource,
          fixtureIds,
          diagnostics,
        );
        matches = transformApiFootballMatches(
          mergeApiFootballFixtureDetails(data, detailData),
          dateKey,
          sourceDate,
          dateRange,
          predictionsByFixtureId,
        );
      } else if (source.adapter === "football-data-org") {
        const { data, diagnostic } = await fetchJsonFromSource<FootballDataMatchesResponse>(source, {
          season: 2026,
        });
        diagnostics.push(diagnostic);
        matches = transformFootballDataMatches(data, dateKey, sourceDate, dateRange);
      } else if (source.adapter === "worldcupapi-com") {
        matches = [];
        for (const providerDate of providerDates) {
          const { data, diagnostic } = await fetchJsonFromSource<unknown>(source, {
            date: providerDate,
          });
          diagnostics.push(diagnostic);
          matches.push(...transformWorldCupApiMatches(data, dateKey, sourceDate, dateRange));
        }
        matches = uniqueMatches(matches);
      } else if (source.adapter === "thesportsdb") {
        const { data, diagnostic } = await fetchJsonFromSource<TheSportsDbEventsResponse>(source, {
          id: 4429,
          s: 2026,
        });
        diagnostics.push(diagnostic);
        matches = transformTheSportsDbMatches(data, dateKey, sourceDate, dateRange);
      }
      if (!matches.length) continue;
      const canonicalMatches = await storeAndReadCanonicalMatches(matches, source.id, dateRange);

      await upsertSnapshotCache({
        snapshotKey,
        feature: "matches",
        sourceMode: "remote",
        sourceId: source.id,
        payload: canonicalMatches,
        diagnostics,
        ttlSeconds: getEffectiveRefreshSeconds(source),
      });
      return {
        matches: await enrichMatchesWithLatestCanonicalOdds(canonicalMatches, options),
        source: "remote",
        diagnostics,
      };
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  const scheduleSources = sortEnabledSources(dataSources, "schedule");

  for (const source of scheduleSources) {
    try {
      if (source.adapter !== "openfootball-worldcup-json") continue;
      const { data, diagnostic } = await fetchJsonFromSource<OpenFootballWorldCup>(source);
      diagnostics.push(diagnostic);
      const matches = transformOpenFootballMatches(data, dateKey, sourceDate, dateRange);
      if (matches.length > 0) {
        const canonicalMatches = await storeAndReadCanonicalMatches(matches, source.id, dateRange);
        await upsertSnapshotCache({
          snapshotKey,
          feature: "matches",
          sourceMode: "remote",
          sourceId: source.id,
          payload: canonicalMatches,
          diagnostics,
          ttlSeconds: getEffectiveRefreshSeconds(source),
        });
        return {
          matches: await enrichMatchesWithLatestCanonicalOdds(canonicalMatches, options),
          source: "remote",
          diagnostics,
        };
      }
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  const stale = await readSnapshotCache<Match[]>(snapshotKey, { allowStale: true });
  if (stale?.payload.length) {
    return {
      matches: await enrichMatchesWithLatestCanonicalOdds(stale.payload, options),
      source: "cache",
      diagnostics: [
        ...diagnostics,
        snapshotDiagnostic(snapshotKey, "schedule", stale, true),
      ],
    };
  }

  const storedOfficialMatches = await getStoredCanonicalMatches(dateRange);
  if (storedOfficialMatches.length > 0) {
    const databaseDiagnostic: SourceDiagnostic = {
      id: "fifa-official-db",
      name: "PostgreSQL FIFA 官方赛程",
      adapter: "database-domain-table",
      type: "schedule",
      ok: true,
      fromCache: true,
      message: "loaded from matches table",
      updatedAt: new Date().toISOString(),
    };
    await upsertSnapshotCache({
      snapshotKey,
      feature: "matches",
      sourceMode: "fallback",
      sourceId: "fifa-official-db",
      payload: storedOfficialMatches,
      diagnostics: [...diagnostics, databaseDiagnostic],
      ttlSeconds: 86400,
    });
    return {
      matches: await enrichMatchesWithLatestCanonicalOdds(storedOfficialMatches, options),
      source: "cache",
      diagnostics: [...diagnostics, databaseDiagnostic],
    };
  }

  const fallbackMatches = fifaMatchesInUtcDayBounds(dateRange);
  await upsertSnapshotCache({
    snapshotKey,
    feature: "matches",
    sourceMode: "fallback",
    sourceId: "fifa-official-pdf",
    payload: fallbackMatches,
    diagnostics,
    ttlSeconds: 300,
  });
  return {
    matches: await enrichMatchesWithLatestCanonicalOdds(fallbackMatches, options),
    source: "fallback",
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// getAggregatedRadar
// ---------------------------------------------------------------------------

export async function getAggregatedRadar(options: AggregationReadOptions = {}): Promise<{
  radarMatches: RadarMatch[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const snapshotKey = `radar:v5:polymarket:world-cup:${updatedAt}`;
  const persisted = await readSnapshotCache<RadarMatch[]>(snapshotKey);
  if (shouldUseSnapshot(persisted, (payload) => payload.length > 0, options)) {
    return {
      radarMatches: persisted.payload,
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "prediction-market", persisted)],
    };
  }

  if (isCacheFirst(options)) {
    const stale = await readSnapshotCache<RadarMatch[]>(snapshotKey, { allowStale: true });
    if (stale) {
      return {
        radarMatches: stale.payload,
        source: "cache",
        diagnostics: [snapshotDiagnostic(snapshotKey, "prediction-market", stale, true)],
      };
    }
  }

  if (isCacheOnly(options)) {
    const latestRadar = (await readLatestRadarMarketSnapshots()).filter(isPolymarketRadarMatch);
    return {
      radarMatches: latestRadar,
      source: latestRadar.length ? "cache" : "fallback",
      diagnostics: [],
    };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const marketSources = sortEnabledSources(dataSources, "prediction-market");

  for (const source of marketSources) {
    try {
      if (source.adapter === "api-football") {
        const matchResults = await Promise.all(
          (["yesterday", "today", "tomorrow"] as ScheduleDateKey[]).map((dateKey) =>
            getAggregatedMatches(dateKey, { cacheMode: "cache-first" }),
          ),
        );
        const matches = matchResults.flatMap((result) => result.matches);
        diagnostics.push(...matchResults.flatMap((result) => result.diagnostics));
        const fixtureIds = matches
          .map((match) => match.providerFixtureId || apiFootballFixtureIdFromMatchId(match.id))
          .filter((id): id is number => Number.isFinite(id));
        const predictions = await fetchApiFootballPredictionsForFixtureIds(source, fixtureIds, diagnostics);
        const transformed = transformApiFootballPredictionsToRadar(matches, predictions);
        if (transformed.length > 0) {
          await recordRadarMarketSnapshots(transformed, source.id);
          await upsertSnapshotCache({
            snapshotKey,
            feature: "radar",
            sourceMode: "remote",
            sourceId: source.id,
            payload: transformed,
            diagnostics,
            ttlSeconds: getEffectiveRefreshSeconds(source),
          });
          return { radarMatches: transformed, source: "remote", diagnostics };
        }
        continue;
      }

      if (source.adapter !== "polymarket-gamma") continue;
      const { data, diagnostic } = await fetchJsonFromSource<PolymarketEvent[]>(source, {
        tag_id: POLYMARKET_WORLD_CUP_TAG_ID,
        related_tags: "true",
        active: "true",
        closed: "false",
        limit: 100,
        order: "volume24hr",
        ascending: "false",
      });
      diagnostics.push(diagnostic);
      let closedData: PolymarketEvent[] = [];
      try {
        const closed = await fetchJsonFromSource<PolymarketEvent[]>(source, {
          tag_id: POLYMARKET_WORLD_CUP_TAG_ID,
          related_tags: "true",
          active: "true",
          closed: "true",
          limit: 100,
          order: "volume24hr",
          ascending: "false",
        });
        diagnostics.push(closed.diagnostic);
        closedData = closed.data;
      } catch (error) {
        diagnostics.push(error as SourceDiagnostic);
      }
      const transformedById = new Map<string, RadarMatch>();
      for (const item of transformPolymarketEvents(data)) transformedById.set(item.id, item);
      for (const item of transformPolymarketEvents(closedData, { includeClosedMarkets: true })) {
        if (!transformedById.has(item.id)) transformedById.set(item.id, item);
      }
      const transformed = Array.from(transformedById.values())
        .sort((left, right) => (right.volumeUsd || 0) - (left.volumeUsd || 0));
      if (transformed.length > 0) {
        await recordRadarMarketSnapshots(transformed, source.id);
        await upsertSnapshotCache({
          snapshotKey,
          feature: "radar",
          sourceMode: "remote",
          sourceId: source.id,
          payload: transformed,
          diagnostics,
          ttlSeconds: getEffectiveRefreshSeconds(source),
        });
        return { radarMatches: transformed, source: "remote", diagnostics };
      }
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  const stale = await readSnapshotCache<RadarMatch[]>(snapshotKey, { allowStale: true });
  if (stale?.payload.length) {
    return {
      radarMatches: stale.payload,
      source: "cache",
      diagnostics: [
        ...diagnostics,
        snapshotDiagnostic(snapshotKey, "prediction-market", stale, true),
      ],
    };
  }

  await upsertSnapshotCache({
    snapshotKey,
    feature: "radar",
    sourceMode: "fallback",
    sourceId: "empty-radar-fallback",
    payload: [],
    diagnostics,
    ttlSeconds: 60,
  });
  return {
    radarMatches: [],
    source: "fallback",
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// getAggregatedNews
// ---------------------------------------------------------------------------

export async function getAggregatedNews(options: {
  query?: string;
  limit?: number;
  publishedAfter?: Date | string;
  publishedBefore?: Date | string;
  cacheMode?: AggregationReadOptions["cacheMode"];
  useAi?: boolean;
} = {}): Promise<{
  articles: NewsArticle[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
  aggregation: NewsAggregationMeta;
  curation?: AiNewsCuration;
}> {
  const query = options.query?.trim() || defaultNewsQuery;
  const limit = Math.min(Math.max(options.limit || MORNING_BRIEF_NEWS_LIMIT, 1), MAX_AGGREGATED_NEWS_LIMIT);
  const publishedAfter = options.publishedAfter ? new Date(options.publishedAfter) : undefined;
  const publishedBefore = options.publishedBefore ? new Date(options.publishedBefore) : undefined;
  const window: NewsFetchWindow = {
    publishedAfter: publishedAfter && Number.isFinite(publishedAfter.getTime()) ? publishedAfter : undefined,
    publishedBefore: publishedBefore && Number.isFinite(publishedBefore.getTime()) ? publishedBefore : undefined,
  };
  const { dataSources, aiProviders, primaryAiProviderId, updatedAt } = await readAdminConfig();
  const windowKey = `${window.publishedAfter?.toISOString() || "any"}:${window.publishedBefore?.toISOString() || "any"}`;
  const snapshotKey = snapshotKeyFor("news:v9", `${query}:${limit}:${windowKey}`, updatedAt);
  const persisted = await readSnapshotCache<NewsSnapshotPayload>(snapshotKey);
  if (shouldUseSnapshot(persisted, (payload) => payload.articles.length > 0, options)) {
    const payload = await hydrateNewsSnapshotPayload(persisted.payload);
    return {
      articles: payload.articles,
      source: "cache",
      diagnostics: [
        ...payload.diagnostics,
        snapshotDiagnostic(snapshotKey, "news", persisted),
      ],
      aggregation: payload.aggregation,
      curation: payload.curation,
    };
  }

  if (isCacheFirst(options)) {
    const stale = await readSnapshotCache<NewsSnapshotPayload>(snapshotKey, { allowStale: true });
    if (stale) {
      const payload = await hydrateNewsSnapshotPayload(stale.payload);
      return {
        articles: payload.articles,
        source: "cache",
        diagnostics: [
          ...payload.diagnostics,
          snapshotDiagnostic(snapshotKey, "news", stale, true),
        ],
        aggregation: payload.aggregation,
        curation: payload.curation,
      };
    }
  }

  const emptyAggregation: NewsAggregationMeta = {
    fetchedSourceCount: 0,
    successfulSourceCount: 0,
    rawArticleCount: 0,
    deduplicatedArticleCount: 0,
    aiUsed: false,
    aiMessage: "后台任务正在刷新新闻数据。",
  };

  if (isCacheOnly(options)) {
    const latest = await readLatestSnapshotCache<NewsSnapshotPayload>("news", { allowStale: true });
    if (latest?.payload.articles.length) {
      const payload = await hydrateNewsSnapshotPayload(latest.payload);
      return {
        articles: payload.articles.slice(0, limit),
        source: "cache",
        diagnostics: [
          ...payload.diagnostics,
          snapshotDiagnostic(latest.snapshotKey, "news", latest, true),
        ],
        aggregation: payload.aggregation,
        curation: payload.curation,
      };
    }
    const { articles: canonicalArticles } = await getLatestCanonicalNewsArticles(limit);
    const mappedArticles = canonicalArticles.map(ensureArticleBody);
    if (mappedArticles.length) {
      return {
        articles: mappedArticles,
        source: "cache",
        diagnostics: [canonicalNewsDiagnostic(mappedArticles.length)],
        aggregation: {
          ...emptyAggregation,
          deduplicatedArticleCount: mappedArticles.length,
          aiMessage: "从持久化新闻库按发布时间读取。",
        },
      };
    }
    return {
      articles: [],
      source: "fallback",
      diagnostics: [],
      aggregation: emptyAggregation,
    };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const newsSources = sortEnabledSources(dataSources, "news");
  const perSourceLimit = Math.min(Math.max(limit, 20), MAX_AGGREGATED_NEWS_LIMIT);
  const sourceResults = await Promise.all(
    newsSources.map(async (source) => {
      try {
        return await fetchNewsSource(source, query, perSourceLimit, window);
      } catch (error) {
        return { articles: [], diagnostic: error as SourceDiagnostic };
      }
    }),
  );
  const rawArticles = sourceResults.flatMap((result) => {
    diagnostics.push(result.diagnostic);
    return result.articles;
  });
  const ruleDeduplicated = await enrichArticlesWithSourceText(mergeNewsArticles(rawArticles, limit));
  const orderedAiProviders = orderAiProviders(aiProviders, primaryAiProviderId);
  const aiResult = options.useAi === false
    ? { message: "前台快速刷新使用规则热度排序，AI 评分未阻塞本次返回。" }
    : await curateNewsWithAi(orderedAiProviders, ruleDeduplicated);
  const articles = applyAiCuration(ruleDeduplicated, aiResult.curation)
    .map(ensureArticleBody)
    .slice(0, limit);
  const aggregation: NewsAggregationMeta = {
    fetchedSourceCount: newsSources.length,
    successfulSourceCount: sourceResults.filter((result) => result.articles.length > 0).length,
    rawArticleCount: rawArticles.length,
    deduplicatedArticleCount: articles.length,
    aiUsed: Boolean(aiResult.curation),
    aiProvider: aiResult.curation?.providerName,
    aiMessage: aiResult.message,
  };

  if (articles.length > 0) {
    await upsertCanonicalNewsArticles(articles);
    const ttlSeconds = Math.min(
      ...newsSources.map((source) => getEffectiveRefreshSeconds(source)),
    );
    await upsertSnapshotCache({
      snapshotKey,
      feature: "news",
      sourceMode: "remote",
      sourceId: "multi-source-news",
      payload: { articles, articleIds: articles.map((article) => article.id), aggregation, curation: aiResult.curation, diagnostics },
      diagnostics,
      ttlSeconds: Number.isFinite(ttlSeconds) ? ttlSeconds : 900,
    });
    return {
      articles,
      source: "remote",
      diagnostics,
      aggregation,
      curation: aiResult.curation,
    };
  }

  const stale = await readSnapshotCache<NewsSnapshotPayload>(snapshotKey, { allowStale: true });
  if (stale?.payload.articles.length) {
    const payload = await hydrateNewsSnapshotPayload(stale.payload);
    return {
      articles: payload.articles,
      source: "cache",
      diagnostics: [
        ...diagnostics,
        snapshotDiagnostic(snapshotKey, "news", stale, true),
      ],
      aggregation: payload.aggregation,
      curation: payload.curation,
    };
  }

  await upsertSnapshotCache({
    snapshotKey,
    feature: "news",
    sourceMode: "fallback",
    sourceId: "empty-news-fallback",
    payload: { articles: [], articleIds: [], aggregation, diagnostics },
    diagnostics,
    ttlSeconds: 300,
  });
  return { articles: [], source: "fallback", diagnostics, aggregation };
}

// ---------------------------------------------------------------------------
// getAggregatedMorningBrief
// ---------------------------------------------------------------------------

async function getCachedMorningNewsFallback(): Promise<{
  articles: NewsArticle[];
  source: "cache";
  diagnostics: SourceDiagnostic[];
  aggregation: NewsAggregationMeta;
  curation?: AiNewsCuration;
} | undefined> {
  const latest = await readLatestSnapshotCache<NewsSnapshotPayload>("news", { allowStale: true });
  if (!latest?.payload.articles.length) {
    const { articles: canonicalArticles } = await getLatestCanonicalNewsArticles(MORNING_BRIEF_NEWS_LIMIT);
    const mappedArticles = canonicalArticles.map(ensureArticleBody);
    if (!mappedArticles.length) return undefined;
    return {
      articles: mappedArticles,
      source: "cache",
      diagnostics: [canonicalNewsDiagnostic(mappedArticles.length)],
      aggregation: {
        fetchedSourceCount: 0,
        successfulSourceCount: 0,
        rawArticleCount: mappedArticles.length,
        deduplicatedArticleCount: mappedArticles.length,
        aiUsed: false,
        aiMessage: "从持久化新闻库按发布时间读取。",
      },
    };
  }
  const payload = await hydrateNewsSnapshotPayload(latest.payload);
  return {
    articles: payload.articles,
    source: "cache",
    diagnostics: [
      ...payload.diagnostics,
      snapshotDiagnostic(latest.snapshotKey, "news", latest, true),
    ],
    aggregation: payload.aggregation,
    curation: payload.curation,
  };
}

export async function getAggregatedMorningBrief(dateKey: ScheduleDateKey, options: AggregationReadOptions = {}): Promise<{
  brief: MorningBrief;
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { updatedAt, aiProviders, primaryAiProviderId } = await readAdminConfig();
  const newsWindow = rollingRecentNewsWindow();
  const sourceDate = sourceDateFor(dateKey, options);
  const dateRange = dateRangeFor(dateKey, options);
  const snapshotPrefix = `morning:v19:${dateKey}:${dateRangeSnapshotKey(dateRange)}:`;
  const snapshotKey = `${snapshotPrefix}${newsWindow.cacheKey}:${updatedAt}`;
  const persisted = await readSnapshotCache<MorningBriefStoredPayload>(snapshotKey);
  if (persisted?.payload && options.cacheMode !== "refresh") {
    return {
      brief: await finalizeMorningBrief(await hydrateMorningBriefPayload(persisted.payload), dateKey, dateRange),
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "news", persisted)],
    };
  }

  if (isCacheFirst(options)) {
    const stale = await readSnapshotCache<MorningBriefStoredPayload>(snapshotKey, { allowStale: true });
    if (stale?.payload) {
      return {
        brief: await finalizeMorningBrief(await hydrateMorningBriefPayload(stale.payload), dateKey, dateRange),
        source: "cache",
        diagnostics: [snapshotDiagnostic(snapshotKey, "news", stale, true)],
      };
    }
  }

  if (isCacheOnly(options)) {
    const latestSameDay = await readLatestSnapshotCache<MorningBriefStoredPayload>("morning", { allowStale: true });
    if (latestSameDay?.payload && latestSameDay.snapshotKey.startsWith(snapshotPrefix)) {
      return {
        brief: await finalizeMorningBrief(await hydrateMorningBriefPayload(latestSameDay.payload), dateKey, dateRange),
        source: "cache",
        diagnostics: [snapshotDiagnostic(latestSameDay.snapshotKey, "news", latestSameDay, true)],
      };
    }

    const matchesResult = await getAggregatedMatches(dateKey, {
      cacheMode: "cache-only",
      sourceDate,
      dateRange,
    });
    const teamsInMatches = matchesResult.matches
      .flatMap((match) => [match.homeTeam, match.awayTeam])
      .filter((team) => team && team !== "待定")
      .slice(0, 6);
    const query = teamsInMatches.length
      ? `${defaultNewsQuery} OR (${teamsInMatches.join(" OR ")})`
      : defaultNewsQuery;
    let newsResult = await getAggregatedNews({
      query,
      limit: MORNING_BRIEF_NEWS_LIMIT,
      publishedAfter: newsWindow.start,
      cacheMode: "cache-only",
    });
    if (!newsResult.articles.length) {
      newsResult = await getAggregatedNews({
        query: defaultNewsQuery,
        limit: MORNING_BRIEF_NEWS_LIMIT,
        cacheMode: "cache-only",
      });
    }
    if (!newsResult.articles.length) {
      newsResult = await getCachedMorningNewsFallback() || newsResult;
    }
    const successfulNewsSources = newsResult.diagnostics
      .filter((diagnostic) => diagnostic.ok)
      .map((diagnostic) => diagnostic.name);
    const sourceLabel = successfulNewsSources.length
      ? `${successfulNewsSources.join(" + ")} · 多源聚合`
      : matchesResult.matches.length
        ? "本地赛程 · 新闻后台刷新"
        : "后台任务正在刷新";
    const fallbackBrief = buildMorningBrief({
      matches: matchesResult.matches,
      news: newsResult.articles,
      sourceLabel,
      dateKey,
      sourceDate,
      aggregation: newsResult.aggregation,
      curation: newsResult.curation,
    });
    return {
      brief: await finalizeMorningBrief(fallbackBrief, dateKey, dateRange),
      source: newsResult.source === "cache" || matchesResult.source === "cache" ? "cache" : "fallback",
      diagnostics: [...matchesResult.diagnostics, ...newsResult.diagnostics],
    };
  }

  const matchesResult = await getAggregatedMatches(dateKey, options);
  const teamsInMatches = matchesResult.matches
    .flatMap((match) => [match.homeTeam, match.awayTeam])
    .filter((team) => team && team !== "待定")
    .slice(0, 6);
  const query = teamsInMatches.length
    ? `${defaultNewsQuery} OR (${teamsInMatches.join(" OR ")})`
    : defaultNewsQuery;
  const newsResult = await getAggregatedNews({
    query,
    limit: MORNING_BRIEF_NEWS_LIMIT,
    publishedAfter: newsWindow.start,
    useAi: options.useAi,
    cacheMode: options.cacheMode,
  });
  const successfulNewsSources = newsResult.diagnostics
    .filter((diagnostic) => diagnostic.ok)
    .map((diagnostic) => diagnostic.name);
  const sourceLabel = successfulNewsSources.length
    ? `${successfulNewsSources.join(" + ")} · 多源聚合`
    : matchesResult.source === "remote"
      ? "赛程远端源 · 新闻源为空"
      : "本地/数据库兜底";
  const matchBriefResult = await addAiMatchBriefsToMorningMatches({
    matches: matchesResult.matches,
    providers: aiProviders,
    primaryProviderId: primaryAiProviderId,
    disabled: options.useAi === false,
  });
  await persistCanonicalMatches(matchBriefResult.matches, "ai-match-briefs");
  const quoteResult = await getOrCreateMorningQuote({
    dateKey,
    dateRange,
    news: newsResult.articles,
    matches: matchBriefResult.matches,
    aiProviders,
    primaryAiProviderId,
    adminUpdatedAt: updatedAt,
    disabled: options.useAi === false,
  });
  const brief = buildMorningBrief({
    matches: matchBriefResult.matches,
    news: newsResult.articles,
    sourceLabel,
    dateKey,
    sourceDate,
    aggregation: newsResult.aggregation,
    curation: newsResult.curation,
    quote: quoteResult.quote,
    quoteHistory: quoteResult.history,
  });
  const diagnostics = [...matchesResult.diagnostics, ...newsResult.diagnostics];

  await upsertSnapshotCache({
    snapshotKey,
    feature: "morning",
    sourceMode: newsResult.source === "remote" || matchesResult.source === "remote" ? "remote" : "fallback",
    sourceId: "morning-aggregate",
    payload: morningBriefStoredPayload(brief),
    diagnostics,
    ttlSeconds: 900,
  });

  return {
    brief,
    source: newsResult.source === "remote" || matchesResult.source === "remote" ? "remote" : "fallback",
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// getDataSourceStatus
// ---------------------------------------------------------------------------

export async function getDataSourceStatus() {
  const { dataSources, updatedAt } = await readAdminConfig();
  const [latestUsageBySource, recentRuns] = await Promise.all([
    getLatestSourceUsageByIds(dataSources.map((source) => source.id)),
    listRecentIngestionRuns(300),
  ]);
  const latestRunByFeature = new Map<string, (typeof recentRuns)[number]>();
  for (const run of recentRuns) {
    if (!latestRunByFeature.has(run.feature)) latestRunByFeature.set(run.feature, run);
  }
  const now = new Date();
  return {
    updatedAt,
    sources: dataSources
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((source) => {
        const refreshPlan = getSourceRefreshPlan(source);
        const latestUsage = latestUsageBySource.get(source.id);
        const latestRun = latestRunByFeature.get(sourceFeature(source));
        const lastRefresh = latestDate(latestUsage?.fetchedAt, latestRun?.finishedAt || latestRun?.startedAt);
        const nextRefresh = lastRefresh
          ? new Date(lastRefresh.getTime() + refreshPlan.effectiveRefreshSeconds * 1000)
          : undefined;
        const latestFailure = latestRun?.status === "failed" ? latestRun : undefined;
        const health = !source.enabled
          ? "disabled"
          : latestFailure
            ? "failing"
            : nextRefresh && nextRefresh < now
              ? "stale"
              : lastRefresh
                ? "healthy"
                : "unknown";
        return {
          id: source.id,
          name: source.name,
          type: source.type,
          adapter: source.adapter,
          enabled: source.enabled,
          priority: source.priority,
          cacheTtlSeconds: source.cacheTtlSeconds,
          refreshSeconds: source.refreshSeconds,
          configuredRefreshSeconds: refreshPlan.configuredRefreshSeconds,
          effectiveRefreshSeconds: refreshPlan.effectiveRefreshSeconds,
          activityMode: refreshPlan.activityMode,
          activeMatchCount: refreshPlan.activeMatchCount,
          nextKickoffAt: refreshPlan.nextKickoffAt,
          health,
          lastRefreshAt: lastRefresh?.toISOString(),
          lastFetchAt: latestUsage?.fetchedAt.toISOString(),
          lastStatusCode: latestUsage?.statusCode,
          lastRunAt: latestRun?.finishedAt?.toISOString() || latestRun?.startedAt.toISOString(),
          lastRunStatus: latestRun?.status,
          lastFailureReason: latestFailure?.errorMessage || undefined,
          nextRefreshAt: nextRefresh?.toISOString(),
          ratePolicy: {
            docsUrl: refreshPlan.policy.docsUrl,
            officialLimit: refreshPlan.policy.officialLimit,
            officialWindowSeconds: refreshPlan.policy.officialWindowSeconds,
            dailyQuota: refreshPlan.policy.dailyQuota,
            monthlyQuota: refreshPlan.policy.monthlyQuota,
            quotaSafetyRatio: refreshPlan.policy.quotaSafetyRatio,
            note: refreshPlan.policy.note,
          },
          hasApiKey: Boolean(source.apiKey),
          baseUrl: source.baseUrl,
          endpointPath: source.endpointPath,
        };
      }),
  };
}
