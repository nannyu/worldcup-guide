import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type DataSourceType =
  | "schedule"
  | "scores"
  | "prediction-market"
  | "odds"
  | "highlights"
  | "news"
  | "team-content"
  | "custom";

export type DataSourceAdapter =
  | "openfootball-worldcup-json"
  | "polymarket-gamma"
  | "worldcup26-api"
  | "worldcupapi-com"
  | "football-data-org"
  | "openligadb"
  | "the-odds-api"
  | "thesportsdb"
  | "zafronix"
  | "balldontlie-fifa"
  | "rss-feed"
  | "currents-api"
  | "gdelt-doc"
  | "newsapi-org"
  | "generic-json";

export type ApiKeyPlacement = "none" | "query" | "header" | "bearer" | "path";

export type AiProviderType =
  | "openai"
  | "gemini"
  | "deepseek"
  | "xiaomi-mimo"
  | "kimi-coding"
  | "bigmodel"
  | "custom";

export interface DataSourceConfig {
  id: string;
  name: string;
  type: DataSourceType;
  adapter: DataSourceAdapter;
  baseUrl: string;
  endpointPath: string;
  apiKey: string;
  apiKeyPlacement: ApiKeyPlacement;
  apiKeyParamName: string;
  apiKeyHeaderName: string;
  enabled: boolean;
  priority: number;
  refreshSeconds: number;
  cacheTtlSeconds: number;
  timeoutMs: number;
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
  primaryAiProviderId: string;
  updatedAt: string;
}

const configPath = path.join(process.cwd(), "data", "admin-config.json");

