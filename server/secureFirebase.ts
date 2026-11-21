import crypto from "crypto";
import https from "https";
import type { Response } from "express";

interface EncryptedEnvelope {
  __enc: 1;
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  ct: string;
}

function getDatabaseUrl(): string {
  const raw = (process.env.FIREBASE_DATABASE_URL || "").trim().replace(/\/+$/, "");
  if (!raw) {
    throw new Error("[Security] FIREBASE_DATABASE_URL is not configured in environment.");
  }
  return raw;
}

let cachedDerivedKey: Buffer | null = null;
function getEncryptionKey(): Buffer {
  if (cachedDerivedKey) return cachedDerivedKey;
  const rawSecret = (process.env.DATA_ENCRYPTION_KEY || "").trim();
  if (!rawSecret) {
    throw new Error("[Security] DATA_ENCRYPTION_KEY is not configured in environment.");
  }
  if (/^[0-9a-fA-F]{64}$/.test(rawSecret)) {
    cachedDerivedKey = Buffer.from(rawSecret, "hex");
  } else {
    cachedDerivedKey = crypto.createHash("sha256").update(rawSecret, "utf8").digest();
  }
  return cachedDerivedKey;
}

export function getTokenSigningKey(): Buffer {
  const encRaw = (process.env.DATA_ENCRYPTION_KEY || "").trim();
  const botRaw = (process.env.BOT_TOKEN || "").trim();
  const baseSecret = encRaw || botRaw;
  if (!baseSecret) {
    throw new Error("[Security] DATA_ENCRYPTION_KEY or BOT_TOKEN must be configured for token signing.");
  }
  return crypto.createHmac("sha256", baseSecret).update("nadag88-token-signing-v1").digest();
}

function isEncryptedEnvelope(val: unknown): val is EncryptedEnvelope {
  if (!val || typeof val !== "object") return false;
  const rec = val as Record<string, unknown>;
  return (
    rec.__enc === 1 &&
    rec.alg === "aes-256-gcm" &&
    typeof rec.iv === "string" &&
    typeof rec.tag === "string" &&
    typeof rec.ct === "string"
  );
}

export function encryptData(plain: unknown): EncryptedEnvelope {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const serialized = JSON.stringify(plain ?? null);
  const encrypted = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    __enc: 1,
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: encrypted.toString("base64"),
  };
}

export function decryptData<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (!isEncryptedEnvelope(raw)) {
    return raw as T;
  }
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(raw.iv, "base64");
    const tag = Buffer.from(raw.tag, "base64");
    const ct = Buffer.from(raw.ct, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    return JSON.parse(decrypted) as T;
  } catch (err) {
    console.warn("[Security] Failed to decrypt Firebase record:", (err as Error)?.message || err);
    return null;
  }
}

function sanitizeEndpoint(endpoint: string): string {
  return String(endpoint || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\.json$/i, "")
    .replace(/[^a-zA-Z0-9/_-]/g, "");
}

function rtdbRequest(method: "GET" | "PUT" | "DELETE", endpoint: string, body?: unknown): Promise<any> {
  return new Promise((resolve) => {
    let baseUrl = "";
    try {
      baseUrl = getDatabaseUrl();
    } catch (err) {
      console.warn((err as Error).message);
      resolve(null);
      return;
    }

    const cleanPath = sanitizeEndpoint(endpoint);
    const url = `${baseUrl}/${cleanPath}.json`;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;

    const req = https.request(
      url,
      {
        method,
        headers: payload !== undefined
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload, "utf8"),
            }
          : undefined,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (method === "DELETE") {
            resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 300);
            return;
          }
          if (method === "PUT") {
            resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 300);
            return;
          }
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on("error", () => resolve(method === "GET" ? null : false));
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

const COLLECTION_NAMES = new Set([
  "users",
  "withdrawals",
  "referrals",
  "broadcasts",
  "taskSubmissions",
  "logs",
]);

/**
 * Fetch and decrypt either a single encrypted record (e.g. "users/123", "config")
 * or a collection of encrypted records (e.g. "users", "withdrawals").
 */
export async function fetchFirebase<T = any>(endpoint: string): Promise<T | null> {
  const clean = sanitizeEndpoint(endpoint);
  if (!clean) return null;

  const raw = await rtdbRequest("GET", clean);
  if (raw === null || raw === undefined) return null;

  if (COLLECTION_NAMES.has(clean) && typeof raw === "object" && !isEncryptedEnvelope(raw)) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const dec = decryptData(v);
      if (dec !== null) {
        out[k] = dec;
      }
    }
    return out as T;
  }

  return decryptData<T>(raw);
}

