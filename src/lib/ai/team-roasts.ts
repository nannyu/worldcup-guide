import { createHash } from "node:crypto";
import { readAdminConfig, type AiProviderConfig } from "@/lib/admin/config";
import { runAiTaskQueue, type AiTask } from "@/lib/ai/task-orchestrator";
import { getAggregatedMatches, getAggregatedNews, MORNING_BRIEF_NEWS_LIMIT } from "@/lib/data-sources/aggregate";
import { readSnapshotCache, upsertSnapshotCache } from "@/lib/db/queries/data-cache";
import {
  matchesByDate,
  type Match,
  type NewsArticle,
  type Team,
  type TeamRoastItem,
  type TeamRoastSnapshot,
} from "@/lib/wc-data";

const TEAM_ROAST_SNAPSHOT_VERSION = "v1";
const TEAM_ROAST_TTL_SECONDS = 6 * 60 * 60;
const TEAM_ROAST_NEWS_LIMIT = MORNING_BRIEF_NEWS_LIMIT;
const TEAM_ROAST_RELATED_NEWS_LIMIT = 3;
const TEAM_ROAST_RELATED_MATCH_LIMIT = 3;
const TEAM_ROAST_AI_TIMEOUT_MS = Number(process.env.TEAM_ROAST_AI_TIMEOUT_MS) || 180_000;
const TEAM_ROAST_AI_PROVIDER_ATTEMPTS = 2;
const TEAM_ROAST_AI_CONCURRENCY = 4;
const FORBIDDEN_ROAST_PATTERNS = [
  /很适合当聊天黑马/,
  /前提是别把/,
  /纸面答案很豪华.*世界杯不批改简历/,
  /剧本不是霸屏，是添堵/,
  /强队要是轻敌，素材就会自己送上门/,
  /先看他在本队体系里的任务/,
];

type TeamRoastReadOptions = {
  cacheMode?: "cache-only" | "cache-first" | "refresh";
};

type TeamContext = {
  team: Team;
  news: NewsArticle[];
  matches: Match[];
};

type AiTeamRoastPayload = {
  item?: AiTeamRoastRecord;
  items?: AiTeamRoastRecord[];
  teamCode?: string;
  teamName?: string;
  teamNameEn?: string;
  roast?: string;
  evidence?: string[];
  articleIds?: string[];
  matchIds?: string[];
};

