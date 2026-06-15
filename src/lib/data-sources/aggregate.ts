import { createHash } from "node:crypto";
import { readAdminConfig, type DataSourceConfig } from "@/lib/admin/config";
import { curateNewsWithAi, type AiNewsCuration } from "@/lib/ai/news-curation";
import {
  fetchJsonFromSource,
  fetchTextFromSource,
  sortEnabledSources,
  type SourceDiagnostic,
} from "@/lib/data-sources/client";
import { getEffectiveRefreshSeconds, getSourceRefreshPlan } from "@/lib/data-sources/rate-policy";
import {
  getLatestSourceUsageByIds,
  readLatestSnapshotCache,
  readSnapshotCache,
  upsertSnapshotCache,
} from "@/lib/db/queries/data-cache";
import { listRecentIngestionRuns } from "@/lib/db/queries/ingestion-runs";
import {
  readLatestOddsMarketSnapshots,
  readLatestRadarMarketSnapshots,
  recordOddsMarketSnapshots,
  recordRadarMarketSnapshots,
} from "@/lib/db/queries/market-snapshots";
import {
  getCanonicalNewsArticlesByIds,
  upsertCanonicalNewsArticles,
} from "@/lib/db/queries/news-articles";
import { getStoredOfficialMatches } from "@/lib/db/queries/world-cup";
import { teamsWithBuiltInProfilesFromOfficialSchedule } from "@/lib/team-profiles";
import {
  fifaMatchesInUtcDayBounds,
  fifaRecordToMatch,
  scheduleDateMeta,
  type FifaScheduleRecord,
  type Match,
  type MatchEvent,
  type MatchLineup,
  type MatchPrediction,
  type MatchStatistic,
  type MatchStatus,
  type MorningBrief,
  type NewsAggregationMeta,
  type NewsArticle,
  type OddsMatch,
  type RadarMatch,
  type ScheduleDateKey,
  type ScheduleUtcDayBounds,
  type SignalType,
  type Team,
  type TeamInjury,
} from "@/lib/wc-data";

interface OpenFootballWorldCup {
  name: string;
  matches: Array<{
    round?: string;
    date?: string;
    time?: string;
    team1?: string;
    team2?: string;
    group?: string;
    ground?: string;
    score?: { ft?: [number, number] };
  }>;
}

interface PolymarketEvent {
  id?: string;
  title?: string;
  slug?: string;
  volume?: string | number;
  volume24hr?: string | number;
  markets?: Array<{
    id?: string;
    question?: string;
    outcomes?: string;
    outcomePrices?: string;
    volume?: string;
    groupItemTitle?: string;
    bestBid?: number;
    bestAsk?: number;
    lastTradePrice?: number;
    active?: boolean;
    closed?: boolean;
  }>;
}

interface FootballDataMatchesResponse {
  matches?: Array<{
    id?: number;
    utcDate?: string;
    status?: string;
    stage?: string;
    group?: string | null;
    matchday?: number | null;
    venue?: string | null;
    homeTeam?: { id?: number; name?: string; shortName?: string; tla?: string; crest?: string };
    awayTeam?: { id?: number; name?: string; shortName?: string; tla?: string; crest?: string };
    score?: {
      fullTime?: { home?: number | null; away?: number | null };
    };
  }>;
}

interface FootballDataTeamsResponse {
  teams?: Array<{
    id?: number;
    name?: string;
    shortName?: string;
    tla?: string;
    crest?: string;
    coach?: { name?: string };
  }>;
}

interface ApiFootballResponse<T> {
  response?: T[];
}

interface ApiFootballFixture {
  fixture?: {
    id?: number;
    date?: string;
    venue?: { name?: string; city?: string };
    status?: { short?: string; long?: string; elapsed?: number | null };
  };
  league?: {
    round?: string;
  };
  teams?: {
    home?: { id?: number; name?: string; logo?: string };
    away?: { id?: number; name?: string; logo?: string };
  };
  goals?: { home?: number | null; away?: number | null };
  score?: {
    fulltime?: { home?: number | null; away?: number | null };
  };
  events?: ApiFootballEvent[];
  lineups?: ApiFootballLineup[];
  statistics?: ApiFootballStatisticGroup[];
}

interface ApiFootballEvent {
  time?: { elapsed?: number | null; extra?: number | null };
  team?: { id?: number; name?: string };
  player?: { id?: number; name?: string };
  assist?: { id?: number; name?: string };
  type?: string;
  detail?: string;
  comments?: string | null;
}

interface ApiFootballLineup {
  team?: { id?: number; name?: string };
  coach?: { id?: number; name?: string };
  formation?: string;
  startXI?: Array<{ player?: ApiFootballLineupPlayer }>;
  substitutes?: Array<{ player?: ApiFootballLineupPlayer }>;
}

interface ApiFootballLineupPlayer {
  id?: number;
  name?: string;
  number?: number;
  pos?: string;
}

interface ApiFootballStatisticGroup {
  team?: { id?: number; name?: string };
  statistics?: Array<{ type?: string; value?: string | number | null }>;
}

interface ApiFootballTeamResponse {
  team?: {
    id?: number;
    name?: string;
    code?: string;
    country?: string;
    logo?: string;
  };
}

interface ApiFootballOddsResponse {
  response?: ApiFootballOddsRecord[];
}

interface ApiFootballOddsRecord {
  fixture?: {
    id?: number;
    date?: string;
  };
  update?: string;
  bookmakers?: Array<{
    id?: number;
    name?: string;
    bets?: Array<{
      id?: number;
      name?: string;
      values?: Array<{
        value?: string;
        odd?: string | number;
      }>;
    }>;
  }>;
}

interface ApiFootballLiveOddsResponse {
  response?: ApiFootballLiveOddsRecord[];
}

interface ApiFootballLiveOddsRecord {
  fixture?: {
    id?: number;
    date?: string;
  };
  league?: {
    id?: number;
    season?: number;
  };
  update?: string;
  bet?: {
    id?: number;
    name?: string;
  };
  odds?: Array<{
    value?: string;
    odd?: string | number;
  }>;
}

interface ApiFootballPredictionResponse {
  response?: Array<{
    predictions?: {
      winner?: { id?: number | null; name?: string | null; comment?: string | null };
      win_or_draw?: boolean;
      under_over?: string | null;
      goals?: { home?: string | null; away?: string | null };
      advice?: string | null;
      percent?: { home?: string; draw?: string; away?: string };
    };
    teams?: {
      home?: { id?: number; name?: string; logo?: string };
      away?: { id?: number; name?: string; logo?: string };
    };
    fixture?: { id?: number };
  }>;
}

interface ApiFootballStandingsResponse {
  response?: Array<{
    league?: {
      standings?: Array<Array<ApiFootballStandingRow>>;
    };
  }>;
}

interface ApiFootballStandingRow {
  rank?: number;
  team?: { id?: number; name?: string; logo?: string };
  points?: number;
  goalsDiff?: number;
  group?: string;
  form?: string;
  status?: string;
  description?: string;
  all?: {
    played?: number;
    win?: number;
    draw?: number;
    lose?: number;
    goals?: { for?: number; against?: number };
  };
}

interface ApiFootballSquadResponse {
  response?: Array<{
    team?: { id?: number; name?: string; logo?: string };
    players?: Array<{
      id?: number;
      name?: string;
      age?: number;
      number?: number;
      position?: string;
      photo?: string;
    }>;
  }>;
}

interface ApiFootballInjuryResponse {
  response?: Array<{
    player?: { id?: number; name?: string; photo?: string; type?: string; reason?: string };
    team?: { id?: number; name?: string; logo?: string };
    fixture?: { id?: number; date?: string };
    league?: { id?: number; season?: number };
  }>;
}

interface WorldCupApiFixture {
  id?: number;
  date?: string;
  time?: string;
  location?: string;
  round?: string;
  group_id?: number;
  home?: { id?: number; name?: string; logo?: string };
  away?: { id?: number; name?: string; logo?: string };
  odds?: { pre?: { "1"?: number | null; "2"?: number | null; X?: number | null } };
}

interface TheSportsDbEventsResponse {
  events?: Array<{
    idEvent?: string;
    dateEvent?: string;
    strTime?: string;
    strStatus?: string;
    strGroup?: string;
    intRound?: string;
    strVenue?: string;
    strCity?: string;
    strHomeTeam?: string;
    strAwayTeam?: string;
    intHomeScore?: string | null;
    intAwayScore?: string | null;
  }> | null;
}

interface TheSportsDbTeamsResponse {
  teams?: Array<{
    idTeam?: string;
    strTeam?: string;
    strTeamShort?: string;
    strCountry?: string;
    strBadge?: string;
    strManager?: string;
    strDescriptionEN?: string;
  }> | null;
}

interface TheOddsApiEvent {
  id?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{
    title?: string;
    last_update?: string;
    markets?: Array<{
      key?: string;
      outcomes?: Array<{ name?: string; price?: number }>;
    }>;
  }>;
}

interface OddsApiIoEvent {
  id?: string | number;
  home?: string;
  away?: string;
  date?: string;
  status?: string;
  bookmakers?: Record<string, Array<{
    name?: string;
    updatedAt?: string;
    odds?: Array<{
      home?: string | number;
      draw?: string | number;
      away?: string | number;
    }>;
  }>>;
}

interface GdeltDocResponse {
  articles?: Array<{
    url?: string;
    title?: string;
    seendate?: string;
    socialimage?: string;
    domain?: string;
    language?: string;
    sourcecountry?: string;
  }>;
}

interface NewsApiResponse {
  status?: string;
  totalResults?: number;
  articles?: Array<{
    source?: {
      id?: string | null;
      name?: string;
    };
    title?: string;
    description?: string | null;
    url?: string;
    urlToImage?: string | null;
    publishedAt?: string;
    content?: string | null;
  }>;
}

interface CurrentsApiResponse {
  status?: string;
  page?: number;
  next_cursor?: string | null;
  news?: Array<{
    id?: string;
    title?: string;
    description?: string | null;
    url?: string;
    author?: string | null;
    image?: string | null;
    language?: string;
    category?: string[];
    source_category?: string[];
    published?: string;
  }>;
}

interface EspnSiteNewsResponse {
  header?: string;
  articles?: Array<{
    id?: number | string;
    nowId?: string;
    type?: string;
    headline?: string;
    description?: string;
    lastModified?: string;
    published?: string;
    images?: Array<{
      url?: string;
      type?: string;
      name?: string;
      caption?: string;
    }>;
    categories?: Array<{
      type?: string;
      description?: string;
    }>;
    links?: {
      web?: {
        href?: string;
      };
      mobile?: {
        href?: string;
      };
    };
  }>;
}

