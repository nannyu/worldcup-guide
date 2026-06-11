"use client";

import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  changeLocale,
  normalizeLocale,
  type LocaleCode,
} from "@/i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [activeLocale, setActiveLocale] = useState<LocaleCode>(() =>
    normalizeLocale(i18n.resolvedLanguage || i18n.language) ?? "zh-CN",
  );

  useEffect(() => {
    const sync = () => setActiveLocale(normalizeLocale(i18n.resolvedLanguage || i18n.language) ?? "zh-CN");
    i18n.on("languageChanged", sync);
    window.addEventListener("eazo-locale-preference-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      i18n.off("languageChanged", sync);
      window.removeEventListener("eazo-locale-preference-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, [i18n]);

  async function toggleLocale() {
    await changeLocale(activeLocale === "zh-CN" ? "en-US" : "zh-CN");
  }

  return (
    <button
      type="button"
      onClick={() => void toggleLocale()}
      className="flex h-7 items-center gap-1 border border-[#241A14] bg-[#FAF7F0] px-2 text-[10px] font-black text-[#241A14] transition-colors hover:bg-[#D36E52] hover:text-white"
      title={t("language.label")}
      aria-label={t("language.label")}
    >
      <Languages className="h-3 w-3" aria-hidden />
      <span>{activeLocale === "zh-CN" ? "中文" : "EN"}</span>
      <span className="text-[#9E948C]">{activeLocale === "zh-CN" ? "EN" : "中文"}</span>
    </button>
  );
}
