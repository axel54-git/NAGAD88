import type { AppConfig, AppDatabase, User, Withdrawal, Post, TaskSubmission } from '../types';
import {
  adminFetch,
  authSessionApi,
  earnAdApi,
  earnTaskApi,
  earnVideoApi,
  requestWithdrawalApi,
  submitTaskProofApi,
  updateUserProfileApi,
  reviewTaskSubmissionApi
} from './firebase';
import taskBannerSignup from '../assets/images/task_banner_signup_1794671744750.jpg';
import taskBannerSocial from '../assets/images/task_banner_social_1794671746187.jpg';

export const defaultConfig: AppConfig = {
  appName: "Nagad88",
  botUsername: "Nadag88Bot",
  miniAppUrl: "https://nagad88.apk5y.workers.dev/",
  supportUrl: "https://t.me/ManeiShopBD_Site",
  imgbbApiKey: "",
  allowDemoLogin: true,
  forceChannelVerification: true,
  requiredChannels: [
    {
      id: "main",
      name: "Main",
      tag: "Channel",
      subtitle: "All Videos • Updates • News",
      username: "ManiShop_Community",
      url: "https://t.me/ManiShop_Community"
    },
    {
      id: "payment",
      name: "Payment",
      tag: "Channel",
      subtitle: "Payment • Proofs • Updates",
      username: "Earning_Money_Lob",
      url: "https://t.me/Earning_Money_Lob"
    }
  ],
  adSlots: [
    { id: "slot1", title: "AD SLOT 1", zone: "10635966", reward: 0.05 },
    { id: "slot2", title: "AD SLOT 2", zone: "10635966", reward: 0.05 }
  ],
  adMinSeconds: 60,
  adMaxMinutes: 5,
  adDailyLimitPerSlot: 200,
  adHourlyLimitPerSlot: 10,
  tasks: [
    { id: "t1", title: "Video watch 1", url: "https://ads.ziniyaapu7.workers.dev/", reward: 0.05, minSeconds: 60, maxMinutes: 5 },
    { id: "t2", title: "Video track 2", url: "https://ads.ziniyaapu7.workers.dev/", reward: 0.05, minSeconds: 60, maxMinutes: 5 },
    { id: "t3", title: "Video tax 3", url: "https://ads.ziniyaapu7.workers.dev/", reward: 0.05, minSeconds: 60, maxMinutes: 5 },
    { id: "t4", title: "Special task 4", url: "https://ads.ziniyaapu7.workers.dev/", reward: 0.05, minSeconds: 60, maxMinutes: 5 }
  ],
  taskPosts: [
    {
      id: "tp_1",
      title: "একাউন্ট করুন & অ্যাপ ডাউনলোড টাস্ক",
      bannerUrl: taskBannerSignup,
      reward: 0.50,
      taskUrl: "https://ads.ziniyaapu7.workers.dev/",
      steps: [
        'প্রথমে "GO TO TASK LINK" বাটনে ক্লিক করুন।',
        'একটি নতুন একাউন্ট তৈরি করুন এবং নির্দেশনা অনুযায়ী কাজ সম্পন্ন করুন।',
        'সবশেষে টাস্ক সম্পন্ন করার প্রমাণ হিসেবে স্ক্রিনশটগুলো সাবমিট করুন।'
      ],
      requiredScreenshots: 1,
      order: 1,
      active: true,
      createdAt: "2026-11-14T00:00:00.000Z"
    },
    {
      id: "tp_2",
      title: "সাইন আপ ও ভেরিফিকেশন স্পেশাল টাস্ক",
      bannerUrl: taskBannerSocial,
      reward: 0.35,
      taskUrl: "https://ads.ziniyaapu7.workers.dev/",
      steps: [
        'প্রথমে "GO TO TASK LINK" বাটনে ক্লিক করে লিংকে যান।',
        'প্রয়োজনীয় তথ্য দিয়ে সাইন আপ ও ভেরিফাই সম্পন্ন করুন।',
        'কাজ শেষ হওয়ার স্ক্রিনশট নিচে আপলোড করে সাবমিট করুন।'
      ],
      requiredScreenshots: 1,
      order: 2,
      active: true,
      createdAt: "2026-11-14T00:00:00.000Z"
    }
  ],
  videos: [
    {
      id: "v1",
      title: "ভূতনীকে দিয়ে গোপাল দাদা বানালেন সুস্বাদু খাবার—গোপাল ভাঁড়",
      youtubeUrl: "https://www.youtube.com/watch?v=k1tGkC7mG6M",
      reward: 0.10,
      minWatchSeconds: 60,
      duration: "22:02",
      order: 1
    },
    {
      id: "v2",
      title: "বৃষ্টির দিনে বাজারে গোপাল ভাঁড় সবাইকে বোকা বানাইলো",
      youtubeUrl: "https://www.youtube.com/watch?v=Fj-y57vT_G0",
      reward: 0.08,
      minWatchSeconds: 60,
      duration: "18:45",
      order: 2
    },
    {
      id: "v3",
      title: 'রংবাজ "Rongbaaz" | Full Movie / Natok',
      youtubeUrl: "https://www.youtube.com/watch?v=p1Jk4vY2b9A",
      reward: 0.15,
      minWatchSeconds: 60,
      duration: "45:30",
      order: 3
    },
    {
      id: "v4",
      title: "মুদি দোকান দিয়ে কি লাল হতে চান? জেনে নিন গোপন টেকনিক",
      youtubeUrl: "https://www.youtube.com/watch?v=o0G6uQyF2wE",
      reward: 0.05,
      minWatchSeconds: 60,
      duration: "12:15",
      order: 4
    },
    {
      id: "v5",
      title: "মায়াপুরী পর্বতের রহস্য | Gopal Bhar Animation Episode",
      youtubeUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      reward: 0.10,
      minWatchSeconds: 60,
      duration: "20:00",
      order: 5
    },
    {
      id: "v6",
      title: "Ek Rash Nil | এক রাশ নীল | রোমান্টিক নাটক",
      youtubeUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
      reward: 0.12,
      minWatchSeconds: 60,
      duration: "32:40",
      order: 6
    }
  ],
  videoBannerAds: {
    enabled: true,
    count: 5,
    bottomCount: 5,
    adKey: '911ee250303f0d466e6e2cab58b077e0',
    scriptHost: 'https://bauval.org/22',
    popunderUrl: 'https://bicea.org/14/c35007be6aabc3a9eb292e5611d0030b',
    popunderEnabled: true,
    slotKeys: [
      '911ee250303f0d466e6e2cab58b077e0',
      '911ee250303f0d466e6e2cab58b077e0',
      '911ee250303f0d466e6e2cab58b077e0',
      '911ee250303f0d466e6e2cab58b077e0',
      '911ee250303f0d466e6e2cab58b077e0'
    ]
  },
  referralBonus: 0.5,
  level2Bonus: 0.1,
  welcomeBonus: 0.01,
  minWithdraw: 5,
  minReferralsForWithdraw: 15,
  withdrawAmounts: [5, 10, 15, 30, 60, 100]
};

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function generateId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const STORAGE_KEY = "nogod88_db";