const teamZh: Record<string, { name: string; flag: string }> = {
  Algeria: { name: "阿尔及利亚", flag: "🇩🇿" },
  Austria: { name: "奥地利", flag: "🇦🇹" },
  Australia: { name: "澳大利亚", flag: "🇦🇺" },
  Belgium: { name: "比利时", flag: "🇧🇪" },
  "Bosnia-Herzegovina": { name: "波黑", flag: "🇧🇦" },
  "Bosnia & Herzegovina": { name: "波黑", flag: "🇧🇦" },
  "Cape Verde": { name: "佛得角", flag: "🇨🇻" },
  "Cape Verde Islands": { name: "佛得角", flag: "🇨🇻" },
  "Cabo Verde": { name: "佛得角", flag: "🇨🇻" },
  Colombia: { name: "哥伦比亚", flag: "🇨🇴" },
  Croatia: { name: "克罗地亚", flag: "🇭🇷" },
  Curacao: { name: "库拉索", flag: "🇨🇼" },
  Curaçao: { name: "库拉索", flag: "🇨🇼" },
  "Côte d’Ivoire": { name: "科特迪瓦", flag: "🇨🇮" },
  "Côte d'Ivoire": { name: "科特迪瓦", flag: "🇨🇮" },
  Ecuador: { name: "厄瓜多尔", flag: "🇪🇨" },
  Egypt: { name: "埃及", flag: "🇪🇬" },
  England: { name: "英格兰", flag: "🏴" },
  Ghana: { name: "加纳", flag: "🇬🇭" },
  Haiti: { name: "海地", flag: "🇭🇹" },
  Iran: { name: "伊朗", flag: "🇮🇷" },
  Iraq: { name: "伊拉克", flag: "🇮🇶" },
  Jordan: { name: "约旦", flag: "🇯🇴" },
  "New Zealand": { name: "新西兰", flag: "🇳🇿" },
  Norway: { name: "挪威", flag: "🇳🇴" },
  Panama: { name: "巴拿马", flag: "🇵🇦" },
  Paraguay: { name: "巴拉圭", flag: "🇵🇾" },
  Portugal: { name: "葡萄牙", flag: "🇵🇹" },
  Qatar: { name: "卡塔尔", flag: "🇶🇦" },
  "Saudi Arabia": { name: "沙特阿拉伯", flag: "🇸🇦" },
  Scotland: { name: "苏格兰", flag: "🏴" },
  Senegal: { name: "塞内加尔", flag: "🇸🇳" },
  Sweden: { name: "瑞典", flag: "🇸🇪" },
  Switzerland: { name: "瑞士", flag: "🇨🇭" },
  Tunisia: { name: "突尼斯", flag: "🇹🇳" },
  Turkey: { name: "土耳其", flag: "🇹🇷" },
  Türkiye: { name: "土耳其", flag: "🇹🇷" },
  Uruguay: { name: "乌拉圭", flag: "🇺🇾" },
  Uzbekistan: { name: "乌兹别克斯坦", flag: "🇺🇿" },
  Mexico: { name: "墨西哥", flag: "🇲🇽" },
  "South Africa": { name: "南非", flag: "🇿🇦" },
  "South Korea": { name: "韩国", flag: "🇰🇷" },
  "Czech Republic": { name: "捷克", flag: "🇨🇿" },
  Czechia: { name: "捷克", flag: "🇨🇿" },
  Canada: { name: "加拿大", flag: "🇨🇦" },
  Netherlands: { name: "荷兰", flag: "🇳🇱" },
  Argentina: { name: "阿根廷", flag: "🇦🇷" },
  Brazil: { name: "巴西", flag: "🇧🇷" },
  France: { name: "法国", flag: "🇫🇷" },
  Germany: { name: "德国", flag: "🇩🇪" },
  Spain: { name: "西班牙", flag: "🇪🇸" },
  Morocco: { name: "摩洛哥", flag: "🇲🇦" },
  Japan: { name: "日本", flag: "🇯🇵" },
  "Congo DR": { name: "刚果民主共和国", flag: "🇨🇩" },
  "DR Congo": { name: "刚果民主共和国", flag: "🇨🇩" },
  "Ivory Coast": { name: "科特迪瓦", flag: "🇨🇮" },
  "United States": { name: "美国", flag: "🇺🇸" },
  USA: { name: "美国", flag: "🇺🇸" },
};

const englishNameByZh = new Map(
  Object.entries(teamZh).map(([english, display]) => [display.name, english]),
);

const defaultNewsQuery = `"World Cup 2026" football OR "FIFA World Cup"`;
export const MAX_AGGREGATED_NEWS_LIMIT = 60;
export const MORNING_BRIEF_NEWS_LIMIT = 60;
export const NEWS_TRANSLATION_LIMIT = 30;

type NewsSnapshotPayload = {
  articles: NewsArticle[];
  articleIds?: string[];
  aggregation: NewsAggregationMeta;
  curation?: AiNewsCuration;
  diagnostics: SourceDiagnostic[];
};

type MorningBriefStoredPayload = MorningBrief | {
  schemaVersion: 2;
  brief: Omit<MorningBrief, "news">;
  articleIds: string[];
  newsPreview: NewsArticle[];
};

function sourceDateFor(
  dateKey: ScheduleDateKey,
  options?: Pick<AggregationReadOptions, "sourceDate" | "dateRange">,
): string {
  return options?.sourceDate || options?.dateRange?.date || scheduleDateMeta[dateKey].date;
}

