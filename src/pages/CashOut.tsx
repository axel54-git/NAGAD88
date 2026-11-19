import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { requestWithdrawal } from '../lib/store';
import { triggerHaptic } from '../lib/telegram';

import bkashIcon from '../assets/images/bkash_icon.webp';
import nagadIcon from '../assets/images/nagad_icon.webp';
import binanceIcon from '../assets/images/binance_icon.webp';

type PaymentMethodType = 'bKash' | 'Nagad' | 'Binance';

interface MethodOption {
  id: PaymentMethodType;
  name: string;
  logo: string;
  inputLabel: string;
  placeholder: string;
}

const METHODS: MethodOption[] = [
  {
    id: 'bKash',
    name: 'bKash',
    logo: bkashIcon,
    inputLabel: 'bKash Number',
    placeholder: 'e.g. 01XXXXXXXXX'
  },
  {
    id: 'Nagad',
    name: 'Nagad',
    logo: nagadIcon,
    inputLabel: 'Nagad Number',
    placeholder: 'e.g. 01XXXXXXXXX'
  },
  {
    id: 'Binance',
    name: 'Binance',
    logo: binanceIcon,
    inputLabel: 'Binance ID / Address',
    placeholder: 'e.g. 12345678 or 0x...'
  }
];

const REASON_MESSAGES: Record<string, string> = {
  below_minimum: "সর্বনিম্ন উইথড্র অ্যামাউন্টের কম অনুরোধ করা হয়েছে।",
  insufficient_balance: "আপনার একাউন্টে পর্যাপ্ত ব্যালেন্স নেই!",
  not_enough_referrals: "প্রয়োজনীয় সংখ্যক সক্রিয় রেফারেল এখনও সম্পন্ন হয়নি।",
  missing_account: "দয়া করে সঠিক একাউন্ট নাম্বার অথবা এড্রেস দিন।",
  user_not_found: "ইউজার একাউন্ট পাওয়া যায়নি।"
};

