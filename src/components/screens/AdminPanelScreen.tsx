"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type {
  AdminConfig,
  ApiKeyPlacement,
  AiProviderConfig,
  AiProviderType,
  DataSourceAdapter,
  DataSourceConfig,
  DataSourceType,
} from "@/lib/admin/config";

type SessionState = {
  authenticated: boolean;
  configured: boolean;
  usingDevPassword: boolean;
};

type SourceHealthStatus = {
  id: string;
  health?: "healthy" | "stale" | "failing" | "disabled" | "unknown";
  lastRefreshAt?: string;
  lastFetchAt?: string;
  lastRunAt?: string;
  lastRunStatus?: string;
  lastStatusCode?: number;
  lastFailureReason?: string;
  nextRefreshAt?: string;
  effectiveRefreshSeconds?: number;
  activityMode?: string;
};

type AnalyticsReport = {
  generatedAt: string;
  range: {
    from: string;
    to: string;
    days: number;
  };
  storage: "database" | "disabled" | "unavailable";
  totals: {
    events: number;
    pageViews: number;
    clicks: number;
    sessions: number;
    uniqueVisitors: number;
    uniqueIps: number;
    averageDurationSeconds: number;
    totalDurationSeconds: number;
  };
  trends: Array<{
    bucket: string;
    pageViews: number;
    clicks: number;
    uniqueVisitors: number;
    averageDurationSeconds: number;
  }>;
  features: Array<{
    feature: string;
    pageViews: number;
    clicks: number;
    uniqueVisitors: number;
    averageDurationSeconds: number;
    totalDurationSeconds: number;
  }>;
  pages: Array<{
    path: string;
    feature: string;
    pageViews: number;
    clicks: number;
    uniqueVisitors: number;
    averageDurationSeconds: number;
    totalDurationSeconds: number;
  }>;
  clicks: Array<{
    targetLabel: string;
    targetType: string;
    path: string;
    feature: string;
    targetHref?: string | null;
    clicks: number;
    uniqueVisitors: number;
  }>;
  ips: Array<{
    ipAddress: string;
    pageViews: number;
    clicks: number;
    sessions: number;
    uniqueVisitors: number;
    lastSeenAt: string;
  }>;
  recentEvents: Array<{
    eventType: string;
    feature: string;
    path: string;
    targetLabel?: string | null;
    targetType?: string | null;
    ipAddress?: string | null;
    durationSeconds?: number | null;
    occurredAt: string;
  }>;
};

const dataSourceTypes: DataSourceType[] = [
  "schedule",
  "scores",
  "prediction-market",
  "odds",
  "highlights",
  "news",
  "team-content",
  "custom",
];

const dataSourceAdapters: DataSourceAdapter[] = [
  "openfootball-worldcup-json",
  "polymarket-gamma",
  "worldcup26-api",
  "worldcupapi-com",
  "api-football",
  "football-data-org",
  "openligadb",
  "the-odds-api",
  "odds-api-io",
  "thesportsdb",
  "zafronix",
  "balldontlie-fifa",
  "rss-feed",
  "currents-api",
  "gdelt-doc",
  "newsapi-org",
  "generic-json",
];

const apiKeyPlacements: ApiKeyPlacement[] = ["none", "query", "header", "bearer", "path"];

const aiProviderTypes: AiProviderType[] = [
  "openai",
  "gemini",
  "deepseek",
  "nvidia",
  "xiaomi-mimo",
  "kimi-coding",
  "bigmodel",
  "custom",
];

const analyticsRangeOptions = [1, 7, 30, 90];

function createDataSource(): DataSourceConfig {
  const id = `source-${Date.now()}`;
  return {
    id,
    name: "自定义数据源",
    type: "custom",
    adapter: "generic-json",
    baseUrl: "",
    endpointPath: "",
    apiKey: "",
    apiKeyEnvName: "",
    apiKeyPlacement: "none",
    apiKeyParamName: "",
    apiKeyHeaderName: "",
    enabled: false,
    priority: 100,
    refreshSeconds: 300,
    cacheTtlSeconds: 300,
    timeoutMs: 6000,
    notes: "",
  };
}

