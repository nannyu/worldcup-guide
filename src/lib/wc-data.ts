import fifaScheduleData from "@/data/fifa-schedule.json";

// 基础数据层只保留 FIFA 官方赛程快照。球队内容、比分、新闻和市场数据
// 必须由已配置的数据源返回；缺失时使用空集合，不提供演示数据。

export type MatchStatus = "live" | "upcoming" | "finished";
export type SignalType = "value" | "hot" | "close" | "none";
export type ScheduleDateKey = "yesterday" | "today" | "tomorrow";

export interface MatchEvent {
  minute: number;
  type: "goal" | "yellow" | "red" | "penalty" | "og";
  player: string;
  team: "home" | "away";
  description?: string;
}

export interface Match {
  id: string;
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
  previewText: string;
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
  SCO: { name: "苏格兰", flag: "🏴" },
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
  ENG: { name: "英格兰", flag: "🏴" },
  CRO: { name: "克罗地亚", flag: "🇭🇷" },
  POR: { name: "葡萄牙", flag: "🇵🇹" },
  COD: { name: "刚果民主共和国", flag: "🇨🇩" },
  UZB: { name: "乌兹别克斯坦", flag: "🇺🇿" },
  COL: { name: "哥伦比亚", flag: "🇨🇴" },
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

function matchSideDisplay(side: FifaScheduleRecord["home"]) {
  if (side.code && teamDisplay[side.code]) return teamDisplay[side.code];
  return { name: side.name, flag: "🏳️" };
}

export function fifaRecordToMatch(record: FifaScheduleRecord): Match {
  const home = matchSideDisplay(record.home);
  const away = matchSideDisplay(record.away);
  return {
    id: `fifa-${record.matchNo}`,
    homeTeam: home.name,
    awayTeam: away.name,
    homeCode: record.home.code,
    awayCode: record.away.code,
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
    venue: `${record.venue}，${record.city}`,
    previewText: `FIFA 官方赛程第 ${record.matchNo} 场。PDF 标注 ${record.easternDate} ${record.easternTime}（ET），举办地当地时间 ${record.localDate} ${record.localTime}（${record.localUtcOffset}），北京时间 ${formatBeijingKickoff(record.kickoffBeijing)}。`,
    updatedAt: "FIFA 官方赛程 · 本地快照",
    events: [],
  };
}

function fifaMatchesOn(date: string): Match[] {
  return fifaSchedule.matches
    .filter((match) => match.kickoffBeijing.slice(0, 10) === date)
    .map(fifaRecordToMatch);
}

export interface Team {
  id: string;
  code?: string;
  name: string;
  nameEn: string;
  flag: string;
  group: string;
  rank: number;
  coach: string;
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
  roast?: string;
  championProbability?: number | null;
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
  avatarUrl?: string;
  intro?: string;
  career?: string[];
  roast?: string;
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
  bodySource?: "original-page" | "source-api" | "summary";
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

export interface MorningBrief {
  issueDate: string;
  edition: string;
  title: string;
  titleZh?: string;
  summary: string;
  summaryZh?: string;
  quote: string;
  quoteZh?: string;
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
  marketLabel?: string;
  outcomes?: Array<{
    label: string;
    probability: number;
  }>;
  history: { time: string; market: number; odds: number }[];
}

export interface OddsMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  kickoffBj: string;
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
  homeProbability: number;
  drawProbability: number;
  awayProbability: number;
  bookmakerCount: number;
  updatedAt: string;
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

function beijingDate(offsetDays: number): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(new Date());
  const date = new Date(`${today}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return formatter.format(date);
}

function dateTabLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

const yesterdayDate = beijingDate(-1);
const todayDate = beijingDate(0);
const tomorrowDate = beijingDate(1);

export const scheduleDateMeta: Record<
  ScheduleDateKey,
  { date: string; tabLabel: string; listLabel: string }
> = {
  yesterday: {
    date: yesterdayDate,
    tabLabel: dateTabLabel(yesterdayDate),
    listLabel: "昨日赛程",
  },
  today: {
    date: todayDate,
    tabLabel: dateTabLabel(todayDate),
    listLabel: "今日赛程",
  },
  tomorrow: {
    date: tomorrowDate,
    tabLabel: dateTabLabel(tomorrowDate),
    listLabel: "明日赛程",
  },
};

export const matchesByDate: Record<ScheduleDateKey, Match[]> = {
  yesterday: fifaMatchesOn(scheduleDateMeta.yesterday.date),
  today: fifaMatchesOn(scheduleDateMeta.today.date),
  tomorrow: fifaMatchesOn(scheduleDateMeta.tomorrow.date),
};

// Compatibility exports used by existing screens and MCP tools. These now
// contain official FIFA schedule data only.
export const yesterdayMatches = matchesByDate.yesterday;
export const todayMatches = matchesByDate.today;
export const tomorrowMatches = matchesByDate.tomorrow;
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

  return {
    ...base,
    ...live,
    id: base.id,
    homeTeam: base.homeTeam,
    awayTeam: base.awayTeam,
    homeCode: base.homeCode || live.homeCode,
    awayCode: base.awayCode || live.awayCode,
    homeFlag: base.homeFlag || live.homeFlag,
    awayFlag: base.awayFlag || live.awayFlag,
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
