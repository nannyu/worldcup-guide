/**
 * Match-related transformer functions extracted from aggregate.ts.
 *
 * Converts raw data from various football data sources into the canonical Match shape.
 */
import type {
  ApiFootballEvent,
  ApiFootballFixture,
  ApiFootballLineup,
  ApiFootballLineupPlayer,
  ApiFootballPredictionResponse,
  ApiFootballResponse,
  ApiFootballStatisticGroup,
  FootballDataMatchesResponse,
  OpenFootballWorldCup,
  TheSportsDbEventsResponse,
  WorldCupApiFixture,
} from "../types";
import {
  allMatches,
  ENGLAND_FLAG,
  matchTeamPairKey,
  mergeMatchWithOfficialSource,
  SCOTLAND_FLAG,
  scheduleDateMeta,
  type Match,
  type MatchEvent,
  type MatchKitColors,
  type MatchLineup,
  type MatchPrediction,
  type MatchStatistic,
  type MatchStatus,
  type OddsMatch,
  type ScheduleDateKey,
  type ScheduleUtcDayBounds,
  type SignalType,
  type Team,
} from "@/lib/wc-data";
import { fetchJsonFromSource, type SourceDiagnostic } from "../client";
import type { DataSourceConfig } from "@/lib/admin/config";
import { findBuiltInPlayerProfile } from "@/lib/team-profiles";

// ---------------------------------------------------------------------------
// Shared lookup tables
// ---------------------------------------------------------------------------

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
  "Côte d'Ivoire": { name: "科特迪瓦", flag: "🇨🇮" },
  Ecuador: { name: "厄瓜多尔", flag: "🇪🇨" },
  Egypt: { name: "埃及", flag: "🇪🇬" },
  England: { name: "英格兰", flag: ENGLAND_FLAG },
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
  Scotland: { name: "苏格兰", flag: SCOTLAND_FLAG },
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

// ---------------------------------------------------------------------------
// Local date-range helpers (also used by other transform modules)
// ---------------------------------------------------------------------------

export function sourceDateFor(
  dateKey: ScheduleDateKey,
  options?: { sourceDate?: string; dateRange?: ScheduleUtcDayBounds },
): string {
  return options?.sourceDate || options?.dateRange?.date || scheduleDateMeta[dateKey].date;
}

