"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { teamsWithBuiltInProfilesFromOfficialSchedule } from "@/lib/team-profiles";
import { type PlayerProfile, type Team } from "@/lib/wc-data";
import { groupLabel, teamName, tr } from "@/lib/i18n/content";

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

function TeamCard({ team, onClick, locale }: { team: Team; onClick: () => void; locale: string }) {
  const isHot = team.hotLevel >= 4;
  const starPlayers = team.starPlayers?.length
    ? team.starPlayers.map((player) => `${player.position} ${player.name}`)
    : team.stars;
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
          {team.hotLevel === 5 ? tr(locale, "夺冠热门", "Title Favorite") : tr(locale, "话题黑马", "Dark Horse")}
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
            {teamName(team.name, locale)}
          </h3>
          {(team.coach || team.formation || team.group) && (
            <p className="text-[10px] text-[#9E948C] mt-0.5">
              {[team.coach ? `${tr(locale, "主帅：", "Coach: ")}${team.coach}` : tr(locale, "主帅：待数据源", "Coach: pending data"), team.formation, groupLabel(team.group, locale)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {team.hotLevel > 0 && <HotStars count={team.hotLevel} />}
      </div>

      {/* Divider */}
      <div className="border-t border-dashed border-[#241A14]/30 pt-2 mt-1 space-y-1.5">
        {team.style && (
          <p className="text-xs text-[#5C524C]">
            <strong className="text-[#241A14]">{tr(locale, "球队资料：", "Team profile:")}</strong> {team.style}
          </p>
        )}

        {/* Core players */}
        {starPlayers.length > 0 ? (
          <p className="text-xs text-[#5C524C]">
            <strong className="text-[#241A14]">{tr(locale, "主力球星：", "Key players:")}</strong>
            {starPlayers.join("、")}
          </p>
        ) : (
          <p className="text-xs text-[#9E948C]">
            <strong className="text-[#241A14]">{tr(locale, "主力球星：", "Key players:")}</strong>{tr(locale, "待球员数据源返回", "Waiting for player data")}
          </p>
        )}

        <p className="text-xs text-[#5C524C]">
          <strong className="text-[#241A14]">{tr(locale, "AI 毒舌：", "AI sharp take:")}</strong>
          {team.roast || tr(locale, "资料还没喂饱，AI 暂时只能先闭嘴，免得把待确认写成铁证。", "The data feed is still hungry, so the AI is staying quiet instead of dressing guesses as facts.")}
        </p>

        {/* Tags */}
        {team.tags.length > 0 && <div className="flex flex-wrap gap-1 pt-0.5">
          {team.tags.map((tag) => (
            <span
              key={tag}
              className="text-[9px] font-bold border border-[#241A14] px-1.5 py-0.5 bg-black/5 text-[#5C524C]"
            >
              #{tag}
            </span>
          ))}
        </div>}
      </div>

      <div className="mt-2.5 text-right">
        <span className="text-[11px] font-bold text-[#D36E52]">{tr(locale, "点击速成聊天素材 →", "Open quick notes →")}</span>
      </div>
    </motion.div>
  );
}

function PlayerDetailModal({ player, onClose, locale }: { player: PlayerProfile; onClose: () => void; locale: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[40] flex items-end justify-center md:items-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(event) => event.stopPropagation()}
        className="relative z-[41] w-full max-w-md border-2 border-[#241A14] bg-[#FAF7F0] p-4"
        style={{ boxShadow: "6px 6px 0 0 #241A14" }}
      >
        <div className="flex items-start justify-between gap-3 border-b-2 border-[#241A14] pb-3">
          <div className="flex items-center gap-3">
            {player.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={player.avatarUrl} alt={player.name} className="h-14 w-14 border border-[#241A14] object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center border border-[#241A14] bg-[#EDE9E0] text-lg font-black text-[#9E948C]">
                {player.name.slice(0, 1)}
              </div>
            )}
            <div>
              <h3 className="text-lg font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                {player.name}
              </h3>
              <p className="text-[11px] text-[#9E948C]">
                {[player.position, player.club, player.age ? `${player.age} 岁` : ""].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="border border-[#241A14] px-2 py-1 text-xs font-bold">{tr(locale, "关闭", "Close")}</button>
        </div>
        <div className="mt-3 space-y-3 text-xs leading-relaxed text-[#5C524C]">
          <p>{player.intro || tr(locale, "暂无球员介绍，等待球员数据源补齐。", "No player bio yet. Waiting for the player data source.")}</p>
          {player.career && player.career.length > 0 && (
            <div>
              <h4 className="mb-1 font-bold text-[#241A14]">{tr(locale, "履历", "Career")}</h4>
              <div className="space-y-1">
                {player.career.map((item) => (
                  <p key={item}>· {item}</p>
                ))}
              </div>
            </div>
          )}
          <p className="border border-dashed border-[#241A14] bg-[#EDE9E0] p-2 text-[#241A14]">
            <strong className="text-[#D36E52]">{tr(locale, "AI 毒舌：", "AI sharp take:")}</strong>
            {player.roast || tr(locale, "履历没给够，硬毒舌就会变成硬编，先把刀收一收。", "Without enough career data, a sharp take would just be sharp fiction.")}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TeamDetailModal({
  team,
  onClose,
  onPlayerClick,
  locale,
}: {
  team: Team;
  onClose: () => void;
  onPlayerClick: (player: PlayerProfile) => void;
  locale: string;
}) {
  const stats = [
    team.rank > 0 ? { label: "FIFA 排名", value: `#${team.rank}` } : null,
    team.formation ? { label: "阵型", value: team.formation } : null,
    team.group ? { label: "小组", value: team.group } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));
  const hasProfile = Boolean(team.coach || team.stars.length || team.starPlayers?.length || team.style || team.roast);
  const starPlayers = team.starPlayers?.length
    ? team.starPlayers.map((player) => `${player.position} ${player.name}`)
    : team.stars;

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
              {tr(locale, "球队速成卡", "Team Card")}
            </span>
            <h3
              className="text-xl font-black text-[#241A14] flex items-center gap-2"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <span className="text-2xl">{team.flag}</span>
              {teamName(team.name, locale)}
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
          {stats.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="border border-[#241A14] p-2 text-center">
                <div className="text-lg font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>{s.value}</div>
                <div className="text-[10px] text-[#9E948C]">{tr(locale, s.label, s.label === "FIFA 排名" ? "FIFA rank" : s.label === "阵型" ? "Formation" : "Group")}</div>
              </div>
            ))}
            </div>
          )}

          {/* Coach & stars */}
          {hasProfile && (
            <div className="border border-[#241A14] p-3 space-y-2">
            {team.coach && <div className="text-xs">
              <strong className="text-[#241A14]">{tr(locale, "主帅：", "Coach:")}</strong>
              <span className="text-[#5C524C]">{team.coach}</span>
            </div>}
            {starPlayers.length > 0 && <div className="text-xs">
              <strong className="text-[#241A14]">{tr(locale, "主力球星：", "Key players:")}</strong>
              <span className="text-[#5C524C]">{starPlayers.join("、")}</span>
            </div>}
            {team.style && <div className="text-xs">
              <strong className="text-[#241A14]">{tr(locale, "战术大白话：", "Plain tactics:")}</strong>
              <span className="text-[#5C524C]">{team.style}</span>
            </div>}
            {team.roast && <div className="text-xs">
              <strong className="text-[#241A14]">{tr(locale, "AI 毒舌：", "AI sharp take:")}</strong>
              <span className="text-[#5C524C]">{team.roast}</span>
            </div>}
            </div>
          )}

          <div>
            <h4
              className="font-bold text-xs tracking-wider text-[#241A14] mb-2 uppercase"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {tr(locale, "完整名单", "Full Squad")}
            </h4>
            {team.roster && team.roster.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {team.roster.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => onPlayerClick(player)}
                    className="flex items-center gap-2 border border-[#241A14] bg-[#F5F1E8] p-2 text-left transition-colors hover:bg-white"
                  >
                    {player.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.avatarUrl} alt={player.name} className="h-9 w-9 shrink-0 border border-[#241A14] object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#241A14] bg-[#EDE9E0] text-xs font-black text-[#9E948C]">
                        {player.name.slice(0, 1)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-[#241A14]">{player.name}</span>
                      <span className="block truncate text-[10px] text-[#9E948C]">{player.position}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed border-[#241A14] p-5 text-center">
                <p className="text-xs font-bold text-[#241A14]">{tr(locale, "完整名单待数据源返回", "Full squad pending data")}</p>
                <p className="mt-1 text-[10px] text-[#9E948C]">{tr(locale, "不会用猜测名单填坑。", "No guessed rosters will be used.")}</p>
              </div>
            )}
          </div>

          {/* Talking points */}
          {team.talkingPoints.length > 0 && <div>
            <h4
              className="font-bold text-xs tracking-wider text-[#241A14] mb-2 uppercase"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {tr(locale, "饭局必备 3 个聊天点", "3 Table-talk Notes")}
            </h4>
            {team.talkingPoints.map((point, i) => (
              <div key={i} className="flex gap-2.5 mb-2">
                <span className="w-5 h-5 bg-[#D36E52] text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-[#5C524C] leading-relaxed">{point}</p>
              </div>
            ))}
          </div>}

          {/* Tags */}
          {team.tags.length > 0 && <div>
            <h4
              className="font-bold text-xs tracking-wider text-[#241A14] mb-2 uppercase"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {tr(locale, "聊天标签", "Tags")}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {team.tags.map((tag) => (
                <span key={tag} className="px-2 py-1 text-xs font-bold border border-[#241A14] bg-[#EDE9E0] text-[#5C524C]">
                  #{tag}
                </span>
              ))}
            </div>
          </div>}

          {/* Disclaimer */}
          <p className="text-[10px] text-[#9E948C] text-center pt-2 border-t border-dashed border-[#241A14]/20">
            {tr(locale, "数据来源：", "Source: ")}{team.source || tr(locale, "已配置球队数据源", "Configured team data source")}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function TeamCardsScreen() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [items, setItems] = useState<Team[]>([]);
  const [sourceLabel, setSourceLabel] = useState("等待数据源");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Team | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProfile | null>(null);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: tr(locale, `已录入 ${items.length} 队`, `${items.length} teams`) },
    { key: "hot", label: tr(locale, "夺冠热门", "Favorites") },
    { key: "dark", label: tr(locale, "话题黑马", "Dark horses") },
    { key: "classic", label: tr(locale, "老牌流量", "Classic powers") },
  ];

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "hot") list = list.filter((t) => t.hotLevel >= 4);
    if (filter === "dark") list = list.filter((t) => t.hotLevel === 3);
    if (filter === "classic") list = list.filter((t) => (t.rank > 0 && t.rank <= 10) || t.tags.includes("老牌强队"));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (t) => {
          const fields = [
            t.code || "",
            t.name,
            teamName(t.name, locale),
            t.nameEn,
            t.coach,
            t.formation,
            t.style,
            ...t.tags,
            ...t.stars,
            ...(t.starPlayers?.flatMap((player) => [player.name, player.position]) || []),
            ...(t.roster?.flatMap((player) => [player.name, player.position, player.club || ""]) || []),
          ];
          return fields.some((field) => field.toLowerCase().includes(q));
        }
      );
    }
    return list.slice().sort((left, right) => {
      const groupCompare = groupOrder(left.group) - groupOrder(right.group);
      return groupCompare || left.name.localeCompare(right.name, "zh-CN");
    });
  }, [items, query, filter, locale]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Team[]>();
    for (const team of filtered) {
      const key = team.group || "未分组";
      groups.set(key, [...(groups.get(key) || []), team]);
    }
    return Array.from(groups.entries()).sort(([left], [right]) => groupOrder(left) - groupOrder(right));
  }, [filtered]);

  useEffect(() => {
    let cancelled = false;
    async function loadTeams() {
      const response = await fetch("/api/data/teams");
      if (!response.ok) return;
      const data = (await response.json()) as {
        teams?: Team[];
        source?: "remote" | "fallback" | "cache";
        diagnostics?: Array<{ name: string; ok: boolean }>;
      };
      if (cancelled) return;
      const officialTeams = teamsWithBuiltInProfilesFromOfficialSchedule();
      const receivedTeams = data.teams || [];
      setItems(receivedTeams.length ? enrichTeamsWithOfficialGroups(receivedTeams, officialTeams) : officialTeams);
      const firstOk = data.diagnostics?.find((item) => item.ok);
      setSourceLabel(
        data.source === "remote" && firstOk
          ? `${firstOk.name} · 远端数据`
          : data.source === "cache"
            ? "PostgreSQL · 持久化快照"
            : "FIFA 官方赛程分组 + 官方名单 · 本地速成档案",
      );
    }

    void loadTeams();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col min-h-svh bg-[#F5F1E8]">
      {/* Masthead */}
      <div className="px-4 py-3 border-b-2 border-[#241A14] bg-[#FAF7F0]">
        <div
          className="text-[10px] font-black tracking-[0.25em] text-[#9E948C] uppercase mb-0.5"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {tr(locale, "球队档案局", "Team Files")}
        </div>
        <h1
          className="text-2xl font-black text-[#241A14] leading-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {tr(locale, "球队速成卡", "Team Cards")}
        </h1>
        <p className="text-xs text-[#9E948C] mt-0.5">
          {tr(locale, "球队档案 · 当前数据源返回", "Team profiles · current source returned")} {items.length} {tr(locale, "支球队", "teams")} · {sourceLabel}
        </p>
      </div>

      {/* Search & filters */}
      <div className="px-4 py-3 border-b border-[#241A14] bg-[#FAF7F0] space-y-2 sticky top-0 z-[10]">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr(locale, "搜索你想装杯的球队/球星...", "Search teams or stars...")}
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
            <p className="text-[#241A14] text-sm font-bold">
              {items.length === 0 ? tr(locale, "暂无球队数据", "No team data") : tr(locale, "没找到匹配的球队", "No matching team")}
            </p>
            <p className="text-[10px] text-[#9E948C] mt-1">
              {items.length === 0 ? tr(locale, "球队数据源接入并返回记录后会自动显示。", "Teams will appear once a data source returns records.") : tr(locale, "换个关键词试试", "Try another keyword.")}
            </p>
          </div>
        ) : (
          grouped.map(([group, teams]) => (
            <section key={group} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#D36E52]" />
                <h2 className="text-xs font-black tracking-wider text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                  {groupLabel(group, locale)}
                </h2>
                <div className="flex-grow border-b border-double border-[#241A14]/30" />
              </div>
              {teams.map((team) => (
                <TeamCard key={team.id} team={team} locale={locale} onClick={() => setSelected(team)} />
              ))}
            </section>
          ))
        )}
        {filtered.length > 0 && (
          <div className="border border-dashed border-[#241A14] p-4 text-center text-xs text-[#9E948C]">
            {tr(locale, "当前展示", "Showing")} {filtered.length} {tr(locale, "支球队。", "teams.")}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selected && (
          <TeamDetailModal
            team={selected}
            locale={locale}
            onClose={() => setSelected(null)}
            onPlayerClick={setSelectedPlayer}
          />
        )}
        {selectedPlayer && (
          <PlayerDetailModal player={selectedPlayer} locale={locale} onClose={() => setSelectedPlayer(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function groupOrder(group: string): number {
  const letter = group.match(/[A-Z]/)?.[0] || "Z";
  return letter.charCodeAt(0);
}

function teamKey(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function enrichTeamsWithOfficialGroups(receivedTeams: Team[], officialTeams: Team[]): Team[] {
  const byName = new Map<string, Team>();
  for (const team of officialTeams) {
    if (team.code) byName.set(teamKey(team.code), team);
    byName.set(teamKey(team.name), team);
    byName.set(teamKey(team.nameEn), team);
  }
  const matchedOfficialIds = new Set<string>();
  const enriched = receivedTeams.map((team) => {
    const official = byName.get(teamKey(team.code || "")) || byName.get(teamKey(team.name)) || byName.get(teamKey(team.nameEn));
    if (!official) return team;
    matchedOfficialIds.add(official.id);
    return mergeTeamProfile(team, official);
  });
  return [
    ...enriched,
    ...officialTeams.filter((team) => !matchedOfficialIds.has(team.id)),
  ];
}

function mergeTeamProfile(team: Team, official: Team): Team {
  return {
    ...team,
    code: team.code || official.code,
    nameEn: team.nameEn || official.nameEn,
    group: team.group || official.group,
    flag: team.flag || official.flag,
    rank: team.rank > 0 ? team.rank : official.rank,
    coach: team.coach || official.coach,
    formation: team.formation || official.formation,
    stars: team.stars.length ? team.stars : official.stars,
    style: team.style || official.style,
    hotLevel: team.hotLevel || official.hotLevel,
    tags: mergeUnique([...team.tags, ...official.tags]),
    talkingPoints: team.talkingPoints.length ? team.talkingPoints : official.talkingPoints,
    groupStandings: team.groupStandings || official.groupStandings,
    starPlayers: team.starPlayers?.length ? team.starPlayers : official.starPlayers,
    roster: team.roster?.length ? team.roster : official.roster,
    roast: team.roast || official.roast,
    source: mergeSourceLabels(team.source, official.source),
  };
}

function mergeUnique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function mergeSourceLabels(...sources: Array<string | undefined>): string {
  return mergeUnique(sources.flatMap((source) => source?.split(" · ") || [])).join(" · ");
}
