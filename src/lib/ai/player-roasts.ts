import { readAdminConfig, type AiProviderConfig } from "@/lib/admin/config";
import { runAiTaskQueue, type AiTask } from "@/lib/ai/task-orchestrator";
import { getAggregatedMatches, getAggregatedNews, MORNING_BRIEF_NEWS_LIMIT } from "@/lib/data-sources/aggregate";
import { readSnapshotCache, upsertSnapshotCache } from "@/lib/db/queries/data-cache";
import {
  matchesByDate,
  type Match,
  type NewsArticle,
  type PlayerProfile,
  type PlayerRoastItem,
  type PlayerRoastSnapshot,
  type Team,
} from "@/lib/wc-data";

const PLAYER_ROAST_SNAPSHOT_VERSION = "v1";
const PLAYER_ROAST_TTL_SECONDS = 6 * 60 * 60;
const PLAYER_ROAST_NEWS_LIMIT = MORNING_BRIEF_NEWS_LIMIT;
const PLAYER_ROAST_RELATED_NEWS_LIMIT = 2;
const PLAYER_ROAST_RELATED_MATCH_LIMIT = 2;
const PLAYER_ROAST_AI_TIMEOUT_MS = Number(process.env.PLAYER_ROAST_AI_TIMEOUT_MS) || 180_000;
const PLAYER_ROAST_AI_PROVIDER_ATTEMPTS = 2;
const PLAYER_ROAST_AI_CONCURRENCY = Number(process.env.PLAYER_ROAST_AI_CONCURRENCY) || 6;
const FORBIDDEN_PLAYER_ROAST_PATTERNS = [
  /先看他在本队体系里的任务/,
  /世界杯最会惩罚只看集锦的人/,
  /履历没给够/,
  /硬毒舌就会变成硬编/,
];

type PlayerRoastReadOptions = {
  cacheMode?: "cache-only" | "cache-first" | "refresh";
};

type PlayerContext = {
  team: Team;
  player: PlayerProfile;
  news: NewsArticle[];
  matches: Match[];
};

type AiPlayerRoastPayload = {
  item?: AiPlayerRoastRecord;
  items?: AiPlayerRoastRecord[];
  playerId?: string;
  playerName?: string;
  playerNameZh?: string;
  roast?: string;
  evidence?: string[];
  articleIds?: string[];
  matchIds?: string[];
};

type AiPlayerRoastRecord = {
  playerId?: string;
  playerName?: string;
  playerNameZh?: string;
  roast?: string;
  evidence?: string[];
  articleIds?: string[];
  matchIds?: string[];
};

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function extractJson(input: string): unknown {
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const text = (fenced || input).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI response did not contain JSON");
  return JSON.parse(text.slice(start, end + 1));
}