export const defaultAdminConfig: AdminConfig = {
  updatedAt: new Date(0).toISOString(),
  primaryAiProviderId: "deepseek",
  dataSources: [
    {
      id: "openfootball-worldcup-json",
      name: "OpenFootball World Cup JSON",
      type: "schedule",
      adapter: "openfootball-worldcup-json",
      baseUrl: "https://raw.githubusercontent.com",
      endpointPath: "/openfootball/worldcup.json/master/2026/worldcup.json",
      apiKey: "",
      apiKeyPlacement: "none",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: true,
      priority: 10,
      refreshSeconds: 86400,
      cacheTtlSeconds: 86400,
      timeoutMs: 8000,
      notes: "免费、无 key、可作为 104 场赛程的本地种子和默认赛程源。",
    },
    {
      id: "worldcup26-ir",
      name: "worldcup26.ir 免费 API",
      type: "scores",
      adapter: "worldcup26-api",
      baseUrl: "https://worldcup26.ir",
      endpointPath: "/api/matches",
      apiKey: "",
      apiKeyPlacement: "none",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: false,
      priority: 20,
      refreshSeconds: 30,
      cacheTtlSeconds: 30,
      timeoutMs: 5000,
      notes: "候选实时比分/积分源。免费源结构需线上验证，默认不覆盖主赛程。",
    },
    {
      id: "polymarket-gamma",
      name: "Polymarket Gamma API",
      type: "prediction-market",
      adapter: "polymarket-gamma",
      baseUrl: "https://gamma-api.polymarket.com",
      endpointPath: "/events",
      apiKey: "",
      apiKeyPlacement: "none",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: true,
      priority: 10,
      refreshSeconds: 60,
      cacheTtlSeconds: 60,
      timeoutMs: 6000,
      notes: "公开预测市场数据，不接交易能力。",
    },
    {
      id: "worldcupapi-com",
      name: "WorldCupAPI.com",
      type: "scores",
      adapter: "worldcupapi-com",
      baseUrl: "https://api.worldcupapi.com",
      endpointPath: "/fixtures",
      apiKey: "",
      apiKeyPlacement: "query",
      apiKeyParamName: "key",
      apiKeyHeaderName: "",
      enabled: false,
      priority: 20,
      refreshSeconds: 60,
      cacheTtlSeconds: 60,
      timeoutMs: 6000,
      notes: "世界杯专用 API，支持 fixtures/livescores/events/standings 等。需要注册 API key。",
    },
    {
      id: "football-data-org",
      name: "football-data.org",
      type: "scores",
      adapter: "football-data-org",
      baseUrl: "https://api.football-data.org/v4",
      endpointPath: "/competitions/WC/matches",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "X-Auth-Token",
      enabled: false,
      priority: 10,
      refreshSeconds: 300,
      cacheTtlSeconds: 300,
      timeoutMs: 6000,
      notes: "通用足球 API 兜底。免费额度适合低频缓存，不建议前端高频直连。",
    },
    {
      id: "football-data-org-teams",
      name: "football-data.org · World Cup Teams",
      type: "team-content",
      adapter: "football-data-org",
      baseUrl: "https://api.football-data.org/v4",
      endpointPath: "/competitions/WC/teams",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "X-Auth-Token",
      enabled: false,
      priority: 10,
      refreshSeconds: 86400,
      cacheTtlSeconds: 86400,
      timeoutMs: 8000,
      notes: "2026 世界杯 48 队基础资料、队徽和主教练信息。",
    },
    {
      id: "the-odds-api-worldcup",
      name: "The Odds API · FIFA World Cup",
      type: "odds",
      adapter: "the-odds-api",
      baseUrl: "https://api.the-odds-api.com",
      endpointPath: "/v4/sports/soccer_fifa_world_cup/odds",
      apiKey: "",
      apiKeyPlacement: "query",
      apiKeyParamName: "apiKey",
      apiKeyHeaderName: "",
      enabled: false,
      priority: 10,
      refreshSeconds: 300,
      cacheTtlSeconds: 300,
      timeoutMs: 8000,
      notes: "真实欧赔源。读取欧洲区 h2h 市场，聚合多家 bookmaker 后计算去水隐含概率。",
    },
    {
      id: "thesportsdb-worldcup",
      name: "TheSportsDB · FIFA World Cup",
      type: "scores",
      adapter: "thesportsdb",
      baseUrl: "https://www.thesportsdb.com/api/v1/json",
      endpointPath: "/{apiKey}/eventsseason.php",
      apiKey: "",
      apiKeyPlacement: "path",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: false,
      priority: 30,
      refreshSeconds: 900,
      cacheTtlSeconds: 900,
      timeoutMs: 8000,
      notes: "世界杯 league id 4429，赛季 2026。免费 key 有条数和频率限制，仅作低优先级备份。",
    },
    {
      id: "thesportsdb-worldcup-teams",
      name: "TheSportsDB · World Cup Teams",
      type: "team-content",
      adapter: "thesportsdb",
      baseUrl: "https://www.thesportsdb.com/api/v1/json",
      endpointPath: "/{apiKey}/search_all_teams.php",
      apiKey: "",
      apiKeyPlacement: "path",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: false,
      priority: 20,
      refreshSeconds: 86400,
      cacheTtlSeconds: 86400,
      timeoutMs: 8000,
      notes: "世界杯球队图片和简介备份。免费 key 单次最多返回 10 队。",
    },
    {
      id: "openligadb-wm2026",
      name: "OpenLigaDB WM 2026",
      type: "scores",
      adapter: "openligadb",
      baseUrl: "https://api.openligadb.de",
      endpointPath: "/getmatchdata/wm2026",
      apiKey: "",
      apiKeyPlacement: "none",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: false,
      priority: 50,
      refreshSeconds: 300,
      cacheTtlSeconds: 300,
      timeoutMs: 5000,
      notes: "社区免费源，无认证。联赛 shortcut 可能需根据实际列表调整。",
    },
    {
      id: "zafronix-worldcup",
      name: "Zafronix World Cup API",
      type: "team-content",
      adapter: "zafronix",
      baseUrl: "https://api.zafronix.com",
      endpointPath: "",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "X-API-Key",
      enabled: false,
      priority: 60,
      refreshSeconds: 3600,
      cacheTtlSeconds: 3600,
      timeoutMs: 6000,
      notes: "候选历史、球员、场馆源。需要免费 key，具体路径按文档配置。",
    },
    {
      id: "balldontlie-fifa",
      name: "BALLDONTLIE FIFA API",
      type: "team-content",
      adapter: "balldontlie-fifa",
      baseUrl: "https://fifa.balldontlie.io",
      endpointPath: "",
      apiKey: "",
      apiKeyPlacement: "bearer",
      apiKeyParamName: "",
      apiKeyHeaderName: "Authorization",
      enabled: false,
      priority: 70,
      refreshSeconds: 3600,
      cacheTtlSeconds: 3600,
      timeoutMs: 6000,
      notes: "候选高级数据源：阵容、事件、统计、赔率等。需要免费账号 key。",
    },
    {
      id: "legal-highlights",
      name: "合法集锦链接",
      type: "highlights",
      adapter: "generic-json",
      baseUrl: "",
      endpointPath: "",
      apiKey: "",
      apiKeyPlacement: "none",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: false,
      priority: 80,
      refreshSeconds: 3600,
      cacheTtlSeconds: 3600,
      timeoutMs: 5000,
      notes: "央视频、FIFA+、B站等合法集锦入口。",
    },
    {
      id: "espn-soccer-rss",
      name: "ESPN Soccer RSS",
      type: "news",
      adapter: "rss-feed",
      baseUrl: "https://www.espn.com",
      endpointPath: "/espn/rss/soccer/news",
      apiKey: "",
      apiKeyPlacement: "none",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: true,
      priority: 5,
      refreshSeconds: 900,
      cacheTtlSeconds: 900,
      timeoutMs: 8000,
      notes: "ESPN 官方 Soccer Headlines RSS，作为足球新闻第一优先级；空响应时自动切换 BBC。",
    },
    {
      id: "bbc-sport-football-rss",
      name: "BBC Sport Football RSS",
      type: "news",
      adapter: "rss-feed",
      baseUrl: "https://feeds.bbci.co.uk",
      endpointPath: "/sport/football/rss.xml",
      apiKey: "",
      apiKeyPlacement: "none",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: true,
      priority: 10,
      refreshSeconds: 900,
      cacheTtlSeconds: 900,
      timeoutMs: 8000,
      notes: "免 key RSS 新闻源。作为 ESPN Soccer RSS 的第一替补。",
    },
    {
      id: "currents-worldcup-news",
      name: "Currents API · World Cup",
      type: "news",
      adapter: "currents-api",
      baseUrl: "https://api.currentsapi.services",
      endpointPath: "/v2/search",
      apiKey: "",
      apiKeyPlacement: "bearer",
      apiKeyParamName: "",
      apiKeyHeaderName: "Authorization",
      enabled: false,
      priority: 20,
      refreshSeconds: 900,
      cacheTtlSeconds: 900,
      timeoutMs: 20000,
      notes: "世界杯关键词体育新闻搜索。免费账户每日 1000 次请求，使用 V2 sport 分类。",
    },
    {
      id: "gdelt-worldcup-news",
      name: "GDELT World Cup News",
      type: "news",
      adapter: "gdelt-doc",
      baseUrl: "https://api.gdeltproject.org",
      endpointPath: "/api/v2/doc/doc",
      apiKey: "",
      apiKeyPlacement: "none",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: true,
      priority: 30,
      refreshSeconds: 900,
      cacheTtlSeconds: 900,
      timeoutMs: 12000,
      notes: "免 key 新闻搜索源。使用 GDELT DOC 2.x ArticleList JSON 拉取世界杯相关新闻原始条目。",
    },
    {
      id: "newsapi-worldcup",
      name: "NewsAPI World Cup",
      type: "news",
      adapter: "newsapi-org",
      baseUrl: "https://newsapi.org",
      endpointPath: "/v2/everything",
      apiKey: "",
      apiKeyPlacement: "query",
      apiKeyParamName: "apiKey",
      apiKeyHeaderName: "",
      enabled: false,
      priority: 40,
      refreshSeconds: 900,
      cacheTtlSeconds: 900,
      timeoutMs: 8000,
      notes: "可选新闻源，需要 NewsAPI key。适合补充英文媒体文章发现。",
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
      defaultModel: "deepseek-v4-flash",
      enabled: false,
      notes: "用于多源新闻去重、中文摘要和早报整理。V4 Flash 使用非思考模式降低后台延迟。",
    },
    {
      id: "xiaomi-mimo",
      name: "Xiaomi MiMo",
      provider: "xiaomi-mimo",
      baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
      apiKey: "",
      defaultModel: "mimo-v2.5-pro",
      enabled: false,
      notes: "小米 MiMo Token Plan 最新旗舰 Pro 模型，作为新闻整理备用 Provider。",
    },
    {
      id: "kimi-coding",
      name: "Kimi Coding",
      provider: "kimi-coding",
      baseUrl: "https://api.kimi.com/coding/v1",
      apiKey: "",
      defaultModel: "kimi-for-coding",
      enabled: false,
      notes: "Kimi Code 官方 OpenAI-compatible 地址。该服务仅允许已认证 Coding Agent，不适合网站后台内容生成。",
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

function inferAdapter(source: Partial<DataSourceConfig>): DataSourceAdapter {
  if (source.adapter) return source.adapter;
  if (source.id === "polymarket-gamma" || source.baseUrl?.includes("polymarket")) {
    return "polymarket-gamma";
  }
  if (source.id === "openfootball-worldcup-json" || source.baseUrl?.includes("raw.githubusercontent.com")) {
    return "openfootball-worldcup-json";
  }
  if (source.id === "football-data-org" || source.baseUrl?.includes("football-data.org")) {
    return "football-data-org";
  }
  if (source.id === "openligadb-wm2026" || source.baseUrl?.includes("openligadb")) {
    return "openligadb";
  }
  if (source.id === "the-odds-api-worldcup" || source.baseUrl?.includes("the-odds-api.com")) {
    return "the-odds-api";
  }
  if (source.id === "thesportsdb-worldcup" || source.baseUrl?.includes("thesportsdb.com")) {
    return "thesportsdb";
  }
  if (
    source.id === "espn-soccer-rss"
    || source.id === "bbc-sport-football-rss"
    || source.baseUrl?.includes("espn.com")
    || source.baseUrl?.includes("feeds.bbci.co.uk")
  ) {
    return "rss-feed";
  }
  if (source.id === "currents-worldcup-news" || source.baseUrl?.includes("currentsapi.services")) {
    return "currents-api";
  }
  if (source.id === "gdelt-worldcup-news" || source.baseUrl?.includes("gdeltproject")) {
    return "gdelt-doc";
  }
  if (source.id === "newsapi-worldcup" || source.baseUrl?.includes("newsapi.org")) {
    return "newsapi-org";
  }
  return "generic-json";
}

function defaultDataSourceFor(id: string): DataSourceConfig | undefined {
  return defaultAdminConfig.dataSources.find((source) => source.id === id);
}

function normalizeDataSource(source: Partial<DataSourceConfig>, index: number): DataSourceConfig {
  const id = String(source.id || `data-source-${index + 1}`);
  const defaults = defaultDataSourceFor(id);
  return {
    id,
    name: String(source.name || defaults?.name || "未命名数据源"),
    type: (source.type || defaults?.type || "custom") as DataSourceType,
    adapter: (source.adapter || defaults?.adapter || inferAdapter(source)) as DataSourceAdapter,
    baseUrl: String(source.baseUrl || defaults?.baseUrl || ""),
    endpointPath: String(source.endpointPath || defaults?.endpointPath || ""),
    apiKey: String(source.apiKey || ""),
    apiKeyPlacement: (source.apiKeyPlacement || defaults?.apiKeyPlacement || "none") as ApiKeyPlacement,
    apiKeyParamName: String(source.apiKeyParamName || defaults?.apiKeyParamName || ""),
    apiKeyHeaderName: String(source.apiKeyHeaderName || defaults?.apiKeyHeaderName || ""),
    enabled: source.enabled ?? defaults?.enabled ?? false,
    priority: Number.isFinite(Number(source.priority))
      ? Number(source.priority)
      : defaults?.priority ?? index + 1,
    refreshSeconds: normalizeRefreshSeconds(source.refreshSeconds || defaults?.refreshSeconds),
    cacheTtlSeconds: normalizeRefreshSeconds(
      source.cacheTtlSeconds || source.refreshSeconds || defaults?.cacheTtlSeconds || defaults?.refreshSeconds,
    ),
    timeoutMs: Number.isFinite(Number(source.timeoutMs))
      ? Number(source.timeoutMs)
      : defaults?.timeoutMs ?? 6000,
    notes: String(source.notes || defaults?.notes || ""),
  };
}

function mergeMissingDefaultSources(sources: DataSourceConfig[]): DataSourceConfig[] {
  const seen = new Set(sources.map((source) => source.id));
  const missingDefaults = defaultAdminConfig.dataSources.filter((source) => !seen.has(source.id));
  return [...sources, ...missingDefaults];
}

function mergeMissingDefaultProviders(providers: AiProviderConfig[]): AiProviderConfig[] {
  const seen = new Set(providers.map((provider) => provider.id));
  const missingDefaults = defaultAdminConfig.aiProviders.filter((provider) => !seen.has(provider.id));
  return [...providers, ...missingDefaults];
}

function normalizeConfig(input: Partial<AdminConfig>): AdminConfig {
  const dataSources = (input.dataSources || []).map(normalizeDataSource);
  const aiProviders = (input.aiProviders || []).map((provider, index) => ({
    id: String(provider.id || `ai-provider-${index + 1}`),
    name: String(provider.name || "未命名模型服务"),
    provider: (provider.provider || "custom") as AiProviderType,
    baseUrl: String(provider.baseUrl || ""),
    apiKey: String(provider.apiKey || ""),
    defaultModel: String(provider.defaultModel || ""),
    enabled: Boolean(provider.enabled),
    notes: String(provider.notes || ""),
  }));

  return {
    updatedAt: input.updatedAt || new Date().toISOString(),
    primaryAiProviderId: String(
      input.primaryAiProviderId || defaultAdminConfig.primaryAiProviderId,
    ),
    dataSources: mergeMissingDefaultSources(dataSources),
    aiProviders: mergeMissingDefaultProviders(aiProviders),
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
