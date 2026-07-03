import fifaScheduleData from "@/data/fifa-schedule.json";

// 基础数据层只保留 FIFA 官方赛程快照。球队内容、比分、新闻和市场数据
// 必须由已配置的数据源返回；缺失时使用空集合，不提供演示数据。

export type MatchStatus = "live" | "upcoming" | "finished";
export type SignalType = "value" | "hot" | "close" | "none";
export type ScheduleDateKey = "yesterday" | "today" | "tomorrow";

export interface MatchEvent {
  minute: number;
  type: "goal" | "yellow" | "red" | "penalty" | "og" | "subst";
  playerId?: number;
  player: string;
  assistPlayerId?: number;
  assistPlayer?: string;
  team: "home" | "away";
  description?: string;
}

export interface MatchLineupPlayer {
  id?: number;
  name: string;
  nameZh?: string;
  fullName?: string;
  number?: number;
  position?: string;
  grid?: string;
}

export interface MatchKitColorSet {
  primary?: string;
  number?: string;
  border?: string;
}

export interface MatchKitColors {
  player?: MatchKitColorSet;
  goalkeeper?: MatchKitColorSet;
}

export interface MatchLineup {
  team: "home" | "away";
  teamName: string;
  formation?: string;
  coach?: string;
  colors?: MatchKitColors;
  startXI: MatchLineupPlayer[];
  substitutes: MatchLineupPlayer[];
}

export interface MatchStatistic {
  team: "home" | "away";
  teamName: string;
  stats: Array<{
    type: string;
    value: string | number | null;
  }>;
}

export interface MatchPrediction {
  source: string;
  winnerName?: string;
  winnerSide?: "home" | "away" | "draw";
  advice?: string;
  homePercent: number;
  drawPercent: number;
  awayPercent: number;
  updatedAt?: string;
}

export interface Match {
  id: string;
  providerFixtureId?: number;
  homeTeam: string;
  awayTeam: string;
  homeCode?: string;
  awayCode?: string;
  homeFlag: string;
  awayFlag: string;
  kickoffAt?: string;
  homeScore: number | null;
  awayScore: number | null;
  kickoffBj: string;
  group: string;
  round: string;
  status: MatchStatus;
  signal: SignalType;
  signalText: string;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  oddsImpliedHome: number;
  oddsImpliedDraw: number;
  oddsImpliedAway: number;
  venue: string;
  highlights?: string;
  events?: MatchEvent[];
  lineups?: MatchLineup[];
  statistics?: MatchStatistic[];
  prediction?: MatchPrediction;
  oddsSource?: string;
  preMatchProbabilityUpdatedAt?: string;
  preMatchProbabilityTargetAt?: string;
  previewText: string;
  aiBriefZh?: string;
  aiBriefEn?: string;
  aiBriefProvider?: string;
  updatedAt: string;
}

export interface FifaScheduleRecord {
  matchNo: number;
  stage: string;
  group?: string;
  date: string;
  easternDate: string;
  easternTime: string;
  localDate: string;
  localTime: string;
  localUtcOffset: string;
  kickoffBeijing: string;
  city: string;
  venue: string;
  home: {
    code?: string;
    name: string;
  };
  away: {
    code?: string;
    name: string;
  };
}

interface FifaScheduleData {
  source: {
    name: string;
    url: string;
    downloadedAt: string;
    extractedAt: string;
    note: string;
  };
  matches: FifaScheduleRecord[];
}

const fifaSchedule = fifaScheduleData as FifaScheduleData;

export const SCOTLAND_FLAG = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";
export const ENGLAND_FLAG = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";

