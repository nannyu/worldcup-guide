"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEazo } from "@eazo/sdk/react";
import { auth } from "@eazo/sdk";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { request } from "@/lib/api/request";

type UserProfile = {
  id: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const user = useEazo((s) => s.auth.user);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">{t("common.signIn")}</p>
      </div>
    );
  }

  return <SettingsForm key={user.id} user={user} />;
}

function SettingsForm({ user }: { user: UserProfile }) {
  const { t } = useTranslation();
  const [name, setName] = useState(user.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await request("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, avatarUrl: avatarUrl.trim() || undefined }),
      });

      const data = await res.json() as { ok: boolean; user?: UserProfile; error?: string };

      if (data.ok && data.user) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(data.error ?? t("settings.error"));
      }
    } catch {
      setError(t("settings.error"));
    } finally {
      setSaving(false);
    }
  }, [name, avatarUrl, t]);

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
          {t("settings.title")}
        </h1>
      </div>

      {/* Profile Section */}
      <div className="rounded-xl border border-border bg-background p-6 space-y-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t("settings.profile")}
        </h2>

        {/* Avatar Preview */}
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <Image
              src={avatarUrl.startsWith("//") ? `https:${avatarUrl}` : avatarUrl}
              alt="avatar"
              width={64}
              height={64}
              className="rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-semibold">
              {(name || user.email || "?")[0].toUpperCase()}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            <p>{t("settings.userId")}</p>
            <p className="font-mono mt-1">{user.id}</p>
          </div>
        </div>

        {/* Name Field */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t("settings.name")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.namePlaceholder")}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Email Field (read-only) */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t("settings.email")}</label>
          <input
            type="email"
            value={user.email ?? ""}
            readOnly
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted text-muted-foreground cursor-not-allowed"
          />
        </div>

        {/* Avatar URL Field */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t("settings.avatar")}</label>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder={t("settings.avatarUrlPlaceholder")}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : null}
            {saving ? t("settings.saving") : saved ? t("settings.saved") : t("settings.save")}
          </button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>

      {/* Account Section */}
      <div className="rounded-xl border border-border bg-background p-6 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t("settings.account")}
        </h2>
        <button
          onClick={() => {
            auth.logout();
          }}
          className="w-full px-4 py-2 rounded-lg border border-border text-destructive hover:bg-destructive/10 transition-colors font-medium"
        >
          {t("settings.signOut")}
        </button>
      </div>
    </div>
  );
}
