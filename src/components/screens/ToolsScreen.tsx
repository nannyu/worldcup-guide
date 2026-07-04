"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { OddsMatch, RadarMatch } from "@/lib/wc-data";
import { teamName, tr } from "@/lib/i18n/content";

type OutcomeKey = "home" | "draw" | "away";
type OddsInputs = Record<OutcomeKey, string>;

const emptyOddsInputs: OddsInputs = {
  home: "",
  draw: "",
  away: "",
};

/* ------------------------------------------------------------------ */
/*  Matched pair: Polymarket market matched to a bookmaker odds line    */
/* ------------------------------------------------------------------ */

interface MatchedPair {
  oddsMatch: OddsMatch;
  radarMatch: RadarMatch;
  homePolyProb: number;   // Polymarket implied prob for home
  drawPolyProb: number;   // Polymarket implied prob for draw (if available)
  awayPolyProb: number;   // Polymarket implied prob for away
  homeBookProb: number;   // Bookmaker implied prob for home
  drawBookProb: number;   // Bookmaker implied prob for draw
  awayBookProb: number;   // Bookmaker implied prob for away
  homeDiff: number;       // homePolyProb - homeBookProb
  drawDiff: number;
  awayDiff: number;
  maxDiff: number;        // largest absolute diff
  maxDiffSide: OutcomeKey;
}

/* ------------------------------------------------------------------ */
/*  Arbitrage opportunity                                               */
/* ------------------------------------------------------------------ */

interface ArbitrageOpportunity {
  pair: MatchedPair;
  description: string;
  legs: Array<{
    side: string;
    source: string;
    impliedProb: number;
    odds: number;
    stakePercent: number;
  }>;
  totalImplied: number;
  profitPercent: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function toImpliedPercent(value: string): number | null {
  const odds = Number.parseFloat(value);
  if (!Number.isFinite(odds) || odds <= 1) return null;
  return Math.round((1 / odds) * 100);
}

function formatOdds(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "";
}

function getOutcomeProbability(match: OddsMatch | undefined, outcome: OutcomeKey): number | undefined {
  if (!match) return undefined;
  if (outcome === "home") return match.homeProbability;
  if (outcome === "draw") return match.drawProbability;
  return match.awayProbability;
}

function getOutcomeLabel(match: OddsMatch | undefined, outcome: OutcomeKey, locale: string): string {
  if (outcome === "home") return match ? teamName(match.homeTeam, locale) : tr(locale, "主胜", "Home");
  if (outcome === "draw") return tr(locale, "平局", "Draw");
  return match ? teamName(match.awayTeam, locale) : tr(locale, "客胜", "Away");
}

function oddsMatchOptionLabel(match: OddsMatch, locale: string): string {
  const teams = `${teamName(match.homeTeam, locale)} vs ${teamName(match.awayTeam, locale)}`;
  const score = match.status === "finished" && match.homeScore !== null && match.homeScore !== undefined && match.awayScore !== null && match.awayScore !== undefined
    ? ` · ${match.homeScore}-${match.awayScore}`
    : "";
  return `${match.kickoffBj} ${teams}${score}`;
}

function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9一-鿿]/g, "").trim();
}

function teamsMatch(team1: string, team2: string): boolean {
  const a = normalizeTeamName(team1);
  const b = normalizeTeamName(team2);
  if (a === b) return true;
  // Check if one contains the other (e.g. "Argentina" matches "argentina")
  if (a.length > 3 && b.length > 3) {
    return a.includes(b) || b.includes(a);
  }
  return false;
}

function matchRadarToOdds(radarMatches: RadarMatch[], oddsMatches: OddsMatch[]): MatchedPair[] {
  const pairs: MatchedPair[] = [];
  const usedRadarIds = new Set<string>();

  for (const oddsMatch of oddsMatches) {
    if (oddsMatch.status === "finished") continue;

    // Find matching radar entry (moneyline category, same teams)
    const radar = radarMatches.find((rm) => {
      if (usedRadarIds.has(rm.id)) return false;
      if (rm.category !== "moneyline") return false;
      return (teamsMatch(rm.homeTeam, oddsMatch.homeTeam) && teamsMatch(rm.awayTeam, oddsMatch.awayTeam)) ||
        (teamsMatch(rm.homeTeam, oddsMatch.awayTeam) && teamsMatch(rm.awayTeam, oddsMatch.homeTeam));
    });

    if (!radar) continue;
    usedRadarIds.add(radar.id);

    const homePolyProb = radar.homeMarketProb;
    const awayPolyProb = radar.awayMarketProb;
    const drawPolyProb = Math.max(0, 100 - homePolyProb - awayPolyProb);
    const homeBookProb = oddsMatch.homeProbability;
    const drawBookProb = oddsMatch.drawProbability;
    const awayBookProb = oddsMatch.awayProbability;

    const homeDiff = homePolyProb - homeBookProb;
    const drawDiff = drawPolyProb - drawBookProb;
    const awayDiff = awayPolyProb - awayBookProb;

    const diffs = [
      { side: "home" as OutcomeKey, diff: Math.abs(homeDiff) },
      { side: "draw" as OutcomeKey, diff: Math.abs(drawDiff) },
      { side: "away" as OutcomeKey, diff: Math.abs(awayDiff) },
    ];
    const maxEntry = diffs.sort((a, b) => b.diff - a.diff)[0];

    pairs.push({
      oddsMatch,
      radarMatch: radar,
      homePolyProb,
      drawPolyProb,
      awayPolyProb,
      homeBookProb,
      drawBookProb,
      awayBookProb,
      homeDiff,
      drawDiff,
      awayDiff,
      maxDiff: maxEntry.diff,
      maxDiffSide: maxEntry.side,
    });
  }

  return pairs.sort((a, b) => b.maxDiff - a.maxDiff);
}

