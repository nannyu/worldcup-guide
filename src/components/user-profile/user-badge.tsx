"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
}

export function UserBadge() {
  const { t } = useTranslation();
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (alive) setUser(data.user ?? null);
      })
      .catch(() => {
        if (alive) setUser(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    setOpen(false);
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex h-9 items-center rounded-full border border-[#241A14]/25 bg-[#FAF7F0] px-3">
        <div className="size-4 animate-spin rounded-full border-2 border-[#9E948C] border-t-[#241A14]" />
      </div>
    );
  }

  if (!user) {
    return (
      <Link
        href="/account"
        className="flex h-9 items-center gap-1.5 rounded-[4px] border border-[#241A14] bg-[#FAF7F0] px-3 text-xs font-black text-[#241A14] shadow-[2px_2px_0_0_#241A14] transition-transform active:translate-y-px"
      >
        <UserRound className="h-4 w-4" />
        {t("auth.loginRegister")}
      </Link>
    );
  }

  const displayName = user.name || user.email || user.id;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-2 rounded-[4px] border border-[#241A14] bg-[#FAF7F0] px-2.5 text-xs font-black text-[#241A14] shadow-[2px_2px_0_0_#241A14] transition-transform active:translate-y-px"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#D36E52] text-[10px] text-white">
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[92px] truncate">{displayName}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 border-2 border-[#241A14] bg-[#FAF7F0] shadow-[4px_4px_0_0_#241A14]">
          <div className="flex items-start justify-between gap-3 border-b border-[#241A14]/25 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[#241A14]">{displayName}</p>
              {user.email && <p className="truncate text-xs text-[#5C524C]">{user.email}</p>}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-[3px] p-0.5 text-[#5C524C] hover:bg-[#EDE9E0]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1 p-2">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-sm font-bold text-[#241A14] hover:bg-[#EDE9E0]"
            >
              <Settings className="h-4 w-4" />
              {t("settings.title")}
            </Link>
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-sm font-bold text-[#5C524C] hover:bg-[#EDE9E0] hover:text-[#241A14]"
            >
              <LogOut className="h-4 w-4" />
              {t("common.signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