const teamDisplay: Record<string, { name: string; flag: string }> = {
  MEX: { name: "墨西哥", flag: "🇲🇽" },
  RSA: { name: "南非", flag: "🇿🇦" },
  KOR: { name: "韩国", flag: "🇰🇷" },
  CZE: { name: "捷克", flag: "🇨🇿" },
  CAN: { name: "加拿大", flag: "🇨🇦" },
  BIH: { name: "波黑", flag: "🇧🇦" },
  USA: { name: "美国", flag: "🇺🇸" },
  PAR: { name: "巴拉圭", flag: "🇵🇾" },
  HAI: { name: "海地", flag: "🇭🇹" },
  SCO: { name: "苏格兰", flag: SCOTLAND_FLAG },
  AUS: { name: "澳大利亚", flag: "🇦🇺" },
  TUR: { name: "土耳其", flag: "🇹🇷" },
  BRA: { name: "巴西", flag: "🇧🇷" },
  MAR: { name: "摩洛哥", flag: "🇲🇦" },
  QAT: { name: "卡塔尔", flag: "🇶🇦" },
  SUI: { name: "瑞士", flag: "🇨🇭" },
  CIV: { name: "科特迪瓦", flag: "🇨🇮" },
  ECU: { name: "厄瓜多尔", flag: "🇪🇨" },
  GER: { name: "德国", flag: "🇩🇪" },
  CUW: { name: "库拉索", flag: "🇨🇼" },
  NED: { name: "荷兰", flag: "🇳🇱" },
  JPN: { name: "日本", flag: "🇯🇵" },
  SWE: { name: "瑞典", flag: "🇸🇪" },
  TUN: { name: "突尼斯", flag: "🇹🇳" },
  KSA: { name: "沙特阿拉伯", flag: "🇸🇦" },
  URU: { name: "乌拉圭", flag: "🇺🇾" },
  ESP: { name: "西班牙", flag: "🇪🇸" },
  CPV: { name: "佛得角", flag: "🇨🇻" },
  IRN: { name: "伊朗", flag: "🇮🇷" },
  NZL: { name: "新西兰", flag: "🇳🇿" },
  BEL: { name: "比利时", flag: "🇧🇪" },
  EGY: { name: "埃及", flag: "🇪🇬" },
  FRA: { name: "法国", flag: "🇫🇷" },
  SEN: { name: "塞内加尔", flag: "🇸🇳" },
  IRQ: { name: "伊拉克", flag: "🇮🇶" },
  NOR: { name: "挪威", flag: "🇳🇴" },
  ARG: { name: "阿根廷", flag: "🇦🇷" },
  ALG: { name: "阿尔及利亚", flag: "🇩🇿" },
  AUT: { name: "奥地利", flag: "🇦🇹" },
  JOR: { name: "约旦", flag: "🇯🇴" },
  GHA: { name: "加纳", flag: "🇬🇭" },
  PAN: { name: "巴拿马", flag: "🇵🇦" },
  ENG: { name: "英格兰", flag: ENGLAND_FLAG },
  CRO: { name: "克罗地亚", flag: "🇭🇷" },
  POR: { name: "葡萄牙", flag: "🇵🇹" },
  COD: { name: "刚果民主共和国", flag: "🇨🇩" },
  UZB: { name: "乌兹别克斯坦", flag: "🇺🇿" },
  COL: { name: "哥伦比亚", flag: "🇨🇴" },
};

const venueZh: Record<string, string> = {
  "Estadio Azteca": "阿兹特克体育场",
  "BC Place": "BC 展馆",
  "Toronto Stadium": "多伦多体育场",
  "Estadio Guadalajara": "瓜达拉哈拉体育场",
  "Estadio蒙特雷": "蒙特雷体育场",
  "Estadio Monterrey": "蒙特雷体育场",
  "Atlanta Stadium": "亚特兰大体育场",
  "Boston Stadium": "波士顿体育场",
  "Dallas Stadium": "达拉斯体育场",
  "Houston Stadium": "休斯顿体育场",
  "Kansas City Stadium": "堪萨斯城体育场",
  "Los Angeles Stadium": "洛杉矶体育场",
  "Miami Stadium": "迈阿密体育场",
  "New York New Jersey Stadium": "纽约新泽西体育场",
  "Philadelphia Stadium": "费城体育场",
  "Bay Area Stadium": "旧金山湾区体育场",
  "Seattle Stadium": "西雅图体育场",
};

function formatBeijingKickoff(input: string): string {
  const [, month, day, hour, minute] =
    input.match(/^2026-(\d{2})-(\d{2})T(\d{2}):(\d{2})/) || [];
  return month && day && hour && minute ? `${month}-${day} ${hour}:${minute}` : input;
}

function roundLabel(stage: string): string {
  const labels: Record<string, string> = {
    "Group Stage": "小组赛",
    "Round of 32": "三十二强",
    "Round of 16": "十六强",
    "Quarter-finals": "四分之一决赛",
    "Semi-finals": "半决赛",
    "Bronze Final": "三四名决赛",
    Final: "决赛",
  };
  return labels[stage] || stage;
}

export function isTournamentPlaceholderTeam(input: string | undefined): boolean {
  const value = String(input || "")
    .trim()
    .normalize("NFKD")
    .replace(/\s+/g, " ");
  if (!value) return false;
  const upper = value.toUpperCase();
  return upper === "TBD"
    || upper === "待定"
    || upper === "TO BE DETERMINED"
    || /^[1-3]\s*[A-L]{1,5}$/.test(upper)
    || /^[WL]\s*\d{1,3}$/.test(upper)
    || /^(WINNER|LOSER)(\s+OF)?\s+MATCH\s+\d{1,3}$/.test(upper)
    || /^(WINNER|RUNNER[- ]?UP|SECOND|THIRD|BEST THIRD)\b.*\bGROUP\b/.test(upper)
    || /^[A-L]组第[1-3]$/.test(value)
    || /^最佳第三[（(][A-L/]+组[）)]$/.test(value)
    || /^第\d{1,3}场[胜负]者$/.test(value);
}