const initialDatabase: AppDatabase = {
  rev: 0,
  users: {},
  referrals: [],
  withdrawals: [],
  posts: [],
  logs: [],
  taskSubmissions: [],
  config: defaultConfig
};

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function loadInitialData(): AppDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepClone(initialDatabase);
    const parsed = JSON.parse(raw);
    const mergedConfig: AppConfig = { ...defaultConfig, ...(parsed.config || {}) };
    mergedConfig.appName = "Nagad88";
    delete (mergedConfig as any).botToken;
    delete (mergedConfig as any).adminPinHash;
    delete (mergedConfig as any).adminPassword;
    mergedConfig.imgbbApiKey = "";
    mergedConfig.adMinSeconds = 60;
    mergedConfig.adHourlyLimitPerSlot = 10;

    if (!Array.isArray(mergedConfig.tasks) || mergedConfig.tasks.length === 0) {
      mergedConfig.tasks = defaultConfig.tasks;
    }

    if (!Array.isArray(mergedConfig.taskPosts)) {
      mergedConfig.taskPosts = defaultConfig.taskPosts;
    }

    if (!Array.isArray(mergedConfig.videos) || mergedConfig.videos.length === 0) {
      mergedConfig.videos = defaultConfig.videos;
    }

    if (!mergedConfig.videoBannerAds) {
      mergedConfig.videoBannerAds = defaultConfig.videoBannerAds;
    }

    if (!Array.isArray(mergedConfig.requiredChannels)) {
      mergedConfig.requiredChannels = defaultConfig.requiredChannels;
    } else {
      mergedConfig.requiredChannels = mergedConfig.requiredChannels.map((c) => {
        if (c.username === "jgjghjghh687") {
          return {
            ...c,
            username: "ManiShop_Community",
            url: "https://t.me/ManiShop_Community"
          };
        }
        return c;
      });
    }
    if (typeof mergedConfig.forceChannelVerification !== 'boolean') {
      mergedConfig.forceChannelVerification = true;
    }

    const fakeIds = new Set(["984210452", "742189301", "610928374", "528401923", "419401859"]);
    const cleanedUsers: Record<string, User> = {};
    if (parsed.users && typeof parsed.users === 'object') {
      for (const [k, v] of Object.entries(parsed.users as Record<string, User>)) {
        if (!fakeIds.has(k) && !k.startsWith("seed_") && !k.startsWith("user_seed_")) {
          cleanedUsers[k] = v;
        }
      }
    }

    const cleanedReferrals = Array.isArray(parsed.referrals)
      ? parsed.referrals.filter((r: any) => !r.id?.startsWith("ref_seed") && !fakeIds.has(r.referrerTelegramId) && !fakeIds.has(r.referredTelegramId))
      : [];

    const cleanedWithdrawals = Array.isArray(parsed.withdrawals)
      ? parsed.withdrawals.filter((w: any) => !w.id?.startsWith("wd_seed") && !fakeIds.has(w.telegramId))
      : [];

    const cleanedLogs = Array.isArray(parsed.logs)
      ? parsed.logs.filter((l: any) => !l.id?.startsWith("log_seed") && !fakeIds.has(l.telegramId))
      : [];

    const cleanedSubmissions = Array.isArray(parsed.taskSubmissions)
      ? parsed.taskSubmissions.filter((s: any) => s && s.id && !fakeIds.has(s.telegramId))
      : [];

    return {
      ...deepClone(initialDatabase),
      ...parsed,
      users: cleanedUsers,
      referrals: cleanedReferrals,
      withdrawals: cleanedWithdrawals,
      logs: cleanedLogs,
      taskSubmissions: cleanedSubmissions,
      config: mergedConfig
    };
  } catch {
    return deepClone(initialDatabase);
  }
}