type AiTeamRoastRecord = {
  teamCode?: string;
  teamName?: string;
  teamNameEn?: string;
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

function canonicalKey(input: string | undefined): string {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function teamKeys(team: Pick<Team, "code" | "name" | "nameEn">): string[] {
  return [team.code, team.name, team.nameEn]
    .map(canonicalKey)
    .filter(Boolean);
}

function teamRoastSnapshotKey(configUpdatedAt: string): string {
  return `team-roasts:${TEAM_ROAST_SNAPSHOT_VERSION}:latest:${configUpdatedAt}`;
}

function beijingDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function compactText(input: string | undefined, maxLength: number): string {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function stableIndex(seed: string, modulo: number): number {
  const digest = createHash("sha1").update(seed).digest("hex").slice(0, 8);
  return Number.parseInt(digest, 16) % modulo;
}

function roastSignature(input: string): string {
  return input
    .replace(/[，。！？；：“”‘’、\s]/g, "")
    .replace(/[A-Za-z0-9]/g, "")
    .slice(0, 32);
}

function isTemplateLikeRoast(input: string): boolean {
  return FORBIDDEN_ROAST_PATTERNS.some((pattern) => pattern.test(input));
}

function teamSearchTerms(team: Team): string[] {
  const starNames = team.starPlayers?.flatMap((player) => [player.name, player.nameZh || ""]) || [];
  const rosterNames = team.roster?.slice(0, 8).flatMap((player) => [player.name, player.nameZh || ""]) || [];
  return [
    team.name,
    team.nameEn,
    ...team.stars,
    ...starNames,
    ...rosterNames,
  ]
    .map((term) => term.replace(/\s+/g, " ").trim())
    .filter((term) => term.length >= 2);
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

function relatedNewsForTeam(team: Team, articles: NewsArticle[]): NewsArticle[] {
  const terms = teamSearchTerms(team).map((term) => term.toLowerCase());
  return articles
    .map((article) => {
      const text = articleText(article).toLowerCase();
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
      return { article, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || Date.parse(right.article.publishedAt) - Date.parse(left.article.publishedAt))
    .map((item) => item.article)
    .slice(0, TEAM_ROAST_RELATED_NEWS_LIMIT);
}

function matchIncludesTeam(match: Match, team: Team): boolean {
  const keys = new Set(teamKeys(team));
  return [
    match.homeCode,
    match.awayCode,
    match.homeTeam,
    match.awayTeam,
  ].some((value) => keys.has(canonicalKey(value)));
}

function relatedMatchesForTeam(team: Team, matches: Match[]): Match[] {
  return matches
    .filter((match) => matchIncludesTeam(match, team))
    .slice(0, TEAM_ROAST_RELATED_MATCH_LIMIT);
}

function opponentFor(team: Team, match: Match): string {
  const keys = new Set(teamKeys(team));
  return keys.has(canonicalKey(match.homeCode)) || keys.has(canonicalKey(match.homeTeam))
    ? match.awayTeam
    : match.homeTeam;
}

function matchAngle(team: Team, match: Match | undefined): string {
  if (!match) return "";
  const opponent = opponentFor(team, match);
  if (match.status === "finished" && match.homeScore !== null && match.awayScore !== null) {
    return `刚交出 ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam} 的答卷`;
  }
  if (match.status === "live") {
    return `正在和${opponent}把素材现场写出来`;
  }
  return `${match.kickoffBj}要先过${opponent}这一关`;
}

function buildFallbackRoast(context: TeamContext): TeamRoastItem {
  const { team, news, matches } = context;
  const stars = (team.starPlayers?.map((player) => player.nameZh || player.name) || team.stars).slice(0, 2);
  const firstNews = news[0];
  const firstMatch = matches[0];
  const evidence = [
    firstNews ? `新闻：${compactText(firstNews.titleZh || firstNews.title, 34)}` : undefined,
    firstMatch ? `赛程：${matchAngle(team, firstMatch)}` : undefined,
    `球队：${team.formation} · ${team.tags.slice(0, 2).join("、")}`,
  ].filter((item): item is string => Boolean(item));
  const newsAngle = firstNews
    ? `最新新闻还在盯着「${compactText(firstNews.titleZh || firstNews.title, 24)}」`
    : firstMatch
      ? matchAngle(team, firstMatch)
      : `${team.formation} 和 ${team.tags.slice(0, 2).join("、")} 还是纸面卖点`;
  const coachName = team.coachZh || team.coach;
  const core = stars.join("、") || coachName || team.tags[0] || team.formation;
  const style = compactText(
    team.style
      .replace(team.name, "")
      .replace(/[。.!！?？]+$/g, ""),
    34,
  ) || `${team.group}组的基本盘还得现场验货`;
  const lead = stars[0] || coachName || team.name;
  const support = stars[1] || team.tags[1] || team.formation;
  const tags = team.tags.slice(0, 2).join("、") || team.formation;
  const angles = [
    `${team.name}的卖点不是一句${tags}就能盖章；${lead}要是被迫单机，${newsAngle}会立刻变成压力清单。`,
    `${coachName || team.name}把${team.formation}摆出来，听着像说明书；可${style}，少一次补位都够被对手写进复盘。`,
    `${lead}和${support}能把话题撑起来，但${team.name}真正怕的是中后场断电；${newsAngle}，热搜不会替他们防反击。`,
    `${team.name}这套${team.formation}最忌半吊子执行：${tags}只是入口，${style}，踢不出来就只剩标签好看。`,
    `${newsAngle}，${team.name}别把${core}当免死金牌；杯赛最会把阵容亮点拧成短板公开课。`,
    `${team.name}的聊天素材够多，麻烦也够具体：${style}。${lead}能抬上限，但下限还得靠全队别漏风。`,
  ];
  return {
    teamCode: team.code,
    teamName: team.name,
    teamNameEn: team.nameEn,
    roast: angles[stableIndex(`${team.code || team.name}:${firstNews?.id || firstMatch?.id || team.style}`, angles.length)],
    evidence,
    articleIds: news.map((article) => article.id),
    matchIds: matches.map((match) => match.id),
    updatedAt: new Date().toISOString(),
    source: "rules",
  };
}

function enforceUniqueRoasts(items: TeamRoastItem[], contexts: TeamContext[]): TeamRoastItem[] {
  const seen = new Set<string>();
  const contextByCode = new Map(contexts.map((context) => [context.team.code, context]));
  return items.map((item) => {
    const signature = roastSignature(item.roast);
    const context = contextByCode.get(item.teamCode);
    if (context && (isTemplateLikeRoast(item.roast) || seen.has(signature))) {
      const fallback = buildFallbackRoast(context);
      seen.add(roastSignature(fallback.roast));
      return {
        ...fallback,
        evidence: item.evidence?.length ? item.evidence : fallback.evidence,
        articleIds: item.articleIds?.length ? item.articleIds : fallback.articleIds,
        matchIds: item.matchIds?.length ? item.matchIds : fallback.matchIds,
      };
    }
    seen.add(signature);
    return item;
  });
}

function buildTeamContexts(teams: Team[], articles: NewsArticle[], matches: Match[]): TeamContext[] {
  return teams.map((team) => ({
    team,
    news: relatedNewsForTeam(team, articles),
    matches: relatedMatchesForTeam(team, matches),
  }));
}

function buildPrompt(context: TeamContext): string {
  const { team, news, matches } = context;
  const record = {
    teamCode: team.code,
    teamName: team.name,
    teamNameEn: team.nameEn,
    group: team.group,
    coach: team.coach,
    coachZh: team.coachZh,
    formation: team.formation,
    tags: team.tags,
    style: compactText(team.style, 100),
    starPlayers: (team.starPlayers?.map((player) => player.nameZh || player.name) || team.stars).slice(0, 5),
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
    "你是世界杯球队卡片编辑，负责写中文“AI 毒舌”。",
    "只为输入里的这一支球队写一句，不要写其他球队。",
    "只基于输入的球队资料、相关新闻和赛程赛况写，不要补充外部事实，不要造谣。",
    "风格：辛辣、短促、有梗，但攻击点只能是战术、阵容、状态、新闻热度、赛果表现；禁止地域/民族/国籍歧视，禁止人身侮辱。",
    "不能套用“很适合当聊天黑马，前提是…”这类模板。",
    "每条 roast 55-95 个中文字符。相关新闻为空时，就结合阵型、标签、主帅、球星和赛程写。",
    "返回严格 JSON，不要 Markdown：",
    '{"teamCode":"","teamName":"","teamNameEn":"","roast":"","evidence":[],"articleIds":[],"matchIds":[]}',
    "teamCode 使用输入 teamCode；articleIds/matchIds 只能使用输入中的 id。",
    JSON.stringify(record),
  ].join("\n");
}

function normalizeAiItem(
  value: unknown,
  context: TeamContext,
  providerName: string,
): TeamRoastItem {
  const data = value as AiTeamRoastPayload;
  const item = Array.isArray(data.items) ? data.items[0] : data.item || data;
  const now = new Date().toISOString();
  const roast = compactText(item?.roast, 120);
  if (roast.length < 12) {
    throw new Error("AI response did not include a usable roast");
  }
  return {
    teamCode: context.team.code,
    teamName: context.team.name,
    teamNameEn: context.team.nameEn,
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
    updatedAt: now,
    source: "ai",
    aiProvider: providerName,
  };
}

async function callOpenAiCompatible(
  provider: AiProviderConfig,
  prompt: string,
  context: TeamContext,
): Promise<TeamRoastItem> {
  const providerOptions = provider.provider === "deepseek"
    ? { thinking: { type: "disabled" } }
    : {};
  const response = await fetch(joinUrl(provider.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: provider.defaultModel,
      temperature: 0.75,
      response_format: { type: "json_object" },
      ...providerOptions,
      messages: [
        { role: "system", content: "You write concise Chinese football commentary and return accurate JSON only." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(TEAM_ROAST_AI_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as OpenAiResponse;
  const content = data.choices?.[0]?.message?.content || "";
  return normalizeAiItem(extractJson(content), context, provider.name);
}

async function callGemini(
  provider: AiProviderConfig,
  prompt: string,
  context: TeamContext,
): Promise<TeamRoastItem> {
  const endpoint = joinUrl(
    provider.baseUrl,
    `/models/${encodeURIComponent(provider.defaultModel)}:generateContent`,
  );
  const url = new URL(endpoint);
  url.searchParams.set("key", provider.apiKey);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.75,
        responseMimeType: "application/json",
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(TEAM_ROAST_AI_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as GeminiResponse;
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return normalizeAiItem(extractJson(content), context, provider.name);
}

async function generateAiRoasts(
  providers: AiProviderConfig[],
  contexts: TeamContext[],
  primaryAiProviderId: string,
): Promise<{ items: TeamRoastItem[]; providerName?: string; aiUsed: boolean; message: string }> {
  const tasks: Array<AiTask<TeamRoastItem>> = contexts.map((context) => ({
    id: context.team.id,
    label: context.team.name,
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
    concurrency: Number(process.env.TEAM_ROAST_AI_CONCURRENCY) || TEAM_ROAST_AI_CONCURRENCY,
    providerAttempts: TEAM_ROAST_AI_PROVIDER_ATTEMPTS,
    disabled: process.env.TEAM_ROAST_DISABLE_AI === "1",
    disabledMessage: "TEAM_ROAST_DISABLE_AI=1，已使用新闻/赛程规则生成球队毒舌。",
  });
  const providerNames = Array.from(new Set(queue.results.flatMap((result) => result.providerName || [])));
  return {
    items: enforceUniqueRoasts(queue.results.map((result) => result.value), contexts),
    providerName: providerNames.join(" + ") || undefined,
    aiUsed: queue.aiCount > 0,
    message: queue.message,
  };
}

async function readRoastInputs(): Promise<{ articles: NewsArticle[]; matches: Match[] }> {
  const [newsResult, yesterday, today, tomorrow] = await Promise.all([
    getAggregatedNews({ limit: TEAM_ROAST_NEWS_LIMIT, cacheMode: "cache-only" }),
    getAggregatedMatches("yesterday", { cacheMode: "cache-only" }),
    getAggregatedMatches("today", { cacheMode: "cache-only" }),
    getAggregatedMatches("tomorrow", { cacheMode: "cache-only" }),
  ]);
  const cachedMatches = [...yesterday.matches, ...today.matches, ...tomorrow.matches];
  return {
    articles: newsResult.articles,
    matches: cachedMatches.length
      ? cachedMatches
      : [...matchesByDate.yesterday, ...matchesByDate.today, ...matchesByDate.tomorrow],
  };
}

export function applyTeamRoasts(teams: Team[], snapshot?: TeamRoastSnapshot): Team[] {
  if (!snapshot?.items.length) return teams;
  const roasts = new Map<string, TeamRoastItem>();
  for (const item of snapshot.items) {
    for (const key of [item.teamCode, item.teamName, item.teamNameEn].map(canonicalKey).filter(Boolean)) {
      roasts.set(key, item);
    }
  }
  return teams.map((team) => {
    const roast = teamKeys(team).map((key) => roasts.get(key)).find(Boolean);
    return roast ? { ...team, roast: roast.roast } : team;
  });
}

export async function getTeamRoastSnapshot(
  teams: Team[],
  options: TeamRoastReadOptions = {},
): Promise<TeamRoastSnapshot | undefined> {
  const { aiProviders, primaryAiProviderId, updatedAt } = await readAdminConfig();
  const snapshotKey = teamRoastSnapshotKey(updatedAt);
  const cacheMode = options.cacheMode || "cache-first";
  const cached = await readSnapshotCache<TeamRoastSnapshot>(snapshotKey, { allowStale: cacheMode === "cache-only" });
  if (cached?.payload && cacheMode !== "refresh") return cached.payload;
  if (cacheMode === "cache-only") return undefined;

  const { articles, matches } = await readRoastInputs();
  const contexts = buildTeamContexts(teams, articles, matches);
  const aiResult = await generateAiRoasts(aiProviders, contexts, primaryAiProviderId);
  const snapshot: TeamRoastSnapshot = {
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
    feature: "team-roasts",
    sourceMode: snapshot.aiUsed ? "remote" : "fallback",
    sourceId: snapshot.aiProvider || "rules-team-roasts",
    payload: snapshot,
    diagnostics: [],
    ttlSeconds: TEAM_ROAST_TTL_SECONDS,
  });
  return snapshot;
}

export async function refreshTeamRoasts(teams: Team[]): Promise<TeamRoastSnapshot> {
  const snapshot = await getTeamRoastSnapshot(teams, { cacheMode: "refresh" });
  if (!snapshot) throw new Error("failed to generate team roasts");
  return snapshot;
}
