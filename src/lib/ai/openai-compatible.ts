import type { AiProviderConfig } from "@/lib/admin/config";

const providerNextRequestAt = new Map<string, number>();
const providerRateLimitChains = new Map<string, Promise<void>>();

function providerRateLimitRpm(provider: AiProviderConfig): number | undefined {
  if (provider.provider !== "nvidia") return undefined;
  const rpm = Number(process.env.NVIDIA_API_RPM || 40);
  return Number.isFinite(rpm) && rpm > 0 ? Math.min(40, Math.floor(rpm)) : 40;
}

function rateLimitKey(provider: AiProviderConfig): string {
  return `${provider.provider}:${provider.id}:${provider.baseUrl}:${provider.defaultModel}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForOpenAiCompatibleProviderSlot(provider: AiProviderConfig): Promise<void> {
  const rpm = providerRateLimitRpm(provider);
  if (!rpm) return;

  const key = rateLimitKey(provider);
  const intervalMs = Math.ceil(60_000 / rpm);
  const previous = providerRateLimitChains.get(key) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const waitMs = Math.max(0, (providerNextRequestAt.get(key) || 0) - Date.now());
      if (waitMs > 0) await delay(waitMs);
      providerNextRequestAt.set(key, Date.now() + intervalMs);
    });
  providerRateLimitChains.set(key, next);
  await next;
}

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
