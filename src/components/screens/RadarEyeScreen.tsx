"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Brackets, CalendarDays, ChevronRight, Clock3, Info, LineChart, ListFilter, Table2, Trophy } from "lucide-react";
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
type MarketCategoryKey = NonNullable<RadarMatch["category"]>;
type MarketFilterKey = "all" | MarketCategoryKey;
type DataSourceMode = "remote" | "fallback" | "cache";

type Outcome = {
  label: LocalizedText;
  value: string;
  hint?: LocalizedText;
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
  radarMarkets: RadarMatch[];
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

type LineMarketGroup = {
  id: string;
  title: string;
  category?: RadarMatch["category"];
  markets: RadarMatch[];
};

const beijingTimeZone = "Asia/Shanghai";
const dateKeys = ["yesterday", "today", "tomorrow"] as const;

const tabDefinitions: Array<{ key: TabKey; label: LocalizedText; Icon: LucideIcon }> = [
  { key: "games", label: { zh: "比赛", en: "Games" }, Icon: CalendarDays },
  { key: "props", label: { zh: "玩法", en: "Props" }, Icon: Trophy },
  { key: "bracket", label: { zh: "对阵图", en: "Bracket" }, Icon: Brackets },
  { key: "groups", label: { zh: "小组", en: "Groups" }, Icon: Table2 },
];

const marketFilterDefinitions: Array<{ key: MarketFilterKey; label: LocalizedText }> = [
  { key: "all", label: { zh: "全部", en: "All" } },
  { key: "moneyline", label: { zh: "胜负", en: "Moneyline" } },
  { key: "spread", label: { zh: "让分", en: "Spread" } },
  { key: "total", label: { zh: "总进球", en: "Total" } },
  { key: "halftime", label: { zh: "半场", en: "Halftime" } },
  { key: "corners", label: { zh: "角球", en: "Corners" } },
  { key: "goals", label: { zh: "进球", en: "Goals" } },
  { key: "assists", label: { zh: "助攻", en: "Assists" } },
  { key: "shots", label: { zh: "射门", en: "Shots" } },
  { key: "prop", label: { zh: "特别玩法", en: "Props" } },
];

const marketCategoryOrder: MarketCategoryKey[] = ["moneyline", "spread", "total", "halftime", "corners", "goals", "assists", "shots", "prop"];

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
  const normalized = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  const aliases: Record<string, string> = {
    korearepublic: "southkorea",
    caboverde: "capeverde",
    drcongo: "congodr",
    democraticrepublicofcongo: "congodr",
    iriran: "iran",
    turkiye: "turkey",
    unitedstates: "usa",
  };
  return aliases[normalized] || normalized;
}