/**
 * Encrypt and write a record to Firebase RTDB.
 * Note: Never write directly to subfields of an encrypted record; use patchFirebaseItem instead.
 */
export async function putFirebase(endpoint: string, data: unknown): Promise<boolean> {
  const clean = sanitizeEndpoint(endpoint);
  if (!clean) return false;
  const encrypted = encryptData(data);
  const ok = Boolean(await rtdbRequest("PUT", clean, encrypted));
  if (ok) {
    refreshCollectionFromPath(clean, data).catch(() => {});
  }
  return ok;
}

/**
 * Safely read-decrypt-merge-encrypt-write a single record (e.g. "users/123").
 */
export async function patchFirebaseItem<T extends Record<string, any>>(
  endpoint: string,
  patch: Partial<T>
): Promise<T | null> {
  const clean = sanitizeEndpoint(endpoint);
  if (!clean) return null;
  const existing = (await fetchFirebase<T>(clean)) || ({} as T);
  const merged = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  } as T;
  const ok = await putFirebase(clean, merged);
  return ok ? merged : null;
}

export async function deleteFirebase(endpoint: string): Promise<boolean> {
  const clean = sanitizeEndpoint(endpoint);
  if (!clean) return false;
  const ok = Boolean(await rtdbRequest("DELETE", clean));
  if (ok) {
    removeCollectionItemFromCache(clean);
  }
  return ok;
}

// ==========================================
// Public Sanitization Helpers
// ==========================================
export function sanitizePublicConfig(cfg: Record<string, any> | null): Record<string, any> | null {
  if (!cfg || typeof cfg !== "object") return cfg;
  const copy = { ...cfg };
  delete copy.botToken;
  delete copy.imgbbApiKey;
  delete copy.adminPassword;
  delete copy.adminPinHash;
  return copy;
}

export function sanitizePublicUser(u: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!u || typeof u !== "object" || !u.telegramId) return null;
  return {
    telegramId: String(u.telegramId),
    username: u.username || "",
    firstName: u.firstName || "User",
    lastName: u.lastName || "",
    photoUrl: u.photoUrl || "",
    bio: u.bio || "",
    balance: Number(u.balance) || 0,
    lifetimeEarned: Number(u.lifetimeEarned) || 0,
    todayEarned: Number(u.todayEarned) || 0,
    todayDate: u.todayDate || "",
    adsWatchedToday: Number(u.adsWatchedToday) || 0,
    referralCount: Number(u.referralCount) || 0,
    level2Count: Number(u.level2Count) || 0,
    referralEarned: Number(u.referralEarned) || 0,
    referredBy: u.referredBy || null,
    following: Array.isArray(u.following) ? u.following : [],
    verified: Boolean(u.verified),
    banned: Boolean(u.banned),
    createdAt: u.createdAt || "",
    lastLogin: u.lastLogin || "",
    updatedAt: u.updatedAt || 0,
  };
}

export function sanitizeUsersMapForCaller(
  usersMap: Record<string, any>,
  auth: { isAdmin: boolean; userTid: string | null }
): Record<string, any> {
  if (auth.isAdmin) {
    return usersMap || {};
  }
  const out: Record<string, any> = {};
  for (const [uid, raw] of Object.entries(usersMap || {})) {
    if (auth.userTid && uid === auth.userTid) {
      out[uid] = raw;
    } else {
      const pub = sanitizePublicUser(raw);
      if (pub) out[uid] = pub;
    }
  }
  return out;
}

