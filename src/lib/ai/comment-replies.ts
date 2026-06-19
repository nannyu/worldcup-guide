import { readAdminConfig, type AiProviderConfig } from "@/lib/admin/config";
import { callAnthropicMessagesJson } from "@/lib/ai/anthropic-messages";
import type { CommentTargetType } from "@/lib/db/queries";

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

function stripMarkdown(input: string): string {
  return input
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactReply(input: string): string {
  const text = stripMarkdown(input);
  return text.length > 120 ? `${text.slice(0, 119)}…` : text;
}

function targetLabel(targetType: CommentTargetType): string {
  if (targetType === "match") return "比赛";
  if (targetType === "team") return "球队";
  return "新闻";
}

function fallbackAiReply(commentBody: string, targetType: CommentTargetType): string {
  const topic = targetLabel(targetType);
  const text = commentBody.replace(/\s+/g, " ").trim();
  if (/赢|冠军|夺冠|牛|强/.test(text)) {
    return `这气势可以，先把香槟放冰箱，别在小组赛就提前开瓶。`;
  }
  if (/输|菜|烂|崩|寄/.test(text)) {
    return `批评角度很到位，但先别急着盖棺，足球最爱把键盘判决改成加时剧本。`;
  }
  if (/裁判|黑哨|点球|红牌|黄牌/.test(text)) {
    return `裁判话题一开，评论区温度直接补时十分钟，建议先深呼吸再掏显微镜。`;
  }
  return `收到，这条${topic}观点有点东西：不一定能上战术板，但很适合上饭桌。`;
}

function buildPrompt(data: {
  targetType: CommentTargetType;
  targetId: string;
  commentBody: string;
  parentBody?: string;
}): string {
  return [
    "你是世界杯装杯指南的评论区 AI。只基于用户评论本身回应，不添加未提供的新事实。",
    "风格：中文，幽默、轻松、略有吐槽感；不辱骂用户，不给投注建议，不承诺结果。",
    "长度：一句话，最多 60 个中文字符。",
    "如果用户评论很短，也要接住情绪，不要追问。",
    `对象类型：${targetLabel(data.targetType)}；对象 ID：${data.targetId}`,
    data.parentBody ? `被回复内容：${data.parentBody}` : "",
    `最新评论：${data.commentBody}`,
    "只返回回复正文，不要 JSON，不要 Markdown。",
  ].filter(Boolean).join("\n");
}

async function callOpenAiCompatible(provider: AiProviderConfig, prompt: string): Promise<string> {
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
      temperature: 0.8,
      max_tokens: 160,
      ...providerOptions,
      messages: [
        { role: "system", content: "你只返回一条简短中文评论回复。" },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as OpenAiResponse;
  return compactReply(data.choices?.[0]?.message?.content || "");
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
        temperature: 0.8,
        maxOutputTokens: 160,
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
  const data = (await response.json()) as GeminiResponse;
  return compactReply(data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "");
}

async function callKimiCoding(provider: AiProviderConfig, prompt: string): Promise<string> {
  const content = await callAnthropicMessagesJson({
    provider,
    system: "你只返回一条简短中文评论回复。",
    prompt,
    temperature: 0.8,
    maxTokens: 160,
    timeoutMs: 12000,
  });
  return compactReply(content);
}

function providerOrder(providers: AiProviderConfig[], primaryId: string): AiProviderConfig[] {
  return providers
    .filter((provider) => provider.enabled && provider.apiKey && provider.baseUrl && provider.defaultModel)
    .sort((left, right) => {
      if (left.id === primaryId) return -1;
      if (right.id === primaryId) return 1;
      return 0;
    });
}

export async function generateAiCommentReply(data: {
  targetType: CommentTargetType;
  targetId: string;
  commentBody: string;
  parentBody?: string;
}): Promise<{ body: string; providerName: string; source: "ai" | "fallback" }> {
  const fallback = fallbackAiReply(data.commentBody, data.targetType);
  const config = await readAdminConfig({ resolveSecrets: true });
  const providers = providerOrder(config.aiProviders, config.primaryAiProviderId);
  if (!providers.length) return { body: fallback, providerName: "规则兜底", source: "fallback" };

  const prompt = buildPrompt(data);
  for (const provider of providers) {
    try {
      const body = provider.provider === "gemini"
        ? await callGemini(provider, prompt)
        : provider.provider === "kimi-coding"
          ? await callKimiCoding(provider, prompt)
          : await callOpenAiCompatible(provider, prompt);
      if (body) return { body, providerName: provider.name, source: "ai" };
    } catch (error) {
      console.error("[comments] AI reply failed", provider.name, error);
    }
  }

  return { body: fallback, providerName: "规则兜底", source: "fallback" };
}
