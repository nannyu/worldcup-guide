"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { History } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  browserScheduleDateQuery,
  type GossipItem,
  type Match,
  type MorningBrief,
  type NewsArticle,
} from "@/lib/wc-data";
import { articleBody, articleKeyPoints, articleSummary, articleTitle, articleTranslationState, teamName, tr } from "@/lib/i18n/content";

// Event tag labels
const tagLabels: Record<string, { label: string; color: string }> = {
  goal: { label: "进球", color: "bg-[#9CB48A] text-white" },
  yellow: { label: "黄牌", color: "bg-[#E4A853] text-[#241A14]" },
  red: { label: "红牌", color: "bg-[#D36E52] text-white" },
  penalty: { label: "点球", color: "bg-[#D36E52] text-white" },
  og: { label: "乌龙球", color: "bg-[#9E948C] text-white" },
};

const fallbackMorningBrief: MorningBrief = {
  issueDate: "",
  edition: "",
  title: "",
  summary: "",
  quote: "",
  sourceLabel: "等待数据源",
  updatedAt: "",
  matches: [],
  news: [],
  gossipItems: [],
};

const morningDateKey = "today";
const morningRefreshIntervalMs = 60_000;

function formatBrowserEdition(date: Date, locale: string): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return tr(locale, `${year}-${month}-${day} 早报`, `${year}-${month}-${day} Brief`);
}

function matchDigest(match: Match, locale: string): string {
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  if (match.status === "finished" && hasScore) {
    return `${teamName(match.homeTeam, locale)} ${match.homeScore}:${match.awayScore} ${teamName(match.awayTeam, locale)}.`;
  }
  if (match.status === "live") {
    return hasScore
      ? tr(
          locale,
          `比赛进行中：${teamName(match.homeTeam, locale)} ${match.homeScore}:${match.awayScore} ${teamName(match.awayTeam, locale)}，事件时间线随比分源更新。`,
          `Live: ${teamName(match.homeTeam, locale)} ${match.homeScore}:${match.awayScore} ${teamName(match.awayTeam, locale)}. Event timeline updates with the score feed.`,
        )
      : tr(locale, "比赛进行中，比分和事件等待比分源更新。", "The match is live. Score and events are waiting for the score feed.");
  }
  return tr(
    locale,
    `${match.kickoffBj} 北京时间开赛，地点：${match.venue || "待确认"}。赛果和事件等待比分源更新。`,
    `${match.kickoffBj} Beijing time. Venue: ${match.venue || "TBC"}. Results and events will appear once the score feed updates.`,
  );
}

function matchQuickRead(match: Match, locale: string, now: Date): string {
  const isZhLocale = locale.toLowerCase().startsWith("zh");
  const aiText = isZhLocale
    ? match.aiBriefZh || match.aiBriefEn
    : match.aiBriefEn || match.aiBriefZh;
  if (aiText) return aiText;
  if (hasMatchStarted(match, now) && match.status === "upcoming") {
    return tr(
      locale,
      "比赛已到开赛时间，正在等待比分源推送比分、事件和赛果。",
      "Kickoff time has arrived. Waiting for the score feed to push score, events, and result.",
    );
  }
  return matchDigest(match, locale);
}