function utcDayBoundsForBeijingDate(date: string): ScheduleUtcDayBounds {
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    date,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

function dateRangeFor(
  dateKey: ScheduleDateKey,
  options?: Pick<AggregationReadOptions, "dateRange" | "sourceDate">,
): ScheduleUtcDayBounds {
  return options?.dateRange || utcDayBoundsForBeijingDate(sourceDateFor(dateKey, options));
}

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

function matchInDateRange(match: Pick<Match, "kickoffAt">, bounds: ScheduleUtcDayBounds): boolean {
  const kickoffMs = Date.parse(match.kickoffAt || "");
  const startMs = Date.parse(bounds.startUtc);
  const endMs = Date.parse(bounds.endUtc);
  return Number.isFinite(kickoffMs)
    && Number.isFinite(startMs)
    && Number.isFinite(endMs)
    && kickoffMs >= startMs
    && kickoffMs < endMs;
}

function uniqueMatches(matches: Match[]): Match[] {
  const unique = new Map<string, Match>();
  for (const match of matches) {
    unique.set(match.id || `${match.homeTeam}:${match.awayTeam}:${match.kickoffAt || match.kickoffBj}`, match);
  }
  return Array.from(unique.values());
}

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

function getTeam(input: string | undefined) {
  if (!input) return { name: "待定", flag: "🏳️" };
  return teamZh[input] || { name: input, flag: "🏳️" };
}

function canonicalTeamName(input: string | undefined): string {
  const english = input ? englishNameByZh.get(input) || input : "";
  const normalized = english
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(fc|cf|national team)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, string> = {
    caboverde: "capeverde",
    capeverdeislands: "capeverde",
  };
  return aliases[normalized] || normalized;
}

function formatKickoffBj(input: string | undefined): string {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${value("month")}-${value("day")} ${value("hour")}:${value("minute")}`;
}

function matchStatus(input: string | undefined, hasScore = false): MatchStatus {
  const status = String(input || "").toUpperCase();
  if (["FINISHED", "FT", "AET", "PEN", "MATCH FINISHED"].includes(status) || hasScore) {
    return "finished";
  }
  if (["IN_PLAY", "PAUSED", "LIVE", "1H", "2H", "HT"].includes(status)) return "live";
  return "upcoming";
}

function roundFromStage(stage: string | undefined, matchday?: number | null): string {
  const labels: Record<string, string> = {
    GROUP_STAGE: matchday ? `小组赛第 ${matchday} 轮` : "小组赛",
    LAST_32: "三十二强",
    LAST_16: "十六强",
    QUARTER_FINALS: "四分之一决赛",
    SEMI_FINALS: "半决赛",
    THIRD_PLACE: "三四名决赛",
    FINAL: "决赛",
  };
  return labels[String(stage || "").toUpperCase()] || stage || "世界杯";
}

function parseKickoffToBeijing(date: string | undefined, time: string | undefined): string {
  const kickoffUtc = parseOpenFootballKickoffUtc(date, time);
  if (kickoffUtc) return formatKickoffBj(kickoffUtc);
  if (!date || !time) return "";
  return `${date} ${time}`;
}

function parseOpenFootballKickoffUtc(date: string | undefined, time: string | undefined): string | undefined {
  if (!date || !time) return undefined;
  const match = time.match(/^(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})$/);
  if (!match) return undefined;
  const [, hour, minute, offset] = match;
  const utcMs =
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      Number(hour),
      Number(minute),
    ) -
    Number(offset) * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

function transformOpenFootballMatches(
  data: OpenFootballWorldCup,
  dateKey: ScheduleDateKey,
  sourceDate = sourceDateFor(dateKey),
  dateRange = dateRangeFor(dateKey, { sourceDate }),
): Match[] {
  return data.matches
    .map((match, index) => {
      const home = getTeam(match.team1);
      const away = getTeam(match.team2);
      const score = match.score?.ft;
      const status: MatchStatus = score ? "finished" : "upcoming";
      const kickoffAt = parseOpenFootballKickoffUtc(match.date, match.time);
      return {
        id: `openfootball-${sourceDate}-${index + 1}`,
        homeTeam: home.name,
        awayTeam: away.name,
        homeFlag: home.flag,
        awayFlag: away.flag,
        homeScore: score?.[0] ?? null,
        awayScore: score?.[1] ?? null,
        kickoffAt,
        kickoffBj: parseKickoffToBeijing(match.date, match.time),
        group: (match.group || "").replace("Group", "").trim()
          ? `${(match.group || "").replace("Group", "").trim()} 组`
          : "世界杯",
        round: match.round || "赛程",
        status,
        signal: "none" as SignalType,
        signalText: "",
        homeWinProb: 0,
        drawProb: 0,
        awayWinProb: 0,
        oddsImpliedHome: 0,
        oddsImpliedDraw: 0,
        oddsImpliedAway: 0,
        venue: match.ground || "",
        previewText: "赛程来自 OpenFootball 免费 JSON。市场概率会由 Polymarket 源单独补充。",
        updatedAt: "OpenFootball · 缓存数据",
        events: [],
      };
    })
    .filter((match) => matchInDateRange(match, dateRange))
    .slice(0, 8);
}

function transformFootballDataMatches(
  data: FootballDataMatchesResponse,
  dateKey: ScheduleDateKey,
  sourceDate = sourceDateFor(dateKey),
  dateRange = dateRangeFor(dateKey, { sourceDate }),
): Match[] {
  return (data.matches || [])
    .map((match) => {
      const home = getTeam(match.homeTeam?.name || match.homeTeam?.shortName);
      const away = getTeam(match.awayTeam?.name || match.awayTeam?.shortName);
      const homeScore = match.score?.fullTime?.home ?? null;
      const awayScore = match.score?.fullTime?.away ?? null;
      const hasScore = homeScore !== null && awayScore !== null;
      return {
        id: `football-data-${match.id}`,
        homeTeam: home.name,
        awayTeam: away.name,
        homeFlag: home.flag,
        awayFlag: away.flag,
        homeScore,
        awayScore,
        kickoffAt: match.utcDate,
        kickoffBj: formatKickoffBj(match.utcDate),
        group: match.group ? `${match.group.replace(/^GROUP_?/, "")} 组` : "世界杯",
        round: roundFromStage(match.stage, match.matchday),
        status: matchStatus(match.status, hasScore),
        signal: "none" as SignalType,
        signalText: "",
        homeWinProb: 0,
        drawProb: 0,
        awayWinProb: 0,
        oddsImpliedHome: 0,
        oddsImpliedDraw: 0,
        oddsImpliedAway: 0,
        venue: match.venue || "",
        previewText: "",
        updatedAt: "football-data.org",
        events: [],
      };
    })
    .filter((match) => matchInDateRange(match, dateRange));
}

function apiFootballMatchStatus(status: string | undefined): MatchStatus {
  const value = String(status || "").toUpperCase();
  if (["FT", "AET", "PEN"].includes(value)) return "finished";
  if (["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"].includes(value)) return "live";
  return "upcoming";
}

function apiFootballRoundLabel(round: string | undefined): string {
  const value = String(round || "");
  if (/group stage/i.test(value)) {
    const matchday = value.match(/(\d+)$/)?.[1];
    return matchday ? `小组赛第 ${matchday} 轮` : "小组赛";
  }
  const labels: Array<[RegExp, string]> = [
    [/round of 32/i, "三十二强"],
    [/round of 16/i, "十六强"],
    [/quarter/i, "四分之一决赛"],
    [/semi/i, "半决赛"],
    [/third|bronze/i, "三四名决赛"],
    [/final/i, "决赛"],
  ];
  return labels.find(([pattern]) => pattern.test(value))?.[1] || value || "世界杯";
}

function apiFootballEventType(event: ApiFootballEvent): MatchEvent["type"] | undefined {
  const type = String(event.type || "").toLowerCase();
  const detail = String(event.detail || "").toLowerCase();
  if (type === "goal" && detail.includes("own")) return "og";
  if (type === "goal" && detail.includes("penalty")) return "penalty";
  if (type === "goal") return "goal";
  if (type === "card" && detail.includes("red")) return "red";
  if (type === "card" && detail.includes("yellow")) return "yellow";
  return undefined;
}

function apiFootballTeamSide(teamId: number | undefined, fixture: ApiFootballFixture): "home" | "away" {
  return teamId && teamId === fixture.teams?.away?.id ? "away" : "home";
}

function transformApiFootballEvents(fixture: ApiFootballFixture): MatchEvent[] {
  return (fixture.events || []).flatMap((event) => {
    const type = apiFootballEventType(event);
    if (!type) return [];
    const minute = Number(event.time?.elapsed || 0) + Number(event.time?.extra || 0);
    return [{
      minute: Number.isFinite(minute) && minute > 0 ? minute : 0,
      type,
      player: event.player?.name || "Unknown",
      team: apiFootballTeamSide(event.team?.id, fixture),
      description: [event.detail, event.assist?.name ? `Assist: ${event.assist.name}` : "", event.comments || ""]
        .filter(Boolean)
        .join(" · "),
    }];
  });
}

function transformApiFootballLineups(fixture: ApiFootballFixture): MatchLineup[] {
  return (fixture.lineups || []).map((lineup) => {
    const player = (item: { player?: ApiFootballLineupPlayer }): MatchLineup["startXI"][number] => ({
      id: item.player?.id,
      name: item.player?.name || "Unknown",
      number: item.player?.number,
      position: item.player?.pos,
    });
    return {
      team: apiFootballTeamSide(lineup.team?.id, fixture),
      teamName: getTeam(lineup.team?.name).name,
      formation: lineup.formation,
      coach: lineup.coach?.name,
      startXI: (lineup.startXI || []).map(player).filter((item) => item.name !== "Unknown"),
      substitutes: (lineup.substitutes || []).map(player).filter((item) => item.name !== "Unknown"),
    };
  });
}

function transformApiFootballStatistics(fixture: ApiFootballFixture): MatchStatistic[] {
  return (fixture.statistics || []).map((group) => ({
    team: apiFootballTeamSide(group.team?.id, fixture),
    teamName: getTeam(group.team?.name).name,
    stats: (group.statistics || [])
      .filter((stat) => stat.type)
      .map((stat) => ({
        type: String(stat.type),
        value: stat.value ?? null,
      })),
  }));
}

function apiFootballPreview(lineups: MatchLineup[], statistics: MatchStatistic[]): string {
  const parts: string[] = [];
  const formations = lineups
    .filter((lineup) => lineup.formation)
    .map((lineup) => `${lineup.teamName} ${lineup.formation}`);
  if (formations.length) parts.push(`首发阵型：${formations.join("；")}。`);

  const statTypes = ["Shots on Goal", "Shots off Goal", "Ball Possession", "Total passes"];
  const statSummary = statistics
    .flatMap((teamStats) =>
      statTypes.flatMap((type) => {
        const value = teamStats.stats.find((stat) => stat.type === type)?.value;
        return value === null || value === undefined ? [] : `${teamStats.teamName} ${type}: ${value}`;
      }),
    )
    .slice(0, 8);
  if (statSummary.length) parts.push(`技术统计：${statSummary.join("；")}。`);
  return parts.join(" ");
}

function apiFootballFixtureIdFromMatchId(id: string): number | undefined {
  const value = Number(id.replace(/^api-football-/, ""));
  return Number.isFinite(value) ? value : undefined;
}

function parsePercentValue(input: string | number | undefined): number {
  const value = typeof input === "number" ? input : Number(String(input || "").replace("%", "").trim());
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function normalizePredictionPercent(input: ApiFootballPredictionResponse["response"]): Map<number, MatchPrediction> {
  const predictions = new Map<number, MatchPrediction>();
  for (const item of input || []) {
    const fixtureId = item.fixture?.id;
    if (!fixtureId) continue;
    const home = parsePercentValue(item.predictions?.percent?.home);
    const draw = parsePercentValue(item.predictions?.percent?.draw);
    const away = parsePercentValue(item.predictions?.percent?.away);
    const winnerName = item.predictions?.winner?.name || undefined;
    const homeName = item.teams?.home?.name || "";
    const awayName = item.teams?.away?.name || "";
    const winnerKey = canonicalTeamName(winnerName);
    const winnerSide = winnerKey && winnerKey === canonicalTeamName(homeName)
      ? "home"
      : winnerKey && winnerKey === canonicalTeamName(awayName)
        ? "away"
        : !winnerName && draw >= home && draw >= away
          ? "draw"
          : undefined;
    predictions.set(fixtureId, {
      source: "API-Football Pro · Predictions",
      winnerName,
      winnerSide,
      advice: item.predictions?.advice || item.predictions?.winner?.comment || undefined,
      homePercent: home,
      drawPercent: draw,
      awayPercent: away,
    });
  }
  return predictions;
}

function transformApiFootballMatches(
  data: ApiFootballResponse<ApiFootballFixture>,
  dateKey: ScheduleDateKey,
  sourceDate = sourceDateFor(dateKey),
  dateRange = dateRangeFor(dateKey, { sourceDate }),
  predictionsByFixtureId = new Map<number, MatchPrediction>(),
): Match[] {
  return (data.response || [])
    .map((fixture) => {
      const home = getTeam(fixture.teams?.home?.name);
      const away = getTeam(fixture.teams?.away?.name);
      const status = apiFootballMatchStatus(fixture.fixture?.status?.short);
      const homeScore = fixture.goals?.home ?? fixture.score?.fulltime?.home ?? null;
      const awayScore = fixture.goals?.away ?? fixture.score?.fulltime?.away ?? null;
      const lineups = transformApiFootballLineups(fixture);
      const statistics = transformApiFootballStatistics(fixture);
      const events = transformApiFootballEvents(fixture);
      const fixtureId = fixture.fixture?.id;
      const prediction = fixtureId ? predictionsByFixtureId.get(fixtureId) : undefined;
      const venue = [fixture.fixture?.venue?.name, fixture.fixture?.venue?.city].filter(Boolean).join("，");
      const elapsed = fixture.fixture?.status?.elapsed ? ` · ${fixture.fixture.status.elapsed}'` : "";
      const predictionText = prediction?.advice ? ` 预测：${prediction.advice}。` : "";
      return {
        id: `api-football-${fixtureId}`,
        providerFixtureId: fixtureId,
        homeTeam: home.name,
        awayTeam: away.name,
        homeFlag: home.flag,
        awayFlag: away.flag,
        homeScore,
        awayScore,
        kickoffAt: fixture.fixture?.date,
        kickoffBj: formatKickoffBj(fixture.fixture?.date),
        group: "世界杯",
        round: apiFootballRoundLabel(fixture.league?.round),
        status,
        signal: "none" as SignalType,
        signalText: "",
        homeWinProb: 0,
        drawProb: 0,
        awayWinProb: 0,
        oddsImpliedHome: 0,
        oddsImpliedDraw: 0,
        oddsImpliedAway: 0,
        venue,
        previewText: `${apiFootballPreview(lineups, statistics)}${predictionText}`.trim(),
        updatedAt: `API-Football Pro${elapsed}`,
        events,
        lineups,
        statistics,
        prediction,
      };
    })
    .filter((match) => matchInDateRange(match, dateRange));
}

function mergeApiFootballFixtureDetails(
  baseData: ApiFootballResponse<ApiFootballFixture>,
  detailData?: ApiFootballResponse<ApiFootballFixture>,
): ApiFootballResponse<ApiFootballFixture> {
  if (!detailData?.response?.length) return baseData;
  const detailsById = new Map(
    detailData.response
      .filter((fixture) => fixture.fixture?.id)
      .map((fixture) => [fixture.fixture?.id, fixture]),
  );
  return {
    response: (baseData.response || []).map((fixture) => ({
      ...fixture,
      ...(detailsById.get(fixture.fixture?.id) || {}),
    })),
  };
}

function transformWorldCupApiMatches(
  data: unknown,
  dateKey: ScheduleDateKey,
  sourceDate = sourceDateFor(dateKey),
  dateRange = dateRangeFor(dateKey, { sourceDate }),
): Match[] {
  const fixtures = Array.isArray(data)
    ? data as WorldCupApiFixture[]
    : typeof data === "object" && data !== null && Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: WorldCupApiFixture[] }).data
      : [];
  return fixtures
    .map((fixture) => {
      const home = getTeam(fixture.home?.name);
      const away = getTeam(fixture.away?.name);
      const kickoffAt = fixture.date && fixture.time
        ? `${fixture.date}T${fixture.time.replace(/Z$/, "")}Z`
        : fixture.date;
      return {
        id: `worldcupapi-${fixture.id}`,
        homeTeam: home.name,
        awayTeam: away.name,
        homeFlag: home.flag,
        awayFlag: away.flag,
        homeScore: null,
        awayScore: null,
        kickoffAt,
        kickoffBj: formatKickoffBj(kickoffAt),
        group: fixture.group_id ? `Group ${fixture.group_id}` : "世界杯",
        round: fixture.round ? `小组赛第 ${fixture.round} 轮` : "世界杯",
        status: "upcoming" as MatchStatus,
        signal: "none" as SignalType,
        signalText: "",
        homeWinProb: 0,
        drawProb: 0,
        awayWinProb: 0,
        oddsImpliedHome: 0,
        oddsImpliedDraw: 0,
        oddsImpliedAway: 0,
        venue: fixture.location || "",
        previewText: "",
        updatedAt: "WorldCupAPI.com",
        events: [],
      };
    })
    .filter((match) => matchInDateRange(match, dateRange));
}

