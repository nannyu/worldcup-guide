"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const tabs = [
  {
    href: "/",
    label: "今日",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    href: "/morning",
    label: "早报",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    ),
  },
  {
    href: "/teams",
    label: "球队",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    href: "/radar",
    label: "天眼",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6"/>
        <circle cx="12" cy="12" r="2"/>
      </svg>
    ),
  },
  {
    href: "/tools",
    label: "工具",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="21" x2="20" y2="21"/>
        <rect x="6" y="11" width="3" height="7"/>
        <rect x="11" y="6" width="3" height="12"/>
        <rect x="16" y="3" width="3" height="15"/>
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[20] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Newspaper double border top */}
      <div className="border-t-2 border-[#241A14] bg-[#FAF7F0]">
        <div className="border-t border-[#241A14]/30 mx-3" />
        <div className="flex items-stretch">
          {tabs.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 relative min-h-[56px]"
              >
                {active && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute inset-0 bg-[#D36E52]/10"
                    initial={false}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <motion.div
                  whileTap={{ scale: 0.85 }}
                  className={`relative flex flex-col items-center gap-0.5 ${
                    active ? "text-[#D36E52]" : "text-[#9E948C]"
                  }`}
                >
                  {tab.icon}
                  <span
                    className="text-[10px] font-medium tracking-wider"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {tab.label}
                  </span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-56 border-r-2 border-[#241A14] bg-[#FAF7F0] min-h-svh sticky top-0 shrink-0">
      {/* Header */}
      <div className="p-6 border-b-2 border-[#241A14]">
        <div className="text-xs font-bold tracking-[0.2em] text-[#9E948C] mb-1" style={{ fontFamily: "var(--font-heading)" }}>
          2026 FIFA WORLD CUP
        </div>
        <h1 className="text-lg font-bold leading-tight text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          世界杯装杯指南
        </h1>
        <p className="text-[11px] text-[#9E948C] mt-1">专为普通球迷打造</p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-4 space-y-1">
        {tabs.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-[4px] transition-colors relative ${
                active
                  ? "bg-[#D36E52] text-white"
                  : "text-[#5C524C] hover:bg-[#EDE9E0] hover:text-[#241A14]"
              }`}
            >
              {tab.icon}
              <span className="font-medium text-sm">{tab.label}</span>
              {active && (
                <div className="absolute inset-0 border border-[#241A14] rounded-[4px] pointer-events-none" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[#241A14]/20 text-[10px] text-[#9E948C] text-center">
        数据来源：football-data.org · The Odds API · FIFA
        <br />
        仅供参考，非投注建议
      </div>
    </aside>
  );
}