export function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendTelegramBotMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: any
): Promise<boolean> {
  const cid = String(chatId).trim().replace(/^@/, '');
  if (!cid || cid === "724910385" || cid === "0" || !/^-?\d+$/.test(cid)) return false;

  try {
    const proxyRes = await adminFetch("/api/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: cid, text, replyMarkup })
    });
    if (proxyRes.ok) {
      const pData = await proxyRes.json().catch(() => ({}));
      if (pData.ok) return true;
    }
  } catch (err) {
    console.warn("[Telegram Proxy Dispatch Error]:", err);
  }
  return false;
}

export async function syncBotMenuButton(miniAppUrl?: string): Promise<boolean> {
  const url = miniAppUrl || defaultConfig.miniAppUrl || (typeof window !== 'undefined' ? `${window.location.origin}/` : "");
  try {
    const res = await adminFetch("/api/set-menu-button", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await res.json().catch(() => ({}));
    return Boolean(data.ok);
  } catch (err) {
    console.warn("Failed to sync bot menu button:", err);
    return false;
  }
}

let currentDb: AppDatabase = loadInitialData();
const subscribers = new Set<() => void>();

function notifySubscribers() {
  subscribers.forEach((fn) => fn());
}

function persistLocally() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentDb));
  } catch (err) {
    console.error("Local persistence error:", err);
  }
}

export const appStore = {
  get(): AppDatabase {
    return currentDb;
  },
  subscribe(fn: () => void): () => void {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
  update(updater: (draft: AppDatabase) => void): AppDatabase {
    const draft = deepClone(currentDb);
    updater(draft);
    draft.rev = currentDb.rev + 1;
    currentDb = draft;
    persistLocally();
    notifySubscribers();
    return currentDb;
  },
  reset(): void {
    currentDb = {
      ...deepClone(initialDatabase),
      rev: currentDb.rev + 1
    };
    persistLocally();
    notifySubscribers();
  }
};

export async function loginOrRegisterUser(
  telegramUser: {
    id: number | string;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  },
  referredBy?: string | null,
  initData?: string
): Promise<User> {
  const res = await authSessionApi({
    initData: initData || undefined,
    telegramUser,
    referredBy: referredBy || null
  });

  if (res.error === 'banned' && res.user) {
    appStore.update((db) => {
      db.users[res.user!.telegramId] = res.user!;
    });
    return res.user;
  }

  if (!res.ok || !res.user) {
    throw new Error(res.error || 'auth_failed');
  }

  const authoritativeUser = res.user;
  const tid = authoritativeUser.telegramId;

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`nogod88_user_registered_${tid}`, '1');
      localStorage.removeItem('c2c_referral_start_param');
      sessionStorage.removeItem('c2c_referral_start_param');
      if (res.isBrandNewUser) {
        sessionStorage.removeItem(`tg_gate_ok_${tid}`);
      }
    } catch {}
  }

  appStore.update((db) => {
    if (res.isBrandNewUser) {
      db.withdrawals = db.withdrawals.filter((w) => w.telegramId !== tid);
      db.referrals = db.referrals.filter(
        (r) => r.referredTelegramId !== tid && r.referrerTelegramId !== tid
      );
      db.logs = db.logs.filter((l) => l.telegramId !== tid);
      db.taskSubmissions = (db.taskSubmissions || []).filter((s) => s.telegramId !== tid);
    }
    db.users[tid] = authoritativeUser;
  });

  return authoritativeUser;
}

