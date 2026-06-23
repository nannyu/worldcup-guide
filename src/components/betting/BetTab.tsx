"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, Plus, X, Check } from "lucide-react";
import { request } from "@/lib/api/request";
import { auth } from "@eazo/sdk";
import { useEazo } from "@eazo/sdk/react";
import { localizeTeamName } from "@/lib/i18n/content";

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

type Market = {
  id: string;
  title: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  homeMarketProb: number;
  awayMarketProb: number;
  status: string;
  kickoffBj: string;
  outcomes?: Array<{ label: string; probability: number }>;
  betCounts?: Array<{ outcomeIndex: number; count: number }>;
  volumeUsd?: number;
};

function formatVolume(usd: number | undefined): string {
  if (!usd || usd <= 0) return "";
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

type LeaderboardEntry = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  balance: number;
  betCount: number;
  winCount: number;
};

type SlipLeg = {
  market: Market;
  outcomeIndex: number;
  outcomeLabel: string;
  probability: number;
  odds: number;
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
    placeBet: "下注",
    cancel: "取消",
    confirm: "确认下注",
    chips: "筹码",
    odds: "赔率",
    potentialWin: "预计赢取",
    pending: "待结算",
    won_: "赢",
    lost: "输",
    noBets: "暂无注单",
    rank: "排名",
    name: "昵称",
    totalBalance: "总余额",
    loading: "加载中...",
    placeBetSuccess: "下注成功",
    insufficientChips: "筹码不足",
    marketFinished: "盘口已结算",
    noMarkets: "暂无可下注盘口",
    selected: "已选",
   场: "场",
    viewSlip: "查看注单",
    combinedOdds: "总赔率",
    parlay_: "串联",
    singles: "单注",
    addMore: "可继续添加",
    min2legs: "至少选2场",
    clearAll: "清空",
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
    placeBet: "Bet",
    cancel: "Cancel",
    confirm: "Confirm Bet",
    chips: "Chips",
    odds: "Odds",
    potentialWin: "Potential Win",
    pending: "Pending",
    won_: "Won",
    lost: "Lost",
    noBets: "No bets yet",
    rank: "Rank",
    name: "Name",
    totalBalance: "Total Balance",
    loading: "Loading...",
    placeBetSuccess: "Bet placed!",
    insufficientChips: "Insufficient chips",
    marketFinished: "Market settled",
    noMarkets: "No markets available",
    selected: "Selected",
   场: "",
    viewSlip: "View Slip",
    combinedOdds: "Combined Odds",
    parlay_: "Parlay",
    singles: "Singles",
    addMore: "Add more",
    min2legs: "Min 2 selections",
    clearAll: "Clear",
  },
} as const;

