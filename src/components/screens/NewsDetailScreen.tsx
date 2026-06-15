"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { browserScheduleDateQuery, type MorningBrief, type NewsArticle } from "@/lib/wc-data";
import { articleBody, articleComment, articleKeyPoints, articleSummary, articleTitle, tr } from "@/lib/i18n/content";

function formatArticleTime(input: string, locale = "zh-CN"): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return tr(locale, "时间未知", "Unknown time");
  return new Intl.DateTimeFormat(locale.startsWith("zh") ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function hasLocalBody(article: NewsArticle | undefined): boolean {
  return Boolean(article?.body?.length || article?.bodyZh?.length || article?.bodyEn?.length || article?.sourceText);
}

function previewParagraphs(paragraphs: string[], expanded: boolean): string[] {
  if (expanded) return paragraphs;
  const joined = paragraphs.join("\n\n");
  if (joined.length <= 420) return paragraphs.slice(0, 2);
  return [`${joined.slice(0, 417).trim()}...`];
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
    || looksEnglish(article.sourceText || article.summary);
}

function needsChineseTranslation(article: NewsArticle, locale: string): boolean {
  return isChineseLocale(locale)
    && isEnglishArticle(article)
    && (!article.titleZh || !article.summaryZh || !article.bodyZh?.length);
}

function englishBody(article: NewsArticle): string[] {
  return (article.bodyEn?.length ? article.bodyEn : article.body?.length ? article.body : article.sourceText ? [article.sourceText] : [article.summary])
    .filter(Boolean);
}

function bilingualBodyPairs(article: NewsArticle): Array<{ zh?: string; en: string }> {
  const zh = article.bodyZh || [];
  return englishBody(article).map((en, index) => ({
    zh: zh[index],
    en,
  }));
}

async function loadArticleById(id: string): Promise<NewsArticle | undefined> {
  const newsResponse = await fetch("/api/data/news?limit=60", { cache: "no-store" });
  if (newsResponse.ok) {
    const data = (await newsResponse.json()) as { articles?: NewsArticle[] };
    const article = data.articles?.find((item) => item.id === id);
    if (article && hasLocalBody(article)) return article;
  }

  const dateKeys = ["yesterday", "today", "tomorrow"] as const;
  const browserNow = new Date();
  let fallback: NewsArticle | undefined;
  for (const dateKey of dateKeys) {
    const response = await fetch(`/api/data/morning?${browserScheduleDateQuery(dateKey, browserNow)}`, { cache: "no-store" });
    if (!response.ok) continue;
    const data = (await response.json()) as { brief?: MorningBrief };
    const article = data.brief?.news?.find((item) => item.id === id);
    if (article && hasLocalBody(article)) return article;
    fallback ||= article;
  }
  return fallback;
}

export function NewsDetailScreen() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const params = useParams();
  const router = useRouter();
  const articleId = decodeURIComponent(String(params.id || ""));
  const [article, setArticle] = useState<NewsArticle | undefined>();
  const [loading, setLoading] = useState(true);
  const [expandedBody, setExpandedBody] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await loadArticleById(articleId);
      if (cancelled) return;
      setArticle(result);
      setExpandedBody(false);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#F5F1E8] p-8">
        <p className="text-sm text-[#9E948C]">{tr(locale, "正在读取新闻详情...", "Loading news detail...")}</p>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center bg-[#F5F1E8] p-8">
        <p className="text-sm text-[#9E948C]">{tr(locale, "新闻数据未找到", "News item not found")}</p>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => router.back()}
          className="mt-4 border-2 border-[#241A14] bg-[#FAF7F0] px-4 py-2 text-xs font-bold"
        >
          {tr(locale, "返回", "Back")}
        </motion.button>
      </div>
    );
  }

  const summary = articleSummary(article, locale);
  const englishSummary = article.summaryEn || article.aiSummary || article.summary;
  const keyPoints = articleKeyPoints(article, locale);
  const comment = articleComment(article, locale);
  const bodyParagraphs = articleBody(article, locale);
  const showBilingual = isChineseLocale(locale) && isEnglishArticle(article);
  const bodyPairs = bilingualBodyPairs(article);
  const visibleBodyPairs = expandedBody ? bodyPairs : bodyPairs.slice(0, Math.min(2, bodyPairs.length));
  const visibleBodyParagraphs = previewParagraphs(bodyParagraphs, expandedBody);
  const canExpandBody = showBilingual
    ? bodyPairs.length > visibleBodyPairs.length
    : bodyParagraphs.join("\n\n").length > visibleBodyParagraphs.join("\n\n").length
      || bodyParagraphs.length > visibleBodyParagraphs.length;
  const bodySourceLabel = article.bodySource === "original-page" || article.bodySource === "provider-api"
    ? tr(locale, "全文已抓取并存入本地快照", "Full text captured in local snapshot")
    : article.bodySource === "source-api"
      ? tr(locale, "来自数据源正文/摘要字段", "From source content fields")
      : tr(locale, "基于来源摘要生成预览", "Preview generated from source summary");

  return (
    <div className="flex min-h-svh flex-col bg-[#F5F1E8]">
      <div className="sticky top-0 z-[10] flex items-center justify-between border-b-2 border-[#241A14] bg-[#FAF7F0] px-4 py-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => router.back()}
          className="border border-[#241A14] bg-[#FAF7F0] px-2.5 py-1 text-xs font-bold transition-colors hover:bg-[#D36E52] hover:text-white"
        >
          {tr(locale, "返回早报", "Back to brief")}
        </motion.button>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#D36E52]">{tr(locale, "新闻详情", "News Detail")}</span>
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        <article className="space-y-4">
          <header className="border-2 border-[#241A14] bg-[#FAF7F0] p-4" style={{ boxShadow: "4px 4px 0 0 #241A14" }}>
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-[#9E948C]">
              <span className="text-[#D36E52]">{article.source}</span>
              <span>· {formatArticleTime(article.publishedAt, locale)}</span>
              {typeof article.aiScore === "number" && <span>· {tr(locale, "AI 评分", "AI score")} {article.aiScore}</span>}
              {(article.sourceCount || 0) > 1 && <span>· {article.sourceCount} {tr(locale, "个来源交叉报道", "sources cross-reported")}</span>}
            </div>
            {showBilingual ? (
              <div className="space-y-2">
                <h1 className="text-xl font-black leading-tight text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                  {article.titleZh || articleTitle(article, locale)}
                </h1>
                <p className="border-l border-[#241A14]/30 pl-2 text-sm font-bold leading-snug text-[#5C524C]">
                  {article.titleEn || article.title}
                </p>
              </div>
            ) : (
              <h1 className="text-xl font-black leading-tight text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                {articleTitle(article, locale)}
              </h1>
            )}
            {article.domain && <p className="mt-2 text-[10px] text-[#9E948C]">{tr(locale, "域名：", "Domain: ")}{article.domain}</p>}
          </header>

          {article.imageUrl && (
            <div className="overflow-hidden border-2 border-[#241A14] bg-[#EDE9E0]" style={{ boxShadow: "4px 4px 0 0 #241A14" }}>
              <img src={article.imageUrl} alt={articleTitle(article, locale)} className="aspect-[16/9] w-full object-cover" />
            </div>
          )}

          <section className="border-l-2 border-[#D36E52] pl-3 text-sm leading-relaxed text-[#5C524C]">
            <p>{summary || tr(locale, "暂无摘要。", "No summary yet.")}</p>
            {showBilingual && englishSummary && (
              <p className="mt-2 border-l border-[#241A14]/30 pl-2 text-xs leading-6 text-[#8A8078]">
                {englishSummary}
              </p>
            )}
          </section>

          {keyPoints.length > 0 && (
            <section className="border border-[#241A14] bg-[#FAF7F0] p-3">
              <h2 className="mb-2 text-xs font-black tracking-wider text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                {tr(locale, "AI 摘要要点", "AI Key Points")}
              </h2>
              <div className="space-y-2">
                {keyPoints.map((point, index) => (
                  <p key={point} className="flex gap-2 text-xs leading-relaxed text-[#5C524C]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-[#D36E52] text-[10px] font-black text-white">
                      {index + 1}
                    </span>
                    {point}
                  </p>
                ))}
              </div>
            </section>
          )}

          <section className="border border-dashed border-[#241A14] bg-[#EDE9E0] p-3 text-sm leading-relaxed text-[#241A14]">
            <strong className="text-[#D36E52]">{tr(locale, "AI 毒舌点评：", "AI sharp take:")}</strong>
            {comment}
          </section>

          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="block border border-[#241A14] bg-[#241A14] px-3 py-2 text-center text-xs font-bold text-white transition-colors hover:bg-[#D36E52]"
          >
            {tr(locale, "跳转原始链接", "Open source link")}
          </a>

          <button
            type="button"
            onClick={() => {
              if (canExpandBody) setExpandedBody((value) => !value);
            }}
            aria-expanded={expandedBody}
            className="block w-full border-2 border-[#241A14] bg-[#FAF7F0] p-4 text-left transition-colors hover:bg-[#EDE9E0]"
            style={{ boxShadow: "4px 4px 0 0 #241A14" }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#241A14]/30 pb-2">
              <div>
                <h2 className="text-sm font-black tracking-wider text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
                  {showBilingual ? tr(locale, "本地全文预览 · 中英对照", "Local Article Preview · Bilingual") : tr(locale, "本地全文预览", "Local Article Preview")}
                </h2>
                <p className="mt-1 text-[10px] text-[#9E948C]">
                  {bodySourceLabel}
                  {needsChineseTranslation(article, locale) && <span> · {tr(locale, "等待后台中文翻译", "Waiting for background Chinese translation")}</span>}
                </p>
              </div>
              <span className="border border-[#241A14] px-2 py-1 text-[10px] font-bold text-[#D36E52]">
                {canExpandBody
                  ? expandedBody
                    ? tr(locale, "收起全文", "Collapse")
                    : tr(locale, "点击展开全文", "Expand article")
                  : tr(locale, "已显示全文", "Full text shown")}
              </span>
            </div>
            <div className="space-y-3 text-sm leading-7 text-[#3C332D]">
              {showBilingual && visibleBodyPairs.length > 0 ? (
                visibleBodyPairs.map((pair, index) => (
                  <div key={`${pair.en.slice(0, 24)}-${index}`} className="space-y-2 border-b border-dashed border-[#241A14]/20 pb-3 last:border-b-0 last:pb-0">
                    <p className="font-medium text-[#241A14]">
                      {pair.zh || tr(locale, "中文翻译等待后台任务生成。", "Chinese translation is waiting for the background task.")}
                    </p>
                    <p className="text-xs leading-6 text-[#6D625A]">
                      {pair.en}
                    </p>
                  </div>
                ))
              ) : visibleBodyParagraphs.length > 0 ? (
                visibleBodyParagraphs.map((paragraph, index) => (
                  <p key={`${paragraph.slice(0, 24)}-${index}`}>{paragraph}</p>
                ))
              ) : (
                <p className="text-[#9E948C]">
                  {tr(locale, "正文正在等待数据源补齐，当前先展示 AI 摘要。", "Full text is waiting for source data; AI summary is shown for now.")}
                </p>
              )}
            </div>
          </button>
        </article>
      </main>
    </div>
  );
}
