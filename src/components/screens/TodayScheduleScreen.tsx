"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  allMatches,
  allScheduleDayGroups,
  createMatchSequenceLookup,
  getCountdownToBj,
  getGroupStandings,
  getMatchSequenceNumber,
  matchIdentityKey,
  mergeMatchWithOfficialSource,
  relativeBeijingDayLabel,
  type GroupStanding,
  type Match,
  type ScheduleDayGroup,
} from "@/lib/wc-data";
import { dateLabel, groupLabel, isZh, teamLabel, teamName, tr } from "@/lib/i18n/content";

type PageTab = "schedule" | "standings";
const liveDateKeys = ["yesterday", "today", "tomorrow"] as const;

function kickoffTime(match: Match): string {
  return match.kickoffBj.split(" ")[1] || match.kickoffBj;
}

function countdownText(input: string, locale: string): string {
  if (isZh(locale)) return input;
  if (input === "已开赛") return "started";
  return input
    .replace(/天/g, "d")
    .replace(/小时/g, "h")
    .replace(/分钟/g, "m");
}

function groupRoundLabel(match: Match, locale: string): string {
  if (!match.group.includes("组")) return match.round;
  const groupMatches = allMatches
    .filter((item) => item.group === match.group)
    .sort((left, right) => left.kickoffBj.localeCompare(right.kickoffBj));
  const index = groupMatches.findIndex((item) => item.id === match.id);
  const roundNo = index >= 0 ? Math.floor(index / 2) + 1 : 1;
  const group = match.group.match(/[A-Z]/)?.[0] || "";
  return isZh(locale)
    ? `${match.group.replace(/\s/g, "")}第${["一", "二", "三"][roundNo - 1] || roundNo}轮`
    : `Group ${group} Matchday ${roundNo}`;
}

function mergeScheduleGroups(liveMatches: Match[]): ScheduleDayGroup[] {
  if (liveMatches.length === 0) return allScheduleDayGroups;
  const byId = new Map(liveMatches.map((match) => [match.id, match]));
  const byKey = new Map(liveMatches.map((match) => [matchIdentityKey(match), match]));

  return allScheduleDayGroups.map((day) => ({
    ...day,
    matches: day.matches.map((match) => mergeMatchWithOfficialSource(match, byId.get(match.id) || byKey.get(matchIdentityKey(match)))),
  }));
}

function CountdownBadge({ locale }: { locale: string }) {
  const [countdown] = useState(getCountdownToBj);
  return (
    <motion.div
      className="border border-[#241A14] bg-[#D36E52] px-2 py-0.5 text-[10px] font-bold tracking-tight text-white"
      style={{ transform: "rotate(-2deg)" }}
      animate={{ rotate: [-2, 1, -2] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      {tr(locale, "距首场", "Opener in")} {countdownText(countdown, locale)}
    </motion.div>
  );
}

function PageTabs({ active, onChange, locale }: { active: PageTab; onChange: (tab: PageTab) => void; locale: string }) {
  const tabs: Array<{ key: PageTab; label: string }> = [
    { key: "schedule", label: tr(locale, "赛程", "Schedule") },
    { key: "standings", label: tr(locale, "积分榜", "Standings") },
  ];

  return (
    <div className="sticky top-0 z-[10] flex items-center justify-between border-b-2 border-[#241A14] bg-[#FAF7F0] px-4 py-2">
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <motion.button
            key={tab.key}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(tab.key)}
            className={`border border-[#241A14] px-3 py-1 text-xs font-bold transition-colors ${
              active === tab.key
                ? "bg-[#241A14] text-white"
                : "bg-[#FAF7F0] text-[#241A14] hover:bg-[#EDE9E0]"
            }`}
          >
            {tab.label}
          </motion.button>
        ))}
      </div>
      <CountdownBadge locale={locale} />
    </div>
  );
}

