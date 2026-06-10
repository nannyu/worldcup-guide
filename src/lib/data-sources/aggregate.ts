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
import { readSnapshotCache, upsertSnapshotCache } from "@/lib/db/queries/data-cache";
import { getStoredOfficialMatches } from "@/lib/db/queries/world-cup";
import {
  fifaRecordToMatch,
  matchesByDate,
  scheduleDateMeta,
  type FifaScheduleRecord,
  type Match,
  type MatchStatus,
  type MorningBrief,
  type NewsAggregationMeta,
  type NewsArticle,
  type OddsMatch,
  type RadarMatch,
  type ScheduleDateKey,
  type SignalType,
  type Team,
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
  markets?: Array<{
    id?: string;
    question?: string;
    outcomes?: string;
    outcomePrices?: string;
    volume?: string;
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

const dateKeyToSourceDate: Record<ScheduleDateKey, string> = {
  yesterday: scheduleDateMeta.yesterday.date,
  today: scheduleDateMeta.today.date,
  tomorrow: scheduleDateMeta.tomorrow.date,
};

function snapshotDiagnostic(
  key: string,
  type: SourceDiagnostic["type"],
  computedAt: Date | undefined,
  stale = false,
): SourceDiagnostic {
  return {
    id: key,
    name: "PostgreSQL 数据快照",
    adapter: "database-snapshot",
    type,
    ok: true,
    fromCache: true,
    message: stale ? "stale database snapshot" : "database snapshot hit",
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

function providerDateBj(input: string | undefined): string {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
  if (!date || !time) return "";
  const match = time.match(/^(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})$/);
  if (!match) return `${date} ${time}`;
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
  const bj = new Date(utcMs + 8 * 60 * 60 * 1000);
  const mm = String(bj.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bj.getUTCDate()).padStart(2, "0");
  const hh = String(bj.getUTCHours()).padStart(2, "0");
  const min = String(bj.getUTCMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

function transformOpenFootballMatches(data: OpenFootballWorldCup, dateKey: ScheduleDateKey): Match[] {
  const sourceDate = dateKeyToSourceDate[dateKey];
  return data.matches
    .map((match, index) => {
      const home = getTeam(match.team1);
      const away = getTeam(match.team2);
      const score = match.score?.ft;
      const status: MatchStatus = score ? "finished" : "upcoming";
      return {
        id: `openfootball-${sourceDate}-${index + 1}`,
        homeTeam: home.name,
        awayTeam: away.name,
        homeFlag: home.flag,
        awayFlag: away.flag,
        homeScore: score?.[0] ?? null,
        awayScore: score?.[1] ?? null,
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
    .filter((match) => match.kickoffBj.slice(0, 5) === sourceDate.slice(5))
    .slice(0, 8);
}

function transformFootballDataMatches(
  data: FootballDataMatchesResponse,
  dateKey: ScheduleDateKey,
): Match[] {
  const sourceDate = dateKeyToSourceDate[dateKey];
  return (data.matches || [])
    .filter((match) => providerDateBj(match.utcDate) === sourceDate)
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
    });
}

function transformWorldCupApiMatches(data: unknown, dateKey: ScheduleDateKey): Match[] {
  const sourceDate = dateKeyToSourceDate[dateKey];
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
    .filter((match) => match.kickoffBj.slice(0, 5) === sourceDate.slice(5));
}

function transformTheSportsDbMatches(
  data: TheSportsDbEventsResponse,
  dateKey: ScheduleDateKey,
): Match[] {
  const sourceDate = dateKeyToSourceDate[dateKey];
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
    .filter((match) => match.kickoffBj.slice(0, 5) === sourceDate.slice(5));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function transformTheOddsApi(data: TheOddsApiEvent[]): OddsMatch[] {
  return data.flatMap((event) => {
    const homeName = event.home_team || "";
    const awayName = event.away_team || "";
    const homeValues: number[] = [];
    const drawValues: number[] = [];
    const awayValues: number[] = [];
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
      homeProbability: Math.round(average(homeValues)),
      drawProbability: Math.round(average(drawValues)),
      awayProbability: Math.round(average(awayValues)),
      bookmakerCount: homeValues.length,
      updatedAt: updateTimes.sort().at(-1) || new Date().toISOString(),
      source: "The Odds API",
    }];
  });
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
      updatedAt: `${match.updatedAt} · The Odds API ${matched.bookmakerCount} 家均值`,
    };
  });
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

function mergeTeamLists(lists: Team[][]): Team[] {
  const merged = new Map<string, Team>();
  for (const teams of lists) {
    for (const team of teams) {
      const key = canonicalTeamName(team.nameEn || team.name);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, team);
        continue;
      }
      merged.set(key, {
        ...existing,
        coach: existing.coach || team.coach,
        formation: existing.formation || team.formation,
        style: existing.style || team.style,
        crestUrl: existing.crestUrl || team.crestUrl,
        stars: existing.stars.length ? existing.stars : team.stars,
        tags: Array.from(new Set([...existing.tags, ...team.tags])),
        talkingPoints: Array.from(new Set([...existing.talkingPoints, ...team.talkingPoints])),
        source: Array.from(new Set([existing.source, team.source].filter(Boolean))).join(" + "),
      });
    }
  }
  return Array.from(merged.values());
}

function transformPolymarketEvents(_data: PolymarketEvent[]): RadarMatch[] {
  void _data;
  // Radar requires a verified prediction-market probability and a verified
  // bookmaker implied probability for the same event. Until an odds adapter
  // supplies that second side, no comparison record is emitted.
  return [];
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
  const sorted = articles
    .slice()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
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
    const articles = filterArticlesByWindow(transformRssArticles(data, limit, query), window);
    if (!articles.length) {
      diagnostic.ok = false;
      diagnostic.message = "fetched but no usable RSS articles";
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
          imageUrl: article.image || undefined,
          domain,
          language: article.language || "en",
        };
      }),
    limit,
  );
}

