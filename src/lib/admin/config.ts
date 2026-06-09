import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type DataSourceType =
  | "schedule"
  | "scores"
  | "prediction-market"
  | "odds"
  | "highlights"
  | "team-content"
  | "custom";

export type AiProviderType =
  | "openai"
  | "gemini"
  | "deepseek"
  | "kimi-coding"
  | "bigmodel"
  | "custom";

export interface DataSourceConfig {
  id: string;
  name: string;
  type: DataSourceType;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  refreshSeconds: number;
  notes: string;
}

export interface AiProviderConfig {
  id: string;
  name: string;
  provider: AiProviderType;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  enabled: boolean;
  notes: string;
}

export interface AdminConfig {
  dataSources: DataSourceConfig[];
  aiProviders: AiProviderConfig[];
  updatedAt: string;
}

const configPath = path.join(process.cwd(), "data", "admin-config.json");

export const defaultAdminConfig: AdminConfig = {
  updatedAt: new Date(0).toISOString(),
  dataSources: [
    {
      id: "fifa-schedule",
      name: "FIFA 官方赛程",
      type: "schedule",
      baseUrl: "https://inside.fifa.com",
      apiKey: "",
      enabled: true,
      refreshSeconds: 86400,
      notes: "作为赛程和日期校准来源。",
    },
    {
      id: "live-score",
      name: "实时比分源",
      type: "scores",
      baseUrl: "",
      apiKey: "",
      enabled: false,
      refreshSeconds: 30,
      notes: "接入第三方比分 API 后用于赛中比分和事件时间线。",
    },
    {
      id: "polymarket-gamma",
      name: "Polymarket Gamma API",
      type: "prediction-market",
      baseUrl: "https://gamma-api.polymarket.com",
      apiKey: "",
      enabled: true,
      refreshSeconds: 60,
      notes: "公开预测市场数据，不接交易能力。",
    },
    {
      id: "highlight-links",
      name: "合法集锦链接",
      type: "highlights",
      baseUrl: "",
      apiKey: "",
      enabled: false,
      refreshSeconds: 3600,
      notes: "央视频、FIFA+、B站等合法集锦入口。",
    },
  ],
  aiProviders: [
    {
      id: "openai",
      name: "OpenAI",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      defaultModel: "gpt-4.1-mini",
      enabled: false,
      notes: "用于早报总结、聊天金句、球队卡片改写。",
    },
    {
      id: "gemini",
      name: "Gemini",
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "",
      defaultModel: "gemini-2.5-flash",
      enabled: false,
      notes: "适合多模态和长上下文内容生成。",
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "",
      defaultModel: "deepseek-chat",
      enabled: false,
      notes: "可用于低成本中文内容生成。",
    },
    {
      id: "kimi-coding",
      name: "Kimi Coding",
      provider: "kimi-coding",
      baseUrl: "https://api.moonshot.cn/v1",
      apiKey: "",
      defaultModel: "kimi-k2-0711-preview",
      enabled: false,
      notes: "可用于代码辅助、内容结构化和长文本处理。",
    },
    {
      id: "bigmodel",
      name: "BigModel / 智谱",
      provider: "bigmodel",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: "",
      defaultModel: "glm-4.5",
      enabled: false,
      notes: "国内常见模型服务，可作为中文生成备选。",
    },
  ],
};

function normalizeRefreshSeconds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 10) return 60;
  return Math.round(parsed);
}

function normalizeConfig(input: Partial<AdminConfig>): AdminConfig {
  return {
    updatedAt: input.updatedAt || new Date().toISOString(),
    dataSources: (input.dataSources || []).map((source, index) => ({
      id: String(source.id || `data-source-${index + 1}`),
      name: String(source.name || "未命名数据源"),
      type: (source.type || "custom") as DataSourceType,
      baseUrl: String(source.baseUrl || ""),
      apiKey: String(source.apiKey || ""),
      enabled: Boolean(source.enabled),
      refreshSeconds: normalizeRefreshSeconds(source.refreshSeconds),
      notes: String(source.notes || ""),
    })),
    aiProviders: (input.aiProviders || []).map((provider, index) => ({
      id: String(provider.id || `ai-provider-${index + 1}`),
      name: String(provider.name || "未命名模型服务"),
      provider: (provider.provider || "custom") as AiProviderType,
      baseUrl: String(provider.baseUrl || ""),
      apiKey: String(provider.apiKey || ""),
      defaultModel: String(provider.defaultModel || ""),
      enabled: Boolean(provider.enabled),
      notes: String(provider.notes || ""),
    })),
  };
}

export async function readAdminConfig(): Promise<AdminConfig> {
  try {
    const raw = await readFile(configPath, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return defaultAdminConfig;
  }
}

export async function writeAdminConfig(config: AdminConfig): Promise<AdminConfig> {
  const nextConfig = normalizeConfig({
    ...config,
    updatedAt: new Date().toISOString(),
  });
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  return nextConfig;
}