function matchKickoffDate(match: Match): Date | undefined {
  if (match.kickoffAt) {
    const parsed = new Date(match.kickoffAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const [, month, day, hour, minute] =
    match.kickoffBj.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/) || [];
  if (!month || !day || !hour || !minute) return undefined;
  const parsed = new Date(`2026-${month}-${day}T${hour}:${minute}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function hasMatchStarted(match: Match, now: Date): boolean {
  if (match.status === "live" || match.status === "finished") return true;
  const kickoff = matchKickoffDate(match);
  return kickoff ? now.getTime() >= kickoff.getTime() : false;
}

function probabilityPreview(match: Match, locale: string): string | undefined {
  if (match.homeWinProb > 0 || match.drawProb > 0 || match.awayWinProb > 0) {
    const sourceNote = tr(
      locale,
      " 来源：预测市场聚合；非确定性判断。",
      " Source: prediction-market aggregate; not a deterministic forecast.",
    );
    return tr(
      locale,
      `市场概率暂看 ${teamName(match.homeTeam, locale)} ${match.homeWinProb}%、平局 ${match.drawProb}%、${teamName(match.awayTeam, locale)} ${match.awayWinProb}%。${sourceNote}`,
      `Market probability: ${teamName(match.homeTeam, locale)} ${match.homeWinProb}%, draw ${match.drawProb}%, ${teamName(match.awayTeam, locale)} ${match.awayWinProb}%.${sourceNote}`,
    );
  }
  if (match.oddsImpliedHome > 0 || match.oddsImpliedDraw > 0 || match.oddsImpliedAway > 0) {
    const bookmakerCount = match.updatedAt.match(/The Odds API\s+(\d+)\s+家均值/i)?.[1];
    const sourceNote = bookmakerCount
      ? tr(
          locale,
          ` 来源：The Odds API ${bookmakerCount} 家均值；非实时秒级盘口。`,
          ` Source: The Odds API average across ${bookmakerCount} bookmakers; not second-by-second live odds.`,
        )
      : tr(
          locale,
          " 来源：The Odds API 赔率聚合；非实时秒级盘口。",
          " Source: The Odds API odds aggregate; not second-by-second live odds.",
        );
    return tr(
      locale,
      `赔率隐含概率为主胜 ${match.oddsImpliedHome}%、平局 ${match.oddsImpliedDraw}%、客胜 ${match.oddsImpliedAway}%。${sourceNote}`,
      `Implied odds: home ${match.oddsImpliedHome}%, draw ${match.oddsImpliedDraw}%, away ${match.oddsImpliedAway}%.${sourceNote}`,
    );
  }
  return undefined;
}

function preMatchAnalysis(match: Match, locale: string): Array<{ label: string; text: string }> {
  const marketText = probabilityPreview(match, locale);
  return [
    {
      label: tr(locale, "赛前基线", "Preview baseline"),
      text: match.previewText || tr(
        locale,
        `${teamName(match.homeTeam, locale)}对阵${teamName(match.awayTeam, locale)}，开赛前先关注阵容、节奏和定位球攻防。`,
        `${teamName(match.homeTeam, locale)} face ${teamName(match.awayTeam, locale)}. Before kickoff, watch team shape, tempo, and set-piece defending.`,
      ),
    },
    {
      label: tr(locale, "现场变量", "Match context"),
      text: tr(
        locale,
        `${match.kickoffBj} 北京时间开赛，地点：${match.venue || "待确认"}。`,
        `${match.kickoffBj} Beijing time. Venue: ${match.venue || "TBC"}.`,
      ),
    },
    marketText
      ? {
          label: tr(locale, "市场信号", "Market signal"),
          text: marketText,
        }
      : undefined,
  ].filter((item): item is { label: string; text: string } => Boolean(item?.text));
}

function MatchResultCard({ match, locale, now = new Date() }: { match: Match; locale: string; now?: Date }) {
  const [expanded, setExpanded] = useState(false);
  const inActualPhase = hasMatchStarted(match, now);
  const tags = [
    match.status === "finished"
      ? tr(locale, "已完赛", "Finished")
      : match.status === "live"
        ? tr(locale, "直播中", "Live")
        : inActualPhase
          ? tr(locale, "赛况更新中", "Updating")
          : tr(locale, "赛前", "Preview"),
    match.group,
  ];
  const displayHomeScore = match.homeScore ?? 0;
  const displayAwayScore = match.awayScore ?? 0;
  const eventCount = match.events?.length || 0;
  const analysisItems = preMatchAnalysis(match, locale);
  const quickRead = matchQuickRead(match, locale, now);

  return (
    <motion.div
      className="border border-[#241A14] bg-[#FAF7F0]"
      style={{ boxShadow: "3px 3px 0 0 #241A14" }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Top row */}
      <div className="flex justify-between items-center px-3 py-2 border-b border-[#241A14]/30">
        <div className="flex gap-1.5 flex-wrap">
          {tags.map((t) => (
            <span key={t} className="px-1.5 py-0.5 text-[10px] font-bold bg-[#EDE9E0] border border-[#241A14] text-[#241A14]">
              {t}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-[#9E948C]">{match.group} {match.round}</span>
      </div>

      {/* Score row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex flex-col items-center gap-1 flex-1">
          <span className="text-3xl">{match.homeFlag}</span>
          <span
            className="font-bold text-sm text-[#241A14]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {teamName(match.homeTeam, locale)}
          </span>
          <span className="text-[10px] text-[#9E948C]">{tr(locale, "主场", "Home")}</span>
        </div>
        <div className="px-4 py-1 bg-[#241A14] text-white font-mono font-black text-xl tracking-widest">
          {displayHomeScore} : {displayAwayScore}
        </div>
        <div className="flex flex-col items-center gap-1 flex-1">
          <span className="text-3xl">{match.awayFlag}</span>
          <span
            className="font-bold text-sm text-[#241A14]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {teamName(match.awayTeam, locale)}
          </span>
          <span className="text-[10px] text-[#9E948C]">{tr(locale, "客场", "Away")}</span>
        </div>
      </div>

      {/* 30s digest */}
      <div className="mx-3 mb-3 bg-[#EDE9E0] border-l-2 border-[#D36E52] p-2.5 text-xs text-[#5C524C]">
        <strong className="text-[#241A14]">{tr(locale, "30秒看懂：", "30-second read:")}</strong>
        {quickRead}
      </div>

      {!inActualPhase && (
        <div className="px-3 pb-3">
          <div className="border-t border-dashed border-[#241A14]/30 pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#5C524C]">{tr(locale, "赛事前瞻分析", "Match preview")}</span>
              <span className="shrink-0 text-[10px] font-bold text-[#9E948C]">{tr(locale, "开赛前", "Pre-kickoff")}</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {analysisItems.map((item) => (
                <div key={item.label} className="grid grid-cols-[68px_1fr] gap-2 text-xs leading-5">
                  <span className="font-bold text-[#241A14]">{item.label}</span>
                  <span className="text-[#5C524C]">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Live state toggle */}
      {inActualPhase && (
      <div className="px-3 pb-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between py-1.5 text-xs font-bold text-[#5C524C] border-t border-dashed border-[#241A14]/30"
        >
          <span>{tr(locale, "实际战况", "Live state")}</span>
          <span className="ml-auto mr-2 text-[10px] font-normal text-[#9E948C]">
            {eventCount > 0
              ? tr(locale, `${eventCount} 个事件`, `${eventCount} events`)
              : tr(locale, "等待比分源", "Waiting for feed")}
          </span>
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </motion.span>
        </motion.button>

        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="pt-2 space-y-1.5 overflow-hidden"
          >
            {eventCount > 0 ? match.events?.map((ev, i) => {
              const tag = tagLabels[ev.type] || tagLabels.goal;
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-10 text-right text-[#9E948C] font-mono">{ev.minute}&apos;</span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold ${tag.color}`}>{tag.label}</span>
                  <span className="text-[#5C524C]">
                    {ev.player}
                    {ev.description ? `（${ev.description}）` : ""}
                  </span>
                </div>
              );
            }) : (
              <div className="border border-dashed border-[#241A14]/25 bg-[#EDE9E0] px-2.5 py-2 text-xs leading-5 text-[#5C524C]">
                {tr(
                  locale,
                  "实况阶段已开启。比分源返回进球、红黄牌、换人或完赛结果后，这里会替换为真实时间线。",
                  "Live phase is active. Goals, cards, substitutions, and final result will replace this placeholder once the score feed returns them.",
                )}
              </div>
            )}
          </motion.div>
        )}
      </div>
      )}

      {/* Action row */}
      <div className="border-t border-[#241A14]/30 px-3 py-2 flex justify-end">
        <Link
          href={`/match/${match.id}`}
          className="text-xs font-bold text-[#D36E52] hover:underline"
        >
          {tr(locale, "完整赛报 →", "Full report →")}
        </Link>
      </div>
    </motion.div>
  );
}

