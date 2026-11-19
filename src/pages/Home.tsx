import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CirclePlay,
  Play,
  LoaderCircle,
  History,
  Coins,
  Briefcase
} from 'lucide-react';
import { useAuth, useAppStore } from '../contexts/AuthContext';
import { AdsterraBanner } from '../components/AdsterraBanner';

export function Home() {
  const navigate = useNavigate();
  const {
    user,
    config,
    startAd,
    pending,
    slotCountThisHour,
    totalAdsWatchedThisHour,
    hourlyLimitPerSlot
  } = useAuth();
  const db = useAppStore();

  const liveUser = (user?.telegramId && db.users[user.telegramId]) ? db.users[user.telegramId] : user;

  if (!liveUser) return null;

  const totalPossibleThisHour = config.adSlots.length * hourlyLimitPerSlot;

  const taskPosts = (Array.isArray(config.taskPosts) ? [...config.taskPosts] : [])
    .filter((p) => p.active !== false)
    .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));

  const userSubmissions = Array.isArray(db.taskSubmissions)
    ? db.taskSubmissions.filter((s) => s.telegramId === liveUser.telegramId)
    : [];

  const visibleTaskPosts = taskPosts
    .map((post) => {
      const subs = userSubmissions
        .filter((s) => s.taskId === post.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const hasPending = subs.some((s) => s.status === 'pending');
      const approvedCount = subs.filter((s) => s.status === 'approved').length;
      const maxLimit = Math.max(1, Math.floor(Number(post.maxCompletions) || 1));
      const latestRejected = subs[0]?.status === 'rejected' ? subs[0] : null;
      return { post, hasPending, approvedCount, maxLimit, latestRejected };
    })
    .filter(({ hasPending, approvedCount, maxLimit }) => !hasPending && approvedCount < maxLimit);

  return (
    <main className="pb-8">
      <div className="px-3 pt-2.5">

      {/* Daily Ads Header */}
      <SectionHeading
        icon={<CirclePlay className="h-4 w-4 text-amber-400" />}
        title="DAILY ADS"
      />

      {/* Ad Slots Grid - 2 boxes, 10 per hour each */}
      <div className="mt-2 grid grid-cols-2 gap-2.5">
        {config.adSlots.map((slot) => {
          const countHour = slotCountThisHour(slot.id);
          const reachedLimit = countHour >= hourlyLimitPerSlot;
          const isPending = pending?.kind === 'ad' && pending.refId === slot.id;

          return (
            <motion.button
              key={slot.id}
              whileTap={{ scale: 0.97 }}
              disabled={reachedLimit || Boolean(pending)}
              onClick={() => startAd(slot)}
              className={`luxury-card ad-slot-red-card relative flex flex-col items-center rounded-2xl px-2 py-3.5 transition-all ${
                reachedLimit ? 'opacity-50 cursor-not-allowed' : 'active:bg-amber-500/10 cursor-pointer'
              }`}
            >
              {!reachedLimit && (
                <>
                  <span aria-hidden="true" className="ad-slot-red-aura" />
                  <span aria-hidden="true" className="ad-slot-red-ring" />
                </>
              )}
              <span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/35 bg-amber-500/15 shadow-[0_0_16px_-4px_rgba(243,196,107,0.45)]">
                {isPending ? (
                  <LoaderCircle className="h-5 w-5 animate-spin text-amber-300" />
                ) : (
                  <Play className="h-5 w-5 text-amber-300 fill-amber-300" />
                )}
              </span>
              <span className="relative z-10 mt-2 text-[12px] font-extrabold text-[#fff7eb] tracking-wide">
                {slot.title}
              </span>
              <span className="relative z-10 mt-1 rounded-full border border-amber-400/25 bg-amber-400/15 px-2.5 py-[3px] text-[9px] font-bold uppercase tracking-wide text-amber-300">
                {reachedLimit ? 'ঘণ্টার লিমিট শেষ' : isPending ? 'ভিজিট চলছে...' : 'Earn reward'}
              </span>
              <span className="relative z-10 mt-1 text-[12.5px] font-extrabold text-emerald-400 tabular-nums">
                +${slot.reward.toFixed(2)}
              </span>
              <span className="relative z-10 mt-0.5 text-[9.5px] text-amber-100/60 font-medium tabular-nums">
                {countHour}/{hourlyLimitPerSlot} এই ঘণ্টায়
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Ads Hourly Progress Note */}
      <div className="mt-2 flex items-center justify-between px-0.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-100/85 drop-shadow-xs">
          এই ঘণ্টায় দেখা হয়েছে:{" "}
          <span className="text-amber-300 font-extrabold tabular-nums">
            {totalAdsWatchedThisHour}/{totalPossibleThisHour}
          </span>
        </p>
        <p className="text-[10px] text-amber-100/70 drop-shadow-xs">
          প্রতিটি বক্সে ঘণ্টায় ১০টি (মোট ২০টি)
        </p>
      </div>

      {/* Special Micro-Task Posts Feed */}
      <section className="mt-5">
        <div className="flex items-center justify-between gap-2 px-0.5 mb-2.5">
          <div className="flex items-center gap-1.5">
            <Briefcase className="h-4 w-4 text-amber-400" />
            <h2 className="text-[14px] font-extrabold tracking-tight text-[#fff7eb] drop-shadow-xs">
              Available Tasks
            </h2>
            <span className="text-[11px] font-medium text-amber-200/80">
              · {visibleTaskPosts.length} টি কাজ
            </span>
          </div>

          <Link
            to="/tasks/history"
            className="luxury-btn-dark inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold transition active:scale-95"
          >
            <History className="h-3.5 w-3.5 text-amber-300" />
            <span>History</span>
          </Link>
        </div>

        {visibleTaskPosts.length > 0 ? (
          <div className="space-y-3.5">
            {visibleTaskPosts.map(({ post, approvedCount, maxLimit, latestRejected }) => {
              return (
                <motion.article
                  key={post.id}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => navigate(`/tasks/${post.id}`)}
                  className="luxury-card overflow-hidden rounded-2xl transition-all hover:border-amber-300/45 cursor-pointer"
                >
                  {/* Banner Image */}
                  <div className="relative aspect-video w-full overflow-hidden bg-[#160c06]">
                    {post.bannerUrl ? (
                      <img
                        src={post.bannerUrl}
                        alt={post.title}
                        loading="eager"
                        decoding="sync"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#3a2112] to-[#1a0d05] p-4 text-center text-amber-200">
                        <span className="text-[15px] font-extrabold">{post.title}</span>
                      </div>
                    )}
                  </div>

                  {/* Card Footer Info & Start Task Button */}
                  <div className="p-3.5">
                    <h3 className="text-[15px] font-extrabold leading-snug text-[#fff7eb]">
                      {post.title}
                    </h3>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-amber-300">
                        <Coins className="h-4 w-4 shrink-0" />
                        <span className="text-[13.5px] font-extrabold tabular-nums">
                          Reward: ${Number(post.reward || 0).toFixed(2)}
                        </span>
                      </div>

                      {maxLimit > 1 && (
                        <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-200 tabular-nums">
                          {approvedCount}/{maxLimit} বার সম্পন্ন
                        </span>
                      )}
                    </div>

                    {latestRejected && (
                      <p className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200">
                        আগের প্রমাণ বাতিল হয়েছে — আবার সঠিক স্ক্রিনশট দিয়ে সাবমিট করুন
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/tasks/${post.id}`);
                      }}
                      className="luxury-btn-gold mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-extrabold transition active:scale-[0.98] cursor-pointer"
                    >
                      <span>{latestRejected ? 'Try Again' : 'Start Task'}</span>
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        ) : taskPosts.length > 0 ? (
          <div className="luxury-card rounded-2xl p-5 text-center">
            <p className="text-[13px] font-extrabold text-[#fff7eb]">
              সবগুলো টাস্ক সম্পন্ন বা পেন্ডিং রয়েছে!
            </p>
            <p className="mt-1 text-[11px] text-amber-100/65">
              আপনার জমা দেওয়া কাজের স্ট্যাটাস History থেকে দেখতে পারবেন।
            </p>
            <Link
              to="/tasks/history"
              className="luxury-btn-dark mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-bold"
            >
              <History className="h-3.5 w-3.5 text-amber-300" />
              <span>History দেখুন</span>
            </Link>
          </div>
        ) : (
          <div className="luxury-card rounded-2xl p-5 text-center">
            <p className="text-[13px] font-bold text-[#fff7eb]">কোনো স্পেশাল টাস্ক নেই</p>
            <p className="mt-1 text-[11px] text-amber-100/65">
              নতুন টাস্ক পোস্ট যোগ হলে এখানে দেখতে পাবেন।
            </p>
          </div>
        )}
      </section>

      {/* Sponsored Ad Banner on Home Page */}
      <div className="mt-5 flex flex-col items-center">
        <AdsterraBanner
          index={1}
          adKey={config.videoBannerAds?.adKey || '911ee250303f0d466e6e2cab58b077e0'}
          scriptHost={config.videoBannerAds?.scriptHost || 'https://bauval.org/22'}
        />
      </div>
      </div>
    </main>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 px-0.5">
      {icon}
      <h2 className="text-[13px] font-extrabold tracking-wide text-white drop-shadow-xs">{title}</h2>
    </div>
  );
}
