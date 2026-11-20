import type {
  User,
  Withdrawal,
  Referral,
  AppConfig,
  BroadcastCampaign,
  TaskSubmission,
  EarningLog
} from "../types";

// All Firebase credentials, Telegram Bot Token, and AES-256-GCM encryption keys remain strictly server-side.
// Client communicates only with authenticated backend proxy routes (/api/*).

const USER_TOKEN_KEY = "c2c_user_token";
const ADMIN_TOKEN_KEY = "c2c_admin_token";

export function getUserToken(): string {
  try {
    return localStorage.getItem(USER_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setUserToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(USER_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(USER_TOKEN_KEY);
    }
  } catch {}
  reconnectStream();
}

export function clearUserToken(): void {
  try {
    localStorage.removeItem(USER_TOKEN_KEY);
  } catch {}
  reconnectStream();
}

export function getAdminToken(): string {
  try {
    const saved = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (saved) return saved;
    const legacy = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (legacy) {
      localStorage.setItem(ADMIN_TOKEN_KEY, legacy);
      localStorage.setItem("c2c_admin_ok", "1");
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      sessionStorage.removeItem("c2c_admin_ok");
      return legacy;
    }
    return "";
  } catch {
    return "";
  }
}

export function hasAdminToken(): boolean {
  return Boolean(getAdminToken());
}

export function setAdminToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      localStorage.setItem("c2c_admin_ok", "1");
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem("c2c_admin_ok");
    }
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem("c2c_admin_ok");
  } catch {}
  reconnectStream();
}

export function clearAdminToken(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem("c2c_admin_ok");
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem("c2c_admin_ok");
  } catch {}
  reconnectStream();
}

export function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const uToken = getUserToken();
  const aToken = getAdminToken();
  if (uToken) headers["x-user-token"] = uToken;
  if (aToken) headers["x-admin-token"] = aToken;
  return headers;
}

export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const incomingHeaders =
    options.headers && !(options.headers instanceof Headers) && !Array.isArray(options.headers)
      ? (options.headers as Record<string, string>)
      : {};
  return fetch(url, {
    ...options,
    headers: getAuthHeaders(incomingHeaders)
  });
}

type ListenerMap = {
  users: Set<(users: Record<string, User>) => void>;
  withdrawals: Set<(wds: Withdrawal[]) => void>;
  referrals: Set<(refs: Referral[]) => void>;
  config: Set<(cfg: Partial<AppConfig>) => void>;
  broadcasts: Set<(bcs: BroadcastCampaign[]) => void>;
  taskSubmissions: Set<(subs: TaskSubmission[]) => void>;
  userById: Map<string, Set<(u: Partial<User> | null) => void>>;
};

const listeners: ListenerMap = {
  users: new Set(),
  withdrawals: new Set(),
  referrals: new Set(),
  config: new Set(),
  broadcasts: new Set(),
  taskSubmissions: new Set(),
  userById: new Map()
};

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

let latestCache: {
  users: Record<string, User> | null;
  withdrawals: Withdrawal[] | null;
  referrals: Referral[] | null;
  config: Partial<AppConfig> | null;
  broadcasts: BroadcastCampaign[] | null;
  taskSubmissions: TaskSubmission[] | null;
} = {
  users: null,
  withdrawals: null,
  referrals: null,
  config: null,
  broadcasts: null,
  taskSubmissions: null
};

export function reconnectStream(): void {
  if (typeof window === "undefined") return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource) {
    try {
      eventSource.close();
    } catch {}
    eventSource = null;
  }
  latestCache = {
    users: null,
    withdrawals: null,
    referrals: null,
    config: null,
    broadcasts: null,
    taskSubmissions: null
  };
  ensureStreamConnected();
}

function buildStreamUrl(): string {
  const params = new URLSearchParams();
  const uToken = getUserToken();
  const aToken = getAdminToken();
  if (uToken) params.set("userToken", uToken);
  if (aToken) params.set("adminToken", aToken);
  const qs = params.toString();
  return qs ? `/api/rtdb/stream?${qs}` : "/api/rtdb/stream";
}

