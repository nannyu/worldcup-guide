import type { AiProviderConfig } from "@/lib/admin/config";
import { callAnthropicMessagesJson } from "@/lib/ai/anthropic-messages";
import { openAiCompatibleProviderOptions } from "@/lib/ai/openai-compatible";
import type { NewsArticle } from "@/lib/wc-data";

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

function buildPrompt(article: NewsArticle, comment: string): string {
  const title = article.titleZh || article.title;
  const summary = article.summaryZh || article.aiSummary || article.summary;
  return [
    `新闻标题：${title}`,
    `新闻摘要：${summary}`,
    "",
    `用户评论：${comment}`,
    "",
    "请用简短（50 字以内）、有见地、偶尔幽默的方式回复这条评论。直接输出回复文本，不要 JSON，不要前缀。",
  ].join("\n");
}

function normalizeReply(text: string): string {
  return text.trim().replace(/^["“”]+|["“”]+$/g, "").slice(0, 200);
}

async function callOpenAiCompatible(
  provider: AiProviderConfig,
  prompt: string,
): Promise<string> {
  const providerOptions = openAiCompatibleProviderOptions(provider);
  const response = await fetch(joinUrl(provider.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: provider.defaultModel,
      temperature: 0.7,
      max_tokens: 200,
      ...providerOptions,
      messages: [
        { role: "system", content: "你是世界杯 2026 的资深球迷评论员，回复简短幽默。" },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as OpenAiResponse;
  return normalizeReply(data.choices?.[0]?.message?.content || "");
}

async function callGemini(
  provider: AiProviderConfig,
  prompt: string,
): Promise<string> {
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
        temperature: 0.7,
        maxOutputTokens: 200,
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: "你是世界杯 2026 的资深球迷评论员，回复简短幽默。" }] },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as GeminiResponse;
  return normalizeReply(data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "");
}

async function callKimiCoding(
  provider: AiProviderConfig,
  prompt: string,
): Promise<string> {
  const content = await callAnthropicMessagesJson({
    provider,
    system: "你是世界杯 2026 的资深球迷评论员，回复简短幽默。",
    prompt,
    temperature: 0.7,
    maxTokens: 200,
    timeoutMs: 15_000,
  });
  return normalizeReply(content);
}

export async function generateCommentReply(
  article: NewsArticle,
  comment: string,
  providers: AiProviderConfig[],
): Promise<{ reply: string; message: string }> {
  const available = providers.filter(
    (p) => p.enabled && p.apiKey && p.baseUrl && p.defaultModel,
  );
  if (!available.length) {
    return { reply: "", message: "未配置可用 AI Provider。" };
  }

  const prompt = buildPrompt(article, comment);
  const errors: string[] = [];
  for (const provider of available) {
    try {
      const reply = provider.provider === "gemini"
        ? await callGemini(provider, prompt)
        : provider.provider === "kimi-coding"
          ? await callKimiCoding(provider, prompt)
        : await callOpenAiCompatible(provider, prompt);
      if (reply) return { reply, message: `${provider.name} 已生成回复。` };
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  return { reply: "", message: `AI 回复生成失败。${errors.join("；")}` };
}