function tournamentPlaceholderSeed(input: string | undefined): string | undefined {
  const value = String(input || "")
    .trim()
    .normalize("NFKD")
    .replace(/\s+/g, " ");
  return isTournamentPlaceholderTeam(value) ? value.toUpperCase() : undefined;
}

function tournamentPlaceholderName(seed: string): string {
  const readableBestThird = seed.match(/^最佳第三[（(]([A-L/]+)组[）)]$/);
  if (readableBestThird) return `最佳第三（${readableBestThird[1]}组）`;

  if (/^[A-L]组第[1-3]$/.test(seed)
    || /^第\d{1,3}场[胜负]者$/.test(seed)
  ) {
    return seed;
  }

  const groupSeed = seed.match(/^([1-3])\s*([A-L]{1,5})$/);
  if (groupSeed) {
    const [, place, groups] = groupSeed;
    if (place === "3" && groups.length > 1) {
      return `最佳第三（${groups.split("").join("/")}组）`;
    }
    return `${groups}组第${place}`;
  }

  const matchSeed = seed.match(/^([WL])\s*(\d{1,3})$/);
  if (matchSeed) {
    return `第${matchSeed[2]}场${matchSeed[1] === "W" ? "胜" : "负"}者`;
  }

  const englishMatchSeed = seed.match(/^(WINNER|LOSER)(?:\s+OF)?\s+MATCH\s+(\d{1,3})$/);
  if (englishMatchSeed) {
    return `第${englishMatchSeed[2]}场${englishMatchSeed[1] === "WINNER" ? "胜" : "负"}者`;
  }

  return "待定";
}

function matchSideDisplay(side: FifaScheduleRecord["home"]): { name: string; flag: string; seedCode?: string } {
  if (side.code && teamDisplay[side.code]) return teamDisplay[side.code];
  const seedCode = tournamentPlaceholderSeed(side.name);
  if (seedCode) return { name: tournamentPlaceholderName(seedCode), flag: "🏳️", seedCode };
  return { name: side.name, flag: "🏳️" };
}

export function normalizeMatchPlaceholderTeams(match: Match): Match {
  const homeTeamSeed = tournamentPlaceholderSeed(match.homeTeam);
  const awayTeamSeed = tournamentPlaceholderSeed(match.awayTeam);
  const homeSeed = homeTeamSeed ? tournamentPlaceholderSeed(match.homeCode) || homeTeamSeed : undefined;
  const awaySeed = awayTeamSeed ? tournamentPlaceholderSeed(match.awayCode) || awayTeamSeed : undefined;
  if (!homeSeed && !awaySeed) return match;

  return {
    ...match,
    homeTeam: homeSeed ? tournamentPlaceholderName(homeSeed) : match.homeTeam,
    awayTeam: awaySeed ? tournamentPlaceholderName(awaySeed) : match.awayTeam,
    homeCode: match.homeCode || homeSeed,
    awayCode: match.awayCode || awaySeed,
    homeFlag: homeSeed ? "🏳️" : match.homeFlag,
    awayFlag: awaySeed ? "🏳️" : match.awayFlag,
  };
}

type BracketReference = { outcome: "winner" | "loser"; matchNo: number };
type ResolvedBracketSide = { team: string; flag: string; code?: string };

function matchNoFromId(id: string | undefined): number | undefined {
  const value = Number(String(id || "").match(/^fifa-(\d{1,3})$/)?.[1]);
  return Number.isFinite(value) ? value : undefined;
}

function bracketReference(input: string | undefined): BracketReference | undefined {
  const seed = tournamentPlaceholderSeed(input);
  if (!seed) return undefined;

  const compact = seed.match(/^([WL])\s*(\d{1,3})$/);
  if (compact) {
    return {
      outcome: compact[1] === "W" ? "winner" : "loser",
      matchNo: Number(compact[2]),
    };
  }

  const english = seed.match(/^(WINNER|LOSER)(?:\s+OF)?\s+MATCH\s+(\d{1,3})$/);
  if (english) {
    return {
      outcome: english[1] === "WINNER" ? "winner" : "loser",
      matchNo: Number(english[2]),
    };
  }

  const zh = seed.match(/^第(\d{1,3})场([胜负])者$/);
  if (zh) {
    return {
      outcome: zh[2] === "胜" ? "winner" : "loser",
      matchNo: Number(zh[1]),
    };
  }

  return undefined;
}

function actualMatchSide(match: Match, side: "home" | "away"): ResolvedBracketSide | undefined {
  const team = side === "home" ? match.homeTeam : match.awayTeam;
  if (!team || isTournamentPlaceholderTeam(team)) return undefined;
  const code = side === "home" ? match.homeCode : match.awayCode;
  return {
    team,
    flag: side === "home" ? match.homeFlag : match.awayFlag,
    code: code && !isTournamentPlaceholderTeam(code) ? code : undefined,
  };
}