function MatchRow({ match, locale, matchNo }: { match: Match; locale: string; matchNo?: number }) {
  return (
    <Link
      href={`/match/${match.id}`}
      className="block border border-[#241A14] bg-[#FAF7F0] px-3 py-2 transition-colors hover:bg-white"
      style={{ boxShadow: "2px 2px 0 0 #241A14" }}
    >
      <div className="flex items-center gap-2 text-sm text-[#241A14]">
        <span className="w-12 shrink-0 font-mono text-sm font-black text-[#D36E52]">{kickoffTime(match)}</span>
        <span className="shrink-0 text-[11px] font-bold text-[#9E948C]">{groupRoundLabel(match, locale)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          {teamLabel(match.homeFlag, match.homeTeam, locale)}
        </div>
        <span className="shrink-0 font-mono text-sm font-black text-[#5C524C]">:</span>
        <div className="min-w-0 flex-1 text-right text-sm font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          {teamLabel(match.awayFlag, match.awayTeam, locale)}
        </div>
      </div>
      <div className="mt-1 flex justify-between gap-3 text-[10px] text-[#9E948C]">
        <span className="truncate">{match.venue}</span>
        {matchNo ? (
          <span className="shrink-0">{tr(locale, "第", "Match ")} {matchNo} {tr(locale, "场", "")}</span>
        ) : null}
      </div>
    </Link>
  );
}

function ScheduleDay({ day, locale, matchSequence }: { day: ScheduleDayGroup; locale: string; matchSequence: Map<string, number> }) {
  const relative = relativeBeijingDayLabel(day.date);
  return (
    <section className="space-y-2">
      <div className="-mx-4 border-y border-[#241A14] bg-[#EDE9E0] px-4 py-2">
        <div className="flex items-end justify-between">
          <h2 className="text-sm font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
            {dateLabel(day.date, locale)}{relative ? ` ${tr(locale, relative, relative === "明天" ? "Tomorrow" : relative === "后天" ? "In 2 days" : relative)}` : ""}
          </h2>
          <span className="text-[10px] font-bold text-[#9E948C]">{day.matches.length} {tr(locale, "场", "matches")}</span>
        </div>
      </div>
      <div className="space-y-2">
        {day.matches.map((match) => (
          <MatchRow key={match.id} match={match} locale={locale} matchNo={getMatchSequenceNumber(match, matchSequence)} />
        ))}
      </div>
    </section>
  );
}

const zoneStyle: Record<string, string> = {
  qualify: "bg-[#9CB48A] text-white",
  pending: "bg-[#E4A853] text-[#241A14]",
  outside: "bg-[#EDE9E0] text-[#9E948C]",
};

const zoneText: Record<string, string> = {
  qualify: "出线区",
  pending: "待定区",
  outside: "观察区",
};

function StandingGroup({ group, locale }: { group: GroupStanding; locale: string }) {
  return (
    <section className="border border-[#241A14] bg-[#FAF7F0]" style={{ boxShadow: "3px 3px 0 0 #241A14" }}>
      <div className="flex items-center justify-between border-b-2 border-[#241A14] px-3 py-2">
        <h2 className="text-sm font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          {groupLabel(`${group.group} 组`, locale)}
        </h2>
        <span className="text-[10px] font-bold text-[#9E948C]">{tr(locale, "前二直通 · 第三待定", "Top two qualify · third pending")}</span>
      </div>
      <div className="grid grid-cols-[1fr_26px_52px_52px_40px] border-b border-[#241A14]/30 px-2 py-1 text-center text-[10px] font-bold text-[#9E948C]">
        <span className="text-left">{tr(locale, "球队", "Team")}</span>
        <span>{tr(locale, "场", "P")}</span>
        <span>{tr(locale, "胜/平/负", "W/D/L")}</span>
        <span>{tr(locale, "进/失", "F/A")}</span>
        <span>{tr(locale, "分", "Pts")}</span>
      </div>
      {group.rows.map((row) => (
        <div key={row.team} className="grid grid-cols-[1fr_26px_52px_52px_40px] items-center border-b border-dashed border-[#241A14]/20 px-2 py-2 text-center text-xs last:border-b-0">
          <div className="min-w-0 text-left">
            <div className="truncate font-bold text-[#241A14]">{row.flag}{teamName(row.team, locale)}</div>
            <span className={`mt-0.5 inline-block border border-[#241A14] px-1 py-0.5 text-[9px] font-bold ${zoneStyle[row.zone]}`}>
              {tr(locale, zoneText[row.zone], row.zone === "qualify" ? "Qualify" : row.zone === "pending" ? "Pending" : "Watch")}
            </span>
          </div>
          <span className="font-mono text-[#5C524C]">{row.played}</span>
          <span className="font-mono text-[#5C524C]">{row.won}/{row.drawn}/{row.lost}</span>
          <span className="font-mono text-[#5C524C]">{row.goalsFor}/{row.goalsAgainst}</span>
          <span className="font-mono font-black text-[#241A14]">{row.points}</span>
        </div>
      ))}
    </section>
  );
}

export function TodayScheduleScreen() {
  const [activeTab, setActiveTab] = useState<PageTab>("schedule");
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [sourceLabel, setSourceLabel] = useState("FIFA 官方赛程 · 本地/数据库数据源");
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const displayGroups = useMemo(() => mergeScheduleGroups(liveMatches), [liveMatches]);
  const displayMatches = useMemo(() => displayGroups.flatMap((day) => day.matches), [displayGroups]);
  const matchSequence = useMemo(() => createMatchSequenceLookup(displayMatches), [displayMatches]);
  const standings = useMemo(() => getGroupStandings(displayMatches), [displayMatches]);
  const totalMatches = displayGroups.reduce((sum, day) => sum + day.matches.length, 0);

  useEffect(() => {
    let cancelled = false;
    async function loadLiveMatches() {
      const responses = await Promise.all(
        liveDateKeys.map(async (dateKey) => {
          const response = await fetch(`/api/data/matches?dateKey=${dateKey}`);
          if (!response.ok) return { matches: [] as Match[], source: undefined as "remote" | "fallback" | "cache" | undefined, diagnostics: [] as Array<{ name: string; ok: boolean }> };
          return (await response.json()) as {
            matches?: Match[];
            source?: "remote" | "fallback" | "cache";
            diagnostics?: Array<{ name: string; ok: boolean }>;
          };
        }),
      );
      if (cancelled) return;
      setLiveMatches(responses.flatMap((result) => result.matches || []));
      const liveSource = responses.find((result) => result.source === "remote" || result.source === "cache");
      const firstOk = liveSource?.diagnostics?.find((item) => item.ok);
      if (liveSource?.source === "remote" && firstOk) setSourceLabel(`${firstOk.name} · 远端数据`);
      else if (liveSource?.source === "cache") setSourceLabel("PostgreSQL · 持久化快照");
      else setSourceLabel("FIFA 官方赛程 · 本地/数据库数据源");
    }

    void loadLiveMatches();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-svh flex-col bg-[#F5F1E8]">
      <div className="border-b-2 border-[#241A14] bg-[#FAF7F0] px-4 py-3">
        <div className="mb-0.5 text-[10px] font-black uppercase tracking-[0.25em] text-[#9E948C]" style={{ fontFamily: "var(--font-heading)" }}>
          2026 FIFA World Cup · {tr(locale, "北京时间", "Beijing Time")}
        </div>
        <h1 className="text-2xl font-black leading-tight text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          {tr(locale, "赛程", "Schedule")}
        </h1>
        <p className="mt-0.5 text-xs text-[#9E948C]">
          {tr(locale, `全部 ${totalMatches} 场官方赛程 · 当前数据：${sourceLabel}`, `${totalMatches} official fixtures · current data: ${sourceLabel}`)}
        </p>
      </div>

      <PageTabs active={activeTab} onChange={setActiveTab} locale={locale} />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence mode="wait">
          {activeTab === "schedule" ? (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              {displayGroups.map((day) => (
                <ScheduleDay key={day.date} day={day} locale={locale} matchSequence={matchSequence} />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="standings"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {standings.map((group) => (
                <StandingGroup key={group.group} group={group} locale={locale} />
              ))}
              <div className="border border-[#241A14] bg-[#EDE9E0] p-3 text-xs leading-relaxed text-[#5C524C]">
                <strong className="text-[#241A14]">{tr(locale, "数据说明：", "Data note:")}</strong>
                {tr(locale, "积分按已接入赛果计算；赛前全部为 0。", "Standings are calculated from connected results; all teams start at 0 before kickoff.")}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
