import type { AiProviderConfig } from "@/lib/admin/config";

export type AiTaskRun<T> = (provider: AiProviderConfig) => Promise<T>;
export type AiTaskFallback<T> = (errors: string[]) => T;

export interface AiTask<T> {
  id: string;
  label?: string;
  run: AiTaskRun<T>;
  fallback: AiTaskFallback<T>;
}

export interface AiTaskQueueOptions {
  providers: AiProviderConfig[];
  primaryProviderId?: string;
  concurrency?: number;
  providerAttempts?: number;
  disabled?: boolean;
  disabledMessage?: string;
}

export interface AiTaskQueueResult<T> {
  id: string;
  label?: string;
  value: T;
  source: "ai" | "fallback";
  providerName?: string;
  errors: string[];
}

export interface AiTaskQueueSummary<T> {
  results: AiTaskQueueResult<T>[];
  aiCount: number;
  fallbackCount: number;
  message: string;
}

function orderedProviders(
  providers: AiProviderConfig[],
  primaryProviderId: string | undefined,
  providerAttempts: number,
): AiProviderConfig[] {
  return providers
    .filter((provider) =>
      provider.enabled
      && provider.apiKey
      && provider.baseUrl
      && provider.defaultModel,
    )
    .slice()
    .sort((left, right) => {
      if (left.id === primaryProviderId) return -1;
      if (right.id === primaryProviderId) return 1;
      return 0;
    })
    .slice(0, Math.max(1, providerAttempts));
}

async function runSingleTask<T>(
  task: AiTask<T>,
  providers: AiProviderConfig[],
): Promise<AiTaskQueueResult<T>> {
  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const value = await task.run(provider);
      return {
        id: task.id,
        label: task.label,
        value,
        source: "ai",
        providerName: provider.name,
        errors,
      };
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return {
    id: task.id,
    label: task.label,
    value: task.fallback(errors),
    source: "fallback",
    errors,
  };
}

export async function runAiTaskQueue<T>(
  tasks: AiTask<T>[],
  options: AiTaskQueueOptions,
): Promise<AiTaskQueueSummary<T>> {
  const concurrency = Math.max(1, options.concurrency || 1);
  const providers = orderedProviders(
    options.providers,
    options.primaryProviderId,
    options.providerAttempts || options.providers.length || 1,
  );

  if (options.disabled || !providers.length) {
    const results = tasks.map((task) => ({
      id: task.id,
      label: task.label,
      value: task.fallback([]),
      source: "fallback" as const,
      errors: [],
    }));
    return {
      results,
      aiCount: 0,
      fallbackCount: results.length,
      message: options.disabledMessage || "未配置可用 AI Provider，已使用规则兜底。",
    };
  }

  const results: Array<AiTaskQueueResult<T> | undefined> = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await runSingleTask(tasks[index], providers);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );

  const completed = results.filter((result): result is AiTaskQueueResult<T> => Boolean(result));
  const aiCount = completed.filter((result) => result.source === "ai").length;
  const fallbackCount = completed.length - aiCount;
  const providerNames = Array.from(new Set(completed.flatMap((result) => result.providerName || [])));
  const errorCount = completed.reduce((total, result) => total + result.errors.length, 0);

  return {
    results: completed,
    aiCount,
    fallbackCount,
    message: aiCount
      ? `${providerNames.join(" + ")} 已完成 ${aiCount}/${tasks.length} 个 AI 小任务，${fallbackCount} 个使用规则兜底。`
      : `AI 小任务全部失败，已使用规则兜底。错误数：${errorCount}`,
  };
}
