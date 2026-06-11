"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Brackets, CalendarDays, ChevronRight, Info, Table2, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  allMatches,
  createMatchSequenceLookup,
  getGroupStandings,
  getMatchSequenceNumber,
  matchIdentityKey,
  mergeMatchWithOfficialSource,
  type GroupStanding,
  type Match,
  type RadarMatch,
} from "@/lib/wc-data";
import { groupLabel, roundLabel, teamName, tr } from "@/lib/i18n/content";

type LocalizedText = {
  zh: string;
  en: string;
};

type TabKey = "games" | "props" | "groups" | "bracket";
type GameDetailTabKey = "markets" | "halftime" | "corners" | "goals" | "assists" | "shots";
type GameInfoTabKey = "rules" | "background";
type DataSourceMode = "remote" | "fallback" | "cache";

type Outcome = {
  label: LocalizedText;
  value: string;
  tone?: "primary" | "neutral" | "success";
};

type MatchMarket = {
  title: LocalizedText;
  outcomes: Outcome[];
};

type GameMatch = {
  id: string;
  kickoffBj: string;
  volume?: string;
  volumeUsd?: number;
  homeScore: number | null;
  awayScore: number | null;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  homeFlag: string;
  awayFlag: string;
  sourceMatch: Match;
  radarMatch?: RadarMatch;
  markets: MatchMarket[];
};

type DisplayMatchDay = {
  key: string;
  label: string;
  matches: GameMatch[];
};

type PropMarket = {
  id: string;
  title: LocalizedText;
  volume: string;
  icon: string;
  choices: Array<{
    label: LocalizedText;
    probability: number;
    yes: string;
    no: string;
  }>;
};

type BracketRound = {
  title: LocalizedText;
  matches: Match[];
};

const beijingTimeZone = "Asia/Shanghai";
const dateKeys = ["yesterday", "today", "tomorrow"] as const;

const tabDefinitions: Array<{ key: TabKey; label: LocalizedText; Icon: LucideIcon }> = [
  { key: "games", label: { zh: "比赛", en: "Games" }, Icon: CalendarDays },
  { key: "props", label: { zh: "玩法", en: "Props" }, Icon: Trophy },
  { key: "groups", label: { zh: "Groups", en: "Groups" }, Icon: Table2 },
  { key: "bracket", label: { zh: "对阵图", en: "Bracket" }, Icon: Brackets },
];

const gameDetailTabs: Array<{ key: GameDetailTabKey; label: LocalizedText }> = [
  { key: "markets", label: { zh: "比赛盘口", en: "Game lines" } },
  { key: "halftime", label: { zh: "半场", en: "Halftime" } },
  { key: "corners", label: { zh: "角球", en: "Corners" } },
  { key: "goals", label: { zh: "进球", en: "Goals" } },
  { key: "assists", label: { zh: "助攻", en: "Assists" } },
  { key: "shots", label: { zh: "射门", en: "Shots" } },
];

const gameInfoTabs: Array<{ key: GameInfoTabKey; label: LocalizedText }> = [
  { key: "rules", label: { zh: "规则", en: "Rules" } },
  { key: "background", label: { zh: "盘口背景", en: "Market background" } },
];

function localize(locale: string, text: LocalizedText): string {
  return tr(locale, text.zh, text.en);
}

function localeForIntl(locale: string) {
  return locale.startsWith("zh") ? "zh-CN" : "en-US";
}

function formatBrowserDateLabel(locale: string) {
  return new Intl.DateTimeFormat(localeForIntl(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function useBrowserDateLabel(locale: string) {
  const [dateLabel, setDateLabel] = useState(() => formatBrowserDateLabel(locale));

  useEffect(() => {
    const updateDateLabel = () => setDateLabel(formatBrowserDateLabel(locale));
    updateDateLabel();
    const interval = window.setInterval(updateDateLabel, 60_000);
    return () => window.clearInterval(interval);
  }, [locale]);

  return dateLabel;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value || "",
    month: parts.find((part) => part.type === "month")?.value || "",
    day: parts.find((part) => part.type === "day")?.value || "",
    hour: parts.find((part) => part.type === "hour")?.value || "",
    minute: parts.find((part) => part.type === "minute")?.value || "",
  };
}

function weekdayZh(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone, weekday: "short" }).format(date);
}

