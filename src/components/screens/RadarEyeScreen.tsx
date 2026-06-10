"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { radarMatches, type RadarMatch } from "@/lib/wc-data";

// ============================================================
// 折线图组件（纯 SVG，无第三方依赖）
// ============================================================
function ProbLineChart({
  data,
  homeTeam,
}: {
  data: { time: string; market: number; odds: number }[];
  homeTeam: string;
}) {
  const W = 280;
  const H = 100;
  const PAD = { top: 8, right: 8, bottom: 22, left: 28 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allValues = data.flatMap((d) => [d.market, d.odds]);
  const minV = Math.max(0, Math.min(...allValues) - 6);
  const maxV = Math.min(100, Math.max(...allValues) + 6);

  const toX = (i: number) => (i / (data.length - 1)) * chartW;
  const toY = (v: number) => chartH - ((v - minV) / (maxV - minV)) * chartH;

  const marketPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(d.market).toFixed(1)}`)
    .join(" ");
  const oddsPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(d.odds).toFixed(1)}`)
    .join(" ");

  // 填充面积（market 曲线下方）
  const areaPath =
    marketPath +
    ` L ${toX(data.length - 1).toFixed(1)} ${chartH} L 0 ${chartH} Z`;

  // Y 轴刻度线
  const yTicks = [minV, Math.round((minV + maxV) / 2), maxV];

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="overflow-visible"
      aria-label={`${homeTeam}胜率变化曲线`}
    >
      <g transform={`translate(${PAD.left}, ${PAD.top})`}>
        {/* Grid lines */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={0}
              y1={toY(v)}
              x2={chartW}
              y2={toY(v)}
              stroke="#241A14"
              strokeWidth={0.5}
              strokeDasharray="3 3"
              opacity={0.2}
            />
            <text
              x={-4}
              y={toY(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={7}
              fill="#9E948C"
            >
              {Math.round(v)}%
            </text>
          </g>
        ))}

        {/* Area fill under market line */}
        <motion.path
          d={areaPath}
          fill="#D36E52"
          opacity={0.06}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.06 }}
          transition={{ duration: 0.8 }}
        />

        {/* Odds line (dashed, gray) */}
        <motion.path
          d={oddsPath}
          fill="none"
          stroke="#9E948C"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />

        {/* Market line (solid, primary) */}
        <motion.path
          d={marketPath}
          fill="none"
          stroke="#D36E52"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.1 }}
        />

        {/* Data points — market */}
        {data.map((d, i) => (
          <circle
            key={`m${i}`}
            cx={toX(i)}
            cy={toY(d.market)}
            r={i === data.length - 1 ? 3.5 : 2}
            fill="#D36E52"
            stroke="#FAF7F0"
            strokeWidth={1}
          />
        ))}

        {/* Data points — odds */}
        {data.map((d, i) => (
          <circle
            key={`o${i}`}
            cx={toX(i)}
            cy={toY(d.odds)}
            r={1.5}
            fill="#9E948C"
          />
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => (
          <text
            key={`t${i}`}
            x={toX(i)}
            y={chartH + 14}
            textAnchor="middle"
            fontSize={7}
            fill="#9E948C"
          >
            {d.time}
          </text>
        ))}
      </g>

      {/* Legend */}
      <g transform={`translate(${PAD.left}, ${H - 2})`}>
        <line x1={0} y1={0} x2={12} y2={0} stroke="#D36E52" strokeWidth={2} />
        <text x={15} y={0} dominantBaseline="middle" fontSize={7} fill="#5C524C">
          市场概率
        </text>
        <line x1={62} y1={0} x2={74} y2={0} stroke="#9E948C" strokeWidth={1.5} strokeDasharray="4 2" />
        <text x={77} y={0} dominantBaseline="middle" fontSize={7} fill="#5C524C">
          赔率隐含
        </text>
      </g>
    </svg>
  );
}

// ============================================================
// 差值 Badge
// ============================================================
const diffConfig: Record<RadarMatch["diffLabel"], { label: string; bg: string; text: string; textColor: string }> = {
  aligned:     { label: "基本一致",  bg: "bg-[#9CB48A]", text: "text-white",     textColor: "text-[#9CB48A]" },
  notable:     { label: "值得关注",  bg: "bg-[#E4A853]", text: "text-[#241A14]", textColor: "text-[#E4A853]" },
  significant: { label: "明显分歧",  bg: "bg-[#D36E52]", text: "text-white",     textColor: "text-[#D36E52]" },
};

