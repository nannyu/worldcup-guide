import fifaScheduleData from "@/data/fifa-schedule.json";

// 世界杯装杯指南 — 基础数据层
// 赛程兜底来自 FIFA 官方 PDF 抽取结果；市场、球队和梗卡数据仍由后续数据源逐步覆盖。

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
  homeFlag: string;
  awayFlag: string;
  homeScore: number | null;
  awayScore: number | null;
  kickoffBj: string; // 北京时间
  group: string;
  round: string;
  status: MatchStatus;
  signal: SignalType;
  signalText: string;
  homeWinProb: number;   // Polymarket 概率 0-100
  drawProb: number;
  awayWinProb: number;
  oddsImpliedHome: number; // 赔率隐含概率 0-100
  oddsImpliedAway: number;
  venue: string;
  highlights?: string;   // 集锦链接
  events?: MatchEvent[];
  previewText: string;
  updatedAt: string;
}

interface FifaScheduleRecord {
  matchNo: number;
  stage: string;
  group?: string;
  date: string;
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

function fifaRecordToMatch(record: FifaScheduleRecord): Match {
  const home = matchSideDisplay(record.home);
  const away = matchSideDisplay(record.away);
  const round = roundLabel(record.stage);
  return {
    id: `fifa-${record.matchNo}`,
    homeTeam: home.name,
    awayTeam: away.name,
    homeFlag: home.flag,
    awayFlag: away.flag,
    homeScore: null,
    awayScore: null,
    kickoffBj: formatBeijingKickoff(record.kickoffBeijing),
    group: record.group ? `${record.group} 组` : "淘汰赛",
    round,
    status: "upcoming",
    signal: "none",
    signalText: "",
    homeWinProb: 0,
    drawProb: 0,
    awayWinProb: 0,
    oddsImpliedHome: 0,
    oddsImpliedAway: 0,
    venue: `${record.venue}，${record.city}`,
    previewText: `FIFA 官方赛程第 ${record.matchNo} 场。当地时间 ${record.date} ${record.localTime}（${record.localUtcOffset}），北京时间 ${formatBeijingKickoff(record.kickoffBeijing)}。`,
    updatedAt: "FIFA 官方赛程 · 本地兜底",
    events: [],
  };
}

function fifaMatchesOn(date: string): Match[] {
  return fifaSchedule.matches
    .filter((match) => match.date === date)
    .map(fifaRecordToMatch);
}

export interface Team {
  id: string;
  name: string;
  nameEn: string;
  flag: string;
  group: string;
  rank: number;
  coach: string;
  formation: string;
  stars: string[];   // 核心球员
  style: string;     // 一句话战术风格
  hotLevel: number;  // 1-5 颗星
  tags: string[];    // 聊天标签
  talkingPoints: string[];
  groupStandings: {
    played: number; won: number; drawn: number; lost: number; pts: number;
  };
}

export interface GossipItem {
  id: string;
  title: string;
  category: "retirement" | "penalty" | "coach" | "upset" | "topscorer" | "champion" | "meme";
  prob: number; // Polymarket 概率
  volume: string;
  summary: string;
  updatedAt: string;
  source: string;
}

// ===== TODAY'S MATCHES (2026-06-12 北京时间) =====
export const todayMatches: Match[] = [
  {
    id: "m001",
    homeTeam: "墨西哥",
    awayTeam: "南非",
    homeFlag: "🇲🇽",
    awayFlag: "🇿🇦",
    homeScore: null,
    awayScore: null,
    kickoffBj: "06-12 02:00",
    group: "A 组",
    round: "小组赛第 1 轮",
    status: "upcoming",
    signal: "value",
    signalText: "市场比赔率更看好墨西哥，差距 9 个百分点",
    homeWinProb: 62,
    drawProb: 21,
    awayWinProb: 17,
    oddsImpliedHome: 53,
    oddsImpliedAway: 23,
    venue: "阿兹特克球场，墨西哥城",
    previewText: "揭幕战！墨西哥主场作战，南非首次以非东道主身份出战。市场明显看好东道主，本场是本届杯的第一枪。",
    updatedAt: "Polymarket · 2分钟前",
    events: [],
  },
  {
    id: "m002",
    homeTeam: "加拿大",
    awayTeam: "荷兰",
    homeFlag: "🇨🇦",
    awayFlag: "🇳🇱",
    homeScore: null,
    awayScore: null,
    kickoffBj: "06-12 05:00",
    group: "B 组",
    round: "小组赛第 1 轮",
    status: "upcoming",
    signal: "close",
    signalText: "市场和赔率基本一致，两边概率差距小于 4 个百分点",
    homeWinProb: 31,
    drawProb: 26,
    awayWinProb: 43,
    oddsImpliedHome: 28,
    oddsImpliedAway: 47,
    venue: "BC Place，温哥华",
    previewText: "加拿大首次在本土踢世界杯！荷兰近年复苏，范迪克老将压阵。主场气氛超级热烈，但纸面实力荷兰略占优。",
    updatedAt: "Polymarket · 5分钟前",
    events: [],
  },
  {
    id: "m003",
    homeTeam: "阿根廷",
    awayTeam: "厄瓜多尔",
    homeFlag: "🇦🇷",
    awayFlag: "🇪🇨",
    homeScore: null,
    awayScore: null,
    kickoffBj: "06-12 08:00",
    group: "C 组",
    round: "小组赛第 1 轮",
    status: "upcoming",
    signal: "hot",
    signalText: "热度爆表！梅西卫冕战，交易量本日最高",
    homeWinProb: 71,
    drawProb: 18,
    awayWinProb: 11,
    oddsImpliedHome: 68,
    oddsImpliedAway: 13,
    venue: "MetLife 球场，纽约",
    previewText: "梅西卫冕首战！上届冠军阿根廷是今天最受关注的比赛，厄瓜多尔有速度威胁，但整体实力差距明显。",
    updatedAt: "Polymarket · 1分钟前",
    events: [],
  },
];

export const tomorrowMatches: Match[] = [
  {
    id: "m004",
    homeTeam: "巴西",
    awayTeam: "摩洛哥",
    homeFlag: "🇧🇷",
    awayFlag: "🇲🇦",
    homeScore: null,
    awayScore: null,
    kickoffBj: "06-13 02:00",
    group: "F 组",
    round: "小组赛第 1 轮",
    status: "upcoming",
    signal: "value",
    signalText: "市场比赔率更看好摩洛哥守住不败，差距 8 个百分点",
    homeWinProb: 54,
    drawProb: 27,
    awayWinProb: 19,
    oddsImpliedHome: 61,
    oddsImpliedAway: 14,
    venue: "硬石球场，迈阿密",
    previewText: "五星巴西碰上上届四强黑马。巴西纸面占优，但摩洛哥防反极硬，市场认为这场不会轻松。",
    updatedAt: "Polymarket · 8分钟前",
    events: [],
  },
  {
    id: "m005",
    homeTeam: "西班牙",
    awayTeam: "韩国",
    homeFlag: "🇪🇸",
    awayFlag: "🇰🇷",
    homeScore: null,
    awayScore: null,
    kickoffBj: "06-13 05:00",
    group: "H 组",
    round: "小组赛第 1 轮",
    status: "upcoming",
    signal: "hot",
    signalText: "亚马尔首秀热度高，交易量进入明日前三",
    homeWinProb: 66,
    drawProb: 20,
    awayWinProb: 14,
    oddsImpliedHome: 64,
    oddsImpliedAway: 15,
    venue: "李维斯球场，旧金山湾区",
    previewText: "西班牙青年风暴首秀，韩国主打速度和反击。想饭局装杯，盯住亚马尔和孙兴慜这一老一新两条线就够了。",
    updatedAt: "Polymarket · 12分钟前",
    events: [],
  },
];

export const yesterdayMatches: Match[] = [
  {
    id: "m-y001",
    homeTeam: "法国",
    awayTeam: "澳大利亚",
    homeFlag: "🇫🇷",
    awayFlag: "🇦🇺",
    homeScore: 4,
    awayScore: 0,
    kickoffBj: "06-11 02:00",
    group: "D 组",
    round: "小组赛第 1 轮",
    status: "finished",
    signal: "none",
    signalText: "",
    homeWinProb: 89,
    drawProb: 8,
    awayWinProb: 3,
    oddsImpliedHome: 85,
    oddsImpliedAway: 5,
    venue: "玫瑰碗球场，洛杉矶",
    previewText: "",
    updatedAt: "已完赛",
    highlights: "https://www.bilibili.com",
    events: [
      { minute: 12, type: "goal", player: "姆巴佩", team: "home", description: "左路突破打门" },
      { minute: 35, type: "goal", player: "格列兹曼", team: "home", description: "头球破门" },
      { minute: 67, type: "goal", player: "姆巴佩", team: "home", description: "点球" },
      { minute: 88, type: "goal", player: "科洛·穆阿尼", team: "home", description: "反击建功" },
    ],
  },
  {
    id: "m-y002",
    homeTeam: "日本",
    awayTeam: "德国",
    homeFlag: "🇯🇵",
    awayFlag: "🇩🇪",
    homeScore: 2,
    awayScore: 1,
    kickoffBj: "06-11 05:00",
    group: "E 组",
    round: "小组赛第 1 轮",
    status: "finished",
    signal: "none",
    signalText: "",
    homeWinProb: 28,
    drawProb: 27,
    awayWinProb: 45,
    oddsImpliedHome: 24,
    oddsImpliedAway: 50,
    venue: "大都会球场，达拉斯",
    previewText: "",
    updatedAt: "已完赛",
    highlights: "https://www.bilibili.com",
    events: [
      { minute: 33, type: "goal", player: "京斯", team: "away", description: "远射破门" },
      { minute: 71, type: "goal", player: "久保建英", team: "home", description: "抹射入网" },
      { minute: 89, type: "goal", player: "浅野拓磨", team: "home", description: "绝杀！" },
    ],
  },
];

export const scheduleDateMeta: Record<ScheduleDateKey, {
  date: string;
  tabLabel: string;
  listLabel: string;
}> = {
  yesterday: {
    date: "2026-06-11",
    tabLabel: "6月11日 揭幕",
    listLabel: "FIFA 官方揭幕日",
  },
  today: {
    date: "2026-06-12",
    tabLabel: "6月12日",
    listLabel: "FIFA 官方赛程",
  },
  tomorrow: {
    date: "2026-06-13",
    tabLabel: "6月13日",
    listLabel: "FIFA 官方赛程",
  },
};

export const matchesByDate: Record<ScheduleDateKey, Match[]> = {
  yesterday: fifaMatchesOn(scheduleDateMeta.yesterday.date),
  today: fifaMatchesOn(scheduleDateMeta.today.date),
  tomorrow: fifaMatchesOn(scheduleDateMeta.tomorrow.date),
};

export const allMatches: Match[] = [
  ...yesterdayMatches,
  ...todayMatches,
  ...tomorrowMatches,
];

// ===== TEAMS =====
export const teams: Team[] = [
  {
    id: "arg",
    name: "阿根廷",
    nameEn: "Argentina",
    flag: "🇦🇷",
    group: "C 组",
    rank: 1,
    coach: "利昂纳多·斯卡洛尼",
    formation: "4-3-3",
    stars: ["莱昂内尔·梅西", "朱利安·阿尔瓦雷斯", "罗德里戈·德保罗"],
    style: "梅西核心体系，控球配合精细，反击凶猛",
    hotLevel: 5,
    tags: ["卫冕冠军", "梅西可能的最后一届", "最受关注"],
    talkingPoints: [
      "梅西已经 38 岁，本届可能是他最后一次世界杯",
      "卫冕冠军身份带来巨大压力，历史上卫冕从未成功",
      "阿尔瓦雷斯被认为是下一个十年的阿根廷核心",
    ],
    groupStandings: { played: 0, won: 0, drawn: 0, lost: 0, pts: 0 },
  },
  {
    id: "fra",
    name: "法国",
    nameEn: "France",
    flag: "🇫🇷",
    group: "D 组",
    rank: 2,
    coach: "迪迪埃·德尚",
    formation: "4-2-3-1",
    stars: ["基利安·姆巴佩", "奥雷连·楚阿梅尼", "马库斯·蒂拉姆"],
    style: "速度流，姆巴佩单刀最致命，防线硬如铁",
    hotLevel: 5,
    tags: ["夺冠大热", "姆巴佩领衔", "实力最均衡"],
    talkingPoints: [
      "法国进攻线被誉为史上最强，姆巴佩昨晚梅开二度",
      "德尚教练可能本届后退休，4-0 开门红",
      "格列兹曼是隐形功臣，组织策应无可挑剔",
    ],
    groupStandings: { played: 1, won: 1, drawn: 0, lost: 0, pts: 3 },
  },
  {
    id: "bra",
    name: "巴西",
    nameEn: "Brazil",
    flag: "🇧🇷",
    group: "F 组",
    rank: 3,
    coach: "多里瓦尔·若尼奥尔",
    formation: "4-2-3-1",
    stars: ["维尼修斯·若尼奥尔", "罗德里戈", "卡塞米罗"],
    style: "桑巴足球回归，技术流配合边路突破",
    hotLevel: 4,
    tags: ["五星巴西", "24 年未夺冠", "维尼修斯当家"],
    talkingPoints: [
      "巴西已 24 年没拿世界杯了，本届解渴的压力很大",
      "维尼修斯连续两年拿欧冠，是目前世界最佳边锋",
      "桑巴式足球回归，比上届更好看了",
    ],
    groupStandings: { played: 0, won: 0, drawn: 0, lost: 0, pts: 0 },
  },
  {
    id: "eng",
    name: "英格兰",
    nameEn: "England",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    group: "G 组",
    rank: 5,
    coach: "加雷斯·索斯盖特",
    formation: "4-3-3",
    stars: ["贝林厄姆", "凯恩", "萨卡"],
    style: "中场控制，贝林厄姆任意游走，边路输出极高",
    hotLevel: 4,
    tags: ["60 年魔咒", "贝林厄姆时代", "万众期待"],
    talkingPoints: [
      "英格兰已经 60 年没捧过大力神杯了",
      "贝林厄姆是现役最贵球员之一，号称下一个齐达内",
      "凯恩拿了 3 届总射手奖但没拿过冠军，饭局经典梗",
    ],
    groupStandings: { played: 0, won: 0, drawn: 0, lost: 0, pts: 0 },
  },
  {
    id: "ger",
    name: "德国",
    nameEn: "Germany",
    flag: "🇩🇪",
    group: "E 组",
    rank: 12,
    coach: "朱利安·纳格尔斯曼",
    formation: "4-2-3-1",
    stars: ["穆西亚拉", "京斯", "吕迪格"],
    style: "新生代崛起，穆西亚拉是核心，立体进攻体系",
    hotLevel: 3,
    tags: ["昨晚爆冷输给日本", "穆西亚拉天才", "德国战车"],
    talkingPoints: [
      "昨晚居然输给了日本！日本绝杀，惊天爆冷",
      "穆西亚拉被认为是下一个梅西，但昨晚发挥一般",
      "德国本届出局风险较大，饭局讨论很热",
    ],
    groupStandings: { played: 1, won: 0, drawn: 0, lost: 1, pts: 0 },
  },
  {
    id: "jpn",
    name: "日本",
    nameEn: "Japan",
    flag: "🇯🇵",
    group: "E 组",
    rank: 17,
    coach: "森保一",
    formation: "3-4-2-1",
    stars: ["久保建英", "三笘薰", "浅野拓磨"],
    style: "高强度压迫，定位球威胁，擅打反击",
    hotLevel: 4,
    tags: ["昨晚绝杀德国", "黑马最热", "久保建英神了"],
    talkingPoints: [
      "昨晚第 89 分钟绝杀德国！全网最热话题",
      "日本连续三届淘汰赛出局，本届终于要走远吗？",
      "久保建英效力皇社，是欧洲顶级联赛最强亚洲球员",
    ],
    groupStandings: { played: 1, won: 1, drawn: 0, lost: 0, pts: 3 },
  },
  {
    id: "spa",
    name: "西班牙",
    nameEn: "Spain",
    flag: "🇪🇸",
    group: "H 组",
    rank: 6,
    coach: "路易斯·德拉富恩特",
    formation: "4-3-3",
    stars: ["亚马尔", "尼科·威廉姆斯", "罗德里"],
    style: "Tiki-taka 升级版，亚马尔 17 岁天才领衔",
    hotLevel: 4,
    tags: ["亚马尔是最年轻明星", "欧洲杯卫冕冠军", "西班牙崛起"],
    talkingPoints: [
      "亚马尔在本届开赛时只有 17 岁，是史上最年轻候选明星",
      "西班牙赢得上届欧洲杯，被认为是本届黑马夺冠选项",
      "罗德里是世界最佳中场，控节奏能力顶级",
    ],
    groupStandings: { played: 0, won: 0, drawn: 0, lost: 0, pts: 0 },
  },
  {
    id: "mor",
    name: "摩洛哥",
    nameEn: "Morocco",
    flag: "🇲🇦",
    group: "I 组",
    rank: 14,
    coach: "瓦利德·雷格拉吉",
    formation: "4-2-3-1",
    stars: ["哈基米", "扎伊里", "阿姆拉巴特"],
    style: "防反大师，定位球致命，集体精神顶尖",
    hotLevel: 3,
    tags: ["上届四强黑马", "非洲骄傲", "哈基米老巴黎"],
    talkingPoints: [
      "上届创奇迹打进四强，非洲历史最佳战绩",
      "哈基米是世界最佳右后卫，跑动距离堪比中场",
      "摩洛哥每场比赛就是一堂防守课",
    ],
    groupStandings: { played: 0, won: 0, drawn: 0, lost: 0, pts: 0 },
  },
];

// ===== GOSSIP ITEMS =====
export const gossipItems: GossipItem[] = [
  {
    id: "g001",
    title: "梅西本届后宣布退役？",
    category: "retirement",
    prob: 73,
    volume: "¥ 2.4M",
    summary: "Polymarket 73% 的资金认为梅西会在本届后正式宣布国家队退役。他已 38 岁，去年采访中多次暗示「可能是最后一届」。",
    updatedAt: "1小时前",
    source: "Polymarket",
  },
  {
    id: "g002",
    title: "日本能否打进 8 强？",
    category: "upset",
    prob: 41,
    volume: "¥ 1.8M",
    summary: "昨晚绝杀德国后，日本晋级 8 强的概率从 18% 飙升至 41%。亚洲球队历史最好成绩是日本 2002 年的 8 强。",
    updatedAt: "2小时前",
    source: "Polymarket",
  },
  {
    id: "g003",
    title: "姆巴佩能拿金靴奖吗？",
    category: "topscorer",
    prob: 29,
    volume: "¥ 3.1M",
    summary: "法国 4-0 大胜后，姆巴佩梅开二度，目前是金靴最热门人选。但还有梅西、凯恩等竞争者，距离结束还早。",
    updatedAt: "30分钟前",
    source: "Polymarket",
  },
  {
    id: "g004",
    title: "本届最多点球大战的队伍",
    category: "penalty",
    prob: 22,
    volume: "¥ 980K",
    summary: "阿根廷上届靠点球夺冠，市场预测他们本届也很可能再陷点球战。22% 概率是目前最高。",
    updatedAt: "3小时前",
    source: "Polymarket",
  },
  {
    id: "g005",
    title: "首支爆冷出局的传统豪门是谁？",
    category: "upset",
    prob: 34,
    volume: "¥ 1.2M",
    summary: "德国昨晚输给日本，已经在小组赛出局边缘。西班牙和比利时也被认为有爆冷风险。市场最看好德国成为第一个出局豪门。",
    updatedAt: "45分钟前",
    source: "Polymarket",
  },
  {
    id: "g006",
    title: "阿根廷能卫冕成功吗？",
    category: "champion",
    prob: 19,
    volume: "¥ 5.6M",
    summary: "历史上从未有球队成功卫冕，但阿根廷 19% 的夺冠概率仍然排名前三，与法国并列第二热门。",
    updatedAt: "20分钟前",
    source: "Polymarket",
  },
];

// ===== RADAR DATA =====
export interface RadarMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  homeMarketProb: number;
  awayMarketProb: number;
  homeOddsProb: number;
  awayOddsProb: number;
  diff: number; // abs max diff
  diffLabel: "aligned" | "notable" | "significant";
  diffTeam: "home" | "away";
  diffText: string;
  kickoffBj: string;
  status: MatchStatus;
  updatedAt: string;
  // 概率变化历史（主队胜率，过去 24h）
  history: { time: string; market: number; odds: number }[];
}

