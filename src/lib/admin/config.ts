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
  | "api-football"
  | "football-data-org"
  | "openligadb"
  | "the-odds-api"
  | "odds-api-io"
  | "thesportsdb"
  | "zafronix"
  | "balldontlie-fifa"
  | "rss-feed"
  | "espn-site-api"
  | "currents-api"
  | "gdelt-doc"
  | "newsapi-org"
  | "generic-json";

export type ApiKeyPlacement = "none" | "query" | "header" | "bearer" | "path";

export type AiProviderType =
  | "openai"
  | "gemini"
  | "deepseek"
  | "nvidia"
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
  apiKeyEnvName?: string;
  apiKeyConfigured?: boolean;
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
  apiKeyEnvName?: string;
  apiKeyConfigured?: boolean;
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
  primaryAiProviderId: "nvidia",
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
      priority: 90,
      refreshSeconds: 86400,
      cacheTtlSeconds: 86400,
      timeoutMs: 8000,
      notes: "免费、无 key，仅作为 API-Football 和官方赛程库不可用时的低优先级兜底。",
    },
    {
      id: "api-football-worldcup-fixtures",
      name: "API-Football Pro · World Cup Fixtures",
      type: "scores",
      adapter: "api-football",
      baseUrl: "https://v3.football.api-sports.io",
      endpointPath: "/fixtures",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "x-apisports-key",
      enabled: true,
      priority: 1,
      refreshSeconds: 60,
      cacheTtlSeconds: 60,
      timeoutMs: 10000,
      notes: "API-Football Pro 主比分源。按日期拉取世界杯 fixtures，并用 details 源批量补齐事件、阵容和统计。",
    },
    {
      id: "api-football-worldcup-details",
      name: "API-Football Pro · Fixture Details",
      type: "custom",
      adapter: "api-football",
      baseUrl: "https://v3.football.api-sports.io",
      endpointPath: "/fixtures",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "x-apisports-key",
      enabled: true,
      priority: 2,
      refreshSeconds: 60,
      cacheTtlSeconds: 60,
      timeoutMs: 10000,
      notes: "API-Football Pro 详情源。使用 fixtures ids 参数批量获取 events、lineups、statistics。",
    },
    {
      id: "api-football-worldcup-teams",
      name: "API-Football Pro · World Cup Teams",
      type: "team-content",
      adapter: "api-football",
      baseUrl: "https://v3.football.api-sports.io",
      endpointPath: "/teams",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "x-apisports-key",
      enabled: true,
      priority: 1,
      refreshSeconds: 86400,
      cacheTtlSeconds: 86400,
      timeoutMs: 10000,
      notes: "API-Football Pro 球队源。获取世界杯参赛队 logo、国家和基础资料。",
    },
    {
      id: "api-football-worldcup-standings",
      name: "API-Football Pro · World Cup Standings",
      type: "team-content",
      adapter: "api-football",
      baseUrl: "https://v3.football.api-sports.io",
      endpointPath: "/standings",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "x-apisports-key",
      enabled: true,
      priority: 2,
      refreshSeconds: 300,
      cacheTtlSeconds: 300,
      timeoutMs: 10000,
      notes: "API-Football Pro 积分榜源。按 league=1、season=2026 获取小组排名、胜平负、进失球和 form。",
    },
    {
      id: "api-football-worldcup-squads",
      name: "API-Football Pro · World Cup Squads",
      type: "team-content",
      adapter: "api-football",
      baseUrl: "https://v3.football.api-sports.io",
      endpointPath: "/players/squads",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "x-apisports-key",
      enabled: true,
      priority: 3,
      refreshSeconds: 86400,
      cacheTtlSeconds: 86400,
      timeoutMs: 10000,
      notes: "API-Football Pro 名单源。按 team id 获取球员号码、位置和头像。",
    },
    {
      id: "api-football-worldcup-injuries",
      name: "API-Football Pro · World Cup Injuries",
      type: "team-content",
      adapter: "api-football",
      baseUrl: "https://v3.football.api-sports.io",
      endpointPath: "/injuries",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "x-apisports-key",
      enabled: true,
      priority: 4,
      refreshSeconds: 1800,
      cacheTtlSeconds: 1800,
      timeoutMs: 10000,
      notes: "API-Football Pro 伤停源。按世界杯联赛和赛季同步球员伤停、原因和关联 fixture。",
    },
    {
      id: "api-football-worldcup-odds",
      name: "API-Football Pro · Pre-match Odds",
      type: "odds",
      adapter: "api-football",
      baseUrl: "https://v3.football.api-sports.io",
      endpointPath: "/odds",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "x-apisports-key",
      enabled: true,
      priority: 1,
      refreshSeconds: 300,
      cacheTtlSeconds: 300,
      timeoutMs: 10000,
      notes: "API-Football Pro 赛前赔率源。聚合 1X2 Match Winner 市场并计算去水隐含概率。",
    },
    {
      id: "api-football-worldcup-live-odds",
      name: "API-Football Pro · Live Odds",
      type: "odds",
      adapter: "api-football",
      baseUrl: "https://v3.football.api-sports.io",
      endpointPath: "/odds/live",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "x-apisports-key",
      enabled: true,
      priority: 2,
      refreshSeconds: 60,
      cacheTtlSeconds: 60,
      timeoutMs: 10000,
      notes: "API-Football Pro 实时赔率源。赛中优先使用 live odds；无可用 1X2 市场时回落到赛前赔率快照。",
    },
    {
      id: "api-football-worldcup-predictions",
      name: "API-Football Pro · Predictions",
      type: "custom",
      adapter: "api-football",
      baseUrl: "https://v3.football.api-sports.io",
      endpointPath: "/predictions",
      apiKey: "",
      apiKeyPlacement: "header",
      apiKeyParamName: "",
      apiKeyHeaderName: "x-apisports-key",
      enabled: true,
      priority: 1,
      refreshSeconds: 900,
      cacheTtlSeconds: 900,
      timeoutMs: 10000,
      notes: "API-Football Pro 预测源。按 fixture 获取胜平负概率、建议和预测胜方，用于比赛页预测补充；盘口页仍使用 Polymarket。",
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
      priority: 1,
      refreshSeconds: 60,
      cacheTtlSeconds: 60,
      timeoutMs: 6000,
      notes: "公开预测市场数据，不接交易能力。作为盘口页第一数据源。",
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
      id: "odds-api-io-worldcup",
      name: "Odds-API.io · FIFA World Cup",
      type: "odds",
      adapter: "odds-api-io",
      baseUrl: "https://api.odds-api.io/v3",
      endpointPath: "/events",
      apiKey: "",
      apiKeyPlacement: "query",
      apiKeyParamName: "apiKey",
      apiKeyHeaderName: "",
      enabled: true,
      priority: 90,
      refreshSeconds: 900,
      cacheTtlSeconds: 900,
      timeoutMs: 10000,
      notes: "工具页赔率兜底源。免费级别使用 Polymarket/Kalshi 的标准化 ML 欧赔；盘口页仍只使用 Polymarket Gamma。",
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
      name: "ESPN FIFA World Cup News",
      type: "news",
      adapter: "espn-site-api",
      baseUrl: "https://site.api.espn.com",
      endpointPath: "/apis/site/v2/sports/soccer/fifa.world/news",
      apiKey: "",
      apiKeyPlacement: "none",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: true,
      priority: 5,
      refreshSeconds: 900,
      cacheTtlSeconds: 900,
      timeoutMs: 8000,
      notes: "ESPN Site API 的 FIFA World Cup News JSON。旧 RSS 地址会触发 CloudFront WAF challenge，已切换为 JSON 端点。",
    },
    {
      id: "chinanews-sports-rss",
      name: "中新网体育 RSS",
      type: "news",
      adapter: "rss-feed",
      baseUrl: "https://www.chinanews.com.cn",
      endpointPath: "/rss/sports.xml",
      apiKey: "",
      apiKeyPlacement: "none",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: true,
      priority: 6,
      refreshSeconds: 900,
      cacheTtlSeconds: 900,
      timeoutMs: 8000,
      notes: "免 key 中文体育 RSS。当前会用世界杯、足球、美加墨等中文关键词过滤后进入新闻聚合。",
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
      id: "people-sports-rss",
      name: "人民网体育 RSS",
      type: "news",
      adapter: "rss-feed",
      baseUrl: "http://www.people.com.cn",
      endpointPath: "/rss/sports.xml",
      apiKey: "",
      apiKeyPlacement: "none",
      apiKeyParamName: "",
      apiKeyHeaderName: "",
      enabled: false,
      priority: 18,
      refreshSeconds: 3600,
      cacheTtlSeconds: 3600,
      timeoutMs: 8000,
      notes: "免 key 中文体育 RSS 候补源。近期更新频率偏低，默认关闭，可在管理面板按需启用。",
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
      id: "nvidia",
      name: "NVIDIA NIM",
      provider: "nvidia",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: "",
      apiKeyEnvName: "NVIDIA_API_KEY",
      defaultModel: "deepseek-ai/deepseek-v4-pro",
      enabled: true,
      notes: "NVIDIA NIM OpenAI-compatible endpoint，默认使用 deepseek-ai/deepseek-v4-pro，并关闭 thinking。",
    },
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
      enabled: true,
      notes: "NVIDIA NIM 不可用时的备用新闻整理 Provider。V4 Flash 使用非思考模式降低后台延迟。",
    },
    {
      id: "xiaomi-mimo",
      name: "Xiaomi MiMo",
      provider: "xiaomi-mimo",
      baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
      apiKey: "",
      defaultModel: "mimo-v2.5-pro",
      enabled: true,
      notes: "小米 MiMo Token Plan 最新旗舰 Pro 模型，可作为新闻整理备用 Provider。",
    },
    {
      id: "kimi-coding",
      name: "Kimi Coding",
      provider: "kimi-coding",
      baseUrl: "https://api.kimi.com/coding/v1/messages",
      apiKey: "",
      defaultModel: "kimi-for-coding",
      enabled: false,
      notes: "Kimi Code Coding Plan Anthropic Messages endpoint。请求保持 Claude CLI User-Agent。",
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
  if (source.id?.startsWith("api-football-") || source.baseUrl?.includes("football.api-sports.io")) {
    return "api-football";
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
  if (source.id === "odds-api-io-worldcup" || source.baseUrl?.includes("odds-api.io")) {
    return "odds-api-io";
  }
  if (source.id === "thesportsdb-worldcup" || source.baseUrl?.includes("thesportsdb.com")) {
    return "thesportsdb";
  }
  if (
    source.id === "bbc-sport-football-rss"
    || source.id === "chinanews-sports-rss"
    || source.id === "people-sports-rss"
    || source.baseUrl?.includes("feeds.bbci.co.uk")
    || source.baseUrl?.includes("chinanews.com")
    || source.baseUrl?.includes("people.com.cn")
  ) {
    return "rss-feed";
  }
  if (source.id === "espn-soccer-rss" || source.baseUrl?.includes("site.api.espn.com")) {
    return "espn-site-api";
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

function envNameFromId(prefix: string, id: string): string {
  const suffix = id
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return `${prefix}_${suffix}_API_KEY`;
}

function defaultDataSourceApiKeyEnvName(id: string, placement: ApiKeyPlacement): string {
  return placement === "none" ? "" : envNameFromId("DATA_SOURCE", id);
}

function defaultAiProviderApiKeyEnvName(id: string): string {
  if (id === "nvidia") return "NVIDIA_API_KEY";
  return envNameFromId("AI_PROVIDER", id);
}

function resolveApiKey(envName: string | undefined, legacyApiKey: string): string {
  if (envName) {
    const envValue = process.env[envName];
    if (typeof envValue === "string" && envValue.length > 0) return envValue;
  }
  return legacyApiKey;
}

function resolveDataSourceApiKey(id: string, envName: string | undefined, legacyApiKey: string): string {
  const direct = resolveApiKey(envName, legacyApiKey);
  if (direct) return direct;
  if (id === "odds-api-io-worldcup") {
    for (const fallbackEnvName of [
      "DATA_SOURCE_ODDS_API_IO_WORLDCUP_API_KEY",
      "DATA_SOURCE_ODDS_API_IO_API_KEY",
      "ODDS_API_IO_API_KEY",
    ]) {
      const value = process.env[fallbackEnvName];
      if (typeof value === "string" && value.length > 0) return value;
    }
    return "";
  }
  if (!id.startsWith("api-football-")) return "";
  for (const fallbackEnvName of [
    "DATA_SOURCE_API_FOOTBALL_API_KEY",
    "DATA_SOURCE_API_FOOTBALL_WORLDCUP_FIXTURES_API_KEY",
    "DATA_SOURCE_API_FOOTBALL_WORLDCUP_DETAILS_API_KEY",
    "DATA_SOURCE_API_FOOTBALL_WORLDCUP_TEAMS_API_KEY",
    "API_FOOTBALL_API_KEY",
    "APIFOOTBALL_API_KEY",
    "APISPORTS_API_KEY",
  ]) {
    const value = process.env[fallbackEnvName];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

function normalizeDataSource(source: Partial<DataSourceConfig>, index: number, resolveSecrets: boolean): DataSourceConfig {
  const id = String(source.id || `data-source-${index + 1}`);
  const defaults = defaultDataSourceFor(id);
  const migratedSource = id === "espn-soccer-rss" && source.adapter === "rss-feed"
    ? {
        ...source,
        adapter: defaults?.adapter,
        baseUrl: defaults?.baseUrl,
        endpointPath: defaults?.endpointPath,
        name: defaults?.name,
        notes: defaults?.notes,
      }
    : source;
  const apiKeyPlacement = (source.apiKeyPlacement || defaults?.apiKeyPlacement || "none") as ApiKeyPlacement;
  const apiKeyEnvName = String(
    source.apiKeyEnvName
    || defaults?.apiKeyEnvName
    || defaultDataSourceApiKeyEnvName(id, apiKeyPlacement),
  );
  const legacyApiKey = String(source.apiKey || "");
  const resolvedApiKey = resolveSecrets ? resolveDataSourceApiKey(id, apiKeyEnvName, legacyApiKey) : "";
  const configuredApiKey = resolveDataSourceApiKey(id, apiKeyEnvName, legacyApiKey);
  return {
    id,
    name: String(migratedSource.name || defaults?.name || "未命名数据源"),
    type: (migratedSource.type || defaults?.type || "custom") as DataSourceType,
    adapter: (migratedSource.adapter || defaults?.adapter || inferAdapter(migratedSource)) as DataSourceAdapter,
    baseUrl: String(migratedSource.baseUrl || defaults?.baseUrl || ""),
    endpointPath: String(migratedSource.endpointPath || defaults?.endpointPath || ""),
    apiKey: resolvedApiKey,
    apiKeyEnvName,
    apiKeyConfigured: Boolean(configuredApiKey),
    apiKeyPlacement,
    apiKeyParamName: String(source.apiKeyParamName || defaults?.apiKeyParamName || ""),
    apiKeyHeaderName: String(source.apiKeyHeaderName || defaults?.apiKeyHeaderName || ""),
    enabled: migratedSource.enabled ?? defaults?.enabled ?? false,
    priority: Number.isFinite(Number(migratedSource.priority))
      ? Number(migratedSource.priority)
      : defaults?.priority ?? index + 1,
    refreshSeconds: normalizeRefreshSeconds(migratedSource.refreshSeconds || defaults?.refreshSeconds),
    cacheTtlSeconds: normalizeRefreshSeconds(
      migratedSource.cacheTtlSeconds || migratedSource.refreshSeconds || defaults?.cacheTtlSeconds || defaults?.refreshSeconds,
    ),
    timeoutMs: Number.isFinite(Number(migratedSource.timeoutMs))
      ? Number(migratedSource.timeoutMs)
      : defaults?.timeoutMs ?? 6000,
    notes: String(migratedSource.notes || defaults?.notes || ""),
  };
}

function mergeMissingDefaultSources(sources: DataSourceConfig[], resolveSecrets: boolean): DataSourceConfig[] {
  const seen = new Set(sources.map((source) => source.id));
  const missingDefaults = defaultAdminConfig.dataSources
    .filter((source) => !seen.has(source.id))
    .map((source, index) => normalizeDataSource(source, sources.length + index, resolveSecrets));
  return [...sources, ...missingDefaults];
}

const apiFootballAuthoritySourceIds = new Set([
  "api-football-worldcup-fixtures",
  "api-football-worldcup-details",
  "api-football-worldcup-teams",
  "api-football-worldcup-standings",
  "api-football-worldcup-squads",
  "api-football-worldcup-injuries",
  "api-football-worldcup-odds",
  "api-football-worldcup-live-odds",
  "api-football-worldcup-predictions",
]);

const supersededFreeSourceIds = new Set([
  "football-data-org",
  "football-data-org-teams",
  "the-odds-api-worldcup",
  "thesportsdb-worldcup",
  "thesportsdb-worldcup-teams",
]);

function applyApiFootballAuthorityPolicy(sources: DataSourceConfig[]): DataSourceConfig[] {
  return sources.map((source) => {
    const defaults = defaultDataSourceFor(source.id);
    if (apiFootballAuthoritySourceIds.has(source.id) && defaults) {
      return {
        ...source,
        name: defaults.name,
        type: defaults.type,
        adapter: defaults.adapter,
        baseUrl: defaults.baseUrl,
        endpointPath: defaults.endpointPath,
        apiKeyPlacement: defaults.apiKeyPlacement,
        apiKeyParamName: defaults.apiKeyParamName,
        apiKeyHeaderName: defaults.apiKeyHeaderName,
        enabled: true,
        priority: defaults.priority,
        refreshSeconds: defaults.refreshSeconds,
        cacheTtlSeconds: defaults.cacheTtlSeconds,
        timeoutMs: defaults.timeoutMs,
        notes: defaults.notes,
      };
    }
    if (supersededFreeSourceIds.has(source.id)) {
      return {
        ...source,
        enabled: false,
        priority: Math.max(source.priority, 80),
        notes: `${source.notes} 已被 API-Football Pro 权威源替代，仅保留为手动恢复时的备援配置。`,
      };
    }
    if (source.id === "polymarket-gamma") {
      return {
        ...source,
        enabled: true,
        priority: 1,
        notes: "公开预测市场数据，不接交易能力。作为盘口页第一数据源。",
      };
    }
    if (source.id === "openfootball-worldcup-json") {
      return {
        ...source,
        priority: Math.max(source.priority, 90),
        notes: "免费、无 key，仅作为 API-Football 和官方赛程库不可用时的低优先级兜底。",
      };
    }
    return source;
  });
}

function mergeMissingDefaultProviders(providers: AiProviderConfig[], resolveSecrets: boolean): AiProviderConfig[] {
  const seen = new Set(providers.map((provider) => provider.id));
  const missingDefaults = defaultAdminConfig.aiProviders
    .filter((provider) => !seen.has(provider.id))
    .map((provider, index) => normalizeAiProvider(provider, providers.length + index, resolveSecrets));
  return [...providers, ...missingDefaults];
}

function normalizeAiProvider(provider: Partial<AiProviderConfig>, index: number, resolveSecrets: boolean): AiProviderConfig {
  const id = String(provider.id || `ai-provider-${index + 1}`);
  const apiKeyEnvName = String(provider.apiKeyEnvName || defaultAiProviderApiKeyEnvName(id));
  const legacyApiKey = String(provider.apiKey || "");
  return {
    id,
    name: String(provider.name || "未命名模型服务"),
    provider: (provider.provider || "custom") as AiProviderType,
    baseUrl: String(provider.baseUrl || ""),
    apiKey: resolveSecrets ? resolveApiKey(apiKeyEnvName, legacyApiKey) : "",
    apiKeyEnvName,
    apiKeyConfigured: Boolean(resolveApiKey(apiKeyEnvName, legacyApiKey)),
    defaultModel: String(provider.defaultModel || ""),
    enabled: Boolean(provider.enabled),
    notes: String(provider.notes || ""),
  };
}

function normalizeConfig(input: Partial<AdminConfig>, options: { resolveSecrets: boolean }): AdminConfig {
  const dataSources = (input.dataSources || []).map((source, index) =>
    normalizeDataSource(source, index, options.resolveSecrets),
  );
  const aiProviders = (input.aiProviders || []).map((provider, index) =>
    normalizeAiProvider(provider, index, options.resolveSecrets),
  );

  return {
    updatedAt: input.updatedAt || new Date().toISOString(),
    primaryAiProviderId: String(
      input.primaryAiProviderId || defaultAdminConfig.primaryAiProviderId,
    ),
    dataSources: applyApiFootballAuthorityPolicy(
      mergeMissingDefaultSources(dataSources, options.resolveSecrets),
    ),
    aiProviders: mergeMissingDefaultProviders(aiProviders, options.resolveSecrets),
  };
}

function withoutSecrets(config: AdminConfig): AdminConfig {
  return {
    ...config,
    dataSources: config.dataSources.map((source) => ({
      ...source,
      apiKey: "",
    })),
    aiProviders: config.aiProviders.map((provider) => ({
      ...provider,
      apiKey: "",
    })),
  };
}

export function sanitizeAdminConfigForClient(config: AdminConfig): AdminConfig {
  return withoutSecrets(config);
}

export async function readAdminConfig(options: { resolveSecrets?: boolean } = {}): Promise<AdminConfig> {
  const resolveSecrets = options.resolveSecrets ?? true;
  try {
    const raw = await readFile(configPath, "utf8");
    return normalizeConfig(JSON.parse(raw), { resolveSecrets });
  } catch {
    return normalizeConfig(defaultAdminConfig, { resolveSecrets });
  }
}

export async function writeAdminConfig(config: AdminConfig): Promise<AdminConfig> {
  const nextConfig = normalizeConfig({
    ...config,
    updatedAt: new Date().toISOString(),
  }, { resolveSecrets: false });
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(withoutSecrets(nextConfig), null, 2)}\n`, "utf8");
  return readAdminConfig();
}
