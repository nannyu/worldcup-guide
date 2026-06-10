import type { AiProviderConfig } from "@/lib/admin/config";
import type { NewsArticle } from "@/lib/wc-data";

export interface AiNewsCuration {
  title: string;
  summary: string;
  quote: string;
  items: Array<{
    articleId: string;
    relatedArticleIds: string[];
    summary: string;
    keyPoints: string[];
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
  const records = articles.slice(0, 24).map((article) => ({
    id: article.id,
    title: article.title,
    summary: article.summary,
    source: article.source,
    publishedAt: article.publishedAt,
    relatedSources: article.relatedSources || [],
  }));
  return [
    "你是世界杯新闻编辑。只基于输入事实工作，不补充未提供的信息。",
    "任务：识别仍然重复或描述同一事件的条目，选择一个主条目；生成简洁中文摘要和要点；再生成整期标题、总摘要和可复制短句。",
    "返回严格 JSON，不要 Markdown：",
    '{"title":"","summary":"","quote":"","items":[{"articleId":"","relatedArticleIds":[],"summary":"","keyPoints":[]}]}',
    "必须保留并准确使用以上字段名：title、summary、quote、items、articleId、relatedArticleIds、keyPoints。",
    "relatedArticleIds 只能使用输入中的 id；不确定时不要合并。summary 不超过 90 字，keyPoints 每项不超过 35 字。",
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
        : await callOpenAiCompatible(provider, prompt);
      return { curation, message: `${provider.name} 已完成后台整理。` };
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return { message: `AI Provider 调用失败，已保留规则去重结果。${errors.join("；")}` };
}
