// Today Schedule Screen components

"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  getCountdownToBj,
  matchesByDate,
  scheduleDateMeta,
  type Match,
  type ScheduleDateKey,
  type SignalType,
} from "@/lib/wc-data";

// ===== Signal Badge =====
function SignalBadge({ signal }: { signal: SignalType }) {
  const styles: Record<SignalType, string> = {
    value: "bg-[#D36E52] text-white border-[#241A14]",
    hot: "bg-[#E4A853] text-[#241A14] border-[#241A14]",
    close: "bg-[#9CB48A] text-white border-[#241A14]",
    none: "bg-[#F5F1E8] text-[#9E948C] border-[#241A14]",
  };
  const labels: Record<SignalType, string> = {
    value: "价值凸显",
    hot: "热度异常",
    close: "市场接近",
    none: "暂无信号",
  };
  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-bold border ${styles[signal]}`}
    >
      {labels[signal]}
    </span>
  );
}

// ===== Prob Bar =====
function ProbBar({ home, draw, away, homeTeam, awayTeam }: {
  home: number; draw: number; away: number;
  homeTeam: string; awayTeam: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-px h-4 overflow-hidden rounded-[2px] border border-[#241A14]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${home}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="bg-[#D36E52] h-full flex items-center justify-center"
        >
          <span className="text-[9px] text-white font-bold px-0.5">{home}%</span>
        </motion.div>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${draw}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="bg-[#9E948C] h-full flex items-center justify-center"
        >
          <span className="text-[9px] text-white font-bold px-0.5">{draw}%</span>
        </motion.div>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${away}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
          className="bg-[#5C524C] h-full flex items-center justify-center flex-1"
        >
          <span className="text-[9px] text-white font-bold px-0.5">{away}%</span>
        </motion.div>
      </div>
      <div className="flex justify-between text-[10px] text-[#9E948C]">
        <span>{homeTeam} 胜</span>
        <span>平</span>
        <span>{awayTeam} 胜</span>
      </div>
      <p className="text-[10px] text-[#9E948C]">来源：Polymarket 预测市场概率</p>
    </div>
  );
}

function OddsBar({ home, draw, away, homeTeam, awayTeam }: {
  home: number; draw: number; away: number;
  homeTeam: string; awayTeam: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-px h-4 overflow-hidden rounded-[2px] border border-[#241A14]">
        <div className="bg-[#9CB48A] h-full flex items-center justify-center" style={{ width: `${home}%` }}>
          <span className="text-[9px] text-white font-bold px-0.5">{home}%</span>
        </div>
        <div className="bg-[#9E948C] h-full flex items-center justify-center" style={{ width: `${draw}%` }}>
          <span className="text-[9px] text-white font-bold px-0.5">{draw}%</span>
        </div>
        <div className="bg-[#5C524C] h-full flex items-center justify-center" style={{ width: `${away}%` }}>
          <span className="text-[9px] text-white font-bold px-0.5">{away}%</span>
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-[#9E948C]">
        <span>{homeTeam} 胜</span>
        <span>平</span>
        <span>{awayTeam} 胜</span>
      </div>
      <p className="text-[10px] text-[#9E948C]">来源：The Odds API 多家机构去水均值</p>
    </div>
  );
}

// ===== Match Card =====
function MatchCard({ match }: { match: Match }) {
  const isLive = match.status === "live";
  const isFinished = match.status === "finished";

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className="border border-[#241A14] bg-[#FAF7F0] relative overflow-hidden"
      style={{ boxShadow: "3px 3px 0 0 #241A14" }}
    >
      {/* Status bar */}
      <div className="flex justify-between items-center px-3 py-2 border-b border-[#241A14]/30">
        <span className="text-[10px] font-bold text-[#9E948C]">
          {match.kickoffBj}（北京时间）· {match.group} {match.round}
        </span>
        <div className="flex items-center gap-1.5">
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-[#D36E52]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D36E52] animate-pulse" />
              直播中
            </span>
          )}
          {isFinished && (
            <span className="text-[10px] font-bold text-[#9E948C]">已完赛</span>
          )}
          {match.signal !== "none" && (
            <SignalBadge signal={match.signal} />
          )}
        </div>
      </div>

      {/* Teams & Score */}
      <div className="px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-1 flex-1">
            <span className="text-3xl">{match.homeFlag}</span>
            <span
              className="font-bold text-sm text-center text-[#241A14]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {match.homeTeam}
            </span>
          </div>
          <div className="flex flex-col items-center px-4">
            {isFinished || isLive ? (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-[#241A14]">{match.homeScore}</span>
                <span className="text-lg text-[#9E948C] font-light">:</span>
                <span className="text-2xl font-black text-[#241A14]">{match.awayScore}</span>
              </div>
            ) : (
              <span
                className="text-base font-black tracking-widest text-[#9E948C]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                VS
              </span>
            )}
            {!isFinished && !isLive && (
              <span className="text-[10px] text-[#9E948C] mt-0.5">即将开赛</span>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 flex-1">
            <span className="text-3xl">{match.awayFlag}</span>
            <span
              className="font-bold text-sm text-center text-[#241A14]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {match.awayTeam}
            </span>
          </div>
        </div>
      </div>

      {/* Prob bar (upcoming only) */}
      {!isFinished && match.homeWinProb > 0 && (
        <div className="px-3 pb-3">
          <ProbBar
            home={match.homeWinProb}
            draw={match.drawProb}
            away={match.awayWinProb}
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
          />
        </div>
      )}

      {!isFinished && match.oddsImpliedHome > 0 && (
        <div className="px-3 pb-3">
          <OddsBar
            home={match.oddsImpliedHome}
            draw={match.oddsImpliedDraw}
            away={match.oddsImpliedAway}
            homeTeam={match.homeTeam}
            awayTeam={match.awayTeam}
          />
        </div>
      )}

      {/* Signal text */}
      {match.signal !== "none" && match.signalText && (
        <div className="mx-3 mb-2 px-2 py-1.5 bg-[#EDE9E0] border-l-2 border-[#D36E52] text-xs text-[#5C524C]">
          {match.signalText}
        </div>
      )}

      {/* Preview text */}
      {match.previewText && (
        <div className="px-3 pb-3 text-xs text-[#5C524C] border-t border-dashed border-[#241A14]/20 pt-2">
          {match.previewText}
        </div>
      )}

      {/* Action row */}
      <div className="border-t border-[#241A14]/30 px-3 py-2 flex justify-between items-center">
        <span className="text-[10px] text-[#9E948C]">{match.updatedAt}</span>
        <Link
          href={`/match/${match.id}`}
          className="text-xs font-bold text-[#D36E52] hover:underline flex items-center gap-0.5"
        >
          装杯小抄
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </Link>
      </div>
    </motion.div>
  );
}

// ===== Hero Spotlight =====
function HeroSpotlight({ match }: { match: Match }) {
  return (
    <motion.div
      className="border-2 border-[#241A14] bg-[#FAF7F0] relative overflow-hidden"
      style={{ boxShadow: "5px 5px 0 0 #241A14" }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Stamp label */}
      <span className="absolute top-0 right-0 bg-[#D36E52] text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-widest border-b border-l border-[#241A14]">
        今日头条
      </span>

      <div className="p-4 pt-6">
        <div
          className="text-[10px] font-black tracking-widest uppercase text-[#D36E52] mb-1"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {match.group} · {match.round}
        </div>
        <h3
          className="font-black text-2xl leading-tight mb-2 text-[#241A14]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {match.homeTeam} {match.homeFlag} VS {match.awayFlag} {match.awayTeam}
        </h3>
        <p className="text-xs text-[#5C524C] leading-relaxed mb-3">
          {match.previewText}
        </p>

        {/* Quote */}
        <div className="bg-black/5 border border-dashed border-[#241A14] p-2.5 text-xs mb-3">
          <strong className="text-[#D36E52]">装杯金句：</strong>
          「{match.signalText}」
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[#9E948C]">北京时间 {match.kickoffBj}</span>
          <Link
            href={`/match/${match.id}`}
            className="px-3 py-1 bg-[#241A14] text-white text-xs font-bold hover:bg-[#D36E52] transition-colors"
          >
            看穿真相 →
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

// ===== Countdown badge =====
function CountdownBadge() {
  const [countdown] = useState(getCountdownToBj);
  return (
    <motion.div
      className="bg-[#D36E52] text-white text-[10px] font-bold px-2 py-0.5 border border-[#241A14] tracking-tight"
      style={{ transform: "rotate(-2deg)" }}
      animate={{ rotate: [-2, 1, -2] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      距首场 {countdown}
    </motion.div>
  );
}

// ===== Section Divider =====
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-grow border-b-2 border-double border-[#241A14]" />
      <span
        className="font-bold text-xs tracking-wider uppercase text-[#5C524C] whitespace-nowrap"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {label}
      </span>
      <div className="flex-grow border-b-2 border-double border-[#241A14]" />
    </div>
  );
}

// ===== Header =====
function PageHeader({
  activeTab,
  onTabChange,
}: {
  activeTab: ScheduleDateKey;
  onTabChange: (t: ScheduleDateKey) => void;
}) {
  const tabs: { key: ScheduleDateKey; label: string }[] = [
    { key: "yesterday", label: scheduleDateMeta.yesterday.tabLabel },
    { key: "today", label: scheduleDateMeta.today.tabLabel },
    { key: "tomorrow", label: scheduleDateMeta.tomorrow.tabLabel },
  ];

  return (
    <div className="px-4 py-2 border-b-2 border-[#241A14] bg-[#FAF7F0] flex justify-between items-center sticky top-0 z-[10]">
      <div className="flex gap-1">
        {tabs.map((t) => (
          <motion.button
            key={t.key}
            whileTap={{ scale: 0.95 }}
            onClick={() => onTabChange(t.key)}
            className={`px-2.5 py-1 text-xs font-bold border border-[#241A14] transition-colors ${
              activeTab === t.key
                ? "bg-[#241A14] text-white"
                : "bg-[#FAF7F0] text-[#241A14] hover:bg-[#EDE9E0]"
            }`}
          >
            {t.label}
          </motion.button>
        ))}
      </div>
      <CountdownBadge />
    </div>
  );
}

// ===== Main Screen =====
export function TodayScheduleScreen() {
  const [activeTab, setActiveTab] = useState<ScheduleDateKey>("today");
  const [remoteMatches, setRemoteMatches] = useState<Partial<Record<ScheduleDateKey, Match[]>>>({});
  const [dataSourceLabel, setDataSourceLabel] = useState("正在读取数据源");
  const matches = remoteMatches[activeTab] || matchesByDate[activeTab];
  const activeMeta = scheduleDateMeta[activeTab];

  useEffect(() => {
    let cancelled = false;
    async function loadMatches() {
      const res = await fetch(`/api/data/matches?dateKey=${activeTab}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        matches?: Match[];
        source?: "remote" | "fallback" | "cache";
        diagnostics?: Array<{ name: string; ok: boolean }>;
      };
      if (cancelled) return;
      const receivedMatches = data.matches || [];
      setRemoteMatches((current) => ({ ...current, [activeTab]: receivedMatches }));
      const firstOk = data.diagnostics?.find((item) => item.ok);
      if (receivedMatches.length === 0 && firstOk) {
        setDataSourceLabel(`${firstOk.name} · 当前日期无比赛`);
      } else if (data.source === "cache") {
        setDataSourceLabel("PostgreSQL · 持久化快照");
      } else if (data.source === "remote" && firstOk) {
        setDataSourceLabel(`${firstOk.name} · 远端数据`);
      } else {
        setDataSourceLabel("FIFA 官方赛程 · 本地兜底");
      }
    }

    void loadMatches();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const headlineMatch = matches[0];
  const restMatches = matches.slice(1);

  return (
    <div className="flex flex-col min-h-svh bg-[#F5F1E8]">
      {/* Masthead */}
      <div className="px-4 py-3 border-b-2 border-[#241A14] bg-[#FAF7F0]">
        <div
          className="text-[10px] font-black tracking-[0.25em] text-[#9E948C] uppercase mb-0.5"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          2026 FIFA World Cup · 装杯指南
        </div>
        <h1
          className="text-2xl font-black text-[#241A14] leading-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          今日赛程
        </h1>
        <p className="text-xs text-[#9E948C] mt-0.5">所有时间均为北京时间 · {dataSourceLabel}</p>
      </div>

      {/* Date tabs */}
      <PageHeader activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {matches.length === 0 ? (
              <div className="border-2 border-dashed border-[#241A14] p-8 text-center">
                <p className="text-[#9E948C] text-sm">该日期暂无赛程数据</p>
              <p className="text-[10px] text-[#9E948C] mt-1">
                {activeMeta.date} 数据源未返回比赛
              </p>
              </div>
            ) : (
              <>
                {headlineMatch && <HeroSpotlight match={headlineMatch} />}

                {restMatches.length > 0 && (
                  <SectionDivider label={`${activeMeta.listLabel}（共 ${matches.length} 场）`} />
                )}

                {restMatches.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}

                {/* Tip box */}
                <div className="border border-[#241A14] p-3 bg-[#EDE9E0] text-xs text-[#5C524C]">
                  <strong className="text-[#241A14]">数据说明：</strong>
                  页面只展示已接入来源返回的数据；缺失的比分、概率和事件不会使用演示值补齐。
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
