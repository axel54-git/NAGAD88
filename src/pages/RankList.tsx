import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Flame, TrendingUp } from 'lucide-react';
import { useAuth, useAppStore } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';
import { maskUid } from '../lib/format';
import { subscribeAllUsers } from '../lib/firebase';
import type { User } from '../types';

// Format USD/USDT currency with dollar symbol ($)
function formatDollar(amount: number): string {
  const num = Number(amount) || 0;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CrownIcon({ color, className = "w-7 h-7" }: { color: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M4 17C4 17.5523 4.44772 18 5 18H19C19.5523 18 20 17.5523 20 17L18.5 7.5L14.5 12L12 4.5L9.5 12L5.5 7.5L4 17Z" />
      <circle cx="5.5" cy="7.5" r="1.5" />
      <circle cx="12" cy="4.5" r="1.5" />
      <circle cx="18.5" cy="7.5" r="1.5" />
    </svg>
  );
}

export function RankList() {
  const db = useAppStore();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  // Real-time synchronization with Firebase RTDB users
  const [remoteUsers, setRemoteUsers] = useState<Record<string, User>>({});

  useEffect(() => {
    const unsub = subscribeAllUsers((users) => {
      if (users && typeof users === 'object') {
        setRemoteUsers(users);
      }
    });
    return () => unsub();
  }, []);

  // Filter 100% genuine real users: strictly exclude demo users, fake IDs, or test accounts
  // Sort strictly by highest total income (Math.max(lifetimeEarned, balance)) descending
  // Maximum 10 users displayed
  const top10Users = useMemo(() => {
    const merged: Record<string, User> = { ...db.users, ...remoteUsers };
    const fakeIds = new Set([
      "984210452", "742189301", "610928374", "528401923", "419401859", "724910385", "0"
    ]);

    const isDemoUser = (u: User) => {
      if (!u || !u.telegramId) return true;
      const tid = String(u.telegramId).trim();
      if (fakeIds.has(tid) || tid === "724910385" || tid === "0") return true;
      if (tid.startsWith("demo") || tid.startsWith("seed_") || tid.startsWith("test_")) return true;
      if (u.username === "demo_user" || u.username === "tg_user") return true;
      const fn = (u.firstName || "").toLowerCase();
      const ln = (u.lastName || "").toLowerCase();
      if (fn.includes("demo") || ln.includes("demo")) return true;
      if (!/^-?\d+$/.test(tid)) return true;
      return false;
    };

    const list = Object.values(merged)
      .filter((u): u is User => Boolean(u && u.telegramId && !u.banned && !isDemoUser(u)))
      .sort((a, b) => {
        const earnA = Math.max(Number(a.lifetimeEarned || 0), Number(a.balance || 0));
        const earnB = Math.max(Number(b.lifetimeEarned || 0), Number(b.balance || 0));
        if (earnB !== earnA) {
          return earnB - earnA;
        }
        return (Number(b.referralCount) || 0) - (Number(a.referralCount) || 0);
      });

    return list.slice(0, 10);
  }, [db.users, remoteUsers]);

  const first = top10Users[0];
  const second = top10Users[1];
  const third = top10Users[2];
  const remaining = top10Users.slice(3);

  return (
    <main className="min-h-screen pb-24 text-[#fff7eb]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3.5 border-b border-amber-400/20 bg-[#1a0e07]/90 px-4 py-3.5 backdrop-blur-md">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="luxury-btn-dark flex h-9 w-9 items-center justify-center rounded-xl active:scale-95 transition-transform cursor-pointer"
        >
          <ChevronLeft className="h-5 w-5 text-amber-300" />
        </button>
        <h1 className="text-[17px] font-bold text-[#fff7eb] tracking-tight">Rank List</h1>
      </header>

      {/* Podium Card for Top 3 */}
      <section className="luxury-card mx-3.5 mt-3.5 rounded-[1.75rem] p-4 pb-0">
        <div className="flex items-end justify-center gap-2">
          {/* 2nd Place (Left) */}
          <div className="flex flex-1 flex-col items-center">
            <CrownIcon color="#93c5fd" className="w-6 h-6 -mb-1 animate-pulse" />
            <div className="relative mt-1">
              {second ? (
                <Avatar src={second.photoUrl} name={second.firstName} size={54} ring="ring-4 ring-sky-400/50" />
              ) : (
                <div className="h-[54px] w-[54px] rounded-full border-2 border-dashed border-sky-400/40 bg-sky-500/10 flex items-center justify-center text-[10px] text-sky-300 font-bold">
                  #2
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[10.5px] font-black text-white shadow ring-2 ring-[#1c1008]">
                2
              </span>
            </div>
            <p className="mt-2 text-center text-[11px] font-bold text-[#fff7eb] truncate max-w-[85px]">
              {second ? `UID: ${maskUid(second.telegramId)}` : 'অপেক্ষমান'}
            </p>
            <span className="mt-1.5 rounded-full border border-sky-400/30 bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-200 tabular-nums">
              {second ? formatDollar(Math.max(Number(second.lifetimeEarned || 0), Number(second.balance || 0))) : '$0.00'}
            </span>
            <div className="mt-2.5 flex h-14 w-full items-center justify-center rounded-t-2xl bg-gradient-to-b from-sky-500/80 to-sky-700/80 text-xs font-black tracking-wider text-white shadow-sm">
              2ND
            </div>
          </div>

          {/* 1st Place (Center) */}
          <div className="flex flex-1 flex-col items-center">
            <CrownIcon color="#fbbf24" className="w-8 h-8 -mb-1 drop-shadow-sm animate-bounce" />
            <div className="relative mt-0.5">
              {first ? (
                <Avatar src={first.photoUrl} name={first.firstName} size={68} ring="ring-4 ring-amber-400" />
              ) : (
                <div className="h-[68px] w-[68px] rounded-full border-2 border-dashed border-amber-400/50 bg-amber-500/10 flex items-center justify-center text-[10px] text-amber-300 font-bold">
                  #1
                </div>
              )}
              <span className="luxury-btn-gold absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-black shadow ring-2 ring-[#1c1008]">
                1
              </span>
            </div>
            <p className="mt-2 text-center text-xs font-bold text-[#fff7eb] truncate max-w-[95px]">
              {first ? `UID: ${maskUid(first.telegramId)}` : 'অপেক্ষমান'}
            </p>
            <span className="luxury-btn-gold mt-1.5 rounded-full px-3.5 py-1 text-xs font-extrabold tabular-nums">
              {first ? formatDollar(Math.max(Number(first.lifetimeEarned || 0), Number(first.balance || 0))) : '$0.00'}
            </span>
            <div className="luxury-btn-gold mt-2.5 flex h-20 w-full items-center justify-center rounded-t-2xl text-sm font-black tracking-wider">
              1ST
            </div>
          </div>

          {/* 3rd Place (Right) */}
          <div className="flex flex-1 flex-col items-center">
            <CrownIcon color="#d97706" className="w-6 h-6 -mb-1 animate-pulse" />
            <div className="relative mt-1">
              {third ? (
                <Avatar src={third.photoUrl} name={third.firstName} size={50} ring="ring-4 ring-amber-600/60" />
              ) : (
                <div className="h-[50px] w-[50px] rounded-full border-2 border-dashed border-amber-500/40 bg-amber-500/10 flex items-center justify-center text-[10px] text-amber-300 font-bold">
                  #3
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-700 text-[10.5px] font-black text-white shadow ring-2 ring-[#1c1008]">
                3
              </span>
            </div>
            <p className="mt-2 text-center text-[11px] font-bold text-[#fff7eb] truncate max-w-[85px]">
              {third ? `UID: ${maskUid(third.telegramId)}` : 'অপেক্ষমান'}
            </p>
            <span className="mt-1.5 rounded-full border border-amber-500/35 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 tabular-nums">
              {third ? formatDollar(Math.max(Number(third.lifetimeEarned || 0), Number(third.balance || 0))) : '$0.00'}
            </span>
            <div className="mt-2.5 flex h-11 w-full items-center justify-center rounded-t-2xl bg-gradient-to-b from-amber-600/90 to-amber-800/90 text-xs font-black tracking-wider text-white shadow-sm">
              3RD
            </div>
          </div>
        </div>
      </section>

      {/* Section Header */}
      <div className="mt-6 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <span className="h-5 w-1.5 rounded-full bg-amber-400" />
          <h2 className="text-[16px] font-bold text-[#fff7eb] drop-shadow-xs">Top Earners</h2>
        </div>
        <span className="luxury-btn-dark rounded-full px-3 py-1 text-xs font-bold text-amber-300">
          {top10Users.length} TOTAL
        </span>
      </div>

      {/* Ranks 4 to 10 List */}
      <ul className="mt-3 space-y-2.5 px-4">
        {remaining.length === 0 && (
          <li className="luxury-card rounded-2xl px-4 py-8 text-center text-xs text-amber-100/60">
            {top10Users.length === 0 ? "লোড হচ্ছে..." : "শীর্ষ ৩ জনের বাইরে অতিরিক্ত তথ্য নেই"}
          </li>
        )}
        {remaining.map((user, idx) => {
          const rank = idx + 4;
          const userMoney = Math.max(Number(user.lifetimeEarned || 0), Number(user.balance || 0));
          const initial = (user.firstName || user.username || 'U').charAt(0).toUpperCase();
          const isMe = user.telegramId === currentUser?.telegramId;

          return (
            <li
              key={user.telegramId}
              className={`luxury-card flex items-center justify-between rounded-2xl p-3 transition-all ${
                isMe ? "ring-1 ring-amber-400" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Rank Circle with Green Trend Arrow */}
                <div className="luxury-subcard flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-2xl">
                  <span className="text-[13px] font-bold text-[#fff7eb] leading-tight">{rank}</span>
                  <TrendingUp className="h-3 w-3 text-emerald-400 stroke-[2.5]" />
                </div>

                {/* Avatar with initial badge */}
                <div className="relative flex-shrink-0">
                  <Avatar src={user.photoUrl} name={user.firstName} size={42} ring="ring-1 ring-amber-400/40" />
                  <span className="luxury-btn-gold absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ring-2 ring-[#1c1008]">
                    {initial}
                  </span>
                </div>

                {/* Masked UID and Tags */}
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-[#fff7eb]">
                    UID: {maskUid(user.telegramId)}
                    {isMe && <span className="ml-1 text-[10px] text-amber-300 font-extrabold">(আপনি)</span>}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                      #{rank}
                    </span>
                    <span className="flex items-center gap-0.5 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                      <Flame className="h-2.5 w-2.5 fill-amber-300 text-amber-300" /> HOT
                    </span>
                  </div>
                </div>
              </div>

              {/* Amount pill in Dollar ($) */}
              <div className="flex-shrink-0 pl-2">
                <span className="luxury-btn-gold rounded-full px-3.5 py-1.5 text-xs font-extrabold inline-block tabular-nums">
                  {formatDollar(userMoney)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
