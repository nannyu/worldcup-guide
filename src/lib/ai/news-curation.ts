import type { AiProviderConfig } from "@/lib/admin/config";
import { callAnthropicMessagesJson } from "@/lib/ai/anthropic-messages";
import type { NewsArticle } from "@/lib/wc-data";

const NEWS_AI_ANALYSIS_LIMIT = 20;

export interface AiNewsCuration {
  title: string;
  summary: string;
  quote: string;
  items: Array<{
    articleId: string;
    relatedArticleIds: string[];
    summary: string;
    keyPoints: string[];
    score?: number;
    editorialScore?: number;
    category?: string;
    comment?: string;
    titleZh?: string;
    titleEn?: string;
    summaryZh?: string;
    summaryEn?: string;
    keyPointsZh?: string[];
    keyPointsEn?: string[];
    commentZh?: string;
    commentEn?: string;
  }>;
  providerName: string;
}

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

function normalizeCuration(value: unknown, providerName: string): AiNewsCuration {
  const data = value as Partial<AiNewsCuration>;
  const items = Array.isArray(data.items)
    ? data.items
        .filter((item) => item && typeof item.articleId === "string")
        .map((item) => ({
          articleId: item.articleId,
          relatedArticleIds: Array.isArray(item.relatedArticleIds)
            ? item.relatedArticleIds.filter((id): id is string => typeof id === "string")
            : [],
          summary: String(item.summary || ""),
          keyPoints: Array.isArray(item.keyPoints)
            ? item.keyPoints.filter((point): point is string => typeof point === "string").slice(0, 4)
            : [],
          score: typeof item.score === "number" && Number.isFinite(item.score)
            ? Math.max(0, Math.min(100, Math.round(item.score)))
            : undefined,
          editorialScore: typeof item.editorialScore === "number" && Number.isFinite(item.editorialScore)
            ? Math.max(0, Math.min(100, Math.round(item.editorialScore)))
            : undefined,
          category: ["match-result", "tournament-news", "transfer", "injury", "tactical", "off-pitch", "other"].includes(item.category || "")
            ? item.category
            : undefined,
          comment: typeof item.comment === "string" ? item.comment.slice(0, 90) : undefined,
          titleZh: typeof item.titleZh === "string" ? item.titleZh.slice(0, 140) : undefined,
          titleEn: typeof item.titleEn === "string" ? item.titleEn.slice(0, 180) : undefined,
          summaryZh: typeof item.summaryZh === "string" ? item.summaryZh.slice(0, 180) : undefined,
          summaryEn: typeof item.summaryEn === "string" ? item.summaryEn.slice(0, 240) : undefined,
          keyPointsZh: Array.isArray(item.keyPointsZh)
            ? item.keyPointsZh.filter((point): point is string => typeof point === "string").slice(0, 4)
            : undefined,
          keyPointsEn: Array.isArray(item.keyPointsEn)
            ? item.keyPointsEn.filter((point): point is string => typeof point === "string").slice(0, 4)
            : undefined,
          commentZh: typeof item.commentZh === "string" ? item.commentZh.slice(0, 90) : undefined,
          commentEn: typeof item.commentEn === "string" ? item.commentEn.slice(0, 140) : undefined,
        }))
    : [];
  const result = {
    title: String(data.title || ""),
    summary: String(data.summary || ""),
    quote: String(data.quote || ""),
    items,
    providerName,
  };
  if (!result.title && !result.summary && !result.quote && !result.items.length) {
    throw new Error("AI response JSON did not match the curation schema");
  }
  return result;
}

