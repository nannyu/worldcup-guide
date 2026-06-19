"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Save, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
  bio: string | null;
  favoriteTeams: string[];
  favoritePlayers: string[];
}

interface PreferenceOption {
  id: string;
  label: string;
  description?: string;
}

interface PreferenceOptions {
  teams: PreferenceOption[];
  players: PreferenceOption[];
}

export function UserSettingsScreen() {
  const { t } = useTranslation();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [options, setOptions] = useState<PreferenceOptions>({ teams: [], players: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [favoriteTeams, setFavoriteTeams] = useState<string[]>([]);
  const [favoritePlayers, setFavoritePlayers] = useState<string[]>([]);
  const [playerQuery, setPlayerQuery] = useState("");
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/user/settings", { cache: "no-store" }),
      fetch("/api/user/settings/options", { cache: "no-store" }),
    ])
      .then(async ([settingsResponse, optionsResponse]) => {
        const settingsData = await settingsResponse.json().catch(() => null);
        const optionsData = await optionsResponse.json().catch(() => null);
        if (!alive) return;
        const nextUser = settingsData?.user ?? null;
        setUser(nextUser);
        setOptions(optionsData?.options ?? { teams: [], players: [] });
        if (nextUser) {
          setName(nextUser.name ?? "");
          setBio(nextUser.bio ?? "");
          setFavoriteTeams(nextUser.favoriteTeams ?? []);
          setFavoritePlayers(nextUser.favoritePlayers ?? []);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filteredPlayers = useMemo(() => {
    const query = playerQuery.trim().toLowerCase();
    if (!query) return options.players;
    return options.players.filter((player) =>
      [player.label, player.description].filter(Boolean).some((value) =>
        String(value).toLowerCase().includes(query)
      )
    );
  }, [options.players, playerQuery]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/user/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, bio, favoriteTeams, favoritePlayers }),
    });
    const data = await response.json().catch(() => null);
    setSaving(false);
    setMessage(response.ok && data?.ok ? t("settings.saved") : data?.error || t("auth.genericError"));
    if (data?.user) setUser(data.user);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    const response = await fetch("/api/user/password", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(passwords),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok) {
      setPasswords({ currentPassword: "", newPassword: "" });
      setPasswordMessage(t("settings.passwordSaved"));
    } else {
      setPasswordMessage(data?.error || t("auth.genericError"));
    }
  }

  if (loading) {
    return <main className="px-4 py-8 text-sm font-bold text-[#5C524C]">{t("common.loading")}</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <section className="border-2 border-[#241A14] bg-[#FAF7F0] p-5 shadow-[4px_4px_0_0_#241A14]">
          <h1 className="text-xl font-black text-[#241A14]">{t("settings.title")}</h1>
          <Link
            href="/account"
            className="mt-4 inline-flex h-9 items-center rounded-[4px] border border-[#241A14] bg-[#D36E52] px-4 text-sm font-black text-white"
          >
            {t("auth.loginRegister")}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:px-6 md:pt-10">
      <header className="border-b-2 border-[#241A14] pb-4">
        <p className="text-xs font-black tracking-[0.2em] text-[#D36E52]">{t("settings.eyebrow")}</p>
        <h1
          className="mt-1 text-2xl font-black text-[#241A14]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {t("settings.title")}
        </h1>
        {user.email && <p className="mt-1 text-sm text-[#5C524C]">{user.email}</p>}
      </header>

      <form className="mt-5 space-y-5" onSubmit={saveProfile}>
        <section className="border-2 border-[#241A14] bg-[#FAF7F0] p-4 shadow-[3px_3px_0_0_#241A14]">
          <h2 className="mb-4 text-base font-black text-[#241A14]">{t("settings.profile")}</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">{t("settings.name")}</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">{t("settings.bio")}</Label>
              <Textarea
                id="bio"
                maxLength={300}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
              />
            </div>
          </div>
        </section>

        <PreferenceSection
          title={t("settings.favoriteTeams")}
          options={options.teams}
          selected={favoriteTeams}
          onToggle={(id) => setFavoriteTeams((items) => toggle(items, id))}
        />

        <section className="border-2 border-[#241A14] bg-[#FAF7F0] p-4 shadow-[3px_3px_0_0_#241A14]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-black text-[#241A14]">{t("settings.favoritePlayers")}</h2>
            <span className="text-xs font-bold text-[#9E948C]">{favoritePlayers.length}</span>
          </div>
          <Input
            value={playerQuery}
            onChange={(event) => setPlayerQuery(event.target.value)}
            placeholder={t("settings.searchPlayers")}
            className="mb-3"
          />
          <OptionCloud
            options={filteredPlayers}
            selected={favoritePlayers}
            onToggle={(id) => setFavoritePlayers((items) => toggle(items, id))}
          />
        </section>

        {message && <p className="text-sm font-bold text-[#D36E52]">{message}</p>}

        <Button
          type="submit"
          disabled={saving}
          className="h-10 w-full rounded-[4px] border border-[#241A14] bg-[#241A14] text-white"
        >
          <Save className="h-4 w-4" />
          {saving ? t("common.loading") : t("common.save")}
        </Button>
      </form>

      <form className="mt-6 border-2 border-[#241A14] bg-[#FAF7F0] p-4 shadow-[3px_3px_0_0_#241A14]" onSubmit={changePassword}>
        <h2 className="mb-4 flex items-center gap-2 text-base font-black text-[#241A14]">
          <ShieldCheck className="h-4 w-4" />
          {t("settings.password")}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">{t("settings.currentPassword")}</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(event) => setPasswords((value) => ({ ...value, currentPassword: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">{t("settings.newPassword")}</Label>
            <Input
              id="newPassword"
              type="password"
              minLength={6}
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(event) => setPasswords((value) => ({ ...value, newPassword: event.target.value }))}
            />
          </div>
        </div>
        {passwordMessage && <p className="mt-3 text-sm font-bold text-[#D36E52]">{passwordMessage}</p>}
        <Button
          type="submit"
          className="mt-4 h-9 rounded-[4px] border border-[#241A14] bg-[#D36E52] text-white"
        >
          {t("settings.changePassword")}
        </Button>
      </form>
    </main>
  );
}

function PreferenceSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: PreferenceOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <section className="border-2 border-[#241A14] bg-[#FAF7F0] p-4 shadow-[3px_3px_0_0_#241A14]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-[#241A14]">{title}</h2>
        <span className="text-xs font-bold text-[#9E948C]">{selected.length}</span>
      </div>
      <OptionCloud options={options} selected={selected} onToggle={onToggle} />
    </section>
  );
}

function OptionCloud({
  options,
  selected,
  onToggle,
}: {
  options: PreferenceOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const selectedSet = new Set(selected);
  return (
    <div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto pr-1">
      {options.map((option) => {
        const active = selectedSet.has(option.id);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onToggle(option.id)}
            className={`rounded-[4px] border px-2.5 py-1.5 text-left text-xs font-black transition-colors ${
              active
                ? "border-[#241A14] bg-[#D36E52] text-white"
                : "border-[#241A14]/35 bg-[#EDE9E0] text-[#5C524C] hover:border-[#241A14]"
            }`}
          >
            <span>{option.label}</span>
            {option.description && (
              <span className={`ml-1 font-medium ${active ? "text-white/80" : "text-[#9E948C]"}`}>
                {option.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function toggle(items: string[], id: string): string[] {
  return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
}
