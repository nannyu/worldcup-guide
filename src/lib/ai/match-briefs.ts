import type { AiProviderConfig } from "@/lib/admin/config";
import { callAnthropicMessagesJson } from "@/lib/ai/anthropic-messages";
import { runAiTaskQueue, type AiTask } from "@/lib/ai/task-orchestrator";
import { displayMatchEventPlayerName } from "@/lib/player-names";
import type { Match } from "@/lib/wc-data";

const MATCH_BRIEF_AI_TIMEOUT_MS = Number(process.env.MORNING_MATCH_BRIEF_AI_TIMEOUT_MS) || 60_000;
const MATCH_BRIEF_AI_CONCURRENCY = Number(process.env.MORNING_MATCH_BRIEF_AI_CONCURRENCY) || 3;
const MATCH_BRIEF_AI_PROVIDER_ATTEMPTS = Number(process.env.MORNING_MATCH_BRIEF_AI_PROVIDER_ATTEMPTS) || 2;

type MatchBrief = {
  briefZh?: string;
  briefEn?: string;
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

function compactText(input: string | undefined, maxLength: number): string | undefined {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function normalizeBrief(value: unknown): MatchBrief {
  const data = value as Partial<MatchBrief>;
  const briefZh = compactText(data.briefZh, 90);
  const briefEn = compactText(data.briefEn, 220);
  if (!briefZh && !briefEn) throw new Error("AI response JSON did not contain match brief");
  return { briefZh, briefEn };
}

function keyStat(match: Match, type: string, side: "home" | "away"): string | undefined {
  const value = match.statistics
    ?.find((group) => group.team === side)
    ?.stats.find((stat) => stat.type === type)
    ?.value;
  return value === undefined || value === null ? undefined : String(value);
}

function buildPrompt(match: Match): string {
  const facts = {
    id: match.id,
    group: match.group,
    round: match.round,
    status: match.status,
    kickoffBj: match.kickoffBj,
    venue: match.venue,
    home: {
      team: match.homeTeam,
      code: match.homeCode,
      score: match.homeScore,
      winProbability: match.homeWinProb || undefined,
      oddsImpliedProbability: match.oddsImpliedHome || undefined,
      shotsOnGoal: keyStat(match, "Shots on Goal", "home"),
      possession: keyStat(match, "Ball Possession", "home"),
    },
    away: {
      team: match.awayTeam,
      code: match.awayCode,
      score: match.awayScore,
      winProbability: match.awayWinProb || undefined,
      oddsImpliedProbability: match.oddsImpliedAway || undefined,
      shotsOnGoal: keyStat(match, "Shots on Goal", "away"),
      possession: keyStat(match, "Ball Possession", "away"),
    },
    drawProbability: match.drawProb || undefined,
    oddsImpliedDraw: match.oddsImpliedDraw || undefined,
    previewText: match.previewText || undefined,
    prediction: match.prediction,
    events: match.events?.slice(0, 8).map((event) => ({
      minute: event.minute,
      type: event.type,
      player: event.player,
      playerZh: displayMatchEventPlayerName(match, event, "zh-CN"),
      team: event.team,
      description: event.description,
    })),
    updatedAt: match.updatedAt,
  };

  return [
    "你是世界杯早报编辑。只基于输入比赛事实写一条“30秒看懂”比赛简评，不补充未提供信息。",
    "要求：briefZh 使用中文，约 80 字，最多 90 字；briefEn 使用英文，最多 45 words。",
    "已完赛就点出比分、结果和关键变量；进行中就点出当前局面；未开赛就点出看点、节奏或变量。",
    "避免投注建议、确定性预测、下注暗示和夸大收益。不要 Markdown。",
    '返回严格 JSON：{"briefZh":"","briefEn":""}',
    JSON.stringify(facts),
  ].join("\n");
}

async function callOpenAiCompatible(provider: AiProviderConfig, prompt: string): Promise<MatchBrief> {
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
      temperature: 0.45,
      response_format: { type: "json_object" },
      ...providerOptions,
      messages: [
        { role: "system", content: "You return accurate JSON only." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(MATCH_BRIEF_AI_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as OpenAiResponse;
  const content = data.choices?.[0]?.message?.content || "";
  return normalizeBrief(extractJson(content));
}

async function callGemini(provider: AiProviderConfig, prompt: string): Promise<MatchBrief> {
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
        temperature: 0.45,
        responseMimeType: "application/json",
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(MATCH_BRIEF_AI_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as GeminiResponse;
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return normalizeBrief(extractJson(content));
}

async function callKimiCoding(provider: AiProviderConfig, prompt: string): Promise<MatchBrief> {
  const content = await callAnthropicMessagesJson({
    provider,
    system: "You return accurate JSON only.",
    prompt,
    temperature: 0.45,
    maxTokens: 512,
    timeoutMs: MATCH_BRIEF_AI_TIMEOUT_MS,
  });
  return normalizeBrief(extractJson(content));
}

async function callProvider(provider: AiProviderConfig, prompt: string): Promise<MatchBrief> {
  if (provider.provider === "gemini") return callGemini(provider, prompt);
  if (provider.provider === "kimi-coding") return callKimiCoding(provider, prompt);
  return callOpenAiCompatible(provider, prompt);
}

export async function addAiMatchBriefsToMorningMatches({
  matches,
  providers,
  primaryProviderId,
  disabled,
}: {
  matches: Match[];
  providers: AiProviderConfig[];
  primaryProviderId?: string;
  disabled?: boolean;
}): Promise<{ matches: Match[]; aiUsed: boolean; message: string }> {
  if (!matches.length) return { matches, aiUsed: false, message: "早报无比赛，不生成比赛简评。" };

  const tasks: Array<AiTask<MatchBrief>> = matches.map((match) => ({
    id: match.id,
    label: `${match.homeTeam} vs ${match.awayTeam}`,
    run(provider) {
      return callProvider(provider, buildPrompt(match));
    },
    fallback() {
      return {};
    },
  }));

  const queue = await runAiTaskQueue(tasks, {
    providers,
    primaryProviderId,
    concurrency: MATCH_BRIEF_AI_CONCURRENCY,
    providerAttempts: MATCH_BRIEF_AI_PROVIDER_ATTEMPTS,
    disabled: disabled || process.env.MORNING_MATCH_BRIEF_DISABLE_AI === "1",
    disabledMessage: "MORNING_MATCH_BRIEF_DISABLE_AI=1，已跳过早报比赛 AI 简评。",
  });
  const byMatchId = new Map(queue.results.map((result) => [result.id, result]));
  return {
    matches: matches.map((match) => {
      const result = byMatchId.get(match.id);
      if (result?.source !== "ai") return match;
      return {
        ...match,
        aiBriefZh: result.value.briefZh,
        aiBriefEn: result.value.briefEn,
        aiBriefProvider: result.providerName,
      };
    }),
    aiUsed: queue.aiCount > 0,
    message: queue.message,
  };
}
