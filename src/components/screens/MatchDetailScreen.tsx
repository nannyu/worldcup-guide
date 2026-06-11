"use client";

import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { allMatches, matchIdentityKey, mergeMatchWithOfficialSource, type Match } from "@/lib/wc-data";
import { groupLabel, roundLabel, teamName, tr } from "@/lib/i18n/content";

function getMatch(id: string): Match | undefined {
  return allMatches.find((m) => m.id === id);
}

function formatStatValue(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function MatchDetailScreen() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;
  const [match, setMatch] = useState<Match | undefined>(() => getMatch(matchId));
  const [loading, setLoading] = useState(!match);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMatch() {
      const localMatch = getMatch(matchId);
      if (!localMatch) setLoading(true);
      const dateKeys = ["yesterday", "today", "tomorrow"] as const;
      const responses = await Promise.all(
        dateKeys.map(async (dateKey) => {
          const response = await fetch(`/api/data/matches?dateKey=${dateKey}`);
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

  const points: Array<{ label: string; title: string; desc: string; isQuote?: boolean }> = [];

  function copyText(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  }

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
          {tr(locale, "深度装杯分析", "Match Analysis")}
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
              {match.status !== "upcoming" && (
                <div className="text-2xl font-black text-[#D36E52] mt-1">{match.homeScore}</div>
              )}
            </div>

            {/* Middle */}
            <div className="text-center">
              {match.status === "upcoming" ? (
                <>
                  {match.homeWinProb > 0 || match.awayWinProb > 0 ? (
                    <>
                      <div className="font-serif text-xs text-[#9E948C] font-bold">{tr(locale, "市场概率", "Market probability")}</div>
                      <div className="font-mono text-lg font-black text-[#D36E52] mt-1">
                        {match.homeWinProb}% - {match.awayWinProb}%
                      </div>
                    </>
                  ) : match.oddsImpliedHome > 0 ? (
                    <>
                      <div className="font-serif text-xs text-[#9E948C] font-bold">{tr(locale, "赔率隐含概率", "Implied odds")}</div>
                      <div className="font-mono text-sm font-black text-[#D36E52] mt-1">
                        {match.oddsImpliedHome}% / {match.oddsImpliedDraw}% / {match.oddsImpliedAway}%
                      </div>
                    </>
                  ) : (
                    <div className="font-serif text-xs text-[#9E948C] font-bold">{tr(locale, "暂无概率数据", "No probability data")}</div>
                  )}
                </>
              ) : (
                <div className="px-3 py-1 bg-[#241A14] text-white font-mono font-black text-xl tracking-widest">
                  {match.homeScore} : {match.awayScore}
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
              {match.status !== "upcoming" && (
                <div className="text-2xl font-black text-[#D36E52] mt-1">{match.awayScore}</div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-[#9E948C] font-serif">
            {match.status === "upcoming" ? tr(locale, `开赛时间：${match.kickoffBj}（北京时间）`, `Kickoff: ${match.kickoffBj} Beijing time`) : tr(locale, "已完赛", "Finished")}
            {match.venue && ` · ${match.venue}`}
          </div>
        </div>

        {/* Preview text */}
        {match.previewText && (
          <div className="border-l-2 border-[#D36E52] pl-3 text-sm text-[#5C524C]">
            {match.previewText}
          </div>
        )}

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
                <div className="grid gap-3 md:grid-cols-2">
                  {match.lineups?.map((lineup) => (
                    <div key={lineup.team} className="space-y-2">
                      <div className="flex items-center justify-between gap-2 border-b border-[#241A14]/30 pb-1">
                        <span className="text-xs font-black text-[#241A14]">{teamName(lineup.teamName, locale)}</span>
                        <span className="font-mono text-[11px] font-black text-[#D36E52]">{lineup.formation || "-"}</span>
                      </div>
                      {lineup.coach && (
                        <p className="text-[11px] text-[#5C524C]">{tr(locale, `主教练：${lineup.coach}`, `Coach: ${lineup.coach}`)}</p>
                      )}
                      <div className="grid grid-cols-2 gap-1">
                        {lineup.startXI.slice(0, 11).map((player) => (
                          <div key={`${lineup.team}-${player.id || player.name}`} className="truncate border border-[#241A14]/20 bg-white/40 px-1.5 py-1 text-[11px] text-[#241A14]">
                            {player.number ? `${player.number} ` : ""}{player.name}
                            {player.position ? <span className="text-[#9E948C]"> · {player.position}</span> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
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
                {["Shots on Goal", "Shots off Goal", "Ball Possession", "Total passes", "Passes accurate", "Fouls", "Corner Kicks", "Offsides"].map((statType) => {
                  const homeStats = match.statistics?.find((item) => item.team === "home");
                  const awayStats = match.statistics?.find((item) => item.team === "away");
                  const homeValue = homeStats?.stats.find((stat) => stat.type === statType)?.value ?? null;
                  const awayValue = awayStats?.stats.find((stat) => stat.type === statType)?.value ?? null;
                  if (homeValue === null && awayValue === null) return null;
                  return (
                    <div key={statType} className="grid grid-cols-[1fr_1.2fr_1fr] items-center gap-2 border-t border-[#241A14]/15 py-1.5 text-xs">
                      <span className="font-mono font-black text-[#241A14]">{formatStatValue(homeValue)}</span>
                      <span className="text-center text-[11px] font-bold text-[#5C524C]">{statType}</span>
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
            {tr(locale, "比赛分析", "Match Analysis")}
          </h4>
        </div>

        {/* Points */}
        {points.length > 0 ? (
          points.map((pt, idx) => (
            <motion.div
              key={idx}
              className="border border-dashed border-[#241A14] p-3 bg-[#FAF7F0] space-y-1"
            >
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[#D36E52] text-white">
                {pt.label}
              </span>
              {pt.title && <h5 className="text-xs font-black text-[#241A14] pt-1">{pt.title}</h5>}
              <p className="text-xs text-[#5C524C] leading-relaxed pt-0.5">{pt.desc}</p>
              {pt.isQuote && (
                <div className="mt-2 text-right">
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={() => copyText(pt.desc, idx)}
                    className={`px-2.5 py-0.5 text-[10px] font-bold border border-[#241A14] ${
                      copiedIdx === idx ? "bg-[#9CB48A] text-white" : "bg-[#241A14] text-white"
                    }`}
                  >
                    {copiedIdx === idx ? "✓ 已复制" : "复制"}
                  </motion.button>
                </div>
              )}
            </motion.div>
          ))
        ) : (
          <div className="border-2 border-dashed border-[#241A14] p-8 text-center">
            <p className="text-sm font-bold text-[#241A14]">{tr(locale, "暂无比赛分析", "No match analysis")}</p>
            <p className="mt-1 text-[11px] text-[#9E948C]">{tr(locale, "统计、新闻或分析数据源返回内容后会自动显示。", "Stats, news, or analysis will appear once a data source returns content.")}</p>
          </div>
        )}

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