function compactText(input: string | undefined, maxLength: number): string {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function canonicalKey(input: string | undefined): string {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function beijingDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function playerRoastSnapshotKey(configUpdatedAt: string): string {
  return `player-roasts:${PLAYER_ROAST_SNAPSHOT_VERSION}:latest:${configUpdatedAt}`;
}

function playerDisplayName(player: PlayerProfile): string {
  return compactText(player.nameZh || player.name, 18);
}

function articleText(article: NewsArticle): string {
  return [
    article.title,
    article.titleZh,
    article.titleEn,
    article.summary,
    article.summaryZh,
    article.summaryEn,
    article.aiSummary,
    article.aiComment,
    article.commentZh,
    article.commentEn,
    ...(article.aiKeyPoints || []),
    ...(article.keyPointsZh || []),
    ...(article.keyPointsEn || []),
  ].filter(Boolean).join(" ");
}

function relatedNewsForPlayer(team: Team, player: PlayerProfile, articles: NewsArticle[]): NewsArticle[] {
  const terms = [
    player.name,
    player.nameZh || "",
    team.name,
    team.nameEn,
    team.code || "",
  ].map((term) => term.toLowerCase().trim()).filter((term) => term.length >= 2);

  return articles
    .map((article) => {
      const text = articleText(article).toLowerCase();
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
      return { article, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || Date.parse(right.article.publishedAt) - Date.parse(left.article.publishedAt))
    .map((item) => item.article)
    .slice(0, PLAYER_ROAST_RELATED_NEWS_LIMIT);
}

function teamKeys(team: Team): string[] {
  return [team.code, team.name, team.nameEn].map(canonicalKey).filter(Boolean);
}

function matchIncludesTeam(match: Match, team: Team): boolean {
  const keys = new Set(teamKeys(team));
  return [match.homeCode, match.awayCode, match.homeTeam, match.awayTeam].some((value) => keys.has(canonicalKey(value)));
}

function relatedMatchesForTeam(team: Team, matches: Match[]): Match[] {
  return matches.filter((match) => matchIncludesTeam(match, team)).slice(0, PLAYER_ROAST_RELATED_MATCH_LIMIT);
}

function positionAngle(player: PlayerProfile): string {
  if (player.position === "门将") return "门线判断和出球";
  if (player.position === "后卫") return "站位、回追和第一脚处理";
  if (player.position === "中场") return "接应、推进和丢球后的补位";
  if (player.position === "前锋") return "跑位、终结和无球压迫";
  return "角色执行";
}

function buildFallbackRoast(context: PlayerContext): PlayerRoastItem {
  const { team, player, news, matches } = context;
  const name = playerDisplayName(player);
  const club = player.club ? `在${player.club.replace(/\s*\([^)]*\)/g, "")}` : "在这套阵容里";
  const number = player.shirtNumber ? `${player.shirtNumber}号` : player.position;
  const teamTag = team.tags[0] || team.formation || "球队标签";
  const match = matches[0];
  const newsAngle = news[0]
    ? `新闻还盯着「${compactText(news[0].titleZh || news[0].title, 22)}」`
    : match
      ? `${match.kickoffBj}这场会先检验状态`
      : `${team.name}的${team.formation}要给他安排明白`;
  const templates = [
    `${name}这个${number}${player.position}不能只靠履历撑场面；${positionAngle(player)}一掉线，${team.name}的${teamTag}就会露馅。`,
    `${club}的名头可以先放一边，${name}真正要交的是${positionAngle(player)}。${newsAngle}，偷懒会很显眼。`,
    `${name}在${team.name}的剧本里不是背景板；${number}要是把${positionAngle(player)}踢成选择题，队友会被迫替他擦题。`,
    `${team.name}想把${teamTag}踢成卖点，轮到${name}就别把${positionAngle(player)}踢成抽奖；杯赛不给${number}太多试错券。`,
  ];
  const roast = templates[Math.abs([...player.id].reduce((total, char) => total + char.charCodeAt(0), 0)) % templates.length];
  return {
    teamCode: team.code,
    teamName: team.name,
    teamNameEn: team.nameEn,
    playerId: player.id,
    playerName: player.name,
    playerNameZh: player.nameZh,
    position: player.position,
    roast,
    evidence: [
      `球员：${name} · ${number} · ${player.position}`,
      `球队：${team.name} · ${team.formation} · ${team.tags.slice(0, 2).join("、")}`,
      news[0] ? `新闻：${compactText(news[0].titleZh || news[0].title, 34)}` : undefined,
    ].filter((item): item is string => Boolean(item)),
    articleIds: news.map((article) => article.id),
    matchIds: matches.map((item) => item.id),
    updatedAt: new Date().toISOString(),
    source: "rules",
  };
}

function buildPlayerContexts(teams: Team[], articles: NewsArticle[], matches: Match[]): PlayerContext[] {
  return teams.flatMap((team) => {
    const teamMatches = relatedMatchesForTeam(team, matches);
    return (team.roster || []).map((player) => ({
      team,
      player,
      news: relatedNewsForPlayer(team, player, articles),
      matches: teamMatches,
    }));
  });
}

function buildPrompt(context: PlayerContext): string {
  const { team, player, news, matches } = context;
  const record = {
    teamCode: team.code,
    teamName: team.name,
    teamNameEn: team.nameEn,
    coach: team.coach,
    coachZh: team.coachZh,
    formation: team.formation,
    tags: team.tags,
    style: compactText(team.style, 100),
    player: {
      id: player.id,
      name: player.name,
      nameZh: player.nameZh,
      shirtNumber: player.shirtNumber,
      position: player.position,
      club: player.club,
      age: player.age,
      intro: compactText(player.intro, 120),
      career: (player.career || []).slice(0, 3),
    },
    relatedNews: news.map((article) => ({
      id: article.id,
      title: article.titleZh || article.title,
      summary: article.summaryZh || article.aiSummary || article.summary,
      source: article.source,
      publishedAt: article.publishedAt,
    })),
    relatedMatches: matches.map((match) => ({
      id: match.id,
      status: match.status,
      kickoffBj: match.kickoffBj,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      round: match.round,
    })),
  };

  return [
    "你是世界杯球员卡片编辑，负责给单个球员写中文“AI 毒舌”。",
    "只为输入里的这一名球员写一句，不要批量写，不要写其他球员。",
    "必须结合球员姓名、位置、号码/俱乐部/履历、所属球队打法或相关新闻赛况，做到一人一句不同角度。",
    "只基于输入事实写，不要补充外部事实，不要造谣。",
    "风格：辛辣、短促、有梗；攻击点只能是位置职责、状态、战术角色、出球/终结/回追等足球内容。",
    "禁止地域/民族/国籍歧视，禁止人身侮辱。禁止使用“先看他在本队体系里的任务，再聊高光剪辑”这类统一模板。",
    "每条 roast 45-85 个中文字符。",
    "返回严格 JSON，不要 Markdown：",
    '{"playerId":"","playerName":"","playerNameZh":"","roast":"","evidence":[],"articleIds":[],"matchIds":[]}',
    "playerId 使用输入 player.id；articleIds/matchIds 只能使用输入中的 id。",
    JSON.stringify(record),
  ].join("\n");
}

function normalizeAiItem(value: unknown, context: PlayerContext, providerName: string): PlayerRoastItem {
  const data = value as AiPlayerRoastPayload;
  const item = Array.isArray(data.items) ? data.items[0] : data.item || data;
  const roast = compactText(item?.roast, 120);
  if (roast.length < 12 || FORBIDDEN_PLAYER_ROAST_PATTERNS.some((pattern) => pattern.test(roast))) {
    throw new Error("AI response did not include a usable personalized player roast");
  }
  return {
    teamCode: context.team.code,
    teamName: context.team.name,
    teamNameEn: context.team.nameEn,
    playerId: context.player.id,
    playerName: context.player.name,
    playerNameZh: context.player.nameZh,
    position: context.player.position,
    roast,
    evidence: Array.isArray(item.evidence)
      ? item.evidence.filter((evidence): evidence is string => typeof evidence === "string").slice(0, 3)
      : [],
    articleIds: Array.isArray(item.articleIds)
      ? item.articleIds.filter((id): id is string => typeof id === "string").slice(0, 5)
      : context.news.map((article) => article.id),
    matchIds: Array.isArray(item.matchIds)
      ? item.matchIds.filter((id): id is string => typeof id === "string").slice(0, 5)
      : context.matches.map((match) => match.id),
    updatedAt: new Date().toISOString(),
    source: "ai",
    aiProvider: providerName,
  };
}

async function callOpenAiCompatible(provider: AiProviderConfig, prompt: string, context: PlayerContext): Promise<PlayerRoastItem> {
  const providerOptions = provider.provider === "deepseek" ? { thinking: { type: "disabled" } } : {};
  const response = await fetch(joinUrl(provider.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: provider.defaultModel,
      temperature: 0.8,
      response_format: { type: "json_object" },
      ...providerOptions,
      messages: [
        { role: "system", content: "You write concise Chinese football player commentary and return accurate JSON only." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(PLAYER_ROAST_AI_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as OpenAiResponse;
  const content = data.choices?.[0]?.message?.content || "";
  return normalizeAiItem(extractJson(content), context, provider.name);
}

async function callGemini(provider: AiProviderConfig, prompt: string, context: PlayerContext): Promise<PlayerRoastItem> {
  const endpoint = joinUrl(provider.baseUrl, `/models/${encodeURIComponent(provider.defaultModel)}:generateContent`);
  const url = new URL(endpoint);
  url.searchParams.set("key", provider.apiKey);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.8,
        responseMimeType: "application/json",
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(PLAYER_ROAST_AI_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as GeminiResponse;
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return normalizeAiItem(extractJson(content), context, provider.name);
}

async function generateAiPlayerRoasts(
  providers: AiProviderConfig[],
  contexts: PlayerContext[],
  primaryAiProviderId: string,
): Promise<{ items: PlayerRoastItem[]; providerName?: string; aiUsed: boolean; message: string }> {
  const tasks: Array<AiTask<PlayerRoastItem>> = contexts.map((context) => ({
    id: context.player.id,
    label: `${context.team.name} · ${playerDisplayName(context.player)}`,
    async run(provider) {
      const prompt = buildPrompt(context);
      return provider.provider === "gemini"
        ? callGemini(provider, prompt, context)
        : callOpenAiCompatible(provider, prompt, context);
    },
    fallback() {
      return buildFallbackRoast(context);
    },
  }));

  const queue = await runAiTaskQueue(tasks, {
    providers,
    primaryProviderId: primaryAiProviderId,
    concurrency: PLAYER_ROAST_AI_CONCURRENCY,
    providerAttempts: PLAYER_ROAST_AI_PROVIDER_ATTEMPTS,
    disabled: process.env.PLAYER_ROAST_DISABLE_AI === "1",
    disabledMessage: "PLAYER_ROAST_DISABLE_AI=1，已使用球员资料规则生成球员毒舌。",
  });
  const providerNames = Array.from(new Set(queue.results.flatMap((result) => result.providerName || [])));
  return {
    items: queue.results.map((result) => result.value),
    providerName: providerNames.join(" + ") || undefined,
    aiUsed: queue.aiCount > 0,
    message: queue.message,
  };
}

async function readRoastInputs(): Promise<{ articles: NewsArticle[]; matches: Match[] }> {
  const [newsResult, yesterday, today, tomorrow] = await Promise.all([
    getAggregatedNews({ limit: PLAYER_ROAST_NEWS_LIMIT, cacheMode: "cache-only" }),
    getAggregatedMatches("yesterday", { cacheMode: "cache-only" }),
    getAggregatedMatches("today", { cacheMode: "cache-only" }),
    getAggregatedMatches("tomorrow", { cacheMode: "cache-only" }),
  ]);
  const cachedMatches = [...yesterday.matches, ...today.matches, ...tomorrow.matches];
  return {
    articles: newsResult.articles,
    matches: cachedMatches.length ? cachedMatches : [...matchesByDate.yesterday, ...matchesByDate.today, ...matchesByDate.tomorrow],
  };
}

export function applyPlayerRoasts(teams: Team[], snapshot?: PlayerRoastSnapshot): Team[] {
  if (!snapshot?.items.length) return teams;
  const roastById = new Map(snapshot.items.map((item) => [item.playerId, item]));
  return teams.map((team) => ({
    ...team,
    roster: team.roster?.map((player) => {
      const roast = roastById.get(player.id);
      return roast ? { ...player, roast: roast.roast } : player;
    }),
  }));
}

export async function getPlayerRoastSnapshot(
  teams: Team[],
  options: PlayerRoastReadOptions = {},
): Promise<PlayerRoastSnapshot | undefined> {
  const { aiProviders, primaryAiProviderId, updatedAt } = await readAdminConfig();
  const snapshotKey = playerRoastSnapshotKey(updatedAt);
  const cacheMode = options.cacheMode || "cache-first";
  const cached = await readSnapshotCache<PlayerRoastSnapshot>(snapshotKey, { allowStale: cacheMode === "cache-only" });
  if (cached?.payload && cacheMode !== "refresh") return cached.payload;
  if (cacheMode === "cache-only") return undefined;

  const { articles, matches } = await readRoastInputs();
  const contexts = buildPlayerContexts(teams, articles, matches);
  const aiResult = await generateAiPlayerRoasts(aiProviders, contexts, primaryAiProviderId);
  const snapshot: PlayerRoastSnapshot = {
    generatedAt: new Date().toISOString(),
    refreshDate: beijingDateString(),
    aiUsed: aiResult.aiUsed,
    aiProvider: aiResult.providerName,
    message: aiResult.message,
    newsCount: articles.length,
    matchCount: matches.length,
    items: aiResult.items,
  };
  await upsertSnapshotCache({
    snapshotKey,
    feature: "player-roasts",
    sourceMode: snapshot.aiUsed ? "remote" : "fallback",
    sourceId: snapshot.aiProvider || "rules-player-roasts",
    payload: snapshot,
    diagnostics: [],
    ttlSeconds: PLAYER_ROAST_TTL_SECONDS,
  });
  return snapshot;
}

export async function refreshPlayerRoasts(teams: Team[]): Promise<PlayerRoastSnapshot> {
  const snapshot = await getPlayerRoastSnapshot(teams, { cacheMode: "refresh" });
  if (!snapshot) throw new Error("failed to generate player roasts");
  return snapshot;
}