function resolvedSideForBracketReference(
  reference: BracketReference,
  source: Match | undefined,
): ResolvedBracketSide | undefined {
  if (!source || source.status !== "finished") return undefined;
  if (source.homeScore === null || source.awayScore === null) return undefined;
  if (source.homeScore === source.awayScore) return undefined;

  const winnerSide = source.homeScore > source.awayScore ? "home" : "away";
  const loserSide = winnerSide === "home" ? "away" : "home";
  return actualMatchSide(source, reference.outcome === "winner" ? winnerSide : loserSide);
}

export function resolveKnownBracketPlaceholderTeams(matches: Match[], contextMatches: Match[]): Match[] {
  let resolved = matches.map(normalizeMatchPlaceholderTeams);
  const context = contextMatches.map(normalizeMatchPlaceholderTeams);

  for (let pass = 0; pass < 4; pass += 1) {
    const byMatchNo = new Map<number, Match>();
    for (const match of [...context, ...resolved]) {
      const matchNo = matchNoFromId(match.id);
      if (matchNo) byMatchNo.set(matchNo, match);
    }

    let changed = false;
    resolved = resolved.map((match) => {
      const homeReference = isTournamentPlaceholderTeam(match.homeTeam)
        ? bracketReference(match.homeCode) || bracketReference(match.homeTeam)
        : undefined;
      const awayReference = isTournamentPlaceholderTeam(match.awayTeam)
        ? bracketReference(match.awayCode) || bracketReference(match.awayTeam)
        : undefined;
      const home = homeReference
        ? resolvedSideForBracketReference(homeReference, byMatchNo.get(homeReference.matchNo))
        : undefined;
      const away = awayReference
        ? resolvedSideForBracketReference(awayReference, byMatchNo.get(awayReference.matchNo))
        : undefined;

      if (!home && !away) return match;
      changed = true;
      return {
        ...match,
        homeTeam: home?.team || match.homeTeam,
        awayTeam: away?.team || match.awayTeam,
        homeFlag: home?.flag || match.homeFlag,
        awayFlag: away?.flag || match.awayFlag,
        homeCode: home ? home.code : match.homeCode,
        awayCode: away ? away.code : match.awayCode,
      };
    });

    if (!changed) break;
  }

  return resolved;
}

export function fifaRecordToMatch(record: FifaScheduleRecord): Match {
  const home = matchSideDisplay(record.home);
  const away = matchSideDisplay(record.away);
  return {
    id: `fifa-${record.matchNo}`,
    homeTeam: home.name,
    awayTeam: away.name,
    homeCode: record.home.code || home.seedCode,
    awayCode: record.away.code || away.seedCode,
    homeFlag: home.flag,
    awayFlag: away.flag,
    kickoffAt: record.kickoffBeijing,
    homeScore: null,
    awayScore: null,
    kickoffBj: formatBeijingKickoff(record.kickoffBeijing),
    group: record.group ? `${record.group} 组` : "淘汰赛",
    round: roundLabel(record.stage),
    status: "upcoming",
    signal: "none",
    signalText: "",
    homeWinProb: 0,
    drawProb: 0,
    awayWinProb: 0,
    oddsImpliedHome: 0,
    oddsImpliedDraw: 0,
    oddsImpliedAway: 0,
    venue: `${venueZh[record.venue] || record.venue}，${record.city}`,
    previewText: `FIFA 官方赛程第 ${record.matchNo} 场。PDF 标注 ${record.easternDate} ${record.easternTime}（ET），举办地当地时间 ${record.localDate} ${record.localTime}（${record.localUtcOffset}），北京时间 ${formatBeijingKickoff(record.kickoffBeijing)}。`,
    updatedAt: "FIFA 官方赛程 · 本地快照",
    events: [],
  };
}

export function fifaMatchesOn(date: string): Match[] {
  return fifaSchedule.matches
    .filter((match) => match.kickoffBeijing.slice(0, 10) === date)
    .map(fifaRecordToMatch);
}

export function fifaMatchesInUtcDayBounds(bounds: ScheduleUtcDayBounds): Match[] {
  const startMs = Date.parse(bounds.startUtc);
  const endMs = Date.parse(bounds.endUtc);
  return fifaSchedule.matches
    .filter((match) => {
      const kickoffMs = Date.parse(match.kickoffBeijing);
      return Number.isFinite(kickoffMs) && kickoffMs >= startMs && kickoffMs < endMs;
    })
    .map(fifaRecordToMatch);
}

export interface Team {
  id: string;
  providerTeamId?: number;
  code?: string;
  name: string;
  nameEn: string;
  flag: string;
  group: string;
  rank: number;
  coach: string;
  coachZh?: string;
  formation: string;
  stars: string[];
  style: string;
  hotLevel: number;
  tags: string[];
  talkingPoints: string[];
  groupStandings: {
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor?: number;
    goalsAgainst?: number;
    pts: number;
  };
  crestUrl?: string;
  source?: string;
  starPlayers?: TeamStarPlayer[];
  roster?: PlayerProfile[];
  injuries?: TeamInjury[];
  formSummary?: TeamFormSummary;
  roast?: string;
  championProbability?: number | null;
  sourceUpdatedAt?: string;
}