function findArbitrageOpportunities(pairs: MatchedPair[]): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const pair of pairs) {
    // Check cross-source arbitrage: best price from each source for different outcomes
    // e.g., If Polymarket says Home 60% (1.67 odds) but bookmaker gives Away at 3.00 (33%)
    // and Bookmaker says Home at 1.80 (55%) but Polymarket gives Away at 45% (2.22 odds)

    const combos = [
      // Polymarket home + Bookmaker away + Bookmaker draw
      {
        legs: [
          { side: "主胜/Home", source: "Polymarket", impliedProb: pair.homePolyProb },
          { side: "平局/Draw", source: tr("zh", "欧赔", "Bookmaker"), impliedProb: pair.drawBookProb },
          { side: "客胜/Away", source: tr("zh", "欧赔", "Bookmaker"), impliedProb: pair.awayBookProb },
        ],
      },
      // Bookmaker home + Polymarket away
      {
        legs: [
          { side: "主胜/Home", source: tr("zh", "欧赔", "Bookmaker"), impliedProb: pair.homeBookProb },
          { side: "平局/Draw", source: tr("zh", "欧赔", "Bookmaker"), impliedProb: pair.drawBookProb },
          { side: "客胜/Away", source: "Polymarket", impliedProb: pair.awayPolyProb },
        ],
      },
      // Best of each: pick lowest implied prob for each outcome across sources
      {
        legs: [
          {
            side: "主胜/Home",
            source: pair.homePolyProb < pair.homeBookProb ? "Polymarket" : tr("zh", "欧赔", "Bookmaker"),
            impliedProb: Math.min(pair.homePolyProb, pair.homeBookProb),
          },
          {
            side: "平局/Draw",
            source: pair.drawPolyProb < pair.drawBookProb ? "Polymarket" : tr("zh", "欧赔", "Bookmaker"),
            impliedProb: Math.min(pair.drawPolyProb, pair.drawBookProb),
          },
          {
            side: "客胜/Away",
            source: pair.awayPolyProb < pair.awayBookProb ? "Polymarket" : tr("zh", "欧赔", "Bookmaker"),
            impliedProb: Math.min(pair.awayPolyProb, pair.awayBookProb),
          },
        ],
      },
    ];

    for (const combo of combos) {
      const totalImplied = combo.legs.reduce((sum, leg) => sum + leg.impliedProb, 0);
      if (totalImplied < 100) {
        const profitPercent = Math.round((100 / totalImplied - 1) * 10000) / 100;
        if (profitPercent >= 0.5) { // At least 0.5% profit
          const totalInverseOdds = combo.legs.reduce((sum, leg) => sum + (leg.impliedProb / 100), 0);
          opportunities.push({
            pair,
            description: `${pair.oddsMatch.homeTeam} vs ${pair.oddsMatch.awayTeam}`,
            legs: combo.legs.map((leg) => ({
              ...leg,
              odds: leg.impliedProb > 0 ? Math.round((100 / leg.impliedProb) * 100) / 100 : 0,
              stakePercent: Math.round(((leg.impliedProb / 100) / totalInverseOdds) * 10000) / 100,
            })),
            totalImplied,
            profitPercent,
          });
          break; // Only report best combo per pair
        }
      }
    }
  }

  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

function getDiffLabel(diff: number): { text: string; color: string } {
  const absDiff = Math.abs(diff);
  if (absDiff >= 15) return { text: "显著分歧", color: "#D36E52" };
  if (absDiff >= 8) return { text: "中度分歧", color: "#E4A853" };
  return { text: "基本一致", color: "#9CB48A" };
}

function getDiffExplanation(pair: MatchedPair, locale: string): string {
  const { maxDiff, maxDiffSide, homeDiff } = pair;
  if (maxDiff < 5) {
    return tr(locale,
      "两个市场对这场比赛的判断基本一致，没有明显信息差。",
      "Both markets largely agree on this match — no significant information gap.");
  }
  if (maxDiff < 12) {
    const sideLabel = maxDiffSide === "home" ? pair.oddsMatch.homeTeam :
      maxDiffSide === "away" ? pair.oddsMatch.awayTeam : tr(locale, "平局", "Draw");
    const polyHigher = (maxDiffSide === "home" && homeDiff > 0) ||
      (maxDiffSide === "away" && pair.awayDiff > 0) ||
      (maxDiffSide === "draw" && pair.drawDiff > 0);
    return tr(locale,
      `预测市场对「${sideLabel}」的估值${polyHigher ? "高于" : "低于"}传统赔率约 ${Math.round(maxDiff)}%。可能反映了散户情绪偏好或近期消息面的影响。`,
      `Prediction market values "${sideLabel}" ${polyHigher ? "higher" : "lower"} than bookmakers by ~${Math.round(maxDiff)}%. May reflect retail sentiment or recent news impact.`);
  }
  const sideLabel = maxDiffSide === "home" ? pair.oddsMatch.homeTeam :
    maxDiffSide === "away" ? pair.oddsMatch.awayTeam : tr(locale, "平局", "Draw");
  return tr(locale,
    `两个市场在「${sideLabel}」方向存在 ${Math.round(maxDiff)}% 的显著分歧。这可能意味着：1) 某一方有滞后信息；2) 预测市场对散户热门有情绪溢价；3) 传统机构考虑了更全面的数据因子。大分歧通常在赛前缩小，注意观察哪边修正。`,
    `Markets diverge significantly on "${sideLabel}" by ~${Math.round(maxDiff)}%. This may indicate: 1) One side has stale information; 2) Prediction market has retail sentiment premium; 3) Bookmakers factor in more comprehensive data. Large gaps usually narrow pre-match — watch which side corrects.`);
}

