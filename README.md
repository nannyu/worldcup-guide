# 世界杯装杯指南

面向普通观众的 2026 世界杯移动端 H5 工具。目标不是做硬核数据站，而是让用户快速看懂赛程、补完赛果、认识球队，并用大白话理解 Polymarket 概率和赔率隐含概率。

## 核心功能

- 今日赛程：北京时间赛程、比分、预测市场概率、赔率隐含概率和比赛详情。
- 早报复盘：睡醒后快速补完昨晚赛果、名场面和聊天金句。
- 球队速成：球队、主帅、阵型、核心球员和饭局话术。
- 天眼雷达：对比 Polymarket 市场概率和赔率隐含概率的信息差。
- 工具箱：赔率转概率、回报期望计算和术语大白话。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion
- Bun / npm scripts
- PostgreSQL + Drizzle ORM

## 开发

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 数据库

配置 `DATABASE_URL` 后执行：

```bash
npm run db:migrate
npm run db:seed:fifa
npm run data:init
```

外部 API 原始响应和页面规范化快照都会持久化到 PostgreSQL。缓存过期才会再次请求供应商；供应商异常时会读取过期快照、数据库官方赛程或仓库内 FIFA JSON。

页面 API 默认走 `cache-only`，只读取 `data_snapshots`、种子赛程和本地 FIFA 兜底，并返回 `Cache-Control: s-maxage + stale-while-revalidate`。主动更新使用 `?refresh=1` 或 cron 接口入队后台任务，不在 Vercel 请求内抓取外部 API、翻译或调用 AI。Railway worker 使用 `bun run worker` 消费 `background_jobs`，再写回 PostgreSQL。开发环境未配置 PostgreSQL 时可降级到 `data/runtime-cache.json`；生产环境必须配置数据库，不使用运行时文件缓存。

当前已实现 football-data.org、The Odds API、TheSportsDB、WorldCupAPI、ESPN RSS、BBC RSS、Currents API、GDELT、NewsAPI 和 Polymarket 适配器。数据源与 AI Provider 的管理员配置只保存密钥环境变量名，真实密钥统一放在 `.env`。

新闻不会在第一个成功源处停止：所有启用新闻源会并行抓取，后台先按 URL 和标题相似度去重，再由已配置的 AI Provider 做事件合并、中文摘要和要点整理。未配置模型 Key 时只执行规则去重，不生成模拟摘要。

当前新闻整理主模型使用 Xiaomi MiMo `mimo-v2.5-pro`，DeepSeek `deepseek-v4-flash` 非思考模式作为备用。

管理员面板支持选择主 AI Provider。当前配置为 Xiaomi MiMo 主模型、DeepSeek 备用；主模型失败时会自动尝试其他已启用 Provider。

Kimi Code 会员接口仅面向受支持的 Coding Agent。网站后台若使用 Kimi 生成新闻摘要，应配置 Kimi 开放平台 `https://api.moonshot.cn/v1` 的 API Key。

数据库表和读取策略见 [docs/database.md](docs/database.md)。

数据抓取调度见 [docs/data-sources.md](docs/data-sources.md)。本地初始化可先启动站点，再运行：

```bash
npm run data:init
npm run tools:audit
```

## 部署

- Supabase：提供 PostgreSQL。Vercel 使用池化 `DATABASE_URL`，迁移脚本可使用 `DATABASE_DIRECT_URL`。
- Vercel：部署 Next.js 前端和只读 API。配置 `DATABASE_URL`、`DATABASE_SSL=require`、`DATABASE_PREPARE=false`、`CRON_SECRET`、管理员密钥、数据源 Key 和 AI Provider Key。
- Railway：部署后台 worker，同一套环境变量，启动命令为 `bun run worker`。worker 负责数据抓取、免费翻译、AI 评论、快照刷新和全文抓取入库。
- 首次上线顺序：`bun run db:migrate`、`bun run db:seed:fifa`、`bun run data:init`，然后启动 Vercel 和 Railway worker。

## 检查

```bash
npm run lint
npm run build
```

## 管理员控制面板

访问 [http://localhost:3000/admin](http://localhost:3000/admin) 配置：

- 赛事数据源：赛程、比分、预测市场、赔率、集锦、球队内容。
- AI 大模型：OpenAI、Gemini、DeepSeek、Xiaomi MiMo、Kimi Coding、BigModel/智谱、自定义 Provider，并可指定主 Provider。

本地开发环境如果未设置 `ADMIN_PASSWORD`，默认密码为 `admin123`。生产环境必须设置：

```bash
ADMIN_PASSWORD=replace_with_a_strong_admin_password
ADMIN_SESSION_SECRET=replace_with_a_long_random_session_secret
```

管理员保存的配置写入 `data/admin-config.json`。该文件只保存数据源、Provider 和 API Key 环境变量名；真实密钥统一放在 `.env` 中，不写入配置 JSON。

数据源冗余策略和字段说明见 [docs/data-sources.md](docs/data-sources.md)。

## 项目结构

```text
src/app/                 路由入口
src/components/layout/   底部导航和桌面侧栏
src/components/screens/  主要页面屏幕
src/lib/wc-data.ts       FIFA 本地兜底和展示数据
src/lib/db/              Drizzle schema、迁移、查询和 seed
src/lib/data-sources/    数据源适配、缓存和聚合
src/lib/admin/           管理员认证和配置存储
```

## 数据说明

赛程兜底来自 FIFA 官方 PDF 抽取的 104 场赛程。球队、比分、市场对比和内容模块不使用演示数据；数据源未返回有效记录时页面显示为空。

## 合规边界

本项目只做观赛辅助和概率解释，不提供下注入口，不跳转博彩平台，不承诺收益。所有市场数据都应显示来源和更新时间。
