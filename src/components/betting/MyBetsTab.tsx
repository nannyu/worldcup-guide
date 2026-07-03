"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { request } from "@/lib/api/request";
import { auth } from "@eazo/sdk";
import { useEazo } from "@eazo/sdk/react";

type Locale = "zh" | "en" | string;

type BalanceData = {
  balance: number;
  totalMinted: number;
  totalWagered: number;
  totalWon: number;
  betCount: number;
  winCount: number;
  todayMinted: number;
  todayMatchCount: number;
};

type Bet = {
  id: string;
  marketId: string;
  matchId: string;
  category: string;
  outcomeIndex: number;
  outcomeLabel: string;
  amount: number;
  oddsAtBet: string;
  status: string;
  payout: string;
  createdAt: string;
  parlayId?: string | null;
};

type LeaderboardEntry = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  balance: number;
  betCount: number;
  winCount: number;
};

type ParlayEntry = {
  id: string;
  legCount: number;
  totalAmount: number;
  combinedOdds: string;
  status: string;
  payout: string;
  settledAt: string | null;
  createdAt: string;
  legs: Bet[];
};

const t = {
  zh: {
    claimChips: "领取今日筹码",
    claimed: "已领取",
    noMatches: "今日无比赛",
    balance: "余额",
    minted: "已发放",
    wagered: "已下注",
    won: "已赢取",
    bets: "注单",
    wins: "胜场",
    winRate: "胜率",
    yourBets: "我的注单",
    leaderboard: "排行榜",
    chips: "筹码",
    pending: "待结算",
    won_: "赢",
    lost: "输",
    noBets: "暂无注单",
    rank: "排名",
    name: "昵称",
    totalBalance: "总余额",
    loading: "加载中...",
    parlay_: "串联",
    singles: "单注",
  },
  en: {
    claimChips: "Claim Daily Chips",
    claimed: "Claimed",
    noMatches: "No matches today",
    balance: "Balance",
    minted: "Minted",
    wagered: "Wagered",
    won: "Won",
    bets: "Bets",
    wins: "Wins",
    winRate: "Win Rate",
    yourBets: "Your Bets",
    leaderboard: "Leaderboard",
    chips: "Chips",
    pending: "Pending",
    won_: "Won",
    lost: "Lost",
    noBets: "No bets yet",
    rank: "Rank",
    name: "Name",
    totalBalance: "Total Balance",
    loading: "Loading...",
    parlay_: "Parlay",
    singles: "Singles",
  },
} as const;