export async function earnAdReward(
  telegramId: string,
  slotId: string
): Promise<{ ok: boolean; user?: User; reward?: number; error?: string }> {
  const res = await earnAdApi(slotId);
  if (res.ok && res.user) {
    appStore.update((db) => {
      db.users[res.user!.telegramId] = res.user!;
      if (res.log && !db.logs.some((l) => l.id === res.log!.id)) {
        db.logs.unshift(res.log);
      }
    });
    return { ok: true, user: res.user, reward: res.reward };
  }
  if (res.user) {
    appStore.update((db) => {
      db.users[telegramId] = res.user!;
    });
  }
  return { ok: false, error: res.error || 'ad_earn_error' };
}

export async function earnTaskReward(
  telegramId: string,
  taskId: string
): Promise<{ ok: boolean; user?: User; reward?: number; error?: string }> {
  const res = await earnTaskApi(taskId);
  if (res.ok && res.user) {
    appStore.update((db) => {
      db.users[res.user!.telegramId] = res.user!;
      if (res.log && !db.logs.some((l) => l.id === res.log!.id)) {
        db.logs.unshift(res.log);
      }
    });
    return { ok: true, user: res.user, reward: res.reward };
  }
  if (res.user) {
    appStore.update((db) => {
      db.users[telegramId] = res.user!;
    });
  }
  return { ok: false, error: res.error || 'task_earn_error' };
}

export async function earnVideoReward(
  telegramId: string,
  videoId: string
): Promise<{ ok: boolean; user?: User; reward?: number; error?: string }> {
  const tid = String(telegramId).trim();
  const vid = String(videoId).trim();
  const res = await earnVideoApi(vid);

  if (res.ok && res.user) {
    try {
      localStorage.setItem(`c2c_vid_watched_perm_${tid}_${vid}`, '1');
      const existingStr = localStorage.getItem(`c2c_watched_list_${tid}`) || '[]';
      let list: string[] = [];
      try { list = JSON.parse(existingStr); } catch {}
      if (!Array.isArray(list)) list = [];
      if (!list.includes(vid)) {
        list.push(vid);
        localStorage.setItem(`c2c_watched_list_${tid}`, JSON.stringify(list));
      }
    } catch {}

    appStore.update((db) => {
      db.users[res.user!.telegramId] = res.user!;
      if (res.log && !db.logs.some((l) => l.id === res.log!.id)) {
        db.logs.unshift(res.log);
      }
    });
    return { ok: true, user: res.user, reward: res.reward };
  }

  if (res.error === 'already_watched' && res.user) {
    try {
      localStorage.setItem(`c2c_vid_watched_perm_${tid}_${vid}`, '1');
    } catch {}
    appStore.update((db) => {
      db.users[tid] = res.user!;
    });
  }

  return { ok: false, error: res.error || 'video_earn_error', user: res.user };
}

export function isVideoWatchedByUser(telegramId: string, videoId: string): boolean {
  if (!telegramId || !videoId) return false;
  const tid = String(telegramId).trim();
  const vid = String(videoId).trim();
  if (!tid || !vid) return false;

  // Prefer authoritative server user record when loaded
  const u = appStore.get().users[tid];
  if (u && u.watchedVideos) {
    if (u.watchedVideos[vid]) return true;
  }

  // Fallback to local cache
  try {
    if (localStorage.getItem(`c2c_vid_watched_perm_${tid}_${vid}`) === '1') {
      return true;
    }
    const watchedListStr = localStorage.getItem(`c2c_watched_list_${tid}`);
    if (watchedListStr) {
      const list = JSON.parse(watchedListStr);
      if (Array.isArray(list) && list.includes(vid)) {
        return true;
      }
    }
  } catch {}

  return false;
}

