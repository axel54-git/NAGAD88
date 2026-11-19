import { memo, useState } from 'react';
import { useAuth, useAppStore } from '../contexts/AuthContext';
import { formatUsd } from '../lib/format';
import headerLogo from '../assets/images/header_logo_clean.webp';

export const BrandTopHeader = memo(function BrandTopHeader() {
  const { user } = useAuth();
  const db = useAppStore();
  const [logoFailed, setLogoFailed] = useState(false);

  const liveUser = user?.telegramId && db.users[user.telegramId] ? db.users[user.telegramId] : user;
  if (!liveUser) return null;

  return (
    <header className="flex items-center justify-between gap-2 border-b border-amber-400/25 bg-gradient-to-r from-[#130903] via-[#1f1007] to-[#130903] px-3 py-2 shadow-[0_6px_20px_-4px_rgba(0,0,0,0.85)]">
      <div className="flex min-w-0 flex-1 items-center">
        {!logoFailed ? (
          <img
            src={headerLogo}
            alt="Digital Platform"
            width={156}
            height={52}
            loading="eager"
            decoding="sync"
            fetchPriority="high"
            draggable={false}
            onError={() => setLogoFailed(true)}
            className="h-10 w-auto max-w-[185px] object-contain object-left select-none"
          />
        ) : (
          <span className="truncate text-[16px] font-extrabold tracking-tight text-amber-300">
            Digital Platform
          </span>
        )}
      </div>
      <div className="shrink-0 rounded-xl border border-amber-400/35 bg-gradient-to-br from-[#2a170b] to-[#170b04] px-3 py-1 text-right shadow-[inset_0_1px_0_rgba(255,224,160,0.12)]">
        <p className="text-[9px] font-bold uppercase tracking-wider text-amber-300">
          Balance
        </p>
        <p className="text-[13.5px] font-extrabold text-[#fff7eb] tabular-nums">
          {formatUsd(liveUser.balance)}
        </p>
      </div>
    </header>
  );
});
