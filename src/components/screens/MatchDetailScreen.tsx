"use client";

import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerProfile } from "@/lib/wc-data";
import {
  allMatches,
  browserScheduleDateQuery,
  matchIdentityKey,
  mergeMatchWithOfficialSource,
  type Match,
  type MatchEvent,
  type MatchKitColorSet,
  type MatchLineup,
  type MatchLineupPlayer,
} from "@/lib/wc-data";
import { groupLabel, isZh, roundLabel, teamName, tr } from "@/lib/i18n/content";

function getMatch(id: string): Match | undefined {
  return allMatches.find((m) => m.id === id);
}

function formatStatValue(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function statValue(match: Match, type: string, side: "home" | "away"): string | undefined {
  const value = match.statistics
    ?.find((item) => item.team === side)
    ?.stats.find((stat) => stat.type === type)
    ?.value;
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

const preferredStatTypes = [
  "Shots on Goal",
  "Shots off Goal",
  "Total Shots",
  "Blocked Shots",
  "Shots insidebox",
  "Shots outsidebox",
  "Ball Possession",
  "Total passes",
  "Passes accurate",
  "Passes %",
  "Fouls",
  "Corner Kicks",
  "Offsides",
  "Yellow Cards",
  "Red Cards",
  "Goalkeeper Saves",
];

const statLabels: Record<string, { zh: string; en: string }> = {
  "Shots on Goal": { zh: "射正", en: "Shots on Goal" },
  "Shots off Goal": { zh: "射偏", en: "Shots off Goal" },
  "Total Shots": { zh: "射门", en: "Total Shots" },
  "Blocked Shots": { zh: "被封堵射门", en: "Blocked Shots" },
  "Shots insidebox": { zh: "禁区内射门", en: "Shots Inside Box" },
  "Shots outsidebox": { zh: "禁区外射门", en: "Shots Outside Box" },
  "Ball Possession": { zh: "控球率", en: "Ball Possession" },
  "Total passes": { zh: "传球数", en: "Total Passes" },
  "Passes accurate": { zh: "成功传球", en: "Accurate Passes" },
  "Passes %": { zh: "传球成功率", en: "Pass Accuracy" },
  Fouls: { zh: "犯规", en: "Fouls" },
  "Corner Kicks": { zh: "角球", en: "Corner Kicks" },
  Offsides: { zh: "越位", en: "Offsides" },
  "Yellow Cards": { zh: "黄牌", en: "Yellow Cards" },
  "Red Cards": { zh: "红牌", en: "Red Cards" },
  "Goalkeeper Saves": { zh: "门将扑救", en: "Goalkeeper Saves" },
};

function statTypeLabel(type: string, locale: string): { primary: string; secondary?: string } {
  const label = statLabels[type];
  if (!label) return { primary: type };
  return isZh(locale) ? { primary: label.zh, secondary: type } : { primary: label.en };
}

function displayedStatTypes(match: Match): string[] {
  const returnedTypes = new Set(
    (match.statistics || []).flatMap((group) => group.stats.map((stat) => stat.type)),
  );
  return [
    ...preferredStatTypes.filter((type) => returnedTypes.has(type)),
    ...Array.from(returnedTypes).filter((type) => !preferredStatTypes.includes(type)).sort(),
  ];
}

function sortedEvents(match: Match): MatchEvent[] {
  return (match.events || []).slice().sort((left, right) => left.minute - right.minute);
}

function eventTypeLabel(type: string, locale: string): string {
  if (type === "goal") return tr(locale, "进球", "Goal");
  if (type === "subst") return tr(locale, "换人", "Substitution");
  if (type === "penalty") return tr(locale, "点球", "Penalty");
  if (type === "og") return tr(locale, "乌龙球", "Own goal");
  if (type === "red") return tr(locale, "红牌", "Red card");
  return tr(locale, "黄牌", "Yellow card");
}

function eventTone(type: MatchEvent["type"]): string {
  if (type === "goal" || type === "penalty") return "bg-[#D36E52] text-white";
  if (type === "og") return "bg-[#6D7F62] text-white";
  if (type === "subst") return "bg-[#2F8F4E] text-white";
  if (type === "red") return "bg-[#A94438] text-white";
  return "bg-[#E7C76D] text-[#241A14]";
}

function scoreText(match: Match): string {
  const homeScore = match.homeScore ?? "-";
  const awayScore = match.awayScore ?? "-";
  return `${homeScore} : ${awayScore}`;
}

function localizedAiBrief(match: Match, locale: string): string | undefined {
  if (isZh(locale)) return match.aiBriefZh || match.aiBriefEn;
  return match.aiBriefEn || match.aiBriefZh;
}

function preMatchProbability(match: Match, locale: string) {
  if (match.oddsImpliedHome > 0 || match.oddsImpliedDraw > 0 || match.oddsImpliedAway > 0) {
    return {
      home: match.oddsImpliedHome,
      draw: match.oddsImpliedDraw,
      away: match.oddsImpliedAway,
      source: match.oddsSource || tr(locale, "赔率快照", "Odds snapshot"),
      updatedAt: match.preMatchProbabilityUpdatedAt,
      targetAt: match.preMatchProbabilityTargetAt,
    };
  }
  if (match.prediction) {
    return {
      home: match.prediction.homePercent,
      draw: match.prediction.drawPercent,
      away: match.prediction.awayPercent,
      source: match.prediction.source,
      updatedAt: match.prediction.updatedAt,
      targetAt: undefined,
    };
  }
  if (match.homeWinProb > 0 || match.drawProb > 0 || match.awayWinProb > 0) {
    return {
      home: match.homeWinProb,
      draw: match.drawProb,
      away: match.awayWinProb,
      source: tr(locale, "预测市场", "Prediction market"),
      updatedAt: undefined,
      targetAt: undefined,
    };
  }
  return undefined;
}

function formatSnapshotTime(input: string | undefined, locale: string): string | undefined {
  const date = input ? new Date(input) : undefined;
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(isZh(locale) ? "zh-CN" : "en-US", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function numberValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildDataCommentary(match: Match, locale: string): string {
  const aiBrief = localizedAiBrief(match, locale);
  if (aiBrief) return aiBrief;

  const homeShots = numberValue(statValue(match, "Shots on Goal", "home"));
  const awayShots = numberValue(statValue(match, "Shots on Goal", "away"));
  const homePossession = statValue(match, "Ball Possession", "home");
  const awayPossession = statValue(match, "Ball Possession", "away");
  const probability = preMatchProbability(match, locale);
  const homeLineup = match.lineups?.find((item) => item.team === "home");
  const awayLineup = match.lineups?.find((item) => item.team === "away");

  if (homeShots !== undefined || awayShots !== undefined) {
    const homeName = teamName(match.homeTeam, locale);
    const awayName = teamName(match.awayTeam, locale);
    const shotLeader = (homeShots || 0) >= (awayShots || 0) ? homeName : awayName;
    return tr(
      locale,
      `从已接入数据看，${shotLeader}的射正威胁更值得关注；控球为 ${homePossession || "-"} / ${awayPossession || "-"}，比赛重心不只是比分，还要看谁能把推进转化成高质量终结。`,
      `The connected data points to ${shotLeader} carrying the sharper on-target threat. Possession sits at ${homePossession || "-"} / ${awayPossession || "-"}, so the useful read is who can turn territory into clean chances.`,
    );
  }

  if (homeLineup?.formation || awayLineup?.formation) {
    return tr(
      locale,
      `阵型上看，${teamName(match.homeTeam, locale)} ${homeLineup?.formation || "-"} 对 ${teamName(match.awayTeam, locale)} ${awayLineup?.formation || "-"}，中场人数和边路落位会决定谁先把节奏压进前场。`,
      `The shape read is ${teamName(match.homeTeam, locale)} ${homeLineup?.formation || "-"} against ${teamName(match.awayTeam, locale)} ${awayLineup?.formation || "-"}; midfield spacing and wide positioning should decide who moves the game forward first.`,
    );
  }

  if (probability) {
    return tr(
      locale,
      `事前概率给了一个开赛前参照：${teamName(match.homeTeam, locale)} ${probability.home}%、平局 ${probability.draw}%、${teamName(match.awayTeam, locale)} ${probability.away}%。它适合用来理解预期差，不代表赛果。`,
      `The pre-match probability gives a baseline: ${teamName(match.homeTeam, locale)} ${probability.home}%, draw ${probability.draw}%, ${teamName(match.awayTeam, locale)} ${probability.away}%. Treat it as context for expectations, not as an outcome claim.`,
    );
  }

  return tr(
    locale,
    `${teamName(match.homeTeam, locale)}对${teamName(match.awayTeam, locale)}目前以官方赛程信息为主，先看开赛时间和场地背景；真正能拉开话题层次的，会是临场阵容、射正质量和事件节点。`,
    `${teamName(match.homeTeam, locale)} vs ${teamName(match.awayTeam, locale)} is still mostly schedule context for now. The sharper talking points will come from lineups, shot quality, and event timing once the feeds fill in.`,
  );
}

function formationNumbers(formation: string | undefined): number[] {
  const values = String(formation || "")
    .split(/[^0-9]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return values.reduce((sum, value) => sum + value, 0) === 10 ? values : [];
}

function fallbackFormationGroups(players: MatchLineupPlayer[]): number[] {
  const outfield = players.slice(1);
  const defenders = outfield.filter((player) => /^D/i.test(player.position || "")).length;
  const midfielders = outfield.filter((player) => /^M/i.test(player.position || "")).length;
  const forwards = outfield.filter((player) => /^F/i.test(player.position || "")).length;
  const groups = [defenders, midfielders, forwards].filter((count) => count > 0);
  return groups.reduce((sum, value) => sum + value, 0) === outfield.length ? groups : [4, 3, Math.max(1, outfield.length - 7)];
}

function lineupRows(lineup: MatchLineup): MatchLineupPlayer[][] {
  const players = lineup.startXI.slice(0, 11);
  if (!players.length) return [];
  const [goalkeeper, ...outfield] = players;
  const groups = formationNumbers(lineup.formation).length
    ? formationNumbers(lineup.formation)
    : fallbackFormationGroups(players);
  const rows: MatchLineupPlayer[][] = goalkeeper ? [[goalkeeper]] : [];
  let cursor = 0;
  for (const count of groups) {
    rows.push(outfield.slice(cursor, cursor + count));
    cursor += count;
  }
  const leftovers = outfield.slice(cursor);
  if (leftovers.length) {
    const last = rows.at(-1);
    if (last) last.push(...leftovers);
    else rows.push(leftovers);
  }
  return rows.filter((row) => row.length);
}

function normalizePlayerLookup(input: string | undefined): string {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

// Module-level profile cache populated by useTeamProfiles hook
let profileCache: Map<string, { roster?: PlayerProfile[] }> | null = null;

function useTeamProfiles() {
  const [loaded, setLoaded] = useState(Boolean(profileCache));
  useEffect(() => {
    if (profileCache) return;
    let cancelled = false;
    fetch("/api/data/team-profiles", { cache: "force-cache" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        const profiles = (data as { profiles: Array<{ code: string; roster?: PlayerProfile[] }> }).profiles || [];
        profileCache = new Map(profiles.map((p) => [p.code, p]));
        setLoaded(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return loaded;
}

function enrichedPlayer(lineup: MatchLineup, player: MatchLineupPlayer): MatchLineupPlayer {
  const profile = profileCache?.get(lineup.teamName);
  const playerProfile = profile?.roster?.find((p) => {
    if (player.number !== undefined && p.shirtNumber === player.number) return true;
    const normalizedNames = [
      normalizePlayerLookup(p.name),
    ];
    return normalizedNames.includes(normalizePlayerLookup(player.fullName))
      || normalizedNames.includes(normalizePlayerLookup(player.name));
  });
  return {
    ...player,
    nameZh: playerProfile ? playerProfile.nameZh : player.nameZh,
    fullName: playerProfile ? playerProfile.name : player.fullName,
  };
}

function displayPlayerName(player: MatchLineupPlayer, lineup: MatchLineup, locale: string): string {
  const enriched = enrichedPlayer(lineup, player);
  return isZh(locale)
    ? enriched.nameZh || enriched.fullName || enriched.name
    : enriched.fullName || enriched.name;
}

function secondaryPlayerName(player: MatchLineupPlayer, lineup: MatchLineup, locale: string): string | undefined {
  const enriched = enrichedPlayer(lineup, player);
  const english = enriched.fullName || enriched.name;
  if (!isZh(locale) || !enriched.nameZh || normalizePlayerLookup(enriched.nameZh) === normalizePlayerLookup(english)) {
    return undefined;
  }
  return english;
}

function positionLabel(position: string | undefined, locale: string): string {
  const labels: Record<string, string> = {
    G: "门将",
    GK: "门将",
    D: "后卫",
    M: "中场",
    F: "前锋",
  };
  if (isZh(locale)) return labels[String(position || "").toUpperCase()] || position || "-";
  return position || "-";
}

function cssHex(value: string | undefined, fallback: string): string {
  const raw = String(value || "").replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw}` : fallback;
}

function kitColorsForPlayer(lineup: MatchLineup, player: MatchLineupPlayer): Required<MatchKitColorSet> {
  const isGoalkeeper = /^G/i.test(player.position || "");
  const fallbackPrimary = lineup.team === "home" ? "#E7C76D" : "#6D7F62";
  const colorSet = isGoalkeeper ? lineup.colors?.goalkeeper || lineup.colors?.player : lineup.colors?.player;
  return {
    primary: cssHex(colorSet?.primary, fallbackPrimary),
    number: cssHex(colorSet?.number, "#241A14"),
    border: cssHex(colorSet?.border, "#F7E8B5"),
  };
}

function parseGrid(grid: string | undefined): { row: number; col: number } | undefined {
  const [, row, col] = String(grid || "").match(/^(\d+):(\d+)$/) || [];
  const parsedRow = Number(row);
  const parsedCol = Number(col);
  if (!Number.isFinite(parsedRow) || !Number.isFinite(parsedCol)) return undefined;
  return { row: parsedRow, col: parsedCol };
}

function fieldPositionStyle(
  player: MatchLineupPlayer,
  lineup: MatchLineup,
  rows: MatchLineupPlayer[][],
  rowIndex: number,
  playerIndex: number,
): { left: string; top: string; transform: string } {
  const side = lineup.team;
  const grid = parseGrid(player.grid);
  const halfStart = 8;
  const halfDepth = 32;
  const jerseyTopOffset = 3;
  const gridPlayers = lineup.startXI.flatMap((item) => {
    const parsed = parseGrid(item.grid);
    return parsed ? [{ player: item, grid: parsed }] : [];
  });

  if (grid && gridPlayers.length) {
    const maxRow = Math.max(...gridPlayers.map((item) => item.grid.row), 1);
    const rowCols = gridPlayers
      .map((item) => item.grid)
      .filter((item) => item.row === grid.row);
    const maxCol = Math.max(...rowCols.map((item) => item.col), 1);
    const left = maxCol <= 1 ? 50 : 14 + ((maxCol - grid.col) / (maxCol - 1)) * 72;
    const progress = maxRow <= 1 ? 0.5 : (grid.row - 1) / (maxRow - 1);
    const top = (side === "home" ? halfStart + progress * halfDepth : 100 - halfStart - progress * halfDepth) - jerseyTopOffset;
    return {
      left: `${left}%`,
      top: `${top}%`,
      transform: "translateX(-50%)",
    };
  }

  const row = rows[rowIndex] || [];
  const rowLength = row.length;
  const progress = rows.length <= 1 ? 0.5 : rowIndex / (rows.length - 1);
  const top = (side === "home" ? halfStart + progress * halfDepth : 100 - halfStart - progress * halfDepth) - jerseyTopOffset;
  const left = rowLength <= 1 ? 50 : 14 + (playerIndex / (rowLength - 1)) * 72;
  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: "translateX(-50%)",
  };
}

function DataPill({ label, value, accent = "text-[#D36E52]" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-[#241A14]/20 bg-white/45 px-2.5 py-2">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#7D7168]">{label}</div>
      <div className={`mt-1 text-sm font-black ${accent}`} style={{ fontFamily: "var(--font-heading)" }}>
        {value}
      </div>
    </div>
  );
}

function MatchInsightSummary({ match, locale }: { match: Match; locale: string }) {
  const homeLineup = match.lineups?.find((item) => item.team === "home");
  const awayLineup = match.lineups?.find((item) => item.team === "away");
  const shots = [statValue(match, "Shots on Goal", "home"), statValue(match, "Shots on Goal", "away")];
  const possession = [statValue(match, "Ball Possession", "home"), statValue(match, "Ball Possession", "away")];
  const corners = [statValue(match, "Corner Kicks", "home"), statValue(match, "Corner Kicks", "away")];
  const probability = preMatchProbability(match, locale);
  const commentary = buildDataCommentary(match, locale);
  const targetTime = formatSnapshotTime(probability?.targetAt, locale);
  const capturedTime = formatSnapshotTime(probability?.updatedAt, locale);

  return (
    <section className="border-2 border-[#241A14] bg-[#FAF7F0] p-3" style={{ boxShadow: "4px 4px 0 0 #241A14" }}>
      <div className="flex items-start justify-between gap-3 border-b border-[#241A14]/20 pb-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-[#D36E52]" style={{ fontFamily: "var(--font-heading)" }}>
            {tr(locale, "数据快读", "Data Read")}
          </div>
          <h2 className="mt-1 text-base font-black leading-tight text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
            {tr(locale, "先看结论，再看细项", "The read before the details")}
          </h2>
        </div>
        <div className="shrink-0 border border-[#241A14] bg-[#E7C76D] px-2 py-1 text-[10px] font-black text-[#241A14]">
          {match.status === "upcoming" ? tr(locale, "未开赛", "Upcoming") : match.status === "live" ? tr(locale, "进行中", "Live") : tr(locale, "已完赛", "Finished")}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <DataPill
          label={match.status === "upcoming" ? tr(locale, "开赛", "Kickoff") : tr(locale, "比分", "Score")}
          value={match.status === "upcoming" ? match.kickoffBj : scoreText(match)}
        />
        <DataPill
          label={tr(locale, "阵型", "Shape")}
          value={`${homeLineup?.formation || "-"} / ${awayLineup?.formation || "-"}`}
          accent="text-[#6D7F62]"
        />
        <DataPill
          label={tr(locale, "射正", "On target")}
          value={`${shots[0] || "-"} : ${shots[1] || "-"}`}
          accent="text-[#B85B45]"
        />
        <DataPill
          label={tr(locale, "控球 / 角球", "Poss. / Corners")}
          value={`${possession[0] || "-"} / ${possession[1] || "-"} · ${corners[0] || "-"}:${corners[1] || "-"}`}
          accent="text-[#6D7F62]"
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1.25fr_0.75fr]">
        <div className="border-l-4 border-[#D36E52] bg-[#FFF9EA] px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#D36E52]">{tr(locale, "AI 点评", "AI Comment")}</div>
          <p className="mt-1 text-sm leading-relaxed text-[#241A14]">{commentary}</p>
        </div>
        <div className="border border-[#241A14]/20 bg-white/40 p-2.5">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#7D7168]">{tr(locale, "事前预测概率", "Pre-match Probability")}</div>
          {probability ? (
            <>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-[9px] text-[#7D7168]">{teamName(match.homeTeam, locale)}</div>
                  <div className="font-mono text-sm font-black text-[#D36E52]">{probability.home}%</div>
                </div>
                <div>
                  <div className="text-[9px] text-[#7D7168]">{tr(locale, "平", "Draw")}</div>
                  <div className="font-mono text-sm font-black text-[#6D7F62]">{probability.draw}%</div>
                </div>
                <div>
                  <div className="text-[9px] text-[#7D7168]">{teamName(match.awayTeam, locale)}</div>
                  <div className="font-mono text-sm font-black text-[#D36E52]">{probability.away}%</div>
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-[#7D7168]">
                {probability.source}
                {targetTime ? ` · ${tr(locale, "目标", "Target")} ${targetTime}` : ""}
                {capturedTime ? ` · ${tr(locale, "采集", "Captured")} ${capturedTime}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[11px] text-[#9E948C]">{tr(locale, "暂无可用赛前概率快照", "No pre-match probability snapshot yet")}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function samePlayer(left: MatchLineupPlayer, eventName: string | undefined, eventId?: number): boolean {
  if (eventId && left.id && eventId === left.id) return true;
  const candidates = [left.name, left.fullName, left.nameZh].map(normalizePlayerLookup).filter(Boolean);
  return candidates.includes(normalizePlayerLookup(eventName));
}

function playerEvents(match: Match, lineup: MatchLineup, player: MatchLineupPlayer): MatchEvent[] {
  const enriched = enrichedPlayer(lineup, player);
  return (match.events || []).filter((event) =>
    event.team === lineup.team
    && (
      samePlayer(enriched, event.player, event.playerId)
      || samePlayer(enriched, event.assistPlayer, event.assistPlayerId)
    )
  );
}

function playerEventChips(events: MatchEvent[], locale: string): string[] {
  return events.flatMap((event) => {
    if (event.type === "goal" || event.type === "penalty" || event.type === "og") return [`${tr(locale, "进", "G")} ${event.minute}'`];
    if (event.type === "yellow") return [`${tr(locale, "黄", "Y")} ${event.minute}'`];
    if (event.type === "red") return [`${tr(locale, "红", "R")} ${event.minute}'`];
    if (event.type === "subst") return [`${tr(locale, "换", "S")} ${event.minute}'`];
    return [];
  });
}

function substitutionMinute(match: Match, lineup: MatchLineup, player: MatchLineupPlayer): number | undefined {
  const enriched = enrichedPlayer(lineup, player);
  return (match.events || []).find((event) =>
    event.type === "subst"
    && event.team === lineup.team
    && samePlayer(enriched, event.assistPlayer, event.assistPlayerId)
  )?.minute;
}

function JerseyIcon({
  player,
  lineup,
  size = "md",
}: {
  player: MatchLineupPlayer;
  lineup: MatchLineup;
  size?: "sm" | "md" | "pitch";
}) {
  const colors = kitColorsForPlayer(lineup, player);
  const dimensions = size === "sm"
    ? "h-7 w-7"
    : size === "pitch"
      ? "h-6 w-6 sm:h-7 sm:w-7"
      : "h-8 w-8 sm:h-9 sm:w-9";
  const numberSize = size === "sm" ? "text-[9px]" : size === "pitch" ? "text-[9px] sm:text-[10px]" : "text-[11px] sm:text-xs";
  return (
    <div
      className={`${dimensions} mx-auto flex items-center justify-center text-center font-mono font-black drop-shadow-[1px_2px_0_rgba(0,0,0,0.22)]`}
      style={{
        color: colors.number,
        backgroundColor: colors.primary,
        border: `1.5px solid ${colors.border}`,
        clipPath: "polygon(22% 0, 36% 0, 44% 9%, 56% 9%, 64% 0, 78% 0, 100% 22%, 82% 38%, 82% 100%, 18% 100%, 18% 38%, 0 22%)",
      }}
    >
      <span className={numberSize}>{player.number || ""}</span>
    </div>
  );
}

function PitchPlayer({
  match,
  player,
  lineup,
  rows,
  rowIndex,
  playerIndex,
  locale,
}: {
  match: Match;
  player: MatchLineupPlayer;
  lineup: MatchLineup;
  rows: MatchLineupPlayer[][];
  rowIndex: number;
  playerIndex: number;
  locale: string;
}) {
  const events = playerEventChips(playerEvents(match, lineup, player), locale).slice(0, 2);
  const secondary = secondaryPlayerName(player, lineup, locale);

  return (
    <div
      className="absolute w-[72px] text-center sm:w-[78px]"
      style={fieldPositionStyle(player, lineup, rows, rowIndex, playerIndex)}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 z-0 -translate-x-1/2 opacity-95">
        <JerseyIcon player={player} lineup={lineup} size="pitch" />
      </div>
      <div className="relative z-20 pt-[22px] sm:pt-[26px]">
        <div className="text-[10px] font-black leading-[1.08] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] sm:text-[11px]">
          <span className="line-clamp-2 px-0.5">{displayPlayerName(player, lineup, locale)}</span>
        </div>
        {secondary && (
          <div className="truncate px-0.5 text-[8px] font-bold leading-[1.05] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {secondary}
          </div>
        )}
        {events.length > 0 && (
          <div className="mt-0.5 flex flex-wrap justify-center gap-0.5 leading-none">
            {events.map((event) => (
              <span key={event} className="rounded-full bg-[#FAF7F0]/95 px-1 py-px text-[8px] font-black leading-tight text-[#241A14]">
                {event}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SubstitutesPanel({ match, lineups, locale }: { match: Match; lineups: MatchLineup[]; locale: string }) {
  if (!lineups.some((lineup) => lineup.substitutes.length)) return null;

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#D36E52]" style={{ fontFamily: "var(--font-heading)" }}>
        {tr(locale, "替补阵容", "Substitutes")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {lineups.map((lineup) => (
          <div key={`${lineup.team}-subs`} className="min-w-0 border border-[#241A14]/25 bg-white/45 p-2">
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#241A14]/15 pb-1">
              <span className="truncate text-xs font-black text-[#241A14]">{teamName(lineup.teamName, locale)}</span>
              <span className="font-mono text-[10px] font-black text-[#6D7F62]">{lineup.formation || "-"}</span>
            </div>
            {lineup.coach && (
              <div className="mb-2 grid grid-cols-[34px_1fr] items-center gap-2 text-[10px] text-[#5C524C]">
                <div className="flex h-8 w-8 items-center justify-center border border-[#241A14]/20 bg-[#FFF9EA] font-black text-[#D36E52]">
                  {tr(locale, "教", "C")}
                </div>
                <div>
                  <div className="font-bold text-[#241A14]">{lineup.coach}</div>
                  <div>{tr(locale, "主教练", "Coach")}</div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {lineup.substitutes.map((player) => {
                const minute = substitutionMinute(match, lineup, player);
                const secondary = secondaryPlayerName(player, lineup, locale);
                return (
                  <div key={`${lineup.team}-${player.id || player.name}`} className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2">
                    <JerseyIcon player={player} lineup={lineup} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-black text-[#241A14]">{displayPlayerName(player, lineup, locale)}</div>
                      <div className="truncate text-[9px] text-[#7D7168]">
                        {[secondary, positionLabel(player.position, locale)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className={`font-mono text-[10px] font-black ${minute ? "text-[#2F8F4E]" : "text-[#9E948C]"}`}>
                      {minute ? `↑ ${minute}'` : tr(locale, "未登场", "DNP")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CombinedLineupPitch({ match, lineups, locale }: { match?: Match; lineups: MatchLineup[]; locale: string }) {
  if (!match) return null;
  const homeLineup = lineups.find((lineup) => lineup.team === "home");
  const awayLineup = lineups.find((lineup) => lineup.team === "away");
  const pitchLineups = [homeLineup, awayLineup]
    .filter((lineup): lineup is MatchLineup => Boolean(lineup))
    .filter((lineup, index, list) => list.findIndex((item) => item.team === lineup.team) === index);

  return (
    <div className="space-y-3">
      <div
        className="relative min-h-[820px] overflow-hidden rounded-[6px] border-2 border-[#F4E8C7] bg-[#087B48] shadow-[inset_0_0_0_2px_rgba(36,26,20,0.28)] sm:min-h-[900px]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.08) 50%, transparent 50%), linear-gradient(0deg, rgba(255,255,255,0.06) 50%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(255,255,255,0.08), transparent 26%)",
          backgroundSize: "74px 74px, 100% 92px, 100% 100%",
        }}
      >
        <div className="absolute inset-3 border-2 border-white/55" />
        <div className="absolute left-3 right-3 top-1/2 border-t-2 border-white/45" />
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/55" />
        <div className="absolute left-1/2 top-3 h-24 w-44 -translate-x-1/2 border-x-2 border-b-2 border-white/45" />
        <div className="absolute left-1/2 top-3 h-10 w-20 -translate-x-1/2 border-x-2 border-b-2 border-white/35" />
        <div className="absolute bottom-3 left-1/2 h-24 w-44 -translate-x-1/2 border-x-2 border-t-2 border-white/45" />
        <div className="absolute bottom-3 left-1/2 h-10 w-20 -translate-x-1/2 border-x-2 border-t-2 border-white/35" />
        {match.venue && (
          <div className="absolute right-4 top-4 max-w-[44%] text-right text-[10px] font-black leading-snug text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
            {match.venue}
          </div>
        )}
        {homeLineup && (
          <div className="absolute left-4 top-[49%] -translate-y-full text-[12px] font-black leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]">
            <span className="mr-1">{match.homeFlag}</span>
            {teamName(homeLineup.teamName, locale)}
            <span className="ml-2 font-mono text-[#F7E8B5]">{homeLineup.formation || "-"}</span>
          </div>
        )}
        {awayLineup && (
          <div className="absolute left-4 top-[51%] text-[12px] font-black leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]">
            <span className="mr-1">{match.awayFlag}</span>
            {teamName(awayLineup.teamName, locale)}
            <span className="ml-2 font-mono text-[#F7E8B5]">{awayLineup.formation || "-"}</span>
          </div>
        )}
        {pitchLineups.flatMap((lineup) => {
          const rows = lineupRows(lineup);
          return rows.flatMap((row, rowIndex) =>
            row.map((player, playerIndex) => (
              <PitchPlayer
                key={`${lineup.team}-${player.id || player.name}-${rowIndex}-${playerIndex}`}
                match={match}
                player={player}
                lineup={lineup}
                rows={rows}
                rowIndex={rowIndex}
                playerIndex={playerIndex}
                locale={locale}
              />
            )),
          );
        })}
      </div>

      <SubstitutesPanel match={match} lineups={pitchLineups} locale={locale} />
    </div>
  );
}

function eventPlayerName(match: Match, event: MatchEvent, locale: string, role: "player" | "assist" = "player"): string {
  const lineup = match.lineups?.find((item) => item.team === event.team);
  const rawName = role === "assist" ? event.assistPlayer : event.player;
  const rawId = role === "assist" ? event.assistPlayerId : event.playerId;
  if (!lineup) return rawName || "";
  const player = [...lineup.startXI, ...lineup.substitutes]
    .map((item) => enrichedPlayer(lineup, item))
    .find((item) => samePlayer(item, rawName, rawId));
  return player ? displayPlayerName(player, lineup, locale) : rawName || "";
}

function eventDescription(match: Match, event: MatchEvent, locale: string): string | undefined {
  if (event.type === "subst") {
    const incoming = eventPlayerName(match, event, locale, "assist");
    const outgoing = eventPlayerName(match, event, locale, "player");
    return tr(locale, `换上 ${incoming}，换下 ${outgoing}`, `On: ${incoming} · Off: ${outgoing}`);
  }
  if (event.type === "goal" && event.assistPlayer) {
    return tr(
      locale,
      `${event.description?.split(" · ")[0] || "Normal Goal"} · 助攻：${eventPlayerName(match, event, locale, "assist")}`,
      event.description || `Assist: ${event.assistPlayer}`,
    );
  }
  return event.description;
}

function EventTimeline({ match, locale }: { match: Match; locale: string }) {
  const events = sortedEvents(match);
  if (!events.length) {
    return (
      <div className="border-2 border-dashed border-[#241A14] p-5 text-center">
        <p className="text-sm font-bold text-[#241A14]">{tr(locale, "暂无比赛事件", "No match events")}</p>
        <p className="mt-1 text-[11px] text-[#9E948C]">{tr(locale, "进球、红黄牌等事件会随比分源更新。", "Goals and cards will appear when the score feed updates.")}</p>
      </div>
    );
  }

  return (
    <section className="border-2 border-[#241A14] bg-[#FAF7F0] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#D36E52]" style={{ fontFamily: "var(--font-heading)" }}>
          {tr(locale, "事件", "Events")}
        </div>
        <span className="font-mono text-[11px] font-black text-[#6D7F62]">
          {tr(locale, `${events.length} 个事件`, `${events.length} events`)}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {events.map((event, index) => {
          const sideName = teamName(event.team === "home" ? match.homeTeam : match.awayTeam, locale);
          const description = eventDescription(match, event, locale);
          return (
            <div key={`${event.minute}-${event.type}-${event.player}-${index}`} className="grid grid-cols-[44px_1fr] gap-2 border-t border-[#241A14]/15 pt-2">
              <div className="font-mono text-sm font-black text-[#241A14]">{`${event.minute}'`}</div>
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 text-[10px] font-black ${eventTone(event.type)}`}>
                    {eventTypeLabel(event.type, locale)}
                  </span>
                  <span className="text-xs font-black text-[#241A14]">{eventPlayerName(match, event, locale)}</span>
                  <span className="text-[11px] font-bold text-[#7D7168]">{sideName}</span>
                </div>
                {description && <p className="mt-1 text-[11px] leading-relaxed text-[#5C524C]">{description}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProbabilityPanel({ match, locale }: { match: Match; locale: string }) {
  const probability = preMatchProbability(match, locale);
  if (!probability) return null;

  return (
    <section className="border border-[#241A14] bg-[#FFF9EA] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#D36E52]" style={{ fontFamily: "var(--font-heading)" }}>
          {tr(locale, "事前预测概率", "Pre-match Probability")}
        </div>
        <span className="text-[10px] font-bold text-[#7D7168]">{probability.source}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <DataPill label={teamName(match.homeTeam, locale)} value={`${probability.home}%`} />
        <DataPill label={tr(locale, "平局", "Draw")} value={`${probability.draw}%`} accent="text-[#6D7F62]" />
        <DataPill label={teamName(match.awayTeam, locale)} value={`${probability.away}%`} />
      </div>
    </section>
  );
}

export function MatchDetailScreen() {
  useTeamProfiles();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;
  const [match, setMatch] = useState<Match | undefined>(() => getMatch(matchId));
  const [loading, setLoading] = useState(!match);

  useEffect(() => {
    let cancelled = false;
    async function loadMatch() {
      const localMatch = getMatch(matchId);
      if (!localMatch) setLoading(true);
      const dateKeys = ["yesterday", "today", "tomorrow"] as const;
      const browserNow = new Date();
      const responses = await Promise.all(
        dateKeys.map(async (dateKey) => {
          const response = await fetch(`/api/data/matches?${browserScheduleDateQuery(dateKey, browserNow)}`);
          if (!response.ok) return [];
          const data = (await response.json()) as { matches?: Match[] };
          return data.matches || [];
        }),
      );
      if (cancelled) return;
      const liveMatches = responses.flat();
      const liveMatch = liveMatches.find((item) => item.id === matchId)
        || (localMatch ? liveMatches.find((item) => matchIdentityKey(item) === matchIdentityKey(localMatch)) : undefined);
      setMatch(localMatch ? mergeMatchWithOfficialSource(localMatch, liveMatch) : liveMatch);
      setLoading(false);
    }

    void loadMatch();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#F5F1E8] p-8">
        <p className="text-sm text-[#9E948C]">{tr(locale, "正在读取比赛数据...", "Loading match data...")}</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex flex-col min-h-svh bg-[#F5F1E8] items-center justify-center p-8">
        <p className="text-[#9E948C] text-sm">{tr(locale, "比赛数据未找到", "Match data not found")}</p>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 border-2 border-[#241A14] text-xs font-bold bg-[#FAF7F0]"
        >
          {tr(locale, "← 返回", "← Back")}
        </motion.button>
      </div>
    );
  }

  const probability = preMatchProbability(match, locale);

  return (
    <div className="flex flex-col min-h-svh bg-[#F5F1E8]">
      {/* Top bar */}
      <div className="px-4 py-2 border-b-2 border-[#241A14] bg-[#FAF7F0] flex items-center justify-between sticky top-0 z-[10]">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => router.back()}
          className="px-2.5 py-1 border border-[#241A14] text-xs font-bold bg-[#FAF7F0] hover:bg-[#D36E52] hover:text-white transition-colors"
        >
          {tr(locale, "← 返回赛程", "← Back to schedule")}
        </motion.button>
        <span
          className="font-black text-sm text-[#241A14]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {tr(locale, "比赛数据详情", "Match Data Details")}
        </span>
        <span className="text-[10px] text-[#D36E52] font-bold uppercase tracking-widest">{tr(locale, "独家情报", "Insights")}</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Hero banner */}
        <div
          className="border-2 border-[#241A14] p-4 bg-[#FAF7F0] text-center relative overflow-hidden"
          style={{ boxShadow: "4px 4px 0 0 #241A14" }}
        >
          <div
            className="text-[9px] font-black uppercase text-[#D36E52] tracking-widest mb-2"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {groupLabel(match.group, locale)} · {roundLabel(match.round, locale)}
          </div>

          <div className="flex justify-center items-center gap-6 my-3">
            {/* Home */}
            <div className="text-center">
              <span className="text-4xl">{match.homeFlag}</span>
              <div
                className="font-black text-base mt-1 text-[#241A14]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {teamName(match.homeTeam, locale)}
              </div>
            </div>

            {/* Middle */}
            <div className="text-center">
              {match.status === "upcoming" ? (
                <>
                  {probability ? (
                    <>
                      <div className="font-serif text-xs text-[#9E948C] font-bold">{tr(locale, "事前预测概率", "Pre-match probability")}</div>
                      <div className="font-mono text-sm font-black text-[#D36E52] mt-1">
                        {probability.home}% / {probability.draw}% / {probability.away}%
                      </div>
                    </>
                  ) : (
                    <div className="font-serif text-xs text-[#9E948C] font-bold">{tr(locale, "暂无概率数据", "No probability data")}</div>
                  )}
                </>
              ) : (
                <div className="border-2 border-[#241A14] bg-[#E7C76D] px-4 py-1.5 font-mono text-xl font-black tracking-widest text-[#241A14] shadow-[3px_3px_0_0_#241A14]">
                  {scoreText(match)}
                </div>
              )}
            </div>

            {/* Away */}
            <div className="text-center">
              <span className="text-4xl">{match.awayFlag}</span>
              <div
                className="font-black text-base mt-1 text-[#241A14]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {teamName(match.awayTeam, locale)}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-[#9E948C] font-serif">
            {match.status === "upcoming" ? tr(locale, `开赛时间：${match.kickoffBj}（北京时间）`, `Kickoff: ${match.kickoffBj} Beijing time`) : tr(locale, "已完赛", "Finished")}
            {match.venue && ` · ${match.venue}`}
          </div>
        </div>

        <MatchInsightSummary match={match} locale={locale} />

        {Boolean(match.lineups?.length || match.statistics?.length) && (
          <div className="space-y-3">
            {Boolean(match.lineups?.length) && (
              <div className="border-2 border-[#241A14] bg-[#FAF7F0] p-3">
                <div
                  className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#D36E52]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {tr(locale, "首发阵容", "Lineups")}
                </div>
                <CombinedLineupPitch match={match} lineups={match.lineups || []} locale={locale} />
              </div>
            )}

            {Boolean(match.statistics?.length) && (
              <div className="border-2 border-[#241A14] bg-[#FAF7F0] p-3">
                <div
                  className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#D36E52]"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {tr(locale, "技术统计", "Match Stats")}
                </div>
                {displayedStatTypes(match).map((statType) => {
                  const homeStats = match.statistics?.find((item) => item.team === "home");
                  const awayStats = match.statistics?.find((item) => item.team === "away");
                  const homeValue = homeStats?.stats.find((stat) => stat.type === statType)?.value ?? null;
                  const awayValue = awayStats?.stats.find((stat) => stat.type === statType)?.value ?? null;
                  if (homeValue === null && awayValue === null) return null;
                  const statLabel = statTypeLabel(statType, locale);
                  return (
                    <div key={statType} className="grid grid-cols-[1fr_1.2fr_1fr] items-center gap-2 border-t border-[#241A14]/15 py-1.5 text-xs">
                      <span className="font-mono font-black text-[#241A14]">{formatStatValue(homeValue)}</span>
                      <span className="text-center text-[11px] font-bold text-[#5C524C]">
                        {statLabel.primary}
                        {statLabel.secondary && <span className="block text-[9px] font-normal text-[#9E948C]">{statLabel.secondary}</span>}
                      </span>
                      <span className="text-right font-mono font-black text-[#241A14]">{formatStatValue(awayValue)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Talking points header */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#D36E52] rounded-full" />
          <h4
            className="font-bold text-sm tracking-wider text-[#241A14]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {tr(locale, "比赛事件", "Match Events")}
          </h4>
        </div>

        <EventTimeline match={match} locale={locale} />
        <ProbabilityPanel match={match} locale={locale} />

        {/* Highlights link */}
        {match.highlights && (
          <div className="border border-[#241A14] p-3 flex justify-between items-center bg-[#FAF7F0]">
            <span className="text-xs text-[#5C524C]">{tr(locale, "官方集锦已出，快去看看", "Official highlights are available.")}</span>
            <a
              href={match.highlights}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 bg-[#9CB48A] text-white text-xs font-bold border border-[#241A14] hover:bg-[#241A14] transition-colors"
            >
              {tr(locale, "→ 看集锦", "→ Highlights")}
            </a>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] text-[#9E948C] text-center py-2">
          {tr(locale, "* 页面只展示已接入数据源返回的内容，不构成投注建议。", "* This page only shows connected source data and is not betting advice.")}
        </p>
      </div>
    </div>
  );
}