function transformTheSportsDbMatches(
  data: TheSportsDbEventsResponse,
  dateKey: ScheduleDateKey,
  sourceDate = sourceDateFor(dateKey),
  dateRange = dateRangeFor(dateKey, { sourceDate }),
): Match[] {
  return (data.events || [])
    .map((event) => {
      const home = getTeam(event.strHomeTeam);
      const away = getTeam(event.strAwayTeam);
      const homeScore = event.intHomeScore === null || event.intHomeScore === undefined
        ? null
        : Number(event.intHomeScore);
      const awayScore = event.intAwayScore === null || event.intAwayScore === undefined
        ? null
        : Number(event.intAwayScore);
      const hasScore = Number.isFinite(homeScore) && Number.isFinite(awayScore);
      const kickoffAt = event.dateEvent && event.strTime
        ? `${event.dateEvent}T${event.strTime.replace(/Z$/, "")}Z`
        : event.dateEvent;
      return {
        id: `thesportsdb-${event.idEvent}`,
        homeTeam: home.name,
        awayTeam: away.name,
        homeFlag: home.flag,
        awayFlag: away.flag,
        homeScore: hasScore ? homeScore : null,
        awayScore: hasScore ? awayScore : null,
        kickoffAt,
        kickoffBj: formatKickoffBj(kickoffAt),
        group: event.strGroup || "世界杯",
        round: event.intRound ? `第 ${event.intRound} 轮` : "世界杯",
        status: matchStatus(event.strStatus, hasScore),
        signal: "none" as SignalType,
        signalText: "",
        homeWinProb: 0,
        drawProb: 0,
        awayWinProb: 0,
        oddsImpliedHome: 0,
        oddsImpliedDraw: 0,
        oddsImpliedAway: 0,
        venue: [event.strVenue, event.strCity].filter(Boolean).join("，"),
        previewText: "",
        updatedAt: "TheSportsDB",
        events: [],
      };
    })
    .filter((match) => matchInDateRange(match, dateRange));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function normalizedOddsProbability(homeOdds: number, drawOdds: number, awayOdds: number) {
  const rawHome = 1 / homeOdds;
  const rawDraw = 1 / drawOdds;
  const rawAway = 1 / awayOdds;
  const total = rawHome + rawDraw + rawAway;
  if (!Number.isFinite(total) || total <= 0) return undefined;
  return {
    home: Math.round((rawHome / total) * 100),
    draw: Math.round((rawDraw / total) * 100),
    away: Math.round((rawAway / total) * 100),
  };
}

function parseOddValue(value: string | number | undefined): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value || "").trim());
  return Number.isFinite(parsed) && parsed > 1 ? parsed : undefined;
}

function isMatchWinnerMarket(name: string | undefined): boolean {
  return /match winner|1x2|winner|full time result/i.test(String(name || ""));
}

function oddsSideLabel(
  label: string | undefined,
  homeName: string,
  awayName: string,
): "home" | "draw" | "away" | undefined {
  const value = canonicalTeamName(label);
  if (!value) return undefined;
  if (["home", "1"].includes(value) || value === canonicalTeamName(homeName)) return "home";
  if (["draw", "x"].includes(value)) return "draw";
  if (["away", "2"].includes(value) || value === canonicalTeamName(awayName)) return "away";
  return undefined;
}

function addOddsTriple(
  values: Array<{ value?: string; odd?: string | number }> | undefined,
  fixture: ApiFootballFixture,
  output: {
    homeOddsValues: number[];
    drawOddsValues: number[];
    awayOddsValues: number[];
    homeProbValues: number[];
    drawProbValues: number[];
    awayProbValues: number[];
  },
): boolean {
  const homeName = fixture.teams?.home?.name || "";
  const awayName = fixture.teams?.away?.name || "";
  let homeOdds: number | undefined;
  let drawOdds: number | undefined;
  let awayOdds: number | undefined;
  for (const item of values || []) {
    const side = oddsSideLabel(item.value, homeName, awayName);
    const odd = parseOddValue(item.odd);
    if (!side || !odd) continue;
    if (side === "home") homeOdds = odd;
    if (side === "draw") drawOdds = odd;
    if (side === "away") awayOdds = odd;
  }
  if (!homeOdds || !drawOdds || !awayOdds) return false;
  const probabilities = normalizedOddsProbability(homeOdds, drawOdds, awayOdds);
  if (!probabilities) return false;
  output.homeOddsValues.push(homeOdds);
  output.drawOddsValues.push(drawOdds);
  output.awayOddsValues.push(awayOdds);
  output.homeProbValues.push(probabilities.home);
  output.drawProbValues.push(probabilities.draw);
  output.awayProbValues.push(probabilities.away);
  return true;
}