function ensureStreamConnected() {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;
  if (eventSource) return;

  try {
    const es = new EventSource(buildStreamUrl());
    eventSource = es;

    es.addEventListener("snapshot", (ev: MessageEvent) => {
      try {
        const snap = JSON.parse(ev.data || "{}");
        if (snap.users && typeof snap.users === "object") {
          latestCache.users = snap.users;
          listeners.users.forEach((fn) => fn(snap.users));
          listeners.userById.forEach((fns, tid) => {
            const u = snap.users[tid] ?? null;
            fns.forEach((fn) => fn(u));
          });
        }
        if (Array.isArray(snap.withdrawals)) {
          latestCache.withdrawals = snap.withdrawals;
          listeners.withdrawals.forEach((fn) => fn(snap.withdrawals));
        }
        if (Array.isArray(snap.referrals)) {
          latestCache.referrals = snap.referrals;
          listeners.referrals.forEach((fn) => fn(snap.referrals));
        }
        if (snap.config && typeof snap.config === "object") {
          latestCache.config = snap.config;
          listeners.config.forEach((fn) => fn(snap.config));
        }
        if (Array.isArray(snap.broadcasts)) {
          latestCache.broadcasts = snap.broadcasts;
          listeners.broadcasts.forEach((fn) => fn(snap.broadcasts));
        }
        if (Array.isArray(snap.taskSubmissions)) {
          latestCache.taskSubmissions = snap.taskSubmissions;
          listeners.taskSubmissions.forEach((fn) => fn(snap.taskSubmissions));
        }
      } catch {}
    });

    es.addEventListener("users", (ev: MessageEvent) => {
      try {
        const users = JSON.parse(ev.data || "{}");
        latestCache.users = users;
        listeners.users.forEach((fn) => fn(users));
        listeners.userById.forEach((fns, tid) => {
          const u = users[tid] ?? null;
          fns.forEach((fn) => fn(u));
        });
      } catch {}
    });

    es.addEventListener("withdrawals", (ev: MessageEvent) => {
      try {
        const list = JSON.parse(ev.data || "[]");
        latestCache.withdrawals = list;
        listeners.withdrawals.forEach((fn) => fn(list));
      } catch {}
    });

    es.addEventListener("referrals", (ev: MessageEvent) => {
      try {
        const list = JSON.parse(ev.data || "[]");
        latestCache.referrals = list;
        listeners.referrals.forEach((fn) => fn(list));
      } catch {}
    });

    es.addEventListener("config", (ev: MessageEvent) => {
      try {
        const cfg = JSON.parse(ev.data || "null");
        if (cfg && typeof cfg === "object") {
          latestCache.config = cfg;
          listeners.config.forEach((fn) => fn(cfg));
        }
      } catch {}
    });

    es.addEventListener("broadcasts", (ev: MessageEvent) => {
      try {
        const list = JSON.parse(ev.data || "[]");
        latestCache.broadcasts = list;
        listeners.broadcasts.forEach((fn) => fn(list));
      } catch {}
    });

    es.addEventListener("taskSubmissions", (ev: MessageEvent) => {
      try {
        const list = JSON.parse(ev.data || "[]");
        latestCache.taskSubmissions = list;
        listeners.taskSubmissions.forEach((fn) => fn(list));
      } catch {}
    });

    es.onerror = () => {
      es.close();
      eventSource = null;
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          ensureStreamConnected();
        }, 3000);
      }
    };
  } catch {
    eventSource = null;
  }
}

// ==========================================
// SERVER-AUTHORITATIVE AUTH & ACTION APIS
// ==========================================
export async function adminLoginApi(
  pin: string
): Promise<{ ok: boolean; adminToken?: string; error?: string }> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  });
  const data = await res.json().catch(() => ({ ok: false, error: "login_failed" }));
  if (data.ok && data.adminToken) {
    setAdminToken(data.adminToken);
  }
  return data;
}