function GossipCard({ item }: { item: GossipItem }) {
  return (
    <motion.div
      className="border border-[#241A14] bg-[#FAF7F0] p-3"
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-bold text-sm text-[#241A14] flex-1 pr-2" style={{ fontFamily: "var(--font-heading)" }}>
          {item.title}
        </h4>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-lg font-black text-[#D36E52]">{item.prob}%</span>
          <span className="text-[9px] text-[#9E948C]">市场概率</span>
        </div>
      </div>
      <p className="text-xs text-[#5C524C] leading-relaxed">{item.summary}</p>
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-dashed border-[#241A14]/20">
        <span className="text-[10px] text-[#9E948C]">{item.source} · {item.updatedAt}</span>
        <span className="text-[10px] font-bold text-[#9E948C]">仅为市场预测，非确定性判断</span>
      </div>
    </motion.div>
  );
}

function formatArticleTime(input: string, locale = "zh-CN"): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return tr(locale, "时间未知", "Unknown time");
  return new Intl.DateTimeFormat(locale.startsWith("zh") ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatQuoteTime(input: string, locale = "zh-CN"): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return tr(locale, "时间未知", "Unknown time");
  return new Intl.DateTimeFormat(locale.startsWith("zh") ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isChineseLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("zh");
}

function looksEnglish(text: string | undefined): boolean {
  const value = String(text || "");
  const latin = value.match(/[A-Za-z]/g)?.length || 0;
  const han = value.match(/[\u4e00-\u9fff]/g)?.length || 0;
  return latin > han * 2 && latin >= 8;
}

function isEnglishArticle(article: NewsArticle): boolean {
  return article.language?.toLowerCase().startsWith("en")
    || looksEnglish(article.title)
    || looksEnglish(article.summary)
    || looksEnglish(article.aiSummary);
}

function newsCardParagraphs(article: NewsArticle, locale: string): string[] {
  const summary = articleSummary(article, locale);
  return articleBody(article, locale)
    .filter((paragraph) => paragraph && paragraph !== summary)
    .slice(0, 2);
}

function NewsCard({ item, locale }: { item: NewsArticle; locale: string }) {
  const displayedSummary = articleSummary(item, locale);
  const keyPoints = articleKeyPoints(item, locale);
  const bodyParagraphs = newsCardParagraphs(item, locale);
  const showBilingual = isChineseLocale(locale) && isEnglishArticle(item);
  const translationState = articleTranslationState(item, locale);
  const translationLabel = translationState === "translated"
    ? tr(locale, "译文", "translated")
    : translationState === "rule"
      ? tr(locale, "规则摘要", "rule summary")
      : showBilingual
        ? tr(locale, "待翻译", "awaiting translation")
        : "";
  const englishSummary = item.summaryEn || item.aiSummary || item.summary;
  return (
    <motion.div
      className="block border border-[#241A14] bg-[#FAF7F0] p-3 hover:bg-white transition-colors"
      whileTap={{ scale: 0.98 }}
    >
      <Link href={`/news/${encodeURIComponent(item.id)}`} className="block">
        {item.imageUrl && (
          <div className="mb-3 aspect-[16/9] overflow-hidden border border-[#241A14] bg-[#EDE9E0]">
            <img src={item.imageUrl} alt={articleTitle(item, locale)} className="h-full w-full object-cover" loading="lazy" />
          </div>
        )}
        <div className="flex justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-sm text-[#241A14] leading-snug" style={{ fontFamily: "var(--font-heading)" }}>
              {articleTitle(item, locale)}
            </h4>
            {showBilingual && (
              <p className="mt-1 text-[11px] font-bold leading-snug text-[#6D625A]">
                {item.titleEn || item.title}
              </p>
            )}
          </div>
          <span className="shrink-0 text-[10px] font-bold text-[#9E948C]">{formatArticleTime(item.publishedAt, locale)}</span>
        </div>
        <p className="mt-2 text-xs text-[#5C524C] leading-relaxed">{displayedSummary}</p>
        {showBilingual && englishSummary && (
          <p className="mt-1 border-l border-[#241A14]/30 pl-2 text-[11px] leading-5 text-[#8A8078]">
            {englishSummary}
          </p>
        )}
        {bodyParagraphs.length > 0 && (
          <div className="mt-2 space-y-1.5 border-t border-dashed border-[#241A14]/20 pt-2 text-xs leading-6 text-[#3C332D]">
            {bodyParagraphs.map((paragraph, index) => (
              <p key={`${item.id}-body-${index}`}>{paragraph}</p>
            ))}
          </div>
        )}
        {keyPoints.length > 0 && (
          <ul className="mt-2 space-y-1 border-l-2 border-[#9CB48A] pl-2">
            {keyPoints.map((point) => (
              <li key={point} className="text-[11px] text-[#5C524C]">· {point}</li>
            ))}
          </ul>
        )}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-dashed border-[#241A14]/20 pt-2 text-[10px] text-[#9E948C]">
        <span className="font-bold text-[#241A14]">{item.source}</span>
        {typeof item.aiScore === "number" && <span>· {tr(locale, "AI 评分", "AI score")} {item.aiScore}</span>}
        {(item.sourceCount || 0) > 1 && <span>· {item.sourceCount} {tr(locale, "个来源交叉报道", "sources cross-reported")}</span>}
        {item.domain && <span>· {item.domain}</span>}
        {item.language && <span>· {item.language}</span>}
        {item.country && <span>· {item.country}</span>}
        {translationLabel && <span>· {translationLabel}</span>}
        {item.bodySource && <span>· {item.bodySource === "original-page" || item.bodySource === "provider-api" ? tr(locale, "已抓全文", "full text") : tr(locale, "正文预览", "body preview")}</span>}
      </div>
    </motion.div>
  );
}

function numericArticleMetric(article: NewsArticle, keys: string[]): number | undefined {
  const record = article as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/,/g, "")) : NaN;
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return undefined;
}

function articleSourceWeight(article: NewsArticle): number {
  const sourceText = `${article.source} ${article.domain || ""} ${article.url}`.toLowerCase();
  if (sourceText.includes("espn")) return 500;
  if (sourceText.includes("bbc")) return 450;
  if (sourceText.includes("fifa")) return 430;
  if (sourceText.includes("chinanews") || sourceText.includes("中新网")) return 360;
  if (sourceText.includes("newsapi")) return 260;
  if (sourceText.includes("gdelt")) return 220;
  return 180;
}

function articleHeatScore(article: NewsArticle, index: number): number {
  const explicitViews = numericArticleMetric(article, ["viewCount", "views", "pageviews", "readCount", "traffic", "popularity"]);
  const published = new Date(article.publishedAt).getTime();
  const recency = Number.isFinite(published) ? Math.max(0, 240 - (Date.now() - published) / 3_600_000) : 0;
  if (explicitViews !== undefined) return explicitViews * 1_000_000 + recency - index / 1000;
  const sourceCount = article.sourceCount || article.relatedSources?.length || 1;
  const aiScore = article.aiScore || 0;
  const bodyWeight = article.bodySource === "original-page" || article.bodySource === "provider-api" ? 30 : article.bodySource === "source-api" ? 12 : 0;
  return sourceCount * 1000 + aiScore * 10 + articleSourceWeight(article) + bodyWeight + recency - index / 1000;
}

function normalizeNewsTitleKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/（[^）]*摘要）|\([^)]*summary\)/gi, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
    .trim();
}

function dedupeNewsByDisplayedTitle(news: NewsArticle[], locale: string): NewsArticle[] {
  const bestByTitle = new Map<string, { article: NewsArticle; index: number; score: number }>();
  news.forEach((article, index) => {
    const key = normalizeNewsTitleKey(articleTitle(article, locale)) || article.id;
    const score = articleHeatScore(article, index);
    const existing = bestByTitle.get(key);
    if (!existing || score > existing.score) {
      bestByTitle.set(key, { article, index, score });
    }
  });
  return [...bestByTitle.values()]
    .sort((left, right) => left.index - right.index)
    .map((item) => item.article);
}

function sortTopNews(news: NewsArticle[]): NewsArticle[] {
  return news
    .map((article, index) => ({ article, index }))
    .sort((left, right) => {
      const leftScore = left.article.aiScore ?? -1;
      const rightScore = right.article.aiScore ?? -1;
      return rightScore - leftScore
        || articleHeatScore(right.article, right.index) - articleHeatScore(left.article, left.index)
        || left.index - right.index;
    })
    .slice(0, 5)
    .map((item) => item.article);
}

function sortNewsByPublishedDesc(news: NewsArticle[]): NewsArticle[] {
  return news
    .map((article, index) => ({
      article,
      index,
      published: new Date(article.publishedAt).getTime(),
    }))
    .sort((left, right) => {
      const leftPublished = Number.isFinite(left.published) ? left.published : 0;
      const rightPublished = Number.isFinite(right.published) ? right.published : 0;
      return rightPublished - leftPublished || left.index - right.index;
    })
    .map((item) => item.article);
}

const popularTeamWeights: Array<[RegExp, number]> = [
  [/argentina|阿根廷/i, 100],
  [/brazil|巴西/i, 98],
  [/france|法国/i, 96],
  [/england|英格兰/i, 94],
  [/spain|西班牙/i, 92],
  [/germany|德国/i, 90],
  [/portugal|葡萄牙/i, 88],
  [/netherlands|荷兰/i, 86],
  [/italy|意大利/i, 84],
  [/uruguay|乌拉圭/i, 82],
  [/mexico|墨西哥/i, 80],
  [/united states|usa|美国/i, 78],
  [/canada|加拿大/i, 76],
  [/japan|日本/i, 72],
  [/morocco|摩洛哥/i, 70],
  [/croatia|克罗地亚/i, 68],
  [/belgium|比利时/i, 66],
  [/cape verde|cabo verde|佛得角/i, 64],
  [/saudi arabia|沙特/i, 58],
];

function popularTeamWeight(match: Match): number {
  const text = `${match.homeTeam} ${match.awayTeam}`.toLowerCase();
  return popularTeamWeights.reduce((score, [pattern, weight]) => pattern.test(text) ? Math.max(score, weight) : score, 0);
}

function matchStatusWeight(match: Match, now: Date): number {
  if (match.status === "finished") return 40;
  if (match.status === "live") return 35;
  if (hasMatchStarted(match, now)) return 25;
  return 0;
}

function subtitleMatchScore(match: Match, locale: string, now: Date): string {
  const title = `${teamName(match.homeTeam, locale)} vs ${teamName(match.awayTeam, locale)}`;
  if (match.homeScore !== null && match.awayScore !== null) {
    return `${title} ${match.homeScore}:${match.awayScore}`;
  }
  if (hasMatchStarted(match, now)) {
    return `${title} ${tr(locale, "等待比分源", "waiting for score feed")}`;
  }
  return `${title} ${tr(locale, "待开赛", "upcoming")}`;
}

function morningSubtitleMatch(matches: Match[], now: Date): Match | undefined {
  return matches
    .map((match, index) => {
      const kickoff = matchKickoffDate(match)?.getTime();
      const recency = Number.isFinite(kickoff) ? -Math.abs(now.getTime() - Number(kickoff)) / 3_600_000 : -999;
      return {
        match,
        index,
        score: popularTeamWeight(match) * 100 + matchStatusWeight(match, now) * 10 + recency,
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.match;
}

function rankingStatusLabel(
  aggregation: MorningBrief["aggregation"] | undefined,
  locale: string,
): string {
  if (aggregation?.aiUsed) {
    return tr(locale, "AI 评分筛选", "Ranked by AI score");
  }
  const message = aggregation?.aiMessage || "";
  if (/timeout|aborted|超时/i.test(message)) {
    return tr(locale, "AI 超时 · 热度排序", "AI timed out · ranked by heat");
  }
  if (/未配置|no available|Provider 调用失败|AI Provider/i.test(message)) {
    return tr(locale, "规则热度排序", "Ranked by rule heat");
  }
  return tr(locale, "热度排序", "Ranked by heat");
}

export function MorningBriefScreen() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [brief, setBrief] = useState<MorningBrief>(fallbackMorningBrief);
  const [browserNow, setBrowserNow] = useState(() => new Date());
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const quote = brief.quote;
  const quoteHistory = brief.quoteHistory || [];
  const visibleNews = useMemo(() => dedupeNewsByDisplayedTitle(brief.news, locale), [brief.news, locale]);
  const topNews = useMemo(() => sortTopNews(visibleNews), [visibleNews]);
  const newsColumnItems = useMemo(() => sortNewsByPublishedDesc(visibleNews), [visibleNews]);

  useEffect(() => {
    let cancelled = false;
    async function loadBrief() {
      const res = await fetch(`/api/data/morning?${browserScheduleDateQuery(morningDateKey)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { brief?: MorningBrief };
      if (cancelled || !data.brief) return;
      setBrief(data.brief);
    }

    void loadBrief();
    const refreshId = window.setInterval(() => {
      void loadBrief();
    }, morningRefreshIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
    };
  }, []);

  useEffect(() => {
    const clockId = window.setInterval(() => {
      setBrowserNow(new Date());
    }, morningRefreshIntervalMs);
    return () => window.clearInterval(clockId);
  }, []);

  function copyQuote() {
    navigator.clipboard.writeText(quote).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const mastheadTitle = tr(locale, "世界杯早报", "World Cup Morning Brief");
  const mastheadSubtitleMatch = morningSubtitleMatch(brief.matches, browserNow);
  const mastheadSubtitle = mastheadSubtitleMatch
    ? subtitleMatchScore(mastheadSubtitleMatch, locale, browserNow)
    : "";
  const quoteText = isChineseLocale(locale) && looksEnglish(quote) && brief.quoteZh
    ? brief.quoteZh
    : quote;
  const liveEdition = formatBrowserEdition(browserNow, locale);

  return (
    <div className="flex flex-col min-h-svh bg-[#F5F1E8]">
      {/* Masthead */}
      <div className="px-4 py-3 border-b-2 border-double border-[#241A14] bg-[#FAF7F0]">
        <div className="flex justify-between items-center mb-1">
          <span
            className="text-[10px] font-black uppercase tracking-widest text-[#D36E52]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {tr(locale, "每日复盘特刊", "Daily World Cup Brief")}
          </span>
          <span className="text-[10px] font-bold text-[#9E948C]">{liveEdition}</span>
        </div>
        <h2
          className="font-black text-xl leading-tight text-[#241A14]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {mastheadTitle}
        </h2>
        {mastheadSubtitle && (
          <p className="mt-1 truncate text-xs font-bold text-[#6D625A]">
            {mastheadSubtitle}
          </p>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {topNews.length > 0 && (
          <section
            className="border border-[#241A14] bg-[#FAF7F0] p-3"
            style={{ boxShadow: "3px 3px 0 0 #241A14" }}
          >
            <div className="mb-2 flex items-center justify-between border-b border-dashed border-[#241A14]/30 pb-2">
              <h3 className="text-xs font-black tracking-wider text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                {tr(locale, "重点新闻", "Key Headlines")}
              </h3>
              <span className="text-[10px] text-[#9E948C]">
                {rankingStatusLabel(brief.aggregation, locale)}
              </span>
            </div>
            <div className="space-y-1.5">
              {topNews.map((article, index) => {
                const translationState = articleTranslationState(article, locale);
                const translationLabel = translationState === "rule"
                  ? tr(locale, "规则摘要", "rule summary")
                  : translationState === "original" && isChineseLocale(locale) && isEnglishArticle(article)
                    ? tr(locale, "待翻译", "awaiting translation")
                    : "";
                return (
                  <Link
                    key={article.id}
                    href={`/news/${encodeURIComponent(article.id)}`}
                    className="grid grid-cols-[22px_1fr_auto] items-center gap-2 text-xs text-[#241A14] hover:text-[#D36E52]"
                  >
                    <span className="font-mono font-black text-[#D36E52]">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold">
                        {articleTitle(article, locale)}
                        {translationLabel && <span className="ml-1 text-[9px] text-[#9E948C]">({translationLabel})</span>}
                      </span>
                      {isChineseLocale(locale) && isEnglishArticle(article) && (
                        <span className="block truncate text-[10px] text-[#8A8078]">{article.titleEn || article.title}</span>
                      )}
                    </span>
                    {typeof article.aiScore === "number" && (
                      <span className="font-mono text-[10px] text-[#9E948C]">{article.aiScore}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Quote card */}
        {quote && (
          <div
            className="border border-[#241A14] bg-[#FAF7F0] p-3 pr-11 relative"
            style={{ boxShadow: "3px 3px 0 0 #241A14" }}
          >
            <button
              type="button"
              aria-label={tr(locale, "历史评论", "Quote history")}
              disabled={quoteHistory.length === 0}
              onClick={() => setHistoryOpen((open) => !open)}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center border border-[#241A14] bg-[#EDE9E0] text-[#241A14] disabled:cursor-not-allowed disabled:opacity-40"
              title={tr(locale, "历史评论", "Quote history")}
            >
              <History className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
            <p className="font-serif text-sm text-[#241A14] leading-relaxed">{quoteText}</p>
            {isChineseLocale(locale) && looksEnglish(quote) && (
              <p className="mt-2 border-l border-[#241A14]/30 pl-2 text-xs leading-6 text-[#8A8078]">
                {quote}
              </p>
            )}
            {historyOpen && quoteHistory.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-dashed border-[#241A14]/30 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black tracking-wider text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                    {tr(locale, "历史评论", "Quote history")}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-[#9E948C]">
                    {quoteHistory.length} {tr(locale, "条", "items")}
                  </span>
                </div>
                <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                  {quoteHistory.map((item, index) => (
                    <div key={`${item.id}-${item.generatedAt}`} className="border border-[#241A14]/25 bg-[#EDE9E0] px-2.5 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-[#9E948C]">
                        <span className="font-mono font-black text-[#D36E52]">#{index + 1}</span>
                        <span className="truncate">
                          {formatQuoteTime(item.generatedAt, locale)}
                          {" · "}
                          {item.source === "ai" ? item.providerName || "AI" : tr(locale, "规则兜底", "fallback")}
                        </span>
                      </div>
                      <p className="text-xs leading-5 text-[#3C332D]">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 border-t border-dashed border-[#241A14] pt-2 flex justify-between items-center">
              <span className="text-[10px] font-bold text-[#9E948C]">{tr(locale, "复制摘要", "Copy summary")}</span>
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={copyQuote}
                className={`px-3 py-1 text-[10px] font-bold border border-[#241A14] transition-colors ${
                  copied ? "bg-[#9CB48A] text-white" : "bg-[#241A14] text-white hover:bg-[#D36E52]"
                }`}
              >
                {copied ? tr(locale, "✓ 已复制", "Copied") : tr(locale, "复制", "Copy")}
              </motion.button>
            </div>
          </div>
        )}

        {/* Section divider */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#D36E52] rounded-full flex-shrink-0" />
          <span
            className="font-bold text-xs tracking-wider uppercase text-[#241A14]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {tr(locale, "战局快报", "Match Briefs")}
          </span>
          <div className="flex-grow border-b border-double border-[#241A14]/30" />
        </div>

        {/* Match cards */}
        {brief.matches.length > 0 ? (
          brief.matches.map((m) => <MatchResultCard key={m.id} match={m} locale={locale} now={browserNow} />)
        ) : (
          <div className="border-2 border-dashed border-[#241A14] p-8 text-center">
            <p className="text-sm font-bold text-[#241A14]">{tr(locale, "暂无比赛信息", "No match information")}</p>
            <p className="mt-1 text-[11px] text-[#9E948C]">{tr(locale, "比分或赛程源返回数据后会自动显示。", "Scores or fixture data will appear once a source returns them.")}</p>
          </div>
        )}

        {/* News source section */}
        {newsColumnItems.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#9CB48A] rounded-full flex-shrink-0" />
              <span
                className="font-bold text-xs tracking-wider uppercase text-[#241A14]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {tr(locale, "新闻栏目", "News Column")}
              </span>
              <span className="shrink-0 text-[10px] font-bold text-[#9E948C]">
                {tr(locale, "多源新闻整理", "Multi-source")} · {newsColumnItems.length} {tr(locale, "条", "items")}
              </span>
              <div className="flex-grow border-b border-double border-[#241A14]/30" />
            </div>

            {newsColumnItems.map((article) => (
              <NewsCard key={article.id} item={article} locale={locale} />
            ))}
          </>
        )}

        {brief.gossipItems.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#E4A853] rounded-full flex-shrink-0" />
              <span
                className="font-bold text-xs tracking-wider uppercase text-[#241A14]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {tr(locale, "市场话题", "Market Topics")}
              </span>
              <div className="flex-grow border-b border-double border-[#241A14]/30" />
            </div>
            {brief.gossipItems.slice(0, 3).map((g) => (
              <GossipCard key={g.id} item={g} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
