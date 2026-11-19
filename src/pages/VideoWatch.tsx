import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  X,
  ShieldAlert,
  Timer
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useAppStore } from '../contexts/AuthContext';
import { earnVideoReward, getTodayDateString, isVideoWatchedByUser } from '../lib/store';
import { extractYouTubeId, getYouTubeEmbedUrl, getYouTubeThumbnail, sortVideosNewestFirst } from '../lib/youtube';
import { triggerHaptic } from '../lib/telegram';
import { formatUsd } from '../lib/format';
import { AdsterraBanner } from '../components/AdsterraBanner';
import { AdsterraNativeBanner } from '../components/AdsterraNativeBanner';

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function VideoWatch() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const { user, config: authConfig } = useAuth();
  const db = useAppStore();
  const config = db.config || authConfig;
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const videoIframeRef = useRef<HTMLIFrameElement>(null);

  const claimedInThisSessionRef = useRef<string | null>(null);

  const liveUser = (user?.telegramId && db.users[user.telegramId]) ? db.users[user.telegramId] : user;

  const videos = useMemo(() => {
    return sortVideosNewestFirst(Array.isArray(config.videos) ? config.videos : []);
  }, [config.videos]);

  const currentIndex = videos.findIndex((v) => v.id === videoId);
  const currentVideo = currentIndex !== -1 ? videos[currentIndex] : videos[0];
  const nextVideo = currentIndex !== -1 && currentIndex + 1 < videos.length ? videos[currentIndex + 1] : null;

  const nextUnwatchedVideo = useMemo(() => {
    if (!liveUser) return nextVideo;
    return videos.find((v) => v.id !== currentVideo?.id && !isVideoWatchedByUser(liveUser.telegramId, v.id)) || null;
  }, [videos, currentVideo?.id, liveUser, db.users, nextVideo]);

  const targetSeconds = currentVideo?.minWatchSeconds || 60;
  const rewardAmount = currentVideo?.reward || 0.05;

  const todayStr = getTodayDateString();
  const storageKey = liveUser ? `c2c_vid_watched_${liveUser.telegramId}_${currentVideo?.id}_${todayStr}` : '';
  const progressKey = liveUser && currentVideo ? `c2c_vid_active_sec_${liveUser.telegramId}_${currentVideo.id}` : '';

  const isPermanentlyWatched = liveUser && currentVideo ? isVideoWatchedByUser(liveUser.telegramId, currentVideo.id) : false;

  const [alreadyClaimed, setAlreadyClaimed] = useState<boolean>(() => {
    if (isPermanentlyWatched) return true;
    if (!storageKey) return false;
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });

  const getSavedProgress = (): number => {
    if (!progressKey) return 0;
    try {
      const raw = sessionStorage.getItem(progressKey) || localStorage.getItem(progressKey);
      if (raw) {
        const val = parseInt(raw, 10);
        if (!isNaN(val) && val > 0 && val < targetSeconds) {
          return val;
        }
      }
    } catch {}
    return 0;
  };

  const [secondsElapsed, setSecondsElapsed] = useState<number>(() => {
    if (isPermanentlyWatched || alreadyClaimed) return targetSeconds;
    return getSavedProgress();
  });
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [justClaimed, setJustClaimed] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);

  // Track page visibility without false pauses from iframe focus/blur
  const [isPageActive, setIsPageActive] = useState<boolean>(true);

  useEffect(() => {
    const syncVisibility = () => {
      const isVisible = document.visibilityState === 'visible' && !document.hidden;
      setIsPageActive(isVisible);
    };

    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible' && !document.hidden) {
        setIsPageActive(true);
      }
    };

    syncVisibility();

    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);
    window.addEventListener('touchstart', handleWindowFocus, { passive: true });
    window.addEventListener('scroll', handleWindowFocus, { passive: true });
    window.addEventListener('click', handleWindowFocus, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
      window.removeEventListener('touchstart', handleWindowFocus);
      window.removeEventListener('scroll', handleWindowFocus);
      window.removeEventListener('click', handleWindowFocus);
    };
  }, []);

  // Strictly block and disable Fullscreen requests
  useEffect(() => {
    const exitFs = () => {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
    };
    document.addEventListener('fullscreenchange', exitFs);
    document.addEventListener('webkitfullscreenchange', exitFs);
    return () => {
      document.removeEventListener('fullscreenchange', exitFs);
      document.removeEventListener('webkitfullscreenchange', exitFs);
    };
  }, []);

  // Enforce 240p (small) video playback quality
  useEffect(() => {
    const iframe = videoIframeRef.current;
    if (!iframe) return;

    const enforce240p = () => {
      try {
        iframe.contentWindow?.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'setPlaybackQuality',
            args: ['small']
          }),
          '*'
        );
        iframe.contentWindow?.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'setPlaybackQualityRange',
            args: ['small', 'small']
          }),
          '*'
        );
      } catch {}
    };

    iframe.addEventListener('load', enforce240p);
    const t1 = setTimeout(enforce240p, 800);
    const t2 = setTimeout(enforce240p, 2000);
    const t3 = setTimeout(enforce240p, 4500);

    return () => {
      iframe.removeEventListener('load', enforce240p);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [videoId, currentVideo?.id]);

  // Reset session claim state cleanly when switching to another video
  useEffect(() => {
    claimedInThisSessionRef.current = null;
    setJustClaimed(false);
    setShowExitConfirm(false);

    const watchedNow = liveUser && currentVideo ? isVideoWatchedByUser(liveUser.telegramId, currentVideo.id) : false;
    let claimedLocal = false;
    if (storageKey) {
      try {
        claimedLocal = localStorage.getItem(storageKey) === '1';
      } catch {}
    }

    if (watchedNow || claimedLocal) {
      setAlreadyClaimed(true);
      setSecondsElapsed(targetSeconds);
    } else {
      setAlreadyClaimed(false);
      setSecondsElapsed(getSavedProgress());
    }
  }, [currentVideo?.id]);

  // Sync already-claimed state without ever auto-navigating the user away from the video page
  useEffect(() => {
    if (!liveUser || !currentVideo) return;
    if (justClaimed || claimedInThisSessionRef.current === currentVideo.id) return;

    const isWatched = isVideoWatchedByUser(liveUser.telegramId, currentVideo.id);
    if (isWatched) {
      setAlreadyClaimed(true);
      setSecondsElapsed(targetSeconds);
      return;
    }

    if (!storageKey) return;
    try {
      const isClaimed = localStorage.getItem(storageKey) === '1';
      if (isClaimed) {
        setAlreadyClaimed(true);
        setSecondsElapsed(targetSeconds);
      }
    } catch {}
  }, [storageKey, targetSeconds, liveUser?.telegramId, currentVideo?.id, justClaimed]);

  // Video timer: counts elapsed seconds reliably while visible on page
  useEffect(() => {
    if (alreadyClaimed || justClaimed) return;
    if (!isPageActive) return;

    const timer = setInterval(() => {
      setSecondsElapsed((prev) => {
        if (prev >= targetSeconds) return targetSeconds;
        const next = prev + 1;
        try {
          if (progressKey && next < targetSeconds) {
            sessionStorage.setItem(progressKey, String(next));
            localStorage.setItem(progressKey, String(next));
          }
        } catch {}

        if (next >= targetSeconds) {
          try {
            if (progressKey) {
              sessionStorage.removeItem(progressKey);
              localStorage.removeItem(progressKey);
            }
          } catch {}
          triggerHaptic('success');
          return targetSeconds;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [alreadyClaimed, justClaimed, targetSeconds, isPageActive, progressKey, currentVideo?.id]);

  // Pop-up / Popunder Ad integration on Video Play Page
  useEffect(() => {
    const popUrl =
      config.videoBannerAds?.popunderUrl ||
      'https://bicea.org/14/c35007be6aabc3a9eb292e5611d0030b';
    const isEnabled = config.videoBannerAds?.popunderEnabled !== false;

    if (!isEnabled || !popUrl) return;

    let script = document.querySelector(`script[src="${popUrl}"]`) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.src = popUrl;
      script.setAttribute('data-cfasync', 'false');
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [config.videoBannerAds?.popunderUrl, config.videoBannerAds?.popunderEnabled]);

  // Smart Cyclical Ad-Touring Auto-Scroll (Runs ONLY while countdown timer is active; stops permanently once timer completes)
  useEffect(() => {
    let animId = 0;
    let isDisposed = false;
    const stepTimeouts: number[] = [];

    const scheduleTimeout = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      stepTimeouts.push(id);
      return id;
    };

    const getVideoY = () => {
      if (!videoSectionRef.current) return 0;
      return Math.max(0, videoSectionRef.current.offsetTop - 56);
    };

    const getBottomY = () => {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    };

    const smoothScrollTo = (targetY: number, duration: number, callback?: () => void) => {
      if (isDisposed) return;
      const startY = window.scrollY || window.pageYOffset || 0;
      const distance = targetY - startY;
      if (Math.abs(distance) < 5) {
        if (callback && !isDisposed) callback();
        return;
      }

      const startTime = performance.now();
      const step = (now: number) => {
        if (isDisposed) return;
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const ease =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        window.scrollTo(0, startY + distance * ease);

        if (progress < 1) {
          animId = requestAnimationFrame(step);
        } else if (callback && !isDisposed) {
          callback();
        }
      };
      animId = requestAnimationFrame(step);
    };

    // Once timer is finished (reward claimed), STOP all cyclical scrolling.
    // If the timer happened to finish mid-tour away from the video, smoothly settle onto the video player once and stay still.
    if (alreadyClaimed || justClaimed) {
      const videoY = getVideoY();
      const currentY = window.scrollY || window.pageYOffset || 0;
      if (Math.abs(currentY - videoY) > 80) {
        smoothScrollTo(videoY, 900);
      }
      return () => {
        isDisposed = true;
        stepTimeouts.forEach((id) => clearTimeout(id));
        if (animId) cancelAnimationFrame(animId);
      };
    }

    // 1. Initial Flow: pause 800ms at top so user sees top ads, then smoothly glide to video player
    scheduleTimeout(() => {
      if (isDisposed) return;
      smoothScrollTo(getVideoY(), 3800);
    }, 800);

    // 2. Periodic 60-Second Cycle while timer is running: Tour bottom ads -> top ads -> return to video player
    const cycleInterval = window.setInterval(() => {
      if (isDisposed || !isPageActive) return;

      smoothScrollTo(getBottomY(), 2800, () => {
        if (isDisposed) return;

        scheduleTimeout(() => {
          if (isDisposed) return;

          smoothScrollTo(0, 2800, () => {
            if (isDisposed) return;

            scheduleTimeout(() => {
              if (isDisposed) return;
              smoothScrollTo(getVideoY(), 2600);
            }, 3500);
          });
        }, 4500);
      });
    }, 60000);

    return () => {
      isDisposed = true;
      clearInterval(cycleInterval);
      stepTimeouts.forEach((id) => clearTimeout(id));
      if (animId) cancelAnimationFrame(animId);
    };
  }, [videoId, alreadyClaimed, justClaimed, isPageActive]);

  const canClaim = secondsElapsed >= targetSeconds && !alreadyClaimed && !justClaimed;
  const remainingSeconds = Math.max(0, targetSeconds - secondsElapsed);
  const progressPercent = Math.min(100, Math.round((secondsElapsed / targetSeconds) * 100));

  const ytId = currentVideo ? extractYouTubeId(currentVideo.youtubeUrl) : null;
  const embedUrl = currentVideo ? getYouTubeEmbedUrl(currentVideo.youtubeUrl, true) : '';

  // Intercept back navigation if timer is incomplete
  const handleBack = () => {
    if (!alreadyClaimed && !justClaimed && secondsElapsed < targetSeconds) {
      triggerHaptic('medium');
      setShowExitConfirm(true);
    } else {
      navigate('/tasks');
    }
  };

  const handleClaimReward = async () => {
    if (!liveUser || !currentVideo || alreadyClaimed || justClaimed || isClaiming) return;
    if (claimedInThisSessionRef.current === currentVideo.id) return;

    // Lock synchronously before async calls so Firebase updates never trigger an early exit redirect
    claimedInThisSessionRef.current = currentVideo.id;
    setJustClaimed(true);
    setAlreadyClaimed(true);
    setIsClaiming(true);
    triggerHaptic('success');

    try {
      const fallbackReward = Number(currentVideo.reward || 0.05);
      const res = await earnVideoReward(liveUser.telegramId, currentVideo.id);

      if (!res.ok && res.error !== 'already_watched') {
        claimedInThisSessionRef.current = null;
        setJustClaimed(false);
        setAlreadyClaimed(false);
        toast.error('রিওয়ার্ড যোগ করতে সমস্যা হয়েছে, অনুগ্রহ করে আবার চেষ্টা করুন।');
        return;
      }

      const earnedReward = res.reward ?? fallbackReward;

      try {
        localStorage.setItem(storageKey, '1');
        if (progressKey) {
          sessionStorage.removeItem(progressKey);
          localStorage.removeItem(progressKey);
        }
      } catch {}

      triggerHaptic('success');
      if (res.ok) {
        toast.success(`🎉 অভিনন্দন! +$${earnedReward.toFixed(2)} USDT সরাসরি আপনার ব্যালেন্সে যোগ হয়েছে!`, {
          duration: 5000
        });
      }
      // User can freely continue watching this video as long as they want.
      // Once they click back to exit, this video will not appear on their Home page anymore.
    } catch (err) {
      console.error(err);
      claimedInThisSessionRef.current = null;
      setJustClaimed(false);
      setAlreadyClaimed(false);
      toast.error('রিওয়ার্ড যোগ করতে সমস্যা হয়েছে, অনুগ্রহ করে আবার চেষ্টা করুন।');
    } finally {
      setIsClaiming(false);
    }
  };

  // Automatically credit reward as soon as user completes the watch timer on page
  useEffect(() => {
    if (
      secondsElapsed >= targetSeconds &&
      !alreadyClaimed &&
      !justClaimed &&
      !isClaiming &&
      liveUser &&
      currentVideo &&
      claimedInThisSessionRef.current !== currentVideo.id
    ) {
      handleClaimReward();
    }
  }, [secondsElapsed, targetSeconds, alreadyClaimed, justClaimed, isClaiming, liveUser, currentVideo]);

  if (!currentVideo) {
    return (
      <main className="p-4 text-center">
        <p className="text-amber-100 text-sm font-semibold">ভিডিওটি খুঁজে পাওয়া যায়নি।</p>
        <button
          onClick={() => navigate('/tasks')}
          className="mt-3 px-4 py-2 rounded-xl bg-brand-500 text-white font-bold text-xs"
        >
          ভিডিও পেজে ফিরে যান
        </button>
      </main>
    );
  }

  // Circular progress SVG calculations (compact 38px radius)
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <main className="min-h-screen pb-20">
      {/* Top Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-amber-500/20 bg-[#1a0e07]/92 px-3 py-2.5 backdrop-blur-md">
        <button
          onClick={handleBack}
          className="flex h-10 w-10 items-center justify-center rounded-xl luxury-btn-dark transition active:scale-95"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="text-center">
          <p className="text-[13px] font-extrabold text-amber-100">ভিডিও দেখুন ও আয় করুন</p>
          <p className="text-[10px] text-amber-200/70 font-medium">Watch & Earn Rewards</p>
        </div>

        {liveUser && (
          <div className="rounded-xl luxury-subcard px-2.5 py-1 text-right">
            <p className="text-[8.5px] font-semibold uppercase tracking-wide text-amber-300/90">
              ব্যালেন্স
            </p>
            <p className="text-[12px] font-extrabold text-ink tabular-nums">
              {formatUsd(liveUser.balance)}
            </p>
          </div>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Dynamic Sponsored Banner Ads configured via Firebase / Admin Panel */}
        {(() => {
          const adConfig = config.videoBannerAds;
          const isEnabled = adConfig?.enabled !== false;
          const count = Math.max(0, Math.min(10, Number(adConfig?.count ?? 5)));
          const defaultKey = adConfig?.adKey || '911ee250303f0d466e6e2cab58b077e0';
          const host = adConfig?.scriptHost || 'https://bauval.org/22';
          const slotKeys = Array.isArray(adConfig?.slotKeys) ? adConfig.slotKeys : [];

          if (!isEnabled || count <= 0) return null;

          return (
            <div className="flex flex-col items-center gap-3">
              {Array.from({ length: count }).map((_, idx) => {
                const keyForSlot = slotKeys[idx]?.trim() || defaultKey;
                return (
                  <AdsterraBanner
                    key={`ad_${idx}_${keyForSlot}`}
                    index={idx + 1}
                    adKey={keyForSlot}
                    scriptHost={host}
                  />
                );
              })}
            </div>
          );
        })()}



        {/* Video Player Box with Security Shields (Bigger display & Fullscreen strictly disabled) */}
        <div
          ref={videoSectionRef}
          className="relative -mx-1 sm:mx-0 overflow-hidden rounded-2xl bg-black shadow-card scroll-mt-14 ring-1 ring-black/10"
        >
          <div className="relative w-full aspect-[16/10] min-h-[250px] max-h-[380px] bg-slate-900 overflow-hidden">
            {ytId ? (
              <>
                <iframe
                  ref={videoIframeRef}
                  src={embedUrl}
                  title={currentVideo.title}
                  className="h-full w-full border-0 select-none"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                />

                {/* 🛡️ Strict Click Shields: Absorb and cancel clicks on YouTube title, avatar, watermark, fullscreen, & share buttons */}
                {/* 1. Top Bar Shield: channel name, avatar, title, copy link, and share buttons */}
                <div
                  className="absolute top-0 left-0 right-0 h-16 z-20 cursor-default select-none bg-transparent"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                  }}
                  title="ভিডিও লিংক সুরক্ষিত"
                />

                {/* 2. Bottom Right Shield: Covers YouTube logo AND Fullscreen button completely */}
                <div
                  className="absolute bottom-0 right-0 w-44 h-14 z-20 cursor-default select-none bg-transparent"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                  }}
                  title="ফুল স্ক্রিন ও লিংক নিষ্ক্রিয়"
                />

                {/* 3. Bottom Left Shield: link icon / watch on YouTube / share links */}
                <div
                  className="absolute bottom-0 left-0 w-28 h-14 z-20 cursor-default select-none bg-transparent"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                  }}
                  title="ভিডিও লিংক সুরক্ষিত"
                />

                {/* 4. Bottom Center Shield: suggested thumbnail cards and overlays */}
                <div
                  className="absolute bottom-11 left-1/2 -translate-x-1/2 w-52 h-14 z-20 cursor-default select-none bg-transparent"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                  }}
                />
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center text-white">
                <AlertCircle className="h-8 w-8 text-amber-400 mb-2" />
                <p className="text-xs font-bold">ভিডিও লিংক লোড করা যায়নি</p>
                <p className="text-[10px] text-gray-400 mt-1">{currentVideo.youtubeUrl}</p>
              </div>
            )}
          </div>
        </div>

        {/* Compact, Sleek Timer & Reward Card */}
        <div className="relative overflow-hidden rounded-2xl luxury-card p-3">
          {/* Top Info Header */}
          <div className="flex items-center justify-between border-b border-amber-500/15 pb-2">
            <div
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold transition-colors ${
                !isPageActive
                  ? 'border-amber-400/40 bg-amber-500/20 text-amber-200 animate-pulse'
                  : 'border-amber-400/25 bg-amber-500/15 text-amber-200'
              }`}
            >
              <Timer className="h-3 w-3 text-amber-300 animate-pulse" />
              <span>{!isPageActive ? '⏸️ টাইমার পজ আছে (পেজে ফিরে আসুন)' : 'লাইভ ওয়াচ টাইমার'}</span>
            </div>
            <div className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-300 border border-emerald-400/30 tabular-nums">
              +${rewardAmount.toFixed(2)} USDT
            </div>
          </div>

          {alreadyClaimed || justClaimed ? (
            /* Completed / Already Claimed State - Never exits automatically */
            <div className="py-2.5 text-center">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-500/15 text-emerald-300 shadow-sm mb-1">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="text-[13px] font-extrabold text-ink">
                ব্যালেন্সে রিওয়ার্ড যোগ হয়ে গেছে! 🎉
              </h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-200/80">
                আপনার অ্যাকাউন্টে <b className="text-emerald-300">+${rewardAmount.toFixed(2)} USDT</b> স্বয়ংক্রিয়ভাবে যোগ হয়েছে। আপনি চাইলে ভিডিওটি দেখা চালিয়ে যেতে পারেন, অথবা নিজের ইচ্ছামতো ব্যাক বা পরবর্তী ভিডিওতে যেতে পারেন।
              </p>

              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => navigate('/tasks', { replace: true })}
                  className="flex flex-1 min-h-[40px] items-center justify-center gap-1.5 rounded-xl luxury-btn-dark py-2 text-[12px] font-extrabold transition active:scale-98 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" /> তালিকায় ফিরুন
                </button>
                {nextUnwatchedVideo && (
                  <button
                    onClick={() => navigate(`/video/${nextUnwatchedVideo.id}`, { replace: true })}
                    className="flex flex-1 min-h-[40px] items-center justify-center gap-1.5 rounded-xl luxury-btn-gold py-2 text-[12px] font-extrabold transition active:scale-98 cursor-pointer"
                  >
                    পরবর্তী ভিডিও <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Active Live Countdown: Small, Sleek, Compact */
            <div className="pt-2">
              <div className="flex items-center justify-center py-2">
                {/* Compact Circular Progress Ring Centered */}
                <div className="relative flex items-center justify-center shrink-0">
                  <svg className="h-[76px] w-[76px] -rotate-90 transform" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r={radius}
                      className="text-amber-950/60"
                      strokeWidth="8"
                      stroke="currentColor"
                      fill="transparent"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r={radius}
                      className="transition-all duration-500 ease-linear"
                      strokeWidth="8"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      stroke="url(#timerGradient)"
                      fill="transparent"
                    />
                    <defs>
                      <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f3c46b" />
                        <stop offset="50%" stopColor="#d49234" />
                        <stop offset="100%" stopColor="#34d399" />
                      </linearGradient>
                    </defs>
                  </svg>

                  {/* Inside Ring Display */}
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-[17px] font-black font-mono tracking-tight text-ink leading-tight tabular-nums">
                      {formatSeconds(remainingSeconds)}
                    </span>
                    <span className="text-[8.5px] font-bold text-amber-300 uppercase tracking-wide">
                      মিনিট বাকি
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              {canClaim && (
                <div className="mt-2.5">
                  <button
                    onClick={handleClaimReward}
                    disabled={isClaiming}
                    className="flex w-full animate-bounce items-center justify-center gap-2 rounded-xl luxury-btn-gold py-3 text-[13px] font-extrabold transition active:scale-98"
                  >
                    <Sparkles className="h-4 w-4" />
                    {isClaiming ? 'ব্যালেন্সে যোগ হচ্ছে...' : `রিওয়ার্ড গ্রহণ করুন (+$${rewardAmount.toFixed(2)} USDT)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Adsterra Native Banner (strictly on Video Play page) */}
        <AdsterraNativeBanner />

        {/* Bottom Banner Ads (managed in real-time via Firebase / Admin Panel) */}
        {(() => {
          const adConfig = config.videoBannerAds;
          const isEnabled = adConfig?.enabled !== false;
          const bottomCount = Math.max(0, Math.min(10, Number(adConfig?.bottomCount ?? 5)));
          const defaultKey = adConfig?.adKey || '911ee250303f0d466e6e2cab58b077e0';
          const host = adConfig?.scriptHost || 'https://bauval.org/22';
          const slotKeys = Array.isArray(adConfig?.slotKeys) ? adConfig.slotKeys : [];

          if (!isEnabled || bottomCount <= 0) return null;

          return (
            <div className="flex flex-col items-center gap-3 my-3">
              {Array.from({ length: bottomCount }).map((_, idx) => {
                const keyForSlot = slotKeys[idx + 5]?.trim() || slotKeys[idx]?.trim() || defaultKey;
                return (
                  <AdsterraBanner
                    key={`bottom_ad_${idx}_${keyForSlot}`}
                    index={idx + 6}
                    adKey={keyForSlot}
                    scriptHost={host}
                  />
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Early Exit Confirmation Warning Modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl luxury-card p-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-rose-400/35 bg-rose-500/15 text-rose-300 mb-3">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <h3 className="text-center text-[16px] font-extrabold text-ink">
              ভিডিও দেখা এখনও বাকি!
            </h3>

            <p className="mt-2 text-center text-[12px] leading-relaxed text-amber-200/80">
              আর মাত্র <b className="text-amber-200">{remainingSeconds} সেকেন্ড</b> অপেক্ষা করতে হবে। এখন ফিরে গেলে আপনার অ্যাকাউন্টে <b className="text-rose-300">কোনো টাকা যোগ হবে না</b> এবং সেশন বাতিল হয়ে যাবে!
            </p>

            <div className="mt-5 space-y-2">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl luxury-btn-gold py-3 text-[13px] font-extrabold transition active:scale-98"
              >
                ভিডিও দেখতে থাকুন
              </button>

              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  if (progressKey) {
                    try {
                      sessionStorage.removeItem(progressKey);
                      localStorage.removeItem(progressKey);
                    } catch {}
                  }
                  navigate('/tasks');
                }}
                className="flex min-h-[42px] w-full items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/15 py-2.5 text-[12px] font-bold text-rose-200 transition hover:bg-rose-500/25 active:scale-98"
              >
                ফিরে যান (টাকা যোগ হবে না)
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
