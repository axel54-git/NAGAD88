import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Copy, Check, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';
import { maskUid, formatDate } from '../lib/format';
import { triggerHaptic, openTelegramChat } from '../lib/telegram';
import referInviteBanner from '../assets/images/refer_invite_banner.webp';
import referRulesBanner from '../assets/images/refer_rules_banner.webp';

export function Refer() {
  const { user, config } = useAuth();
  const db = useAppStore();

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'l1' | 'l2'>('overview');

  const { l1, l2 } = useMemo(() => {
    if (!user) return { l1: [], l2: [] };
    const myRefs = db.referrals.filter((r) => r.referrerTelegramId === user.telegramId);

    const existingRefIds = new Set(myRefs.filter(r => r.level === 1).map(r => r.referredTelegramId));
    const extraL1 = Object.values(db.users)
      .filter((u) => u.referredBy === user.telegramId && !existingRefIds.has(u.telegramId))
      .map((u) => ({
        id: `ref_u_${u.telegramId}`,
        referrerTelegramId: user.telegramId,
        referredTelegramId: u.telegramId,
        level: 1 as const,
        bonus: config.referralBonus,
        createdAt: u.createdAt
      }));

    return {
      l1: [...myRefs.filter((r) => r.level === 1), ...extraL1],
      l2: myRefs.filter((r) => r.level === 2)
    };
  }, [db.referrals, db.users, user, config.referralBonus]);

  if (!user) return null;

  const botUser = config.botUsername.replace(/^@/, '');
  const referralLink = `https://t.me/${botUser}?startapp=${user.telegramId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
    } catch {
      // Fallback
    }
    setCopied(true);
    triggerHaptic("success");
    toast.success("Referral link copied!");
    setTimeout(() => setCopied(false), 1800);
  };

  const handleShare = () => {
    const text = encodeURIComponent(
      `🔥 Join ${config.appName}! Watch daily ads, complete quick tasks and earn USDT directly to your Binance wallet. Start now:`
    );
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${text}`;
    openTelegramChat(tgUrl);
  };

  const currentList = activeTab === 'l2' ? l2 : l1;

  return (
    <main className="pb-6">
      <div className="px-2.5 pt-2">
        {/* Invite Banner */}
        <div className="luxury-card aspect-[900/502] overflow-hidden rounded-2xl">
        <img
          src={referInviteBanner}
          alt="Invite friends"
          loading="eager"
          decoding="sync"
          className="h-full w-full object-cover"
        />
      </div>

      {/* 3-Stat Row */}
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <StatPill label="L1 TOTAL" value={String(user.referralCount)} tone="text-[#fff7eb]" />
        <StatPill label="L2 TOTAL" value={String(user.level2Count)} tone="text-amber-300" />
        <StatPill label="EARNED" value={`$${user.referralEarned.toFixed(2)}`} tone="text-emerald-400" />
      </div>

      {/* Bonus Callout */}
      <p className="luxury-card mt-2.5 rounded-2xl px-3 py-2.5 text-center text-[11px] font-semibold leading-relaxed text-amber-100">
        🔥 প্রতি সফল রেফারলে সাথে সাথে পাবেন <b className="text-amber-300">${config.referralBonus.toFixed(2)}</b> বোনাস!
      </p>

      {/* Link Sharing Box */}
      <section className="luxury-card mt-2.5 rounded-2xl p-3">
        <div className="mb-2.5 flex items-center gap-2 border-b border-amber-400/15">
          <span className="border-b-2 border-amber-400 pb-1.5 text-[11px] font-extrabold tracking-wide text-amber-300">
            INVITE LINK
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="luxury-subcard min-w-0 flex-1 truncate rounded-xl px-3 py-2 font-mono text-[11px] font-semibold text-emerald-300">
            {referralLink}
          </div>
          <button
            onClick={handleCopy}
            aria-label="Copy referral link"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition active:scale-95 cursor-pointer ${
              copied
                ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                : 'luxury-btn-dark'
            }`}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4 text-amber-300" />}
          </button>
        </div>

        <button
          onClick={handleShare}
          className="luxury-btn-gold mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-extrabold transition active:scale-98 cursor-pointer"
        >
          <Send className="h-4 w-4" /> Share on Telegram
        </button>
      </section>

      {/* Referral Hierarchy Tabs */}
      <section className="luxury-card mt-2.5 rounded-2xl">
        <div className="flex border-b border-amber-400/15">
          <TabButton
            active={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            label="OVERVIEW"
          />
          <TabButton
            active={activeTab === 'l1'}
            onClick={() => setActiveTab('l1')}
            label="LEVEL 1"
            count={l1.length}
          />
          <TabButton
            active={activeTab === 'l2'}
            onClick={() => setActiveTab('l2')}
            label="LEVEL 2"
            count={l2.length}
          />
        </div>

        {activeTab === 'overview' ? (
          <div className="p-2.5">
            <img
              src={referRulesBanner}
              alt="Referral Rules & Guide"
              loading="eager"
              decoding="sync"
              className="w-full h-auto rounded-xl object-contain shadow-sm"
            />
          </div>
        ) : (
          <ul className="divide-y divide-amber-400/15">
            {currentList.length === 0 && (
              <li className="px-3 py-6 text-center text-[11px] text-amber-100/55">
                এই লেভেলে এখনও কোনো রেফারেল নেই।
              </li>
            )}
            {currentList.map((ref) => {
              const refUser = db.users[ref.referredTelegramId];
              return (
                <li key={ref.id} className="flex items-center gap-2.5 px-3 py-2.5">
                  <Avatar src={refUser?.photoUrl} name={refUser?.firstName || "User"} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-[#fff7eb]">
                      {refUser ? `${refUser.firstName} ${refUser.lastName}`.trim() : "User"}
                    </p>
                    <p className="text-[10px] text-amber-100/55 font-mono">
                      UID: {maskUid(ref.referredTelegramId)} • {formatDate(ref.createdAt)}
                    </p>
                  </div>
                  <span className="text-[12px] font-extrabold text-emerald-400 tabular-nums">
                    +${ref.bonus.toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>
    </main>
  );
}

function StatPill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="luxury-card rounded-2xl px-1.5 py-2 text-center">
      <p className="text-[8.5px] font-extrabold tracking-wide text-amber-200/65">{label}</p>
      <p className={`mt-0.5 text-[15px] font-extrabold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 border-b-2 py-2 text-[10.5px] font-extrabold tracking-wide transition-colors cursor-pointer ${
        active ? "border-amber-400 text-amber-300" : "border-transparent text-amber-100/55 hover:text-amber-100"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className="rounded-full bg-amber-400/15 px-1.5 text-[9px] text-amber-300">
          {count}
        </span>
      )}
    </button>
  );
}
