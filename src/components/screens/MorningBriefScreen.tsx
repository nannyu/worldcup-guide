"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  type GossipItem,
  type Match,
  type MorningBrief,
  type NewsArticle,
} from "@/lib/wc-data";
import { articleKeyPoints, articleSummary, articleTitle, articleTranslationState, teamName, tr } from "@/lib/i18n/content";

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
  if (match.status === "finished" && match.homeScore !== null && match.awayScore !== null) {
    return `${teamName(match.homeTeam, locale)} ${match.homeScore}:${match.awayScore} ${teamName(match.awayTeam, locale)}.`;
  }
  return tr(
    locale,
    `${match.kickoffBj} 北京时间开赛，地点：${match.venue || "待确认"}。赛果和事件等待比分源更新。`,
    `${match.kickoffBj} Beijing time. Venue: ${match.venue || "TBC"}. Results and events will appear once the score feed updates.`,
  );
}

function MatchResultCard({ match, locale }: { match: Match; locale: string }) {
  const [expanded, setExpanded] = useState(false);
  const tags = [
    match.status === "finished" ? tr(locale, "已完赛", "Finished") : match.status === "live" ? tr(locale, "直播中", "Live") : tr(locale, "赛程", "Fixture"),
    match.group,
  ];
  const hasScore = match.homeScore !== null && match.awayScore !== null;

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
          {hasScore ? `${match.homeScore} : ${match.awayScore}` : "VS"}
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
        {matchDigest(match, locale)}
      </div>

      {/* Timeline toggle */}
      <div className="px-3 pb-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between py-1.5 text-xs font-bold text-[#5C524C] border-t border-dashed border-[#241A14]/30"
        >
          <span>{tr(locale, "进球时间线", "Goal timeline")}</span>
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </motion.span>
        </motion.button>

        {expanded && match.events && match.events.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="pt-2 space-y-1.5 overflow-hidden"
          >
            {match.events.map((ev, i) => {
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
            })}
          </motion.div>
        )}
      </div>

      {/* Action row */}
      <div className="border-t border-[#241A14]/30 px-3 py-2 flex justify-between items-center">
        <Link
          href={match.highlights || "#"}
          className="text-xs text-[#9CB48A] font-bold flex items-center gap-0.5 hover:underline"
          target="_blank"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          {tr(locale, "看集锦", "Highlights")}
        </Link>
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

function NewsCard({ item, locale }: { item: NewsArticle; locale: string }) {
  const displayedSummary = articleSummary(item, locale);
  const keyPoints = articleKeyPoints(item, locale);
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
      </div>
    </motion.div>
  );
}

function sortTopNews(news: NewsArticle[]): NewsArticle[] {
  return news
    .map((article, index) => ({ article, index }))
    .sort((left, right) => {
      const leftScore = left.article.aiScore ?? -1;
      const rightScore = right.article.aiScore ?? -1;
      return rightScore - leftScore || left.index - right.index;
    })
    .slice(0, 5)
    .map((item) => item.article);
}

export function MorningBriefScreen() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [brief, setBrief] = useState<MorningBrief>(fallbackMorningBrief);
  const [browserNow, setBrowserNow] = useState(() => new Date());
  const [copied, setCopied] = useState(false);
  const quote = brief.quote;
  const topNews = useMemo(() => sortTopNews(brief.news), [brief.news]);

  useEffect(() => {
    let cancelled = false;
    async function loadBrief() {
      const res = await fetch(`/api/data/morning?dateKey=${morningDateKey}`, { cache: "no-store" });
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

  const briefTitle = isChineseLocale(locale) && looksEnglish(brief.title) && brief.titleZh
    ? brief.titleZh
    : tr(locale, brief.title || "世界杯早报", "World Cup Morning Brief");
  const briefSummary = isChineseLocale(locale) && looksEnglish(brief.summary) && brief.summaryZh
    ? brief.summaryZh
    : tr(locale, brief.summary || "暂无可用原始信息。", brief.summary || "No source information available yet.");
  const sourceLabel = isChineseLocale(locale)
    ? brief.sourceLabel.replaceAll("World Cup", "世界杯").replaceAll("Football RSS", "足球 RSS")
    : brief.sourceLabel === "等待数据源" ? "Waiting for data source" : brief.sourceLabel;
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
          {briefTitle}
        </h2>
        <div className="border-t border-[#241A14] mt-2 pt-2 text-xs text-[#5C524C]">
          <strong>{tr(locale, "头版摘要：", "Lead summary:")}</strong> {briefSummary}
          {isChineseLocale(locale) && looksEnglish(brief.summary) && (
            <span className="mt-1 block border-l border-[#241A14]/30 pl-2 text-[11px] leading-5 text-[#8A8078]">
              {brief.summary}
            </span>
          )}
          <span className="block mt-1 text-[10px] text-[#9E948C]">
            {tr(locale, "来源：", "Source: ")}
            {sourceLabel}
          </span>
        </div>
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
                {brief.aggregation?.aiUsed ? tr(locale, "AI 评分筛选", "Ranked by AI score") : tr(locale, "后台等待 AI 评分", "Waiting for background AI scores")}
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
            className="border border-[#241A14] bg-[#FAF7F0] p-3 relative"
            style={{ boxShadow: "3px 3px 0 0 #241A14" }}
          >
            <p className="font-serif text-sm text-[#241A14] leading-relaxed">{quoteText}</p>
            {isChineseLocale(locale) && looksEnglish(quote) && (
              <p className="mt-2 border-l border-[#241A14]/30 pl-2 text-xs leading-6 text-[#8A8078]">
                {quote}
              </p>
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
            {tr(locale, "战局深度拆解", "Match Breakdown")}
          </span>
          <div className="flex-grow border-b border-double border-[#241A14]/30" />
        </div>

        {/* Match cards */}
        {brief.matches.length > 0 ? (
          brief.matches.map((m) => <MatchResultCard key={m.id} match={m} locale={locale} />)
        ) : (
          <div className="border-2 border-dashed border-[#241A14] p-8 text-center">
            <p className="text-sm font-bold text-[#241A14]">{tr(locale, "暂无比赛信息", "No match information")}</p>
            <p className="mt-1 text-[11px] text-[#9E948C]">{tr(locale, "比分或赛程源返回数据后会自动显示。", "Scores or fixture data will appear once a source returns them.")}</p>
          </div>
        )}

        {/* News source section */}
        {brief.news.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#9CB48A] rounded-full flex-shrink-0" />
              <span
                className="font-bold text-xs tracking-wider uppercase text-[#241A14]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {tr(locale, "多源新闻整理", "Multi-source News")}
              </span>
              <span className="shrink-0 text-[10px] font-bold text-[#9E948C]">
                {brief.news.length} {tr(locale, "条", "items")}
              </span>
              <div className="flex-grow border-b border-double border-[#241A14]/30" />
            </div>

            {brief.news.map((article) => (
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