export function utcDayBoundsForBeijingDate(date: string): ScheduleUtcDayBounds {
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    date,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

export function dateRangeFor(
  dateKey: ScheduleDateKey,
  options?: { dateRange?: ScheduleUtcDayBounds; sourceDate?: string },
): ScheduleUtcDayBounds {
  return options?.dateRange || utcDayBoundsForBeijingDate(sourceDateFor(dateKey, options));
}

// ---------------------------------------------------------------------------
// Shared match utilities (lines 620-665 of original)
// ---------------------------------------------------------------------------

export function matchInDateRange(match: Pick<Match, "kickoffAt">, bounds: ScheduleUtcDayBounds): boolean {
  const kickoffMs = Date.parse(match.kickoffAt || "");
  const startMs = Date.parse(bounds.startUtc);
  const endMs = Date.parse(bounds.endUtc);
  return Number.isFinite(kickoffMs)
    && Number.isFinite(startMs)
    && Number.isFinite(endMs)
    && kickoffMs >= startMs
    && kickoffMs < endMs;
}

export function uniqueMatches(matches: Match[]): Match[] {
  const unique = new Map<string, Match>();
  for (const match of matches) {
    unique.set(match.id || `${match.homeTeam}:${match.awayTeam}:${match.kickoffAt || match.kickoffBj}`, match);
  }
  return Array.from(unique.values());
}

const officialMatchesByTeamPair = allMatches.reduce<Map<string, Match[]>>((lookup, match) => {
  const key = matchTeamPairKey(match);
  lookup.set(key, [...(lookup.get(key) || []), match]);
  return lookup;
}, new Map());

export function matchKickoffDistance(left: Pick<Match, "kickoffAt">, right: Pick<Match, "kickoffAt">): number {
  const leftTime = Date.parse(left.kickoffAt || "");
  const rightTime = Date.parse(right.kickoffAt || "");
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(leftTime - rightTime);
}

export function officialMatchForRemoteMatch(match: Match): Match | undefined {
  const candidates = officialMatchesByTeamPair.get(matchTeamPairKey(match)) || [];
  if (candidates.length === 0) return undefined;
  return candidates
    .slice()
    .sort((left, right) => matchKickoffDistance(left, match) - matchKickoffDistance(right, match))[0];
}

export function canonicalizeMatchesWithOfficialSchedule(matches: Match[]): Match[] {
  return uniqueMatches(matches.map((match) => {
    const official = officialMatchForRemoteMatch(match);
    return official ? mergeMatchWithOfficialSource(official, match) : match;
  }));
}

// ---------------------------------------------------------------------------
// Team / formatting helpers
// ---------------------------------------------------------------------------

export function getTeam(input: string | undefined) {
  if (!input) return { name: "待定", flag: "🏳️" };
  return teamZh[input] || { name: input, flag: "🏳️" };
}

export function canonicalTeamName(input: string | undefined): string {
  const english = input ? englishNameByZh.get(input) || input : "";
  const normalized = english
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
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

export function formatKickoffBj(input: string | undefined): string {
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

export function matchStatus(input: string | undefined, hasScore = false): MatchStatus {
  const status = String(input || "").toUpperCase();
  if (["FINISHED", "FT", "AET", "PEN", "MATCH FINISHED"].includes(status) || hasScore) {
    return "finished";
  }
  if (["IN_PLAY", "PAUSED", "LIVE", "1H", "2H", "HT"].includes(status)) return "live";
  return "upcoming";
}

export function roundFromStage(stage: string | undefined, matchday?: number | null): string {
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

// ---------------------------------------------------------------------------
// Kickoff parsing
// ---------------------------------------------------------------------------

export function parseKickoffToBeijing(date: string | undefined, time: string | undefined): string {
  const kickoffUtc = parseOpenFootballKickoffUtc(date, time);
  if (kickoffUtc) return formatKickoffBj(kickoffUtc);
  if (!date || !time) return "";
  return `${date} ${time}`;
}

export function parseOpenFootballKickoffUtc(date: string | undefined, time: string | undefined): string | undefined {
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

// ---------------------------------------------------------------------------
// OpenFootball transform
// ---------------------------------------------------------------------------

export function transformOpenFootballMatches(
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

// ---------------------------------------------------------------------------
// Football-Data.org transform
// ---------------------------------------------------------------------------

export function transformFootballDataMatches(
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

// ---------------------------------------------------------------------------
// API-Football match status & round helpers
// ---------------------------------------------------------------------------

export function apiFootballMatchStatus(status: string | undefined): MatchStatus {
  const value = String(status || "").toUpperCase();
  if (["FT", "AET", "PEN"].includes(value)) return "finished";
  if (["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"].includes(value)) return "live";
  return "upcoming";
}

export function apiFootballRoundLabel(round: string | undefined): string {
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

// ---------------------------------------------------------------------------
// API-Football event / lineup / statistic transformers
// ---------------------------------------------------------------------------

export function apiFootballEventType(event: ApiFootballEvent): MatchEvent["type"] | undefined {
  const type = String(event.type || "").toLowerCase();
  const detail = String(event.detail || "").toLowerCase();
  if (type === "goal" && detail.includes("own")) return "og";
  if (type === "goal" && detail.includes("penalty")) return "penalty";
  if (type === "goal") return "goal";
  if (type === "card" && detail.includes("red")) return "red";
  if (type === "card" && detail.includes("yellow")) return "yellow";
  if (type === "subst") return "subst";
  return undefined;
}

export function apiFootballTeamSide(teamId: number | undefined, fixture: ApiFootballFixture): "home" | "away" {
  return teamId && teamId === fixture.teams?.away?.id ? "away" : "home";
}

export function transformApiFootballEvents(fixture: ApiFootballFixture): MatchEvent[] {
  return (fixture.events || []).flatMap((event) => {
    const type = apiFootballEventType(event);
    if (!type) return [];
    const minute = Number(event.time?.elapsed || 0) + Number(event.time?.extra || 0);
    return [{
      minute: Number.isFinite(minute) && minute > 0 ? minute : 0,
      type,
      playerId: event.player?.id,
      player: event.player?.name || "Unknown",
      assistPlayerId: event.assist?.id,
      assistPlayer: event.assist?.name || undefined,
      team: apiFootballTeamSide(event.team?.id, fixture),
      description: [
        event.detail,
        type === "subst" && event.assist?.name
          ? `On: ${event.assist.name}`
          : event.assist?.name
            ? `Assist: ${event.assist.name}`
            : "",
        event.comments || "",
      ]
        .filter(Boolean)
        .join(" · "),
    }];
  });
}

export function transformApiFootballLineups(fixture: ApiFootballFixture): MatchLineup[] {
  return (fixture.lineups || []).map((lineup) => {
    const teamName = getTeam(lineup.team?.name).name;
    const player = (item: { player?: ApiFootballLineupPlayer }): MatchLineup["startXI"][number] => {
      const profile = findBuiltInPlayerProfile(teamName, {
        number: item.player?.number,
        name: item.player?.name,
      });
      return {
        id: item.player?.id,
        name: item.player?.name || profile?.name || "Unknown",
        nameZh: profile?.nameZh,
        fullName: profile?.name,
        number: item.player?.number,
        position: item.player?.pos,
        grid: item.player?.grid || undefined,
      };
    };
    return {
      team: apiFootballTeamSide(lineup.team?.id, fixture),
      teamName,
      formation: lineup.formation,
      coach: lineup.coach?.name,
      colors: lineup.team?.colors,
      startXI: (lineup.startXI || []).map(player).filter((item) => item.name !== "Unknown"),
      substitutes: (lineup.substitutes || []).map(player).filter((item) => item.name !== "Unknown"),
    };
  });
}

export function transformApiFootballStatistics(fixture: ApiFootballFixture): MatchStatistic[] {
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

// ---------------------------------------------------------------------------
// API-Football preview / fixture ID helper
// ---------------------------------------------------------------------------

export function apiFootballPreview(lineups: MatchLineup[], statistics: MatchStatistic[]): string {
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

export function apiFootballFixtureIdFromMatchId(id: string): number | undefined {
  const value = Number(id.replace(/^api-football-/, ""));
  return Number.isFinite(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// API-Football prediction helpers
// ---------------------------------------------------------------------------

export function parsePercentValue(input: string | number | undefined): number {
  const value = typeof input === "number" ? input : Number(String(input || "").replace("%", "").trim());
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

export function normalizePredictionPercent(
  input: ApiFootballPredictionResponse["response"],
): Map<number, MatchPrediction> {
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

// ---------------------------------------------------------------------------
// API-Football main match transformer
// ---------------------------------------------------------------------------

export function transformApiFootballMatches(
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

// ---------------------------------------------------------------------------
// API-Football fixture detail merge
// ---------------------------------------------------------------------------

export function mergeApiFootballFixtureDetails(
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

// ---------------------------------------------------------------------------
// WorldCupAPI.com transform
// ---------------------------------------------------------------------------

export function transformWorldCupApiMatches(
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

// ---------------------------------------------------------------------------
// TheSportsDB transform
// ---------------------------------------------------------------------------

export function transformTheSportsDbMatches(
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

// ---------------------------------------------------------------------------
// Source config helpers & API-Football fetchers (lines 1634-1708)
// ---------------------------------------------------------------------------

export function enabledSourceById(dataSources: DataSourceConfig[], id: string): DataSourceConfig | undefined {
  return dataSources.find((source) => source.id === id && source.enabled && source.apiKey);
}

export async function fetchApiFootballFixturesForIds(
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

export async function fetchApiFootballPredictionsForFixtureIds(
  source: DataSourceConfig | undefined,
  fixtureIds: number[],
  diagnostics: SourceDiagnostic[],
): Promise<Map<number, MatchPrediction>> {
  const predictions = new Map<number, MatchPrediction>();
  const uniqueIds = Array.from(new Set(fixtureIds.filter((id) => Number.isFinite(id))));
  if (!source || !uniqueIds.length) return predictions;

  const BATCH_SIZE = 5;
  const batches: number[][] = [];
  for (let i = 0; i < Math.min(uniqueIds.length, 32); i += BATCH_SIZE) {
    batches.push(uniqueIds.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.allSettled(
    batches.map(async (batch) => {
      const batchPredictions = new Map<number, MatchPrediction>();
      for (const fixtureId of batch) {
        try {
          const { data, diagnostic } = await fetchJsonFromSource<ApiFootballPredictionResponse>(source, {
            fixture: fixtureId,
          });
          diagnostics.push(diagnostic);
          for (const [id, prediction] of normalizePredictionPercent(data.response).entries()) {
            batchPredictions.set(id, prediction);
          }
        } catch (error) {
          diagnostics.push(error as SourceDiagnostic);
        }
      }
      return batchPredictions;
    }),
  );

  for (const result of batchResults) {
    if (result.status === "fulfilled") {
      for (const [id, pred] of result.value) predictions.set(id, pred);
    }
  }
  return predictions;
}