export async function checkAdminSessionApi(): Promise<boolean> {
  if (!hasAdminToken()) return false;
  try {
    const res = await fetch("/api/admin/session", {
      headers: getAuthHeaders()
    });
    if (res.status === 401 || res.status === 403) {
      clearAdminToken();
      return false;
    }
    if (!res.ok) {
      return true;
    }
    const data = await res.json().catch(() => ({ ok: false }));
    if (data && data.error === "admin_unauthorized") {
      clearAdminToken();
      return false;
    }
    return Boolean(data.ok ?? true);
  } catch {
    return true;
  }
}

export async function changeAdminPinApi(
  currentPin: string,
  newPin: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/admin/change-pin", {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ currentPin, newPin })
  });
  return res.json().catch(() => ({ ok: false, error: "pin_change_failed" }));
}

export async function authSessionApi(payload: {
  initData?: string;
  telegramUser?: {
    id: number | string;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  };
  referredBy?: string | null;
}): Promise<{
  ok: boolean;
  user?: User;
  userToken?: string;
  isBrandNewUser?: boolean;
  welcomeDelivered?: boolean;
  error?: string;
}> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    if (res.status === 405 || res.status === 404) {
      return { ok: false, error: `api_${res.status}_no_backend` };
    }
    return { ok: false, error: "api_html_no_backend" };
  }
  const data = await res.json().catch(() => ({ ok: false, error: "auth_failed" }));
  if (data.ok && data.userToken) {
    setUserToken(data.userToken);
  }
  return data;
}

export async function retryWelcomeApi(): Promise<{
  ok: boolean;
  delivered?: boolean;
  user?: User;
}> {
  try {
    const res = await fetch("/api/user/retry-welcome", {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" })
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch {
    return { ok: false };
  }
}

export async function verifyChannelsApi(
  clickedIds: string[],
  isManualClick: boolean
): Promise<{
  ok: boolean;
  verified: boolean;
  joinedMap: Record<string, boolean>;
  missingNames: string[];
  adminNotice: string | null;
  error?: string;
}> {
  const res = await fetch("/api/verify-channels", {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ clickedIds, isManualClick })
  });
  return res.json().catch(() => ({
    ok: false,
    verified: false,
    joinedMap: {},
    missingNames: [],
    adminNotice: null,
    error: "verify_failed"
  }));
}

export async function earnAdApi(
  slotId: string
): Promise<{ ok: boolean; reward?: number; user?: User; log?: EarningLog; error?: string }> {
  const res = await fetch("/api/earn/ad", {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ slotId })
  });
  return res.json().catch(() => ({ ok: false, error: "ad_earn_error" }));
}

export async function earnVideoApi(
  videoId: string
): Promise<{ ok: boolean; reward?: number; user?: User; log?: EarningLog; error?: string }> {
  const res = await fetch("/api/earn/video", {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ videoId })
  });
  return res.json().catch(() => ({ ok: false, error: "video_earn_error" }));
}

export async function earnTaskApi(
  taskId: string
): Promise<{ ok: boolean; reward?: number; user?: User; log?: EarningLog; error?: string }> {
  const res = await fetch("/api/earn/task", {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ taskId })
  });
  return res.json().catch(() => ({ ok: false, error: "task_earn_error" }));
}

export async function requestWithdrawalApi(payload: {
  amount: number;
  account: string;
  method: string;
}): Promise<{ ok: boolean; withdrawal?: Withdrawal; user?: User; reason?: string; error?: string }> {
  const res = await fetch("/api/withdrawals/request", {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload)
  });
  return res.json().catch(() => ({ ok: false, reason: "network_error" }));
}

export async function submitTaskProofApi(payload: {
  taskId: string;
  screenshots: string[];
  note?: string;
}): Promise<{ ok: boolean; submission?: TaskSubmission; reason?: string; error?: string }> {
  const res = await fetch("/api/task-submissions", {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload)
  });
  return res.json().catch(() => ({ ok: false, reason: "network_error" }));
}

export async function updateUserProfileApi(
  patch: Partial<User>
): Promise<{ ok: boolean; user?: User; error?: string }> {
  const res = await fetch("/api/user/profile", {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch)
  });
  return res.json().catch(() => ({ ok: false, error: "profile_update_failed" }));
}

