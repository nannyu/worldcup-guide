"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  type GossipItem,
  type Match,
  type MorningBrief,
  type NewsArticle,
} from "@/lib/wc-data";

// Event tag labels
const tagLabels: Record<string, { label: string; color: string }> = {
  goal: { label: "进球", color: "bg-[#9CB48A] text-white" },
  yellow: { label: "黄牌", color: "bg-[#E4A853] text-[#241A14]" },
  red: { label: "红牌", color: "bg-[#D36E52] text-white" },
  penalty: { label: "点球", color: "bg-[#D36E52] text-white" },
  og: { label: "乌龙球", color: "bg-[#9E948C] text-white" },
};

const fallbackMorningBrief: MorningBrief = {
  issueDate: "",
  edition: "",
  title: "",
  summary: "",
  quote: "",
  sourceLabel: "等待数据源",
  updatedAt: "",
  matches: [],
  news: [],
  gossipItems: [],
};

function matchDigest(match: Match): string {
  if (match.status === "finished" && match.homeScore !== null && match.awayScore !== null) {
    return `${match.homeTeam} ${match.homeScore}:${match.awayScore} ${match.awayTeam}。`;
  }
  return `${match.kickoffBj} 北京时间开赛，地点：${match.venue || "待确认"}。赛果和事件等待比分源更新。`;
}

function MatchResultCard({ match }: { match: Match }) {
  const [expanded, setExpanded] = useState(false);
  const tags = [
    match.status === "finished" ? "已完赛" : match.status === "live" ? "直播中" : "赛程",
    match.group,
  ];
  const hasScore = match.homeScore !== null && match.awayScore !== null;

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
          {hasScore ? `${match.homeScore} : ${match.awayScore}` : "VS"}
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
        {matchDigest(match)}
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

        {expanded && match.events && match.events.length > 0 && (
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
          看集锦
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

function GossipCard({ item }: { item: GossipItem }) {
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

function formatArticleTime(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function NewsCard({ item }: { item: NewsArticle }) {
  const displayedSummary = item.aiSummary || item.summary;
  return (
    <motion.a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="block border border-[#241A14] bg-[#FAF7F0] p-3 hover:bg-white transition-colors"
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex justify-between gap-3">
        <h4 className="font-bold text-sm text-[#241A14] leading-snug" style={{ fontFamily: "var(--font-heading)" }}>
          {item.title}
        </h4>
        <span className="shrink-0 text-[10px] font-bold text-[#9E948C]">{formatArticleTime(item.publishedAt)}</span>
      </div>
      <p className="mt-2 text-xs text-[#5C524C] leading-relaxed">{displayedSummary}</p>
      {item.aiKeyPoints && item.aiKeyPoints.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-[#9CB48A] pl-2">
          {item.aiKeyPoints.map((point) => (
            <li key={point} className="text-[11px] text-[#5C524C]">· {point}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-dashed border-[#241A14]/20 pt-2 text-[10px] text-[#9E948C]">
        <span className="font-bold text-[#241A14]">{item.source}</span>
        {(item.sourceCount || 0) > 1 && <span>· {item.sourceCount} 个来源交叉报道</span>}
        {item.domain && <span>· {item.domain}</span>}
        {item.language && <span>· {item.language}</span>}
        {item.country && <span>· {item.country}</span>}
      </div>
    </motion.a>
  );
}

export function MorningBriefScreen() {
  const [brief, setBrief] = useState<MorningBrief>(fallbackMorningBrief);
  const [copied, setCopied] = useState(false);
  const quote = brief.quote;

  useEffect(() => {
    let cancelled = false;
    async function loadBrief() {
      const res = await fetch("/api/data/morning?dateKey=yesterday", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { brief?: MorningBrief };
      if (cancelled || !data.brief) return;
      setBrief(data.brief);
    }

    void loadBrief();
    return () => {
      cancelled = true;
    };
  }, []);

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
          <span className="text-[10px] font-bold text-[#9E948C]">{brief.edition || "暂无期次"}</span>
        </div>
        <h2
          className="font-black text-xl leading-tight text-[#241A14]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {brief.title || "世界杯早报"}
        </h2>
        <div className="border-t border-[#241A14] mt-2 pt-2 text-xs text-[#5C524C]">
          <strong>头版摘要：</strong> {brief.summary || "暂无可用原始信息。"}
          <span className="block mt-1 text-[10px] text-[#9E948C]">来源：{brief.sourceLabel}</span>
          {brief.aggregation && (
            <span className="block mt-1 text-[10px] text-[#9E948C]">
              抓取 {brief.aggregation.fetchedSourceCount} 个源，成功 {brief.aggregation.successfulSourceCount} 个，
              原始 {brief.aggregation.rawArticleCount} 条，去重后 {brief.aggregation.deduplicatedArticleCount} 条。
              {brief.aggregation.aiUsed
                ? ` AI：${brief.aggregation.aiProvider}`
                : ` ${brief.aggregation.aiMessage}`}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Quote card */}
        {quote && (
          <div
            className="border border-[#241A14] bg-[#FAF7F0] p-3 relative"
            style={{ boxShadow: "3px 3px 0 0 #241A14" }}
          >
            <p className="font-serif text-sm text-[#241A14] leading-relaxed">{quote}</p>
            <div className="mt-3 border-t border-dashed border-[#241A14] pt-2 flex justify-between items-center">
              <span className="text-[10px] font-bold text-[#9E948C]">复制摘要</span>
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={copyQuote}
                className={`px-3 py-1 text-[10px] font-bold border border-[#241A14] transition-colors ${
                  copied ? "bg-[#9CB48A] text-white" : "bg-[#241A14] text-white hover:bg-[#D36E52]"
                }`}
              >
                {copied ? "✓ 已复制" : "复制"}
              </motion.button>
            </div>
          </div>
        )}

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
        {brief.matches.length > 0 ? (
          brief.matches.map((m) => <MatchResultCard key={m.id} match={m} />)
        ) : (
          <div className="border-2 border-dashed border-[#241A14] p-8 text-center">
            <p className="text-sm font-bold text-[#241A14]">暂无比赛信息</p>
            <p className="mt-1 text-[11px] text-[#9E948C]">比分或赛程源返回数据后会自动显示。</p>
          </div>
        )}

        {/* News source section */}
        {brief.news.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#9CB48A] rounded-full flex-shrink-0" />
              <span
                className="font-bold text-xs tracking-wider uppercase text-[#241A14]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                多源新闻整理
              </span>
              <div className="flex-grow border-b border-double border-[#241A14]/30" />
            </div>

            {brief.news.slice(0, 5).map((article) => (
              <NewsCard key={article.id} item={article} />
            ))}
          </>
        )}

        {brief.gossipItems.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#E4A853] rounded-full flex-shrink-0" />
              <span
                className="font-bold text-xs tracking-wider uppercase text-[#241A14]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                市场话题
              </span>
              <div className="flex-grow border-b border-double border-[#241A14]/30" />
            </div>
            {brief.gossipItems.slice(0, 3).map((g) => (
              <GossipCard key={g.id} item={g} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