// ==========================================
// Real-time Server Cache & Role-Filtered SSE Stream
// ==========================================
interface RtdbCache {
  users: Record<string, any>;
  withdrawals: Record<string, any>;
  referrals: Record<string, any>;
  broadcasts: Record<string, any>;
  taskSubmissions: Record<string, any>;
  config: Record<string, any> | null;
}

const cache: RtdbCache = {
  users: {},
  withdrawals: {},
  referrals: {},
  broadcasts: {},
  taskSubmissions: {},
  config: null,
};

export interface SseClientAuth {
  isAdmin: boolean;
  userTid: string | null;
}

const sseClients = new Map<Response, SseClientAuth>();

function sendSsePayload(res: Response, event: string, data: unknown) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    sseClients.delete(res);
  }
}

function broadcastUsersFiltered(changedTid?: string) {
  if (sseClients.size === 0) return;
  for (const [res, auth] of sseClients.entries()) {
    sendSsePayload(res, "users", sanitizeUsersMapForCaller(cache.users, auth));
    if (changedTid && (auth.isAdmin || auth.userTid === changedTid)) {
      sendSsePayload(res, `user:${changedTid}`, cache.users[changedTid] ?? null);
    }
  }
}

function broadcastCollectionFiltered(
  collection: "withdrawals" | "referrals" | "broadcasts" | "taskSubmissions"
) {
  if (sseClients.size === 0) return;
  const fullSorted = toSortedArray(collection, cache[collection]);

  for (const [res, auth] of sseClients.entries()) {
    if (auth.isAdmin) {
      sendSsePayload(res, collection, fullSorted);
      continue;
    }

    if (collection === "broadcasts") {
      // Broadcast campaign histories & targetUserIds are strictly admin-only
      continue;
    }

    if (!auth.userTid) {
      sendSsePayload(res, collection, []);
      continue;
    }

    const tid = auth.userTid;
    const scoped =
      collection === "referrals"
        ? fullSorted.filter(
            (r) => r?.referrerTelegramId === tid || r?.referredTelegramId === tid
          )
        : fullSorted.filter((item) => item?.telegramId === tid);

    sendSsePayload(res, collection, scoped);
  }
}

function broadcastConfigToAll() {
  if (sseClients.size === 0) return;
  const safeCfg = sanitizePublicConfig(cache.config);
  for (const [res] of sseClients.entries()) {
    sendSsePayload(res, "config", safeCfg);
  }
}

async function refreshCollectionFromPath(cleanPath: string, data: unknown) {
  const parts = cleanPath.split("/");
  const root = parts[0];
  const id = parts[1];

  if (root === "config") {
    cache.config =
      data && typeof data === "object" ? { ...(data as Record<string, any>) } : null;
    broadcastConfigToAll();
    return;
  }

  if (
    id &&
    (root === "users" ||
      root === "withdrawals" ||
      root === "referrals" ||
      root === "broadcasts" ||
      root === "taskSubmissions")
  ) {
    cache[root][id] = data;
    if (root === "users") {
      broadcastUsersFiltered(id);
    } else {
      broadcastCollectionFiltered(root);
    }
  }
}

function removeCollectionItemFromCache(cleanPath: string) {
  const parts = cleanPath.split("/");
  const root = parts[0];
  const id = parts[1];
  if (
    id &&
    (root === "users" ||
      root === "withdrawals" ||
      root === "referrals" ||
      root === "broadcasts" ||
      root === "taskSubmissions")
  ) {
    delete cache[root][id];
    if (root === "users") {
      broadcastUsersFiltered(id);
    } else {
      broadcastCollectionFiltered(root);
    }
  }
}

export function toSortedArray(
  collection: "withdrawals" | "referrals" | "broadcasts" | "taskSubmissions",
  map: Record<string, any>
): any[] {
  const list = Object.values(map || {});
  if (collection === "broadcasts") {
    list.sort((a, b) => (Number(b?.serialNumber) || 0) - (Number(a?.serialNumber) || 0));
  } else {
    list.sort(
      (a, b) =>
        new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime()
    );
  }
  return list;
}

