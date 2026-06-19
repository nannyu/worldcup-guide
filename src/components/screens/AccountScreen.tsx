"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "register";

export function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await response.json().catch(() => null);
    setSubmitting(false);

    if (!response.ok || !data?.ok) {
      setMessage(data?.error || t("auth.genericError"));
      return;
    }

    router.push("/settings");
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-24 pt-6 md:px-6 md:pt-10">
      <section className="border-2 border-[#241A14] bg-[#FAF7F0] p-4 shadow-[4px_4px_0_0_#241A14] md:p-6">
        <div className="border-b-2 border-[#241A14] pb-4">
          <p className="text-xs font-black tracking-[0.2em] text-[#D36E52]">
            {t("auth.eyebrow")}
          </p>
          <h1
            className="mt-1 text-2xl font-black text-[#241A14]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}
          </h1>
        </div>

        <div className="mt-4 grid grid-cols-2 border border-[#241A14] bg-[#EDE9E0] p-1">
          {(["login", "register"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setMode(item);
                setMessage(null);
              }}
              className={`flex h-9 items-center justify-center gap-1.5 text-sm font-black ${
                mode === item ? "bg-[#D36E52] text-white" : "text-[#5C524C]"
              }`}
            >
              {item === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {item === "login" ? t("common.signIn") : t("auth.signUp")}
            </button>
          ))}
        </div>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">{t("settings.name")}</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {message && (
            <p className="border border-[#D36E52] bg-[#D36E52]/10 px-3 py-2 text-sm font-bold text-[#8A3B2D]">
              {message}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="h-10 w-full rounded-[4px] border border-[#241A14] bg-[#241A14] text-white hover:bg-[#241A14]/90"
          >
            {submitting ? t("common.loading") : mode === "login" ? t("common.signIn") : t("auth.createAccount")}
          </Button>
        </form>

        <div className="mt-4 text-center text-xs text-[#5C524C]">
          <Link href="/" className="font-bold text-[#D36E52]">
            {t("errors.notFound.backHome")}
          </Link>
        </div>
      </section>
    </main>
  );
}