function decodeXmlText(input: string | undefined): string {
  return String(input || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
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
    .filter((term) => term.length >= 4 && !["world", "football", "fifa", "2026"].includes(term));
}

function transformRssArticles(xml: string, limit: number, query: string): NewsArticle[] {
  const channelTitle = xmlTagValue(xml, "title") || "RSS Feed";
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const terms = queryTerms(query);
  const articles = itemMatches
    .map((item, index) => {
      const title = xmlTagValue(item, "title");
      const link = xmlTagValue(item, "link") || xmlTagValue(item, "guid");
      const description = xmlTagValue(item, "description");
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
        domain: source,
        language: "en",
      };
    })
    .filter((article) => article.url && article.title);

  const relevant = terms.length
    ? articles.filter((article) => {
        const haystack = `${article.title} ${article.summary}`.toLowerCase();
        return terms.some((term) => haystack.includes(term));
      })
    : articles;

  return uniqueArticles(relevant.length >= 3 ? relevant : articles, limit);
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

function buildMorningBrief(input: {
  matches: Match[];
  news: NewsArticle[];
  sourceLabel: string;
  dateKey: ScheduleDateKey;
  aggregation: NewsAggregationMeta;
  curation?: AiNewsCuration;
}): MorningBrief {
  const finishedMatches = input.matches.filter((match) => match.status === "finished");
  const headlineMatch = finishedMatches[0] || input.matches[0];
  const topNews = input.news[0];
  const issueDate = scheduleDateMeta[input.dateKey].date;
  const edition = `${issueDate} 早报`;
  const fallbackTitle = headlineMatch
    ? `世界杯早报：${headlineMatch.homeTeam} vs ${headlineMatch.awayTeam}`
    : "世界杯早报：新闻、赛程与市场信号";
  const matchSummary = input.matches.length
    ? `${scheduleDateMeta[input.dateKey].listLabel}共 ${input.matches.length} 场，已完赛 ${finishedMatches.length} 场。`
    : "暂无比赛结果源返回。";
  const newsSummary = topNews ? `头条新闻：${topNews.title}` : "新闻源暂未返回可用条目。";
  return {
    issueDate,
    edition,
    title: input.curation?.title || fallbackTitle,
    summary: input.curation?.summary || `${matchSummary}${newsSummary}`,
    quote: input.curation?.quote || "",
    sourceLabel: input.sourceLabel,
    updatedAt: new Date().toISOString(),
    matches: input.matches,
    news: input.news,
    gossipItems: [],
    aggregation: input.aggregation,
  };
}

export async function getAggregatedOdds(): Promise<{
  oddsMatches: OddsMatch[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const snapshotKey = `odds:v2:world-cup:${updatedAt}`;
  const persisted = await readSnapshotCache<OddsMatch[]>(snapshotKey);
  if (persisted?.payload.length) {
    return {
      oddsMatches: persisted.payload,
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "odds", persisted.computedAt)],
    };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const sources = sortEnabledSources(dataSources, "odds");
  for (const source of sources) {
    try {
      if (source.adapter !== "the-odds-api") continue;
      const { data, diagnostic } = await fetchJsonFromSource<TheOddsApiEvent[]>(source, {
        regions: "eu",
        markets: "h2h",
        oddsFormat: "decimal",
        dateFormat: "iso",
      });
      diagnostics.push(diagnostic);
      const oddsMatches = transformTheOddsApi(data);
      if (!oddsMatches.length) continue;
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
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  const stale = await readSnapshotCache<OddsMatch[]>(snapshotKey, { allowStale: true });
  if (stale?.payload.length) {
    return {
      oddsMatches: stale.payload,
      source: "cache",
      diagnostics: [...diagnostics, snapshotDiagnostic(snapshotKey, "odds", stale.computedAt, true)],
    };
  }

  return { oddsMatches: [], source: "fallback", diagnostics };
}

export async function getAggregatedTeams(): Promise<{
  teams: Team[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const snapshotKey = `teams:v4:world-cup:${updatedAt}`;
  const persisted = await readSnapshotCache<Team[]>(snapshotKey);
  if (persisted?.payload.length) {
    return {
      teams: persisted.payload,
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "team-content", persisted.computedAt)],
    };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const sources = sortEnabledSources(dataSources, "team-content");
  const teamLists: Team[][] = [];
  let primarySourceId: string | null = null;

  for (const source of sources) {
    try {
      let teams: Team[] = [];
      if (source.adapter === "football-data-org") {
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

  const teams = mergeTeamLists(teamLists);
  if (teams.length) {
    await upsertSnapshotCache({
      snapshotKey,
      feature: "teams",
      sourceMode: "remote",
      sourceId: primarySourceId || "multi-source-teams",
      payload: teams,
      diagnostics,
      ttlSeconds: Math.min(
        ...sources.map((source) => getEffectiveRefreshSeconds(source)),
      ),
    });
    return { teams, source: "remote", diagnostics };
  }

  const stale = await readSnapshotCache<Team[]>(snapshotKey, { allowStale: true });
  if (stale?.payload.length) {
    return {
      teams: stale.payload,
      source: "cache",
      diagnostics: [
        ...diagnostics,
        snapshotDiagnostic(snapshotKey, "team-content", stale.computedAt, true),
      ],
    };
  }
  return { teams: [], source: "fallback", diagnostics };
}

export async function getAggregatedMatches(dateKey: ScheduleDateKey): Promise<{
  matches: Match[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const snapshotKey = `matches:v4:${dateKey}:${dateKeyToSourceDate[dateKey]}:${updatedAt}`;
  const persisted = await readSnapshotCache<Match[]>(snapshotKey);
  if (persisted?.payload.length) {
    return {
      matches: persisted.payload,
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "schedule", persisted.computedAt)],
    };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const scoreSources = sortEnabledSources(dataSources, "scores");

  for (const source of scoreSources) {
    try {
      let matches: Match[] = [];
      if (source.adapter === "football-data-org") {
        const { data, diagnostic } = await fetchJsonFromSource<FootballDataMatchesResponse>(source, {
          season: 2026,
        });
        diagnostics.push(diagnostic);
        matches = transformFootballDataMatches(data, dateKey);
      } else if (source.adapter === "worldcupapi-com") {
        const { data, diagnostic } = await fetchJsonFromSource<unknown>(source, {
          date: dateKeyToSourceDate[dateKey],
        });
        diagnostics.push(diagnostic);
        matches = transformWorldCupApiMatches(data, dateKey);
      } else if (source.adapter === "thesportsdb") {
        const { data, diagnostic } = await fetchJsonFromSource<TheSportsDbEventsResponse>(source, {
          id: 4429,
          s: 2026,
        });
        diagnostics.push(diagnostic);
        matches = transformTheSportsDbMatches(data, dateKey);
      }
      if (!matches.length) continue;

      const oddsResult = await getAggregatedOdds();
      const enrichedMatches = mergeOddsIntoMatches(matches, oddsResult.oddsMatches);
      const combinedDiagnostics = [...diagnostics, ...oddsResult.diagnostics];
      await upsertSnapshotCache({
        snapshotKey,
        feature: "matches",
        sourceMode: "remote",
        sourceId: source.id,
        payload: enrichedMatches,
        diagnostics: combinedDiagnostics,
        ttlSeconds: getEffectiveRefreshSeconds(source),
      });
      return { matches: enrichedMatches, source: "remote", diagnostics: combinedDiagnostics };
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
      const matches = transformOpenFootballMatches(data, dateKey);
      if (matches.length > 0) {
        const oddsResult = await getAggregatedOdds();
        const enrichedMatches = mergeOddsIntoMatches(matches, oddsResult.oddsMatches);
        const combinedDiagnostics = [...diagnostics, ...oddsResult.diagnostics];
        await upsertSnapshotCache({
          snapshotKey,
          feature: "matches",
          sourceMode: "remote",
          sourceId: source.id,
          payload: enrichedMatches,
          diagnostics: combinedDiagnostics,
          ttlSeconds: getEffectiveRefreshSeconds(source),
        });
        return {
          matches: enrichedMatches,
          source: "remote",
          diagnostics: combinedDiagnostics,
        };
      }
    } catch (error) {
      diagnostics.push(error as SourceDiagnostic);
    }
  }

  const stale = await readSnapshotCache<Match[]>(snapshotKey, { allowStale: true });
  if (stale?.payload.length) {
    return {
      matches: stale.payload,
      source: "cache",
      diagnostics: [
        ...diagnostics,
        snapshotDiagnostic(snapshotKey, "schedule", stale.computedAt, true),
      ],
    };
  }

  const storedOfficialMatches = (
    await getStoredOfficialMatches<FifaScheduleRecord>(scheduleDateMeta[dateKey].date)
  ).map(fifaRecordToMatch);
  if (storedOfficialMatches.length > 0) {
    const oddsResult = await getAggregatedOdds();
    const enrichedMatches = mergeOddsIntoMatches(storedOfficialMatches, oddsResult.oddsMatches);
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
      payload: enrichedMatches,
      diagnostics: [...diagnostics, databaseDiagnostic, ...oddsResult.diagnostics],
      ttlSeconds: 86400,
    });
    return {
      matches: enrichedMatches,
      source: "cache",
      diagnostics: [...diagnostics, databaseDiagnostic, ...oddsResult.diagnostics],
    };
  }

  const oddsResult = await getAggregatedOdds();
  const fallbackMatches = mergeOddsIntoMatches(matchesByDate[dateKey], oddsResult.oddsMatches);
  await upsertSnapshotCache({
    snapshotKey,
    feature: "matches",
    sourceMode: "fallback",
    sourceId: "fifa-official-pdf",
    payload: fallbackMatches,
    diagnostics: [...diagnostics, ...oddsResult.diagnostics],
    ttlSeconds: 300,
  });
  return {
    matches: fallbackMatches,
    source: "fallback",
    diagnostics: [...diagnostics, ...oddsResult.diagnostics],
  };
}

export async function getAggregatedRadar(): Promise<{
  radarMatches: RadarMatch[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { dataSources, updatedAt } = await readAdminConfig();
  const snapshotKey = `radar:v3:world-cup:${updatedAt}`;
  const persisted = await readSnapshotCache<RadarMatch[]>(snapshotKey);
  if (persisted?.payload.length) {
    return {
      radarMatches: persisted.payload,
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "prediction-market", persisted.computedAt)],
    };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const marketSources = sortEnabledSources(dataSources, "prediction-market");

  for (const source of marketSources) {
    try {
      if (source.adapter !== "polymarket-gamma") continue;
      const { data, diagnostic } = await fetchJsonFromSource<PolymarketEvent[]>(source, {
        limit: 50,
        search: "World Cup",
      });
      diagnostics.push(diagnostic);
      const transformed = transformPolymarketEvents(data);
      if (transformed.length > 0) {
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
        snapshotDiagnostic(snapshotKey, "prediction-market", stale.computedAt, true),
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
} = {}): Promise<{
  articles: NewsArticle[];
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
  aggregation: NewsAggregationMeta;
  curation?: AiNewsCuration;
}> {
  const query = options.query?.trim() || defaultNewsQuery;
  const limit = Math.min(Math.max(options.limit || 12, 1), 30);
  const publishedAfter = options.publishedAfter ? new Date(options.publishedAfter) : undefined;
  const publishedBefore = options.publishedBefore ? new Date(options.publishedBefore) : undefined;
  const window: NewsFetchWindow = {
    publishedAfter: publishedAfter && Number.isFinite(publishedAfter.getTime()) ? publishedAfter : undefined,
    publishedBefore: publishedBefore && Number.isFinite(publishedBefore.getTime()) ? publishedBefore : undefined,
  };
  const { dataSources, aiProviders, primaryAiProviderId, updatedAt } = await readAdminConfig();
  const windowKey = `${window.publishedAfter?.toISOString() || "any"}:${window.publishedBefore?.toISOString() || "any"}`;
  const snapshotKey = snapshotKeyFor("news:v2", `${query}:${limit}:${windowKey}`, updatedAt);
  const persisted = await readSnapshotCache<{
    articles: NewsArticle[];
    aggregation: NewsAggregationMeta;
    curation?: AiNewsCuration;
    diagnostics: SourceDiagnostic[];
  }>(snapshotKey);
  if (persisted?.payload.articles.length) {
    return {
      articles: persisted.payload.articles,
      source: "cache",
      diagnostics: [
        ...persisted.payload.diagnostics,
        snapshotDiagnostic(snapshotKey, "news", persisted.computedAt),
      ],
      aggregation: persisted.payload.aggregation,
      curation: persisted.payload.curation,
    };
  }

  const diagnostics: SourceDiagnostic[] = [];
  const newsSources = sortEnabledSources(dataSources, "news");
  const perSourceLimit = Math.min(Math.max(limit, 8), 20);
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
  const ruleDeduplicated = mergeNewsArticles(rawArticles, limit);
  const orderedAiProviders = aiProviders
    .slice()
    .sort((left, right) => {
      if (left.id === primaryAiProviderId) return -1;
      if (right.id === primaryAiProviderId) return 1;
      return 0;
    });
  const aiResult = await curateNewsWithAi(orderedAiProviders, ruleDeduplicated);
  const articles = applyAiCuration(ruleDeduplicated, aiResult.curation).slice(0, limit);
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
    const ttlSeconds = Math.min(
      ...newsSources.map((source) => getEffectiveRefreshSeconds(source)),
    );
    await upsertSnapshotCache({
      snapshotKey,
      feature: "news",
      sourceMode: "remote",
      sourceId: "multi-source-news",
      payload: { articles, aggregation, curation: aiResult.curation, diagnostics },
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

  const stale = await readSnapshotCache<{
    articles: NewsArticle[];
    aggregation: NewsAggregationMeta;
    curation?: AiNewsCuration;
    diagnostics: SourceDiagnostic[];
  }>(snapshotKey, { allowStale: true });
  if (stale?.payload.articles.length) {
    return {
      articles: stale.payload.articles,
      source: "cache",
      diagnostics: [
        ...diagnostics,
        snapshotDiagnostic(snapshotKey, "news", stale.computedAt, true),
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
    payload: { articles: [], aggregation, diagnostics },
    diagnostics,
    ttlSeconds: 300,
  });
  return { articles: [], source: "fallback", diagnostics, aggregation };
}

export async function getAggregatedMorningBrief(dateKey: ScheduleDateKey): Promise<{
  brief: MorningBrief;
  source: "remote" | "fallback" | "cache";
  diagnostics: SourceDiagnostic[];
}> {
  const { updatedAt } = await readAdminConfig();
  const snapshotKey = `morning:v3:${dateKey}:${dateKeyToSourceDate[dateKey]}:${updatedAt}`;
  const persisted = await readSnapshotCache<MorningBrief>(snapshotKey);
  if (persisted?.payload) {
    return {
      brief: persisted.payload,
      source: "cache",
      diagnostics: [snapshotDiagnostic(snapshotKey, "news", persisted.computedAt)],
    };
  }

  const matchesResult = await getAggregatedMatches(dateKey);
  const teamsInMatches = matchesResult.matches
    .flatMap((match) => [match.homeTeam, match.awayTeam])
    .filter((team) => team && team !== "待定")
    .slice(0, 6);
  const query = teamsInMatches.length
    ? `"World Cup 2026" (${teamsInMatches.join(" OR ")})`
    : defaultNewsQuery;
  const newsResult = await getAggregatedNews({ query, limit: 8 });
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
    aggregation: newsResult.aggregation,
    curation: newsResult.curation,
  });
  const diagnostics = [...matchesResult.diagnostics, ...newsResult.diagnostics];

  await upsertSnapshotCache({
    snapshotKey,
    feature: "morning",
    sourceMode: newsResult.source === "remote" || matchesResult.source === "remote" ? "remote" : "fallback",
    sourceId: "morning-aggregate",
    payload: brief,
    diagnostics,
    ttlSeconds: 900,
  });

  return {
    brief,
    source: newsResult.source === "remote" || matchesResult.source === "remote" ? "remote" : "fallback",
    diagnostics,
  };
}

export async function getDataSourceStatus() {
  const { dataSources, updatedAt } = await readAdminConfig();
  return {
    updatedAt,
    sources: dataSources
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((source) => {
        const refreshPlan = getSourceRefreshPlan(source);
        return {
          id: source.id,
          name: source.name,
          type: source.type,
          adapter: source.adapter,
          enabled: source.enabled,
          priority: source.priority,
          cacheTtlSeconds: source.cacheTtlSeconds,
          refreshSeconds: source.refreshSeconds,
          effectiveRefreshSeconds: refreshPlan.effectiveRefreshSeconds,
          activityMode: refreshPlan.activityMode,
          activeMatchCount: refreshPlan.activeMatchCount,
          nextKickoffAt: refreshPlan.nextKickoffAt,
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
