import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Settings as SettingsIcon,
  BadgeCheck,
  User as UserIcon,
  Send,
  Link as LinkIcon,
  Trophy,
  ChevronRight
} from 'lucide-react';
import { useAuth, useAppStore } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';
import { formatDate } from '../lib/format';
import { AdsterraBanner } from '../components/AdsterraBanner';
import { triggerHaptic } from '../lib/telegram';

export function Profile() {
  const { user: authUser } = useAuth();
  const db = useAppStore();
  const config = db.config;
  const navigate = useNavigate();

  const user = (authUser?.telegramId && db.users[authUser.telegramId]) ? db.users[authUser.telegramId] : authUser;

  const rankTier = useMemo(() => {
    const refs = user?.referralCount ?? 0;
    if (refs >= 50) return "Diamond";
    if (refs >= 25) return "Gold";
    if (refs >= 10) return "Silver";
    return "Bronze";
  }, [user?.referralCount]);

  if (!user) return null;

  return (
    <main className="px-3 pt-3 pb-8">
      {/* Top Header */}
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Back"
            className="luxury-btn-dark flex h-8 w-8 items-center justify-center rounded-full active:scale-95 transition cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-amber-300" />
          </button>
          <h1 className="text-[15px] font-extrabold text-[#fff7eb] drop-shadow-xs">Profile</h1>
        </div>

        <button
          type="button"
          onClick={() => navigate("/profile/settings")}
          aria-label="Settings"
          className="luxury-btn-dark flex h-8 w-8 items-center justify-center rounded-xl active:scale-95 transition cursor-pointer"
        >
          <SettingsIcon className="h-4 w-4 text-amber-300" />
        </button>
      </header>

      {/* Main Profile Info Card */}
      <section className="luxury-card rounded-2xl p-3">
        <div>
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1 text-[16px] font-extrabold text-[#fff7eb]">
              {user.firstName} {user.lastName}
              {user.verified && <BadgeCheck className="h-4 w-4 text-emerald-400 fill-emerald-400/20" />}
            </p>
            {user.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300 border border-emerald-400/30">
                ✅ Channel Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[9.5px] font-bold text-rose-300 border border-rose-400/30">
                ❌ Unverified
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-100/60 font-mono">
            <UserIcon className="h-3 w-3 text-amber-300" /> User ID: {user.telegramId}
          </p>
          {user.bio && (
            <p className="mt-1 text-[11.5px] text-amber-100/80 italic">
              "{user.bio}"
            </p>
          )}
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <Avatar src={user.photoUrl} name={user.firstName} size={62} ring="ring-amber-400/40" />
          <div className="flex-1 space-y-1">
            <ProfileRow
              icon={<Send className="h-3.5 w-3.5 text-amber-300" />}
              label="Telegram ID:"
              value={user.telegramId}
            />
            <ProfileRow
              icon={<LinkIcon className="h-3.5 w-3.5 text-amber-300/70" />}
              label="Ref ID:"
              value={user.telegramId}
              valueClass="text-amber-300 font-mono"
            />
            <ProfileRow
              icon={<Trophy className="h-3.5 w-3.5 text-amber-400" />}
              label="Ref Level:"
              value={`${rankTier} (${user.referralCount} refs)`}
            />
          </div>
        </div>

        <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
          <BadgeCheck className="h-3.5 w-3.5 text-amber-300" />
          {user.verified ? "Verified Member" : "Standard Member"} • Joined {formatDate(user.createdAt)}
        </div>

        {/* 3 Stats: Balance, Referrals, Referral Earnings */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatBox label="BALANCE" value={`$${user.balance.toFixed(2)}`} />
          <StatBox label="REFERRALS" value={String(user.referralCount)} />
          <StatBox label="REF EARNED" value={`$${(Number(user.referralEarned) || 0).toFixed(2)}`} />
        </div>

        {/* Dedicated Leaderboard Action Button */}
        <button
          onClick={() => {
            triggerHaptic('medium');
            navigate('/rank');
          }}
          className="luxury-subcard mt-2.5 flex w-full items-center justify-between rounded-xl px-3 py-2.5 transition hover:border-amber-400/40 active:scale-98 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <div className="luxury-btn-gold flex h-8 w-8 items-center justify-center rounded-lg shadow-xs">
              <Trophy className="h-4 w-4" />
            </div>
            <div className="text-left">
              <p className="text-[12px] font-extrabold text-[#fff7eb] leading-tight">View Leaderboard</p>
              <p className="text-[10px] text-amber-100/60">Top 50 users ranking & earnings</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-300" />
        </button>
      </section>

      {/* 300x250 Banner Ad on Profile Page */}
      <div className="mt-4 flex flex-col items-center">
        <AdsterraBanner
          index={1}
          adKey={config.videoBannerAds?.adKey || '911ee250303f0d466e6e2cab58b077e0'}
          scriptHost={config.videoBannerAds?.scriptHost || 'https://bauval.org/22'}
        />
      </div>
    </main>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  valueClass = "text-[#fff7eb]"
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <p className="flex items-center gap-1.5 text-[11.5px] text-amber-100/65">
      {icon}
      <span>{label}</span>
      <span className={`font-bold ${valueClass}`}>{value}</span>
    </p>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="luxury-subcard rounded-xl py-2 text-center">
      <p className="text-[13px] font-extrabold text-[#fff7eb] tabular-nums">{value}</p>
      <p className="text-[10px] text-amber-200/60 uppercase tracking-wide">{label}</p>
    </div>
  );
}