// ============================================================
// Prob Bar Row
// ============================================================
function ProbBarRow({ label, prob, color }: { label: string; prob: number; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-[#5C524C] font-bold">{label}</span>
        <span className="font-bold text-[#241A14]">{prob}%</span>
      </div>
      <div className="h-2 bg-black/10 border border-[#241A14] overflow-hidden">
        <motion.div
          className={`h-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${prob}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ============================================================
// Radar Card
// ============================================================
function RadarCard({ match }: { match: RadarMatch }) {
  const [showChart, setShowChart] = useState(false);
  const config = diffConfig[match.diffLabel];
  const diffValue = Math.abs(match.homeMarketProb - match.homeOddsProb);

  return (
    <motion.div
      className="border border-[#241A14] bg-[#FAF7F0] p-3 relative space-y-3"
      style={{ boxShadow: "3px 3px 0 0 #241A14" }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <span className={`text-xs font-black uppercase ${config.textColor}`}>
          {config.label}（+{diffValue}%）
        </span>
        <span className="text-[10px] text-[#9E948C]">{match.updatedAt}</span>
      </div>

      {/* Match name */}
      <div
        className="font-black text-base text-[#241A14] flex items-center gap-2 flex-wrap"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        <span>{match.homeFlag} {match.homeTeam}</span>
        <span className="text-[#9E948C] font-light text-sm">VS</span>
        <span>{match.awayFlag} {match.awayTeam}</span>
        {match.status === "finished" && (
          <span className="ml-auto text-[10px] font-bold text-[#9E948C] border border-[#241A14] px-1.5 py-0.5">
            已完赛
          </span>
        )}
      </div>

      {/* Prob bars */}
      <div className="space-y-1.5">
        <ProbBarRow label="Polymarket 真实资金池概率" prob={match.homeMarketProb} color="bg-[#D36E52]" />
        <ProbBarRow label="传统赔率隐含概率" prob={match.homeOddsProb} color="bg-[#9E948C]" />
      </div>

      {/* Diff badge */}
      <div className="flex justify-center">
        <span className={`inline-block px-3 py-1 border border-[#241A14] text-[10px] font-black tracking-wide ${config.bg} ${config.text}`}>
          差值 {diffValue >= 10 ? "≥10%" : diffValue >= 5 ? "5-10%" : "<5%"} · {config.label}
        </span>
      </div>

      {/* Plain text */}
      <div className="bg-black/5 border border-dashed border-[#241A14] p-2.5 text-xs text-[#241A14]">
        <strong className="text-[#D36E52]">大白话：</strong> {match.diffText}
      </div>

      {/* Chart toggle */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setShowChart(!showChart)}
        className="w-full flex items-center justify-between py-1.5 text-[11px] font-bold text-[#5C524C] border-t border-dashed border-[#241A14]/30 pt-2 hover:text-[#D36E52] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          {showChart ? "收起概率变化曲线" : "查看 24h 概率变化曲线"}
        </span>
        <motion.span animate={{ rotate: showChart ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {showChart && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border border-[#241A14]/20 bg-[#F5F1E8] p-3 rounded-[2px]">
              <p className="text-[10px] text-[#9E948C] mb-2">
                {match.homeTeam} 胜率变化 · 红线 = 市场概率，虚线 = 赔率隐含
              </p>
              <ProbLineChart data={match.history} homeTeam={match.homeTeam} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[10px] text-[#9E948C] text-right">
        来源：Polymarket · 赔率隐含换算 · 非投注建议
      </p>
    </motion.div>
  );
}

// ============================================================
// Legend
// ============================================================
function DiffLegend() {
  return (
    <div className="border border-[#241A14] p-3 bg-[#FAF7F0]">
      <p className="text-[10px] font-black tracking-wider uppercase text-[#9E948C] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
        差值阈值图例
      </p>
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "< 5%  基本一致", color: "bg-[#9CB48A]" },
          { label: "5-10%  值得关注", color: "bg-[#E4A853]" },
          { label: "> 10%  明显分歧", color: "bg-[#D36E52]" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-[11px] text-[#5C524C]">
            <span className={`w-3 h-3 ${item.color} border border-[#241A14]`} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 主页面
// ============================================================
export function RadarEyeScreen() {
  const [items, setItems] = useState<RadarMatch[]>(radarMatches);
  const [dataSourceLabel, setDataSourceLabel] = useState("Mock · 本地演示数据");

  useEffect(() => {
    let cancelled = false;
    async function loadRadar() {
      const res = await fetch("/api/data/radar", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        radarMatches?: RadarMatch[];
        source?: "remote" | "mock" | "cache";
        diagnostics?: Array<{ name: string; ok: boolean }>;
      };
      if (cancelled || !data.radarMatches?.length) return;
      setItems(data.radarMatches);
      const firstOk = data.diagnostics?.find((item) => item.ok);
      if (data.source === "cache") {
        setDataSourceLabel("PostgreSQL · 持久化快照");
      } else if (data.source === "remote" && firstOk) {
        setDataSourceLabel(`${firstOk.name} · 远端数据`);
      } else {
        setDataSourceLabel("Mock · 本地回退数据");
      }
    }

    void loadRadar();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col min-h-svh bg-[#F5F1E8]">
      {/* Masthead */}
      <div className="px-4 py-3 border-b-2 border-[#241A14] bg-[#FAF7F0]">
        <div className="text-[10px] font-black tracking-[0.25em] text-[#9E948C] uppercase mb-0.5" style={{ fontFamily: "var(--font-heading)" }}>
          赔率情报站
        </div>
        <div className="flex justify-between items-start">
          <h1 className="text-2xl font-black text-[#241A14] leading-tight" style={{ fontFamily: "var(--font-heading)" }}>
            天眼雷达
          </h1>
          <span className="text-[9px] font-bold bg-[#D36E52] text-white px-1.5 py-0.5 border border-[#241A14] mt-1">
            异常实时更新
          </span>
        </div>
        <p className="text-xs text-[#5C524C] mt-1.5 leading-relaxed">
          对比 <strong>Polymarket 链上真实资金池</strong> 与 <strong>传统赔率隐含概率</strong> 的差距。
          点击每张卡片可展开 24h 概率变化曲线。当前：{dataSourceLabel}。
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <DiffLegend />
        {items.map((m) => (
          <RadarCard key={m.id} match={m} />
        ))}
        <div className="border border-[#241A14] p-3 text-xs text-[#5C524C]">
          <strong className="text-[#241A14]">数据来源说明：</strong>
          「Polymarket 概率」来自链上真实资金池，反映真金白银的市场判断。
          「赔率隐含概率」由欧赔换算（公式：1 ÷ 欧赔），代表传统机构定价。
          两者分歧越大，信息越值得关注。本工具不构成任何投注建议。
        </div>
      </div>
    </div>
  );
}
