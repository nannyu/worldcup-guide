/**
 * Odds-related transformer functions.
 *
 * Extracted from aggregate.ts during the data-sources refactoring.
 * Handles fetching, normalizing, and merging odds data from
 * API-Football, The Odds API, and Odds-API.io into canonical OddsMatch records.
 */

import { type DataSourceConfig } from "@/lib/admin/config";
import {
  fetchJsonFromSource,
  type SourceDiagnostic,
} from "@/lib/data-sources/client";
import {
  allMatches,
  matchTeamPairKey,
  type Match,
  type OddsMatch,
  type ScheduleUtcDayBounds,
} from "@/lib/wc-data";
import {
  readLatestSnapshotCache,
} from "@/lib/db/queries/data-cache";
import {
  readLatestOddsMarketSnapshots,
  readPreKickoffOddsMarketSnapshots,
} from "@/lib/db/queries/market-snapshots";
import {
  getStoredCanonicalMatches,
} from "@/lib/db/queries/world-cup";
import {
  type ApiFootballFixture,
  type ApiFootballLiveOddsResponse,
  type ApiFootballOddsResponse,
  type OddsApiIoEvent,
  type TheOddsApiEvent,
} from "../types";

// ---------------------------------------------------------------------------
// Team name helpers (local copies used by odds transforms)
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
  "Côte d’Ivoire": { name: "科特迪瓦", flag: "🇨🇮" },
  "Côte d'Ivoire": { name: "科特迪瓦", flag: "🇨🇮" },
  Ecuador: { name: "厄瓜多尔", flag: "🇪🇨" },
  Egypt: { name: "埃及", flag: "🇪🇬" },
  England: { name: "英格兰", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
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
  Scotland: { name: "苏格兰", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
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

function getTeam(input: string | undefined) {
  if (!input) return { name: "待定", flag: "🏳️" };
  return teamZh[input] || { name: input, flag: "🏳️" };
}

function canonicalTeamName(input: string | undefined): string {
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

function matchKickoffDistance(left: Pick<Match, "kickoffAt">, right: Pick<Match, "kickoffAt">): number {
  const leftTime = Date.parse(left.kickoffAt || "");
  const rightTime = Date.parse(right.kickoffAt || "");
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(leftTime - rightTime);
}

// ---------------------------------------------------------------------------
// Core odds helpers
// ---------------------------------------------------------------------------

export function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function normalizedOddsProbability(homeOdds: number, drawOdds: number, awayOdds: number) {
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

export function parseOddValue(value: string | number | undefined): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value || "").trim());
  return Number.isFinite(parsed) && parsed > 1 ? parsed : undefined;
}

export function isMatchWinnerMarket(name: string | undefined): boolean {
  return /match winner|1x2|winner|full time result/i.test(String(name || ""));
}

export function oddsSideLabel(
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

export function addOddsTriple(
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

export function buildApiFootballOddsMatch(input: {
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

// ---------------------------------------------------------------------------
// API-Football odds transformers
// ---------------------------------------------------------------------------

export function transformApiFootballPreMatchOdds(
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

export function transformApiFootballLiveOdds(
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

// ---------------------------------------------------------------------------
// The Odds API transformer
// ---------------------------------------------------------------------------

export function transformTheOddsApi(data: TheOddsApiEvent[]): OddsMatch[] {
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

// ---------------------------------------------------------------------------
// Odds-API.io transformer
// ---------------------------------------------------------------------------

export function oddsApiIoEventList(data: OddsApiIoEvent[] | { data?: OddsApiIoEvent[]; events?: OddsApiIoEvent[] }): OddsApiIoEvent[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.events)) return data.events;
  return [];
}

export function transformOddsApiIo(data: OddsApiIoEvent[]): OddsMatch[] {
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

// ---------------------------------------------------------------------------
// Odds-API.io fetcher
// ---------------------------------------------------------------------------

export async function fetchOddsApiIoOdds(source: DataSourceConfig, diagnostics: SourceDiagnostic[]): Promise<OddsMatch[]> {
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

// ---------------------------------------------------------------------------
// Merge odds into canonical matches
// ---------------------------------------------------------------------------

export function mergeOddsIntoMatches(matches: Match[], odds: OddsMatch[]): Match[] {
  return matches.map((match) => {
    const matched = odds.find((item) =>
      item.matchId === match.id
      || (
        canonicalTeamName(item.homeTeam) === canonicalTeamName(match.homeTeam)
        && canonicalTeamName(item.awayTeam) === canonicalTeamName(match.awayTeam)
        && item.kickoffBj === match.kickoffBj
      )
    );
    if (!matched) return match;
    return {
      ...match,
      oddsImpliedHome: matched.homeProbability,
      oddsImpliedDraw: matched.drawProbability,
      oddsImpliedAway: matched.awayProbability,
      oddsSource: matched.source,
      preMatchProbabilityUpdatedAt: matched.probabilityCapturedAt || matched.updatedAt,
      preMatchProbabilityTargetAt: matched.preMatchTargetAt,
      updatedAt: `${match.updatedAt} · ${matched.source} ${matched.bookmakerCount} 家均值`,
    };
  });
}

// ---------------------------------------------------------------------------
// Odds enrichment helpers
// ---------------------------------------------------------------------------

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

export function nearestMatchForOddsMatch(oddsMatch: OddsMatch, matches: Match[]): Match | undefined {
  const teamPair = matchTeamPairKey(oddsMatch);
  const candidates = matches.filter((match) => matchTeamPairKey(match) === teamPair);
  if (!candidates.length) return undefined;
  return candidates
    .slice()
    .sort((left, right) => matchKickoffDistance(left, oddsMatch) - matchKickoffDistance(right, oddsMatch))[0];
}

export function enrichOddsMatchWithStoredMatch(oddsMatch: OddsMatch, match: Match): OddsMatch {
  return {
    ...oddsMatch,
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeFlag: match.homeFlag,
    awayFlag: match.awayFlag,
    kickoffAt: match.kickoffAt || oddsMatch.kickoffAt,
    kickoffBj: match.kickoffBj || oddsMatch.kickoffBj,
    group: match.group,
    round: match.round,
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
  };
}

export async function enrichOddsMatchesWithStoredMatches(oddsMatches: OddsMatch[]): Promise<OddsMatch[]> {
  if (!oddsMatches.length) return oddsMatches;
  const bounds = tournamentScheduleUtcBounds();
  const storedMatches = bounds ? await getStoredCanonicalMatches(bounds) : [];
  const canonicalMatches = storedMatches.length ? storedMatches : allMatches;
  return oddsMatches.map((oddsMatch) => {
    const match = nearestMatchForOddsMatch(oddsMatch, canonicalMatches);
    return match ? enrichOddsMatchWithStoredMatch(oddsMatch, match) : oddsMatch;
  });
}

async function latestCanonicalOdds(): Promise<OddsMatch[]> {
  const marketHistory = await readLatestOddsMarketSnapshots();
  if (marketHistory.length) return marketHistory;
  const latestSnapshot = await readLatestSnapshotCache<OddsMatch[]>("odds", { allowStale: true });
  return latestSnapshot?.payload || [];
}

async function preMatchCanonicalOdds(matches: Match[]): Promise<OddsMatch[]> {
  const preKickoffOdds = await enrichOddsMatchesWithStoredMatches(await readPreKickoffOddsMarketSnapshots(matches));
  const usedMatchIds = new Set(preKickoffOdds.map((odds) => odds.matchId).filter(Boolean));
  const needsUpcomingFallback = matches.some((match) => match.status === "upcoming" && !usedMatchIds.has(match.id));
  if (!needsUpcomingFallback) return preKickoffOdds;

  const latestOdds = await latestCanonicalOdds();
  const fallbackOdds = latestOdds.filter((oddsMatch) => {
    const match = nearestMatchForOddsMatch(oddsMatch, matches);
    return match?.status === "upcoming" && !usedMatchIds.has(match.id);
  });
  return [...preKickoffOdds, ...fallbackOdds];
}

export async function enrichMatchesWithLatestCanonicalOdds(
  matches: Match[],
  liveScoresOnly = false,
): Promise<Match[]> {
  if (liveScoresOnly || !matches.length) return matches;
  const odds = await preMatchCanonicalOdds(matches);
  return odds.length ? mergeOddsIntoMatches(matches, odds) : matches;
}
