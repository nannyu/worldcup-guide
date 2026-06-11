# 世界杯装杯指南

面向普通观众的 2026 世界杯移动端 H5 工具。产品重点不是硬核数据站，而是让用户快速看懂赛程、补完赛果、认识球队，并用大白话理解预测市场概率和赔率隐含概率。

## 当前进度

- 已落地 Next.js 16 App Router 移动端应用，包含首页赛程、早报、球队、天眼雷达、工具箱、比赛详情、新闻详情和管理员面板。
- 已接入 PostgreSQL + Drizzle ORM，支持 FIFA 官方赛程 seed、外部原始响应缓存、规范化页面快照、数据源使用记录和后台任务队列。
- 页面 API 默认走 `cache-only`，读取 `data_snapshots`、数据库官方赛程和本地 FIFA JSON 兜底；主动刷新通过 cron、`data:refresh` 或 `?refresh=1` 触发。
- 已实现 Railway/Bun worker，负责慢任务：数据抓取、新闻翻译、AI 新闻整理、球队毒舌和球员毒舌快照生成。
- 已支持管理员配置数据源和 AI Provider。配置文件只保存 API Key 的环境变量名，真实密钥统一放在 `.env`。
- 已支持中英文 UI、主题切换、Eazo 登录用户资料同步、通知测试/定时通知和只读 MCP 工具入口。

## 核心功能

- 今日赛程：北京时间赛程、比分、赛程/积分榜切换、预测市场概率、赔率隐含概率和比赛详情入口。
- 早报复盘：聚合比赛、新闻、吃瓜话题、中文摘要、要点和可复制聊天素材。
- 球队速成：48 队资料、主帅、阵型、核心球员、阵容、球队毒舌和球员毒舌。
- 天眼雷达：对比 Polymarket 市场概率和 The Odds API 赔率隐含概率的信息差。
- 工具箱：赔率转概率、回报期望计算、术语大白话和赔率数据查看。
- 管理员面板：配置数据源、优先级、TTL、AI Provider、主模型和密钥环境变量名。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion
- Bun
- PostgreSQL + Drizzle ORM
- i18next / react-i18next
- next-themes
- Eazo SDK

## 开发

```bash
bun install
bun run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

常用检查：

```bash
bun run lint
bun run build
```

## 数据库和数据初始化

配置 `DATABASE_URL` 后执行：

```bash
bun run db:migrate
bun run db:seed:fifa
bun run data:init
```

`db:seed:fifa` 会写入 2026 世界杯 competition、teams、venues 和 104 场官方赛程。`data:init` 会预热球队、赔率、雷达、昨日/今日/明日赛程、昨日/今日早报、最近三天新闻窗口、球队毒舌和球员毒舌快照。

开发环境未配置 PostgreSQL 时，缓存层可降级到 `data/runtime-cache.json`。生产环境必须配置数据库，不使用运行时文件缓存。

数据库表和读取策略见 [docs/database.md](docs/database.md)。

## 数据源与 AI

当前已实现的数据源适配器包括：

- 赛程/比分：OpenFootball World Cup JSON、football-data.org、WorldCupAPI.com、TheSportsDB、OpenLigaDB。
- 预测市场：Polymarket Gamma API。
- 赔率：The Odds API。
- 球队内容：football-data.org Teams、TheSportsDB、Zafronix、balldontlie FIFA。
- 新闻：ESPN Site API、ChinaNews RSS、BBC RSS、People Sports RSS、Currents API、GDELT、NewsAPI。
- 集锦/自定义：generic-json。

新闻不会在第一个成功源处停止：所有启用新闻源会并行抓取，后台按 URL 和标题相似度去重，再由已配置的 AI Provider 做事件合并、中文摘要和要点整理。未配置模型 Key 时只执行规则去重，不生成模拟摘要。

AI Provider 支持 OpenAI、Gemini、DeepSeek、Xiaomi MiMo、Kimi Coding、BigModel/智谱和自定义 OpenAI-compatible Provider。当前默认主模型配置为 Xiaomi MiMo `mimo-v2.5-pro`，DeepSeek `deepseek-v4-flash` 可作为备用。Kimi Code 会员接口仅面向受支持的 Coding Agent；网站后台若使用 Kimi，应配置 Moonshot/Kimi 开放平台 `https://api.moonshot.cn/v1`。

数据抓取、缓存、刷新和 API 说明见 [docs/data-sources.md](docs/data-sources.md)。

## 后台任务

本地同步刷新：

```bash
bun run data:refresh
bun run data:init
```

长期后台 worker：

```bash
bun run worker
```

`/api/data/cron/refresh` 使用 `CRON_SECRET` Bearer 认证。Vercel Cron 默认每 15 分钟调用该路由；Vercel cron 请求会同步执行刷新，普通手动请求会入队 `background_jobs` 并返回 202。Railway worker 使用 `bun run worker` 消费任务。

## 部署

- Supabase：提供 PostgreSQL。Vercel 使用池化 `DATABASE_URL`，迁移可使用 `DATABASE_DIRECT_URL`。
- Vercel：部署 Next.js 前端、只读页面 API、管理员 API、cron 入口和通知入口。
- Railway：部署后台 worker，同一套环境变量，启动命令为 `bun run worker`。
- 首次上线顺序：`bun run db:migrate`、`bun run db:seed:fifa`、`bun run data:init`，然后启动 Vercel 和 Railway worker。

生产环境必须设置：

```bash
DATABASE_URL=...
DATABASE_SSL=require
DATABASE_PREPARE=false
CRON_SECRET=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
```

按需设置数据源和 AI Provider 的 API Key 环境变量。

## 管理员控制面板

访问 [http://localhost:3000/admin](http://localhost:3000/admin) 配置：

- 赛事数据源：赛程、比分、预测市场、赔率、集锦、新闻、球队内容。
- AI 大模型：OpenAI、Gemini、DeepSeek、Xiaomi MiMo、Kimi Coding、BigModel/智谱、自定义 Provider，并可指定主 Provider。

本地开发环境如果未设置 `ADMIN_PASSWORD`，默认密码为 `admin123`。管理员保存的配置写入 `data/admin-config.json`，该文件只保存数据源、Provider 和 API Key 环境变量名。

## 项目结构

```text
src/app/                 页面和 API 路由
src/components/layout/   底部导航、桌面侧栏、语言和主题控制
src/components/screens/  主要页面屏幕
src/data/                FIFA 官方赛程和球队资料快照
src/lib/wc-data.ts       展示 DTO、FIFA 兜底和兼容导出
src/lib/db/              Drizzle schema、迁移、查询和 seed
src/lib/data-sources/    数据源适配、缓存、聚合和刷新策略
src/lib/ai/              新闻整理、球队毒舌和球员毒舌
src/lib/admin/           管理员认证和配置存储
src/lib/background/      后台任务入队和 worker 执行逻辑
```

## 数据说明

赛程兜底来自 FIFA 官方 PDF 抽取的 104 场赛程。球队、比分、市场对比和内容模块不使用演示数据；数据源未返回有效记录时页面显示为空或使用已生成快照。

## 合规边界

本项目只做观赛辅助和概率解释，不提供下注入口，不跳转博彩平台，不承诺收益。所有市场数据都应显示来源和更新时间。