let syncInFlight = false;
export async function syncRtdbCache(): Promise<void> {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const [users, withdrawals, referrals, broadcasts, taskSubmissions, config] =
      await Promise.all([
        fetchFirebase<Record<string, any>>("users"),
        fetchFirebase<Record<string, any>>("withdrawals"),
        fetchFirebase<Record<string, any>>("referrals"),
        fetchFirebase<Record<string, any>>("broadcasts"),
        fetchFirebase<Record<string, any>>("taskSubmissions"),
        fetchFirebase<Record<string, any>>("config"),
      ]);

    const nextUsers = users || {};
    const nextWds = withdrawals || {};
    const nextRefs = referrals || {};
    const nextBcs = broadcasts || {};
    const nextSubs = taskSubmissions || {};
    const nextCfg = config || null;

    if (JSON.stringify(cache.users) !== JSON.stringify(nextUsers)) {
      cache.users = nextUsers;
      broadcastUsersFiltered();
    }
    if (JSON.stringify(cache.withdrawals) !== JSON.stringify(nextWds)) {
      cache.withdrawals = nextWds;
      broadcastCollectionFiltered("withdrawals");
    }
    if (JSON.stringify(cache.referrals) !== JSON.stringify(nextRefs)) {
      cache.referrals = nextRefs;
      broadcastCollectionFiltered("referrals");
    }
    if (JSON.stringify(cache.broadcasts) !== JSON.stringify(nextBcs)) {
      cache.broadcasts = nextBcs;
      broadcastCollectionFiltered("broadcasts");
    }
    if (JSON.stringify(cache.taskSubmissions) !== JSON.stringify(nextSubs)) {
      cache.taskSubmissions = nextSubs;
      broadcastCollectionFiltered("taskSubmissions");
    }
    if (JSON.stringify(cache.config) !== JSON.stringify(nextCfg)) {
      cache.config = nextCfg;
      broadcastConfigToAll();
    }
  } catch (err) {
    console.warn("[SecureFirebase] Cache sync warning:", (err as Error)?.message || err);
  } finally {
    syncInFlight = false;
  }
}

export function getCachedSnapshot(
  auth: SseClientAuth = { isAdmin: false, userTid: null },
  extraConfig?: Record<string, any>
) {
  const allWds = toSortedArray("withdrawals", cache.withdrawals);
  const allRefs = toSortedArray("referrals", cache.referrals);
  const allSubs = toSortedArray("taskSubmissions", cache.taskSubmissions);
  const allBcs = toSortedArray("broadcasts", cache.broadcasts);
  const baseCfg = sanitizePublicConfig(cache.config) || {};
  const mergedCfg = extraConfig ? { ...baseCfg, ...extraConfig } : sanitizePublicConfig(cache.config);

  const tid = auth.userTid;
  return {
    users: sanitizeUsersMapForCaller(cache.users, auth),
    withdrawals: auth.isAdmin
      ? allWds
      : tid
      ? allWds.filter((w) => w?.telegramId === tid)
      : [],
    referrals: auth.isAdmin
      ? allRefs
      : tid
      ? allRefs.filter(
          (r) => r?.referrerTelegramId === tid || r?.referredTelegramId === tid
        )
      : [],
    broadcasts: auth.isAdmin ? allBcs : [],
    taskSubmissions: auth.isAdmin
      ? allSubs
      : tid
      ? allSubs.filter((s) => s?.telegramId === tid)
      : [],
    config: mergedCfg,
  };
}

export function getRawServerConfig(): Record<string, any> | null {
  return cache.config;
}

export function registerSseClient(
  res: Response,
  auth: SseClientAuth = { isAdmin: false, userTid: null },
  extraConfig?: Record<string, any>
): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  sseClients.set(res, auth);

  const snap = getCachedSnapshot(auth, extraConfig);
  sendSsePayload(res, "snapshot", snap);

  const keepAlive = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 20000);

  res.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
}

let pollingStarted = false;
export function startSecureRtdbSyncLoop(): void {
  if (pollingStarted) return;
  pollingStarted = true;
  syncRtdbCache().catch(() => {});
  setInterval(() => {
    syncRtdbCache().catch(() => {});
  }, 4000);
}