export async function reviewWithdrawalApi(
  id: string,
  body: { status: Withdrawal["status"]; amount?: number; account?: string; method?: string }
): Promise<{ ok: boolean; withdrawal?: Withdrawal; user?: User; error?: string }> {
  const res = await fetch(`/api/admin/withdrawals/${encodeURIComponent(id)}/review`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });
  return res.json().catch(() => ({ ok: false, error: "review_failed" }));
}

export async function reviewTaskSubmissionApi(
  id: string,
  decision: "approved" | "rejected",
  rejectReason?: string
): Promise<{ ok: boolean; submission?: TaskSubmission; user?: User | null; error?: string }> {
  const res = await fetch(`/api/admin/task-submissions/${encodeURIComponent(id)}/review`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ decision, rejectReason })
  });
  return res.json().catch(() => ({ ok: false, error: "task_review_failed" }));
}

// ==========================================
// SECURE RTDB PROXY HELPERS
// ==========================================
export async function syncUserToFirebase(user: User): Promise<void> {
  if (!user || !user.telegramId) return;
  const tid = String(user.telegramId);
  const dataToSave = {
    telegramId: tid,
    username: user.username || "",
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    photoUrl: user.photoUrl || "",
    bio: user.bio || "",
    balance: Number(user.balance) || 0,
    lifetimeEarned: Number(user.lifetimeEarned) || 0,
    todayEarned: Number(user.todayEarned) || 0,
    todayDate: user.todayDate || "",
    adsWatchedToday: Number(user.adsWatchedToday) || 0,
    adHourlyCounts: user.adHourlyCounts || {},
    referralCount: Number(user.referralCount) || 0,
    level2Count: Number(user.level2Count) || 0,
    referralEarned: Number(user.referralEarned) || 0,
    referredBy: user.referredBy || null,
    binanceId: user.binanceId || "",
    following: Array.isArray(user.following) ? user.following : [],
    watchedVideos: user.watchedVideos || {},
    verified: Boolean(user.verified),
    banned: Boolean(user.banned),
    welcomeSent: Boolean(user.welcomeSent),
    createdAt: user.createdAt || new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    updatedAt: Date.now()
  };

  try {
    await fetch(`/api/rtdb/users/${encodeURIComponent(tid)}`, {
      method: "PUT",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(dataToSave)
    });
  } catch (err) {
    console.warn("[SecureDB] syncUserToFirebase error:", err);
  }
}

export async function patchUserInFirebase(
  telegramId: string,
  patch: Partial<User>
): Promise<void> {
  if (!telegramId) return;
  try {
    await fetch(`/api/rtdb/users/${encodeURIComponent(telegramId)}`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch)
    });
  } catch (err) {
    console.warn("[SecureDB] patchUserInFirebase error:", err);
  }
}

export async function markVideoWatchedInFirebase(
  telegramId: string,
  videoId: string
): Promise<void> {
  if (!telegramId || !videoId) return;
  try {
    await fetch(`/api/rtdb/users/${encodeURIComponent(telegramId)}`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ watchedVideoId: videoId })
    });
  } catch (err) {
    console.warn("[SecureDB] markVideoWatchedInFirebase error:", err);
  }
}

export async function syncLogToFirebase(log: EarningLog): Promise<void> {
  if (!log || !log.id) return;
  try {
    await fetch(`/api/rtdb/logs/${encodeURIComponent(log.id)}`, {
      method: "PUT",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(log)
    });
  } catch {}
}

export async function updateUserProfileLogin(user: User): Promise<void> {
  if (!user || !user.telegramId) return;
  try {
    await fetch(`/api/rtdb/users/${encodeURIComponent(user.telegramId)}`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        photoUrl: user.photoUrl || ""
      })
    });
  } catch (err) {
    console.warn("[SecureDB] updateUserProfileLogin error:", err);
  }
}

export async function fetchUserFromFirebase(telegramId: string): Promise<User | null> {
  if (!telegramId) return null;
  try {
    const res = await fetch(`/api/rtdb/users/${encodeURIComponent(telegramId)}`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.user && data.user.telegramId) {
        return data.user as User;
      }
    }
  } catch (err) {
    console.warn("[SecureDB] fetchUserFromFirebase error:", err);
  }
  return null;
}

