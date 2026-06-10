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
  "football-data-org",
  "openligadb",
  "the-odds-api",
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
  "xiaomi-mimo",
  "kimi-coding",
  "bigmodel",
  "custom",
];

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
  onChange,
  onRemove,
}: {
  source: DataSourceConfig;
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
        <Field label="API Key / Token">
          <TextInput type="password" value={source.apiKey} onChange={(event) => onChange({ ...source, apiKey: event.target.value })} placeholder="可为空" />
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
        <Field label="API Key">
          <TextInput type="password" value={provider.apiKey} onChange={(event) => onChange({ ...provider, apiKey: event.target.value })} placeholder="sk-..." />
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
    }

    void syncSession();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setMessage("配置已保存到 data/admin-config.json");
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setConfig(null);
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

        <section className="space-y-4 border-2 border-[#241A14] bg-[#FAF7F0] p-4" style={{ boxShadow: "4px 4px 0 0 #241A14" }}>
          <SectionHeader
            title="数据源配置"
            desc="管理赛程、比分、预测市场、赔率、集锦和球队内容来源。API Key 会写入本地忽略文件，不提交到 Git。"
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
            desc="支持 OpenAI、Gemini、DeepSeek、小米 MiMo、Kimi Coding、BigModel/智谱，以及 OpenAI-compatible 自定义 Provider。"
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
