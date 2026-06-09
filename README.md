# 世界杯装杯指南

面向普通观众的 2026 世界杯移动端 H5 工具。目标不是做硬核数据站，而是让用户快速看懂赛程、补完赛果、认识球队，并用大白话理解 Polymarket 概率和赔率隐含概率。

## 核心功能

- 今日赛程：北京时间赛程、比分、市场信号和比赛详情。
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
- Bun

## 开发

```bash
bun install
bun dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 检查

```bash
bun run lint
bun run build
```

## 项目结构

```text
src/app/                 路由入口
src/components/layout/   底部导航和桌面侧栏
src/components/screens/  主要页面屏幕
src/lib/wc-data.ts       当前 mock 数据层
```

## 数据说明

当前 `src/lib/wc-data.ts` 使用演示数据，后续可替换为：

- FIFA 官方赛程或结构化赛程源
- 实时比分数据源
- Polymarket Gamma API
- 本地球队/术语内容库

## 合规边界

本项目只做观赛辅助和概率解释，不提供下注入口，不跳转博彩平台，不承诺收益。所有市场数据都应显示来源和更新时间。