export async function fetchAllUsers(): Promise<Record<string, User>> {
  try {
    const res = await fetch("/api/rtdb/users", {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.users && typeof data.users === "object") {
        return data.users as Record<string, User>;
      }
    }
  } catch (err) {
    console.warn("[SecureDB] fetchAllUsers error:", err);
  }
  return {};
}

export function subscribeAllUsers(
  onUsers: (users: Record<string, User>) => void
): () => void {
  listeners.users.add(onUsers);
  ensureStreamConnected();
  if (latestCache.users) {
    onUsers(latestCache.users);
  } else {
    fetchAllUsers().then((users) => {
      if (listeners.users.has(onUsers)) {
        latestCache.users = users;
        onUsers(users);
      }
    });
  }
  return () => {
    listeners.users.delete(onUsers);
  };
}

export function subscribeToFirebaseUser(
  telegramId: string,
  onUpdate: (remoteUser: Partial<User> | null) => void
): () => void {
  if (!telegramId) return () => {};
  let setForUser = listeners.userById.get(telegramId);
  if (!setForUser) {
    setForUser = new Set();
    listeners.userById.set(telegramId, setForUser);
  }
  setForUser.add(onUpdate);
  ensureStreamConnected();

  if (latestCache.users && latestCache.users[telegramId]) {
    onUpdate(latestCache.users[telegramId]);
  } else {
    fetchUserFromFirebase(telegramId).then((u) => {
      if (setForUser?.has(onUpdate)) {
        onUpdate(u);
      }
    });
  }

  return () => {
    const s = listeners.userById.get(telegramId);
    if (s) {
      s.delete(onUpdate);
      if (s.size === 0) listeners.userById.delete(telegramId);
    }
  };
}

export async function deleteUserFromFirebase(telegramId: string): Promise<boolean> {
  if (!telegramId) return false;
  try {
    const res = await fetch(`/api/rtdb/users/${encodeURIComponent(telegramId)}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    const data = await res.json().catch(() => ({}));
    return Boolean(data.ok);
  } catch (err) {
    console.warn("[SecureDB] deleteUserFromFirebase error:", err);
    return false;
  }
}

export async function deleteWithdrawalFromFirebase(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const res = await fetch(`/api/rtdb/withdrawals/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    const data = await res.json().catch(() => ({}));
    return Boolean(data.ok);
  } catch (err) {
    console.warn("[SecureDB] deleteWithdrawalFromFirebase error:", err);
    return false;
  }
}

export async function syncWithdrawalToFirebase(wd: Withdrawal): Promise<void> {
  if (!wd || !wd.id) return;
  try {
    await fetch(`/api/rtdb/withdrawals/${encodeURIComponent(wd.id)}`, {
      method: "PUT",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(wd)
    });
  } catch (err) {
    console.warn("[SecureDB] syncWithdrawalToFirebase error:", err);
  }
}

export function subscribeAllWithdrawals(
  onWithdrawals: (wds: Withdrawal[]) => void
): () => void {
  listeners.withdrawals.add(onWithdrawals);
  ensureStreamConnected();
  if (latestCache.withdrawals) {
    onWithdrawals(latestCache.withdrawals);
  } else {
    fetch("/api/rtdb/withdrawals", { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.withdrawals) && listeners.withdrawals.has(onWithdrawals)) {
          latestCache.withdrawals = d.withdrawals;
          onWithdrawals(d.withdrawals);
        }
      })
      .catch(() => {});
  }
  return () => {
    listeners.withdrawals.delete(onWithdrawals);
  };
}

export async function syncReferralToFirebase(refItem: Referral): Promise<void> {
  if (!refItem || !refItem.id) return;
  try {
    await fetch(`/api/rtdb/referrals/${encodeURIComponent(refItem.id)}`, {
      method: "PUT",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(refItem)
    });
  } catch (err) {
    console.warn("[SecureDB] syncReferralToFirebase error:", err);
  }
}

