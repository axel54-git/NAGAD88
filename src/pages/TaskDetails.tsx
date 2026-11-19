import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Gift,
  ExternalLink,
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  History,
  Upload,
  X,
  LoaderCircle,
  Image as ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useAppStore } from '../contexts/AuthContext';
import { submitTaskProof } from '../lib/store';
import { uploadProofImage } from '../lib/uploadImage';
import { openExternalLink, triggerHaptic } from '../lib/telegram';

export function TaskDetails() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user, config } = useAuth();
  const db = useAppStore();

  const liveUser = (user?.telegramId && db.users[user.telegramId]) ? db.users[user.telegramId] : user;

  const taskPost = useMemo(() => {
    const posts = Array.isArray(config.taskPosts) ? config.taskPosts : [];
    return posts.find((p) => p.id === taskId) || null;
  }, [config.taskPosts, taskId]);

  const maxLimit = Math.max(1, Math.floor(Number(taskPost?.maxCompletions) || 1));

  const { pendingSub, approvedCount, existingSubmission } = useMemo(() => {
    if (!liveUser || !taskPost) {
      return { pendingSub: null, approvedCount: 0, existingSubmission: null };
    }
    const subs = (Array.isArray(db.taskSubmissions) ? db.taskSubmissions : [])
      .filter((s) => s.taskId === taskPost.id && s.telegramId === liveUser.telegramId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const pendingItem = subs.find((s) => s.status === 'pending') || null;
    const approvedTotal = subs.filter((s) => s.status === 'approved').length;
    const displaySub =
      pendingItem ||
      (approvedTotal >= maxLimit ? subs.find((s) => s.status === 'approved') || null : null) ||
      (subs[0]?.status === 'rejected' ? subs[0] : null);

    return {
      pendingSub: pendingItem,
      approvedCount: approvedTotal,
      existingSubmission: displaySub
    };
  }, [db.taskSubmissions, liveUser, taskPost, maxLimit]);

  const requiredCount = Math.max(1, Math.min(3, Number(taskPost?.requiredScreenshots || 1)));

  const [screenshots, setScreenshots] = useState<(string | null)[]>(() =>
    Array.from({ length: 3 }, () => null)
  );
  const [fileNames, setFileNames] = useState<string[]>(() =>
    Array.from({ length: 3 }, () => '')
  );
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);

  if (!taskPost) {
    return (
      <main className="px-3 pt-4 pb-8">
        <header className="mb-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex h-10 w-10 items-center justify-center rounded-full luxury-btn-dark active:scale-95 transition"
            aria-label="Back to Home"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-[17px] font-extrabold text-amber-100 drop-shadow-xs">Task Details</h1>
        </header>
        <div className="rounded-2xl luxury-card p-6 text-center">
          <p className="text-[14px] font-bold text-ink">টাস্কটি খুঁজে পাওয়া যায়নি</p>
          <p className="mt-1 text-[12px] text-amber-200/75">
            এই টাস্কটি বর্তমানে বন্ধ থাকতে পারে বা মুছে ফেলা হয়েছে।
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 inline-flex items-center justify-center rounded-xl luxury-btn-gold px-5 py-2.5 text-[13px] font-extrabold"
          >
            হোম পেজে ফিরে যান
          </button>
        </div>
      </main>
    );
  }

  const handleFilePick = async (slotIdx: number, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('অনুগ্রহ করে একটি ছবি/স্ক্রিনশট সিলেক্ট করুন');
      return;
    }

    setUploadingSlot(slotIdx);
    triggerHaptic('light');
    try {
      const uploadedUrl = await uploadProofImage(file, config.imgbbApiKey);
      setScreenshots((prev) => {
        const next = [...prev];
        next[slotIdx] = uploadedUrl;
        return next;
      });
      setFileNames((prev) => {
        const next = [...prev];
        next[slotIdx] = file.name;
        return next;
      });
      toast.success(`স্ক্রিনশট ${slotIdx + 1} আপলোড হয়েছে`);
    } catch {
      toast.error('স্ক্রিনশট আপলোড করতে সমস্যা হয়েছে, আবার চেষ্টা করুন');
    } finally {
      setUploadingSlot(null);
    }
  };

  const removeScreenshot = (slotIdx: number) => {
    setScreenshots((prev) => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
    setFileNames((prev) => {
      const next = [...prev];
      next[slotIdx] = '';
      return next;
    });
  };

  const handleOpenTaskLink = () => {
    triggerHaptic('medium');
    openExternalLink(taskPost.taskUrl);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveUser) return;

    const selected = screenshots.slice(0, requiredCount).filter((s): s is string => Boolean(s));
    if (selected.length < requiredCount) {
      toast.error(`অনুগ্রহ করে সবগুলো (${requiredCount}টি) প্রমাণ স্ক্রিনশট আপলোড করুন`);
      return;
    }

    setSubmitting(true);
    triggerHaptic('medium');
    try {
      const res = await submitTaskProof({
        taskId: taskPost.id,
        taskTitle: taskPost.title,
        taskBannerUrl: taskPost.bannerUrl,
        telegramId: liveUser.telegramId,
        userName: `${liveUser.firstName} ${liveUser.lastName}`.trim() || liveUser.username || liveUser.telegramId,
        reward: Number(taskPost.reward) || 0,
        screenshots: selected
      });

      if (!res.success) {
        if (res.reason === 'already_approved') {
          toast.info('এই টাস্কের রিওয়ার্ড আপনি ইতিমধ্যে পেয়েছেন!');
        } else if (res.reason === 'already_pending') {
          toast.info('এই টাস্কের প্রমাণ ইতিমধ্যে রিভিউয়ের জন্য জমা আছে।');
        } else {
          toast.error('সাবমিট করতে সমস্যা হয়েছে।');
        }
        return;
      }

      triggerHaptic('success');
      toast.success('✅ প্রমাণ সফলভাবে সাবমিট হয়েছে! অ্যাডমিন যাচাই করে ব্যালেন্স যোগ করে দেবেন।', {
        duration: 5000
      });
      setScreenshots(Array.from({ length: 3 }, () => null));
      setFileNames(Array.from({ length: 3 }, () => ''));
      navigate('/', { replace: true });
    } catch {
      toast.error('সাবমিট ব্যর্থ হয়েছে, আবার চেষ্টা করুন।');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitForm = !pendingSub && approvedCount < maxLimit;

  return (
    <main className="px-3 pt-3 pb-10 space-y-3.5">
      {/* Top App Bar */}
      <header className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full luxury-btn-dark transition active:scale-95 cursor-pointer"
            aria-label="Back to Home"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-[17px] font-extrabold text-amber-100 tracking-tight drop-shadow-xs">
            Task Details
          </h1>
        </div>

        <Link
          to="/tasks/history"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full luxury-btn-dark px-3 text-[12px] font-bold transition active:scale-95"
        >
          <History className="h-3.5 w-3.5 text-amber-300" />
          <span>History</span>
        </Link>
      </header>

      {/* Main Details Card */}
      <section className="overflow-hidden rounded-2xl luxury-card">
        {/* Top Banner Image */}
        <div className="relative aspect-video w-full overflow-hidden bg-black/50">
          {!bannerFailed && taskPost.bannerUrl ? (
            <img
              src={taskPost.bannerUrl}
              alt={taskPost.title}
              referrerPolicy="no-referrer"
              onError={() => setBannerFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#3b2010] to-[#1a0d06] p-4 text-center text-amber-100">
              <ImageIcon className="h-9 w-9 text-amber-300/80 mb-1.5" />
              <p className="text-[14px] font-extrabold line-clamp-2">{taskPost.title}</p>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-4">
          <h2 className="text-[17px] font-extrabold leading-snug text-ink">
            {taskPost.title}
          </h2>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-300">
              <Gift className="h-5 w-5 shrink-0 text-amber-400" />
              <span className="text-[15px] font-extrabold tabular-nums">
                Reward: ${Number(taskPost.reward || 0).toFixed(2)}
              </span>
            </div>

            {maxLimit > 1 && (
              <span className="rounded-full border border-amber-400/25 bg-amber-500/15 px-2.5 py-1 text-[11.5px] font-bold text-amber-200 tabular-nums">
                সম্পন্ন: {approvedCount}/{maxLimit} বার
              </span>
            )}
          </div>

          <hr className="my-3.5 border-amber-500/15" />

          <p className="text-[13px] font-semibold text-amber-200/80 mb-3">
            কাজ করার বিবরণ:
          </p>

          <ol className="space-y-3">
            {(Array.isArray(taskPost.steps) && taskPost.steps.length > 0
              ? taskPost.steps
              : [
                  'প্রথমে "GO TO TASK LINK" বাটনে ক্লিক করুন।',
                  'নির্দেশনা অনুযায়ী কাজ সম্পন্ন করুন।',
                  'সবশেষে প্রমাণ হিসেবে স্ক্রিনশট সাবমিট করুন।'
                ]
            ).map((stepText, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-ink/90"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded luxury-btn-gold text-[11px] font-extrabold tabular-nums">
                  {idx + 1}
                </span>
                <span className="flex-1">{stepText}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Compact GO TO TASK LINK Button */}
      <button
        type="button"
        onClick={handleOpenTaskLink}
        className="mx-auto flex h-11 w-fit min-w-[215px] items-center justify-center gap-1.5 rounded-xl luxury-btn-gold px-5 text-[12.5px] font-extrabold tracking-wide transition active:scale-[0.98] cursor-pointer"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        <span>GO TO TASK LINK</span>
      </button>

      {/* Submit Proof Screenshot(s) Card */}
      <section className="rounded-2xl luxury-card p-4">
        <div className="flex items-center gap-2 mb-3.5">
          <Camera className="h-5 w-5 text-amber-300" />
          <h3 className="text-[15px] font-extrabold text-ink">
            Submit Proof Screenshot(s)
          </h3>
        </div>

        {/* Status notice if already pending or approved or rejected */}
        {existingSubmission && (
          <div
            className={`mb-4 rounded-xl border p-3.5 ${
              existingSubmission.status === 'approved'
                ? 'border-emerald-400/30 bg-emerald-500/15'
                : existingSubmission.status === 'rejected'
                ? 'border-rose-400/30 bg-rose-500/15'
                : 'border-amber-400/30 bg-amber-500/15'
            }`}
          >
            <div className="flex items-center gap-2">
              {existingSubmission.status === 'approved' ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              ) : existingSubmission.status === 'rejected' ? (
                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
              ) : (
                <Clock className="h-5 w-5 shrink-0 text-amber-300" />
              )}
              <p className="text-[13px] font-extrabold text-ink">
                {existingSubmission.status === 'approved'
                  ? `অনুমোদিত! +$${existingSubmission.reward.toFixed(2)} ব্যালেন্সে যোগ হয়েছে`
                  : existingSubmission.status === 'rejected'
                  ? 'আগের সাবমিশন বাতিল হয়েছে — পুনরায় জমা দিন'
                  : 'আপনার প্রমাণ রিভিউয়ের জন্য জমা আছে'}
              </p>
            </div>

            {existingSubmission.status === 'rejected' && existingSubmission.rejectReason && (
              <p className="mt-1.5 text-[12px] text-rose-200 font-medium">
                কারণ: {existingSubmission.rejectReason}
              </p>
            )}

            {existingSubmission.status !== 'rejected' && (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {existingSubmission.screenshots.map((src, i) => (
                    <a
                      key={i}
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg border border-amber-500/25 aspect-square bg-black/40"
                    >
                      <img
                        src={src}
                        alt={`Submitted Proof ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
                <Link
                  to="/tasks/history"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-xl luxury-btn-dark py-2 text-[12px] font-bold"
                >
                  হিস্টোরিতে স্ট্যাটাস দেখুন
                </Link>
              </>
            )}
          </div>
        )}

        {canSubmitForm && (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {Array.from({ length: requiredCount }).map((_, idx) => {
              const previewUrl = screenshots[idx];
              const fileName = fileNames[idx];
              const isUploadingThis = uploadingSlot === idx;

              return (
                <div key={idx}>
                  <label className="mb-1.5 block text-[12.5px] font-bold text-amber-100">
                    Upload Screenshot {idx + 1} <span className="text-rose-400">*</span>
                  </label>

                  {previewUrl ? (
                    <div className="relative overflow-hidden rounded-xl luxury-subcard p-2">
                      <div className="flex items-center gap-3">
                        <img
                          src={previewUrl}
                          alt={`Screenshot ${idx + 1} preview`}
                          className="h-16 w-16 shrink-0 rounded-lg object-cover border border-amber-500/25 bg-black/40"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-bold text-ink">
                            {fileName || `Screenshot_${idx + 1}.jpg`}
                          </p>
                          <p className="mt-0.5 text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> আপলোড সম্পন্ন
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeScreenshot(idx)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-400/30 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 cursor-pointer"
                          aria-label="Remove screenshot"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex min-h-[58px] cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-amber-500/30 bg-black/35 px-3 py-2.5 transition hover:border-amber-400/60 hover:bg-amber-950/30">
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={isUploadingThis || submitting}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          handleFilePick(idx, file);
                        }}
                      />
                      <span className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg luxury-btn-dark px-3 py-1.5 text-[12px] font-semibold">
                        {isUploadingThis ? (
                          <>
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-amber-300" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5 text-amber-300" />
                            Choose File
                          </>
                        )}
                      </span>
                      <span className="truncate text-[12.5px] text-amber-200/70">
                        {isUploadingThis ? 'ছবি প্রসেস হচ্ছে...' : 'No file chosen'}
                      </span>
                    </label>
                  )}
                </div>
              );
            })}

            <button
              type="submit"
              disabled={submitting || uploadingSlot !== null}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl luxury-btn-gold py-3 text-[14px] font-extrabold transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  <span>সাবমিট হচ্ছে...</span>
                </>
              ) : (
                <span>সাবমিট করুন</span>
              )}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