/* ------------------------------------------------------------------ */
/*  Shared UI Components                                                */
/* ------------------------------------------------------------------ */

function FieldShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold text-[#5C524C]">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.01"
      min="0"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full border-2 border-[#241A14] bg-[#F5F1E8] px-2 py-1.5 text-xs text-[#241A14] placeholder-[#9E948C] focus:border-[#D36E52] focus:outline-none"
    />
  );
}

function SectionHeader({ dot, title, subtitle }: { dot: string; title: string; subtitle?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
        <h2 className="text-xs font-black tracking-wider text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          {title}
        </h2>
      </div>
      {subtitle && (
        <p className="mt-1 text-[11px] leading-relaxed text-[#9E948C]">{subtitle}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Market Discrepancy Analysis                                         */
/* ------------------------------------------------------------------ */

function MarketDiscrepancyAnalysis({
  locale,
  pairs,
  loading,
}: {
  locale: string;
  pairs: MatchedPair[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="border border-[#241A14] bg-[#FAF7F0] p-3 space-y-3" style={{ boxShadow: "3px 3px 0 0 #241A14" }}>
        <SectionHeader
          dot="#D36E52"
          title={tr(locale, "市场分歧雷达", "Market Divergence Radar")}
        />
        <div className="flex items-center justify-center py-6">
          <span className="text-xs text-[#9E948C] animate-pulse">{tr(locale, "加载中…", "Loading…")}</span>
        </div>
      </section>
    );
  }

  if (pairs.length === 0) {
    return (
      <section className="border border-[#241A14] bg-[#FAF7F0] p-3 space-y-3" style={{ boxShadow: "3px 3px 0 0 #241A14" }}>
        <SectionHeader
          dot="#D36E52"
          title={tr(locale, "市场分歧雷达", "Market Divergence Radar")}
          subtitle={tr(locale,
            "对比 Polymarket 预测市场价格与欧洲传统赔率的隐含概率，找出两者判断不一致的比赛。",
            "Compares Polymarket prediction prices vs European bookmaker implied probabilities to find disagreements.")}
        />
        <div className="border border-[#241A14] bg-[#EDE9E0] p-2.5">
          <p className="text-[11px] text-[#9E948C]">
            {tr(locale, "暂无可对比的赛事数据。可能原因：Polymarket 尚无对应的赛事合约或欧赔数据暂未就绪。", "No matchable data. Polymarket may not have contracts for current matches, or bookmaker odds are not yet ready.")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="border border-[#241A14] bg-[#FAF7F0] p-3 space-y-3" style={{ boxShadow: "3px 3px 0 0 #241A14" }}>
      <SectionHeader
        dot="#D36E52"
        title={tr(locale, "市场分歧雷达", "Market Divergence Radar")}
        subtitle={tr(locale,
          "对比 Polymarket 预测市场价格与欧洲传统赔率的隐含概率。分歧越大，说明两套信息源判断越不一致。",
          "Compares Polymarket prediction prices vs European bookmaker implied probabilities. Larger gaps mean greater disagreement.")}
      />

      <div className="space-y-2">
        {pairs.slice(0, 8).map((pair) => {
          const label = getDiffLabel(pair.maxDiff);
          return (
            <div key={pair.oddsMatch.id} className="border border-[#241A14] bg-[#EDE9E0] p-2.5 space-y-2">
              {/* Match Header */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-[10px] text-[#9E948C]">{pair.oddsMatch.kickoffBj}</div>
                  <div className="text-xs font-bold text-[#241A14]">
                    {teamName(pair.oddsMatch.homeTeam, locale)} vs {teamName(pair.oddsMatch.awayTeam, locale)}
                  </div>
                </div>
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 border"
                  style={{ color: label.color, borderColor: label.color }}
                >
                  {tr(locale, label.text, pair.maxDiff >= 15 ? "Significant" : pair.maxDiff >= 8 ? "Notable" : "Aligned")}
                </span>
              </div>

              {/* Probability Comparison Table */}
              <div className="grid grid-cols-4 gap-0 text-center text-[10px] border border-[#241A14]">
                <div className="bg-[#241A14] text-white py-1 font-bold">{tr(locale, "方向", "Side")}</div>
                <div className="bg-[#241A14] text-white py-1 font-bold">Polymarket</div>
                <div className="bg-[#241A14] text-white py-1 font-bold">{tr(locale, "欧赔", "Bookmaker")}</div>
                <div className="bg-[#241A14] text-white py-1 font-bold">{tr(locale, "差异", "Gap")}</div>

                <div className="py-1 border-t border-[#241A14]/20 font-medium">{tr(locale, "主", "H")}</div>
                <div className="py-1 border-t border-[#241A14]/20">{pair.homePolyProb}%</div>
                <div className="py-1 border-t border-[#241A14]/20">{pair.homeBookProb}%</div>
                <div className="py-1 border-t border-[#241A14]/20 font-bold" style={{ color: getDiffLabel(pair.homeDiff).color }}>
                  {pair.homeDiff > 0 ? "+" : ""}{Math.round(pair.homeDiff)}%
                </div>

                <div className="py-1 border-t border-[#241A14]/20 font-medium">{tr(locale, "平", "D")}</div>
                <div className="py-1 border-t border-[#241A14]/20">{pair.drawPolyProb}%</div>
                <div className="py-1 border-t border-[#241A14]/20">{pair.drawBookProb}%</div>
                <div className="py-1 border-t border-[#241A14]/20 font-bold" style={{ color: getDiffLabel(pair.drawDiff).color }}>
                  {pair.drawDiff > 0 ? "+" : ""}{Math.round(pair.drawDiff)}%
                </div>

                <div className="py-1 border-t border-[#241A14]/20 font-medium">{tr(locale, "客", "A")}</div>
                <div className="py-1 border-t border-[#241A14]/20">{pair.awayPolyProb}%</div>
                <div className="py-1 border-t border-[#241A14]/20">{pair.awayBookProb}%</div>
                <div className="py-1 border-t border-[#241A14]/20 font-bold" style={{ color: getDiffLabel(pair.awayDiff).color }}>
                  {pair.awayDiff > 0 ? "+" : ""}{Math.round(pair.awayDiff)}%
                </div>
              </div>

              {/* Explanation */}
              <p className="text-[10px] leading-relaxed text-[#5C524C]">
                {getDiffExplanation(pair, locale)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Educational Note */}
      <div className="border-t border-dashed border-[#241A14]/30 pt-2">
        <p className="text-[10px] leading-relaxed text-[#5C524C]">
          <strong className="text-[#241A14]">{tr(locale, "如何解读：", "How to read: ")}</strong>
          {tr(locale,
            "正数表示 Polymarket 对该方向的估值高于传统赔率，说明散户/预测市场更看好；负数反之。超过 10% 的分歧值得关注。分歧来源可能是：信息时差（一方未反映最新消息）、情绪偏差（散户追热门）、或流动性差异（小池子更易被推动）。",
            "Positive = Polymarket values this outcome higher than bookmakers (retail/market more bullish). Negative = opposite. Gaps over 10% are worth watching. Sources: information lag (one side hasn't priced in news), sentiment bias (retail chasing favorites), or liquidity differences (thin pools are more movable).")}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Arbitrage Detector                                                  */
/* ------------------------------------------------------------------ */

function ArbitrageDetector({
  locale,
  opportunities,
  loading,
}: {
  locale: string;
  opportunities: ArbitrageOpportunity[];
  loading: boolean;
}) {
  if (loading) return null;

  return (
    <section className="border border-[#241A14] bg-[#FAF7F0] p-3 space-y-3" style={{ boxShadow: "3px 3px 0 0 #241A14" }}>
      <SectionHeader
        dot="#9CB48A"
        title={tr(locale, "套利空间扫描", "Arbitrage Scanner")}
        subtitle={tr(locale,
          "当两个市场的隐含概率之和低于 100% 时，理论上存在无风险获利空间。实际操作受手续费、流动性和执行速度限制。",
          "When implied probabilities across sources sum below 100%, a risk-free profit exists in theory. Real execution faces fees, liquidity, and speed constraints.")}
      />

      {opportunities.length === 0 ? (
        <div className="border border-[#241A14] bg-[#EDE9E0] p-2.5">
          <p className="text-[11px] text-[#5C524C]">
            {tr(locale,
              "⚡ 当前未检测到跨市场套利机会。这在高效市场中是正常的——真正的套利窗口通常只存在几秒到几分钟。本工具每次加载时扫描一次，不做实时追踪。",
              "⚡ No cross-market arbitrage detected now. Normal in efficient markets — real arb windows typically last seconds to minutes. This tool scans once per load, not in real-time.")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {opportunities.slice(0, 5).map((opp, index) => (
            <div key={index} className="border border-[#9CB48A] bg-[#EDE9E0] p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#241A14]">{opp.description}</span>
                <span className="text-[10px] font-black text-[#9CB48A] border border-[#9CB48A] px-1.5 py-0.5">
                  +{opp.profitPercent}%
                </span>
              </div>

              <div className="grid grid-cols-4 gap-0 text-center text-[10px] border border-[#241A14]">
                <div className="bg-[#241A14] text-white py-1 font-bold">{tr(locale, "方向", "Side")}</div>
                <div className="bg-[#241A14] text-white py-1 font-bold">{tr(locale, "来源", "Source")}</div>
                <div className="bg-[#241A14] text-white py-1 font-bold">{tr(locale, "赔率", "Odds")}</div>
                <div className="bg-[#241A14] text-white py-1 font-bold">{tr(locale, "下注比例", "Stake %")}</div>
                {opp.legs.map((leg, legIndex) => (
                  <Fragment key={legIndex}>
                    <div className="py-1 border-t border-[#241A14]/20 text-[#5C524C]">{leg.side.split("/")[locale === "zh" ? 0 : 1] || leg.side}</div>
                    <div className="py-1 border-t border-[#241A14]/20 text-[#5C524C]">{leg.source}</div>
                    <div className="py-1 border-t border-[#241A14]/20 font-medium text-[#241A14]">{leg.odds.toFixed(2)}</div>
                    <div className="py-1 border-t border-[#241A14]/20 font-medium text-[#241A14]">{leg.stakePercent}%</div>
                  </Fragment>
                ))}
              </div>

              <p className="text-[10px] text-[#5C524C]">
                {tr(locale,
                  `隐含概率总和 ${Math.round(opp.totalImplied)}% < 100%，理论利润率 ${opp.profitPercent}%。按比例分配资金可覆盖所有结果。`,
                  `Total implied probability ${Math.round(opp.totalImplied)}% < 100%, theoretical profit margin ${opp.profitPercent}%. Proportional staking covers all outcomes.`)}
              </p>
            </div>
          ))}

          {/* Disclaimer */}
          <div className="border-t border-dashed border-[#241A14]/30 pt-2">
            <p className="text-[10px] leading-relaxed text-[#5C524C]">
              <strong className="text-[#D36E52]">{tr(locale, "⚠️ 实操限制：", "⚠️ Real constraints: ")}</strong>
              {tr(locale,
                "1) Polymarket 有交易手续费（约 2%）和提现成本；2) 赔率随时变动，下注后对手盘可能不足；3) 跨平台资金转移需要时间；4) 单边限额可能无法完全覆盖。上述利润率未扣除手续费，实际执行可能无利可图。",
                "1) Polymarket charges ~2% trading fees plus withdrawal costs; 2) Odds move constantly, liquidity may be thin; 3) Cross-platform fund transfer takes time; 4) Position limits may prevent full coverage. Displayed margins exclude fees — real execution may not be profitable.")}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Odds Converter (existing, improved)                                 */
/* ------------------------------------------------------------------ */

function OddsConverter({
  locale,
  matches,
  selectedMatch,
  selectedMatchId,
  oddsInputs,
  onSelectMatch,
  onOddsChange,
}: {
  locale: string;
  matches: OddsMatch[];
  selectedMatch: OddsMatch | undefined;
  selectedMatchId: string;
  oddsInputs: OddsInputs;
  onSelectMatch: (matchId: string) => void;
  onOddsChange: (outcome: OutcomeKey, value: string) => void;
}) {
  const home = toImpliedPercent(oddsInputs.home);
  const draw = toImpliedPercent(oddsInputs.draw);
  const away = toImpliedPercent(oddsInputs.away);
  const hasResult = home !== null && draw !== null && away !== null;
  const total = hasResult ? home + draw + away : null;

  return (
    <section className="border border-[#241A14] bg-[#FAF7F0] p-3 space-y-3" style={{ boxShadow: "3px 3px 0 0 #241A14" }}>
      <SectionHeader
        dot="#E4A853"
        title={tr(locale, "赔率转概率", "Odds to Probability")}
        subtitle={tr(locale, "选择赛事自动导入欧赔，也可以手工调整。公式：1 ÷ 欧赔 × 100%。", "Pick a match to import decimal odds, then adjust manually if needed. Formula: 1 / odds × 100%.")}
      />

      <FieldShell label={tr(locale, "赛事选择", "Match")}>
        <select
          value={selectedMatchId}
          onChange={(event) => onSelectMatch(event.target.value)}
          className="w-full border-2 border-[#241A14] bg-[#F5F1E8] px-2 py-1.5 text-xs text-[#241A14] focus:border-[#D36E52] focus:outline-none"
        >
          <option value="">
            {matches.length ? tr(locale, "选择一场已接入欧赔的赛事", "Select a match with odds") : tr(locale, "暂无可导入欧赔的赛事", "No importable odds yet")}
          </option>
          {matches.map((match) => (
            <option key={match.id} value={match.id}>
              {oddsMatchOptionLabel(match, locale)}
            </option>
          ))}
        </select>
        {selectedMatch && (
          <span className="block text-[10px] text-[#9E948C]">
            {selectedMatch.source} · {selectedMatch.bookmakerCount} {tr(locale, "家机构均值 · 可继续手动微调", "bookmaker average · still editable")}
          </span>
        )}
      </FieldShell>

      <div className="grid grid-cols-3 gap-2">
        <FieldShell label={tr(locale, "主胜", "Home")}>
          <NumberInput value={oddsInputs.home} onChange={(value) => onOddsChange("home", value)} placeholder="1.85" />
          <span className="block h-4 text-[11px] font-bold text-[#D36E52]">{home !== null ? `${home}%` : "-"}</span>
        </FieldShell>
        <FieldShell label={tr(locale, "平局", "Draw")}>
          <NumberInput value={oddsInputs.draw} onChange={(value) => onOddsChange("draw", value)} placeholder="3.40" />
          <span className="block h-4 text-[11px] font-bold text-[#D36E52]">{draw !== null ? `${draw}%` : "-"}</span>
        </FieldShell>
        <FieldShell label={tr(locale, "客胜", "Away")}>
          <NumberInput value={oddsInputs.away} onChange={(value) => onOddsChange("away", value)} placeholder="4.20" />
          <span className="block h-4 text-[11px] font-bold text-[#D36E52]">{away !== null ? `${away}%` : "-"}</span>
        </FieldShell>
      </div>

      <AnimatePresence>
        {hasResult && total !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border border-[#241A14] bg-[#EDE9E0] p-2.5">
              <div className="flex h-4 overflow-hidden border border-[#241A14]">
                <div className="flex items-center justify-center bg-[#D36E52] text-[9px] font-bold text-white" style={{ width: `${home}%` }}>
                  {home}%
                </div>
                <div className="flex items-center justify-center bg-[#9E948C] text-[9px] font-bold text-white" style={{ width: `${draw}%` }}>
                  {draw}%
                </div>
                <div className="flex flex-1 items-center justify-center bg-[#5C524C] text-[9px] font-bold text-white">
                  {away}%
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-[#5C524C]">
                {tr(locale, "三项合计", "Total")} <strong className="text-[#241A14]">{total}%</strong>
                {total > 100
                  ? tr(locale, `，高出 100% 的 ${total - 100}% 可以理解为机构利润空间。`, `, ${total - 100}% over 100%, which is roughly the bookmaker margin.`)
                  : tr(locale, "，低于或接近 100%，说明这组输入更像用户自定义情景。", ", at or below 100%, so this looks more like a custom scenario.")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Expectation Calculator (existing)                                   */
/* ------------------------------------------------------------------ */

function ExpectationCalculator({
  locale,
  selectedMatch,
  selectedOutcome,
  oddsInputs,
  onOutcomeChange,
  onOddsChange,
}: {
  locale: string;
  selectedMatch: OddsMatch | undefined;
  selectedOutcome: OutcomeKey;
  oddsInputs: OddsInputs;
  onOutcomeChange: (outcome: OutcomeKey) => void;
  onOddsChange: (outcome: OutcomeKey, value: string) => void;
}) {
  const [hitRateOverride, setHitRateOverride] = useState<{ key: string; value: string } | null>(null);
  const [stake, setStake] = useState("");
  const importedOdds = oddsInputs[selectedOutcome];
  const importedHitRate = getOutcomeProbability(selectedMatch, selectedOutcome)?.toString() || "";
  const hitRateKey = `${selectedMatch?.id || "custom"}:${selectedOutcome}:${importedHitRate}`;
  const odds = importedOdds;
  const hitRate = hitRateOverride?.key === hitRateKey ? hitRateOverride.value : importedHitRate;

  const result = useMemo(() => {
    const oddsValue = Number.parseFloat(odds);
    const hitRateValue = Number.parseFloat(hitRate);
    const stakeValue = Number.parseFloat(stake);
    if (
      !Number.isFinite(oddsValue) ||
      !Number.isFinite(hitRateValue) ||
      !Number.isFinite(stakeValue) ||
      oddsValue <= 1 ||
      hitRateValue < 0 ||
      hitRateValue > 100 ||
      stakeValue <= 0
    ) {
      return null;
    }

    const probability = hitRateValue / 100;
    const winProfit = stakeValue * (oddsValue - 1);
    const expected = probability * winProfit - (1 - probability) * stakeValue;
    return {
      expected,
      breakEven: Math.round((1 / oddsValue) * 100),
      winProfit,
    };
  }, [odds, hitRate, stake]);

  return (
    <section className="border border-[#241A14] bg-[#FAF7F0] p-3 space-y-3" style={{ boxShadow: "3px 3px 0 0 #241A14" }}>
      <SectionHeader
        dot="#D36E52"
        title={tr(locale, "回报期望计算", "Expected Value")}
        subtitle={tr(locale, "用数学口径看一眼：不是看能不能中，而是看长期是否划算。", "A math check: not whether one pick hits, but whether the long-run price makes sense.")}
      />

      <div className="grid grid-cols-[1.2fr_0.8fr] gap-2">
        <FieldShell label={tr(locale, "联动赛事", "Linked match")}>
          <div className="min-h-8 border-2 border-[#241A14] bg-[#F5F1E8] px-2 py-1.5 text-xs text-[#241A14]">
            {selectedMatch
              ? `${selectedMatch.kickoffBj} ${teamName(selectedMatch.homeTeam, locale)} vs ${teamName(selectedMatch.awayTeam, locale)}`
              : tr(locale, "先在上方选择赛事", "Pick a match above first")}
          </div>
          {selectedMatch && (
            <span className="block text-[10px] text-[#9E948C]">
              {selectedMatch.source} · {selectedMatch.bookmakerCount} {tr(locale, "家机构去水概率", "bookmaker de-vig probability")}
            </span>
          )}
        </FieldShell>
        <FieldShell label={tr(locale, "结果方向", "Outcome")}>
          <select
            value={selectedOutcome}
            disabled={!selectedMatch}
            onChange={(event) => onOutcomeChange(event.target.value as OutcomeKey)}
            className="w-full border-2 border-[#241A14] bg-[#F5F1E8] px-2 py-1.5 text-xs text-[#241A14] disabled:text-[#9E948C] focus:border-[#D36E52] focus:outline-none"
          >
            <option value="home">{getOutcomeLabel(selectedMatch, "home", locale)}</option>
            <option value="draw">{getOutcomeLabel(selectedMatch, "draw", locale)}</option>
            <option value="away">{getOutcomeLabel(selectedMatch, "away", locale)}</option>
          </select>
        </FieldShell>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <FieldShell label={tr(locale, "欧赔", "Decimal odds")}>
          <NumberInput
            value={odds}
            onChange={(value) => {
              onOddsChange(selectedOutcome, value);
            }}
            placeholder="2.00"
          />
        </FieldShell>
        <FieldShell label={tr(locale, "估计命中率", "Hit rate")}>
          <NumberInput
            value={hitRate}
            onChange={(value) => setHitRateOverride({ key: hitRateKey, value })}
            placeholder="50"
          />
        </FieldShell>
        <FieldShell label={tr(locale, "投入金额", "Stake")}>
          <NumberInput value={stake} onChange={setStake} placeholder="100" />
        </FieldShell>
      </div>

      <div className="border border-[#241A14] bg-[#EDE9E0] p-2.5">
        {result ? (
          <div className="space-y-1 text-[11px] text-[#5C524C]">
            <p>
              {tr(locale, "打平所需命中率：", "Break-even hit rate:")}<strong className="text-[#241A14]">{result.breakEven}%</strong>
            </p>
            <p>
              {tr(locale, "命中时净收益：", "Net profit if it hits:")}<strong className="text-[#241A14]">{Math.round(result.winProfit)}</strong>
            </p>
            <p>
              {tr(locale, "单次期望：", "Expected value:")}{" "}
              <strong className={result.expected >= 0 ? "text-[#9CB48A]" : "text-[#D36E52]"}>
                {result.expected >= 0 ? "+" : ""}
                {Math.round(result.expected)} {tr(locale, "元", "")}
              </strong>
            </p>
            <p className="pt-1 leading-relaxed">
              {tr(locale, "大白话：", "Plain read:")}
              {result.expected >= 0
                ? tr(locale, " 你的自估命中率高于打平线，数学期望为正，但仍不代表单场一定赚。", " Your estimated hit rate is above break-even, so EV is positive, but one match can still lose.")
                : tr(locale, " 你的自估命中率低于打平线，长期看大概率不划算。", " Your estimated hit rate is below break-even, so it is probably bad value long term.")}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-[#9E948C]">{tr(locale, "请输入有效的赔率、命中率和金额。", "Enter valid odds, hit rate, and stake.")}</p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Glossary                                                            */
/* ------------------------------------------------------------------ */

const glossary = [
  {
    key: "市场概率",
    zh: { title: "市场概率", desc: "预测市场里资金押出来的概率。它不是专家结论，而是参与者用真金白银形成的集体判断。" },
    en: { title: "Market probability", desc: "The probability implied by money in a prediction market. It is not an expert verdict; it is a crowd price backed by real stakes." },
  },
  {
    key: "赔率隐含概率",
    zh: { title: "赔率隐含概率", desc: "把赔率倒推成概率。比如 2.00 对应 50%，1.50 对应约 67%。" },
    en: { title: "Implied probability", desc: "Probability derived from odds. Decimal odds of 2.00 imply 50%; 1.50 implies about 67%." },
  },
  {
    key: "信息差",
    zh: { title: "信息差 / 市场分歧", desc: "市场概率和赔率隐含概率之间的差。差距越大，说明两套判断越不一致。可能源于信息时差、情绪偏差或流动性差异。" },
    en: { title: "Market gap / Divergence", desc: "The difference between market probability and bookmaker implied probability. Bigger gaps mean the two views disagree more. Sources: info lag, sentiment bias, or liquidity differences." },
  },
  {
    key: "水位",
    zh: { title: "水位 / 抽水", desc: "三项隐含概率加起来通常超过 100%，超出的部分可以理解为机构利润空间（一般 5-12%）。" },
    en: { title: "Margin / Vig / Juice", desc: "The three implied probabilities usually add up to more than 100%; the excess (typically 5-12%) is roughly bookmaker margin." },
  },
  {
    key: "套利",
    zh: { title: "套利 (Arbitrage)", desc: "利用不同市场间的定价差异，在同一赛事的所有结果上下注，无论哪个结果出现都能获利的策略。条件是各方隐含概率之和低于 100%。" },
    en: { title: "Arbitrage", desc: "Exploiting price differences between markets by betting all outcomes of the same event to guarantee profit regardless of result. Requires total implied probability below 100%." },
  },
  {
    key: "预测市场",
    zh: { title: "预测市场 (Polymarket)", desc: "参与者通过买卖合约来预测事件结果的去中心化市场。价格即概率：0.65 的合约意味着市场认为事件有 65% 概率发生。" },
    en: { title: "Prediction market (Polymarket)", desc: "A decentralized market where participants buy/sell contracts to predict outcomes. Price equals probability: a $0.65 contract means the market assigns 65% probability." },
  },
  {
    key: "去水概率",
    zh: { title: "去水概率 (De-vig)", desc: "把机构利润空间剔除后的真实概率估计。方法：各项隐含概率 ÷ 总和，使三项加起来恰好等于 100%。" },
    en: { title: "De-vig probability", desc: "Real probability estimate after removing bookmaker margin. Method: divide each implied probability by the total, so all three sum to exactly 100%." },
  },
];

/* ------------------------------------------------------------------ */
/*  Main Screen                                                         */
/* ------------------------------------------------------------------ */

// Need Fragment for table rows
import { Fragment } from "react";

export function ToolsScreen() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [matches, setMatches] = useState<OddsMatch[]>([]);
  const [radarMatches, setRadarMatches] = useState<RadarMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeKey>("home");
  const [oddsInputs, setOddsInputs] = useState<OddsInputs>(emptyOddsInputs);
  const [radarLoading, setRadarLoading] = useState(true);
  const selectedMatch = matches.find((match) => match.id === selectedMatchId);

  // Load odds data — prioritize unfinished matches, fall back to all if none available
  useEffect(() => {
    let cancelled = false;
    async function loadOdds() {
      const response = await fetch("/api/data/odds");
      if (!response.ok) return;
      const data = (await response.json()) as { oddsMatches?: OddsMatch[] };
      if (cancelled) return;
      const allWithOdds = (data.oddsMatches || [])
        .filter((match) => match.homeOdds && match.drawOdds && match.awayOdds);
      const upcoming = allWithOdds.filter((match) => match.status !== "finished");
      // Use upcoming matches if available; otherwise show all (including finished) so the tool remains usable
      const displayMatches = upcoming.length > 0 ? upcoming : allWithOdds;
      setMatches(
        displayMatches.sort((a, b) => {
          // Upcoming/live first, then finished
          const statusOrder = (s: string | undefined) => s === "live" ? 0 : s === "upcoming" ? 1 : 2;
          const orderDiff = statusOrder(a.status) - statusOrder(b.status);
          if (orderDiff !== 0) return orderDiff;
          // Within same status, sort by kickoff time (nearest first)
          if (a.kickoffAt && b.kickoffAt) return a.kickoffAt.localeCompare(b.kickoffAt);
          return a.kickoffBj.localeCompare(b.kickoffBj);
        }),
      );
    }

    void loadOdds();
    return () => { cancelled = true; };
  }, []);

  // Load radar (Polymarket) data
  useEffect(() => {
    let cancelled = false;
    async function loadRadar() {
      try {
        const response = await fetch("/api/data/radar");
        if (!response.ok) return;
        const data = (await response.json()) as { radarMatches?: RadarMatch[] };
        if (cancelled) return;
        setRadarMatches(data.radarMatches || []);
      } finally {
        if (!cancelled) setRadarLoading(false);
      }
    }

    void loadRadar();
    return () => { cancelled = true; };
  }, []);

  // Match Polymarket data to bookmaker odds
  const matchedPairs = useMemo(() => matchRadarToOdds(radarMatches, matches), [radarMatches, matches]);

  // Detect arbitrage opportunities
  const arbitrageOpportunities = useMemo(() => findArbitrageOpportunities(matchedPairs), [matchedPairs]);

  function importMatchOdds(match: OddsMatch) {
    setOddsInputs({
      home: formatOdds(match.homeOdds),
      draw: formatOdds(match.drawOdds),
      away: formatOdds(match.awayOdds),
    });
  }

  function selectMatch(matchId: string) {
    setSelectedMatchId(matchId);
    const match = matches.find((item) => item.id === matchId);
    if (match) {
      importMatchOdds(match);
    } else {
      setOddsInputs(emptyOddsInputs);
    }
  }

  function updateOdds(outcome: OutcomeKey, value: string) {
    setOddsInputs((current) => ({ ...current, [outcome]: value }));
  }

  return (
    <div className="flex min-h-svh flex-col bg-[#F5F1E8]">
      <div className="border-b-2 border-[#241A14] bg-[#FAF7F0] px-4 py-3">
        <div className="mb-0.5 text-[10px] font-black uppercase tracking-[0.25em] text-[#9E948C]" style={{ fontFamily: "var(--font-heading)" }}>
          {tr(locale, "观赛概率工具箱", "Viewing Probability Toolkit")}
        </div>
        <h1 className="text-2xl font-black leading-tight text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          {tr(locale, "看懂盘面不被坑", "Read the Market Clearly")}
        </h1>
        <p className="mt-0.5 text-xs text-[#9E948C]">
          {tr(locale, "跨市场对比分析，只做换算和解释，不提供下注入口，不跳转任何博彩平台。", "Cross-market comparison & analysis. Conversions and explanations only. No betting links.")}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* NEW: Market Discrepancy Analysis */}
        <MarketDiscrepancyAnalysis
          locale={locale}
          pairs={matchedPairs}
          loading={radarLoading}
        />

        {/* NEW: Arbitrage Detector */}
        <ArbitrageDetector
          locale={locale}
          opportunities={arbitrageOpportunities}
          loading={radarLoading}
        />

        {/* Existing: Odds Converter */}
        <OddsConverter
          locale={locale}
          matches={matches}
          selectedMatch={selectedMatch}
          selectedMatchId={selectedMatchId}
          oddsInputs={oddsInputs}
          onSelectMatch={selectMatch}
          onOddsChange={updateOdds}
        />

        {/* Existing: Expectation Calculator */}
        <ExpectationCalculator
          locale={locale}
          selectedMatch={selectedMatch}
          selectedOutcome={selectedOutcome}
          oddsInputs={oddsInputs}
          onOutcomeChange={setSelectedOutcome}
          onOddsChange={updateOdds}
        />

        {/* Enhanced Glossary */}
        <section className="border border-[#241A14] bg-[#FAF7F0] p-3 space-y-3">
          <SectionHeader
            dot="#9CB48A"
            title={tr(locale, "黑话翻译", "Glossary")}
          />
          <div className="space-y-2">
            {glossary.map((item) => (
              <article key={item.key} className="border-t border-dashed border-[#241A14]/30 pt-2">
                <h3 className="text-xs font-bold text-[#241A14]">
                  {locale === "zh" ? item.zh.title : item.en.title}
                </h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#5C524C]">
                  {locale === "zh" ? item.zh.desc : item.en.desc}
                </p>
              </article>
            ))}
          </div>
        </section>

        <div className="border border-[#241A14] bg-[#EDE9E0] p-3 text-xs leading-relaxed text-[#5C524C]">
          <strong className="text-[#241A14]">{tr(locale, "使用边界：", "Boundary:")}</strong>
          {tr(locale, "本页用于理解概率和赔率，不构成任何投注建议。观赛快乐就够了，别把娱乐工具当成收益承诺。", "This page explains probability and odds. It is not betting advice. Treat it as an entertainment tool, not an income promise.")}
        </div>
      </div>
    </div>
  );
}