export function subscribeAllReferrals(
  onRefs: (refs: Referral[]) => void
): () => void {
  listeners.referrals.add(onRefs);
  ensureStreamConnected();
  if (latestCache.referrals) {
    onRefs(latestCache.referrals);
  } else {
    fetch("/api/rtdb/referrals", { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.referrals) && listeners.referrals.has(onRefs)) {
          latestCache.referrals = d.referrals;
          onRefs(d.referrals);
        }
      })
      .catch(() => {});
  }
  return () => {
    listeners.referrals.delete(onRefs);
  };
}

export async function syncConfigToFirebase(config: AppConfig): Promise<void> {
  try {
    await fetch("/api/rtdb/config", {
      method: "PUT",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(config)
    });
  } catch (err) {
    console.warn("[SecureDB] syncConfigToFirebase error:", err);
  }
}

export function subscribeConfig(
  onConfig: (cfg: Partial<AppConfig>) => void
): () => void {
  listeners.config.add(onConfig);
  ensureStreamConnected();
  if (latestCache.config) {
    onConfig(latestCache.config);
  } else {
    fetch("/api/rtdb/config", { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (d?.config && typeof d.config === "object" && listeners.config.has(onConfig)) {
          latestCache.config = d.config;
          onConfig(d.config);
        }
      })
      .catch(() => {});
  }
  return () => {
    listeners.config.delete(onConfig);
  };
}

export async function syncBroadcastToFirebase(campaign: BroadcastCampaign): Promise<void> {
  if (!campaign || !campaign.id) return;
  try {
    await fetch(`/api/rtdb/broadcasts/${encodeURIComponent(campaign.id)}`, {
      method: "PUT",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(campaign)
    });
  } catch (err) {
    console.warn("[SecureDB] syncBroadcastToFirebase error:", err);
  }
}

export function subscribeAllBroadcasts(
  onBroadcasts: (bcs: BroadcastCampaign[]) => void
): () => void {
  listeners.broadcasts.add(onBroadcasts);
  ensureStreamConnected();
  if (latestCache.broadcasts) {
    onBroadcasts(latestCache.broadcasts);
  } else {
    fetch("/api/rtdb/broadcasts", { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.broadcasts) && listeners.broadcasts.has(onBroadcasts)) {
          latestCache.broadcasts = d.broadcasts;
          onBroadcasts(d.broadcasts);
        }
      })
      .catch(() => {});
  }
  return () => {
    listeners.broadcasts.delete(onBroadcasts);
  };
}

export async function deleteBroadcastFromFirebase(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const res = await fetch(`/api/rtdb/broadcasts/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    const data = await res.json().catch(() => ({}));
    return Boolean(data.ok);
  } catch (err) {
    console.warn("[SecureDB] deleteBroadcastFromFirebase error:", err);
    return false;
  }
}

export async function syncTaskSubmissionToFirebase(sub: TaskSubmission): Promise<void> {
  if (!sub || !sub.id) return;
  try {
    await fetch(`/api/rtdb/task-submissions/${encodeURIComponent(sub.id)}`, {
      method: "PUT",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(sub)
    });
  } catch (err) {
    console.warn("[SecureDB] syncTaskSubmissionToFirebase error:", err);
  }
}

export function subscribeAllTaskSubmissions(
  onSubmissions: (subs: TaskSubmission[]) => void
): () => void {
  listeners.taskSubmissions.add(onSubmissions);
  ensureStreamConnected();
  if (latestCache.taskSubmissions) {
    onSubmissions(latestCache.taskSubmissions);
  } else {
    fetch("/api/rtdb/task-submissions", { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.taskSubmissions) && listeners.taskSubmissions.has(onSubmissions)) {
          latestCache.taskSubmissions = d.taskSubmissions;
          onSubmissions(d.taskSubmissions);
        }
      })
      .catch(() => {});
  }
  return () => {
    listeners.taskSubmissions.delete(onSubmissions);
  };
}

export async function deleteTaskSubmissionFromFirebase(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const res = await fetch(`/api/rtdb/task-submissions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    const data = await res.json().catch(() => ({}));
    return Boolean(data.ok);
  } catch (err) {
    console.warn("[SecureDB] deleteTaskSubmissionFromFirebase error:", err);
    return false;
  }
}
