import type { AiProviderConfig } from "@/lib/admin/config";

export const KIMI_CODING_USER_AGENT = "claude-cli/2.1.170 (external, cli)";

type AnthropicMessagesResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

function anthropicMessagesEndpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/messages")) return base;
  if (base.endsWith("/v1")) return `${base}/messages`;
  return `${base}/v1/messages`;
}

export async function callAnthropicMessagesJson({
  provider,
  system,
  prompt,
  temperature,
  maxTokens,
  timeoutMs,
}: {
  provider: AiProviderConfig;
  system: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}): Promise<string> {
  const response = await fetch(anthropicMessagesEndpoint(provider.baseUrl), {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "user-agent": KIMI_CODING_USER_AGENT,
      "x-api-key": provider.apiKey,
    },
    body: JSON.stringify({
      model: provider.defaultModel,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`AI HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 240)}` : ""}`);
  }
  const data = (await response.json()) as AnthropicMessagesResponse;
  return data.content?.map((part) => part.text || "").join("") || "";
}