export function BetTab({ locale }: { locale: Locale }) {
  const user = useEazo((s) => s.auth.user);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [parlays, setParlays] = useState<ParlayEntry[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [slipLegs, setSlipLegs] = useState<SlipLeg[]>([]);
  const [showSlip, setShowSlip] = useState(false);
  const [betAmount, setBetAmount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<"markets" | "mybets" | "leaderboard">("markets");

  const texts = locale.startsWith("zh") ? t.zh : t.en;

  const fetchAll = useCallback(async () => {
    try {
      const [balanceRes, betsRes, marketsRes, leaderboardRes, parlayRes] = await Promise.all([
        request("/api/betting/balance"),
        request("/api/betting/bets?status=pending&limit=20"),
        request("/api/betting/markets"),
        request("/api/betting/leaderboard?limit=20"),
        request("/api/betting/parlay?limit=10"),
      ]);

      const balanceData = await balanceRes.json();
      if (balanceData.ok) setBalance(balanceData);

      const betsData = await betsRes.json();
      if (betsData.ok) setBets(betsData.bets);

      const marketsData = await marketsRes.json();
      if (marketsData.ok) setMarkets(marketsData.markets);

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

  // Toggle a leg in/out of the slip
  const toggleLeg = (market: Market, outcomeIndex: number) => {
    if (market.status === "finished") return;
    const prob = outcomeIndex === 0 ? market.homeMarketProb / 100 : market.awayMarketProb / 100;
    if (prob <= 0) return;
    const odds = 1 / prob;
    const label = outcomeIndex === 0
      ? `${market.homeFlag} ${localizeTeamName(market.homeTeam, locale)}`
      : `${market.awayFlag} ${localizeTeamName(market.awayTeam, locale)}`;

    setSlipLegs((prev) => {
      // Check if this exact selection already exists
      const existing = prev.findIndex(
        (l) => l.market.id === market.id && l.outcomeIndex === outcomeIndex,
      );
      if (existing >= 0) {
        // Remove it
        return prev.filter((_, i) => i !== existing);
      }
      // Check if same market already selected (different outcome) → replace
      const sameMarket = prev.findIndex((l) => l.market.id === market.id);
      if (sameMarket >= 0) {
        const updated = [...prev];
        updated[sameMarket] = { market, outcomeIndex, outcomeLabel: label, probability: prob, odds };
        return updated;
      }
      // Add new leg
      return [...prev, { market, outcomeIndex, outcomeLabel: label, probability: prob, odds }];
    });
  };

  // Check if a specific outcome is selected
  const isLegSelected = (marketId: string, outcomeIndex: number) => {
    return slipLegs.some((l) => l.market.id === marketId && l.outcomeIndex === outcomeIndex);
  };

  const combinedOdds = slipLegs.reduce((acc, l) => acc * l.odds, 1);

  const placeSingleBet = async (leg: SlipLeg) => {
    if (!(await requireLogin())) return;
    setPlacing(true);
    setMessage(null);
    try {
      const res = await request("/api/betting/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: leg.market.id,
          category: "moneyline",
          outcomeIndex: leg.outcomeIndex,
          outcomeLabel: leg.outcomeLabel,
          amount: betAmount,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(texts.placeBetSuccess);
        setSlipLegs([]);
        setShowSlip(false);
        setBalance((prev) => prev ? { ...prev, balance: data.balance } : prev);
        fetchAll();
      } else {
        setMessage(data.error || "Error");
      }
    } catch (err) {
      console.error("Failed to place bet:", err);
    } finally {
      setPlacing(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const placeParlayBet = async () => {
    if (!(await requireLogin())) return;
    if (slipLegs.length < 2 || !balance) return;
    setPlacing(true);
    setMessage(null);
    try {
      const res = await request("/api/betting/parlay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legs: slipLegs.map((l) => ({
            marketId: l.market.id,
            category: "moneyline",
            outcomeIndex: l.outcomeIndex,
            outcomeLabel: l.outcomeLabel,
          })),
          amount: betAmount,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(texts.placeBetSuccess);
        setSlipLegs([]);
        setShowSlip(false);
        setBalance((prev) => prev ? { ...prev, balance: data.balance } : prev);
        fetchAll();
      } else {
        setMessage(data.error || "Error");
      }
    } catch (err) {
      console.error("Failed to place parlay:", err);
    } finally {
      setPlacing(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleConfirmBet = () => {
    if (slipLegs.length === 1) {
      placeSingleBet(slipLegs[0]);
    } else {
      placeParlayBet();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-neutral-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        {texts.loading}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Balance Card */}
      <div className="rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-amber-300">
            <Coins size={20} />
            <span className="text-sm font-medium">{texts.balance}</span>
          </div>
          {(!balance || balance.todayMinted === 0) && (
            <button
              onClick={claimChips}
              disabled={claiming || balance?.todayMatchCount === 0}
              className="flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500 text-black text-xs font-bold disabled:opacity-50"
            >
              {claiming ? <Loader2 size={14} className="animate-spin" /> : <Coins size={14} />}
              {balance?.todayMatchCount === 0 ? texts.noMatches : texts.claimChips}
            </button>
          )}
          {balance && balance.todayMinted > 0 && (
            <span className="text-xs text-amber-400/70">{texts.claimed}</span>
          )}
        </div>
        <div className="text-3xl font-bold text-amber-300">{balance?.balance ?? 0}</div>
        <div className="grid grid-cols-4 gap-2 mt-3 text-xs text-neutral-400">
          <div><span className="text-neutral-300">{balance?.totalMinted ?? 0}</span> {texts.minted}</div>
          <div><span className="text-neutral-300">{balance?.totalWagered ?? 0}</span> {texts.wagered}</div>
          <div><span className="text-neutral-300">{balance?.totalWon ?? 0}</span> {texts.won}</div>
          <div>
            <span className="text-neutral-300">{balance?.betCount ?? 0}</span> {texts.bets}
            {balance && balance.betCount > 0 && (
              <span className="text-amber-400"> ({Math.round((balance.winCount / balance.betCount) * 100)}%)</span>
            )}
          </div>
        </div>
      </div>

      {/* Message Toast */}
      {message && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-neutral-800 border border-neutral-700 text-sm text-white shadow-lg">
          {message}
        </div>
      )}

      {/* Sub tabs */}
      <div className="flex gap-2">
        {(["markets", "mybets", "leaderboard"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              subTab === tab
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "bg-neutral-800 text-neutral-400 border border-transparent hover:border-neutral-700"
            }`}
          >
            {tab === "markets" ? texts.placeBet : tab === "mybets" ? texts.yourBets : texts.leaderboard}
          </button>
        ))}
      </div>

      {/* Markets */}
      {subTab === "markets" && (
        <div className="space-y-2">
          {markets.length === 0 && (
            <div className="text-center py-10 text-neutral-500 text-sm">{texts.noMarkets}</div>
          )}
          {markets.map((market) => {
            const homeSelected = isLegSelected(market.id, 0);
            const awaySelected = isLegSelected(market.id, 1);
            const homeBetCount = market.betCounts?.find((b) => b.outcomeIndex === 0)?.count;
            const awayBetCount = market.betCounts?.find((b) => b.outcomeIndex === 1)?.count;
            return (
              <div key={market.id} className="rounded-xl bg-neutral-900 border border-neutral-800 p-3">
                <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
                  <span>{market.kickoffBj}</span>
                  <div className="flex items-center gap-3">
                    {market.volumeUsd ? <span className="text-neutral-600">{formatVolume(market.volumeUsd)}</span> : null}
                    <span>{market.status === "live" ? "🔴 LIVE" : market.status}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{market.homeFlag}</span>
                    <span className="text-sm font-medium text-neutral-200">{localizeTeamName(market.homeTeam, locale)}</span>
                  </div>
                  <span className="text-xs text-neutral-500">vs</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-200">{localizeTeamName(market.awayTeam, locale)}</span>
                    <span className="text-lg">{market.awayFlag}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => toggleLeg(market, 0)}
                    disabled={market.status === "finished" || market.homeMarketProb <= 0}
                    className={`flex flex-col items-center p-2.5 rounded-lg border transition-colors disabled:opacity-50 ${
                      homeSelected
                        ? "bg-amber-500/20 border-amber-500/50"
                        : "bg-neutral-800 hover:bg-amber-500/10 border-neutral-700 hover:border-amber-500/30"
                    }`}
                  >
                    <span className="text-[11px] text-neutral-400">{localizeTeamName(market.homeTeam, locale)}</span>
                    <span className="text-xl font-bold text-amber-300">{market.homeMarketProb}%</span>
                    <div className="w-full h-1 rounded-full bg-neutral-700 mt-1">
                      <div className="h-1 rounded-full bg-amber-500" style={{ width: `${market.homeMarketProb}%` }} />
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-neutral-500">{(1 / (market.homeMarketProb / 100)).toFixed(2)}x</span>
                      {homeBetCount ? <span className="text-[10px] text-neutral-600">({homeBetCount})</span> : null}
                    </div>
                    {homeSelected && <Check size={14} className="text-amber-400 mt-1" />}
                  </button>
                  <button
                    onClick={() => toggleLeg(market, 1)}
                    disabled={market.status === "finished" || market.awayMarketProb <= 0}
                    className={`flex flex-col items-center p-2.5 rounded-lg border transition-colors disabled:opacity-50 ${
                      awaySelected
                        ? "bg-amber-500/20 border-amber-500/50"
                        : "bg-neutral-800 hover:bg-amber-500/10 border-neutral-700 hover:border-amber-500/30"
                    }`}
                  >
                    <span className="text-[11px] text-neutral-400">{localizeTeamName(market.awayTeam, locale)}</span>
                    <span className="text-xl font-bold text-amber-300">{market.awayMarketProb}%</span>
                    <div className="w-full h-1 rounded-full bg-neutral-700 mt-1">
                      <div className="h-1 rounded-full bg-amber-500" style={{ width: `${market.awayMarketProb}%` }} />
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-neutral-500">{(1 / (market.awayMarketProb / 100)).toFixed(2)}x</span>
                      {awayBetCount ? <span className="text-[10px] text-neutral-600">({awayBetCount})</span> : null}
                    </div>
                    {awaySelected && <Check size={14} className="text-amber-400 mt-1" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* My Bets — singles */}
      {subTab === "mybets" && (
        <div className="space-y-3">
          {/* Parlay entries */}
          {parlays.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-neutral-500 uppercase tracking-wider">{texts.parlay_}</div>
              {parlays.map((parlay) => (
                <div key={parlay.id} className="rounded-lg bg-neutral-900 border border-neutral-800 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-amber-400">
                      {parlay.legCount}串1 · {parlay.totalAmount} {texts.chips}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      parlay.status === "won" ? "bg-green-500/20 text-green-400" :
                      parlay.status === "lost" ? "bg-red-500/20 text-red-400" :
                      "bg-neutral-700 text-neutral-400"
                    }`}>
                      {parlay.status === "won" ? texts.won_ : parlay.status === "lost" ? texts.lost : texts.pending}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {parlay.legs.map((leg) => (
                      <div key={leg.id} className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400 truncate">{leg.outcomeLabel}</span>
                        <span className={`${
                          leg.status === "won" ? "text-green-400" :
                          leg.status === "lost" ? "text-red-400" :
                          "text-neutral-500"
                        }`}>
                          {leg.status === "won" ? "✓" : leg.status === "lost" ? "✗" : "·"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {parlay.status === "won" && (
                    <div className="text-xs text-green-400 mt-1">+{parlay.payout}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Single bets */}
          {bets.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-neutral-500 uppercase tracking-wider">{texts.singles}</div>
              {bets.map((bet) => (
                <div key={bet.id} className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-neutral-200">{bet.outcomeLabel}</div>
                    <div className="text-xs text-neutral-500">{bet.category}</div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-amber-300">{bet.amount} chips</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        bet.status === "won" ? "bg-green-500/20 text-green-400" :
                        bet.status === "lost" ? "bg-red-500/20 text-red-400" :
                        "bg-neutral-700 text-neutral-400"
                      }`}>
                        {bet.status === "won" ? texts.won_ : bet.status === "lost" ? texts.lost : texts.pending}
                      </span>
                    </div>
                    {bet.status === "won" && (
                      <div className="text-xs text-green-400">+{bet.payout}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {bets.length === 0 && parlays.length === 0 && (
            <div className="text-center py-10 text-neutral-500 text-sm">{texts.noBets}</div>
          )}
        </div>
      )}

      {/* Leaderboard */}
      {subTab === "leaderboard" && (
        <div className="space-y-2">
          {leaderboard.map((entry, i) => (
            <div key={entry.userId} className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                i === 0 ? "bg-amber-500 text-black" :
                i === 1 ? "bg-neutral-400 text-black" :
                i === 2 ? "bg-orange-700 text-white" :
                "bg-neutral-800 text-neutral-400"
              }`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-neutral-200 truncate">{entry.name || "Anonymous"}</div>
                <div className="text-xs text-neutral-500">
                  {entry.betCount} {texts.bets} · {entry.winCount} {texts.wins}
                  {entry.betCount > 0 && (
                    <span className="text-amber-400"> ({Math.round((entry.winCount / entry.betCount) * 100)}%)</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-amber-300">{entry.balance}</div>
                <div className="text-[10px] text-neutral-500">{texts.chips}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Slip Bar */}
      {slipLegs.length > 0 && subTab === "markets" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-900 border-t border-neutral-700 px-4 py-3">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-sm text-neutral-300">
                <span className="font-bold text-amber-300">{slipLegs.length}</span> {texts.selected}
              </div>
              <div className="text-xs text-neutral-500">
                {texts.combinedOdds}: <span className="text-amber-300">{combinedOdds.toFixed(2)}x</span>
              </div>
            </div>
            <button
              onClick={() => setShowSlip(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 text-black text-sm font-bold"
            >
              {texts.viewSlip}
            </button>
          </div>
        </div>
      )}

      {/* Parlay Slip Modal */}
      {showSlip && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setShowSlip(false)}>
          <div
            className="w-full max-w-md bg-neutral-900 border-t border-neutral-700 rounded-t-2xl p-5 space-y-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {slipLegs.length === 1 ? texts.placeBet : texts.parlay_}
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setSlipLegs([]); setShowSlip(false); }}
                  className="text-xs text-neutral-500 hover:text-neutral-300"
                >
                  {texts.clearAll}
                </button>
                <button onClick={() => setShowSlip(false)} className="text-neutral-400 hover:text-white">✕</button>
              </div>
            </div>

            {/* Legs list */}
            <div className="space-y-2">
              {slipLegs.map((leg, i) => (
                <div key={`${leg.market.id}-${leg.outcomeIndex}`} className="rounded-lg bg-neutral-800 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-neutral-500 mb-1">
                        {leg.market.homeFlag} {localizeTeamName(leg.market.homeTeam, locale)} vs {localizeTeamName(leg.market.awayTeam, locale)} {leg.market.awayFlag}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-amber-300">{leg.outcomeLabel}</span>
                        <span className="text-sm text-neutral-400">{leg.odds.toFixed(2)}x</span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleLeg(leg.market, leg.outcomeIndex)}
                      className="ml-3 text-neutral-500 hover:text-red-400"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Combined odds display */}
            {slipLegs.length >= 2 && (
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-neutral-400">{texts.combinedOdds}</span>
                <span className="font-bold text-amber-300">{combinedOdds.toFixed(2)}x</span>
              </div>
            )}

            {/* Amount input */}
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">{texts.chips}</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBetAmount(Math.max(1, betAmount - 1))}
                  className="w-10 h-10 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 flex items-center justify-center"
                >
                  −
                </button>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(Math.max(1, Math.min(balance?.balance ?? 0, Number(e.target.value))))}
                  min={1}
                  max={balance?.balance ?? 0}
                  className="flex-1 h-10 rounded-lg bg-neutral-800 border border-neutral-700 text-center text-white text-lg font-bold focus:border-amber-500 focus:outline-none"
                />
                <button
                  onClick={() => setBetAmount(Math.min(balance?.balance ?? 0, betAmount + 1))}
                  className="w-10 h-10 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 flex items-center justify-center"
                >
                  +
                </button>
              </div>
              <div className="flex justify-between mt-2 text-xs text-neutral-500">
                <span>{texts.chips}: {balance?.balance ?? 0}</span>
                <span>{texts.potentialWin}: {Math.floor(betAmount * combinedOdds)}</span>
              </div>
            </div>

            <button
              onClick={handleConfirmBet}
              disabled={placing || betAmount <= 0 || betAmount > (balance?.balance ?? 0) || slipLegs.length === 0}
              className="w-full h-12 rounded-xl bg-amber-500 text-black font-bold text-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {placing ? <Loader2 size={20} className="animate-spin" /> : <Coins size={20} />}
              {texts.confirm} ({betAmount} {texts.chips})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
