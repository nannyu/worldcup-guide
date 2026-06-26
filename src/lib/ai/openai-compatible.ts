import type { AiProviderConfig } from "@/lib/admin/config";

export function openAiCompatibleProviderOptions(provider: AiProviderConfig): Record<string, unknown> {
  if (provider.provider === "nvidia") {
    return {
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16_384,
      chat_template_kwargs: { thinking: false },
    };
  }
  if (provider.provider === "deepseek") {
    return { thinking: { type: "disabled" } };
  }
  return {};
}