export function MyBetsTab({ locale }: { locale: Locale }) {
  const user = useEazo((s) => s.auth.user);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [parlays, setParlays] = useState<ParlayEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<"mybets" | "leaderboard">("mybets");

  const texts = locale.startsWith("zh") ? t.zh : t.en;

  const fetchAll = useCallback(async () => {
    try {
      const [balanceRes, betsRes, leaderboardRes, parlayRes] = await Promise.all([
        request("/api/betting/balance"),
        request("/api/betting/bets?status=pending&limit=20"),
        request("/api/betting/leaderboard?limit=20"),
        request("/api/betting/parlay?limit=10"),
      ]);

      const balanceData = await balanceRes.json();
      if (balanceData.ok) setBalance(balanceData);

      const betsData = await betsRes.json();
      if (betsData.ok) setBets(betsData.bets);

      const leaderboardData = await leaderboardRes.json();
      if (leaderboardData.ok) setLeaderboard(leaderboardData.rankings);

      const parlayData = await parlayRes.json();
      if (parlayData.ok) setParlays(parlayData.parlays);
    } catch (err) {
      console.error("Failed to fetch betting data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAll();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchAll]);

  const requireLogin = useCallback(async (): Promise<boolean> => {
    if (user) return true;
    try {
      await auth.login();
    } catch {
      // login cancelled or failed
    }
    return false;
  }, [user]);

  const claimChips = async () => {
    if (!(await requireLogin())) return;
    setClaiming(true);
    setMessage(null);
    try {
      const res = await request("/api/betting/chips", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        if (data.minted > 0) {
          setMessage(`+${data.minted} ${texts.chips}`);
        } else {
          setMessage(texts.claimed);
        }
        setBalance((prev) => prev ? { ...prev, balance: data.balance, todayMinted: data.minted || prev.todayMinted } : prev);
      }
    } catch (err) {
      console.error("Failed to claim chips:", err);
    } finally {
      setClaiming(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#9E948C]">
        <Loader2 className="mr-2 animate-spin" size={20} />
        {texts.loading}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Balance Card — newspaper style */}
      <div className="border-2 border-[#241A14] bg-[#FAF7F0] p-4 shadow-[3px_3px_0_0_#241A14]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[#D36E52]">
            <Coins size={20} />
            <span className="text-sm font-black" style={{ fontFamily: "var(--font-heading)" }}>{texts.balance}</span>
          </div>
          {(!balance || balance.todayMinted === 0) && (
            <button
              onClick={claimChips}
              disabled={claiming || balance?.todayMatchCount === 0}
              className="flex items-center gap-1 border-2 border-[#241A14] bg-[#D36E52] px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
            >
              {claiming ? <Loader2 size={14} className="animate-spin" /> : <Coins size={14} />}
              {balance?.todayMatchCount === 0 ? texts.noMatches : texts.claimChips}
            </button>
          )}
          {balance && balance.todayMinted > 0 && (
            <span className="text-xs font-black text-[#9E948C]">{texts.claimed}</span>
          )}
        </div>
        <div className="text-3xl font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>
          {balance?.balance ?? 0}
          <span className="ml-2 text-sm font-bold text-[#9E948C]">{texts.chips}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-[#241A14]/20 pt-3 text-xs text-[#5C524C]">
          <div><span className="font-black text-[#241A14]">{balance?.totalMinted ?? 0}</span> {texts.minted}</div>
          <div><span className="font-black text-[#241A14]">{balance?.totalWagered ?? 0}</span> {texts.wagered}</div>
          <div><span className="font-black text-[#241A14]">{balance?.totalWon ?? 0}</span> {texts.won}</div>
          <div>
            <span className="font-black text-[#241A14]">{balance?.betCount ?? 0}</span> {texts.bets}
            {balance && balance.betCount > 0 && (
              <span className="text-[#D36E52]"> ({Math.round((balance.winCount / balance.betCount) * 100)}%)</span>
            )}
          </div>
        </div>
      </div>

      {/* Message Toast */}
      {message && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 border-2 border-[#241A14] bg-[#FAF7F0] px-4 py-2 text-sm font-black text-[#241A14] shadow-[3px_3px_0_0_#241A14]">
          {message}
        </div>
      )}

      {/* Sub tabs — newspaper style */}
      <div className="inline-flex w-full border border-[#241A14] bg-[#FAF7F0] p-1 sm:w-auto">
        {(["mybets", "leaderboard"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 border px-3 text-xs font-black transition-colors sm:min-w-28 ${
              subTab === tab
                ? "border-[#241A14] bg-[#D36E52] text-white"
                : "border-transparent text-[#5C524C] hover:border-[#241A14]/30 hover:bg-[#EDE9E0]"
            }`}
          >
            {tab === "mybets" ? texts.yourBets : texts.leaderboard}
          </button>
        ))}
      </div>

      {/* My Bets */}
      {subTab === "mybets" && (
        <div className="space-y-3">
          {/* Parlay entries */}
          {parlays.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9E948C]">{texts.parlay_}</div>
              {parlays.map((parlay) => (
                <div key={parlay.id} className="border border-[#241A14] bg-[#FAF7F0] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-[#D36E52]">
                      {parlay.legCount}串1 · {parlay.totalAmount} {texts.chips}
                    </span>
                    <span className={`border px-2 py-0.5 text-[10px] font-black ${
                      parlay.status === "won" ? "border-[#9CB48A] bg-[#9CB48A]/20 text-[#241A14]" :
                      parlay.status === "lost" ? "border-[#D36E52] bg-[#D36E52]/15 text-[#D36E52]" :
                      "border-[#241A14]/40 bg-[#EDE9E0] text-[#5C524C]"
                    }`}>
                      {parlay.status === "won" ? texts.won_ : parlay.status === "lost" ? texts.lost : texts.pending}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {parlay.legs.map((leg) => (
                      <div key={leg.id} className="flex items-center justify-between text-xs">
                        <span className="truncate text-[#5C524C]">{leg.outcomeLabel}</span>
                        <span className={`font-black ${
                          leg.status === "won" ? "text-[#9CB48A]" :
                          leg.status === "lost" ? "text-[#D36E52]" :
                          "text-[#9E948C]"
                        }`}>
                          {leg.status === "won" ? "✓" : leg.status === "lost" ? "✗" : "·"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {parlay.status === "won" && (
                    <div className="mt-1 text-xs font-black text-[#9CB48A]">+{parlay.payout}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Single bets */}
          {bets.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9E948C]">{texts.singles}</div>
              {bets.map((bet) => (
                <div key={bet.id} className="flex items-center justify-between border border-[#241A14] bg-[#FAF7F0] p-3">
                  <div>
                    <div className="text-sm font-black text-[#241A14]">{bet.outcomeLabel}</div>
                    <div className="text-[10px] font-bold text-[#9E948C]">{bet.category}</div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-[#D36E52]">{bet.amount} {texts.chips}</span>
                      <span className={`border px-2 py-0.5 text-[10px] font-black ${
                        bet.status === "won" ? "border-[#9CB48A] bg-[#9CB48A]/20 text-[#241A14]" :
                        bet.status === "lost" ? "border-[#D36E52] bg-[#D36E52]/15 text-[#D36E52]" :
                        "border-[#241A14]/40 bg-[#EDE9E0] text-[#5C524C]"
                      }`}>
                        {bet.status === "won" ? texts.won_ : bet.status === "lost" ? texts.lost : texts.pending}
                      </span>
                    </div>
                    {bet.status === "won" && (
                      <div className="text-xs font-black text-[#9CB48A]">+{bet.payout}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {bets.length === 0 && parlays.length === 0 && (
            <div className="border-2 border-dashed border-[#241A14] bg-[#FAF7F0] p-8 text-center">
              <p className="text-sm font-black text-[#241A14]">{texts.noBets}</p>
            </div>
          )}
        </div>
      )}

      {/* Leaderboard */}
      {subTab === "leaderboard" && (
        <div className="space-y-2">
          {leaderboard.map((entry, i) => (
            <div key={entry.userId} className="flex items-center gap-3 border border-[#241A14] bg-[#FAF7F0] p-3">
              <div className={`flex size-8 items-center justify-center border-2 text-sm font-black ${
                i === 0 ? "border-[#D36E52] bg-[#D36E52] text-white" :
                i === 1 ? "border-[#241A14] bg-[#EDE9E0] text-[#241A14]" :
                i === 2 ? "border-[#9E948C] bg-[#9E948C]/20 text-[#241A14]" :
                "border-[#241A14]/40 bg-[#F5F1E8] text-[#5C524C]"
              }`}>
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black text-[#241A14]">{entry.name || "Anonymous"}</div>
                <div className="text-[10px] text-[#9E948C]">
                  {entry.betCount} {texts.bets} · {entry.winCount} {texts.wins}
                  {entry.betCount > 0 && (
                    <span className="text-[#D36E52]"> ({Math.round((entry.winCount / entry.betCount) * 100)}%)</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-[#241A14]" style={{ fontFamily: "var(--font-heading)" }}>{entry.balance}</div>
                <div className="text-[10px] font-bold text-[#9E948C]">{texts.chips}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
