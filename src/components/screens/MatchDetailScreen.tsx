"use client";

import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useState } from "react";
import { allMatches, type Match } from "@/lib/wc-data";

function getMatch(id: string): Match | undefined {
  return allMatches.find((m) => m.id === id);
}

interface TalkingPoint {
  label: string;
  title: string;
  desc: string;
  isQuote?: boolean;
}

function getTalkingPoints(match: Match): TalkingPoint[] {
  if (match.homeTeam === "墨西哥") {
    return [
      {
        label: "必聊玄学 01",
        title: "主场优势与适应性",
        desc: `墨西哥在揭幕战迎战南非，主场阿兹特克球场能容纳 8 万球迷。${match.signalText}`,
      },
      {
        label: "必聊玄学 02",
        title: "Polymarket 信号解读",
        desc: "真金白银市场有 62% 资金押注墨西哥赢球，比传统赔率高出 9 个百分点，说明有信息在赔率里没被充分定价。",
      },
      {
        label: "金句卡片 03",
        title: "",
        desc: `「市场比赔率更看好墨西哥，差距 9 个百分点。这种分歧要么是赔率滞后，要么是市场过热——不管哪种，值得关注。」`,
        isQuote: true,
      },
    ];
  }
  if (match.homeTeam === "阿根廷") {
    return [
      {
        label: "必聊玄学 01",
        title: "梅西卫冕首战",
        desc: "梅西本届 38 岁，极可能是最后一届。阿根廷上届靠点球夺冠，本届正选阵容更成熟稳定。",
      },
      {
        label: "必聊玄学 02",
        title: "Polymarket 热度最高",
        desc: `本日交易量最高。${match.signalText}`,
      },
      {
        label: "金句卡片 03",
        title: "",
        desc: "「梅西卫冕、历史上卫冕从未成功——这场无论谁赢，都是话题。」",
        isQuote: true,
      },
    ];
  }
  if (match.homeTeam === "法国") {
    return [
      {
        label: "赛事回顾 01",
        title: "法国 4-0 大胜，开门红",
        desc: "姆巴佩梅开二度，格列兹曼组织无懈可击。澳大利亚防线集体失位。",
      },
      {
        label: "数据解读 02",
        title: "控球 + 反击双线并行",
        desc: "法国场均控球 61%，本场却更多依靠反击而非拿球慢推，体现德尚的务实哲学。",
      },
      {
        label: "金句卡片 03",
        title: "",
        desc: "「法国这届防线居然是最大亮点——整场只让澳大利亚射门 2 次。进攻随时能开，但守住才是夺冠基本盘。」",
        isQuote: true,
      },
    ];
  }
  // Japan vs Germany
  return [
    {
      label: "名场面回顾 01",
      title: "89 分钟绝杀，全网轰动",
      desc: "浅野拓磨 89 分钟单刀突破，低射入网。德国全场控球 70% 却被反击击倒，是 2026 届目前最大爆冷。",
    },
    {
      label: "数据解读 02",
      title: "反击效率压倒控球优势",
      desc: "日本全场只有 4 次射门，3 次射正，2 球入网。控球率与进球数的矛盾是饭局最好的聊天话题。",
    },
    {
      label: "金句卡片 03",
      title: "",
      desc: "「足球不是PPT，控球率 70% 不等于赢。德国昨晚就是一份精美的落败报告。」",
      isQuote: true,
    },
  ];
}

export function MatchDetailScreen() {
  const params = useParams();
  const router = useRouter();
  const match = getMatch(params.id as string);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (!match) {
    return (
      <div className="flex flex-col min-h-svh bg-[#F5F1E8] items-center justify-center p-8">
        <p className="text-[#9E948C] text-sm">比赛数据未找到</p>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 border-2 border-[#241A14] text-xs font-bold bg-[#FAF7F0]"
        >
          ← 返回
        </motion.button>
      </div>
    );
  }

  const points = getTalkingPoints(match);

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
          ← 返回赛程
        </motion.button>
        <span
          className="font-black text-sm text-[#241A14]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          深度装杯分析
        </span>
        <span className="text-[10px] text-[#D36E52] font-bold uppercase tracking-widest">独家情报</span>
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
            {match.group} · {match.round}
          </div>

          <div className="flex justify-center items-center gap-6 my-3">
            {/* Home */}
            <div className="text-center">
              <span className="text-4xl">{match.homeFlag}</span>
              <div
                className="font-black text-base mt-1 text-[#241A14]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {match.homeTeam}
              </div>
              {match.status !== "upcoming" && (
                <div className="text-2xl font-black text-[#D36E52] mt-1">{match.homeScore}</div>
              )}
            </div>

            {/* Middle */}
            <div className="text-center">
              {match.status === "upcoming" ? (
                <>
                  <div className="font-serif text-xs text-[#9E948C] font-bold">胜率概率对冲</div>
                  <div className="font-mono text-lg font-black text-[#D36E52] mt-1">
                    {match.homeWinProb}% - {match.awayWinProb}%
                  </div>
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
                {match.awayTeam}
              </div>
              {match.status !== "upcoming" && (
                <div className="text-2xl font-black text-[#D36E52] mt-1">{match.awayScore}</div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-[#9E948C] font-serif">
            {match.status === "upcoming" ? `开赛时间：${match.kickoffBj}（北京时间）` : "已完赛"}
            {match.venue && ` · ${match.venue}`}
          </div>
        </div>

        {/* Preview text */}
        {match.previewText && (
          <div className="border-l-2 border-[#D36E52] pl-3 text-sm text-[#5C524C]">
            {match.previewText}
          </div>
        )}

        {/* Talking points header */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#D36E52] rounded-full" />
          <h4
            className="font-bold text-sm tracking-wider text-[#241A14]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            该场比赛装杯指南（核心 3 点）
          </h4>
        </div>

        {/* Points */}
        {points.map((pt, idx) => (
          <motion.div
            key={idx}
            className="border border-dashed border-[#241A14] p-3 bg-[#FAF7F0] space-y-1"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
          >
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 ${
                pt.isQuote ? "bg-[#E4A853] text-[#241A14]" : "bg-[#D36E52] text-white"
              }`}
            >
              {pt.label}
            </span>
            {pt.title && (
              <h5 className="text-xs font-black text-[#241A14] pt-1">{pt.title}</h5>
            )}
            <p className="text-xs text-[#5C524C] leading-relaxed pt-0.5">{pt.desc}</p>
            {pt.isQuote && (
              <div className="mt-2 text-right">
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={() => copyText(pt.desc, idx)}
                  className={`px-2.5 py-0.5 text-[10px] font-bold border border-[#241A14] transition-colors ${
                    copiedIdx === idx ? "bg-[#9CB48A] text-white" : "bg-[#241A14] text-white hover:bg-[#D36E52]"
                  }`}
                >
                  {copiedIdx === idx ? "✓ 已复制" : "复制金句"}
                </motion.button>
              </div>
            )}
          </motion.div>
        ))}

        {/* Highlights link */}
        {match.highlights && (
          <div className="border border-[#241A14] p-3 flex justify-between items-center bg-[#FAF7F0]">
            <span className="text-xs text-[#5C524C]">官方集锦已出，快去看看</span>
            <a
              href={match.highlights}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 bg-[#9CB48A] text-white text-xs font-bold border border-[#241A14] hover:bg-[#241A14] transition-colors"
            >
              → 看集锦（B站）
            </a>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] text-[#9E948C] text-center py-2">
          * 本情报纯属观赛娱乐，不含任何诱导性投注建议。
          数据来自 Polymarket 真实资金池，仅供参考。
        </p>
      </div>
    </div>
  );
}
