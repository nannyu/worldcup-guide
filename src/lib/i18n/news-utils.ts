import type { NewsArticle } from "@/lib/wc-data";
import { tr } from "@/lib/i18n/content";

export function formatArticleTime(input: string, locale = "zh-CN"): string {
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

export function isChineseLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("zh");
}

export function looksEnglish(text: string | undefined): boolean {
  const value = String(text || "");
  const latin = value.match(/[A-Za-z]/g)?.length || 0;
  const han = value.match(/[一-鿿]/g)?.length || 0;
  return latin > han * 2 && latin >= 8;
}

export function isEnglishArticle(article: NewsArticle): boolean {
  return article.language?.toLowerCase().startsWith("en")
    || looksEnglish(article.title)
    || looksEnglish(article.sourceText || article.summary);
}
