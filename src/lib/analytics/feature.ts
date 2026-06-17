const featureLabels: Array<{ test: (path: string) => boolean; label: string }> = [
  { test: (path) => path === "/", label: "今日赛程" },
  { test: (path) => path.startsWith("/morning"), label: "每日早报" },
  { test: (path) => path.startsWith("/teams"), label: "球队速成" },
  { test: (path) => path.startsWith("/radar"), label: "概率雷达" },
  { test: (path) => path.startsWith("/tools"), label: "观赛工具箱" },
  { test: (path) => path.startsWith("/match/"), label: "比赛详情" },
  { test: (path) => path.startsWith("/news/"), label: "新闻详情" },
];

export function normalizeAnalyticsPath(path: string | undefined): string {
  const rawPath = (path || "/").trim();
  try {
    const url = rawPath.startsWith("http") ? new URL(rawPath) : new URL(rawPath, "https://local");
    return `${url.pathname}${url.search}`.slice(0, 512) || "/";
  } catch {
    const [pathname, query = ""] = rawPath.split("?");
    const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
    return `${normalized}${query ? `?${query}` : ""}`.slice(0, 512);
  }
}

export function featureFromPath(path: string | undefined): string {
  const normalized = normalizeAnalyticsPath(path).split("?")[0] || "/";
  return featureLabels.find((item) => item.test(normalized))?.label || "其他页面";
}
