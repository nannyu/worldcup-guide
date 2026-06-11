"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const isDark = (theme || resolvedTheme) === "dark";
  const className =
    "flex h-7 w-8 items-center justify-center border border-[#241A14] bg-[#FAF7F0] text-[#241A14] transition-colors hover:bg-[#D36E52] hover:text-white dark:border-[#EDE9E0] dark:bg-[#191512] dark:text-[#F5F1E8]";

  if (!mounted) {
    return (
      <button type="button" className={className} aria-hidden disabled>
        <Moon className="h-3.5 w-3.5" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={className}
      title={isDark ? t("theme.light") : t("theme.dark")}
      aria-label={isDark ? t("theme.light") : t("theme.dark")}
    >
      {isDark ? <Sun className="h-3.5 w-3.5" aria-hidden /> : <Moon className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}
