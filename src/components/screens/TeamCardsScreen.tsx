"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { teams, type Team } from "@/lib/wc-data";

type Filter = "all" | "hot" | "dark" | "classic";

function HotStars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill={i < count ? "#D36E52" : "none"}
          stroke="#D36E52"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function TeamCard({ team, onClick }: { team: Team; onClick: () => void }) {
  const isHot = team.hotLevel >= 4;
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="border border-[#241A14] bg-[#FAF7F0] p-3.5 relative cursor-pointer hover:bg-white transition-colors"
      style={{ boxShadow: "3px 3px 0 0 #241A14" }}
    >
      {/* Floating badge */}
      {isHot && (
        <div
          className="absolute -top-2.5 right-2 bg-[#D36E52] text-white text-[9px] font-bold px-1.5 py-0.5 border border-[#241A14]"
        >
          {team.hotLevel === 5 ? "夺冠热门" : "话题黑马"}
        </div>
      )}

      {/* Header row */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3
            className="font-black text-xl flex items-center gap-2 text-[#241A14]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <span className="text-2xl">{team.flag}</span>
            {team.name}
          </h3>
          <p className="text-[10px] text-[#9E948C] mt-0.5">
            主帅：{team.coach} · {team.formation} · {team.group}
          </p>
        </div>
        <HotStars count={team.hotLevel} />
      </div>

      {/* Divider */}
      <div className="border-t border-dashed border-[#241A14]/30 pt-2 mt-1 space-y-1.5">
        <p className="text-xs text-[#5C524C]">
          <strong className="text-[#241A14]">一句话风格：</strong> {team.style}
        </p>

        {/* Core players */}
        <p className="text-xs text-[#5C524C]">
          <strong className="text-[#241A14]">核心球员：</strong>
          {team.stars.join("、")}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {team.tags.map((tag) => (
            <span
              key={tag}
              className="text-[9px] font-bold border border-[#241A14] px-1.5 py-0.5 bg-black/5 text-[#5C524C]"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-2.5 text-right">
        <span className="text-[11px] font-bold text-[#D36E52]">点击速成聊天素材 →</span>
      </div>
    </motion.div>
  );
}

function TeamDetailModal({ team, onClose }: { team: Team; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[30] flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-[31] w-full max-w-lg max-h-[85svh] overflow-y-auto bg-[#FAF7F0] border-2 border-[#241A14] md:rounded-[4px]"
        style={{ boxShadow: "6px 6px 0 0 #241A14" }}
      >
        {/* Modal header */}
        <div className="sticky top-0 bg-[#FAF7F0] border-b-2 border-[#241A14] px-4 py-3 flex justify-between items-center z-10">
          <div>
            <span
              className="text-[10px] font-black tracking-widest uppercase text-[#D36E52]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              球队速成卡
            </span>
            <h3
              className="text-xl font-black text-[#241A14] flex items-center gap-2"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <span className="text-2xl">{team.flag}</span>
              {team.name}
            </h3>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="w-8 h-8 border-2 border-[#241A14] flex items-center justify-center text-[#241A14] hover:bg-[#D36E52] hover:text-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </motion.button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "FIFA 排名", value: `#${team.rank}` },
              { label: "阵型", value: team.formation },
              { label: "小组", value: team.group },
            ].map((s) => (
              <div key={s.label} className="border border-[#241A14] p-2 text-center">
                <div className="text-lg font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>{s.value}</div>
                <div className="text-[10px] text-[#9E948C]">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Coach & stars */}
          <div className="border border-[#241A14] p-3 space-y-2">
            <div className="text-xs">
              <strong className="text-[#241A14]">主帅：</strong>
              <span className="text-[#5C524C]">{team.coach}</span>
            </div>
            <div className="text-xs">
              <strong className="text-[#241A14]">核心球员：</strong>
              <span className="text-[#5C524C]">{team.stars.join("、")}</span>
            </div>
            <div className="text-xs">
              <strong className="text-[#241A14]">战术大白话：</strong>
              <span className="text-[#5C524C]">{team.style}</span>
            </div>
          </div>

          {/* Talking points */}
          <div>
            <h4
              className="font-bold text-xs tracking-wider text-[#241A14] mb-2 uppercase"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              饭局必备 3 个聊天点
            </h4>
            {team.talkingPoints.map((point, i) => (
              <div key={i} className="flex gap-2.5 mb-2">
                <span className="w-5 h-5 bg-[#D36E52] text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-[#5C524C] leading-relaxed">{point}</p>
              </div>
            ))}
          </div>

          {/* Tags */}
          <div>
            <h4
              className="font-bold text-xs tracking-wider text-[#241A14] mb-2 uppercase"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              聊天标签
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {team.tags.map((tag) => (
                <span key={tag} className="px-2 py-1 text-xs font-bold border border-[#241A14] bg-[#EDE9E0] text-[#5C524C]">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-[#9E948C] text-center pt-2 border-t border-dashed border-[#241A14]/20">
            数据来源：FIFA · Transfermarkt · 2026 赛季统计
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function TeamCardsScreen() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Team | null>(null);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: `已录入 ${teams.length} 队` },
    { key: "hot", label: "夺冠热门" },
    { key: "dark", label: "话题黑马" },
    { key: "classic", label: "老牌流量" },
  ];

  const filtered = useMemo(() => {
    let list = teams;
    if (filter === "hot") list = list.filter((t) => t.hotLevel >= 4);
    if (filter === "dark") list = list.filter((t) => t.hotLevel === 3);
    if (filter === "classic") list = list.filter((t) => t.rank <= 10);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.includes(q) ||
          t.nameEn.toLowerCase().includes(q) ||
          t.stars.some((s) => s.includes(q)) ||
          t.coach.includes(q)
      );
    }
    return list;
  }, [query, filter]);

  return (
    <div className="flex flex-col min-h-svh bg-[#F5F1E8]">
      {/* Masthead */}
      <div className="px-4 py-3 border-b-2 border-[#241A14] bg-[#FAF7F0]">
        <div
          className="text-[10px] font-black tracking-[0.25em] text-[#9E948C] uppercase mb-0.5"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          球队档案局
        </div>
        <h1
          className="text-2xl font-black text-[#241A14] leading-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          48 队速成卡
        </h1>
        <p className="text-xs text-[#9E948C] mt-0.5">10 秒认识任意球队 · 当前已录入 {teams.length}/48 支样例档案</p>
      </div>

      {/* Search & filters */}
      <div className="px-4 py-3 border-b border-[#241A14] bg-[#FAF7F0] space-y-2 sticky top-0 z-[10]">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索你想装杯的球队/球星..."
            className="w-full bg-[#F5F1E8] border-2 border-[#241A14] px-3 py-2 text-xs text-[#241A14] placeholder-[#9E948C] focus:outline-none focus:border-[#D36E52] transition-colors"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9E948C]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {filters.map((f) => (
            <motion.button
              key={f.key}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 text-xs font-bold border border-[#241A14] whitespace-nowrap transition-colors ${
                filter === f.key
                  ? "bg-[#241A14] text-white"
                  : "bg-[#FAF7F0] text-[#241A14] hover:bg-[#EDE9E0]"
              }`}
            >
              {f.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {filtered.length === 0 ? (
          <div className="border-2 border-dashed border-[#241A14] p-8 text-center">
            <p className="text-[#9E948C] text-sm">没找到匹配的球队</p>
            <p className="text-[10px] text-[#9E948C] mt-1">换个关键词试试</p>
          </div>
        ) : (
          filtered.map((team) => (
            <TeamCard key={team.id} team={team} onClick={() => setSelected(team)} />
          ))
        )}
        <div className="border border-dashed border-[#241A14] p-4 text-center text-xs text-[#9E948C]">
          当前展示 {filtered.length} 支样例球队；完整 48 队档案可按小组继续补齐。
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selected && (
          <TeamDetailModal team={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