export interface TeamRoastItem {
  teamCode?: string;
  teamName: string;
  teamNameEn?: string;
  roast: string;
  evidence?: string[];
  articleIds?: string[];
  matchIds?: string[];
  updatedAt: string;
  source: "ai" | "rules";
  aiProvider?: string;
}

export interface TeamRoastSnapshot {
  generatedAt: string;
  refreshDate: string;
  aiUsed: boolean;
  aiProvider?: string;
  message: string;
  newsCount: number;
  matchCount: number;
  items: TeamRoastItem[];
}

export interface PlayerRoastItem {
  teamCode?: string;
  teamName: string;
  teamNameEn?: string;
  playerId: string;
  playerName: string;
  playerNameZh?: string;
  position: string;
  roast: string;
  evidence?: string[];
  articleIds?: string[];
  matchIds?: string[];
  updatedAt: string;
  source: "ai" | "rules";
  aiProvider?: string;
}

export interface PlayerRoastSnapshot {
  generatedAt: string;
  refreshDate: string;
  aiUsed: boolean;
  aiProvider?: string;
  message: string;
  newsCount: number;
  matchCount: number;
  items: PlayerRoastItem[];
}

export interface TeamStarPlayer {
  name: string;
  nameZh?: string;
  position: string;
}

export interface PlayerProfile {
  id: string;
  name: string;
  nameZh?: string;
  shirtNumber?: number;
  position: string;
  club?: string;
  age?: number;
  photoUrl?: string;
  avatarUrl?: string;
  intro?: string;
  career?: string[];
  roast?: string;
}

export interface TeamInjury {
  id: string;
  playerName: string;
  playerId?: number;
  type?: string;
  reason?: string;
  fixtureId?: number;
  fixtureDate?: string;
  updatedAt?: string;
}

export interface TeamFormSummary {
  form?: string;
  lastFive?: string[];
  note?: string;
  updatedAt?: string;
}

export interface GossipItem {
  id: string;
  title: string;
  category: "retirement" | "penalty" | "coach" | "upset" | "topscorer" | "champion" | "meme";
  prob: number;
  volume: string;
  summary: string;
  updatedAt: string;
  source: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary: string;
  imageUrl?: string;
  domain?: string;
  language?: string;
  country?: string;
  sourceText?: string;
  bodySource?: "original-page" | "provider-api" | "source-api" | "summary";
  bodyUpdatedAt?: string;
  bodyZh?: string[];
  bodyEn?: string[];
  body?: string[];
  relatedSources?: string[];
  relatedUrls?: string[];
  sourceCount?: number;
  aiSummary?: string;
  aiKeyPoints?: string[];
  aiScore?: number;
  aiComment?: string;
  editorialScore?: number;
  category?: string;
  titleZh?: string;
  titleEn?: string;
  summaryZh?: string;
  summaryEn?: string;
  keyPointsZh?: string[];
  keyPointsEn?: string[];
  commentZh?: string;
  commentEn?: string;
}

export interface NewsAggregationMeta {
  fetchedSourceCount: number;
  successfulSourceCount: number;
  rawArticleCount: number;
  deduplicatedArticleCount: number;
  aiUsed: boolean;
  aiProvider?: string;
  aiMessage: string;
}

export interface MorningQuote {
  id: string;
  text: string;
  providerName?: string;
  source: "ai" | "fallback";
  inputHash: string;
  generatedAt: string;
  newsArticleIds: string[];
  matchIds: string[];
}

export interface MorningBrief {
  issueDate: string;
  edition: string;
  title: string;
  titleZh?: string;
  summary: string;
  summaryZh?: string;
  quote: string;
  quoteZh?: string;
  quoteHistory?: MorningQuote[];
  sourceLabel: string;
  updatedAt: string;
  matches: Match[];
  news: NewsArticle[];
  gossipItems: GossipItem[];
  aggregation?: NewsAggregationMeta;
}

export interface RadarMatch {
  id: string;
  title?: string;
  eventTitle?: string;
  eventSlug?: string;
  category?: "moneyline" | "spread" | "total" | "halftime" | "corners" | "goals" | "assists" | "shots" | "prop";
  line?: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  homeMarketProb: number;
  awayMarketProb: number;
  homeOddsProb: number;
  awayOddsProb: number;
  diff: number;
  diffLabel: "aligned" | "notable" | "significant";
  diffTeam: "home" | "away";
  diffText: string;
  kickoffBj: string;
  status: MatchStatus;
  updatedAt: string;
  volume?: string;
  volumeUsd?: number;
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  volume24hr?: number;
  marketLabel?: string;
  outcomes?: Array<{
    label: string;
    probability: number;
  }>;
  history: { time: string; market: number; odds: number }[];
}

