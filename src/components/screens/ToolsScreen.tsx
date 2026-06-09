"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

function toImpliedPercent(value: string): number | null {
  const odds = Number.parseFloat(value);
  if (!Number.isFinite(odds) || odds <= 1) return null;
  return Math.round((1 / odds) * 100);
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

function OddsConverter() {
  const [homeOdds, setHomeOdds] = useState("");
  const [drawOdds, setDrawOdds] = useState("");
  const [awayOdds, setAwayOdds] = useState("");

  const home = toImpliedPercent(homeOdds);
  const draw = toImpliedPercent(drawOdds);
  const away = toImpliedPercent(awayOdds);
  const hasResult = home !== null && draw !== null && away !== null;
  const total = hasResult ? home + draw + away : null;

  return (
    <section className="border border-[#241A14] bg-[#FAF7F0] p-3 space-y-3" style={{ boxShadow: "3px 3px 0 0 #241A14" }}>
      <div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#E4A853]" />
          <h2 className="text-xs font-black tracking-wider text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
            赔率转概率
          </h2>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[#9E948C]">
          输入欧赔，自动换成隐含概率。公式：1 ÷ 欧赔 × 100%。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <FieldShell label="主胜">
          <NumberInput value={homeOdds} onChange={setHomeOdds} placeholder="1.85" />
          <span className="block h-4 text-[11px] font-bold text-[#D36E52]">{home !== null ? `${home}%` : "-"}</span>
        </FieldShell>
        <FieldShell label="平局">
          <NumberInput value={drawOdds} onChange={setDrawOdds} placeholder="3.40" />
          <span className="block h-4 text-[11px] font-bold text-[#D36E52]">{draw !== null ? `${draw}%` : "-"}</span>
        </FieldShell>
        <FieldShell label="客胜">
          <NumberInput value={awayOdds} onChange={setAwayOdds} placeholder="4.20" />
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
                  ? `，高出 100% 的 ${total - 100}% 可以理解为机构利润空间。`
                  : "，低于或接近 100%，说明这组输入更像用户自定义情景。"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ExpectationCalculator() {
  const [odds, setOdds] = useState("2.00");
  const [hitRate, setHitRate] = useState("50");
  const [stake, setStake] = useState("100");

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
            回报期望计算
          </h2>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[#9E948C]">
          用数学口径看一眼：不是看能不能中，而是看长期是否划算。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <FieldShell label="欧赔">
          <NumberInput value={odds} onChange={setOdds} placeholder="2.00" />
        </FieldShell>
        <FieldShell label="估计命中率">
          <NumberInput value={hitRate} onChange={setHitRate} placeholder="50" />
        </FieldShell>
        <FieldShell label="投入金额">
          <NumberInput value={stake} onChange={setStake} placeholder="100" />
        </FieldShell>
      </div>

      <div className="border border-[#241A14] bg-[#EDE9E0] p-2.5">
        {result ? (
          <div className="space-y-1 text-[11px] text-[#5C524C]">
            <p>
              打平所需命中率：<strong className="text-[#241A14]">{result.breakEven}%</strong>
            </p>
            <p>
              命中时净收益：<strong className="text-[#241A14]">{Math.round(result.winProfit)} 元</strong>
            </p>
            <p>
              单次期望：{" "}
              <strong className={result.expected >= 0 ? "text-[#9CB48A]" : "text-[#D36E52]"}>
                {result.expected >= 0 ? "+" : ""}
                {Math.round(result.expected)} 元
              </strong>
            </p>
            <p className="pt-1 leading-relaxed">
              大白话：
              {result.expected >= 0
                ? " 你的自估命中率高于打平线，数学期望为正，但仍不代表单场一定赚。"
                : " 你的自估命中率低于打平线，长期看大概率不划算。"}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-[#9E948C]">请输入有效的赔率、命中率和金额。</p>
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

export function ToolsScreen() {
  return (
    <div className="flex min-h-svh flex-col bg-[#F5F1E8]">
      <div className="border-b-2 border-[#241A14] bg-[#FAF7F0] px-4 py-3">
        <div className="mb-0.5 text-[10px] font-black uppercase tracking-[0.25em] text-[#9E948C]" style={{ fontFamily: "var(--font-heading)" }}>
          观赛概率工具箱
        </div>
        <h1 className="text-2xl font-black leading-tight text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          看懂盘面不被坑
        </h1>
        <p className="mt-0.5 text-xs text-[#9E948C]">
          只做换算和解释，不提供下注入口，不跳转任何博彩平台。
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <OddsConverter />
        <ExpectationCalculator />

        <section className="border border-[#241A14] bg-[#FAF7F0] p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#9CB48A]" />
            <h2 className="text-xs font-black tracking-wider text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
              黑话翻译
            </h2>
          </div>
          <div className="space-y-2">
            {glossary.map((item) => (
              <article key={item.title} className="border-t border-dashed border-[#241A14]/30 pt-2">
                <h3 className="text-xs font-bold text-[#241A14]">{item.title}</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#5C524C]">{item.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="border border-[#241A14] bg-[#EDE9E0] p-3 text-xs leading-relaxed text-[#5C524C]">
          <strong className="text-[#241A14]">使用边界：</strong>
          本页用于理解概率和赔率，不构成任何投注建议。观赛快乐就够了，别把娱乐工具当成收益承诺。
        </div>
      </div>
    </div>
  );
}
