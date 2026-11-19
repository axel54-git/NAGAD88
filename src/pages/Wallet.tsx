import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  Wallet as WalletIcon,
  History,
  TrendingUp,
  Users,
  Clock,
  Headphones,
  MessageSquare
} from 'lucide-react';
import { useAuth, useAppStore } from '../contexts/AuthContext';
import { openTelegramChat } from '../lib/telegram';

export function Wallet() {
  const { user, config } = useAuth();
  const db = useAppStore();
  const navigate = useNavigate();

  const liveUser = (user?.telegramId && db.users[user.telegramId]) ? db.users[user.telegramId] : user;

  if (!liveUser) return null;

  const referralsNeeded = Math.max(0, config.minReferralsForWithdraw - liveUser.referralCount);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayActionsCount = db.logs.filter(
    (log) => log.telegramId === liveUser.telegramId && log.createdAt.slice(0, 10) === todayStr
  ).length;

  return (
    <main className="min-h-screen px-3 pt-3 pb-8">
      {/* Header */}
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Back"
            className="luxury-btn-dark flex h-8 w-8 items-center justify-center rounded-full active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-amber-300" />
          </button>
          <h1 className="text-[15px] font-extrabold text-[#fff7eb] drop-shadow-xs">Wallet</h1>
        </div>
        <span className="luxury-btn-dark flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold">
          USDT <ChevronDown className="h-3 w-3 text-amber-300" />
        </span>
      </header>

      {/* Total Earnings Card */}
      <section className="luxury-card relative overflow-hidden rounded-2xl p-4 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-400/15 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-10 -left-8 h-28 w-28 rounded-full bg-amber-600/15 blur-2xl"
        />

        <div className="relative">
          <p className="text-[12px] font-semibold text-amber-100/70">Total Balance</p>
          <p className="mt-0.5 text-[32px] font-extrabold leading-tight text-[#fff7eb] tabular-nums">
            ${liveUser.balance.toFixed(2)}
          </p>
          <p className="text-[11px] font-semibold text-amber-300 tabular-nums">
            Lifetime Earnings: ${liveUser.lifetimeEarned.toFixed(2)}
          </p>

          <div className="mt-3.5 flex gap-2">
            <button
              onClick={() => navigate("/wallet/cashout")}
              className="luxury-btn-gold flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-extrabold active:scale-98 transition cursor-pointer"
            >
              <WalletIcon className="h-4 w-4" /> Cash Out
            </button>
            <button
              onClick={() => navigate("/wallet/payments")}
              className="luxury-btn-dark flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-bold transition active:scale-98 cursor-pointer"
            >
              <History className="h-4 w-4 text-amber-300" /> Payments
            </button>
          </div>
        </div>
      </section>

      {/* 2 Stats Cards */}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <div className="luxury-card rounded-2xl p-3">
          <div className="flex items-start justify-between">
            <p className="text-[12px] font-medium text-amber-100/70">Today's earnings</p>
            <span className="luxury-subcard flex h-7 w-7 items-center justify-center rounded-lg">
              <TrendingUp className="h-3.5 w-3.5 text-amber-300" />
            </span>
          </div>
          <p className="mt-1 text-[22px] font-extrabold text-[#fff7eb] tabular-nums">
            ${liveUser.todayEarned.toFixed(2)}
          </p>
          <p className="text-[10px] text-amber-100/55">
            {todayActionsCount} earning actions
          </p>
        </div>

        <div className="luxury-card rounded-2xl p-3">
          <div className="flex items-start justify-between">
            <p className="text-[12px] font-medium text-amber-100/70">Total Referrals</p>
            <span className="luxury-subcard flex h-7 w-7 items-center justify-center rounded-lg">
              <Users className="h-3.5 w-3.5 text-amber-300" />
            </span>
          </div>
          <p className="mt-1 text-[22px] font-extrabold text-[#fff7eb] tabular-nums">
            {liveUser.referralCount}
          </p>
          <p className="text-[10px] text-amber-100/55">
            {referralsNeeded > 0 ? `${referralsNeeded} more needed` : "Withdraw unlocked!"}
          </p>
        </div>
      </div>

      {/* Support Section */}
      <h2 className="mt-4 text-[15px] font-extrabold text-[#fff7eb] drop-shadow-xs">Support</h2>
      <section className="luxury-card mt-2 rounded-2xl p-3">
        <div className="flex items-center gap-2.5">
          <span className="luxury-btn-gold flex h-10 w-10 items-center justify-center rounded-full shadow-sm">
            <Headphones className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-[#fff7eb]">Chat with Support</p>
            <p className="text-[11px] text-amber-100/60">Withdrawals • Balance • Account help</p>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-300">
            ● Online
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            onClick={() => openTelegramChat(config.supportUrl)}
            className="luxury-btn-dark flex h-9 items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold active:scale-95 transition cursor-pointer"
          >
            <MessageSquare className="h-3.5 w-3.5 text-amber-300" /> Live Agent
          </button>
          <button
            onClick={() => openTelegramChat(config.supportUrl)}
            className="luxury-btn-dark flex h-9 items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold active:scale-95 transition cursor-pointer"
          >
            <Clock className="h-3.5 w-3.5 text-amber-300" /> Quick Replies
          </button>
        </div>

        <button
          onClick={() => openTelegramChat(config.supportUrl)}
          className="luxury-btn-gold mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-full text-[13px] font-extrabold active:scale-98 transition cursor-pointer"
        >
          <MessageSquare className="h-4 w-4" /> Telegram Support Group
        </button>
      </section>
    </main>
  );
}