function buildPrompt(articles: NewsArticle[]): string {
  const records = articles.slice(0, NEWS_AI_ANALYSIS_LIMIT).map((article) => ({
    id: article.id,
    title: article.title,
    summary: article.summary,
    source: article.source,
    publishedAt: article.publishedAt,
    relatedSources: article.relatedSources || [],
  }));
  return [
    "你是世界杯新闻编辑。只基于输入事实工作，不补充未提供的信息。",
    "任务：识别仍然重复或描述同一事件的条目，选择一个主条目；给每条主条目按新闻价值打 0-100 分（score）；再给每条主条目打编辑评分 0-100（editorialScore，综合重要性、独特性、时效性）；为每条分配事件分类（category）；同时生成中英文标题、摘要、要点和点评；再生成整期中文标题和总摘要。",
    "category 必须是以下之一：match-result（比赛结果）、tournament-news（赛事新闻）、transfer（转会）、injury（伤病）、tactical（战术）、off-pitch（场外）、other（其他）。",
    "score 侧重新闻热度（交叉报道数、来源权威性）；editorialScore 侧重新闻重要性和独家性（重大比赛结果 > 赛事动态 > 伤病 > 战术 > 转会 > 场外）。",
    "commentZh/commentEn 是一句点评：辛辣幽默、略毒舌，但只能基于输入事实，不得添加新事实或推断。",
    "返回严格 JSON，不要 Markdown：",
    '{"title":"","summary":"","items":[{"articleId":"","relatedArticleIds":[],"summary":"","keyPoints":[],"score":0,"editorialScore":0,"category":"match-result","comment":"","titleZh":"","titleEn":"","summaryZh":"","summaryEn":"","keyPointsZh":[],"keyPointsEn":[],"commentZh":"","commentEn":""}]}',
    "必须保留并准确使用以上字段名。summary/keyPoints/comment 保持中文兼容旧字段；titleZh/titleEn 等字段必须分别使用对应语言。",
    "relatedArticleIds 只能使用输入中的 id；不确定时不要合并。summary 不超过 90 字，keyPoints 每项不超过 35 字。不要生成正文翻译，正文翻译由免费翻译接口处理。",
    JSON.stringify(records),
  ].join("\n");
}

async function callOpenAiCompatible(
  provider: AiProviderConfig,
  prompt: string,
): Promise<AiNewsCuration> {
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
      temperature: 0.2,
      response_format: { type: "json_object" },
      ...providerOptions,
      messages: [
        { role: "system", content: "You return accurate JSON only." },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as OpenAiResponse;
  const content = data.choices?.[0]?.message?.content || "";
  return normalizeCuration(extractJson(content), provider.name);
}

async function callGemini(
  provider: AiProviderConfig,
  prompt: string,
): Promise<AiNewsCuration> {
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
        temperature: 0.2,
        responseMimeType: "application/json",
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as GeminiResponse;
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return normalizeCuration(extractJson(content), provider.name);
}

async function callKimiCoding(
  provider: AiProviderConfig,
  prompt: string,
): Promise<AiNewsCuration> {
  const content = await callAnthropicMessagesJson({
    provider,
    system: "You return accurate JSON only.",
    prompt,
    temperature: 0.2,
    maxTokens: 4096,
    timeoutMs: 30000,
  });
  return normalizeCuration(extractJson(content), provider.name);
}

export async function curateNewsWithAi(
  providers: AiProviderConfig[],
  articles: NewsArticle[],
): Promise<{ curation?: AiNewsCuration; message: string }> {
  const available = providers.filter(
    (provider) =>
      provider.enabled
      && provider.apiKey
      && provider.baseUrl
      && provider.defaultModel,
  );
  if (!available.length) {
    return { message: "未配置可用 AI Provider，已完成规则去重，AI 汇总未执行。" };
  }

  const prompt = buildPrompt(articles);
  const errors: string[] = [];
  for (const provider of available) {
    try {
      const curation = provider.provider === "gemini"
        ? await callGemini(provider, prompt)
        : provider.provider === "kimi-coding"
          ? await callKimiCoding(provider, prompt)
          : await callOpenAiCompatible(provider, prompt);
      return { curation, message: `${provider.name} 已完成后台整理。` };
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return { message: `AI Provider 调用失败，已保留规则去重结果。${errors.join("；")}` };
}