function createAiProvider(): AiProviderConfig {
  const id = `provider-${Date.now()}`;
  return {
    id,
    name: "自定义 Provider",
    provider: "custom",
    baseUrl: "",
    apiKey: "",
    apiKeyEnvName: "",
    defaultModel: "",
    enabled: false,
    notes: "",
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-[11px] font-bold text-[#5C524C]">
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full border-2 border-[#241A14] bg-[#F5F1E8] px-2 py-1.5 text-xs text-[#241A14] placeholder-[#9E948C] focus:border-[#D36E52] focus:outline-none";

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className || ""}`} />;
}

function SelectInput<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className={inputClass}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function formatDateTime(value: string | undefined) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "暂无";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatNumber(value: number | undefined): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value || 0)));
}

function formatDuration(value: number | undefined): string {
  const seconds = Math.max(0, value || 0);
  if (seconds < 60) return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${Math.round(seconds % 60)}秒`;
  return `${(seconds / 3600).toFixed(1)}小时`;
}

function eventTypeLabel(value: string): string {
  if (value === "page_view") return "访问";
  if (value === "page_leave") return "停留";
  if (value === "click") return "点击";
  return value;
}

async function fetchAnalyticsReport(days: number): Promise<AnalyticsReport | null> {
  try {
    const res = await fetch(`/api/admin/analytics?days=${days}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.report || null) as AnalyticsReport | null;
  } catch {
    return null;
  }
}

function healthLabel(health: SourceHealthStatus["health"]) {
  if (health === "healthy") return "健康";
  if (health === "stale") return "待刷新";
  if (health === "failing") return "失败";
  if (health === "disabled") return "停用";
  return "未知";
}

function healthClass(health: SourceHealthStatus["health"]) {
  if (health === "healthy") return "border-[#6F8F5F] bg-[#6F8F5F]/10 text-[#4F6F42]";
  if (health === "stale") return "border-[#C79A4B] bg-[#C79A4B]/10 text-[#8A652E]";
  if (health === "failing") return "border-[#D36E52] bg-[#D36E52]/10 text-[#A34E38]";
  if (health === "disabled") return "border-[#9E948C] bg-[#9E948C]/10 text-[#5C524C]";
  return "border-[#9E948C] bg-[#F5F1E8] text-[#5C524C]";
}

function SectionHeader({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b-2 border-[#241A14] pb-3">
      <div>
        <h2 className="text-lg font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          {title}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[#9E948C]">{desc}</p>
      </div>
      {action}
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border border-[#241A14] bg-[#F5F1E8] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9E948C]" style={{ fontFamily: "var(--font-heading)" }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-[#5C524C]">{hint}</p>
    </div>
  );
}

function TrendBars({ report }: { report: AnalyticsReport }) {
  const points = report.trends.slice(-32);
  const maxValue = Math.max(1, ...points.map((point) => Math.max(point.pageViews, point.clicks)));
  if (!points.length) {
    return <div className="border border-[#241A14] bg-[#F5F1E8] p-3 text-xs text-[#9E948C]">暂无趋势数据。</div>;
  }

  return (
    <div className="border border-[#241A14] bg-[#F5F1E8] p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-[#5C524C]">
        <span>访问/点击趋势</span>
        <span>PV 橙色 · 点击绿色</span>
      </div>
      <div className="flex h-28 items-end gap-1">
        {points.map((point) => {
          const label = formatDateTime(point.bucket);
          return (
            <div key={point.bucket} className="flex min-w-0 flex-1 items-end gap-[2px]" title={`${label} PV ${point.pageViews} / 点击 ${point.clicks}`}>
              <span
                className="w-1/2 border border-[#241A14] bg-[#D36E52]"
                style={{ height: `${Math.max(6, (point.pageViews / maxValue) * 100)}%` }}
              />
              <span
                className="w-1/2 border border-[#241A14] bg-[#9CB48A]"
                style={{ height: `${Math.max(6, (point.clicks / maxValue) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnalyticsReportSection({
  report,
  loading,
  rangeDays,
  onRangeChange,
  onRefresh,
}: {
  report: AnalyticsReport | null;
  loading: boolean;
  rangeDays: number;
  onRangeChange: (days: number) => void;
  onRefresh: () => void;
}) {
  const totals = report?.totals;

  return (
    <section className="space-y-4 border-2 border-[#241A14] bg-[#FAF7F0] p-4" style={{ boxShadow: "4px 4px 0 0 #241A14" }}>
      <SectionHeader
        title="访问统计报告"
        desc="统计全站 PV、UV、访问 IP、页面/功能停留时间、点击目标和最近事件。前台页面自动埋点，报表每分钟刷新。"
        action={
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={rangeDays}
              onChange={(event) => onRangeChange(Number(event.target.value))}
              className="border border-[#241A14] bg-[#F5F1E8] px-2 py-1 text-xs font-bold text-[#241A14]"
              aria-label="统计周期"
            >
              {analyticsRangeOptions.map((days) => (
                <option key={days} value={days}>
                  近 {days} 天
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="border border-[#241A14] bg-[#241A14] px-3 py-1 text-xs font-bold text-white hover:bg-[#D36E52] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "刷新中" : "刷新"}
            </button>
          </div>
        }
      />

      {!report && (
        <div className="border border-[#241A14] bg-[#F5F1E8] p-3 text-xs text-[#9E948C]">
          {loading ? "加载访问统计..." : "暂无访问统计报告。"}
        </div>
      )}

      {report?.storage === "disabled" && (
        <div className="border border-[#C79A4B] bg-[#C79A4B]/10 p-3 text-xs text-[#5C524C]">
          当前未配置 `DATABASE_URL`，埋点 API 会返回成功但不写入统计数据。配置数据库并执行迁移后开始记录。
        </div>
      )}

      {report?.storage === "unavailable" && (
        <div className="border border-[#C79A4B] bg-[#C79A4B]/10 p-3 text-xs text-[#5C524C]">
          统计表暂不可用。请执行 `bun run db:migrate` 应用 `0005_analytics_events` 后刷新报表。
        </div>
      )}

      {report && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <MetricTile label="PV" value={formatNumber(totals?.pageViews)} hint={`事件总量 ${formatNumber(totals?.events)}`} />
            <MetricTile label="UV" value={formatNumber(totals?.uniqueVisitors)} hint={`会话 ${formatNumber(totals?.sessions)}`} />
            <MetricTile label="访问 IP" value={formatNumber(totals?.uniqueIps)} hint="按服务端请求 IP 去重" />
            <MetricTile label="平均停留" value={formatDuration(totals?.averageDurationSeconds)} hint={`累计 ${formatDuration(totals?.totalDurationSeconds)}`} />
          </div>

          <TrendBars report={report} />

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2 border border-[#241A14] bg-[#F5F1E8] p-3">
              <h3 className="text-sm font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>功能模块排行</h3>
              <div className="space-y-2">
                {report.features.length === 0 && <p className="text-xs text-[#9E948C]">暂无功能数据。</p>}
                {report.features.map((item) => (
                  <div key={item.feature} className="grid grid-cols-[1fr_auto] gap-3 border-b border-[#241A14]/20 pb-2 text-xs last:border-b-0 last:pb-0">
                    <div>
                      <p className="font-black text-[#241A14]">{item.feature}</p>
                      <p className="mt-0.5 text-[11px] text-[#5C524C]">
                        PV {formatNumber(item.pageViews)} · 点击 {formatNumber(item.clicks)} · UV {formatNumber(item.uniqueVisitors)}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-[#5C524C]">
                      <p>均停 {formatDuration(item.averageDurationSeconds)}</p>
                      <p>累计 {formatDuration(item.totalDurationSeconds)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 border border-[#241A14] bg-[#F5F1E8] p-3">
              <h3 className="text-sm font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>点击目标排行</h3>
              <div className="space-y-2">
                {report.clicks.length === 0 && <p className="text-xs text-[#9E948C]">暂无点击数据。</p>}
                {report.clicks.slice(0, 10).map((item) => (
                  <div key={`${item.path}:${item.targetType}:${item.targetLabel}`} className="grid grid-cols-[1fr_auto] gap-3 border-b border-[#241A14]/20 pb-2 text-xs last:border-b-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate font-black text-[#241A14]">{item.targetLabel}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#5C524C]">{item.feature} · {item.path}</p>
                    </div>
                    <div className="text-right text-[11px] text-[#5C524C]">
                      <p className="font-black text-[#D36E52]">{formatNumber(item.clicks)} 次</p>
                      <p>UV {formatNumber(item.uniqueVisitors)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="overflow-x-auto border border-[#241A14] bg-[#F5F1E8] p-3">
              <h3 className="mb-2 text-sm font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>页面停留排行</h3>
              <table className="w-full min-w-[560px] text-left text-[11px]">
                <thead className="border-b border-[#241A14] text-[#9E948C]">
                  <tr>
                    <th className="py-1 pr-3">页面</th>
                    <th className="py-1 pr-3">PV</th>
                    <th className="py-1 pr-3">点击</th>
                    <th className="py-1 pr-3">均停</th>
                    <th className="py-1">累计</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#241A14]/15 text-[#5C524C]">
                  {report.pages.slice(0, 12).map((item) => (
                    <tr key={item.path}>
                      <td className="max-w-[220px] truncate py-1.5 pr-3 font-bold text-[#241A14]">{item.path}</td>
                      <td className="py-1.5 pr-3">{formatNumber(item.pageViews)}</td>
                      <td className="py-1.5 pr-3">{formatNumber(item.clicks)}</td>
                      <td className="py-1.5 pr-3">{formatDuration(item.averageDurationSeconds)}</td>
                      <td className="py-1.5">{formatDuration(item.totalDurationSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto border border-[#241A14] bg-[#F5F1E8] p-3">
              <h3 className="mb-2 text-sm font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>访问 IP</h3>
              <table className="w-full min-w-[520px] text-left text-[11px]">
                <thead className="border-b border-[#241A14] text-[#9E948C]">
                  <tr>
                    <th className="py-1 pr-3">IP</th>
                    <th className="py-1 pr-3">PV</th>
                    <th className="py-1 pr-3">点击</th>
                    <th className="py-1 pr-3">会话</th>
                    <th className="py-1">最近访问</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#241A14]/15 text-[#5C524C]">
                  {report.ips.slice(0, 12).map((item) => (
                    <tr key={item.ipAddress}>
                      <td className="py-1.5 pr-3 font-bold text-[#241A14]">{item.ipAddress}</td>
                      <td className="py-1.5 pr-3">{formatNumber(item.pageViews)}</td>
                      <td className="py-1.5 pr-3">{formatNumber(item.clicks)}</td>
                      <td className="py-1.5 pr-3">{formatNumber(item.sessions)}</td>
                      <td className="py-1.5">{formatDateTime(item.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-[#241A14] bg-[#F5F1E8] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>最近事件</h3>
              <p className="text-[11px] text-[#9E948C]">生成于 {formatDateTime(report.generatedAt)}</p>
            </div>
            <div className="grid gap-1 text-[11px] text-[#5C524C]">
              {report.recentEvents.length === 0 && <p className="text-xs text-[#9E948C]">暂无事件。</p>}
              {report.recentEvents.slice(0, 12).map((item, index) => (
                <div key={`${item.occurredAt}:${index}`} className="grid gap-1 border-b border-[#241A14]/15 py-1.5 last:border-b-0 md:grid-cols-[96px_1fr_128px]">
                  <span className="font-bold text-[#241A14]">{eventTypeLabel(item.eventType)}</span>
                  <span className="min-w-0 truncate">
                    {item.feature} · {item.path}
                    {item.targetLabel ? ` · ${item.targetLabel}` : ""}
                    {item.durationSeconds ? ` · ${formatDuration(item.durationSeconds)}` : ""}
                  </span>
                  <span className="text-[#9E948C] md:text-right">{formatDateTime(item.occurredAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function LoginPanel({
  session,
  onLogin,
}: {
  session: SessionState;
  onLogin: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.status === 401 ? "密码不正确" : "管理员认证未配置");
      return;
    }
    onLogin();
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 py-8">
      <form
        onSubmit={submit}
        className="space-y-4 border-2 border-[#241A14] bg-[#FAF7F0] p-5"
        style={{ boxShadow: "5px 5px 0 0 #241A14" }}
      >
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#9E948C]" style={{ fontFamily: "var(--font-heading)" }}>
            Admin Console
          </p>
          <h1 className="mt-1 text-2xl font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
            管理员登录
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-[#5C524C]">
            用于配置赛事数据源、预测市场、AI 大模型 Provider 和自定义接口。
          </p>
        </div>

        {session.usingDevPassword && (
          <div className="border border-[#D36E52] bg-[#D36E52]/10 p-2 text-xs text-[#5C524C]">
            开发环境默认密码：<strong className="text-[#241A14]">admin123</strong>。生产环境必须配置 `ADMIN_PASSWORD`。
          </div>
        )}

        {!session.configured && (
          <div className="border border-[#D36E52] bg-[#D36E52]/10 p-2 text-xs text-[#5C524C]">
            管理员认证未配置。请在环境变量里设置 `ADMIN_PASSWORD` 和 `ADMIN_SESSION_SECRET`。
          </div>
        )}

        <Field label="管理员密码">
          <TextInput
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="输入管理员密码"
            autoComplete="current-password"
          />
        </Field>

        {error && <p className="text-xs font-bold text-[#D36E52]">{error}</p>}

        <button
          type="submit"
          disabled={loading || !session.configured}
          className="w-full border-2 border-[#241A14] bg-[#241A14] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#D36E52] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "登录中..." : "进入控制面板"}
        </button>
      </form>
    </div>
  );
}

function DataSourceCard({
  source,
  health,
  onChange,
  onRemove,
}: {
  source: DataSourceConfig;
  health?: SourceHealthStatus;
  onChange: (source: DataSourceConfig) => void;
  onRemove: () => void;
}) {
  return (
    <article className="space-y-3 border border-[#241A14] bg-[#FAF7F0] p-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-[#241A14]">
          <input
            type="checkbox"
            checked={source.enabled}
            onChange={(event) => onChange({ ...source, enabled: event.target.checked })}
          />
          启用
        </label>
        <button type="button" onClick={onRemove} className="text-xs font-bold text-[#D36E52]">
          删除
        </button>
      </div>
      <div className={`border px-2 py-2 text-[11px] ${healthClass(health?.health)}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
          <span>健康状态：{healthLabel(health?.health)}</span>
          <span>有效刷新：{health?.effectiveRefreshSeconds ? `${health.effectiveRefreshSeconds}s` : "暂无"}</span>
        </div>
        <div className="mt-1 grid gap-1 md:grid-cols-3">
          <span>最近刷新：{formatDateTime(health?.lastRefreshAt)}</span>
          <span>最近抓取：{formatDateTime(health?.lastFetchAt)}</span>
          <span>下次刷新：{formatDateTime(health?.nextRefreshAt)}</span>
        </div>
        {health?.lastFailureReason && (
          <p className="mt-1 line-clamp-2 text-[#A34E38]">失败原因：{health.lastFailureReason}</p>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="名称">
          <TextInput value={source.name} onChange={(event) => onChange({ ...source, name: event.target.value })} />
        </Field>
        <Field label="类型">
          <SelectInput value={source.type} options={dataSourceTypes} onChange={(type) => onChange({ ...source, type })} />
        </Field>
        <Field label="Adapter">
          <SelectInput value={source.adapter} options={dataSourceAdapters} onChange={(adapter) => onChange({ ...source, adapter })} />
        </Field>
        <Field label="Base URL">
          <TextInput value={source.baseUrl} onChange={(event) => onChange({ ...source, baseUrl: event.target.value })} placeholder="https://api.example.com" />
        </Field>
        <Field label="Endpoint Path">
          <TextInput value={source.endpointPath} onChange={(event) => onChange({ ...source, endpointPath: event.target.value })} placeholder="/fixtures" />
        </Field>
        <Field label="优先级（越小越先用）">
          <TextInput
            type="number"
            min={1}
            value={source.priority}
            onChange={(event) => onChange({ ...source, priority: Number(event.target.value) })}
          />
        </Field>
        <Field label="刷新间隔（秒）">
          <TextInput
            type="number"
            min={10}
            value={source.refreshSeconds}
            onChange={(event) => onChange({ ...source, refreshSeconds: Number(event.target.value) })}
          />
        </Field>
        <Field label="缓存 TTL（秒）">
          <TextInput
            type="number"
            min={10}
            value={source.cacheTtlSeconds}
            onChange={(event) => onChange({ ...source, cacheTtlSeconds: Number(event.target.value) })}
          />
        </Field>
        <Field label="超时（毫秒）">
          <TextInput
            type="number"
            min={1000}
            value={source.timeoutMs}
            onChange={(event) => onChange({ ...source, timeoutMs: Number(event.target.value) })}
          />
        </Field>
        <Field label="认证方式">
          <SelectInput value={source.apiKeyPlacement} options={apiKeyPlacements} onChange={(apiKeyPlacement) => onChange({ ...source, apiKeyPlacement })} />
        </Field>
        <Field label="API Key 环境变量">
          <TextInput
            value={source.apiKeyEnvName || ""}
            onChange={(event) => onChange({ ...source, apiKey: "", apiKeyEnvName: event.target.value })}
            placeholder="DATA_SOURCE_EXAMPLE_API_KEY"
          />
          <span className={`block text-[10px] ${source.apiKeyConfigured ? "text-[#6F8F5F]" : "text-[#9E948C]"}`}>
            {source.apiKeyPlacement === "none"
              ? "该数据源不需要 API Key"
              : source.apiKeyConfigured
                ? "已在服务端环境变量中检测到"
                : "未检测到，请写入 .env 后重启服务"}
          </span>
        </Field>
        <Field label="Key 参数名">
          <TextInput value={source.apiKeyParamName} onChange={(event) => onChange({ ...source, apiKeyParamName: event.target.value })} placeholder="key / api_key" />
        </Field>
        <Field label="Key Header 名">
          <TextInput value={source.apiKeyHeaderName} onChange={(event) => onChange({ ...source, apiKeyHeaderName: event.target.value })} placeholder="X-Auth-Token / Authorization" />
        </Field>
        <Field label="备注">
          <TextInput value={source.notes} onChange={(event) => onChange({ ...source, notes: event.target.value })} />
        </Field>
      </div>
    </article>
  );
}

function AiProviderCard({
  provider,
  onChange,
  onRemove,
}: {
  provider: AiProviderConfig;
  onChange: (provider: AiProviderConfig) => void;
  onRemove: () => void;
}) {
  return (
    <article className="space-y-3 border border-[#241A14] bg-[#FAF7F0] p-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-[#241A14]">
          <input
            type="checkbox"
            checked={provider.enabled}
            onChange={(event) => onChange({ ...provider, enabled: event.target.checked })}
          />
          启用
        </label>
        <button type="button" onClick={onRemove} className="text-xs font-bold text-[#D36E52]">
          删除
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="名称">
          <TextInput value={provider.name} onChange={(event) => onChange({ ...provider, name: event.target.value })} />
        </Field>
        <Field label="Provider">
          <SelectInput value={provider.provider} options={aiProviderTypes} onChange={(nextProvider) => onChange({ ...provider, provider: nextProvider })} />
        </Field>
        <Field label="Base URL">
          <TextInput value={provider.baseUrl} onChange={(event) => onChange({ ...provider, baseUrl: event.target.value })} />
        </Field>
        <Field label="默认模型">
          <TextInput value={provider.defaultModel} onChange={(event) => onChange({ ...provider, defaultModel: event.target.value })} placeholder="例如 gpt-4.1-mini" />
        </Field>
        <Field label="API Key 环境变量">
          <TextInput
            value={provider.apiKeyEnvName || ""}
            onChange={(event) => onChange({ ...provider, apiKey: "", apiKeyEnvName: event.target.value })}
            placeholder="AI_PROVIDER_EXAMPLE_API_KEY"
          />
          <span className={`block text-[10px] ${provider.apiKeyConfigured ? "text-[#6F8F5F]" : "text-[#9E948C]"}`}>
            {provider.apiKeyConfigured ? "已在服务端环境变量中检测到" : "未检测到，请写入 .env 后重启服务"}
          </span>
        </Field>
        <Field label="备注">
          <TextInput value={provider.notes} onChange={(event) => onChange({ ...provider, notes: event.target.value })} />
        </Field>
      </div>
    </article>
  );
}

export function AdminPanelScreen() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [sourceHealth, setSourceHealth] = useState<Record<string, SourceHealthStatus>>({});
  const [analytics, setAnalytics] = useState<AnalyticsReport | null>(null);
  const [analyticsRangeDays, setAnalyticsRangeDays] = useState(7);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const enabledSummary = useMemo(() => {
    if (!config) return null;
    return {
      dataSources: config.dataSources.filter((source) => source.enabled).length,
      aiProviders: config.aiProviders.filter((provider) => provider.enabled).length,
    };
  }, [config]);

  async function loadSession() {
    const res = await fetch("/api/admin/session", { cache: "no-store" });
    const data = await res.json();
    setSession({
      authenticated: Boolean(data.authenticated),
      configured: Boolean(data.configured),
      usingDevPassword: Boolean(data.usingDevPassword),
    });
    if (data.authenticated) await loadConfig();
  }

  async function loadConfig() {
    const res = await fetch("/api/admin/config", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setConfig(data.config);
    await loadSourceHealth();
  }

  async function loadSourceHealth() {
    const res = await fetch("/api/data/sources", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const byId = Object.fromEntries(
      ((data.sources || []) as SourceHealthStatus[]).map((source) => [source.id, source]),
    );
    setSourceHealth(byId);
  }

  useEffect(() => {
    let cancelled = false;
    async function syncSession() {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      const data = await res.json();
      if (cancelled) return;
      setSession({
        authenticated: Boolean(data.authenticated),
        configured: Boolean(data.configured),
        usingDevPassword: Boolean(data.usingDevPassword),
      });

      if (!data.authenticated) return;
      const configRes = await fetch("/api/admin/config", { cache: "no-store" });
      if (!configRes.ok || cancelled) return;
      const configData = await configRes.json();
      setConfig(configData.config);
      const sourceRes = await fetch("/api/data/sources", { cache: "no-store" });
      if (!sourceRes.ok || cancelled) return;
      const sourceData = await sourceRes.json();
      setSourceHealth(Object.fromEntries(
        ((sourceData.sources || []) as SourceHealthStatus[]).map((source) => [source.id, source]),
      ));
    }

    void syncSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    let cancelled = false;

    async function syncAnalytics() {
      setAnalyticsLoading(true);
      const report = await fetchAnalyticsReport(analyticsRangeDays);
      if (cancelled) return;
      setAnalytics(report);
      setAnalyticsLoading(false);
    }

    void syncAnalytics();
    const timer = window.setInterval(() => void syncAnalytics(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.authenticated, analyticsRangeDays]);

  async function refreshAnalytics() {
    setAnalyticsLoading(true);
    const report = await fetchAnalyticsReport(analyticsRangeDays);
    setAnalytics(report);
    setAnalyticsLoading(false);
  }

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
    });
    setSaving(false);
    if (!res.ok) {
      setMessage("保存失败，请检查登录状态。");
      return;
    }
    const data = await res.json();
    setConfig(data.config);
    await loadSourceHealth();
    setMessage("配置已保存到 data/admin-config.json");
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setConfig(null);
    setAnalytics(null);
    await loadSession();
  }

  if (!session) {
    return <div className="min-h-svh bg-[#F5F1E8] p-6 text-sm text-[#9E948C]">加载管理员状态...</div>;
  }

  if (!session.authenticated) {
    return <LoginPanel session={session} onLogin={loadSession} />;
  }

  if (!config) {
    return <div className="min-h-svh bg-[#F5F1E8] p-6 text-sm text-[#9E948C]">加载配置...</div>;
  }

  return (
    <div className="min-h-svh bg-[#F5F1E8]">
      <div className="border-b-2 border-[#241A14] bg-[#FAF7F0] px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#9E948C]" style={{ fontFamily: "var(--font-heading)" }}>
              Admin Console
            </p>
            <h1 className="mt-1 text-2xl font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
              世界杯装杯指南控制面板
            </h1>
            <p className="mt-1 text-xs text-[#5C524C]">
              已启用 {enabledSummary?.dataSources} 个数据源，{enabledSummary?.aiProviders} 个 AI Provider。
            </p>
          </div>
          <button type="button" onClick={logout} className="border border-[#241A14] px-3 py-1 text-xs font-bold text-[#5C524C] hover:bg-[#EDE9E0]">
            退出
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-5 md:px-6">
        {session.usingDevPassword && (
          <div className="border border-[#D36E52] bg-[#D36E52]/10 p-3 text-xs text-[#5C524C]">
            当前使用开发默认密码。部署前请设置 `ADMIN_PASSWORD` 和 `ADMIN_SESSION_SECRET`。
          </div>
        )}

        <AnalyticsReportSection
          report={analytics}
          loading={analyticsLoading}
          rangeDays={analyticsRangeDays}
          onRangeChange={setAnalyticsRangeDays}
          onRefresh={() => void refreshAnalytics()}
        />

        <section className="space-y-4 border-2 border-[#241A14] bg-[#FAF7F0] p-4" style={{ boxShadow: "4px 4px 0 0 #241A14" }}>
          <SectionHeader
            title="数据源配置"
            desc="管理赛程、比分、预测市场、赔率、集锦和球队内容来源。API Key 只从 .env 环境变量读取，不写入配置 JSON。"
            action={
              <button type="button" onClick={() => setConfig({ ...config, dataSources: [...config.dataSources, createDataSource()] })} className="shrink-0 border border-[#241A14] bg-[#241A14] px-3 py-1 text-xs font-bold text-white hover:bg-[#D36E52]">
                添加数据源
              </button>
            }
          />
          <div className="grid gap-3">
            {config.dataSources.map((source, index) => (
              <DataSourceCard
                key={source.id}
                source={source}
                health={sourceHealth[source.id]}
                onChange={(nextSource) => {
                  const next = [...config.dataSources];
                  next[index] = nextSource;
                  setConfig({ ...config, dataSources: next });
                }}
                onRemove={() => setConfig({ ...config, dataSources: config.dataSources.filter((item) => item.id !== source.id) })}
              />
            ))}
          </div>
        </section>

        <section className="space-y-4 border-2 border-[#241A14] bg-[#FAF7F0] p-4" style={{ boxShadow: "4px 4px 0 0 #241A14" }}>
          <SectionHeader
            title="AI 大模型接入"
            desc="支持 OpenAI、Gemini、DeepSeek、NVIDIA NIM、小米 MiMo、Kimi Coding、BigModel/智谱，以及 OpenAI-compatible 自定义 Provider。Provider API Key 同样只从 .env 环境变量读取，不写入配置 JSON。"
            action={
              <button type="button" onClick={() => setConfig({ ...config, aiProviders: [...config.aiProviders, createAiProvider()] })} className="shrink-0 border border-[#241A14] bg-[#241A14] px-3 py-1 text-xs font-bold text-white hover:bg-[#D36E52]">
                添加 Provider
              </button>
            }
          />
          <div className="max-w-sm">
            <Field label="主 AI Provider">
              <select
                id="primary-ai-provider"
                className={inputClass}
                value={config.primaryAiProviderId}
                onChange={(event) => setConfig({ ...config, primaryAiProviderId: event.target.value })}
              >
                {config.aiProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}{provider.enabled ? "" : "（未启用）"}
                  </option>
                ))}
              </select>
            </Field>
            <p className="mt-1 text-[10px] text-[#9E948C]">
              优先调用主 Provider，失败时按列表顺序尝试其他已启用 Provider。
            </p>
          </div>
          <div className="grid gap-3">
            {config.aiProviders.map((provider, index) => (
              <AiProviderCard
                key={provider.id}
                provider={provider}
                onChange={(nextProvider) => {
                  const next = [...config.aiProviders];
                  next[index] = nextProvider;
                  setConfig({ ...config, aiProviders: next });
                }}
                onRemove={() => setConfig({ ...config, aiProviders: config.aiProviders.filter((item) => item.id !== provider.id) })}
              />
            ))}
          </div>
        </section>

        <div className="sticky bottom-[72px] z-10 border-2 border-[#241A14] bg-[#FAF7F0] p-3 md:bottom-4" style={{ boxShadow: "4px 4px 0 0 #241A14" }}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-[#5C524C]">
              最后更新时间：{config.updatedAt === new Date(0).toISOString() ? "尚未保存" : config.updatedAt}
              {message && <span className="ml-2 font-bold text-[#9CB48A]">{message}</span>}
            </p>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={saveConfig}
              disabled={saving}
              className="border-2 border-[#241A14] bg-[#D36E52] px-4 py-2 text-xs font-black text-white hover:bg-[#241A14] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "保存中..." : "保存配置"}
            </motion.button>
          </div>
        </div>
      </main>
    </div>
  );
}