export async function requestWithdrawal(
  telegramId: string,
  amount: number,
  account: string,
  method: string = "bKash"
): Promise<{ success: boolean; reason?: string; withdrawal?: Withdrawal }> {
  const res = await requestWithdrawalApi({
    amount,
    account: account.trim(),
    method
  });

  if (res.ok && res.withdrawal) {
    appStore.update((db) => {
      if (res.user) {
        db.users[telegramId] = res.user;
      }
      if (!db.withdrawals.some((w) => w.id === res.withdrawal!.id)) {
        db.withdrawals.unshift(res.withdrawal!);
      }
    });
    return { success: true, withdrawal: res.withdrawal };
  }

  return { success: false, reason: res.reason || res.error || "unknown" };
}

export function createCommunityPost(author: User, text: string, imageUrl: string | null): void {
  appStore.update((db) => {
    const p: Post = {
      id: generateId("post"),
      authorId: author.telegramId,
      authorName: `${author.firstName} ${author.lastName}`.trim(),
      authorPhoto: author.photoUrl,
      text,
      imageUrl,
      likes: [],
      createdAt: new Date().toISOString()
    };
    db.posts.unshift(p);
  });
}

export function togglePostLike(postId: string, userId: string): void {
  appStore.update((db) => {
    const p = db.posts.find((item) => item.id === postId);
    if (!p) return;
    if (p.likes.includes(userId)) {
      p.likes = p.likes.filter((id) => id !== userId);
    } else {
      p.likes = [...p.likes, userId];
    }
  });
}

export function updateUserProfile(telegramId: string, patch: Partial<User>): void {
  const safePatch: Partial<User> = {};
  if (typeof patch.firstName === 'string') safePatch.firstName = patch.firstName;
  if (typeof patch.lastName === 'string') safePatch.lastName = patch.lastName;
  if (typeof patch.bio === 'string') safePatch.bio = patch.bio;
  if (typeof patch.photoUrl === 'string') safePatch.photoUrl = patch.photoUrl;
  if (typeof patch.binanceId === 'string') safePatch.binanceId = patch.binanceId;
  if (Array.isArray(patch.following)) safePatch.following = patch.following;

  appStore.update((db) => {
    const u = db.users[telegramId];
    if (u) {
      Object.assign(u, safePatch);
    }
  });

  updateUserProfileApi(safePatch).then((res) => {
    if (res.ok && res.user) {
      appStore.update((db) => {
        db.users[telegramId] = res.user!;
      });
    }
  }).catch(() => {});
}

export async function submitTaskProof(params: {
  taskId: string;
  taskTitle: string;
  taskBannerUrl?: string;
  telegramId: string;
  userName: string;
  reward: number;
  screenshots: string[];
  note?: string;
}): Promise<{ success: boolean; reason?: string; submission?: TaskSubmission }> {
  const tid = String(params.telegramId).trim();
  if (!tid || !params.taskId || !Array.isArray(params.screenshots) || params.screenshots.length === 0) {
    return { success: false, reason: "missing_data" };
  }

  const res = await submitTaskProofApi({
    taskId: params.taskId,
    screenshots: params.screenshots,
    note: params.note
  });

  if (res.ok && res.submission) {
    appStore.update((db) => {
      const existingList = Array.isArray(db.taskSubmissions) ? db.taskSubmissions : [];
      if (!existingList.some((s) => s.id === res.submission!.id)) {
        db.taskSubmissions = [res.submission!, ...existingList];
      }
    });
    return { success: true, submission: res.submission };
  }

  return { success: false, reason: res.reason || res.error || "unknown" };
}

export async function reviewTaskSubmission(
  submissionId: string,
  decision: "approved" | "rejected",
  rejectReason?: string
): Promise<{ success: boolean; error?: string }> {
  const res = await reviewTaskSubmissionApi(submissionId, decision, rejectReason);
  if (!res.ok || !res.submission) {
    return { success: false, error: res.error || "review_failed" };
  }

  appStore.update((db) => {
    const list = Array.isArray(db.taskSubmissions) ? db.taskSubmissions : [];
    const idx = list.findIndex((s) => s.id === submissionId);
    if (idx !== -1) {
      list[idx] = res.submission!;
      db.taskSubmissions = [...list];
    } else {
      db.taskSubmissions = [res.submission!, ...list];
    }
    if (res.user && res.user.telegramId) {
      db.users[res.user.telegramId] = res.user;
    }
  });

  return { success: true };
}
