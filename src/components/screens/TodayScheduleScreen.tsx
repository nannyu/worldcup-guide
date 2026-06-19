"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { CommentThread } from "@/components/comments/comment-thread";
import { displayMatchEventPlayerName } from "@/lib/player-names";
import {
  allMatches,
  allScheduleDayGroups,
  beijingScheduleUtcDayBounds,
  createMatchSequenceLookup,
  getGroupStandings,
  getMatchSequenceNumber,
  getScheduleDateMeta,
  matchIdentityKey,
  matchTeamPairKey,
  mergeMatchWithOfficialSource,
  relativeBeijingDayLabel,
  type GroupStanding,
  type Match,
  type ScheduleDayGroup,
} from "@/lib/wc-data";
import { dateLabel, groupLabel, isZh, teamLabel, teamName, tr } from "@/lib/i18n/content";

type PageTab = "schedule" | "standings";
type ScheduleSubTab = "current" | "history";
const liveDateKeys = ["yesterday", "today", "tomorrow"] as const;
const finalKickoffAt = new Date(
  allMatches.find((match) => match.round === "决赛")?.kickoffAt || "2026-07-20T03:00:00+08:00",
);
const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

function beijingToday(now = new Date()): string {
  return getScheduleDateMeta(now).today.date;
}

function scheduleDateQueryForBeijingDate(date: string, dateKey: typeof liveDateKeys[number] = "today"): string {
  const bounds = beijingScheduleUtcDayBounds(date);
  return new URLSearchParams({
    dateKey,
    date,
    startUtc: bounds?.startUtc || "",
    endUtc: bounds?.endUtc || "",
  }).toString();
}