function canonicalTeamName(input: string | undefined) {
  return canonicalName(teamName(String(input || ""), "en-US"));
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

function findRadarMarketsForMatch(match: Match, radarMatches: RadarMatch[]) {
  const home = canonicalTeamName(match.homeTeam);
  const away = canonicalTeamName(match.awayTeam);
  return radarMatches.filter((item) => {
    const fields = [item.homeTeam, item.awayTeam, item.title, item.eventTitle, item.marketLabel].map(canonicalName);
    return fields.some((field) => field.includes(home)) && fields.some((field) => field.includes(away));
  });
}

function probabilityPrice(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}¢`;
}

function radarHint(market: RadarMatch): LocalizedText {
  const title = market.title || market.eventTitle || "Polymarket";
  const volume = market.volumeUsd ? `$${Math.round(market.volumeUsd).toLocaleString()}` : market.volume;
  return {
    zh: `Polymarket：${title}${volume ? `；交易量 ${volume}` : ""}。`,
    en: `Polymarket: ${title}${volume ? `; volume ${volume}` : ""}.`,
  };
}

function categoryRank(category: RadarMatch["category"]) {
  if (!category) return marketCategoryOrder.length + 1;
  const index = marketCategoryOrder.indexOf(category);
  return index === -1 ? marketCategoryOrder.length : index;
}

function marketCategoryLabel(category: RadarMatch["category"], locale: string) {
  const definition = marketFilterDefinitions.find((item) => item.key === category);
  return definition ? localize(locale, definition.label) : tr(locale, "其他", "Other");
}

function sortRadarMarketsForGame(markets: RadarMatch[]) {
  return markets.slice().sort((left, right) =>
    categoryRank(left.category) - categoryRank(right.category)
    || volumeValue(right) - volumeValue(left)
    || String(left.title || left.marketLabel || "").localeCompare(String(right.title || right.marketLabel || "")),
  );
}

function marketTitle(market: RadarMatch, locale: string) {
  const title = market.title || market.eventTitle || market.marketLabel || tr(locale, "Polymarket 市场", "Polymarket market");
  return title.replace(/\s+/g, " ").trim();
}

function marketFiltersFor(markets: RadarMatch[]) {
  const counts = new Map<MarketFilterKey, number>();
  counts.set("all", markets.length);
  for (const market of markets) {
    if (!market.category) continue;
    counts.set(market.category, (counts.get(market.category) || 0) + 1);
  }

  return marketFilterDefinitions
    .filter((definition) => definition.key === "all" || (counts.get(definition.key) || 0) > 0)
    .map((definition) => ({ ...definition, count: counts.get(definition.key) || 0 }));
}

function marketsForFilter(markets: RadarMatch[], filter: MarketFilterKey) {
  if (filter === "all") return markets;
  return markets.filter((market) => market.category === filter);
}

function formatLineValue(value: number | undefined) {
  if (value === undefined) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function cleanLineMarketTitle(input: string) {
  return input
    .replace(/\b(?:O\/U|over\/under)\s+[+-]?\d+(?:\.\d+)?/gi, "")
    .replace(/\(([+-]?\d+(?:\.\d+)?)\)/g, "")
    .replace(/\s+[-–—]\s*$/g, "")
    .replace(/\s+:\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lineMarketGroupTitle(market: RadarMatch, locale: string) {
  const cleaned = cleanLineMarketTitle(marketTitle(market, locale));
  return cleaned || marketTitle(market, locale);
}

function lineMarketGroupKey(market: RadarMatch) {
  const rawTitle = market.title || market.eventTitle || market.marketLabel || `${market.homeTeam}-${market.awayTeam}`;
  const cleaned = canonicalName(cleanLineMarketTitle(rawTitle));
  const fallback = canonicalName(rawTitle) || market.id;
  return `${market.category || "market"}:${cleaned || fallback || market.id}`;
}

function groupLineMarkets(markets: RadarMatch[], locale: string): { lineGroups: LineMarketGroup[]; directMarkets: RadarMatch[] } {
  const groups = new Map<string, LineMarketGroup>();
  const directMarkets: RadarMatch[] = [];

  for (const market of markets) {
    const line = lineNumber(market.line);
    if (line === undefined) {
      directMarkets.push(market);
      continue;
    }

    const id = lineMarketGroupKey(market);
    const existing = groups.get(id);
    if (existing) {
      existing.markets.push(market);
    } else {
      groups.set(id, {
        id,
        title: lineMarketGroupTitle(market, locale),
        category: market.category,
        markets: [market],
      });
    }
  }

  const lineGroups = Array.from(groups.values()).map((group) => {
    const byLine = new Map<string, RadarMatch>();
    for (const market of group.markets.slice().sort((left, right) => volumeValue(right) - volumeValue(left))) {
      const line = lineNumber(market.line);
      if (line === undefined) continue;
      const key = formatLineValue(line);
      if (!byLine.has(key)) byLine.set(key, market);
    }

    return {
      ...group,
      markets: Array.from(byLine.values()).sort((left, right) => (lineNumber(left.line) || 0) - (lineNumber(right.line) || 0)),
    };
  });

  return {
    lineGroups: lineGroups.sort((left, right) =>
      categoryRank(left.category) - categoryRank(right.category)
      || volumeValue(right.markets[0]) - volumeValue(left.markets[0])
      || left.title.localeCompare(right.title),
    ),
    directMarkets: sortRadarMarketsForGame(directMarkets),
  };
}

function outcomeProbability(market: RadarMatch, index = 0) {
  return Math.max(0, Math.min(100, Math.round(market.outcomes?.[index]?.probability ?? (index === 0 ? market.homeMarketProb : market.awayMarketProb))));
}

function marketOutcomes(market: RadarMatch) {
  return market.outcomes?.length
    ? market.outcomes
    : [
      { label: market.homeTeam, probability: market.homeMarketProb },
      { label: market.awayTeam, probability: market.awayMarketProb },
    ];
}

function moneylineMarketLabel(market: RadarMatch) {
  return canonicalName(market.outcomes?.[0]?.label || market.marketLabel || market.title);
}

function moneylineOutcomes(match: Match, radarMarkets: RadarMatch[]): Outcome[] {
  const markets = radarMarkets.filter((market) => market.category === "moneyline");
  const home = canonicalTeamName(match.homeTeam);
  const away = canonicalTeamName(match.awayTeam);
  const homeMarket = markets.find((market) => moneylineMarketLabel(market).includes(home));
  const drawMarket = markets.find((market) => moneylineMarketLabel(market).includes("draw") || canonicalName(market.title).includes("draw"));
  const awayMarket = markets.find((market) => moneylineMarketLabel(market).includes(away));
  const entries = [
    { market: homeMarket, code: teamCode(match.homeTeam, match.homeCode), tone: "primary" as const },
    { market: drawMarket, code: "DRAW", tone: "neutral" as const },
    { market: awayMarket, code: teamCode(match.awayTeam, match.awayCode), tone: "success" as const },
  ];

  return entries.flatMap(({ market, code, tone }) => {
    if (!market) return [];
    const price = probabilityPrice(outcomeProbability(market, 0));
    return [{
      label: { zh: `${code} ${price}`, en: `${code} ${price}` },
      value: `${market.id}-${code}-${price}`,
      hint: radarHint(market),
      tone,
    }];
  });
}

function lineNumber(value: string | undefined) {
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function lineAbsDistance(market: RadarMatch, target: number) {
  const line = lineNumber(market.line);
  return line === undefined ? 10 : Math.abs(Math.abs(line) - target);
}

function chooseBalancedMarket(markets: RadarMatch[], targetLine?: number) {
  return markets.slice().sort((left, right) => {
    const leftPrice = outcomeProbability(left, 0);
    const rightPrice = outcomeProbability(right, 0);
    const lineScore = targetLine === undefined ? 0 : lineAbsDistance(left, targetLine) - lineAbsDistance(right, targetLine);
    if (lineScore !== 0) return lineScore;
    return Math.abs(leftPrice - 50) - Math.abs(rightPrice - 50) || volumeValue(right) - volumeValue(left);
  })[0];
}

function labelForSpreadOutcome(match: Match, market: RadarMatch, index: number) {
  const outcome = market.outcomes?.[index]?.label || "";
  const code = canonicalName(outcome).includes(canonicalTeamName(match.homeTeam))
    ? teamCode(match.homeTeam, match.homeCode)
    : canonicalName(outcome).includes(canonicalTeamName(match.awayTeam))
      ? teamCode(match.awayTeam, match.awayCode)
      : outcome.toUpperCase();
  const line = lineNumber(market.line);
  if (line === undefined) return code;
  const side = canonicalName(outcome).includes(canonicalName(market.outcomes?.[0]?.label)) ? line : -line;
  return `${code} ${side > 0 ? "+" : ""}${side}`;
}

function spreadOutcomes(match: Match, radarMarkets: RadarMatch[]): Outcome[] {
  const market = chooseBalancedMarket(radarMarkets.filter((item) => item.category === "spread"), 1.5);
  if (!market) return [];
  return [0, 1].flatMap((index) => {
    const outcome = market.outcomes?.[index];
    if (!outcome) return [];
    const label = `${labelForSpreadOutcome(match, market, index)} ${probabilityPrice(outcomeProbability(market, index))}`;
    return [{
      label: { zh: label, en: label },
      value: `${market.id}-${index}-${label}`,
      hint: radarHint(market),
      tone: index === 0 ? "primary" as const : "success" as const,
    }];
  });
}

function totalLineLabel(market: RadarMatch) {
  return market.line || String(market.title || "").match(/\bO\/U\s+(\d+(?:\.\d+)?)/i)?.[1] || "";
}

function totalOutcomes(radarMarkets: RadarMatch[]): Outcome[] {
  const market = chooseBalancedMarket(radarMarkets.filter((item) => item.category === "total"), 2.5);
  if (!market) return [];
  const line = totalLineLabel(market);
  return [0, 1].flatMap((index) => {
    const outcome = market.outcomes?.[index];
    if (!outcome) return [];
    const label = `${outcome.label}${line ? ` ${line}` : ""} ${probabilityPrice(outcomeProbability(market, index))}`.toUpperCase();
    return [{
      label: { zh: label, en: label },
      value: `${market.id}-${index}-${label}`,
      hint: radarHint(market),
      tone: index === 0 ? "primary" as const : "neutral" as const,
    }];
  });
}

function marketsFromMatch(match: Match, radarMarkets: RadarMatch[]): MatchMarket[] {
  return [
    { title: { zh: "胜负线", en: "Moneyline" }, outcomes: moneylineOutcomes(match, radarMarkets) },
    { title: { zh: "让分", en: "Spread" }, outcomes: spreadOutcomes(match, radarMarkets) },
    { title: { zh: "总分", en: "Total" }, outcomes: totalOutcomes(radarMarkets) },
  ];
}

function toGameMatch(match: Match, radarMatches: RadarMatch[]): GameMatch {
  const matchRadarMarkets = sortRadarMarketsForGame(findRadarMarketsForMatch(match, radarMatches));
  const radarMatch = matchRadarMarkets[0];
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
    radarMarkets: matchRadarMarkets,
    markets: marketsFromMatch(match, matchRadarMarkets),
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

function formatVolumeLabel(volume: string | undefined, volumeUsd: number | undefined, locale: string) {
  const value = typeof volumeUsd === "number" && Number.isFinite(volumeUsd) ? volumeUsd : Number(String(volume || "").replace(/[$,\s]/g, ""));
  if (Number.isFinite(value) && value > 0) return `$${Math.round(value).toLocaleString()}`;
  return volume || tr(locale, "盘口待接入", "Markets pending");
}

function isWorldCupRadarMatch(match: RadarMatch): boolean {
  const text = [match.title, match.eventTitle, match.eventSlug, match.marketLabel, match.homeTeam, match.awayTeam].filter(Boolean).join(" ").toLowerCase();
  return ["world cup", "世界杯", "fifa", "fifwc"].some((keyword) => text.includes(keyword));
}

function sourceLabel(source: DataSourceMode | undefined, diagnostics: Array<{ name: string; ok: boolean }> | undefined, emptyLabel: string) {
  const firstOk = diagnostics?.find((item) => item.ok);
  if (source === "remote" && firstOk) return `${firstOk.name} · 远端数据`;
  if (source === "cache") return `${firstOk?.name || "数据快照"} · 快照数据`;
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
  const propMarkets = useMemo(() => sortedRadarItems.filter((item) => item.category === "prop").slice(0, 12).map(liveMarketFromRadar), [sortedRadarItems]);
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
              `比赛结构来自赛程/比分源；胜负线、让分、总分等盘口来自 Polymarket。当前赛程：${matchSourceLabel}；预测市场：${radarSourceLabel}。`,
              `Fixtures come from schedule/score sources; moneyline, spread, totals and related lines come from Polymarket. Fixtures: ${matchSourceLabel}; prediction markets: ${radarSourceLabel}.`,
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
          {activeTab === "games" && <GamesTab locale={locale} days={displayMatchDays} sourceLabel={matchSourceLabel} marketSourceLabel={radarSourceLabel} />}
          {activeTab === "props" && <PropsTab locale={locale} markets={propMarkets} sourceLabel={radarSourceLabel} />}
          {activeTab === "groups" && <GroupsTab locale={locale} standings={standings} />}
          {activeTab === "bracket" && <BracketTab locale={locale} rounds={bracketRounds} matchSequence={matchSequence} />}
        </div>
      </main>
    </div>
  );
}

function GamesTab({ locale, days, sourceLabel, marketSourceLabel }: { locale: string; days: DisplayMatchDay[]; sourceLabel: string; marketSourceLabel: string }) {
  return (
    <div className="space-y-4">
      <SectionLead
        locale={locale}
        label={{ zh: "比赛", en: "Games" }}
        title={{ zh: "世界杯比赛盘口", en: "World Cup game lines" }}
        copy={{
          zh: `按日期展示比赛，列表只放胜负、让分、总进球三个核心盘口；展开后查看本场 Polymarket 已返回的全部市场。赛程：${sourceLabel}；市场：${marketSourceLabel}。`,
          en: `Games are grouped by date. The list keeps moneyline, spread and total up front; expand a game to see every matched Polymarket market. Fixtures: ${sourceLabel}; markets: ${marketSourceLabel}.`,
        }}
      />

      {days.length === 0 ? (
        <EmptyState
          locale={locale}
          title={{ zh: "暂无比赛数据", en: "No games yet" }}
          copy={{ zh: "赛程源返回比赛后会自动显示。", en: "Games will appear once fixture sources return records." }}
        />
      ) : (
        days.map((day) => (
          <section key={day.key} className="border-2 border-[#241A14] bg-[#FAF7F0]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#241A14] bg-[#EDE9E0] px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#241A14]">
                <CalendarDays className="size-4 text-[#D36E52]" strokeWidth={2.4} />
                {day.label}
              </div>
              <span className="text-[10px] font-black text-[#9E948C]">
                {day.matches.length} {tr(locale, "场比赛", "games")}
              </span>
            </div>

            <div className="divide-y divide-[#241A14]/25">
              {day.matches.map((match, index) => (
                <CompactGameCard key={match.id} match={match} locale={locale} index={index} timeZone={beijingTimeZone} />
              ))}
            </div>
          </section>
        ))
      )}
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
  const kickoff = formatKickoff(match, timeZone, locale);
  const volumeLabel = formatVolumeLabel(match.volume, match.volumeUsd, locale);
  const marketCount = match.radarMarkets.length;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className="bg-[#FAF7F0]"
    >
      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(24rem,1.25fr)] xl:items-stretch">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black text-[#9E948C]">
            <span className="inline-flex min-h-7 items-center gap-1.5 border border-[#241A14] bg-[#F5F1E8] px-2 text-xs text-[#241A14]">
              <Clock3 className="size-3.5 text-[#D36E52]" strokeWidth={2.5} />
              {kickoff.time}
            </span>
            <span className="uppercase tracking-[0.12em]">{kickoff.zone}</span>
            <span>{groupLabel(match.sourceMatch.group, locale)} · {roundLabel(match.sourceMatch.round, locale)}</span>
          </div>

          <div className="space-y-1.5">
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

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-[#9E948C]">
            <span className="truncate">{match.sourceMatch.venue || tr(locale, "场馆待接入", "Venue pending")}</span>
            <span>{marketCount ? `${marketCount} ${tr(locale, "个市场", "markets")}` : tr(locale, "本场盘口待接入", "Markets pending")}</span>
            <span>{volumeLabel}</span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:self-center">
          {match.markets.map((market) => (
            <CompactMarketColumn key={market.title.en} locale={locale} market={market} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#241A14]/20 px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#9E948C]">
          <ListFilter className="size-3.5 text-[#D36E52]" strokeWidth={2.4} />
          {tr(locale, "Polymarket 市场", "Polymarket markets")}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={`inline-flex min-h-8 items-center gap-1.5 border border-[#241A14] px-2.5 text-[11px] font-black transition-colors ${
            expanded ? "bg-[#D36E52] text-white" : "bg-[#EDE9E0] text-[#241A14] hover:bg-[#D36E52] hover:text-white"
          }`}
          aria-expanded={expanded}
        >
          {expanded ? tr(locale, "收起市场", "Hide markets") : tr(locale, "查看市场", "View markets")}
          <ChevronRight className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      </div>

      {expanded && (
        <GameMarketDrawer match={match} locale={locale} kickoffLabel={kickoff.full} />
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
  const title = localize(locale, market.title);

  if (market.outcomes.length === 0) {
    return (
      <div className="min-w-0 border border-dashed border-[#241A14]/50 bg-[#EDE9E0]/60 p-2">
        <div className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#9E948C]">{title}</div>
        <div className="flex min-h-10 items-center justify-center px-1.5 py-1 text-center text-[10px] font-black text-[#9E948C]">
          {tr(locale, "待接入", "Pending")}
        </div>
      </div>
    );
  }

  const isTwoOutcomeMarket = market.outcomes.length === 2;
  return (
    <div className="min-w-0 border border-[#241A14] bg-[#F5F1E8] p-2">
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#9E948C]">{title}</div>
      <div className={isTwoOutcomeMarket ? "flex flex-col gap-1" : "grid gap-1"}>
        {market.outcomes.map((outcome) => (
          <CompactPriceButton key={outcome.value} outcome={outcome} locale={locale} fill={isTwoOutcomeMarket} />
        ))}
      </div>
    </div>
  );
}

function CompactPriceButton({ outcome, locale, fill = false }: { outcome: Outcome; locale: string; fill?: boolean }) {
  const displayValue = localize(locale, outcome.label);
  const match = displayValue.match(/^(.*)\s+(\S+(?:¢|%|\d(?:\.\d+)?))$/);
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

function defaultLineMarketIndex(markets: RadarMatch[]) {
  if (markets.length <= 1) return 0;
  return markets.reduce((bestIndex, market, index) => (
    volumeValue(market) > volumeValue(markets[bestIndex]) ? index : bestIndex
  ), 0);
}

function LineMarketCard({ group, locale }: { group: LineMarketGroup; locale: string }) {
  const defaultIndex = defaultLineMarketIndex(group.markets);
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);
  const boundedSelectedIndex = Math.min(selectedIndex, Math.max(0, group.markets.length - 1));
  const selectedMarket = group.markets[boundedSelectedIndex];
  if (!selectedMarket) return null;

  const selectedLine = formatLineValue(lineNumber(selectedMarket.line));
  const firstLine = formatLineValue(lineNumber(group.markets[0]?.line));
  const lastLine = formatLineValue(lineNumber(group.markets[group.markets.length - 1]?.line));
  const outcomes = marketOutcomes(selectedMarket);
  const hasMultipleLines = group.markets.length > 1;
  const handleLineInput = (event: FormEvent<HTMLInputElement>) => {
    const nextIndex = Number(event.currentTarget.value);
    if (Number.isFinite(nextIndex)) setSelectedIndex(nextIndex);
  };

  return (
    <article className="border border-[#241A14] bg-[#FAF7F0]">
      <div className="border-b border-[#241A14]/25 p-2.5">
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#9E948C]">
          <span className="border border-[#241A14]/40 bg-[#F5F1E8] px-1.5 py-0.5 text-[#5C524C]">
            {marketCategoryLabel(group.category, locale)}
          </span>
          <span>{group.markets.length} {tr(locale, "条盘口线", "lines")}</span>
          <span>{formatVolumeLabel(selectedMarket.volume, selectedMarket.volumeUsd, locale)}</span>
        </div>
        <h4 className="line-clamp-2 text-sm font-black leading-snug text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          {group.title}
        </h4>
      </div>

      <div className="space-y-2 border-b border-[#241A14]/20 bg-[#F5F1E8] p-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9E948C]">
            {tr(locale, "盘口线", "Line")}
          </span>
          <span className="border border-[#241A14] bg-[#D36E52] px-2 py-1 text-xs font-black text-white">
            {selectedLine}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0, group.markets.length - 1)}
          step={1}
          value={boundedSelectedIndex}
          disabled={!hasMultipleLines}
          aria-label={tr(locale, "调整盘口线", "Adjust line")}
          onInput={handleLineInput}
          onChange={handleLineInput}
          className="h-8 w-full cursor-pointer accent-[#D36E52] disabled:cursor-default disabled:opacity-60"
        />

        <div className="flex items-center justify-between text-[10px] font-black text-[#9E948C]">
          <span>{firstLine}</span>
          <span>{tr(locale, "滑动调整盘口线", "Slide to adjust line")}</span>
          <span>{lastLine}</span>
        </div>
      </div>

      <div className="divide-y divide-[#241A14]/15">
        {outcomes.map((outcome, index) => (
          <button
            key={`${selectedMarket.id}-${outcome.label}-${index}`}
            type="button"
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[#EDE9E0]"
          >
            <span className="min-w-0 truncate text-xs font-black text-[#241A14]">{outcome.label}</span>
            <span className="border border-[#241A14] bg-[#D36E52]/12 px-2 py-1 text-[11px] font-black text-[#241A14]">
              {probabilityPrice(outcome.probability)}
            </span>
          </button>
        ))}
      </div>
    </article>
  );
}

function GameMarketDrawer({ match, locale, kickoffLabel }: { match: GameMatch; locale: string; kickoffLabel: string }) {
  const [activeFilter, setActiveFilter] = useState<MarketFilterKey>("all");
  const filters = useMemo(() => marketFiltersFor(match.radarMarkets), [match.radarMarkets]);
  const visibleMarkets = useMemo(() => marketsForFilter(match.radarMarkets, activeFilter), [match.radarMarkets, activeFilter]);
  const groupedMarkets = useMemo(() => groupLineMarkets(visibleMarkets, locale), [visibleMarkets, locale]);
  const hasTrend = (match.radarMatch?.history || []).filter((point) => Number.isFinite(point.market) && Number.isFinite(point.odds)).length >= 2;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="overflow-hidden border-t border-[#241A14]/25 bg-[#F5F1E8]"
    >
      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                {tr(locale, "本场市场", "Game markets")}
              </h3>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#9E948C]">
                {teamName(match.home, locale)} vs {teamName(match.away, locale)}
              </p>
            </div>
            <span className="border border-[#241A14] bg-[#EDE9E0] px-2 py-1 text-[10px] font-black text-[#241A14]">
              {match.radarMarkets.length ? `${match.radarMarkets.length} ${tr(locale, "个已匹配市场", "matched markets")}` : tr(locale, "待接入", "Pending")}
            </span>
          </div>

          {match.radarMarkets.length === 0 ? (
            <div className="border-2 border-dashed border-[#241A14] bg-[#FAF7F0] p-6 text-center">
              <p className="text-sm font-black text-[#241A14]">{tr(locale, "本场盘口暂未匹配", "No matched markets for this game")}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#9E948C]">
                {tr(locale, "Polymarket 返回可识别的球队与赛事市场后，这里会按市场类型自动归类。", "When Polymarket returns recognizable team and event markets, they will be grouped here automatically.")}
              </p>
            </div>
          ) : (
            <>
              <MarketFilterBar filters={filters} active={activeFilter} onChange={setActiveFilter} locale={locale} />

              {hasTrend && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#9E948C]">
                    <LineChart className="size-3.5 text-[#D36E52]" strokeWidth={2.4} />
                    {tr(locale, "概率走势", "Probability trend")}
                  </div>
                  <ProbabilityTrendChart match={match} locale={locale} />
                </div>
              )}

              <div className="grid gap-2 lg:grid-cols-2">
                {groupedMarkets.lineGroups.map((group) => (
                  <LineMarketCard key={group.id} group={group} locale={locale} />
                ))}
                {groupedMarkets.directMarkets.map((market) => (
                  <PolymarketMarketCard key={market.id} market={market} locale={locale} />
                ))}
              </div>
            </>
          )}
        </div>

        <GameContextPanel match={match} locale={locale} kickoffLabel={kickoffLabel} />
      </div>
    </motion.div>
  );
}

function MarketFilterBar({
  filters,
  active,
  onChange,
  locale,
}: {
  filters: Array<{ key: MarketFilterKey; label: LocalizedText; count: number }>;
  active: MarketFilterKey;
  onChange: (filter: MarketFilterKey) => void;
  locale: string;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-full gap-1 border border-[#241A14] bg-[#FAF7F0] p-1 sm:min-w-0">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => onChange(filter.key)}
            className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 border px-2.5 text-[10px] font-black transition-colors ${
              active === filter.key
                ? "border-[#241A14] bg-[#D36E52] text-white"
                : "border-transparent text-[#5C524C] hover:border-[#241A14]/30 hover:bg-[#EDE9E0]"
            }`}
          >
            {localize(locale, filter.label)}
            <span className={active === filter.key ? "text-white/80" : "text-[#9E948C]"}>{filter.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PolymarketMarketCard({ market, locale }: { market: RadarMatch; locale: string }) {
  const outcomes = marketOutcomes(market);
  const volume = formatVolumeLabel(market.volume, market.volumeUsd, locale);

  return (
    <article className="border border-[#241A14] bg-[#FAF7F0]">
      <div className="border-b border-[#241A14]/25 p-2.5">
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#9E948C]">
          <span className="border border-[#241A14]/40 bg-[#F5F1E8] px-1.5 py-0.5 text-[#5C524C]">
            {marketCategoryLabel(market.category, locale)}
          </span>
          {market.line && <span>{tr(locale, "盘口线", "Line")} {market.line}</span>}
          <span>{volume}</span>
        </div>
        <h4 className="line-clamp-2 text-sm font-black leading-snug text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          {marketTitle(market, locale)}
        </h4>
      </div>

      <div className="divide-y divide-[#241A14]/15">
        {outcomes.map((outcome, index) => (
          <button
            key={`${market.id}-${outcome.label}-${index}`}
            type="button"
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[#EDE9E0]"
          >
            <span className="min-w-0 truncate text-xs font-black text-[#241A14]">{outcome.label}</span>
            <span className="border border-[#241A14] bg-[#D36E52]/12 px-2 py-1 text-[11px] font-black text-[#241A14]">
              {probabilityPrice(outcome.probability)}
            </span>
          </button>
        ))}
      </div>
    </article>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 border-b border-[#241A14]/15 py-2 text-xs last:border-b-0">
      <span className="font-black text-[#9E948C]">{label}</span>
      <span className="min-w-0 text-[#241A14]">{value}</span>
    </div>
  );
}

function GameContextPanel({ match, locale, kickoffLabel }: { match: GameMatch; locale: string; kickoffLabel: string }) {
  return (
    <aside className="border border-[#241A14] bg-[#FAF7F0] p-3">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#9E948C]">
        <Info className="size-3.5 text-[#D36E52]" strokeWidth={2.4} />
        {tr(locale, "比赛信息", "Game info")}
      </div>

      <div className="mt-2">
        <ContextRow label={tr(locale, "开赛", "Kickoff")} value={kickoffLabel} />
        <ContextRow label={tr(locale, "场馆", "Venue")} value={match.sourceMatch.venue || tr(locale, "待接入", "Pending")} />
        <ContextRow label={tr(locale, "赛程源", "Fixture")} value={match.sourceMatch.updatedAt || tr(locale, "数据源", "Data source")} />
        <ContextRow label={tr(locale, "市场", "Markets")} value={match.radarMarkets.length ? `${match.radarMarkets.length} Polymarket` : tr(locale, "暂未匹配", "No match")} />
        <ContextRow label={tr(locale, "交易量", "Volume")} value={formatVolumeLabel(match.volume, match.volumeUsd, locale)} />
      </div>

      <div className="mt-3 border-t border-[#241A14] pt-3 text-xs leading-relaxed text-[#5C524C]">
        <p>
          {tr(
            locale,
            "胜负、让分、总进球和其他细分市场只展示 Polymarket 返回的 outcomePrices；未返回的市场不会用固定价格或估算值填充。",
            "Moneyline, spread, total and specialty markets only display outcomePrices returned by Polymarket; missing markets are not filled with fixed or estimated prices.",
          )}
        </p>
        <p className="mt-2 font-bold text-[#241A14]">
          {tr(locale, "本页只做信息展示，不提供交易能力，也不构成投注建议。", "This page is informational only and does not provide trading or betting advice.")}
        </p>
      </div>
    </aside>
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