function buildApiFootballOddsMatch(input: {
  fixture: ApiFootballFixture;
  fixtureId: number;
  sourceLabel: string;
  updateTimes: string[];
  homeOddsValues: number[];
  drawOddsValues: number[];
  awayOddsValues: number[];
  homeProbValues: number[];
  drawProbValues: number[];
  awayProbValues: number[];
}): OddsMatch | undefined {
  if (!input.homeProbValues.length) return undefined;
  const home = getTeam(input.fixture.teams?.home?.name);
  const away = getTeam(input.fixture.teams?.away?.name);
  return {
    id: `api-football-odds-${input.fixtureId}-${input.sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    homeTeam: home.name,
    awayTeam: away.name,
    kickoffAt: input.fixture.fixture?.date || "",
    kickoffBj: formatKickoffBj(input.fixture.fixture?.date),
    homeOdds: Number(average(input.homeOddsValues).toFixed(2)),
    drawOdds: Number(average(input.drawOddsValues).toFixed(2)),
    awayOdds: Number(average(input.awayOddsValues).toFixed(2)),
    homeProbability: Math.round(average(input.homeProbValues)),
    drawProbability: Math.round(average(input.drawProbValues)),
    awayProbability: Math.round(average(input.awayProbValues)),
    bookmakerCount: input.homeProbValues.length,
    updatedAt: input.updateTimes.sort().at(-1) || new Date().toISOString(),
    source: input.sourceLabel,
  };
}

function transformApiFootballPreMatchOdds(
  data: ApiFootballOddsResponse,
  fixturesById: Map<number, ApiFootballFixture>,
): OddsMatch[] {
  return (data.response || []).flatMap((record) => {
    const fixtureId = record.fixture?.id;
    const fixture = fixtureId ? fixturesById.get(fixtureId) : undefined;
    if (!fixtureId || !fixture) return [];
    const bucket = {
      homeOddsValues: [] as number[],
      drawOddsValues: [] as number[],
      awayOddsValues: [] as number[],
      homeProbValues: [] as number[],
      drawProbValues: [] as number[],
      awayProbValues: [] as number[],
    };
    const updateTimes: string[] = [];
    for (const bookmaker of record.bookmakers || []) {
      const bet = bookmaker.bets?.find((item) => isMatchWinnerMarket(item.name));
      if (!bet) continue;
      if (addOddsTriple(bet.values, fixture, bucket) && record.update) updateTimes.push(record.update);
    }
    const match = buildApiFootballOddsMatch({
      fixture,
      fixtureId,
      sourceLabel: "API-Football Pro · Pre-match Odds",
      updateTimes,
      ...bucket,
    });
    return match ? [match] : [];
  });
}

function transformApiFootballLiveOdds(
  data: ApiFootballLiveOddsResponse,
  fixturesById: Map<number, ApiFootballFixture>,
): OddsMatch[] {
  const grouped = new Map<number, {
    fixture: ApiFootballFixture;
    updateTimes: string[];
    homeOddsValues: number[];
    drawOddsValues: number[];
    awayOddsValues: number[];
    homeProbValues: number[];
    drawProbValues: number[];
    awayProbValues: number[];
  }>();
  for (const record of data.response || []) {
    if (!isMatchWinnerMarket(record.bet?.name)) continue;
    const fixtureId = record.fixture?.id;
    const fixture = fixtureId ? fixturesById.get(fixtureId) : undefined;
    if (!fixtureId || !fixture) continue;
    const bucket = grouped.get(fixtureId) || {
      fixture,
      updateTimes: [],
      homeOddsValues: [],
      drawOddsValues: [],
      awayOddsValues: [],
      homeProbValues: [],
      drawProbValues: [],
      awayProbValues: [],
    };
    if (addOddsTriple(record.odds, fixture, bucket) && record.update) bucket.updateTimes.push(record.update);
    grouped.set(fixtureId, bucket);
  }
  return Array.from(grouped.entries()).flatMap(([fixtureId, bucket]) => {
    const match = buildApiFootballOddsMatch({
      fixture: bucket.fixture,
      fixtureId,
      sourceLabel: "API-Football Pro · Live Odds",
      updateTimes: bucket.updateTimes,
      homeOddsValues: bucket.homeOddsValues,
      drawOddsValues: bucket.drawOddsValues,
      awayOddsValues: bucket.awayOddsValues,
      homeProbValues: bucket.homeProbValues,
      drawProbValues: bucket.drawProbValues,
      awayProbValues: bucket.awayProbValues,
    });
    return match ? [match] : [];
  });
}

function transformTheOddsApi(data: TheOddsApiEvent[]): OddsMatch[] {
  return data.flatMap((event) => {
    const homeName = event.home_team || "";
    const awayName = event.away_team || "";
    const homeValues: number[] = [];
    const drawValues: number[] = [];
    const awayValues: number[] = [];
    const homeOddsValues: number[] = [];
    const drawOddsValues: number[] = [];
    const awayOddsValues: number[] = [];
    const updateTimes: string[] = [];

    for (const bookmaker of event.bookmakers || []) {
      const market = bookmaker.markets?.find((item) => item.key === "h2h");
      if (!market) continue;
      const homePrice = market.outcomes?.find(
        (outcome) => canonicalTeamName(outcome.name) === canonicalTeamName(homeName),
      )?.price;
      const awayPrice = market.outcomes?.find(
        (outcome) => canonicalTeamName(outcome.name) === canonicalTeamName(awayName),
      )?.price;
      const drawPrice = market.outcomes?.find(
        (outcome) => canonicalTeamName(outcome.name) === "draw",
      )?.price;
      if (!homePrice || !awayPrice || !drawPrice) continue;
      homeOddsValues.push(homePrice);
      drawOddsValues.push(drawPrice);
      awayOddsValues.push(awayPrice);

      const rawHome = 1 / homePrice;
      const rawDraw = 1 / drawPrice;
      const rawAway = 1 / awayPrice;
      const total = rawHome + rawDraw + rawAway;
      if (!Number.isFinite(total) || total <= 0) continue;
      homeValues.push((rawHome / total) * 100);
      drawValues.push((rawDraw / total) * 100);
      awayValues.push((rawAway / total) * 100);
      if (bookmaker.last_update) updateTimes.push(bookmaker.last_update);
    }

    if (!homeValues.length) return [];
    const home = getTeam(homeName);
    const away = getTeam(awayName);
    return [{
      id: `odds-${event.id}`,
      homeTeam: home.name,
      awayTeam: away.name,
      kickoffAt: event.commence_time || "",
      kickoffBj: formatKickoffBj(event.commence_time),
      homeOdds: Number(average(homeOddsValues).toFixed(2)),
      drawOdds: Number(average(drawOddsValues).toFixed(2)),
      awayOdds: Number(average(awayOddsValues).toFixed(2)),
      homeProbability: Math.round(average(homeValues)),
      drawProbability: Math.round(average(drawValues)),
      awayProbability: Math.round(average(awayValues)),
      bookmakerCount: homeValues.length,
      updatedAt: updateTimes.sort().at(-1) || new Date().toISOString(),
      source: "The Odds API",
    }];
  });
}

function oddsApiIoEventList(data: OddsApiIoEvent[] | { data?: OddsApiIoEvent[]; events?: OddsApiIoEvent[] }): OddsApiIoEvent[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.events)) return data.events;
  return [];
}

function transformOddsApiIo(data: OddsApiIoEvent[]): OddsMatch[] {
  return data.flatMap((event) => {
    const homeName = event.home || "";
    const awayName = event.away || "";
    const homeOddsValues: number[] = [];
    const drawOddsValues: number[] = [];
    const awayOddsValues: number[] = [];
    const homeProbValues: number[] = [];
    const drawProbValues: number[] = [];
    const awayProbValues: number[] = [];
    const updateTimes: string[] = [];

    for (const markets of Object.values(event.bookmakers || {})) {
      const market = markets.find((item) => String(item.name || "").toUpperCase() === "ML");
      const odds = market?.odds?.[0];
      const homeOdds = parseOddValue(odds?.home);
      const drawOdds = parseOddValue(odds?.draw);
      const awayOdds = parseOddValue(odds?.away);
      if (!homeOdds || !drawOdds || !awayOdds) continue;
      const probabilities = normalizedOddsProbability(homeOdds, drawOdds, awayOdds);
      if (!probabilities) continue;
      homeOddsValues.push(homeOdds);
      drawOddsValues.push(drawOdds);
      awayOddsValues.push(awayOdds);
      homeProbValues.push(probabilities.home);
      drawProbValues.push(probabilities.draw);
      awayProbValues.push(probabilities.away);
      if (market?.updatedAt) updateTimes.push(market.updatedAt);
    }

    if (!homeProbValues.length) return [];
    const home = getTeam(homeName);
    const away = getTeam(awayName);
    return [{
      id: `odds-api-io-${event.id || `${canonicalTeamName(homeName)}-${canonicalTeamName(awayName)}-${event.date || ""}`}`,
      homeTeam: home.name,
      awayTeam: away.name,
      kickoffAt: event.date || "",
      kickoffBj: formatKickoffBj(event.date),
      homeOdds: Number(average(homeOddsValues).toFixed(2)),
      drawOdds: Number(average(drawOddsValues).toFixed(2)),
      awayOdds: Number(average(awayOddsValues).toFixed(2)),
      homeProbability: Math.round(average(homeProbValues)),
      drawProbability: Math.round(average(drawProbValues)),
      awayProbability: Math.round(average(awayProbValues)),
      bookmakerCount: homeProbValues.length,
      updatedAt: updateTimes.sort().at(-1) || new Date().toISOString(),
      source: "Odds-API.io · Polymarket/Kalshi",
    }];
  });
}

async function fetchOddsApiIoOdds(source: DataSourceConfig, diagnostics: SourceDiagnostic[]): Promise<OddsMatch[]> {
  if (!source.apiKey) return [];
  const eventsSource: DataSourceConfig = { ...source, endpointPath: "/events" };
  const { data: eventsData, diagnostic: eventsDiagnostic } = await fetchJsonFromSource<
    OddsApiIoEvent[] | { data?: OddsApiIoEvent[]; events?: OddsApiIoEvent[] }
  >(eventsSource, {
    sport: "football",
    league: "international-fifa-world-cup",
    status: "pending,live",
    limit: 200,
  });
  diagnostics.push(eventsDiagnostic);

  const eventIds = oddsApiIoEventList(eventsData)
    .map((event) => event.id)
    .filter((id): id is string | number => id !== undefined && id !== null)
    .map(String);
  const uniqueEventIds = Array.from(new Set(eventIds));
  if (!uniqueEventIds.length) return [];

  const oddsSource: DataSourceConfig = { ...source, endpointPath: "/odds/multi" };
  const oddsMatches: OddsMatch[] = [];
  for (let index = 0; index < uniqueEventIds.length; index += 10) {
    const batch = uniqueEventIds.slice(index, index + 10);
    const { data, diagnostic } = await fetchJsonFromSource<
      OddsApiIoEvent[] | { data?: OddsApiIoEvent[]; events?: OddsApiIoEvent[] }
    >(oddsSource, {
      eventIds: batch.join(","),
      bookmakers: "Polymarket,Kalshi",
    });
    diagnostics.push(diagnostic);
    oddsMatches.push(...transformOddsApiIo(oddsApiIoEventList(data)));
  }
  return oddsMatches;
}

function mergeOddsIntoMatches(matches: Match[], odds: OddsMatch[]): Match[] {
  return matches.map((match) => {
    const matched = odds.find((item) =>
      canonicalTeamName(item.homeTeam) === canonicalTeamName(match.homeTeam)
      && canonicalTeamName(item.awayTeam) === canonicalTeamName(match.awayTeam)
      && item.kickoffBj === match.kickoffBj
    );
    if (!matched) return match;
    return {
      ...match,
      oddsImpliedHome: matched.homeProbability,
      oddsImpliedDraw: matched.drawProbability,
      oddsImpliedAway: matched.awayProbability,
      oddsSource: matched.source,
      updatedAt: `${match.updatedAt} · ${matched.source} ${matched.bookmakerCount} 家均值`,
    };
  });
}

function enabledSourceById(dataSources: DataSourceConfig[], id: string): DataSourceConfig | undefined {
  return dataSources.find((source) => source.id === id && source.enabled && source.apiKey);
}

async function fetchApiFootballFixturesForIds(
  dataSources: DataSourceConfig[],
  fixtureIds: number[],
  diagnostics: SourceDiagnostic[],
): Promise<Map<number, ApiFootballFixture>> {
  const source = enabledSourceById(dataSources, "api-football-worldcup-details")
    || enabledSourceById(dataSources, "api-football-worldcup-fixtures");
  const uniqueIds = Array.from(new Set(fixtureIds.filter((id) => Number.isFinite(id))));
  const fixturesById = new Map<number, ApiFootballFixture>();
  if (!source || !uniqueIds.length) return fixturesById;
  const chunkSize = 20;
  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const ids = uniqueIds.slice(index, index + chunkSize);
    try {
      const { data, diagnostic } = await fetchJsonFromSource<ApiFootballResponse<ApiFootballFixture>>(source, {
        ids: ids.join("-"),
        timezone: "Asia/Shanghai",
      });
      diagnostics.push(diagnostic);
      for (const fixture of data.response || []) {
        if (fixture.fixture?.id) fixturesById.set(fixture.fixture.id, fixture);
      }
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }
  return fixturesById;
}

async function fetchApiFootballPredictionsForFixtureIds(
  source: DataSourceConfig | undefined,
  fixtureIds: number[],
  diagnostics: SourceDiagnostic[],
): Promise<Map<number, MatchPrediction>> {
  const predictions = new Map<number, MatchPrediction>();
  const uniqueIds = Array.from(new Set(fixtureIds.filter((id) => Number.isFinite(id))));
  if (!source || !uniqueIds.length) return predictions;
  for (const fixtureId of uniqueIds.slice(0, 32)) {
    try {
      const { data, diagnostic } = await fetchJsonFromSource<ApiFootballPredictionResponse>(source, {
        fixture: fixtureId,
      });
      diagnostics.push(diagnostic);
      for (const [id, prediction] of normalizePredictionPercent(data.response).entries()) {
        predictions.set(id, prediction);
      }
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }
  return predictions;
}

async function latestCanonicalOdds(): Promise<OddsMatch[]> {
  const marketHistory = await readLatestOddsMarketSnapshots();
  if (marketHistory.length) return marketHistory;
  const latestSnapshot = await readLatestSnapshotCache<OddsMatch[]>("odds", { allowStale: true });
  return latestSnapshot?.payload || [];
}

async function enrichMatchesWithLatestCanonicalOdds(
  matches: Match[],
  options: AggregationReadOptions = {},
): Promise<Match[]> {
  if (options.liveScoresOnly || !matches.length) return matches;
  const odds = await latestCanonicalOdds();
  return odds.length ? mergeOddsIntoMatches(matches, odds) : matches;
}

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

function transformFootballDataTeams(data: FootballDataTeamsResponse): Team[] {
  return (data.teams || []).map((team) => {
    const display = getTeam(team.name || team.shortName);
    return {
      id: `football-data-${team.id}`,
      name: display.name,
      nameEn: team.name || team.shortName || "",
      flag: display.flag,
      group: "",
      rank: 0,
      coach: team.coach?.name || "",
      formation: "",
      stars: [],
      style: "",
      hotLevel: 0,
      tags: [],
      talkingPoints: [],
      groupStandings: { played: 0, won: 0, drawn: 0, lost: 0, pts: 0 },
      crestUrl: team.crest,
      source: "football-data.org",
    };
  });
}

function transformApiFootballTeams(data: ApiFootballResponse<ApiFootballTeamResponse>): Team[] {
  return (data.response || []).map((item) => {
    const display = getTeam(item.team?.name);
    return {
      id: `api-football-${item.team?.id}`,
      providerTeamId: item.team?.id,
      code: item.team?.code,
      name: display.name,
      nameEn: item.team?.name || "",
      flag: display.flag,
      group: "",
      rank: 0,
      coach: "",
      formation: "",
      stars: [],
      style: "",
      hotLevel: 0,
      tags: [],
      talkingPoints: [],
      groupStandings: { played: 0, won: 0, drawn: 0, lost: 0, pts: 0 },
      crestUrl: item.team?.logo,
      source: "API-Football Pro",
      sourceUpdatedAt: new Date().toISOString(),
    };
  });
}

function apiFootballGroupLabel(group: string | undefined): string {
  const letter = String(group || "").match(/Group\s+([A-Z])/i)?.[1] || String(group || "").match(/\b([A-Z])\b/)?.[1];
  return letter ? `${letter} 组` : group || "";
}

function uniqueLabels(items: Array<string | undefined>): string[] {
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
}

function mergeSourceLabels(...sources: Array<string | undefined>): string {
  return uniqueLabels(sources.flatMap((source) => source?.split(" · ") || [])).join(" · ");
}

function teamMergeKeys(teamId: number | undefined, name: string | undefined): string[] {
  return [
    teamId ? `id:${teamId}` : "",
    canonicalTeamName(name),
  ].filter(Boolean);
}

function transformApiFootballStandings(data: ApiFootballStandingsResponse): Map<string, Partial<Team>> {
  const byKey = new Map<string, Partial<Team>>();
  for (const row of data.response?.flatMap((item) => item.league?.standings?.flat() || []) || []) {
    const partial: Partial<Team> = {
      providerTeamId: row.team?.id,
      group: apiFootballGroupLabel(row.group),
      rank: row.rank || 0,
      groupStandings: {
        played: row.all?.played || 0,
        won: row.all?.win || 0,
        drawn: row.all?.draw || 0,
        lost: row.all?.lose || 0,
        goalsFor: row.all?.goals?.for || 0,
        goalsAgainst: row.all?.goals?.against || 0,
        pts: row.points || 0,
      },
      formSummary: {
        form: row.form,
        lastFive: row.form ? row.form.split("").slice(-5) : [],
        note: [row.description, row.status ? `status: ${row.status}` : ""].filter(Boolean).join(" · "),
        updatedAt: new Date().toISOString(),
      },
      crestUrl: row.team?.logo,
      sourceUpdatedAt: new Date().toISOString(),
    };
    for (const key of teamMergeKeys(row.team?.id, row.team?.name)) byKey.set(key, partial);
  }
  return byKey;
}

function transformApiFootballSquads(data: ApiFootballSquadResponse): Map<string, Team["roster"]> {
  const byKey = new Map<string, Team["roster"]>();
  for (const item of data.response || []) {
    const roster = (item.players || [])
      .filter((player) => player.name)
      .map((player) => ({
        id: `api-football-player-${player.id || `${item.team?.id}-${player.name}`}`,
        name: player.name || "",
        shirtNumber: player.number,
        position: player.position || "",
        age: player.age,
        photoUrl: player.photo,
        avatarUrl: player.photo,
        intro: "API-Football Pro squad profile.",
      }));
    for (const key of teamMergeKeys(item.team?.id, item.team?.name)) byKey.set(key, roster);
  }
  return byKey;
}

function transformApiFootballInjuries(data: ApiFootballInjuryResponse): Map<string, TeamInjury[]> {
  const byKey = new Map<string, TeamInjury[]>();
  for (const item of data.response || []) {
    if (!item.player?.name) continue;
    const injury: TeamInjury = {
      id: `api-football-injury-${item.fixture?.id || "fixture"}-${item.player.id || item.player.name}`,
      playerName: item.player.name,
      playerId: item.player.id,
      type: item.player.type,
      reason: item.player.reason,
      fixtureId: item.fixture?.id,
      fixtureDate: item.fixture?.date,
      updatedAt: new Date().toISOString(),
    };
    for (const key of teamMergeKeys(item.team?.id, item.team?.name)) {
      byKey.set(key, [...(byKey.get(key) || []), injury]);
    }
  }
  return byKey;
}

function mergeApiFootballTeamAuxData(
  teams: Team[],
  input: {
    standings?: Map<string, Partial<Team>>;
    squads?: Map<string, Team["roster"]>;
    injuries?: Map<string, TeamInjury[]>;
  },
): Team[] {
  return teams.map((team) => {
    const keys = teamMergeKeys(team.providerTeamId, team.nameEn || team.name);
    const standings = keys.map((key) => input.standings?.get(key)).find(Boolean);
    const roster = keys.map((key) => input.squads?.get(key)).find(Boolean);
    const injuries = keys.map((key) => input.injuries?.get(key)).find(Boolean);
    return {
      ...team,
      providerTeamId: team.providerTeamId || standings?.providerTeamId,
      group: team.group || standings?.group || "",
      rank: standings?.rank || team.rank,
      crestUrl: team.crestUrl || standings?.crestUrl,
      groupStandings: standings?.groupStandings || team.groupStandings,
      formSummary: standings?.formSummary || team.formSummary,
      roster: roster?.length ? roster : team.roster,
      injuries: injuries?.length ? injuries : team.injuries,
      tags: uniqueLabels([
        ...team.tags,
        standings?.rank ? `小组第${standings.rank}` : "",
        injuries?.length ? `${injuries.length}人伤停` : "",
      ]),
      source: mergeSourceLabels(team.source, standings || roster || injuries ? "API-Football Pro · standings/squads/injuries" : undefined),
      sourceUpdatedAt: new Date().toISOString(),
    };
  });
}

function transformTheSportsDbTeams(data: TheSportsDbTeamsResponse): Team[] {
  return (data.teams || []).map((team) => {
    const display = getTeam(team.strTeam);
    return {
      id: `thesportsdb-${team.idTeam}`,
      name: display.name,
      nameEn: team.strTeam || "",
      flag: display.flag,
      group: "",
      rank: 0,
      coach: team.strManager || "",
      formation: "",
      stars: [],
      style: team.strDescriptionEN || "",
      hotLevel: 0,
      tags: [],
      talkingPoints: [],
      groupStandings: { played: 0, won: 0, drawn: 0, lost: 0, pts: 0 },
      crestUrl: team.strBadge,
      source: "TheSportsDB",
    };
  });
}

function teamIdentityKeys(team: Partial<Pick<Team, "providerTeamId" | "code" | "name" | "nameEn">>): string[] {
  return Array.from(new Set([
    team.providerTeamId ? `id:${team.providerTeamId}` : "",
    team.code ? `code:${team.code}` : "",
    canonicalTeamName(team.nameEn),
    canonicalTeamName(team.name),
  ].filter(Boolean)));
}

function mergeTeamLists(lists: Team[][]): Team[] {
  const merged = new Map<string, Team>();
  const keyIndex = new Map<string, string>();
  for (const teams of lists) {
    for (const team of teams) {
      const keys = teamIdentityKeys(team);
      const key = keys.map((item) => keyIndex.get(item)).find(Boolean) || keys[0];
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, team);
        for (const item of keys) keyIndex.set(item, key);
        continue;
      }
      const nextTeam = {
        ...existing,
        providerTeamId: existing.providerTeamId || team.providerTeamId,
        code: existing.code || team.code,
        coach: existing.coach || team.coach,
        formation: existing.formation || team.formation,
        style: existing.style || team.style,
        crestUrl: existing.crestUrl || team.crestUrl,
        group: existing.group || team.group,
        rank: existing.rank || team.rank,
        groupStandings: existing.groupStandings?.played || existing.groupStandings?.pts
          ? existing.groupStandings
          : team.groupStandings,
        stars: existing.stars.length ? existing.stars : team.stars,
        tags: Array.from(new Set([...existing.tags, ...team.tags])),
        talkingPoints: Array.from(new Set([...existing.talkingPoints, ...team.talkingPoints])),
        roster: existing.roster?.length ? existing.roster : team.roster,
        injuries: existing.injuries?.length ? existing.injuries : team.injuries,
        formSummary: existing.formSummary || team.formSummary,
        sourceUpdatedAt: existing.sourceUpdatedAt || team.sourceUpdatedAt,
        source: Array.from(new Set([existing.source, team.source].filter(Boolean))).join(" + "),
      };
      merged.set(key, nextTeam);
      for (const item of teamIdentityKeys(nextTeam)) keyIndex.set(item, key);
    }
  }
  return Array.from(merged.values());
}

async function enrichApiFootballTeamsWithAuxSources(
  teams: Team[],
  dataSources: DataSourceConfig[],
  diagnostics: SourceDiagnostic[],
): Promise<Team[]> {
  if (!teams.length) return teams;
  const standingsSource = enabledSourceById(dataSources, "api-football-worldcup-standings");
  const squadsSource = enabledSourceById(dataSources, "api-football-worldcup-squads");
  const injuriesSource = enabledSourceById(dataSources, "api-football-worldcup-injuries");
  const aux: Parameters<typeof mergeApiFootballTeamAuxData>[1] = {};

  if (standingsSource) {
    try {
      const { data, diagnostic } = await fetchJsonFromSource<ApiFootballStandingsResponse>(standingsSource, {
        league: 1,
        season: 2026,
      });
      diagnostics.push(diagnostic);
      aux.standings = transformApiFootballStandings(data);
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  if (injuriesSource) {
    try {
      const { data, diagnostic } = await fetchJsonFromSource<ApiFootballInjuryResponse>(injuriesSource, {
        league: 1,
        season: 2026,
      });
      diagnostics.push(diagnostic);
      aux.injuries = transformApiFootballInjuries(data);
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  if (squadsSource) {
    const squads = new Map<string, Team["roster"]>();
    const teamIds = teams
      .map((team) => team.providerTeamId)
      .filter((id): id is number => Number.isFinite(id));
    for (const teamId of Array.from(new Set(teamIds)).slice(0, 64)) {
      try {
        const { data, diagnostic } = await fetchJsonFromSource<ApiFootballSquadResponse>(squadsSource, {
          team: teamId,
        });
        diagnostics.push(diagnostic);
        for (const [key, roster] of transformApiFootballSquads(data).entries()) {
          squads.set(key, roster);
        }
      } catch (error) {
        diagnostics.push(error as SourceDiagnostic);
      }
    }
    aux.squads = squads;
  }

  return mergeApiFootballTeamAuxData(teams, aux);
}

function parseStringArray(input: string | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return input.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function parseMarketVolume(input: string | undefined): number {
  const value = Number(String(input || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function parsePolymarketVolume(input: string | number | undefined): number {
  const value = typeof input === "number" ? input : Number(String(input || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function isYesNo(outcomes: string[]) {
  return outcomes.length >= 2
    && outcomes[0]?.toLowerCase() === "yes"
    && outcomes[1]?.toLowerCase() === "no";
}

function normalizePolymarketOutcomeLabel(market: NonNullable<PolymarketEvent["markets"]>[number], outcome: string, index: number) {
  if (isYesNo(parseStringArray(market.outcomes)) && index === 0 && market.groupItemTitle) {
    const title = market.groupItemTitle.replace(/^Draw\s*\(.+\)$/i, "Draw");
    return title || outcome;
  }
  return outcome;
}

function classifyPolymarketMarket(eventTitle: string, marketTitle: string): NonNullable<RadarMatch["category"]> {
  const text = `${eventTitle} ${marketTitle}`.toLowerCase();
  if (/half[-\s]?time|halftime/.test(text)) return "halftime";
  if (/corner/.test(text)) return "corners";
  if (/assist/.test(text)) return "assists";
  if (/shot/.test(text)) return "shots";
  if (/player to score|to score|goalscorer|golden boot/.test(text)) return "goals";
  if (/spread/.test(text)) return "spread";
  if (/\bo\/u\b|over\/under|total goals|total score/.test(text)) return "total";
  if (/\bvs\.?\b/.test(eventTitle) && (/ win on \d{4}-\d{2}-\d{2}/.test(text) || /end in a draw/.test(text))) {
    return "moneyline";
  }
  return "prop";
}

function parseEventTeams(eventTitle: string | undefined): [string, string] | undefined {
  const match = String(eventTitle || "").match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s+-\s+.+)?$/i);
  if (!match) return undefined;
  return [match[1].trim(), match[2].trim()];
}

function extractMarketLine(marketTitle: string, groupItemTitle: string | undefined): string | undefined {
  const text = `${groupItemTitle || ""} ${marketTitle}`;
  const spread = text.match(/\(([+-]?\d+(?:\.\d+)?)\)/);
  if (spread) return spread[1];
  const total = text.match(/\b(?:O\/U|over\/under)\s+(\d+(?:\.\d+)?)/i);
  if (total) return total[1];
  return undefined;
}

function isWorldCupPolymarketEvent(event: PolymarketEvent): boolean {
  const text = [
    event.title,
    event.slug,
    ...(event.markets || []).flatMap((market) => [market.question, market.groupItemTitle]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\bfifwc\b|fifa world cup|world cup|世界杯/.test(text);
}

function transformPolymarketEvents(
  data: PolymarketEvent[],
  options: { includeClosedMarkets?: boolean } = {},
): RadarMatch[] {
  return data.filter(isWorldCupPolymarketEvent).flatMap((event, eventIndex) => {
    const eventTitle = event.title || "World Cup prediction";
    const eventTeams = parseEventTeams(eventTitle);
    const eventVolume = parsePolymarketVolume(event.volume);
    return (event.markets || []).flatMap((market, marketIndex) => {
      if (market.active === false || (!options.includeClosedMarkets && market.closed === true)) return [];
      const outcomes = parseStringArray(market.outcomes);
      const prices = parseStringArray(market.outcomePrices).map((price) => Number(price));
      const yes = prices[0];
      const no = prices[1];
      if (!Number.isFinite(yes) || outcomes.length < 2) return [];
      const yesProb = Math.round(yes * 100);
      const noProb = Number.isFinite(no) ? Math.round(no * 100) : Math.max(0, 100 - yesProb);
      const volumeUsd = parseMarketVolume(market.volume) || eventVolume;
      const title = market.question || eventTitle;
      const category = classifyPolymarketMarket(eventTitle, title);
      const normalizedOutcomes = outcomes.map((outcome, index) => ({
        label: normalizePolymarketOutcomeLabel(market, outcome, index),
        probability: Math.max(0, Math.min(100, Math.round((prices[index] || 0) * 100))),
      }));
      const primaryLabel = normalizedOutcomes[0]?.label || outcomes[0] || "Yes";
      const secondaryLabel = normalizedOutcomes[1]?.label || outcomes[1] || "No";
      return [{
        id: `polymarket-${market.id || event.id || `${eventIndex}-${marketIndex}`}`,
        title,
        eventTitle,
        eventSlug: event.slug,
        category,
        line: extractMarketLine(title, market.groupItemTitle),
        marketLabel: normalizedOutcomes.map((outcome) => outcome.label).join(" / "),
        homeTeam: eventTeams?.[0] || primaryLabel,
        awayTeam: eventTeams?.[1] || secondaryLabel,
        homeFlag: "▴",
        awayFlag: "▾",
        homeMarketProb: yesProb,
        awayMarketProb: noProb,
        homeOddsProb: yesProb,
        awayOddsProb: noProb,
        diff: 0,
        diffLabel: "aligned" as const,
        diffTeam: "home" as const,
        diffText: "此卡展示 Polymarket 预测市场价格和资金热度；传统赔率对照源未匹配时，不强行制造分歧。",
        kickoffBj: "",
        status: market.closed === true ? "finished" as MatchStatus : "upcoming" as MatchStatus,
        updatedAt: market.closed === true ? "Polymarket · closed" : "Polymarket",
        volume: market.volume,
        volumeUsd,
        outcomes: normalizedOutcomes,
        history: [],
      }];
    });
  }).sort((left, right) => (right.volumeUsd || 0) - (left.volumeUsd || 0));
}

function transformApiFootballPredictionsToRadar(
  matches: Match[],
  predictionsByFixtureId: Map<number, MatchPrediction>,
): RadarMatch[] {
  return matches.flatMap((match) => {
    const fixtureId = match.providerFixtureId || apiFootballFixtureIdFromMatchId(match.id);
    const prediction = fixtureId ? predictionsByFixtureId.get(fixtureId) || match.prediction : match.prediction;
    if (!prediction) return [];
    const homeProb = prediction.homePercent;
    const drawProb = prediction.drawPercent;
    const awayProb = prediction.awayPercent;
    const awayOrDraw = Math.max(awayProb, drawProb);
    const diff = Math.abs(homeProb - awayProb);
    return [{
      id: `api-football-prediction-${fixtureId || match.id}`,
      title: `${match.homeTeam} vs ${match.awayTeam}`,
      eventTitle: `${match.homeTeam} vs ${match.awayTeam}`,
      category: "moneyline" as const,
      marketLabel: "Home / Draw / Away prediction",
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeFlag: match.homeFlag,
      awayFlag: match.awayFlag,
      homeMarketProb: homeProb,
      awayMarketProb: awayProb,
      homeOddsProb: match.oddsImpliedHome || homeProb,
      awayOddsProb: match.oddsImpliedAway || awayProb,
      diff,
      diffLabel: diff >= 18 ? "significant" as const : diff >= 10 ? "notable" as const : "aligned" as const,
      diffTeam: homeProb >= awayOrDraw ? "home" as const : "away" as const,
      diffText: prediction.advice || `API-Football 预测：主胜 ${homeProb}% / 平 ${drawProb}% / 客胜 ${awayProb}%。`,
      kickoffBj: match.kickoffBj,
      status: match.status,
      updatedAt: prediction.updatedAt || match.updatedAt,
      volume: "API model",
      volumeUsd: 0,
      outcomes: [
        { label: match.homeTeam, probability: homeProb },
        { label: "Draw", probability: drawProb },
        { label: match.awayTeam, probability: awayProb },
      ],
      history: [],
    }];
  });
}

function isPolymarketRadarMatch(match: RadarMatch): boolean {
  return match.id.startsWith("polymarket-") || /polymarket/i.test([match.updatedAt, match.diffText].filter(Boolean).join(" "));
}

function snapshotKeyFor(prefix: string, value: string, updatedAt: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 16);
  return `${prefix}:${digest}:${updatedAt}`;
}

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

function articleId(url: string, fallback: string): string {
  return createHash("sha256").update(url || fallback).digest("hex").slice(0, 18);
}

function normalizeSummary(value: string | null | undefined, fallback = ""): string {
  const text = String(value || fallback || "").replace(/\s+/g, " ").trim();
  if (!text) return "新闻源返回了标题和链接，暂无摘要。";
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function normalizeArticleText(value: string | null | undefined, fallback = ""): string {
  const text = String(value || fallback || "")
    .replace(/\[\+\d+\s+chars?\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 6500 ? `${text.slice(0, 6500).trim()}...` : text;
}

function splitArticleParagraphs(input: string): string[] {
  return input
    .split(/\n{2,}|(?<=[.!?。！？])\s+(?=[A-Z\u4e00-\u9fff])/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 24)
    .slice(0, 8);
}

function fallbackArticleBody(article: NewsArticle): string[] {
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

function ensureArticleBody(article: NewsArticle): NewsArticle {
  const fallback = fallbackArticleBody(article);
  return {
    ...article,
    body: article.body?.length ? article.body : fallback,
    bodyZh: article.bodyZh?.length ? article.bodyZh : undefined,
    bodyEn: article.bodyEn?.length ? article.bodyEn : undefined,
    bodyUpdatedAt: article.bodyUpdatedAt || new Date().toISOString(),
  };
}

function uniqueArticles(articles: NewsArticle[], limit: number): NewsArticle[] {
  const seen = new Set<string>();
  const result: NewsArticle[] = [];
  for (const article of articles) {
    const key = article.url || article.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(article);
    if (result.length >= limit) break;
  }
  return result;
}

function articleSearchText(article: NewsArticle): string {
  return `${article.title} ${article.summary} ${article.sourceText || ""} ${article.domain || ""}`.toLowerCase();
}

function worldCupRelevanceScore(article: NewsArticle): number {
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

function isChinaNewsArticle(article: NewsArticle): boolean {
  const sourceText = `${article.source} ${article.domain || ""} ${article.url || ""}`.toLowerCase();
  return sourceText.includes("chinanews") || sourceText.includes("中新网");
}

function isStrongWorldCupArticle(article: NewsArticle): boolean {
  const text = articleSearchText(article);
  return worldCupRelevanceScore(article) >= 7
    && /\bworld cup\b|fifa world cup|world cup 2026|2026 world cup|世界杯|美加墨/i.test(text);
}

function rankWorldCupNews(articles: NewsArticle[]): NewsArticle[] {
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

function canonicalArticleUrl(input: string): string {
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

function titleTokens(input: string): Set<string> {
  const normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
  const words = normalized.split(/\s+/).filter((word) => word.length >= 3);
  return new Set(words);
}

function titleSimilarity(left: string, right: string): number {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}

function publishedDistanceHours(left: string, right: string): number {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / 3_600_000;
}

function mergeNewsArticles(articles: NewsArticle[], limit: number): NewsArticle[] {
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

function applyAiCuration(
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

interface NewsFetchWindow {
  publishedAfter?: Date;
  publishedBefore?: Date;
}

function compactIsoDate(date: Date): string {
  return date.toISOString().replace(/\D/g, "").slice(0, 14);
}

function filterArticlesByWindow(articles: NewsArticle[], window: NewsFetchWindow): NewsArticle[] {
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

async function fetchNewsSource(
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

function transformGdeltArticles(data: GdeltDocResponse, limit: number): NewsArticle[] {
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

function transformNewsApiArticles(data: NewsApiResponse, limit: number): NewsArticle[] {
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

function articleDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function transformCurrentsArticles(data: CurrentsApiResponse, limit: number): NewsArticle[] {
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

function espnArticleUrl(article: NonNullable<EspnSiteNewsResponse["articles"]>[number]): string {
  return article.links?.web?.href || article.links?.mobile?.href || "";
}

function transformEspnSiteArticles(data: EspnSiteNewsResponse, limit: number): NewsArticle[] {
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

function isChineseNewsSource(source: DataSourceConfig): boolean {
  return (
    source.id.includes("chinanews")
    || source.id.includes("people")
    || source.id.includes("sohu")
    || source.baseUrl.includes("chinanews.com")
    || source.baseUrl.includes("people.com.cn")
    || source.baseUrl.includes("sohu.com")
  );
}

function rssQueryForSource(source: DataSourceConfig, query: string): string {
  if (!isChineseNewsSource(source)) return query;
  return `${query} 世界杯 美加墨 足球 FIFA 2026`;
}

function decodeXmlText(input: string | undefined): string {
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

function decodeHtmlText(input: string | undefined): string {
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

function htmlToText(input: string | undefined): string {
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

function isUsefulArticleParagraph(text: string): boolean {
  if (text.length < 40) return false;
  if (text.length > 1400) return false;
  return !/(cookie|privacy policy|advertisement|subscribe|newsletter|sign in|sign up|share this|read more|all rights reserved|javascript|browser does not support|this video can not be played)/i.test(text);
}

function extractArticleTextFromHtml(html: string): string {
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

async function fetchOriginalArticleText(article: NewsArticle): Promise<string | undefined> {
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

async function mapWithConcurrency<T, R>(
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

async function enrichArticlesWithSourceText(articles: NewsArticle[]): Promise<NewsArticle[]> {
  const fetchLimit = Math.min(articles.length, 12);
  const enrichedTop = await mapWithConcurrency(
    articles.slice(0, fetchLimit),
    4,
    async (article) => {
      const remoteText = await fetchOriginalArticleText(article);
      const sourceText = normalizeArticleText(remoteText, article.sourceText || article.summary);
      return {
        ...article,
        sourceText,
        bodySource: remoteText ? "original-page" as const : article.bodySource || (article.sourceText ? "source-api" as const : "summary" as const),
      };
    },
  );
  return [
    ...enrichedTop,
    ...articles.slice(fetchLimit).map((article) => ({
      ...article,
      sourceText: normalizeArticleText(article.sourceText, article.summary),
      bodySource: article.bodySource || (article.sourceText ? "source-api" as const : "summary" as const),
    })),
  ];
}

function xmlTagValue(xml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return decodeXmlText(match?.[1]);
}

function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/["()]/g, " ")
    .split(/\s+|\s+or\s+/)
    .map((term) => term.trim())
    .filter((term) => (
      /[\u3400-\u9fff]/.test(term)
        ? term.length >= 2
        : term.length >= 4 && !["world", "football", "fifa", "2026"].includes(term)
    ));
}

function transformRssArticles(xml: string, limit: number, query: string): NewsArticle[] {
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

function transformGenericNews(data: unknown, limit: number): NewsArticle[] {
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

function shortenText(value: string | undefined, maxLength: number): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function articleFocusSentence(article: NewsArticle): string | undefined {
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
  return /[\u3400-\u9fff]/.test(article.title) ? shortenText(article.titleZh || article.title, 40) : undefined;
}

function buildFallbackNewsSummary(news: NewsArticle[], aggregation: NewsAggregationMeta): string {
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

function buildMorningBrief(input: {
  matches: Match[];
  news: NewsArticle[];
  sourceLabel: string;
  dateKey: ScheduleDateKey;
  sourceDate?: string;
  aggregation: NewsAggregationMeta;
  curation?: AiNewsCuration;
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
      : `${scheduleDateMeta[input.dateKey].listLabel}共 ${input.matches.length} 场，赛况更新后进入战局拆解。`
    : "";
  const newsSummary = buildFallbackNewsSummary(input.news, input.aggregation);
  const fallbackSummary = [newsSummary, matchSummary].filter(Boolean).join(" ");
  return {
    issueDate,
    edition,
    title: input.curation?.title || topNews?.titleZh || fallbackTitle,
    summary: input.curation?.summary || fallbackSummary,
    quote: input.curation?.quote || (topNews ? articleFocusSentence(topNews) || shortenText(topNews.summaryZh || topNews.summary, 96) : ""),
    sourceLabel: input.sourceLabel,
    updatedAt: new Date().toISOString(),
    matches: input.matches,
    news: input.news,
    gossipItems: [],
    aggregation: input.aggregation,
  };
}

export async function getAggregatedOdds(options: AggregationReadOptions = {}): Promise<{
  oddsMatches: OddsMatch[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const snapshotKey = `odds:v2:world-cup:${updatedAt}`;
  const persisted = await readSnapshotCache<OddsMatch[]>(snapshotKey);
  if (shouldUseSnapshot(persisted, (payload) => payload.length > 0, options)) {
    return {
      oddsMatches: persisted.payload,
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "odds", persisted)],
    };
  }

  if (isCacheFirst(options)) {
    const stale = await readSnapshotCache<OddsMatch[]>(snapshotKey, { allowStale: true });
    if (stale) {
      return {
        oddsMatches: stale.payload,
        source: "cache",
        diagnostics: [snapshotDiagnostic(snapshotKey, "odds", stale, true)],
      };
    }
  }

  if (isCacheOnly(options)) {
    const latestOdds = await readLatestOddsMarketSnapshots();
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
          const oddsMatches = transformApiFootballLiveOdds(data, fixturesById);
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
        const oddsMatches = transformApiFootballPreMatchOdds(data, fixturesById);
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
        const oddsMatches = transformTheOddsApi(data);
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
        const oddsMatches = await fetchOddsApiIoOdds(source, diagnostics);
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
    return {
      oddsMatches: stale.payload,
      source: "cache",
      diagnostics: [...diagnostics, snapshotDiagnostic(snapshotKey, "odds", stale, true)],
    };
  }

  return { oddsMatches: [], source: "fallback", diagnostics };
}

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

export async function getAggregatedMatches(dateKey: ScheduleDateKey, options: AggregationReadOptions = {}): Promise<{
  matches: Match[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const sourceDate = sourceDateFor(dateKey, options);
  const dateRange = dateRangeFor(dateKey, options);
  const providerDates = providerDatesForRange(dateRange, sourceDate);
  const snapshotKey = `matches:v5:${dateKey}:${dateRangeSnapshotKey(dateRange)}:${updatedAt}`;
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
    const storedOfficialMatches = (
      await getStoredOfficialMatches<FifaScheduleRecord>(dateRange)
    ).map(fifaRecordToMatch);
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

      await upsertSnapshotCache({
        snapshotKey,
        feature: "matches",
        sourceMode: "remote",
        sourceId: source.id,
        payload: matches,
        diagnostics,
        ttlSeconds: getEffectiveRefreshSeconds(source),
      });
      return {
        matches: await enrichMatchesWithLatestCanonicalOdds(matches, options),
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
        await upsertSnapshotCache({
          snapshotKey,
          feature: "matches",
          sourceMode: "remote",
          sourceId: source.id,
          payload: matches,
          diagnostics,
          ttlSeconds: getEffectiveRefreshSeconds(source),
        });
        return {
          matches: await enrichMatchesWithLatestCanonicalOdds(matches, options),
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

  const storedOfficialMatches = (
    await getStoredOfficialMatches<FifaScheduleRecord>(dateRange)
  ).map(fifaRecordToMatch);
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
  const snapshotKey = snapshotKeyFor("news:v8", `${query}:${limit}:${windowKey}`, updatedAt);
  const persisted = await readSnapshotCache<NewsSnapshotPayload>(snapshotKey);
  if (shouldUseSnapshot(persisted, (payload) => payload.articles.length > 0, options)) {
    return {
      articles: persisted.payload.articles,
      source: "cache",
      diagnostics: [
        ...persisted.payload.diagnostics,
        snapshotDiagnostic(snapshotKey, "news", persisted),
      ],
      aggregation: persisted.payload.aggregation,
      curation: persisted.payload.curation,
    };
  }

  if (isCacheFirst(options)) {
    const stale = await readSnapshotCache<NewsSnapshotPayload>(snapshotKey, { allowStale: true });
    if (stale) {
      return {
        articles: stale.payload.articles,
        source: "cache",
        diagnostics: [
          ...stale.payload.diagnostics,
          snapshotDiagnostic(snapshotKey, "news", stale, true),
        ],
        aggregation: stale.payload.aggregation,
        curation: stale.payload.curation,
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
  const orderedAiProviders = aiProviders
    .slice()
    .sort((left, right) => {
      if (left.id === primaryAiProviderId) return -1;
      if (right.id === primaryAiProviderId) return 1;
      return 0;
    });
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
    return {
      articles: stale.payload.articles,
      source: "cache",
      diagnostics: [
        ...diagnostics,
        snapshotDiagnostic(snapshotKey, "news", stale, true),
      ],
      aggregation: stale.payload.aggregation,
      curation: stale.payload.curation,
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

async function getCachedMorningNewsFallback(): Promise<{
  articles: NewsArticle[];
  source: "cache";
  diagnostics: SourceDiagnostic[];
  aggregation: NewsAggregationMeta;
  curation?: AiNewsCuration;
} | undefined> {
  const latest = await readLatestSnapshotCache<NewsSnapshotPayload>("news", { allowStale: true });
  if (!latest?.payload.articles.length) return undefined;
  return {
    articles: latest.payload.articles,
    source: "cache",
    diagnostics: [
      ...latest.payload.diagnostics,
      snapshotDiagnostic(latest.snapshotKey, "news", latest, true),
    ],
    aggregation: latest.payload.aggregation,
    curation: latest.payload.curation,
  };
}

export async function getAggregatedMorningBrief(dateKey: ScheduleDateKey, options: AggregationReadOptions = {}): Promise<{
  brief: MorningBrief;
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { updatedAt } = await readAdminConfig();
  const newsWindow = rollingRecentNewsWindow();
  const sourceDate = sourceDateFor(dateKey, options);
  const dateRange = dateRangeFor(dateKey, options);
  const snapshotKey = `morning:v17:${dateKey}:${dateRangeSnapshotKey(dateRange)}:${newsWindow.cacheKey}:${updatedAt}`;
  const persisted = await readSnapshotCache<MorningBriefStoredPayload>(snapshotKey);
  if (persisted?.payload && options.cacheMode !== "refresh") {
    return {
      brief: await hydrateMorningBriefPayload(persisted.payload),
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "news", persisted)],
    };
  }

  if (isCacheFirst(options)) {
    const stale = await readSnapshotCache<MorningBriefStoredPayload>(snapshotKey, { allowStale: true });
    if (stale?.payload) {
      return {
        brief: await hydrateMorningBriefPayload(stale.payload),
        source: "cache",
        diagnostics: [snapshotDiagnostic(snapshotKey, "news", stale, true)],
      };
    }
  }

  if (isCacheOnly(options)) {
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
      brief: fallbackBrief,
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
  const brief = buildMorningBrief({
    matches: matchesResult.matches,
    news: newsResult.articles,
    sourceLabel,
    dateKey,
    sourceDate,
    aggregation: newsResult.aggregation,
    curation: newsResult.curation,
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