function kickoffTime(match: Match): string {
  return match.kickoffBj.split(" ")[1] || match.kickoffBj;
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

function statusText(match: Match, locale: string): string {
  if (match.status === "live") {
    const elapsed = match.updatedAt.match(/·\s*(\d+')/)?.[1];
    return elapsed ? `${tr(locale, "进行中", "Live")} ${elapsed}` : tr(locale, "进行中", "Live");
  }
  if (match.status === "finished") {
    return match.homeScore !== null && match.awayScore !== null
      ? tr(locale, "已完赛", "FT")
      : tr(locale, "已结束", "Finished");
  }
  return tr(locale, "未开赛", "Upcoming");
}

function latestEventText(match: Match, locale: string): string {
  const event = (match.events || []).slice().sort((a, b) => b.minute - a.minute)[0];
  if (!event) return tr(locale, "暂无事件", "No events");
  const label = event.type === "goal"
    ? tr(locale, "进球", "Goal")
    : event.type === "penalty"
      ? tr(locale, "点球", "Penalty")
      : event.type === "og"
        ? tr(locale, "乌龙", "Own goal")
        : event.type === "red"
          ? tr(locale, "红牌", "Red")
          : tr(locale, "黄牌", "Yellow");
  return `${event.minute}' ${label} · ${displayMatchEventPlayerName(match, event, locale)}`;
}

function statValue(match: Match, type: string, side: "home" | "away"): string {
  const group = (match.statistics || []).find((item) => item.team === side);
  const value = group?.stats.find((item) => item.type === type)?.value;
  return value === undefined || value === null ? "—" : String(value);
}

function formationText(match: Match): string {
  const home = match.lineups?.find((item) => item.team === "home")?.formation;
  const away = match.lineups?.find((item) => item.team === "away")?.formation;
  return [home || "—", away || "—"].join(" / ");
}

function hasRichMatchData(match: Match): boolean {
  return Boolean(
    match.events?.length
    || match.lineups?.length
    || match.statistics?.length
    || match.prediction
    || match.oddsImpliedHome
    || match.oddsImpliedDraw
    || match.oddsImpliedAway,
  );
}

function ProbabilityBar({
  values,
  labels,
}: {
  values: [number, number, number];
  labels: [string, string, string];
}) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-3 gap-1 text-[10px] font-bold text-[#5C524C]">
        {values.map((value, index) => (
          <span key={labels[index]} className={index === 1 ? "text-center" : index === 2 ? "text-right" : ""}>
            {labels[index]} {value}%
          </span>
        ))}
      </div>
      <div className="flex h-2 overflow-hidden border border-[#241A14] bg-[#EDE9E0]">
        <span className="bg-[#D36E52]" style={{ width: `${Math.max(0, values[0])}%` }} />
        <span className="bg-[#E4A853]" style={{ width: `${Math.max(0, values[1])}%` }} />
        <span className="bg-[#6A8D73]" style={{ width: `${Math.max(0, values[2])}%` }} />
      </div>
    </div>
  );
}

function mergeScheduleGroups(liveMatches: Match[]): ScheduleDayGroup[] {
  if (liveMatches.length === 0) return allScheduleDayGroups;
  const byId = new Map(liveMatches.map((match) => [match.id, match]));
  const byKey = new Map(liveMatches.map((match) => [matchIdentityKey(match), match]));
  const byPair = new Map(liveMatches.map((match) => [matchTeamPairKey(match), match]));

  return allScheduleDayGroups.map((day) => ({
    ...day,
    matches: day.matches.map((match) =>
      mergeMatchWithOfficialSource(
        match,
        byId.get(match.id) || byKey.get(matchIdentityKey(match)) || byPair.get(matchTeamPairKey(match)),
      )),
  }));
}

function markHistoricalMatch(match: Match): Match {
  return match.status === "upcoming" ? { ...match, status: "finished" } : match;
}

function splitScheduleGroups(groups: ScheduleDayGroup[], now = new Date()) {
  const today = beijingToday(now);
  const currentGroups: ScheduleDayGroup[] = [];
  const historyGroups: ScheduleDayGroup[] = [];

  for (const day of groups) {
    const currentMatches: Match[] = [];
    const historyMatches: Match[] = [];

    for (const match of day.matches) {
      const matchDate = match.kickoffAt?.slice(0, 10) || day.date;
      if (matchDate < today) {
        historyMatches.push(markHistoricalMatch(match));
      } else {
        currentMatches.push(match);
      }
    }

    if (currentMatches.length) currentGroups.push({ ...day, matches: currentMatches });
    if (historyMatches.length) historyGroups.push({ ...day, matches: historyMatches });
  }

  return {
    currentGroups,
    historyGroups: historyGroups.reverse(),
  };
}

function historicalScheduleDates(now = new Date()): string[] {
  const today = beijingToday(now);
  return allScheduleDayGroups
    .filter((day) => day.date < today)
    .map((day) => day.date);
}

function finalCountdownLabel(now: Date, locale: string): string {
  const diff = finalKickoffAt.getTime() - now.getTime();
  if (diff <= 0) return tr(locale, "决赛已开赛", "Final started");

  const days = Math.floor(diff / dayMs);
  if (days >= 1) return isZh(locale) ? `距决赛${days}天` : `Final in ${days}d`;

  const hours = Math.floor(diff / hourMs);
  if (hours >= 1) return isZh(locale) ? `距决赛${hours}小时` : `Final in ${hours}h`;

  const minutes = Math.max(1, Math.ceil(diff / minuteMs));
  return isZh(locale) ? `距决赛${minutes}分` : `Final in ${minutes}m`;
}

function CountdownBadge({ locale }: { locale: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, minuteMs);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <motion.div
      className="border border-[#241A14] bg-[#D36E52] px-2 py-0.5 text-[10px] font-bold tracking-tight text-white"
      style={{ transform: "rotate(-2deg)" }}
      animate={{ rotate: [-2, 1, -2] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      {finalCountdownLabel(now, locale)}
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

function ScheduleSubTabs({
  active,
  onChange,
  currentCount,
  historyCount,
  locale,
}: {
  active: ScheduleSubTab;
  onChange: (tab: ScheduleSubTab) => void;
  currentCount: number;
  historyCount: number;
  locale: string;
}) {
  const tabs: Array<{ key: ScheduleSubTab; label: string; count: number }> = [
    { key: "current", label: tr(locale, "当前赛程", "Current"), count: currentCount },
    { key: "history", label: tr(locale, "历史赛程", "History"), count: historyCount },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {tabs.map((tab) => (
        <motion.button
          key={tab.key}
          whileTap={{ scale: 0.97 }}
          onClick={() => onChange(tab.key)}
          className={`border border-[#241A14] px-3 py-2 text-left transition-colors ${
            active === tab.key
              ? "bg-[#241A14] text-white"
              : "bg-[#FAF7F0] text-[#241A14] hover:bg-white"
          }`}
          style={{ boxShadow: active === tab.key ? "2px 2px 0 0 #D36E52" : "2px 2px 0 0 #241A14" }}
        >
          <span className="block text-xs font-black" style={{ fontFamily: "var(--font-heading)" }}>{tab.label}</span>
          <span className={`mt-0.5 block text-[10px] font-bold ${active === tab.key ? "text-white/70" : "text-[#9E948C]"}`}>
            {tab.count} {tr(locale, "场", "matches")}
          </span>
        </motion.button>
      ))}
    </div>
  );
}

function MatchRow({ match, locale, matchNo }: { match: Match; locale: string; matchNo?: number }) {
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  const prediction = match.prediction;
  const hasOdds = match.oddsImpliedHome > 0 || match.oddsImpliedDraw > 0 || match.oddsImpliedAway > 0;
  const rich = hasRichMatchData(match);
  return (
    <article
      className="border border-[#241A14] bg-[#FAF7F0] px-3 py-2"
      style={{ boxShadow: "2px 2px 0 0 #241A14" }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-[#241A14]">
        <span className="w-12 shrink-0 font-mono text-sm font-black text-[#D36E52]">{kickoffTime(match)}</span>
        <span className="shrink-0 text-[11px] font-bold text-[#9E948C]">{groupRoundLabel(match, locale)}</span>
        <span className={`border border-[#241A14] px-1.5 py-0.5 text-[9px] font-black ${match.status === "live" ? "bg-[#D36E52] text-white" : match.status === "finished" ? "bg-[#241A14] text-white" : "bg-[#EDE9E0] text-[#5C524C]"}`}>
          {statusText(match, locale)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          {teamLabel(match.homeFlag, match.homeTeam, locale)}
        </div>
        <span className={`shrink-0 font-mono text-sm font-black ${hasScore ? "text-[#D36E52]" : "text-[#5C524C]"}`}>
          {hasScore ? `${match.homeScore} : ${match.awayScore}` : ":"}
        </span>
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
      {rich && (
        <div className="mt-2 grid gap-2 border-t border-dashed border-[#241A14]/25 pt-2 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-1 text-[10px] text-[#5C524C]">
            <div className="grid grid-cols-[64px_1fr] gap-2">
              <span className="font-bold text-[#241A14]">{tr(locale, "事件", "Event")}</span>
              <span className="truncate">{latestEventText(match, locale)}</span>
            </div>
            <div className="grid grid-cols-[64px_1fr] gap-2">
              <span className="font-bold text-[#241A14]">{tr(locale, "阵型", "Shape")}</span>
              <span>{formationText(match)}</span>
            </div>
            <div className="grid grid-cols-[64px_1fr] gap-2">
              <span className="font-bold text-[#241A14]">{tr(locale, "射正/控球", "SOT/Poss")}</span>
              <span>{statValue(match, "Shots on Goal", "home")} - {statValue(match, "Shots on Goal", "away")} · {statValue(match, "Ball Possession", "home")} / {statValue(match, "Ball Possession", "away")}</span>
            </div>
          </div>
          <div className="space-y-2">
            {prediction && (
              <ProbabilityBar
                values={[prediction.homePercent, prediction.drawPercent, prediction.awayPercent]}
                labels={[tr(locale, "主", "H"), tr(locale, "平", "D"), tr(locale, "客", "A")]}
              />
            )}
            {hasOdds && (
              <div className="text-[10px] text-[#5C524C]">
                <span className="font-bold text-[#241A14]">{tr(locale, "赔率隐含", "Odds implied")}: </span>
                {match.oddsImpliedHome}% / {match.oddsImpliedDraw}% / {match.oddsImpliedAway}%
                {match.oddsSource ? <span className="text-[#9E948C]"> · {match.oddsSource}</span> : null}
              </div>
            )}
            {prediction?.advice && <div className="line-clamp-2 text-[10px] text-[#9E948C]">{prediction.advice}</div>}
          </div>
        </div>
      )}
      <div className="mt-2 flex justify-end border-t border-dashed border-[#241A14]/25 pt-2">
        <Link href={`/match/${match.id}`} className="text-[11px] font-black text-[#D36E52] hover:underline">
          {tr(locale, "完整赛报 →", "Full report →")}
        </Link>
      </div>
      <CommentThread targetType="match" targetId={match.id} />
    </article>
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

function EmptyScheduleState({ tab, locale }: { tab: ScheduleSubTab; locale: string }) {
  return (
    <div className="border border-[#241A14] bg-[#FAF7F0] p-4 text-sm text-[#5C524C]" style={{ boxShadow: "3px 3px 0 0 #241A14" }}>
      <div className="font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
        {tab === "history" ? tr(locale, "暂无历史赛程", "No historical fixtures") : tr(locale, "暂无当前赛程", "No current fixtures")}
      </div>
      <p className="mt-1 text-xs text-[#9E948C]">
        {tab === "history"
          ? tr(locale, "比赛结束后会自动移入这里。", "Finished matches will move here.")
          : tr(locale, "今天及之后的比赛会显示在这里。", "Today's and upcoming matches appear here.")}
      </p>
    </div>
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
  const [scheduleTab, setScheduleTab] = useState<ScheduleSubTab>("current");
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [sourceLabel, setSourceLabel] = useState("FIFA 官方赛程 · 本地/数据库数据源");
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const displayGroups = useMemo(() => mergeScheduleGroups(liveMatches), [liveMatches]);
  const displayMatches = useMemo(() => displayGroups.flatMap((day) => day.matches), [displayGroups]);
  const { currentGroups, historyGroups } = useMemo(() => splitScheduleGroups(displayGroups), [displayGroups]);
  const currentMatchCount = currentGroups.reduce((sum, day) => sum + day.matches.length, 0);
  const historyMatchCount = historyGroups.reduce((sum, day) => sum + day.matches.length, 0);
  const visibleScheduleGroups = scheduleTab === "history" ? historyGroups : currentGroups;
  const matchSequence = useMemo(() => createMatchSequenceLookup(displayMatches), [displayMatches]);
  const standings = useMemo(() => getGroupStandings(displayMatches), [displayMatches]);
  const totalMatches = displayGroups.reduce((sum, day) => sum + day.matches.length, 0);

  useEffect(() => {
    let cancelled = false;
    async function loadLiveMatches() {
      const now = new Date();
      const scheduleDates = getScheduleDateMeta(now);
      const recentDates = new Set([
        scheduleDates.yesterday.date,
        scheduleDates.today.date,
        scheduleDates.tomorrow.date,
      ]);
      const historyQueries = historicalScheduleDates(now)
        .filter((date) => !recentDates.has(date))
        .map((date) => scheduleDateQueryForBeijingDate(date));
      const responses = await Promise.all(
        [
          ...liveDateKeys.map((dateKey) => scheduleDateQueryForBeijingDate(scheduleDates[dateKey].date, dateKey)),
          ...historyQueries,
        ].map(async (query) => {
          const response = await fetch(`/api/data/matches?${query}`);
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
              <ScheduleSubTabs
                active={scheduleTab}
                onChange={setScheduleTab}
                currentCount={currentMatchCount}
                historyCount={historyMatchCount}
                locale={locale}
              />
              {visibleScheduleGroups.length ? (
                visibleScheduleGroups.map((day) => (
                  <ScheduleDay key={day.date} day={day} locale={locale} matchSequence={matchSequence} />
                ))
              ) : (
                <EmptyScheduleState tab={scheduleTab} locale={locale} />
              )}
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