export const radarMatches: RadarMatch[] = [
  {
    id: "r001",
    homeTeam: "墨西哥",
    awayTeam: "南非",
    homeFlag: "🇲🇽",
    awayFlag: "🇿🇦",
    homeMarketProb: 62,
    awayMarketProb: 17,
    homeOddsProb: 53,
    awayOddsProb: 23,
    diff: 9,
    diffLabel: "notable",
    diffTeam: "home",
    diffText: "市场比赔率更看好墨西哥，差距 9 个百分点。可能反映主场效应定价偏低。",
    kickoffBj: "06-12 02:00",
    status: "upcoming",
    updatedAt: "Polymarket · 2分钟前",
    history: [
      { time: "-24h", market: 54, odds: 51 },
      { time: "-20h", market: 55, odds: 52 },
      { time: "-16h", market: 57, odds: 52 },
      { time: "-12h", market: 58, odds: 53 },
      { time: "-8h",  market: 60, odds: 53 },
      { time: "-4h",  market: 61, odds: 53 },
      { time: "现在", market: 62, odds: 53 },
    ],
  },
  {
    id: "r002",
    homeTeam: "阿根廷",
    awayTeam: "厄瓜多尔",
    homeFlag: "🇦🇷",
    awayFlag: "🇪🇨",
    homeMarketProb: 71,
    awayMarketProb: 11,
    homeOddsProb: 68,
    awayOddsProb: 13,
    diff: 3,
    diffLabel: "aligned",
    diffTeam: "home",
    diffText: "市场和赔率高度一致，差距仅 3 个百分点，基本定价合理。",
    kickoffBj: "06-12 08:00",
    status: "upcoming",
    updatedAt: "Polymarket · 1分钟前",
    history: [
      { time: "-24h", market: 69, odds: 67 },
      { time: "-20h", market: 70, odds: 67 },
      { time: "-16h", market: 70, odds: 68 },
      { time: "-12h", market: 71, odds: 68 },
      { time: "-8h",  market: 71, odds: 68 },
      { time: "-4h",  market: 71, odds: 68 },
      { time: "现在", market: 71, odds: 68 },
    ],
  },
  {
    id: "r003",
    homeTeam: "加拿大",
    awayTeam: "荷兰",
    homeFlag: "🇨🇦",
    awayFlag: "🇳🇱",
    homeMarketProb: 31,
    awayMarketProb: 43,
    homeOddsProb: 28,
    awayOddsProb: 47,
    diff: 4,
    diffLabel: "aligned",
    diffTeam: "away",
    diffText: "差距 4 个百分点，两者基本一致，没有明显信息差。",
    kickoffBj: "06-12 05:00",
    status: "upcoming",
    updatedAt: "Polymarket · 5分钟前",
    history: [
      { time: "-24h", market: 29, odds: 27 },
      { time: "-20h", market: 30, odds: 27 },
      { time: "-16h", market: 30, odds: 28 },
      { time: "-12h", market: 31, odds: 28 },
      { time: "-8h",  market: 31, odds: 28 },
      { time: "-4h",  market: 31, odds: 28 },
      { time: "现在", market: 31, odds: 28 },
    ],
  },
  {
    id: "r004",
    homeTeam: "日本",
    awayTeam: "德国",
    homeFlag: "🇯🇵",
    awayFlag: "🇩🇪",
    homeMarketProb: 38,
    awayMarketProb: 42,
    homeOddsProb: 24,
    awayOddsProb: 50,
    diff: 14,
    diffLabel: "significant",
    diffTeam: "home",
    diffText: "昨晚绝杀后市场大幅调高日本概率，与赔率相差 14 个百分点，赔率滞后市场反应明显。",
    kickoffBj: "06-11 05:00",
    status: "finished",
    updatedAt: "Polymarket · 已完赛更新",
    history: [
      { time: "-24h", market: 22, odds: 24 },
      { time: "-20h", market: 23, odds: 24 },
      { time: "-16h", market: 24, odds: 24 },
      { time: "赛中",  market: 26, odds: 24 },
      { time: "进球",  market: 31, odds: 24 },
      { time: "绝杀",  market: 35, odds: 24 },
      { time: "终场", market: 38, odds: 24 },
    ],
  },
];

// Countdown helper
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
