"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { OddsMatch } from "@/lib/wc-data";
import { teamName, tr } from "@/lib/i18n/content";

type OutcomeKey = "home" | "draw" | "away";
type OddsInputs = Record<OutcomeKey, string>;

const emptyOddsInputs: OddsInputs = {
  home: "",
  draw: "",
  away: "",
};

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
      <div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#E4A853]" />
          <h2 className="text-xs font-black tracking-wider text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
            {tr(locale, "赔率转概率", "Odds to Probability")}
          </h2>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[#9E948C]">
          {tr(locale, "选择赛事自动导入欧赔，也可以手工调整。公式：1 ÷ 欧赔 × 100%。", "Pick a match to import decimal odds, then adjust manually if needed. Formula: 1 / odds × 100%.")}
        </p>
      </div>

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
                三项合计 <strong className="text-[#241A14]">{total}%</strong>
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
      <div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#D36E52]" />
          <h2 className="text-xs font-black tracking-wider text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
            {tr(locale, "回报期望计算", "Expected Value")}
          </h2>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[#9E948C]">
          {tr(locale, "用数学口径看一眼：不是看能不能中，而是看长期是否划算。", "A math check: not whether one pick hits, but whether the long-run price makes sense.")}
        </p>
      </div>

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
                {Math.round(result.expected)} 元
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

const glossary = [
  {
    title: "市场概率",
    desc: "预测市场里资金押出来的概率。它不是专家结论，而是参与者用真金白银形成的集体判断。",
  },
  {
    title: "赔率隐含概率",
    desc: "把赔率倒推成概率。比如 2.00 对应 50%，1.50 对应约 67%。",
  },
  {
    title: "信息差",
    desc: "市场概率和赔率隐含概率之间的差。差距越大，说明两套判断越不一致。",
  },
  {
    title: "水位",
    desc: "三项隐含概率加起来通常超过 100%，超出的部分可以理解为机构利润空间。",
  },
];

const glossaryEn: Record<string, { title: string; desc: string }> = {
  市场概率: {
    title: "Market probability",
    desc: "The probability implied by money in a prediction market. It is not an expert verdict; it is a crowd price backed by real stakes.",
  },
  赔率隐含概率: {
    title: "Implied probability",
    desc: "Probability derived from odds. Decimal odds of 2.00 imply 50%; 1.50 implies about 67%.",
  },
  信息差: {
    title: "Market gap",
    desc: "The difference between market probability and bookmaker implied probability. Bigger gaps mean the two views disagree more.",
  },
  水位: {
    title: "Margin",
    desc: "The three implied probabilities usually add up to more than 100%; the excess is roughly bookmaker margin.",
  },
};

export function ToolsScreen() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [matches, setMatches] = useState<OddsMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeKey>("home");
  const [oddsInputs, setOddsInputs] = useState<OddsInputs>(emptyOddsInputs);
  const selectedMatch = matches.find((match) => match.id === selectedMatchId);

  useEffect(() => {
    let cancelled = false;
    async function loadOdds() {
      const response = await fetch("/api/data/odds");
      if (!response.ok) return;
      const data = (await response.json()) as { oddsMatches?: OddsMatch[] };
      if (cancelled) return;
      setMatches((data.oddsMatches || []).filter((match) => match.homeOdds && match.drawOdds && match.awayOdds));
    }

    void loadOdds();
    return () => {
      cancelled = true;
    };
  }, []);

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
          {tr(locale, "只做换算和解释，不提供下注入口，不跳转任何博彩平台。", "Conversions and explanations only. No betting entry points and no gambling-site links.")}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <OddsConverter
          locale={locale}
          matches={matches}
          selectedMatch={selectedMatch}
          selectedMatchId={selectedMatchId}
          oddsInputs={oddsInputs}
          onSelectMatch={selectMatch}
          onOddsChange={updateOdds}
        />
        <ExpectationCalculator
          locale={locale}
          selectedMatch={selectedMatch}
          selectedOutcome={selectedOutcome}
          oddsInputs={oddsInputs}
          onOutcomeChange={setSelectedOutcome}
          onOddsChange={updateOdds}
        />

        <section className="border border-[#241A14] bg-[#FAF7F0] p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#9CB48A]" />
            <h2 className="text-xs font-black tracking-wider text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
              {tr(locale, "黑话翻译", "Glossary")}
            </h2>
          </div>
          <div className="space-y-2">
            {glossary.map((item) => (
              <article key={item.title} className="border-t border-dashed border-[#241A14]/30 pt-2">
                <h3 className="text-xs font-bold text-[#241A14]">{tr(locale, item.title, glossaryEn[item.title]?.title || item.title)}</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#5C524C]">{tr(locale, item.desc, glossaryEn[item.title]?.desc || item.desc)}</p>
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
