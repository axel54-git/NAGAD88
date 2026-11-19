import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, statusLabel, error, retry, demoLogin, config } = useAuth();

  if (status === 'ready') {
    return <>{children}</>;
  }

  if (status === 'error') {
    return (
      <GateContainer>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/15 border border-rose-400/30">
          <AlertTriangle className="h-5 w-5 text-rose-400" />
        </div>
        <h1 className="mt-3 text-base font-bold text-[#fff7eb]">Login Failed</h1>
        <p className="mt-1 max-w-[16rem] text-center text-xs leading-relaxed text-amber-100/70">
          {error}
        </p>
        <div className="mt-4 flex w-full max-w-[15rem] flex-col gap-2">
          <a
            href={`https://t.me/${config.botUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="luxury-btn-gold flex h-10 items-center justify-center gap-1.5 rounded-full text-xs font-extrabold"
          >
            <Send className="h-3.5 w-3.5" /> Open Telegram Bot
          </a>
          <button
            onClick={retry}
            className="luxury-btn-dark h-10 rounded-full text-xs font-semibold"
          >
            Try Again
          </button>
          {config.allowDemoLogin && (
            <button
              onClick={demoLogin}
              className="h-8 text-[11px] font-medium text-amber-200/70 underline underline-offset-2 hover:text-amber-200"
            >
              Preview with Demo Account
            </button>
          )}
        </div>
      </GateContainer>
    );
  }

  return (
    <GateContainer>
      {status === 'success' ? (
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-400/30"
        >
          <CheckCircle className="h-6 w-6 text-emerald-400" />
        </motion.div>
      ) : (
        <div className="relative flex h-12 w-12 items-center justify-center">
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-amber-400/20 border-t-amber-400"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          />
          <Send className="h-5 w-5 text-amber-300" />
        </div>
      )}
      <motion.p
        key={statusLabel}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 text-sm font-semibold text-[#fff7eb]"
      >
        {statusLabel}
      </motion.p>
      <p className="mt-1 text-[11px] text-amber-100/60">
        {config.appName} • Telegram Secure Login
      </p>
    </GateContainer>
  );
}

function GateContainer({ children }: { children: React.ReactNode }) {
  return (
    <main className="luxury-page-shell mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6">
      <div className="luxury-card flex w-full max-w-[19rem] flex-col items-center rounded-3xl p-6 text-center">
        {children}
      </div>
    </main>
  );
}