export function CashOut() {
  const { user, config } = useAuth();
  const navigate = useNavigate();

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('bKash');
  const [selectedAmount, setSelectedAmount] = useState<number>(config.withdrawAmounts[0] ?? 5);
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!user) return null;

  const currentMethod = METHODS.find((m) => m.id === selectedMethod) || METHODS[0];
  const hasEnoughBalance = user.balance >= selectedAmount;
  const hasEnoughReferrals = user.referralCount >= config.minReferralsForWithdraw;
  const cleanedAccount = accountNumber.trim().replace(/[\s-]/g, '');
  const isValidAccount =
    selectedMethod === 'Binance'
      ? cleanedAccount.length >= 4
      : /^01\d{9}$/.test(cleanedAccount);

  const requirements = [
    {
      id: 'balance',
      done: hasEnoughBalance,
      label: `সর্বনিম্ন $${selectedAmount.toFixed(2)} USDT (আপনার ব্যালেন্স $${user.balance.toFixed(2)})`
    },
    {
      id: 'referrals',
      done: hasEnoughReferrals,
      label: `নূন্যতম ${config.minReferralsForWithdraw} জন রেফার প্রয়োজন (আপনার রেফার: ${user.referralCount}/${config.minReferralsForWithdraw} জন)`
    },
    {
      id: 'account',
      done: isValidAccount,
      label:
        selectedMethod === 'bKash'
          ? 'সঠিক বিকাশ নাম্বার প্রদান করুন (১১ ডিজিট)'
          : selectedMethod === 'Nagad'
          ? 'সঠিক নগদ নাম্বার প্রদান করুন (১১ ডিজিট)'
          : 'সঠিক Binance ID / Address প্রদান করুন'
    }
  ];

  const bdtAmount = selectedAmount * 120;

  const handleCashOut = async () => {
    if (submitting) return;

    const missingItems: string[] = [];
    if (!hasEnoughBalance) {
      missingItems.push(
        `পর্যাপ্ত ব্যালেন্স নেই — সর্বনিম্ন $${selectedAmount.toFixed(2)} প্রয়োজন (আপনার ব্যালেন্স $${user.balance.toFixed(2)})`
      );
    }
    if (!hasEnoughReferrals) {
      missingItems.push(
        `নূন্যতম ${config.minReferralsForWithdraw} জন রেফার প্রয়োজন (আপনার রেফার: ${user.referralCount}/${config.minReferralsForWithdraw} জন)`
      );
    }
    if (!isValidAccount) {
      missingItems.push(
        selectedMethod === 'bKash'
          ? 'সঠিক ১১ ডিজিটের বিকাশ নাম্বার দিন (যেমন: 01XXXXXXXXX)'
          : selectedMethod === 'Nagad'
          ? 'সঠিক ১১ ডিজিটের নগদ নাম্বার দিন (যেমন: 01XXXXXXXXX)'
          : 'সঠিক Binance ID / Address প্রদান করুন'
      );
    }

    if (missingItems.length > 0) {
      triggerHaptic("error");
      if (missingItems.length === 1) {
        toast.error(missingItems[0]);
      } else {
        toast.error("ক্যাশআউট করতে নিচের শর্তগুলো পূরণ করুন:", {
          description: (
            <ul className="mt-1 space-y-1 text-[11.5px] font-medium">
              {missingItems.map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>
          )
        });
      }
      return;
    }

    setSubmitting(true);
    triggerHaptic("medium");

    try {
      const res = await requestWithdrawal(
        user.telegramId,
        selectedAmount,
        accountNumber.trim(),
        selectedMethod === 'Binance' ? 'Binance (USDT BEP20)' : selectedMethod
      );
      setSubmitting(false);

      if (res.success) {
        triggerHaptic("success");
        toast.success("Withdrawal Requested Successfully!", {
          description: `অ্যাডমিন যাচাই করার পর আপনার ${selectedMethod} একাউন্টে পেমেন্ট পাঠিয়ে দেওয়া হবে।`
        });
        navigate("/wallet");
      } else {
        triggerHaptic("error");
        toast.error(REASON_MESSAGES[res.reason ?? ""] ?? "উইথড্র অনুরোধ ব্যর্থ হয়েছে।");
      }
    } catch {
      setSubmitting(false);
      triggerHaptic("error");
      toast.error("সার্ভার ত্রুটি। আবার চেষ্টা করুন।");
    }
  };

  return (
    <main className="min-h-screen px-3 pt-3 pb-10 text-[#fff7eb]">
      {/* Header */}
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/wallet")}
            aria-label="Back"
            className="luxury-btn-dark flex h-8 w-8 items-center justify-center rounded-full active:scale-95 transition-transform cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-amber-300" />
          </button>
          <h1 className="text-[15px] font-extrabold text-[#fff7eb] drop-shadow-xs">Cash Out</h1>
        </div>
        <span className="luxury-btn-dark rounded-full px-3 py-1.5 text-[11px] font-extrabold text-amber-300 tabular-nums">
          Balance ${user.balance.toFixed(2)}
        </span>
      </header>

      {/* Select Amount Card */}
      <section className="luxury-card relative overflow-hidden rounded-2xl p-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-amber-400/15 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-10 -left-8 h-28 w-28 rounded-full bg-amber-600/15 blur-2xl"
        />

        <div className="relative">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold text-[#fff7eb]">Select Amount</p>
            {(selectedMethod === 'bKash' || selectedMethod === 'Nagad') && (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                Rate: $1 = ৳120 BDT
              </span>
            )}
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {config.withdrawAmounts.map((amt) => {
              const isSelected = selectedAmount === amt;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setSelectedAmount(amt);
                    triggerHaptic("light");
                  }}
                  className={`flex flex-col items-center justify-center rounded-2xl py-2.5 transition-all active:scale-95 cursor-pointer ${
                    isSelected
                      ? "luxury-btn-gold"
                      : "luxury-subcard text-[#fff7eb] hover:border-amber-400/35"
                  }`}
                >
                  <span className="text-[15px] font-extrabold tracking-wide tabular-nums">$ {amt}</span>
                  {(selectedMethod === 'bKash' || selectedMethod === 'Nagad') && (
                    <span className={`text-[10.5px] font-bold tabular-nums ${isSelected ? 'text-[#1c0e05]/80' : 'text-amber-200/65'}`}>
                      ৳{amt * 120}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Payment Method Card */}
      <section className="luxury-card mt-3 rounded-2xl p-4">
        <h2 className="text-[14px] font-extrabold text-[#fff7eb]">Payment Method</h2>

        {/* 3 Payment Methods Selector */}
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {METHODS.map((method) => {
            const isSelected = selectedMethod === method.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => {
                  setSelectedMethod(method.id);
                  triggerHaptic("light");
                }}
                className={`relative flex flex-col items-center justify-center rounded-2xl px-2 py-3 transition-all active:scale-95 cursor-pointer ${
                  isSelected
                    ? "border-2 border-amber-400 bg-amber-500/15 shadow-[0_0_18px_-6px_rgba(243,196,107,0.45)]"
                    : "luxury-subcard hover:border-amber-400/30"
                }`}
              >
                {/* Active Checkmark Badge */}
                {isSelected && (
                  <span className="luxury-btn-gold absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full shadow-xs">
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </span>
                )}

                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-amber-400/20 shadow-sm">
                  <img
                    src={method.logo}
                    alt={method.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span
                  className={`mt-2 text-[12px] font-bold tracking-wide ${
                    isSelected ? "text-amber-300" : "text-amber-100/70"
                  }`}
                >
                  {method.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Account Input Label */}
        <div className="mt-4">
          <label className="text-[13px] font-bold text-[#fff7eb]">
            {currentMethod.inputLabel}
          </label>
          <div className="luxury-subcard mt-2 flex items-center rounded-2xl px-3.5 py-3 transition-all focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20">
            <img
              src={currentMethod.logo}
              alt=""
              className="mr-3 h-6 w-6 shrink-0 rounded-md object-cover"
            />
            <input
              type="text"
              name="payout_account"
              autoComplete="off"
              inputMode={selectedMethod === 'Binance' ? 'text' : 'tel'}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder={currentMethod.placeholder}
              className="w-full min-w-0 flex-1 bg-transparent text-[16px] font-bold tracking-wider text-[#fff7eb] placeholder:text-[13px] placeholder:font-medium placeholder:tracking-normal placeholder:text-amber-100/40 outline-none tabular-nums"
            />
          </div>
        </div>
      </section>

      {/* Confirmation & Submit Action */}
      <section className="luxury-card mt-3 rounded-2xl p-4">
        {/* Live Requirements Checklist */}
        <div className="luxury-subcard mb-3.5 space-y-2.5 rounded-2xl p-3.5">
          {requirements.map((req) => (
            <div key={req.id} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                  req.done
                    ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.45)]'
                    : 'border border-amber-100/20 bg-white/15 text-amber-100/55'
                }`}
              >
                <Check className="h-3 w-3 stroke-[3]" />
              </span>
              <p
                className={`text-[12.5px] font-bold leading-snug transition-colors tabular-nums ${
                  req.done ? 'text-emerald-400' : 'text-amber-100/60'
                }`}
              >
                {req.label}
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={handleCashOut}
          className="luxury-btn-gold flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-extrabold transition-all active:scale-98 cursor-pointer disabled:opacity-70"
        >
          {submitting ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : (
            <ArrowUpRight className="h-5 w-5" />
          )}
          <span>Cash out ${selectedAmount.toFixed(2)}</span>
          {(selectedMethod === 'bKash' || selectedMethod === 'Nagad') && (
            <span className="text-[13px] font-semibold opacity-90">({bdtAmount} BDT)</span>
          )}
        </button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-amber-100/55">
          By cashing out, you agree to {config.appName}'s{" "}
          <span className="cursor-pointer font-semibold text-amber-300 underline">
            Cash Out Terms &amp; Conditions
          </span>
          .
        </p>
      </section>
    </main>
  );
}
