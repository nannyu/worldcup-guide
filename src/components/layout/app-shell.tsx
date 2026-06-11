"use client";

import { usePathname } from "next/navigation";
import { BottomNav, SidebarNav } from "@/components/layout/nav";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) {
    return <main className="min-h-svh bg-[#F5F1E8]">{children}</main>;
  }

  return (
    <>
      <div className="flex min-h-svh">
        <SidebarNav />
        <main className="flex-1 flex flex-col min-w-0 pb-[72px] md:pb-0">
          <div className="flex justify-end gap-1 px-4 pt-3 md:px-6">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
          {children}
        </main>
      </div>
      <BottomNav />
    </>
  );
}