function kickoffDate(match: Match | GameMatch): Date | null {
  const source = "sourceMatch" in match ? match.sourceMatch : match;
  if (source.kickoffAt) {
    const parsed = new Date(source.kickoffAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const raw = match.kickoffBj;
  const matchDate = raw.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!matchDate) return null;
  const [, month, day, hour, minute] = matchDate;
  const parsed = new Date(`2026-${month}-${day}T${hour}:${minute}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLocalDayLabel(date: Date, timeZone: string, locale: string) {
  const parts = zonedParts(date, timeZone);
  if (locale.startsWith("zh")) {
    return `${Number(parts.month)}月${Number(parts.day)}日 ${weekdayZh(date, timeZone)}`;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatKickoff(match: GameMatch, timeZone: string, locale: string) {
  const kickoff = kickoffDate(match);
  if (!kickoff) {
    return {
      time: match.kickoffBj || tr(locale, "时间待接入", "Time pending"),
      zone: timeZone,
      full: `${match.kickoffBj || tr(locale, "时间待接入", "Time pending")} · ${timeZone}`,
    };
  }

  const intlLocale = localeForIntl(locale);
  const localParts = zonedParts(kickoff, timeZone);
  const time = locale.startsWith("zh")
    ? `${Number(localParts.month)}月${Number(localParts.day)}日 ${Number(localParts.hour)}:${localParts.minute}`
    : new Intl.DateTimeFormat(intlLocale, {
      timeZone,
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(kickoff);
  const zoneName =
    new Intl.DateTimeFormat(intlLocale, {
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(kickoff)
      .find((part) => part.type === "timeZoneName")?.value || timeZone;

  return {
    time,
    zone: `${timeZone} · ${zoneName}`,
    full: `${time} · ${timeZone} ${zoneName}`,
  };
}

function canonicalName(input: string | undefined) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function teamCode(name: string, code?: string) {
  if (code) return code;
  const english = teamName(name, "en-US");
  const letters = english.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase();
  return letters || "TBD";
}

function mergeLiveMatches(liveMatches: Match[]) {
  const byId = new Map<string, Match[]>();
  const byKey = new Map<string, Match[]>();

  for (const match of liveMatches) {
    byId.set(match.id, [...(byId.get(match.id) || []), match]);
    const key = matchIdentityKey(match);
    byKey.set(key, [...(byKey.get(key) || []), match]);
  }

  const usedIds = new Set<string>();
  const usedKeys = new Set<string>();

  const markUsed = (matches: Match[]) => {
    for (const match of matches) {
      usedIds.add(match.id);
      usedKeys.add(matchIdentityKey(match));
    }
  };

  const merged = allMatches.map((base) => {
    const exactMatches = byId.get(base.id) || [];
    const identityMatches = byKey.get(matchIdentityKey(base)) || [];
    const live = exactMatches[0] || identityMatches[0];
    if (!live) return base;
    markUsed([...exactMatches, ...identityMatches]);
    return mergeMatchWithOfficialSource(base, live);
  });

  const mergedKeys = new Set(merged.map(matchIdentityKey));
  for (const match of liveMatches) {
    const key = matchIdentityKey(match);
    if (usedIds.has(match.id) || usedKeys.has(key) || mergedKeys.has(key)) continue;
    merged.push(match);
    usedIds.add(match.id);
    usedKeys.add(key);
    mergedKeys.add(key);
  }

  return merged;
}

function findRadarForMatch(match: Match, radarMatches: RadarMatch[]) {
  const home = canonicalName(match.homeTeam);
  const away = canonicalName(match.awayTeam);
  return radarMatches.find((item) => {
    const fields = [item.homeTeam, item.awayTeam, item.title, item.marketLabel].map(canonicalName);
    return fields.some((field) => field.includes(home)) && fields.some((field) => field.includes(away));
  });
}

function probabilityPrice(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}¢`;
}

function moneylineOutcomes(match: Match): Outcome[] {
  const home = match.homeWinProb || match.oddsImpliedHome;
  const draw = match.drawProb || match.oddsImpliedDraw;
  const away = match.awayWinProb || match.oddsImpliedAway;
  if (![home, draw, away].some((value) => value > 0)) return [];

  return [
    {
      label: { zh: `${teamCode(match.homeTeam, match.homeCode)} ${probabilityPrice(home)}`, en: `${teamCode(match.homeTeam, match.homeCode)} ${probabilityPrice(home)}` },
      value: `${teamCode(match.homeTeam, match.homeCode)} ${probabilityPrice(home)}`,
      tone: "primary",
    },
    {
      label: { zh: `DRAW ${probabilityPrice(draw)}`, en: `DRAW ${probabilityPrice(draw)}` },
      value: `DRAW ${probabilityPrice(draw)}`,
      tone: "neutral",
    },
    {
      label: { zh: `${teamCode(match.awayTeam, match.awayCode)} ${probabilityPrice(away)}`, en: `${teamCode(match.awayTeam, match.awayCode)} ${probabilityPrice(away)}` },
      value: `${teamCode(match.awayTeam, match.awayCode)} ${probabilityPrice(away)}`,
      tone: "success",
    },
  ];
}

function marketsFromMatch(match: Match): MatchMarket[] {
  return [
    { title: { zh: "胜负线", en: "Moneyline" }, outcomes: moneylineOutcomes(match) },
    { title: { zh: "让分", en: "Spread" }, outcomes: [] },
    { title: { zh: "总分", en: "Total" }, outcomes: [] },
  ];
}

function toGameMatch(match: Match, radarMatches: RadarMatch[]): GameMatch {
  const radarMatch = findRadarForMatch(match, radarMatches);
  return {
    id: match.id,
    kickoffBj: match.kickoffBj,
    volume: radarMatch?.volume,
    volumeUsd: radarMatch?.volumeUsd,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    home: match.homeTeam,
    away: match.awayTeam,
    homeCode: teamCode(match.homeTeam, match.homeCode),
    awayCode: teamCode(match.awayTeam, match.awayCode),
    homeFlag: match.homeFlag,
    awayFlag: match.awayFlag,
    sourceMatch: match,
    radarMatch,
    markets: marketsFromMatch(match),
  };
}

function groupGameMatches(matches: Match[], radarMatches: RadarMatch[], locale: string): DisplayMatchDay[] {
  const grouped = new Map<string, DisplayMatchDay & { firstKickoff: number }>();

  for (const match of matches) {
    const kickoff = kickoffDate(match);
    if (!kickoff) continue;
    const parts = zonedParts(kickoff, beijingTimeZone);
    const key = `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}`;
    const gameMatch = toGameMatch(match, radarMatches);
    const existing = grouped.get(key);
    if (existing) {
      existing.matches.push(gameMatch);
      existing.firstKickoff = Math.min(existing.firstKickoff, kickoff.getTime());
    } else {
      grouped.set(key, {
        key,
        label: formatLocalDayLabel(kickoff, beijingTimeZone, locale),
        matches: [gameMatch],
        firstKickoff: kickoff.getTime(),
      });
    }
  }

  return Array.from(grouped.values())
    .sort((left, right) => left.firstKickoff - right.firstKickoff)
    .map((day) => ({
      key: day.key,
      label: day.label,
      matches: day.matches.sort((left, right) => {
        const leftDate = kickoffDate(left)?.getTime() || 0;
        const rightDate = kickoffDate(right)?.getTime() || 0;
        return leftDate - rightDate;
      }),
    }));
}

function bracketRoundsFromMatches(matches: Match[]): BracketRound[] {
  const groups = new Map<string, Match[]>();
  for (const match of matches) {
    if (match.group.includes("组")) continue;
    groups.set(match.round, [...(groups.get(match.round) || []), match]);
  }

  return Array.from(groups.entries())
    .map(([round, roundMatches]) => ({
      title: { zh: round, en: roundLabel(round, "en-US") },
      matches: roundMatches.sort((left, right) => (kickoffDate(left)?.getTime() || 0) - (kickoffDate(right)?.getTime() || 0)),
    }))
    .sort((left, right) => {
      const leftTime = kickoffDate(left.matches[0])?.getTime() || 0;
      const rightTime = kickoffDate(right.matches[0])?.getTime() || 0;
      return leftTime - rightTime;
    });
}

function liveMarketFromRadar(match: RadarMatch): PropMarket {
  const title = match.title || `${match.homeTeam} vs ${match.awayTeam}`;
  return {
    id: match.id,
    title: { zh: title, en: title },
    volume: match.volume || (typeof match.volumeUsd === "number" ? `$${Math.round(match.volumeUsd).toLocaleString()}` : "Polymarket"),
    icon: "PM",
    choices: [
      {
        label: { zh: match.homeTeam, en: match.homeTeam },
        probability: match.homeMarketProb,
        yes: `${match.homeMarketProb}%`,
        no: `${Math.max(0, 100 - match.homeMarketProb)}%`,
      },
      {
        label: { zh: match.awayTeam, en: match.awayTeam },
        probability: match.awayMarketProb,
        yes: `${match.awayMarketProb}%`,
        no: `${Math.max(0, 100 - match.awayMarketProb)}%`,
      },
    ],
  };
}

function volumeValue(match: RadarMatch): number {
  if (typeof match.volumeUsd === "number" && Number.isFinite(match.volumeUsd)) return match.volumeUsd;
  const raw = String(match.volume || "").trim().toLowerCase().replace(/[$,\s]/g, "");
  const matchValue = raw.match(/^(\d+(?:\.\d+)?)([kmb])?$/);
  if (!matchValue) return 0;
  const value = Number(matchValue[1]);
  const multiplier = matchValue[2] === "b" ? 1_000_000_000 : matchValue[2] === "m" ? 1_000_000 : matchValue[2] === "k" ? 1_000 : 1;
  return value * multiplier;
}

function isWorldCupRadarMatch(match: RadarMatch): boolean {
  const text = [match.title, match.marketLabel, match.homeTeam, match.awayTeam].filter(Boolean).join(" ").toLowerCase();
  return ["world cup", "世界杯", "fifa"].some((keyword) => text.includes(keyword));
}

function sourceLabel(source: DataSourceMode | undefined, diagnostics: Array<{ name: string; ok: boolean }> | undefined, emptyLabel: string) {
  const firstOk = diagnostics?.find((item) => item.ok);
  if (source === "remote" && firstOk) return `${firstOk.name} · 远端数据`;
  if (source === "cache") return "PostgreSQL · 持久化快照";
  return emptyLabel;
}

export function RadarEyeScreen() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [activeTab, setActiveTab] = useState<TabKey>("games");
  const [radarItems, setRadarItems] = useState<RadarMatch[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [radarSourceLabel, setRadarSourceLabel] = useState("预测市场数据待接入");
  const [matchSourceLabel, setMatchSourceLabel] = useState("FIFA 官方赛程 · 本地/数据库数据源");
  const browserDateLabel = useBrowserDateLabel(locale);

  const sortedRadarItems = useMemo(
    () =>
      radarItems.slice().sort((left, right) =>
        volumeValue(right) - volumeValue(left)
        || Math.abs(right.homeMarketProb - right.homeOddsProb) - Math.abs(left.homeMarketProb - left.homeOddsProb),
      ),
    [radarItems],
  );

  const mergedMatches = useMemo(() => mergeLiveMatches(liveMatches), [liveMatches]);
  const displayMatchDays = useMemo(
    () => groupGameMatches(mergedMatches, sortedRadarItems, locale),
    [mergedMatches, sortedRadarItems, locale],
  );
  const propMarkets = useMemo(() => sortedRadarItems.slice(0, 12).map(liveMarketFromRadar), [sortedRadarItems]);
  const standings = useMemo(() => getGroupStandings(mergedMatches), [mergedMatches]);
  const bracketRounds = useMemo(() => bracketRoundsFromMatches(mergedMatches), [mergedMatches]);
  const matchSequence = useMemo(() => createMatchSequenceLookup(mergedMatches), [mergedMatches]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [radarResponse, matchResponses] = await Promise.all([
          fetch("/api/data/radar"),
          Promise.all(
            dateKeys.map(async (dateKey) => {
              const response = await fetch(`/api/data/matches?dateKey=${dateKey}`);
              if (!response.ok) return { matches: [] as Match[], source: undefined as DataSourceMode | undefined, diagnostics: [] };
              return (await response.json()) as {
                matches?: Match[];
                source?: DataSourceMode;
                diagnostics?: Array<{ name: string; ok: boolean }>;
              };
            }),
          ),
        ]);

        if (cancelled) return;

        if (radarResponse.ok) {
          const data = (await radarResponse.json()) as {
            radarMatches?: RadarMatch[];
            source?: DataSourceMode;
            diagnostics?: Array<{ name: string; ok: boolean }>;
          };
          const worldCupMatches = (data.radarMatches || []).filter(isWorldCupRadarMatch);
          setRadarItems(worldCupMatches);
          setRadarSourceLabel(sourceLabel(data.source, data.diagnostics, "预测市场数据待接入"));
        }

        const matches = matchResponses.flatMap((item) => item.matches || []);
        setLiveMatches(matches);
        const firstUsefulSource = matchResponses.find((item) => item.source === "remote" || item.source === "cache");
        setMatchSourceLabel(sourceLabel(firstUsefulSource?.source, firstUsefulSource?.diagnostics, "FIFA 官方赛程 · 本地/数据库数据源"));
      } catch {
        if (!cancelled) {
          setRadarSourceLabel("预测市场数据待接入");
          setMatchSourceLabel("FIFA 官方赛程 · 本地/数据库数据源");
        }
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-svh flex-col bg-[#F5F1E8]">
      <header className="border-b-2 border-[#241A14] bg-[#FAF7F0] px-4 py-4 md:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#9E948C]" style={{ fontFamily: "var(--font-heading)" }}>
                {tr(locale, "2026 世界杯", "2026 World Cup")}
              </div>
              <h1 className="mt-1 text-2xl font-black leading-tight text-[#241A14] md:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
                {tr(locale, "盘口", "Odds")}
              </h1>
            </div>
            <div className="border border-[#241A14] bg-[#EDE9E0] px-3 py-2 text-right">
              <p className="text-xs font-black text-[#241A14]">{browserDateLabel}</p>
            </div>
          </div>

          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[#5C524C]">
            {tr(
              locale,
              `比赛结构来自赛程/比分源；盘口、交易量和玩法只展示已接入来源返回的数据。当前赛程：${matchSourceLabel}；市场：${radarSourceLabel}。`,
              `Fixtures come from schedule/score sources; prices, volume, and props are shown only when connected sources return them. Fixtures: ${matchSourceLabel}; markets: ${radarSourceLabel}.`,
            )}
          </p>

          <div className="mt-4 overflow-x-auto">
            <div className="inline-flex min-w-full border border-[#241A14] bg-[#F5F1E8] p-1 sm:min-w-0">
              {tabDefinitions.map(({ key, label, Icon }) => {
                const isActive = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 border px-3 text-xs font-black transition-colors sm:min-w-28 ${
                      isActive
                        ? "border-[#241A14] bg-[#D36E52] text-white"
                        : "border-transparent text-[#5C524C] hover:border-[#241A14]/30 hover:bg-[#EDE9E0]"
                    }`}
                  >
                    <Icon className="size-4" strokeWidth={2.4} />
                    {localize(locale, label)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-6xl">
          {activeTab === "games" && <GamesTab locale={locale} days={displayMatchDays} sourceLabel={matchSourceLabel} />}
          {activeTab === "props" && <PropsTab locale={locale} markets={propMarkets} sourceLabel={radarSourceLabel} />}
          {activeTab === "groups" && <GroupsTab locale={locale} standings={standings} />}
          {activeTab === "bracket" && <BracketTab locale={locale} rounds={bracketRounds} matchSequence={matchSequence} />}
        </div>
      </main>
    </div>
  );
}

function GamesTab({ locale, days, sourceLabel }: { locale: string; days: DisplayMatchDay[]; sourceLabel: string }) {
  return (
    <div className="space-y-4">
      <SectionLead
        locale={locale}
        label={{ zh: "比赛", en: "Games" }}
        title={{ zh: "按日期展开比赛盘口", en: "Game markets by date" }}
        copy={{
          zh: `赛程和比分来自数据源：${sourceLabel}。未接入的盘口列显示待接入，不使用固定价格。`,
          en: `Fixtures and scores come from data sources: ${sourceLabel}. Missing market columns show pending instead of fixed prices.`,
        }}
      />

      {days.map((day) => (
        <section key={day.key} className="border-2 border-[#241A14] bg-[#FAF7F0]">
          <div className="flex items-center gap-2 border-b-2 border-[#241A14] bg-[#EDE9E0] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#241A14]">
            <CalendarDays className="size-4 text-[#D36E52]" strokeWidth={2.4} />
            {day.label}
          </div>

          <div className="divide-y divide-[#241A14]/25">
            {day.matches.map((match, index) => (
              <CompactGameCard key={match.id} match={match} locale={locale} index={index} timeZone={beijingTimeZone} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MarketColumnHeaderRow({ locale }: { locale: string }) {
  return (
    <div className="grid grid-cols-[minmax(11rem,1.25fr)_repeat(3,minmax(0,0.75fr))] gap-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-[#9E948C] md:grid-cols-[minmax(14rem,1.35fr)_repeat(3,minmax(0,0.8fr))] md:gap-2 md:text-[10px] lg:grid-cols-[360px_repeat(3,minmax(0,1fr))] lg:gap-3 lg:tracking-[0.16em]">
      <span aria-hidden="true" />
      <span className="text-center">{tr(locale, "胜负线", "Moneyline")}</span>
      <span className="text-center">{tr(locale, "让分", "Spread")}</span>
      <span className="text-center">{tr(locale, "总分", "Total")}</span>
    </div>
  );
}

function CompactGameCard({
  match,
  locale,
  index,
  timeZone,
}: {
  match: GameMatch;
  locale: string;
  index: number;
  timeZone: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detailTab, setDetailTab] = useState<GameDetailTabKey>("markets");
  const [infoTab, setInfoTab] = useState<GameInfoTabKey>("rules");
  const kickoff = formatKickoff(match, timeZone, locale);
  const volumeLabel = match.volume || tr(locale, "交易量待接入", "Volume pending");

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className="bg-[#FAF7F0]"
    >
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black text-[#9E948C]">
            <span className="border border-[#241A14] bg-[#F5F1E8] px-2 py-1 text-xs text-[#241A14]">{kickoff.time}</span>
            <span className="uppercase tracking-[0.12em]">{kickoff.zone}</span>
            <span className="text-xs">{volumeLabel} {match.volume ? tr(locale, "交易量", "Volume") : ""}</span>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className={`inline-flex min-h-8 items-center gap-1.5 border border-[#241A14] px-2.5 text-[11px] font-black transition-colors ${
              expanded ? "bg-[#D36E52] text-white" : "bg-[#EDE9E0] text-[#241A14] hover:bg-[#D36E52] hover:text-white"
            }`}
            aria-expanded={expanded}
          >
            {tr(locale, "比赛视图", "Match view")}
            <ChevronRight className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        </div>

        <MarketColumnHeaderRow locale={locale} />

        <div className="grid grid-cols-[minmax(11rem,1.25fr)_repeat(3,minmax(0,0.75fr))] items-stretch gap-1.5 md:grid-cols-[minmax(14rem,1.35fr)_repeat(3,minmax(0,0.8fr))] md:gap-2 lg:grid-cols-[360px_repeat(3,minmax(0,1fr))] lg:gap-3">
          <div className="self-center space-y-1.5">
            <TeamScoreLine
              flag={match.homeFlag}
              name={teamName(match.home, locale)}
              code={match.homeCode}
              score={`${match.homeScore ?? 0}-${match.awayScore ?? 0}`}
            />
            <TeamScoreLine
              flag={match.awayFlag}
              name={teamName(match.away, locale)}
              code={match.awayCode}
              score={`${match.awayScore ?? 0}-${match.homeScore ?? 0}`}
            />
          </div>

          {match.markets.map((market) => (
            <CompactMarketColumn key={market.title.en} locale={locale} market={market} />
          ))}
        </div>
      </div>

      {expanded && (
        <GameDetailView
          match={match}
          locale={locale}
          detailTab={detailTab}
          onDetailTabChange={setDetailTab}
          infoTab={infoTab}
          onInfoTabChange={setInfoTab}
          kickoffLabel={kickoff.full}
        />
      )}
    </motion.article>
  );
}

function TeamScoreLine({ flag, name, code, score }: { flag: string; name: string; code: string; score: string }) {
  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-1.5 text-left text-[#241A14] sm:grid-cols-[2rem_minmax(0,1fr)] sm:gap-2">
      <span className="grid size-6 place-items-center border border-[#241A14] bg-[#F5F1E8] text-xs sm:size-8 sm:text-base">{flag}</span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs font-black leading-tight md:text-base">{name}</span>
        <span className="shrink-0 text-[10px] font-black text-[#9E948C] sm:text-sm">{score}</span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.12em] text-[#9E948C] sm:tracking-[0.16em]">{code}</span>
      </span>
    </div>
  );
}

function CompactMarketColumn({ locale, market }: { locale: string; market: MatchMarket }) {
  if (market.outcomes.length === 0) {
    return (
      <div className="min-w-0 self-stretch">
        <div className="flex h-full min-h-8 items-center justify-center border border-dashed border-[#241A14]/50 bg-[#EDE9E0]/60 px-1.5 py-1 text-center text-[9px] font-black text-[#9E948C] sm:text-[10px] lg:min-h-10">
          {tr(locale, "待接入", "Pending")}
        </div>
      </div>
    );
  }

  const isTwoOutcomeMarket = market.outcomes.length === 2;
  return (
    <div className="min-w-0 self-stretch">
      <div className={isTwoOutcomeMarket ? "flex h-full flex-col gap-1" : "grid h-full grid-rows-3 gap-1"}>
        {market.outcomes.map((outcome) => (
          <CompactPriceButton key={outcome.value} outcome={outcome} locale={locale} fill={isTwoOutcomeMarket} />
        ))}
      </div>
    </div>
  );
}

function CompactPriceButton({ outcome, locale, fill = false }: { outcome: Outcome; locale: string; fill?: boolean }) {
  const displayValue = localize(locale, outcome.label);
  const match = displayValue.match(/^(.*)\s+(\S+(?:¢|%))$/);
  const label = match?.[1] || displayValue;
  const price = match?.[2];
  const toneClass =
    outcome.tone === "success"
      ? "bg-[#9CB48A]/20 hover:bg-[#9CB48A]/35"
      : outcome.tone === "neutral"
        ? "bg-[#EDE9E0] hover:bg-[#E4A853]/25"
        : "bg-[#D36E52]/12 hover:bg-[#D36E52]/22";

  return (
    <button
      type="button"
      className={`flex min-h-8 min-w-0 flex-col justify-center border border-[#241A14] px-1.5 py-1 text-left text-[9px] font-black leading-tight text-[#241A14] transition-colors sm:text-[10px] lg:min-h-10 lg:flex-row lg:items-center lg:justify-center lg:gap-1 lg:px-2 lg:text-center lg:text-sm ${toneClass} ${fill ? "flex-1" : ""}`}
    >
      {price ? (
        <>
          <span className="min-w-0 truncate">{label}</span>
          <span className="shrink-0">{price}</span>
        </>
      ) : (
        <span className="min-w-0 truncate">{displayValue}</span>
      )}
    </button>
  );
}

function GameDetailView({
  match,
  locale,
  detailTab,
  onDetailTabChange,
  infoTab,
  onInfoTabChange,
  kickoffLabel,
}: {
  match: GameMatch;
  locale: string;
  detailTab: GameDetailTabKey;
  onDetailTabChange: (tab: GameDetailTabKey) => void;
  infoTab: GameInfoTabKey;
  onInfoTabChange: (tab: GameInfoTabKey) => void;
  kickoffLabel: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="overflow-hidden border-t border-[#241A14]/25 bg-[#F5F1E8]"
    >
      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="border border-[#241A14] bg-[#FAF7F0] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                {teamName(match.home, locale)} vs {teamName(match.away, locale)}
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9E948C]">
                {tr(locale, "概率走势 · 来源数据", "Probability trend · source data")}
              </p>
            </div>
            <span className="border border-[#241A14] bg-[#EDE9E0] px-2 py-1 text-[10px] font-black text-[#241A14]">
              {match.volume || tr(locale, "交易量待接入", "Volume pending")}
            </span>
          </div>

          <ProbabilityTrendChart match={match} locale={locale} />

          <div className="mt-3 overflow-x-auto">
            <div className="inline-flex min-w-full border border-[#241A14] bg-[#F5F1E8] p-1 sm:min-w-0">
              {gameDetailTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onDetailTabChange(tab.key)}
                  className={`min-h-8 flex-1 whitespace-nowrap border px-2 text-[10px] font-black transition-colors ${
                    detailTab === tab.key
                      ? "border-[#241A14] bg-[#D36E52] text-white"
                      : "border-transparent text-[#5C524C] hover:bg-[#EDE9E0]"
                  }`}
                >
                  {localize(locale, tab.label)}
                </button>
              ))}
            </div>
          </div>

          <MarketDetailPanel match={match} locale={locale} activeTab={detailTab} />
        </div>

        <div className="border border-[#241A14] bg-[#FAF7F0] p-3">
          <div className="grid grid-cols-2 border border-[#241A14] bg-[#F5F1E8] p-1">
            {gameInfoTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onInfoTabChange(tab.key)}
                className={`min-h-8 border px-2 text-[10px] font-black transition-colors ${
                  infoTab === tab.key
                    ? "border-[#241A14] bg-[#D36E52] text-white"
                    : "border-transparent text-[#5C524C] hover:bg-[#EDE9E0]"
                }`}
              >
                {localize(locale, tab.label)}
              </button>
            ))}
          </div>
          <InfoPanel match={match} locale={locale} activeTab={infoTab} kickoffLabel={kickoffLabel} />
        </div>
      </div>
    </motion.div>
  );
}

function ProbabilityTrendChart({ match, locale }: { match: GameMatch; locale: string }) {
  const points = (match.radarMatch?.history || []).filter((point) =>
    Number.isFinite(point.market) && Number.isFinite(point.odds),
  );

  if (points.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center border border-dashed border-[#241A14]/50 bg-[#F5F1E8] px-4 text-center text-xs font-bold text-[#9E948C]">
        {tr(locale, "概率走势图待数据源返回历史价格后显示。", "Trend chart appears after the data source returns historical prices.")}
      </div>
    );
  }

  const W = 720;
  const H = 180;
  const PAD = { top: 18, right: 18, bottom: 30, left: 34 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const allValues = points.flatMap((point) => [point.market, point.odds]);
  const min = Math.max(0, Math.min(...allValues) - 8);
  const max = Math.min(100, Math.max(...allValues) + 8);
  const toX = (index: number) => (index / (points.length - 1)) * chartW;
  const toY = (value: number) => chartH - ((value - min) / Math.max(1, max - min)) * chartH;
  const line = (key: "market" | "odds") =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${toX(index).toFixed(1)} ${toY(point[key]).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full border border-[#241A14] bg-[#F5F1E8]" role="img" aria-label={tr(locale, "比赛概率走势图", "Match probability trend")}>
      <g transform={`translate(${PAD.left}, ${PAD.top})`}>
        {[min, Math.round((min + max) / 2), max].map((tick) => (
          <g key={tick}>
            <line x1={0} x2={chartW} y1={toY(tick)} y2={toY(tick)} stroke="#241A14" strokeDasharray="4 4" opacity={0.18} />
            <text x={-8} y={toY(tick)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#9E948C">
              {Math.round(tick)}%
            </text>
          </g>
        ))}

        <motion.path d={line("market")} fill="none" stroke="#D36E52" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} />
        <motion.path d={line("odds")} fill="none" stroke="#9E948C" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} />

        {points.map((point, index) => (
          <g key={`${point.time}-${index}`}>
            <text x={toX(index)} y={chartH + 20} textAnchor="middle" fontSize="10" fill="#9E948C">
              {point.time}
            </text>
            <circle cx={toX(index)} cy={toY(point.market)} r="3" fill="#D36E52" />
            <circle cx={toX(index)} cy={toY(point.odds)} r="2.5" fill="#9E948C" />
          </g>
        ))}
      </g>
    </svg>
  );
}

function MarketDetailPanel({ match, locale, activeTab }: { match: GameMatch; locale: string; activeTab: GameDetailTabKey }) {
  const detailItems = detailItemsFor(match, locale, activeTab);

  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {detailItems.map((item) => (
        <div key={item.title} className="border border-[#241A14] bg-[#F5F1E8] p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black text-[#241A14]">{item.title}</span>
            <span className="text-[10px] font-black text-[#9E948C]">{item.value}</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-[#5C524C]">{item.copy}</p>
        </div>
      ))}
    </div>
  );
}

function InfoPanel({ match, locale, activeTab, kickoffLabel }: { match: GameMatch; locale: string; activeTab: GameInfoTabKey; kickoffLabel: string }) {
  const isRules = activeTab === "rules";
  return (
    <div className="mt-3 space-y-2 text-xs leading-relaxed text-[#5C524C]">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#9E948C]">
        <Info className="size-3.5 text-[#D36E52]" />
        {isRules ? tr(locale, "结算说明", "Settlement") : tr(locale, "盘口背景", "Market context")}
      </div>
      {isRules ? (
        <>
          <p>
            {tr(locale, "胜负线、让分、总分只展示已接入数据源返回的字段；未返回时显示待接入。比分以比分源或官方赛程状态为准，未开赛显示 0-0。", "Moneyline, spread, and total only show fields returned by connected sources; missing fields show pending. Scores follow score feeds or official fixture state, with upcoming matches shown as 0-0.")}
          </p>
          <p className="font-bold text-[#241A14]">
            {tr(locale, "本页只做信息展示，不提供交易能力，也不构成投注建议。", "This page is informational only and does not provide trading or betting advice.")}
          </p>
        </>
      ) : (
        <>
          <p>
            {teamName(match.home, locale)} vs {teamName(match.away, locale)} · {kickoffLabel}
          </p>
          <p>
            {tr(locale, `赛程来源：${match.sourceMatch.updatedAt || "数据源"}。盘口历史、让分、总分、半场、角球、进球、助攻和射门等待对应数据源返回。`, `Fixture source: ${match.sourceMatch.updatedAt || "data source"}. Price history, spread, totals, halftime, corners, goals, assists, and shots wait for matching source fields.`)}
          </p>
        </>
      )}
    </div>
  );
}

function pendingDetail(locale: string, title: string) {
  return {
    title,
    value: tr(locale, "待接入", "Pending"),
    copy: tr(locale, "对应数据源暂未返回该字段，页面不会用固定值或估算值填充。", "The connected source has not returned this field, so the page does not fill it with fixed or estimated values."),
  };
}

function detailItemsFor(match: GameMatch, locale: string, activeTab: GameDetailTabKey) {
  if (activeTab === "markets") {
    const rows = match.markets.flatMap((market) =>
      market.outcomes.map((outcome) => ({
        title: localize(locale, outcome.label),
        value: localize(locale, market.title),
        copy: tr(locale, "该价格来自已接入盘口或市场数据源。", "This price comes from a connected odds or market source."),
      })),
    );
    return rows.length ? rows : [pendingDetail(locale, tr(locale, "比赛盘口", "Game lines"))];
  }

  const labels: Record<GameDetailTabKey, string> = {
    markets: tr(locale, "比赛盘口", "Game lines"),
    halftime: tr(locale, "半场", "Halftime"),
    corners: tr(locale, "角球", "Corners"),
    goals: tr(locale, "进球", "Goals"),
    assists: tr(locale, "助攻", "Assists"),
    shots: tr(locale, "射门", "Shots"),
  };

  return [pendingDetail(locale, labels[activeTab])];
}

function PropsTab({ locale, markets, sourceLabel }: { locale: string; markets: PropMarket[]; sourceLabel: string }) {
  return (
    <div className="space-y-4">
      <SectionLead
        locale={locale}
        label={{ zh: "玩法", en: "Props" }}
        title={{ zh: "热门冠军与事件玩法", en: "Popular winner and event markets" }}
        copy={{
          zh: `当前：${sourceLabel}。只展示预测市场源返回的玩法，不提供本地演示盘口。`,
          en: `Current: ${sourceLabel}. Only markets returned by prediction-market sources are shown; no local demo props are used.`,
        }}
      />

      {markets.length === 0 ? (
        <EmptyState
          locale={locale}
          title={{ zh: "暂无玩法数据", en: "No prop markets" }}
          copy={{ zh: "预测市场数据源返回记录后会自动显示。", en: "Markets will appear once the prediction-market source returns records." }}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {markets.map((market, index) => (
            <motion.article
              key={market.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.025 }}
              className="border border-[#241A14] bg-[#FAF7F0] p-3 shadow-[3px_3px_0_0_#241A14]"
            >
              <div className="flex gap-3">
                <div className="grid size-12 shrink-0 place-items-center border border-[#241A14] bg-[#EDE9E0] text-sm font-black text-[#D36E52]">
                  {market.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="line-clamp-2 text-sm font-black leading-snug text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                    {localize(locale, market.title)}
                  </h2>
                  <p className="mt-1 text-[10px] font-bold text-[#9E948C]">{market.volume} {tr(locale, "交易量", "Volume")}</p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {market.choices.map((choice) => (
                  <div key={choice.label.en} className="space-y-1.5 border-t border-dashed border-[#241A14]/30 pt-2 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between gap-3 text-xs font-black text-[#241A14]">
                      <span className="truncate">{localize(locale, choice.label)}</span>
                      <span>{choice.probability}%</span>
                    </div>
                    <div className="h-2 border border-[#241A14] bg-[#EDE9E0]">
                      <div className="h-full bg-[#D36E52]" style={{ width: `${Math.max(2, Math.min(100, choice.probability))}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" className="border border-[#241A14] bg-[#D36E52]/12 px-2 py-1.5 text-[11px] font-black text-[#241A14]">
                        {tr(locale, "是", "Yes")} · {choice.yes}
                      </button>
                      <button type="button" className="border border-[#241A14] bg-[#9CB48A]/20 px-2 py-1.5 text-[11px] font-black text-[#241A14]">
                        {tr(locale, "否", "No")} · {choice.no}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupsTab({ locale, standings }: { locale: string; standings: GroupStanding[] }) {
  return (
    <div className="space-y-4">
      <SectionLead
        locale={locale}
        label={{ zh: "Groups", en: "Groups" }}
        title={{ zh: "小组积分表", en: "Group tables" }}
        copy={{
          zh: "分组和积分由赛程/比分源派生；夺冠概率字段未返回时显示待接入。",
          en: "Groups and standings are derived from fixture/score sources; title probability shows pending until returned.",
        }}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {standings.map((group, index) => (
          <motion.section
            key={group.group}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.02 }}
            className="border border-[#241A14] bg-[#FAF7F0] shadow-[3px_3px_0_0_#241A14]"
          >
            <div className="flex items-center justify-between border-b-2 border-[#241A14] bg-[#EDE9E0] px-3 py-2">
              <h2 className="text-base font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                {groupLabel(`${group.group} 组`, locale)}
              </h2>
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9E948C]">Adv</span>
            </div>

            <div className="grid grid-cols-[1fr_repeat(5,2.1rem)_3.2rem] border-b border-[#241A14]/20 px-3 py-2 text-[10px] font-black uppercase text-[#9E948C]">
              <span>{tr(locale, "球队", "Team")}</span>
              <span className="text-center">P</span>
              <span className="text-center">W</span>
              <span className="text-center">D</span>
              <span className="text-center">L</span>
              <span className="text-center">Pts</span>
              <span className="text-right">%</span>
            </div>

            <div>
              {group.rows.map((row) => (
                <div key={row.team} className="grid grid-cols-[1fr_repeat(5,2.1rem)_3.2rem] items-center px-3 py-2 text-xs font-bold text-[#241A14] odd:bg-[#F5F1E8]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center border border-[#241A14] bg-[#FAF7F0] text-sm">{row.flag}</span>
                    <span className="truncate">{teamName(row.team, locale)}</span>
                  </div>
                  <span className="text-center text-[#5C524C]">{row.played}</span>
                  <span className="text-center text-[#5C524C]">{row.won}</span>
                  <span className="text-center text-[#5C524C]">{row.drawn}</span>
                  <span className="text-center text-[#5C524C]">{row.lost}</span>
                  <span className="text-center text-[#5C524C]">{row.points}</span>
                  <span className="text-right font-black text-[#9E948C]">
                    {row.championProbability === null ? tr(locale, "待接入", "Pending") : `${row.championProbability}%`}
                  </span>
                </div>
              ))}
            </div>
          </motion.section>
        ))}
      </div>
    </div>
  );
}

function BracketTab({ locale, rounds, matchSequence }: { locale: string; rounds: BracketRound[]; matchSequence: Map<string, number> }) {
  return (
    <div className="space-y-4">
      <SectionLead
        locale={locale}
        label={{ zh: "对阵图", en: "Bracket" }}
        title={{ zh: "淘汰赛晋级树", en: "Knockout bracket" }}
        copy={{
          zh: "淘汰赛席位由赛程数据源返回的占位或球队名称直接渲染。",
          en: "Knockout slots render directly from fixture-source placeholders or team names.",
        }}
      />

      <div className="overflow-x-auto border-2 border-[#241A14] bg-[#FAF7F0] p-3">
        <div className="grid min-w-[980px] grid-flow-col auto-cols-[minmax(11rem,1fr)] gap-3">
          {rounds.map((round) => (
            <section key={round.title.zh} className="space-y-2">
              <div className="sticky top-0 z-10 border border-[#241A14] bg-[#EDE9E0] px-2 py-2 text-center text-[11px] font-black uppercase tracking-[0.12em] text-[#241A14]">
                {localize(locale, round.title)}
              </div>
              <div className="space-y-2">
                {round.matches.map((match) => (
                  <BracketMatch key={match.id} match={match} locale={locale} compact={round.matches.length <= 2} matchNo={getMatchSequenceNumber(match, matchSequence)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function BracketMatch({ match, locale, compact, matchNo }: { match: Match; locale: string; compact: boolean; matchNo?: number }) {
  return (
    <div className={`relative border border-[#241A14] bg-[#F5F1E8] ${compact ? "my-8" : ""}`}>
      <div className="border-b border-[#241A14] px-2 py-1.5 text-[10px] font-black text-[#9E948C]">
        {matchNo ? `#${matchNo}` : ""}
      </div>
      <div className="grid grid-rows-2 divide-y divide-[#241A14]/20">
        <div className="flex items-center justify-between px-2 py-2 text-xs font-black text-[#241A14]">
          <span>{teamName(match.homeTeam, locale)}</span>
          <span className="text-[#9E948C]">{teamCode(match.homeTeam, match.homeCode)}</span>
        </div>
        <div className="flex items-center justify-between px-2 py-2 text-xs font-black text-[#241A14]">
          <span>{teamName(match.awayTeam, locale)}</span>
          <span className="text-[#9E948C]">{teamCode(match.awayTeam, match.awayCode)}</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ locale, title, copy }: { locale: string; title: LocalizedText; copy: LocalizedText }) {
  return (
    <div className="border-2 border-dashed border-[#241A14] bg-[#FAF7F0] p-8 text-center">
      <p className="text-sm font-black text-[#241A14]">{localize(locale, title)}</p>
      <p className="mt-1 text-[11px] text-[#9E948C]">{localize(locale, copy)}</p>
    </div>
  );
}

function SectionLead({
  locale,
  label,
  title,
  copy,
}: {
  locale: string;
  label: LocalizedText;
  title: LocalizedText;
  copy: LocalizedText;
}) {
  return (
    <div className="border-l-4 border-[#D36E52] pl-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#9E948C]">
        <BarChart3 className="size-3.5 text-[#D36E52]" />
        {localize(locale, label)}
      </div>
      <h2 className="mt-1 text-xl font-black leading-tight text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
        {localize(locale, title)}
      </h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#5C524C]">{localize(locale, copy)}</p>
    </div>
  );
}