export interface OddsMatch {
  id: string;
  matchId?: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag?: string;
  awayFlag?: string;
  kickoffAt: string;
  kickoffBj: string;
  group?: string;
  round?: string;
  status?: MatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
  homeProbability: number;
  drawProbability: number;
  awayProbability: number;
  bookmakerCount: number;
  updatedAt: string;
  probabilityCapturedAt?: string;
  preMatchTargetAt?: string;
  source: string;
}

export interface ScheduleDayGroup {
  date: string;
  label: string;
  relativeLabel: string;
  matches: Match[];
}

export interface GroupStandingRow {
  code?: string;
  team: string;
  flag: string;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  championProbability: number | null;
  zone: "qualify" | "pending" | "outside";
}

export interface GroupStanding {
  group: string;
  rows: GroupStandingRow[];
}

function beijingDate(offsetDays: number, now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(now);
  const date = new Date(`${today}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return formatter.format(date);
}

function dateTabLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

const scheduleDateOffsets: Record<ScheduleDateKey, number> = {
  yesterday: -1,
  today: 0,
  tomorrow: 1,
};

const scheduleDateListLabels: Record<ScheduleDateKey, string> = {
  yesterday: "昨日赛程",
  today: "今日赛程",
  tomorrow: "明日赛程",
};

export interface ScheduleUtcDayBounds {
  date?: string;
  startUtc: string;
  endUtc: string;
}

const MIN_NATURAL_DAY_MS = 20 * 60 * 60 * 1000;
const MAX_NATURAL_DAY_MS = 28 * 60 * 60 * 1000;

function localCalendarDate(offsetDays: number, now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeScheduleDate(value: string | null | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return value;
}

function normalizeUtcInstant(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

export function normalizeScheduleUtcDayBounds(input: {
  date?: string | null;
  startUtc?: string | null;
  endUtc?: string | null;
}): ScheduleUtcDayBounds | undefined {
  const startUtc = normalizeUtcInstant(input.startUtc);
  const endUtc = normalizeUtcInstant(input.endUtc);
  if (!startUtc || !endUtc) return undefined;
  const startMs = Date.parse(startUtc);
  const endMs = Date.parse(endUtc);
  const durationMs = endMs - startMs;
  if (durationMs < MIN_NATURAL_DAY_MS || durationMs > MAX_NATURAL_DAY_MS) return undefined;
  const date = normalizeScheduleDate(input.date);
  return date ? { date, startUtc, endUtc } : { startUtc, endUtc };
}

export function beijingScheduleUtcDayBounds(date: string): ScheduleUtcDayBounds | undefined {
  const normalized = normalizeScheduleDate(date);
  if (!normalized) return undefined;
  const start = new Date(`${normalized}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    date: normalized,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

function scheduleDateMetaFor(dateKey: ScheduleDateKey, now = new Date()) {
  const date = beijingDate(scheduleDateOffsets[dateKey], now);
  return {
    date,
    tabLabel: dateTabLabel(date),
    listLabel: scheduleDateListLabels[dateKey],
  };
}

function browserScheduleDateMetaFor(dateKey: ScheduleDateKey, now = new Date()) {
  const date = localCalendarDate(scheduleDateOffsets[dateKey], now);
  return {
    date,
    tabLabel: dateTabLabel(date),
    listLabel: scheduleDateListLabels[dateKey],
  };
}

export function browserScheduleUtcDayBounds(dateKey: ScheduleDateKey, now = new Date()): ScheduleUtcDayBounds {
  const target = new Date(now);
  target.setDate(target.getDate() + scheduleDateOffsets[dateKey]);
  const start = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1);
  return {
    date: localCalendarDate(scheduleDateOffsets[dateKey], now),
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

export function getScheduleDateMeta(now = new Date()): Record<
  ScheduleDateKey,
  { date: string; tabLabel: string; listLabel: string }
> {
  return {
    yesterday: scheduleDateMetaFor("yesterday", now),
    today: scheduleDateMetaFor("today", now),
    tomorrow: scheduleDateMetaFor("tomorrow", now),
  };
}

export function getBrowserScheduleDateMeta(now = new Date()): Record<
  ScheduleDateKey,
  { date: string; tabLabel: string; listLabel: string }
> {
  return {
    yesterday: browserScheduleDateMetaFor("yesterday", now),
    today: browserScheduleDateMetaFor("today", now),
    tomorrow: browserScheduleDateMetaFor("tomorrow", now),
  };
}

export function browserScheduleDateQuery(dateKey: ScheduleDateKey, now = new Date()): string {
  const bounds = browserScheduleUtcDayBounds(dateKey, now);
  return new URLSearchParams({
    dateKey,
    date: bounds.date || browserScheduleDateMetaFor(dateKey, now).date,
    startUtc: bounds.startUtc,
    endUtc: bounds.endUtc,
  }).toString();
}

export const scheduleDateMeta: Record<
  ScheduleDateKey,
  { date: string; tabLabel: string; listLabel: string }
> = {
  get yesterday() {
    return scheduleDateMetaFor("yesterday");
  },
  get today() {
    return scheduleDateMetaFor("today");
  },
  get tomorrow() {
    return scheduleDateMetaFor("tomorrow");
  },
};

export function matchesForDateKey(dateKey: ScheduleDateKey, now = new Date()): Match[] {
  return fifaMatchesOn(scheduleDateMetaFor(dateKey, now).date);
}

export const matchesByDate: Record<ScheduleDateKey, Match[]> = {
  get yesterday() {
    return matchesForDateKey("yesterday");
  },
  get today() {
    return matchesForDateKey("today");
  },
  get tomorrow() {
    return matchesForDateKey("tomorrow");
  },
};

function dynamicMatchesForDateKey(dateKey: ScheduleDateKey): Match[] {
  return new Proxy([] as Match[], {
    get(_target, property) {
      const current = matchesForDateKey(dateKey);
      const value = Reflect.get(current, property, current);
      return typeof value === "function" ? value.bind(current) : value;
    },
  });
}

// Compatibility exports used by existing screens and MCP tools. These now
// contain official FIFA schedule data only.
export const yesterdayMatches = dynamicMatchesForDateKey("yesterday");
export const todayMatches = dynamicMatchesForDateKey("today");
export const tomorrowMatches = dynamicMatchesForDateKey("tomorrow");
export const allMatches = fifaSchedule.matches.map(fifaRecordToMatch);

function groupSortValue(group: string): number {
  const letter = group.match(/[A-Z]/)?.[0] || "Z";
  return letter.charCodeAt(0);
}

export function matchKickoffSortValue(match: Pick<Match, "kickoffAt" | "kickoffBj">): number {
  const kickoffAt = match.kickoffAt ? Date.parse(match.kickoffAt) : NaN;
  if (Number.isFinite(kickoffAt)) return kickoffAt;

  const [monthDay = "", time = ""] = match.kickoffBj.split(" ");
  const fallback = Number(`${monthDay.replace(/\D/g, "")}${time.replace(/\D/g, "")}`);
  return Number.isFinite(fallback) ? fallback : Number.MAX_SAFE_INTEGER;
}

function canonicalMatchName(input: string | undefined) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

export function matchIdentityKey(match: Match): string {
  return `${canonicalMatchName(match.homeTeam)}:${canonicalMatchName(match.awayTeam)}:${match.kickoffBj}`;
}

export function matchTeamPairKey(match: Pick<Match, "homeTeam" | "awayTeam">): string {
  return `${canonicalMatchName(match.homeTeam)}:${canonicalMatchName(match.awayTeam)}`;
}

export function compareMatchesByKickoff(left: Match, right: Match): number {
  return matchKickoffSortValue(left) - matchKickoffSortValue(right)
    || matchIdentityKey(left).localeCompare(matchIdentityKey(right), "zh-CN");
}

export function createMatchSequenceLookup(matches: Match[]): Map<string, number> {
  const lookup = new Map<string, number>();
  matches.slice().sort(compareMatchesByKickoff).forEach((match, index) => {
    const sequence = index + 1;
    lookup.set(match.id, sequence);
    lookup.set(matchIdentityKey(match), sequence);
  });
  return lookup;
}

export function getMatchSequenceNumber(match: Match, lookup: Map<string, number>): number | undefined {
  return lookup.get(match.id) ?? lookup.get(matchIdentityKey(match));
}

export function mergeMatchWithOfficialSource(base: Match, live?: Match): Match {
  if (!live) return base;

  const useLiveHome =
    (isTournamentPlaceholderTeam(base.homeTeam) || isTournamentPlaceholderTeam(base.homeCode))
    && Boolean(live.homeTeam)
    && !isTournamentPlaceholderTeam(live.homeTeam);
  const useLiveAway =
    (isTournamentPlaceholderTeam(base.awayTeam) || isTournamentPlaceholderTeam(base.awayCode))
    && Boolean(live.awayTeam)
    && !isTournamentPlaceholderTeam(live.awayTeam);

  return {
    ...base,
    ...live,
    id: base.id,
    homeTeam: useLiveHome ? live.homeTeam : base.homeTeam || live.homeTeam,
    awayTeam: useLiveAway ? live.awayTeam : base.awayTeam || live.awayTeam,
    homeCode: useLiveHome && live.homeCode && !isTournamentPlaceholderTeam(live.homeCode)
      ? live.homeCode
      : base.homeCode || live.homeCode,
    awayCode: useLiveAway && live.awayCode && !isTournamentPlaceholderTeam(live.awayCode)
      ? live.awayCode
      : base.awayCode || live.awayCode,
    homeFlag: useLiveHome ? live.homeFlag || base.homeFlag : base.homeFlag || live.homeFlag,
    awayFlag: useLiveAway ? live.awayFlag || base.awayFlag : base.awayFlag || live.awayFlag,
    kickoffAt: base.kickoffAt || live.kickoffAt,
    kickoffBj: base.kickoffBj || live.kickoffBj,
    group: base.group,
    round: base.round,
    venue: live.venue || base.venue,
    previewText: live.previewText || base.previewText,
    updatedAt: live.updatedAt || base.updatedAt,
  };
}

export function scheduleDateLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export function relativeBeijingDayLabel(date: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());
  const target = new Date(`${date}T00:00:00+08:00`).getTime();
  const base = new Date(`${today}T00:00:00+08:00`).getTime();
  const diffDays = Math.round((target - base) / (24 * 60 * 60 * 1000));
  if (diffDays === -1) return "昨天";
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "明天";
  if (diffDays === 2) return "后天";
  return "";
}

export const allScheduleDayGroups: ScheduleDayGroup[] = Object.values(
  allMatches.reduce<Record<string, ScheduleDayGroup>>((groups, match) => {
    const date = `2026-${match.kickoffBj.slice(0, 5)}`;
    groups[date] ||= {
      date,
      label: scheduleDateLabel(date),
      relativeLabel: relativeBeijingDayLabel(date),
      matches: [],
    };
    groups[date].matches.push(match);
    return groups;
  }, {}),
)
  .map((group) => ({
    ...group,
    matches: group.matches.slice().sort(compareMatchesByKickoff),
  }))
  .sort((left, right) => left.date.localeCompare(right.date));

export function getGroupStandings(matches: Match[] = allMatches): GroupStanding[] {
  const rows = new Map<string, GroupStandingRow>();

  for (const match of matches) {
    if (!match.group.includes("组")) continue;
    const group = match.group.replace(/\s*组$/, "");
    for (const side of [
      { code: match.homeCode, team: match.homeTeam, flag: match.homeFlag, goalsFor: match.homeScore, goalsAgainst: match.awayScore },
      { code: match.awayCode, team: match.awayTeam, flag: match.awayFlag, goalsFor: match.awayScore, goalsAgainst: match.homeScore },
    ]) {
      const key = `${group}:${side.team}`;
      if (!rows.has(key)) {
        rows.set(key, {
          code: side.code,
          team: side.team,
          flag: side.flag,
          group,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          points: 0,
          championProbability: null,
          zone: "outside",
        });
      }
      const row = rows.get(key);
      if (!row || match.status !== "finished" || side.goalsFor === null || side.goalsAgainst === null) continue;
      row.played += 1;
      row.goalsFor += side.goalsFor;
      row.goalsAgainst += side.goalsAgainst;
      if (side.goalsFor > side.goalsAgainst) {
        row.won += 1;
        row.points += 3;
      } else if (side.goalsFor === side.goalsAgainst) {
        row.drawn += 1;
        row.points += 1;
      } else {
        row.lost += 1;
      }
    }
  }

  const groups = new Map<string, GroupStandingRow[]>();
  for (const row of rows.values()) {
    groups.set(row.group, [...(groups.get(row.group) || []), row]);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => groupSortValue(left) - groupSortValue(right))
    .map(([group, groupRows]) => ({
      group,
      rows: groupRows
        .slice()
        .sort((left, right) =>
          right.points - left.points
          || (right.goalsFor - right.goalsAgainst) - (left.goalsFor - left.goalsAgainst)
          || right.goalsFor - left.goalsFor
          || left.team.localeCompare(right.team, "zh-CN"),
        )
        .map((row, index) => ({
          ...row,
          zone: index < 2 ? "qualify" : index === 2 ? "pending" : "outside",
        })),
    }));
}

export function teamsFromOfficialSchedule(): Team[] {
  return getGroupStandings().flatMap((group) =>
    group.rows.map((row) => ({
      id: `fifa-team-${row.group}-${row.team}`,
      code: row.code,
      name: row.team,
      nameEn: row.team,
      flag: row.flag,
      group: `${row.group} 组`,
      rank: 0,
      coach: "",
      formation: "",
      stars: [],
      style: "",
      hotLevel: 0,
      tags: [],
      talkingPoints: [],
      groupStandings: {
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        pts: row.points,
      },
      championProbability: row.championProbability,
      source: "FIFA 官方赛程分组",
    })),
  );
}

// No local demo fallback. Data-backed features remain empty until a source
// returns verified records.
export const teams: Team[] = [];
export const gossipItems: GossipItem[] = [];
export const radarMatches: RadarMatch[] = [];

export function getCountdownToBj(): string {
  const kickoff = new Date(fifaSchedule.matches[0]?.kickoffBeijing || "2026-06-12T05:00:00+08:00");
  const now = new Date();
  const diff = kickoff.getTime() - now.getTime();
  if (diff <= 0) return "已开赛";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}
