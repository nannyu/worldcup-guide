import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { Noto_Serif_SC } from "next/font/google";
import { cn } from "@/utils/utils";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { getServerLocale } from "@/lib/i18n/server-preference";
import { AppShell } from "@/components/layout/app-shell";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-heading-loaded",
  display: "swap",
});

const SITE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : undefined;

const SITE_TITLE = "世界杯装杯指南";
const SITE_DESCRIPTION =
  "面向普通观众的 2026 世界杯 H5 工具：赛程、早报、球队速成、概率雷达和观赛工具箱。";

export const metadata: Metadata = {
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  icons: {
    icon: "/globe.svg",
  },
  openGraph: {
    type: "website",
    siteName: "世界杯装杯指南",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn("h-full antialiased", "font-sans", geist.variable, notoSerifSC.variable)}
    >
      <body className="min-h-full flex flex-col bg-[#F5F1E8]">
        <I18nProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
