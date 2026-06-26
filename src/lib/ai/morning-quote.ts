import type { AiProviderConfig } from "@/lib/admin/config";
import { callAnthropicMessagesJson } from "@/lib/ai/anthropic-messages";
import { openAiCompatibleProviderOptions } from "@/lib/ai/openai-compatible";
import type { Match, MorningQuote, NewsArticle } from "@/lib/wc-data";

const MORNING_QUOTE_AI_TIMEOUT_MS = Number(process.env.MORNING_QUOTE_AI_TIMEOUT_MS) || 45_000;

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

function compactText(input: string | undefined, maxLength: number): string {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  return chars.length <= maxLength ? text : `${chars.slice(0, maxLength - 1).join("").trim()}…`;
}

function extractJson(input: string): unknown {
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const text = (fenced || input).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI response did not contain JSON");
  return JSON.parse(text.slice(start, end + 1));
}

function normalizeQuote(value: unknown): string {
  const data = value as { quote?: unknown; comment?: unknown; text?: unknown };
  const quote = typeof data.quote === "string"
    ? data.quote
    : typeof data.comment === "string"
      ? data.comment
      : typeof data.text === "string"
        ? data.text
        : "";
  const normalized = compactText(quote, 100);
  if (!normalized) throw new Error("AI response JSON did not contain quote");
  return normalized;
}

function matchFacts(match: Match) {
  return {
    id: match.id,
    group: match.group,
    round: match.round,
    status: match.status,
    kickoffBj: match.kickoffBj,
    venue: match.venue,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    events: match.events?.slice(0, 6).map((event) => ({
      minute: event.minute,
      type: event.type,
      player: event.player,
      team: event.team,
      description: event.description,
    })),
    previewText: match.previewText || undefined,
    aiBriefZh: match.aiBriefZh || undefined,
    updatedAt: match.updatedAt,
  };
}

function articleFacts(article: NewsArticle) {
  return {
    id: article.id,
    title: article.titleZh || article.title,
    summary: article.summaryZh || article.aiSummary || article.summary,
    keyPoints: article.keyPointsZh || article.aiKeyPoints || article.keyPointsEn || [],
    comment: article.commentZh || article.aiComment || article.commentEn,
    score: article.aiScore,
    source: article.source,
    publishedAt: article.publishedAt,
    relatedSources: article.relatedSources || [],
  };
}

function buildPrompt(input: {
  dateKey: string;
  news: NewsArticle[];
  matches: Match[];
}): string {
  const records = {
    dateKey: input.dateKey,
    keyNews: input.news.map(articleFacts),
    matches: input.matches.map(matchFacts),
  };
  return [
    "你是世界杯早报的毒舌评论员，负责为重点新闻下方的 Quote card 单独写一条评论。",
    "先阅读全部 keyNews 和 matches。优先评论与最近比赛、实时比分、完赛结果、球队表现或比赛直接相关的内容；如果比赛信息不足，再评论最重要的新闻事实。",
    "可以使用公开背景或检索能力辅助理解，但最终输出只能落在输入新闻和比赛事实能支撑的内容上；不得写入输入中没有的比分、伤病、名单、转会、处罚或确定性预测。",
    "风格：中文，辛辣幽默、略毒舌，有观点但不恶意攻击个人；避免投注建议、下注暗示、确定性收益或煽动性表达。",
    "长度：100 字以内。不要 Markdown。不要解释。",
    '返回严格 JSON：{"quote":""}',
    JSON.stringify(records),
  ].join("\n");
}

async function callOpenAiCompatible(provider: AiProviderConfig, prompt: string): Promise<string> {
  const providerOptions = openAiCompatibleProviderOptions(provider);
  const response = await fetch(joinUrl(provider.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: provider.defaultModel,
      temperature: 0.55,
      response_format: { type: "json_object" },
      ...providerOptions,
      messages: [
        { role: "system", content: "You return accurate JSON only." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(MORNING_QUOTE_AI_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as OpenAiResponse;
  const content = data.choices?.[0]?.message?.content || "";
  return normalizeQuote(extractJson(content));
}

async function callGemini(provider: AiProviderConfig, prompt: string): Promise<string> {
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
        temperature: 0.55,
        responseMimeType: "application/json",
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(MORNING_QUOTE_AI_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as GeminiResponse;
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return normalizeQuote(extractJson(content));
}

async function callKimiCoding(provider: AiProviderConfig, prompt: string): Promise<string> {
  const content = await callAnthropicMessagesJson({
    provider,
    system: "You return accurate JSON only.",
    prompt,
    temperature: 0.55,
    maxTokens: 1024,
    timeoutMs: MORNING_QUOTE_AI_TIMEOUT_MS,
  });
  return normalizeQuote(extractJson(content));
}

function fallbackQuote(input: { news: NewsArticle[]; matches: Match[] }): string {
  const finished = input.matches.find((match) => match.status === "finished" && match.homeScore !== null && match.awayScore !== null);
  if (finished) {
    return compactText(
      `${finished.homeTeam} ${finished.homeScore}:${finished.awayScore} ${finished.awayTeam}，新闻写得再热闹，比分才是最不懂客套的嘴。`,
      100,
    );
  }
  const live = input.matches.find((match) => match.status === "live");
  if (live) {
    return compactText(`${live.homeTeam}对${live.awayTeam}还在踢，场外标题先别上头，场内每一分钟都可能改稿。`, 100);
  }
  const upcoming = input.matches[0];
  if (upcoming) {
    return compactText(`${upcoming.homeTeam}对${upcoming.awayTeam}还没开球，新闻已经把气氛炒满，就等球员别把铺垫踢成尴尬。`, 100);
  }
  const article = input.news[0];
  if (article) {
    return compactText(`${article.titleZh || article.title}。新闻点够多，但世界杯最会教育人的地方，是热闹最后都要被事实验票。`, 100);
  }
  return "新闻源和比赛源都还在路上，今天的毒舌先收着，等事实进场再开麦。";
}

export async function generateMorningQuote(input: {
  providers: AiProviderConfig[];
  news: NewsArticle[];
  matches: Match[];
  dateKey: string;
  inputHash: string;
  disabled?: boolean;
}): Promise<MorningQuote> {
  const generatedAt = new Date().toISOString();
  const base = {
    id: `morning-quote:${input.dateKey}:${input.inputHash}`,
    inputHash: input.inputHash,
    generatedAt,
    newsArticleIds: input.news.map((article) => article.id),
    matchIds: input.matches.map((match) => match.id),
  };
  const available = input.providers.filter(
    (provider) =>
      provider.enabled
      && provider.apiKey
      && provider.baseUrl
      && provider.defaultModel,
  );
  if (input.disabled || !available.length) {
    return {
      ...base,
      text: fallbackQuote(input),
      source: "fallback",
    };
  }

  const prompt = buildPrompt(input);
  for (const provider of available) {
    try {
      const text = provider.provider === "gemini"
        ? await callGemini(provider, prompt)
        : provider.provider === "kimi-coding"
          ? await callKimiCoding(provider, prompt)
          : await callOpenAiCompatible(provider, prompt);
      return {
        ...base,
        text,
        providerName: provider.name,
        source: "ai",
      };
    } catch {
      // Try the next configured provider; the caller persists a fallback if all providers fail.
    }
  }

  return {
    ...base,
    text: fallbackQuote(input),
    source: "fallback",
  };
}
