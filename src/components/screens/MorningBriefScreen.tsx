"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { yesterdayMatches, gossipItems, type Match } from "@/lib/wc-data";

// Event tag labels
const tagLabels: Record<string, { label: string; color: string }> = {
  goal: { label: "进球", color: "bg-[#9CB48A] text-white" },
  yellow: { label: "黄牌", color: "bg-[#E4A853] text-[#241A14]" },
  red: { label: "红牌", color: "bg-[#D36E52] text-white" },
  penalty: { label: "点球", color: "bg-[#D36E52] text-white" },
  og: { label: "乌龙球", color: "bg-[#9E948C] text-white" },
};

// Scene tags per match
const sceneTags: Record<string, string[]> = {
  "m-y001": ["大胜", "梅开二度", "门将梦游"],
  "m-y002": ["绝杀", "爆冷", "终场戏剧"],
};

function MatchResultCard({ match }: { match: Match }) {
  const [expanded, setExpanded] = useState(false);
  const tags = sceneTags[match.id] || [];

  return (
    <motion.div
      className="border border-[#241A14] bg-[#FAF7F0]"
      style={{ boxShadow: "3px 3px 0 0 #241A14" }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Top row */}
      <div className="flex justify-between items-center px-3 py-2 border-b border-[#241A14]/30">
        <div className="flex gap-1.5 flex-wrap">
          {tags.map((t) => (
            <span key={t} className="px-1.5 py-0.5 text-[10px] font-bold bg-[#EDE9E0] border border-[#241A14] text-[#241A14]">
              {t}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-[#9E948C]">{match.group} {match.round}</span>
      </div>

      {/* Score row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex flex-col items-center gap-1 flex-1">
          <span className="text-3xl">{match.homeFlag}</span>
          <span
            className="font-bold text-sm text-[#241A14]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {match.homeTeam}
          </span>
          <span className="text-[10px] text-[#9E948C]">主场</span>
        </div>
        <div className="px-4 py-1 bg-[#241A14] text-white font-mono font-black text-xl tracking-widest">
          {match.homeScore} : {match.awayScore}
        </div>
        <div className="flex flex-col items-center gap-1 flex-1">
          <span className="text-3xl">{match.awayFlag}</span>
          <span
            className="font-bold text-sm text-[#241A14]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {match.awayTeam}
          </span>
          <span className="text-[10px] text-[#9E948C]">客场</span>
        </div>
      </div>

      {/* 30s digest */}
      <div className="mx-3 mb-3 bg-[#EDE9E0] border-l-2 border-[#D36E52] p-2.5 text-xs text-[#5C524C]">
        <strong className="text-[#241A14]">30秒看懂：</strong>
        {match.homeTeam === "法国"
          ? "法国开门红！姆巴佩梅开二度，进球效率堪称完美。澳大利亚门将状态糟糕，防线全线崩溃。"
          : "日本89分钟绝杀德国！全场领略了什么叫「置之死地而后生」。德国控球优势完全被反击打崩。"}
      </div>

      {/* Timeline toggle */}
      <div className="px-3 pb-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between py-1.5 text-xs font-bold text-[#5C524C] border-t border-dashed border-[#241A14]/30"
        >
          <span>进球时间线</span>
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </motion.span>
        </motion.button>

        {expanded && match.events && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="pt-2 space-y-1.5 overflow-hidden"
          >
            {match.events.map((ev, i) => {
              const tag = tagLabels[ev.type] || tagLabels.goal;
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-10 text-right text-[#9E948C] font-mono">{ev.minute}&apos;</span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold ${tag.color}`}>{tag.label}</span>
                  <span className="text-[#5C524C]">
                    {ev.player}
                    {ev.description ? `（${ev.description}）` : ""}
                  </span>
                </div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Action row */}
      <div className="border-t border-[#241A14]/30 px-3 py-2 flex justify-between items-center">
        <Link
          href={match.highlights || "#"}
          className="text-xs text-[#9CB48A] font-bold flex items-center gap-0.5 hover:underline"
          target="_blank"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          看集锦（B站）
        </Link>
        <Link
          href={`/match/${match.id}`}
          className="text-xs font-bold text-[#D36E52] hover:underline"
        >
          完整赛报 →
        </Link>
      </div>
    </motion.div>
  );
}

function GossipCard({ item }: { item: typeof gossipItems[0] }) {
  return (
    <motion.div
      className="border border-[#241A14] bg-[#FAF7F0] p-3"
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-bold text-sm text-[#241A14] flex-1 pr-2" style={{ fontFamily: "var(--font-heading)" }}>
          {item.title}
        </h4>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-lg font-black text-[#D36E52]">{item.prob}%</span>
          <span className="text-[9px] text-[#9E948C]">市场概率</span>
        </div>
      </div>
      <p className="text-xs text-[#5C524C] leading-relaxed">{item.summary}</p>
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed border-[#241A14]/20">
        <span className="text-[10px] text-[#9E948C]">{item.source} · {item.updatedAt}</span>
        <span className="text-[10px] font-bold text-[#9E948C]">仅为市场预测，非确定性判断</span>
      </div>
    </motion.div>
  );
}

export function MorningBriefScreen() {
  const quote = `「昨晚这两场打得有意思——法国4-0大胜在预料中，但日本89分钟绝杀德国才是真正的黑马炸弹。老球迷还在骂裁判，聪明人已经在看下一场赔率差值了。」`;
  const [copied, setCopied] = useState(false);

  function copyQuote() {
    navigator.clipboard.writeText(quote).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col min-h-svh bg-[#F5F1E8]">
      {/* Masthead */}
      <div className="px-4 py-3 border-b-2 border-double border-[#241A14] bg-[#FAF7F0]">
        <div className="flex justify-between items-center mb-1">
          <span
            className="text-[10px] font-black uppercase tracking-widest text-[#D36E52]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            每日复盘特刊
          </span>
          <span className="text-[10px] font-bold text-[#9E948C]">2026-06-12（第 2 期）</span>
        </div>
        <h2
          className="font-black text-xl leading-tight text-[#241A14]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          昨夜战报：日本绝杀德国，法国4-0开门红
        </h2>
        <div className="border-t border-[#241A14] mt-2 pt-2 text-xs text-[#5C524C]">
          <strong>头版摘要：</strong> 昨晚 2 场，1 场爆冷。日本 89 分钟绝杀德国，全网热议。法国 4-0 大胜表现完美。
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Quote card */}
        <div
          className="border border-[#241A14] bg-[#FAF7F0] p-3 relative"
          style={{ boxShadow: "3px 3px 0 0 #241A14" }}
        >
          <div
            className="absolute -top-3 right-3 bg-[#D36E52] text-white text-[9px] font-bold px-2 py-0.5 border border-[#241A14]"
            style={{ transform: "rotate(3deg)" }}
          >
            微信/朋友圈无脑发
          </div>
          <p
            className="font-serif text-sm text-[#241A14] leading-relaxed pt-1"
          >
            {quote}
          </p>
          <div className="mt-3 border-t border-dashed border-[#241A14] pt-2 flex justify-between items-center">
            <span className="text-[10px] font-bold text-[#9E948C]">一键复制装杯金句</span>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={copyQuote}
              className={`px-3 py-1 text-[10px] font-bold border border-[#241A14] transition-colors ${
                copied ? "bg-[#9CB48A] text-white" : "bg-[#241A14] text-white hover:bg-[#D36E52]"
              }`}
            >
              {copied ? "✓ 已复制" : "一键复制金句"}
            </motion.button>
          </div>
        </div>

        {/* Section divider */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#D36E52] rounded-full flex-shrink-0" />
          <span
            className="font-bold text-xs tracking-wider uppercase text-[#241A14]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            战局深度拆解
          </span>
          <div className="flex-grow border-b border-double border-[#241A14]/30" />
        </div>

        {/* Match cards */}
        {yesterdayMatches.map((m) => (
          <MatchResultCard key={m.id} match={m} />
        ))}

        {/* Gossip section */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#E4A853] rounded-full flex-shrink-0" />
          <span
            className="font-bold text-xs tracking-wider uppercase text-[#241A14]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            吃瓜前线
          </span>
          <div className="flex-grow border-b border-double border-[#241A14]/30" />
        </div>

        {gossipItems.slice(0, 3).map((g) => (
          <GossipCard key={g.id} item={g} />
        ))}

        <div className="border border-[#241A14] p-3 text-xs text-[#5C524C]">
          <strong className="text-[#241A14]">免责声明：</strong>
          以上数据来自 Polymarket 预测市场，仅作观赛参考。本工具不提供投注建议，不跳转任何博彩平台。
        </div>
      </div>
    </div>
  );
}
