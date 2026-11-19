import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Headphones,
  ChevronDown,
  Clock,
  CheckCircle2,
  XCircle,
  ReceiptText,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useAppStore } from '../contexts/AuthContext';
import { formatTimestamp } from '../lib/format';
import { openTelegramChat } from '../lib/telegram';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
type TimeFilter = 'all' | 'today' | '7d' | '30d';

export function PaymentHistory() {
  const { user, config } = useAuth();
  const db = useAppStore();
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  const liveUser = (user?.telegramId && db.users[user.telegramId]) ? db.users[user.telegramId] : user;

  const myWithdrawals = useMemo(() => {
    if (!liveUser) return [];
    return db.withdrawals
      .filter((w) => w.telegramId === liveUser.telegramId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [db.withdrawals, liveUser]);

  const filteredWithdrawals = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    return myWithdrawals.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }

      if (timeFilter !== 'all') {
        const createdMs = new Date(item.createdAt).getTime();
        if (isNaN(createdMs)) return false;

        if (timeFilter === 'today' && createdMs < todayMs) return false;
        if (timeFilter === '7d' && now - createdMs > 7 * 24 * 60 * 60 * 1000) return false;
        if (timeFilter === '30d' && now - createdMs > 30 * 24 * 60 * 60 * 1000) return false;
      }

      return true;
    });
  }, [myWithdrawals, statusFilter, timeFilter]);

  if (!liveUser) return null;

  const hasActiveFilters = statusFilter !== 'all' || timeFilter !== 'all';

  const handleCopyId = (id: string) => {
    try {
      navigator.clipboard.writeText(id);
      toast.success('Record ID copied');
    } catch {
      // Clipboard may be restricted in some webviews
    }
  };

  return (
    <main className="min-h-screen pb-10">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-amber-400/20 bg-[#1a0e07]/90 px-2.5 py-1.5 backdrop-blur-md">
        <button
          type="button"
          onClick={() => navigate('/wallet')}
          aria-label="Back to Wallet"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-amber-300 transition hover:bg-amber-500/10 active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <h1 className="truncate text-[16px] font-extrabold tracking-tight text-[#fff7eb]">
          Payment History
        </h1>

        <button
          type="button"
          onClick={() => openTelegramChat(config.supportUrl)}
          aria-label="Contact Support"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-amber-300 transition hover:bg-amber-500/10 active:scale-95 cursor-pointer"
        >
          <Headphones className="h-5 w-5" />
        </button>
      </header>

      {/* Filter Selectors Bar */}
      <section className="grid grid-cols-2 gap-2.5 border-b border-amber-400/15 bg-[#1a0e07]/75 px-3.5 py-3 backdrop-blur-md">
        <div className="relative">
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="luxury-subcard min-h-[44px] w-full appearance-none rounded-xl pl-3 pr-8 text-[12.5px] font-semibold text-[#fff7eb] outline-none transition focus-visible:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400/20 cursor-pointer"
          >
            <option value="all" className="bg-[#1c1008] text-[#fff7eb]">All Status</option>
            <option value="pending" className="bg-[#1c1008] text-[#fff7eb]">Pending Review</option>
            <option value="approved" className="bg-[#1c1008] text-[#fff7eb]">Cash Out Successful</option>
            <option value="rejected" className="bg-[#1c1008] text-[#fff7eb]">Rejected</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-300" />
        </div>

        <div className="relative">
          <select
            aria-label="Filter by time"
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
            className="luxury-subcard min-h-[44px] w-full appearance-none rounded-xl pl-3 pr-8 text-[12.5px] font-semibold text-[#fff7eb] outline-none transition focus-visible:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400/20 cursor-pointer"
          >
            <option value="all" className="bg-[#1c1008] text-[#fff7eb]">Filter by Time</option>
            <option value="today" className="bg-[#1c1008] text-[#fff7eb]">Today</option>
            <option value="7d" className="bg-[#1c1008] text-[#fff7eb]">Last 7 Days</option>
            <option value="30d" className="bg-[#1c1008] text-[#fff7eb]">Last 30 Days</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-300" />
        </div>
      </section>

      {/* Records List */}
      {filteredWithdrawals.length === 0 ? (
        <div className="luxury-card mx-3.5 mt-4 rounded-2xl p-8 text-center">
          <div className="luxury-subcard mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-amber-300">
            <ReceiptText className="h-6 w-6" />
          </div>
          <p className="text-[14.5px] font-extrabold text-[#fff7eb]">
            {hasActiveFilters ? 'No matching records found' : 'No payment history yet'}
          </p>
          <p className="mt-1 text-[12px] text-amber-100/65">
            {hasActiveFilters
              ? 'Try changing your status or time filter to view other withdrawals.'
              : 'Your cash out requests and payout records will appear here.'}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setTimeFilter('all');
              }}
              className="luxury-btn-dark mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2 text-[12.5px] font-bold transition active:scale-98 cursor-pointer"
            >
              Reset Filters
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/wallet/cashout')}
              className="luxury-btn-gold mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2 text-[12.5px] font-extrabold transition active:scale-98 cursor-pointer"
            >
              Cash Out Now
            </button>
          )}
        </div>
      ) : (
        <div className="mx-3 mt-3 space-y-3">
          {filteredWithdrawals.map((item) => {
            const fee = Number(item.fee ?? 0);
            const netAmount = Math.max(0, Number(item.amount) - fee);
            const isBdtMethod =
              item.method.toLowerCase().includes('bkash') ||
              item.method.toLowerCase().includes('nagad');

            return (
              <article key={item.id} className="luxury-card rounded-2xl px-4 py-4">
                {/* Record ID & Status Header Row */}
                <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-amber-400/15">
                  <button
                    type="button"
                    onClick={() => handleCopyId(item.id)}
                    title="Copy transaction ID"
                    className="inline-flex min-w-0 items-center gap-1.5 text-left font-mono text-[13.5px] font-bold text-[#fff7eb] tabular-nums hover:text-amber-300 cursor-pointer"
                  >
                    <span className="truncate">{item.id}</span>
                    <Copy className="h-3.5 w-3.5 shrink-0 text-amber-300/70" />
                  </button>

                  {item.status === 'approved' ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-bold text-emerald-400 whitespace-nowrap">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>Cash Out Successful</span>
                    </span>
                  ) : item.status === 'rejected' ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-bold text-rose-400 whitespace-nowrap">
                      <XCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>Rejected</span>
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-bold text-amber-300 whitespace-nowrap">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>Pending Review</span>
                    </span>
                  )}
                </div>

                {/* Key-Value Breakdown Rows */}
                <dl className="mt-2.5 space-y-2 text-[12.5px]">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-amber-100/60 font-medium">Amount</dt>
                    <dd className="font-bold text-[#fff7eb] tabular-nums">
                      ${Number(item.amount).toFixed(2)}
                      {isBdtMethod && (
                        <span className="ml-1 text-[11.5px] font-semibold text-amber-200/70">
                          (৳{Math.round(Number(item.amount) * 120)})
                        </span>
                      )}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-amber-100/60 font-medium">Handling Fee</dt>
                    <dd className="font-semibold text-[#fff7eb] tabular-nums">
                      ${fee.toFixed(2)}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-amber-100/60 font-medium">Net Credited</dt>
                    <dd className="font-bold text-emerald-400 tabular-nums">
                      ${netAmount.toFixed(2)}
                      {isBdtMethod && (
                        <span className="ml-1 text-[11.5px] font-semibold text-emerald-300/80">
                          (৳{Math.round(netAmount * 120)})
                        </span>
                      )}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-amber-100/60 font-medium">Payment Account</dt>
                    <dd className="truncate font-semibold text-[#fff7eb] font-mono text-[12px]">
                      {item.method} · {item.account}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-amber-100/60 font-medium">Applied Time</dt>
                    <dd className="font-medium text-amber-100/85 tabular-nums">
                      {formatTimestamp(item.createdAt)}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-amber-100/60 font-medium">Updated Time</dt>
                    <dd className="font-medium text-amber-100/85 tabular-nums">
                      {formatTimestamp(item.updatedAt || item.createdAt)}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
