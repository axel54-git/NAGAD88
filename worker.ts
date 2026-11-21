// Cloudflare Workers Full-Stack API & Telegram Bot Backend
// Uses standard Web Crypto (AES-256-GCM + HMAC-SHA256) 100% binary-compatible with server/secureFirebase.ts

export interface WorkerEnv {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  BOT_TOKEN?: string;
  BOT_USERNAME?: string;
  APP_NAME?: string;
  MINI_APP_URL?: string;
  DATA_ENCRYPTION_KEY?: string;
  FIREBASE_DATABASE_URL?: string;
  IMGBB_API_KEY?: string;
}

interface WorkerCtx {
  waitUntil: (promise: Promise<unknown>) => void;
}

interface EncryptedEnvelope {
  __enc: 1;
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  ct: string;
}

interface AuthTokenPayload {
  role: "admin" | "user";
  tid?: string;
  exp: number;
}

const DEFAULT_MINI_APP_URL = "https://nagad88.apk5y.workers.dev/";
const DEFAULT_ADMIN_PIN_HASH = "48e6f958531e543731746fd0a4fcba173e2ae226d60eb19a5d021be3c29f7a3e";

const SERVER_DEFAULT_CHANNELS = [
  { id: "main", name: "Main", tag: "Channel", username: "ManiShop_Community", url: "https://t.me/ManiShop_Community" },
  { id: "payment", name: "Payment", tag: "Channel", username: "Earning_Money_Lob", url: "https://t.me/Earning_Money_Lob" }
];
const SERVER_DEFAULT_AD_SLOTS = [
  { id: "slot1", title: "AD SLOT 1", zone: "10635966", reward: 0.05 },
  { id: "slot2", title: "AD SLOT 2", zone: "10635966", reward: 0.05 }
];
const SERVER_DEFAULT_TASKS = [
  { id: "t1", title: "Video watch 1", url: "https://ads.ziniyaapu7.workers.dev/", reward: 0.05, minSeconds: 60, maxMinutes: 5 },
  { id: "t2", title: "Video track 2", url: "https://ads.ziniyaapu7.workers.dev/", reward: 0.05, minSeconds: 60, maxMinutes: 5 },
  { id: "t3", title: "Video tax 3", url: "https://ads.ziniyaapu7.workers.dev/", reward: 0.05, minSeconds: 60, maxMinutes: 5 },
  { id: "t4", title: "Special task 4", url: "https://ads.ziniyaapu7.workers.dev/", reward: 0.05, minSeconds: 60, maxMinutes: 5 }
];
const SERVER_DEFAULT_TASK_POSTS = [
  { id: "tp_1", title: "একাউন্ট করুন & অ্যাপ ডাউনলোড টাস্ক", reward: 0.50, requiredScreenshots: 1, maxCompletions: 1, active: true },
  { id: "tp_2", title: "সাইন আপ ও ভেরিফিকেশন স্পেশাল টাস্ক", reward: 0.35, requiredScreenshots: 1, maxCompletions: 1, active: true }
];
const SERVER_DEFAULT_VIDEOS = [
  { id: "v1", title: "ভূতনীকে দিয়ে গোপাল দাদা বানালেন সুস্বাদু খাবার—গোপাল ভাঁড়", reward: 0.10, minWatchSeconds: 60 },
  { id: "v2", title: "বৃষ্টির দিনে বাজারে গোপাল ভাঁড় সবাইকে বোকা বানাইলো", reward: 0.08, minWatchSeconds: 60 },
  { id: "v3", title: 'রংবাজ "Rongbaaz" | Full Movie / Natok', reward: 0.15, minWatchSeconds: 60 },
  { id: "v4", title: "মুদি দোকান দিয়ে কি লাল হতে চান? জেনে নিন গোপন টেকনিক", reward: 0.05, minWatchSeconds: 60 },
  { id: "v5", title: "মায়াপুরী পর্বতের রহস্য | Gopal Bhar Animation Episode", reward: 0.10, minWatchSeconds: 60 },
  { id: "v6", title: "Ek Rash Nil | এক রাশ নীল | রোমান্টিক নাটক", reward: 0.12, minWatchSeconds: 60 }
];

const COLLECTION_NAMES = new Set(["users", "withdrawals", "referrals", "broadcasts", "taskSubmissions", "logs"]);
const SENSITIVE_USER_FIELDS = ["binanceId", "adHourlyCounts", "watchedVideos", "lastAdClaimAt", "lastTaskClaimAt", "lastLogin", "updatedAt"];
const ADMIN_ONLY_USER_FIELDS = ["welcomeSent"];

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(b64u: string): Uint8Array {
  const pad = b64u.length % 4 === 0 ? "" : "=".repeat(4 - (b64u.length % 4));
  return base64ToBytes(b64u.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Raw(keyBytes: Uint8Array, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return new Uint8Array(sig);
}

async function getAesKey(env: WorkerEnv): Promise<CryptoKey> {
  const rawSecret = (env.DATA_ENCRYPTION_KEY || "").trim();
  if (!rawSecret) throw new Error("server_env_missing:DATA_ENCRYPTION_KEY");
  let keyBytes: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(rawSecret)) {
    keyBytes = hexToBytes(rawSecret);
  } else {
    keyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(rawSecret)));
  }
  return crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function getTokenSigningKeyBytes(env: WorkerEnv): Promise<Uint8Array> {
  const baseSecret = (env.DATA_ENCRYPTION_KEY || "").trim() || (env.BOT_TOKEN || "").trim();
  if (!baseSecret) throw new Error("server_env_missing:DATA_ENCRYPTION_KEY");
  return hmacSha256Raw(enc.encode(baseSecret), "nadag88-token-signing-v1");
}

function isEncryptedEnvelope(val: unknown): val is EncryptedEnvelope {
  if (!val || typeof val !== "object") return false;
  const r = val as Record<string, unknown>;
  return r.__enc === 1 && r.alg === "aes-256-gcm" && typeof r.iv === "string" && typeof r.tag === "string" && typeof r.ct === "string";
}

async function encryptData(env: WorkerEnv, plain: unknown): Promise<EncryptedEnvelope> {
  const key = await getAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const serialized = enc.encode(JSON.stringify(plain ?? null));
  const buf = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, serialized));
  const ct = buf.slice(0, buf.length - 16);
  const tag = buf.slice(buf.length - 16);
  return {
    __enc: 1,
    v: 1,
    alg: "aes-256-gcm",
    iv: bytesToBase64(iv),
    tag: bytesToBase64(tag),
    ct: bytesToBase64(ct)
  };
}

async function decryptData<T>(env: WorkerEnv, raw: unknown): Promise<T | null> {
  if (raw === null || raw === undefined) return null;
  if (!isEncryptedEnvelope(raw)) return raw as T;
  try {
    const key = await getAesKey(env);
    const iv = base64ToBytes(raw.iv);
    const ct = base64ToBytes(raw.ct);
    const tag = base64ToBytes(raw.tag);
    const combined = new Uint8Array(ct.length + tag.length);
    combined.set(ct, 0);
    combined.set(tag, ct.length);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 }, key, combined as BufferSource);
    return JSON.parse(dec.decode(decrypted)) as T;
  } catch {
    return null;
  }
}

function sanitizeEndpoint(endpoint: string): string {
  return String(endpoint || "").trim().replace(/^\/+/, "").replace(/\.json$/i, "").replace(/[^a-zA-Z0-9/_-]/g, "");
}

function getDbUrl(env: WorkerEnv): string {
  const u = (env.FIREBASE_DATABASE_URL || "").trim().replace(/\/+$/, "");
  if (!u) throw new Error("server_env_missing:FIREBASE_DATABASE_URL");
  return u;
}

async function rtdbRequest(env: WorkerEnv, method: "GET" | "PUT" | "DELETE", endpoint: string, body?: unknown): Promise<any> {
  const baseUrl = getDbUrl(env);
  const clean = sanitizeEndpoint(endpoint);
  const url = `${baseUrl}/${clean}.json`;
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (method === "DELETE" || method === "PUT") return res.ok;
  if (!res.ok) return null;
  const txt = await res.text();
  try {
    return txt ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
}

async function fetchFirebase<T = any>(env: WorkerEnv, endpoint: string): Promise<T | null> {
  const clean = sanitizeEndpoint(endpoint);
  if (!clean) return null;
  const raw = await rtdbRequest(env, "GET", clean);
  if (raw === null || raw === undefined) return null;
  if (COLLECTION_NAMES.has(clean) && typeof raw === "object" && !isEncryptedEnvelope(raw)) {
    const entries = await Promise.all(
      Object.entries(raw as Record<string, unknown>).map(async ([k, v]) => [k, await decryptData(env, v)] as const)
    );
    const out: Record<string, any> = {};
    for (const [k, v] of entries) {
      if (v !== null) out[k] = v;
    }
    return out as T;
  }
  return decryptData<T>(env, raw);
}

async function putFirebase(env: WorkerEnv, endpoint: string, data: unknown): Promise<boolean> {
  const clean = sanitizeEndpoint(endpoint);
  if (!clean) return false;
  const encrypted = await encryptData(env, data);
  return Boolean(await rtdbRequest(env, "PUT", clean, encrypted));
}

async function patchFirebaseItem<T extends Record<string, any>>(env: WorkerEnv, endpoint: string, patch: Partial<T>): Promise<T | null> {
  const clean = sanitizeEndpoint(endpoint);
  if (!clean) return null;
  const existing = (await fetchFirebase<T>(env, clean)) || ({} as T);
  const merged = { ...existing, ...patch, updatedAt: Date.now() } as T;
  const ok = await putFirebase(env, clean, merged);
  return ok ? merged : null;
}

async function deleteFirebase(env: WorkerEnv, endpoint: string): Promise<boolean> {
  const clean = sanitizeEndpoint(endpoint);
  if (!clean) return false;
  return Boolean(await rtdbRequest(env, "DELETE", clean));
}

async function signAuthToken(env: WorkerEnv, payload: AuthTokenPayload): Promise<string> {
  const encoded = bytesToBase64Url(enc.encode(JSON.stringify(payload)));
  const keyBytes = await getTokenSigningKeyBytes(env);
  const sig = bytesToBase64Url(await hmacSha256Raw(keyBytes, encoded));
  return `${encoded}.${sig}`;
}

async function verifyAuthToken(env: WorkerEnv, token: string | null | undefined): Promise<AuthTokenPayload | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  try {
    const keyBytes = await getTokenSigningKeyBytes(env);
    const expectedSig = bytesToBase64Url(await hmacSha256Raw(keyBytes, encoded));
    if (!timingSafeCompare(sig, expectedSig)) return null;
    const decoded = JSON.parse(dec.decode(base64UrlToBytes(encoded))) as AuthTokenPayload;
    if (!decoded || typeof decoded.exp !== "number" || Date.now() > decoded.exp) return null;
    if (decoded.role !== "admin" && decoded.role !== "user") return null;
    return decoded;
  } catch {
    return null;
  }
}

async function getCallerAuth(env: WorkerEnv, req: Request): Promise<{ isAdmin: boolean; userTid: string | null }> {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const adminTokenHeader = req.headers.get("x-admin-token") || url.searchParams.get("adminToken") || "";
  const userTokenHeader = req.headers.get("x-user-token") || url.searchParams.get("userToken") || "";

  let isAdmin = false;
  let userTid: string | null = null;
  const aPayload = await verifyAuthToken(env, adminTokenHeader || bearer);
  if (aPayload?.role === "admin") isAdmin = true;
  const uPayload = await verifyAuthToken(env, userTokenHeader || bearer);
  if (uPayload?.role === "user" && uPayload.tid) userTid = String(uPayload.tid);
  return { isAdmin, userTid };
}

async function verifyTelegramInitData(env: WorkerEnv, initData: string): Promise<{
  valid: boolean;
  user?: { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
  startParam?: string | null;
}> {
  const botToken = (env.BOT_TOKEN || "").trim();
  if (!initData || !botToken) return { valid: false };
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash") || "";
    if (!hash) return { valid: false };

    const pairs: string[] = [];
    params.forEach((val, key) => {
      if (key !== "hash") pairs.push(`${key}=${val}`);
    });
    pairs.sort();
    const dataCheckString = pairs.join("\n");

    const secretKey = await hmacSha256Raw(enc.encode("WebAppData"), botToken);
    const computedHash = bytesToHex(await hmacSha256Raw(secretKey, dataCheckString));
    if (!timingSafeCompare(hash.toLowerCase(), computedHash.toLowerCase())) return { valid: false };

    const authDate = Number(params.get("auth_date") || 0);
    if (authDate > 0 && Math.floor(Date.now() / 1000) - authDate > 7 * 86400) return { valid: false };

    const userRaw = params.get("user");
    const parsedUser = userRaw ? JSON.parse(userRaw) : undefined;
    if (!parsedUser || !parsedUser.id) return { valid: false };

    const rawStart = params.get("start_param") || null;
    const cleanStart = rawStart ? String(rawStart).trim().replace(/^(?:ref_|c2c_|r_|startapp_|start_|startapp\/|start\/|ref\/|r\/)/i, "") : null;
    return { valid: true, user: parsedUser, startParam: cleanStart || null };
  } catch {
    return { valid: false };
  }
}

function sanitizeHtml(str: string): string {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitizePublicConfig(cfg: Record<string, any> | null): Record<string, any> | null {
  if (!cfg || typeof cfg !== "object") return cfg;
  const copy = { ...cfg };
  delete copy.botToken;
  delete copy.imgbbApiKey;
  delete copy.adminPassword;
  delete copy.adminPinHash;
  return copy;
}

function sanitizePublicUser(u: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!u || typeof u !== "object") return null;
  const copy = { ...u };
  for (const field of SENSITIVE_USER_FIELDS) delete copy[field];
  for (const field of ADMIN_ONLY_USER_FIELDS) delete copy[field];
  return copy;
}

function sanitizeUsersMapForCaller(usersMap: Record<string, any> | null | undefined, auth: { isAdmin: boolean; userTid: string | null }): Record<string, any> {
  if (!usersMap || typeof usersMap !== "object") return {};
  if (auth.isAdmin) return usersMap;
  const out: Record<string, any> = {};
  for (const [k, u] of Object.entries(usersMap)) {
    if (!u || typeof u !== "object") continue;
    out[k] = auth.userTid && k === auth.userTid ? u : sanitizePublicUser(u);
  }
  return out;
}

function toSortedArray(collectionName: string, map: Record<string, any> | null | undefined): any[] {
  if (!map || typeof map !== "object") return [];
  const items = Object.entries(map)
    .filter(([, v]) => v && typeof v === "object")
    .map(([k, v]) => ({ ...v, id: v.id || k }));
  if (collectionName === "withdrawals" || collectionName === "broadcasts" || collectionName === "taskSubmissions" || collectionName === "logs") {
    items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } else if (collectionName === "referrals") {
    items.sort((a, b) => (b.createdAtTimestamp || new Date(b.createdAt || 0).getTime()) - (a.createdAtTimestamp || new Date(a.createdAt || 0).getTime()));
  }
  return items;
}

let cachedCfg: { data: Record<string, any>; at: number } | null = null;
async function getServerConfigWithDefaults(env: WorkerEnv): Promise<Record<string, any>> {
  const now = Date.now();
  const appName = (env.APP_NAME || "Nagad88").trim();
  const botUsername = (env.BOT_USERNAME || "Nadag88Bot").trim().replace(/^@/, "");
  const miniAppUrl = (env.MINI_APP_URL || DEFAULT_MINI_APP_URL).trim();

  let cfg: Record<string, any> = {};
  if (cachedCfg && now - cachedCfg.at < 20_000) {
    cfg = cachedCfg.data;
  } else {
    cfg = (await fetchFirebase<Record<string, any>>(env, "config")) || {};
    cachedCfg = { data: cfg, at: now };
  }

  return {
    appName,
    botUsername,
    miniAppUrl,
    allowDemoLogin: true,
    forceChannelVerification: true,
    referralBonus: 0.5,
    level2Bonus: 0.1,
    welcomeBonus: 0.01,
    minWithdraw: 5,
    minReferralsForWithdraw: 15,
    adMinSeconds: 60,
    adMaxMinutes: 5,
    adDailyLimitPerSlot: 200,
    adHourlyLimitPerSlot: 10,
    requiredChannels: SERVER_DEFAULT_CHANNELS,
    adSlots: SERVER_DEFAULT_AD_SLOTS,
    tasks: SERVER_DEFAULT_TASKS,
    taskPosts: SERVER_DEFAULT_TASK_POSTS,
    videos: SERVER_DEFAULT_VIDEOS,
    ...cfg
  };
}

function buildWebAppMarkup(miniUrl: string, buttonText: string) {
  const cleanUrl = String(miniUrl || "").trim();
  if (!cleanUrl || !cleanUrl.startsWith("https://")) return undefined;
  return { inline_keyboard: [[{ text: buttonText, web_app: { url: cleanUrl } }]] };
}

function buildWelcomeMessageText(opts: { firstName: string; welcomeBonus: number; balance: number; referralBonus: number; minWithdraw: number }): string {
  const safeName = sanitizeHtml(opts.firstName || "ইউজার");
  return `🎉 <b>স্বাগতম ${safeName}!</b>\n\n🎁 <b>নতুন জয়েনিং বোনাস:</b> +$${opts.welcomeBonus.toFixed(2)} USDT আপনার একাউন্টে যোগ হয়েছে!\n💵 <b>বর্তমান ব্যালেন্স:</b> $${opts.balance.toFixed(2)} USDT\n\n👉 প্রতিদিন ভিডিও অ্যাড দেখুন ও স্পেশাল টাস্ক পূরণ করে সরাসরি বিকাশ, নগদ বা বাইন্যান্সে টাকা তুলুন।\n👥 <b>প্রতি সফল রেফারে পাবেন:</b> +$${opts.referralBonus.toFixed(2)} USDT!\n💰 <b>নূন্যতম উইথড্র:</b> $${opts.minWithdraw.toFixed(2)} USDT\n\n🚀 এখনই কাজ শুরু করতে নিচের বাটনে চাপুন!`;
}

function buildChannelVerifiedMessageText(opts: { firstName: string; balance: number; referralCount: number; botUsername: string; tid: string }): string {
  const safeName = sanitizeHtml(opts.firstName || "ইউজার");
  const cleanBot = String(opts.botUsername || "Nadag88Bot").trim().replace(/^@/, "");
  const refLink = `https://t.me/${cleanBot}?startapp=${opts.tid}`;
  return `✅ <b>চ্যানেল ভেরিফিকেশন সফল হয়েছে, ${safeName}!</b>\n\n💵 <b>আপনার বর্তমান ব্যালেন্স:</b> $${opts.balance.toFixed(2)} USDT\n👥 <b>বর্তমান রেফার:</b> ${opts.referralCount} জন\n\n🔗 <b>আপনার রেফারেল লিংক (ক্লিক করলেই কপি হবে):</b>\n<code>${sanitizeHtml(refLink)}</code>`;
}

const welcomeInFlight = new Set<string>();
async function sendWelcomeMessageOnce(
  env: WorkerEnv,
  tid: string,
  opts: { firstName: string; welcomeBonus: number; balance: number; referralBonus: number; minWithdraw: number },
  replyMarkup?: any
): Promise<boolean> {
  if (!tid || welcomeInFlight.has(tid)) return false;
  welcomeInFlight.add(tid);
  try {
    const latest = await fetchFirebase<any>(env, `users/${tid}`);
    if (latest?.welcomeSent) return true;
    const delivered = await sendTelegramMessage(env, tid, buildWelcomeMessageText(opts), replyMarkup);
    if (delivered) {
      await patchFirebaseItem(env, `users/${tid}`, { welcomeSent: true });
    }
    return delivered;
  } finally {
    welcomeInFlight.delete(tid);
  }
}

async function sendTelegramMessage(env: WorkerEnv, chatId: string | number, text: string, replyMarkup?: any): Promise<boolean> {
  const botToken = (env.BOT_TOKEN || "").trim();
  if (!botToken || !chatId) return false;
  const postSend = async (body: Record<string, any>) => {
    try {
      const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return await r.json();
    } catch {
      return { ok: false };
    }
  };

  const payload: Record<string, any> = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  let res = await postSend(payload);
  if (res?.ok) return true;
  const desc = String(res?.description || "");
  if (desc.includes("chat not found") || desc.includes("bot can't initiate") || desc.includes("bot was blocked")) return false;
  if (replyMarkup && (desc.includes("inline keyboard") || desc.includes("Button_url_invalid") || desc.includes("WEB_APP"))) {
    res = await postSend({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
    if (res?.ok) return true;
  }
  if (desc.includes("can't parse entities")) {
    const plain = String(text || "").replace(/<[^>]+>/g, "");
    const fallback = await postSend(replyMarkup ? { chat_id: chatId, text: plain, reply_markup: replyMarkup } : { chat_id: chatId, text: plain });
    if (fallback?.ok) return true;
  }
  return false;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-token, x-admin-token",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    }
  });
}

async function readJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function answerCallbackQuery(env: WorkerEnv, callbackQueryId: string, text?: string, showAlert = false): Promise<boolean> {
  const botToken = (env.BOT_TOKEN || "").trim();
  if (!botToken || !callbackQueryId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || "", show_alert: showAlert })
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkUserInTelegramChannel(env: WorkerEnv, usernameOrId: string, userId: string): Promise<boolean> {
  const botToken = (env.BOT_TOKEN || "").trim();
  if (!botToken || !usernameOrId || !userId) return false;
  const clean = usernameOrId.replace(/^(https?:\/\/)?(www\.)?(t\.me\/|telegram\.me\/)/i, "").replace(/^@/, "").split("/")[0].split("?")[0].trim();
  const targetChatId = clean.startsWith("-") || /^\d+$/.test(clean) ? clean : `@${clean}`;
  try {
    const parsed: any = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(targetChatId)}&user_id=${encodeURIComponent(userId)}`).then((r) => r.json());
    if (parsed.ok && parsed.result) {
      const st = parsed.result.status;
      return st === "creator" || st === "administrator" || st === "member" || st === "restricted";
    }
    if (String(parsed.description || "").includes("member list is inaccessible")) return true;
    return false;
  } catch {
    return false;
  }
}

async function checkAllRequiredChannels(env: WorkerEnv, chatId: string): Promise<{ allJoined: boolean; missingChannels: string[] }> {
  const cfg = await getServerConfigWithDefaults(env);
  const channels = Array.isArray(cfg.requiredChannels) && cfg.requiredChannels.length > 0 ? cfg.requiredChannels : SERVER_DEFAULT_CHANNELS;
  const missingChannels: string[] = [];
  for (const ch of channels) {
    if (!ch?.username) continue;
    const isMember = await checkUserInTelegramChannel(env, ch.username, chatId);
    if (!isMember) missingChannels.push(ch.name || ch.username);
  }
  return { allJoined: missingChannels.length === 0, missingChannels };
}

async function creditReferralChain(
  env: WorkerEnv,
  opts: {
    tid: string;
    displayName: string;
    referrerId: string | null | undefined;
    cfg: Record<string, any>;
    openAppMarkup: any;
    nowIso: string;
  }
): Promise<boolean> {
  const tid = String(opts.tid || "").trim();
  const cleanRef = String(opts.referrerId || "")
    .trim()
    .replace(/^(?:ref_|c2c_|r_|startapp_|start_|startapp\/|start\/|ref\/|r\/)/i, "");
  if (!tid || !cleanRef || cleanRef === tid || !/^\d+$/.test(tid) || !/^\d+$/.test(cleanRef)) return false;
  if (tid === "724910385") return false;

  try {
    const existingRefs = (await fetchFirebase<Record<string, any>>(env, "referrals")) || {};
    const alreadyRef = Object.values(existingRefs).some((r: any) => String(r?.referredTelegramId || "") === tid);
    if (alreadyRef) return false;

    const parent = await fetchFirebase<any>(env, `users/${cleanRef}`);
    if (!parent || !parent.telegramId) return false;
    if (String(parent.referredBy || "") === tid) return false;

    const childUser = await fetchFirebase<any>(env, `users/${tid}`);
    if (childUser && childUser.referredBy && String(childUser.referredBy) !== cleanRef) {
      return false;
    }
    if (childUser && !childUser.referredBy) {
      await patchFirebaseItem(env, `users/${tid}`, { referredBy: cleanRef });
    }

    const l1Bonus = Number(opts.cfg.referralBonus ?? 0.5);
    const l2Bonus = Number(opts.cfg.level2Bonus ?? 0.1);
    const minRefs = Number(opts.cfg.minReferralsForWithdraw ?? 15);
    const nowTs = Date.now();

    parent.referralCount = (Number(parent.referralCount) || 0) + 1;
    parent.balance = Number(((Number(parent.balance) || 0) + l1Bonus).toFixed(2));
    parent.lifetimeEarned = Number(((Number(parent.lifetimeEarned) || 0) + l1Bonus).toFixed(2));
    parent.referralEarned = Number(((Number(parent.referralEarned) || 0) + l1Bonus).toFixed(2));
    parent.updatedAt = nowTs;
    await putFirebase(env, `users/${cleanRef}`, parent);

    const refRecordId = `ref_${nowTs}_${Math.random().toString(36).slice(2, 7)}`;
    await putFirebase(env, `referrals/${refRecordId}`, {
      id: refRecordId,
      referrerTelegramId: cleanRef,
      referredTelegramId: tid,
      level: 1,
      bonus: l1Bonus,
      createdAt: opts.nowIso,
      createdAtTimestamp: nowTs
    });

    await sendTelegramMessage(
      env,
      cleanRef,
      `🎉 <b>নতুন রেফারেল যুক্ত হয়েছে!</b>\n\n👤 <b>নতুন সদস্য:</b> ${sanitizeHtml(opts.displayName || "User")}\n📊 <b>আপনার বর্তমান রেফারেল:</b> ${parent.referralCount} জন\n💰 <b>রেফারেল বোনাস:</b> +$${l1Bonus.toFixed(2)} USDT\n💵 <b>বর্তমান ব্যালেন্স:</b> $${parent.balance.toFixed(2)} USDT\n🎯 <b>উইথড্র রিকোয়ারমেন্ট:</b> ${parent.referralCount}/${minRefs} জন`,
      opts.openAppMarkup
    );

    const grandParentId = String(parent.referredBy || "").trim();
    if (grandParentId && grandParentId !== cleanRef && grandParentId !== tid && /^\d+$/.test(grandParentId)) {
      const grandParent = await fetchFirebase<any>(env, `users/${grandParentId}`);
      if (grandParent && grandParent.telegramId && String(grandParent.referredBy || "") !== tid) {
        const gpTs = Date.now();
        grandParent.level2Count = (Number(grandParent.level2Count) || 0) + 1;
        grandParent.balance = Number(((Number(grandParent.balance) || 0) + l2Bonus).toFixed(2));
        grandParent.lifetimeEarned = Number(((Number(grandParent.lifetimeEarned) || 0) + l2Bonus).toFixed(2));
        grandParent.referralEarned = Number(((Number(grandParent.referralEarned) || 0) + l2Bonus).toFixed(2));
        grandParent.updatedAt = gpTs;
        await putFirebase(env, `users/${grandParentId}`, grandParent);

        const gRefId = `ref_${gpTs}_${Math.random().toString(36).slice(2, 7)}`;
        await putFirebase(env, `referrals/${gRefId}`, {
          id: gRefId,
          referrerTelegramId: grandParentId,
          referredTelegramId: tid,
          level: 2,
          bonus: l2Bonus,
          createdAt: opts.nowIso,
          createdAtTimestamp: gpTs
        });

        await sendTelegramMessage(
          env,
          grandParentId,
          `🌟 <b>লেভেল ২ টিম মেম্বার যুক্ত হয়েছে!</b>\n\n📊 <b>লেভেল ২ টিম সাইজ:</b> ${grandParent.level2Count} জন\n💰 <b>লেভেল ২ বোনাস:</b> +$${l2Bonus.toFixed(2)} USDT\n💵 <b>বর্তমান ব্যালেন্স:</b> $${grandParent.balance.toFixed(2)} USDT`,
          opts.openAppMarkup
        );
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function handleTelegramMessage(env: WorkerEnv, msg: any) {
  if (!msg || !msg.chat || msg.chat.type !== "private" || msg.from?.is_bot) return;
  const chatId = String(msg.chat.id);
  const from = msg.from;
  if (!chatId || !from) return;

  const tid = String(from.id);
  const text = String(msg.text || "").trim();
  const firstName = String(from.first_name || "User").trim() || "User";
  const lastName = String(from.last_name || "").trim();
  const username = String(from.username || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || firstName;

  let refId: string | null = null;
  if (text.startsWith("/start")) {
    const parts = text.split(/\s+/);
    if (parts[1]) {
      const cleaned = parts[1].replace(/^(?:ref_|c2c_|r_|startapp_|start_|startapp\/|start\/|ref\/|r\/)/i, "").trim();
      if (cleaned && cleaned !== tid && /^\d+$/.test(cleaned)) refId = cleaned;
    }
  }

  const cfg = await getServerConfigWithDefaults(env);
  const appTitle = String(cfg.appName || env.APP_NAME || "Nagad88").trim();
  const miniUrl = String(cfg.miniAppUrl || env.MINI_APP_URL || DEFAULT_MINI_APP_URL).trim();
  const wb = Number(cfg.welcomeBonus ?? 0.01);
  const l1Bonus = Number(cfg.referralBonus ?? 0.5);
  const minWithdraw = Number(cfg.minWithdraw ?? 5);
  const openMarkup = buildWebAppMarkup(miniUrl, `🚀 Open ${appTitle} App`);

  const existingUser = await fetchFirebase<any>(env, `users/${tid}`);
  const nowIso = new Date().toISOString();

  if (!existingUser || !existingUser.telegramId) {
    const newUser = {
      telegramId: tid,
      username,
      firstName,
      lastName,
      photoUrl: "",
      bio: "",
      balance: Number(wb.toFixed(2)),
      lifetimeEarned: Number(wb.toFixed(2)),
      todayEarned: Number(wb.toFixed(2)),
      todayDate: nowIso.slice(0, 10),
      adsWatchedToday: 0,
      adHourlyCounts: {},
      referralCount: 0,
      level2Count: 0,
      referralEarned: 0,
      referredBy: refId,
      binanceId: "",
      following: [],
      watchedVideos: {},
      verified: false,
      banned: false,
      welcomeSent: true,
      createdAt: nowIso,
      lastLogin: nowIso,
      updatedAt: Date.now()
    };
    await putFirebase(env, `users/${tid}`, newUser);

    if (wb > 0) {
      const wbLogId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await putFirebase(env, `logs/${wbLogId}`, {
        id: wbLogId,
        telegramId: tid,
        kind: "task",
        label: "🎁 সাইনআপ ওয়েলকাম বোনাস",
        amount: Number(wb.toFixed(2)),
        createdAt: nowIso
      });
    }

    if (refId && refId !== tid) {
      await creditReferralChain(env, {
        tid,
        displayName: fullName,
        referrerId: refId,
        cfg,
        openAppMarkup: openMarkup,
        nowIso
      });
    }

    await sendTelegramMessage(
      env,
      chatId,
      buildWelcomeMessageText({ firstName, welcomeBonus: wb, balance: Number(newUser.balance), referralBonus: l1Bonus, minWithdraw }),
      openMarkup
    );
    return;
  }

  const currentBal = Number(existingUser.balance || 0);
  const wasWelcomeMissing = !existingUser.welcomeSent;

  await patchFirebaseItem(env, `users/${tid}`, {
    firstName,
    lastName: lastName || existingUser.lastName || "",
    username: username || existingUser.username || "",
    welcomeSent: true,
    lastLogin: nowIso
  });

  if (!existingUser.referredBy && refId && refId !== tid) {
    await creditReferralChain(env, {
      tid,
      displayName: fullName,
      referrerId: refId,
      cfg,
      openAppMarkup: openMarkup,
      nowIso
    });
  }

  if (wasWelcomeMissing) {
    await sendTelegramMessage(
      env,
      chatId,
      buildWelcomeMessageText({ firstName: existingUser.firstName || firstName, welcomeBonus: wb, balance: currentBal, referralBonus: l1Bonus, minWithdraw }),
      openMarkup
    );
    return;
  }

  const singleBalanceMsg = `💵 <b>আপনার বর্তমান ব্যালেন্স আছে: $${currentBal.toFixed(2)} USDT</b>\n\n👤 <b>ইউজার:</b> ${sanitizeHtml(firstName)}\n👥 <b>মোট রেফারেল:</b> ${Number(existingUser.referralCount || 0)} জন\n\n🚀 কাজ শুরু করতে বা ব্যালেন্স তুলতে নিচের বাটনে ক্লিক করুন:`;
  await sendTelegramMessage(env, chatId, singleBalanceMsg, openMarkup);
}

async function handleTelegramCallbackQuery(env: WorkerEnv, query: any) {
  if (!query || !query.message) return;
  const callbackId = String(query.id);
  const chatId = String(query.message.chat?.id || query.from?.id);
  const data = String(query.data || "");
  const firstName = String(query.from?.first_name || "User").trim() || "User";

  if (data === "check_channels" || data === "verify") {
    const cfg = await getServerConfigWithDefaults(env);
    const appTitle = String(cfg.appName || env.APP_NAME || "Nagad88").trim();
    const miniUrl = String(cfg.miniAppUrl || env.MINI_APP_URL || DEFAULT_MINI_APP_URL).trim();
    const { allJoined, missingChannels } = await checkAllRequiredChannels(env, chatId);

    if (allJoined) {
      await patchFirebaseItem(env, `users/${chatId}`, { verified: true });
      await answerCallbackQuery(env, callbackId, "🎉 অভিনন্দন! চ্যানেল ভেরিফিকেশন সফল হয়েছে!", true);
      const user = await fetchFirebase<any>(env, `users/${chatId}`);
      const botUser = String(cfg.botUsername || env.BOT_USERNAME || "Nadag88Bot").trim().replace(/^@/, "");
      const successText = buildChannelVerifiedMessageText({
        firstName: user?.firstName || firstName,
        balance: Number(user?.balance || 0),
        referralCount: Number(user?.referralCount || 0),
        botUsername: botUser,
        tid: chatId
      });
      await sendTelegramMessage(env, chatId, successText, buildWebAppMarkup(miniUrl, `🚀 Open ${appTitle} App`));
    } else {
      await answerCallbackQuery(env, callbackId, `⚠️ আপনি এখনো ${missingChannels.join(" ও ")} এ জয়েন করেননি! দয়া করে আগে জয়েন করুন।`, true);
    }
  } else {
    await answerCallbackQuery(env, callbackId);
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerCtx): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
      return json({ ok: true }, 204);
    }

    if (!pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (pathname === "/api/health" && request.method === "GET") {
        const missing = [
          !(env.FIREBASE_DATABASE_URL || "").trim() && "FIREBASE_DATABASE_URL",
          !(env.DATA_ENCRYPTION_KEY || "").trim() && "DATA_ENCRYPTION_KEY",
          !(env.BOT_TOKEN || "").trim() && "BOT_TOKEN"
        ].filter(Boolean);
        return json({ ok: missing.length === 0, runtime: "cloudflare-worker", missingEnv: missing, timestamp: Date.now() });
      }

      // 1. Auth Session — Instant Login & Registration (<150ms)
      if (pathname === "/api/auth/session" && request.method === "POST") {
        const missingEnv = [
          !(env.FIREBASE_DATABASE_URL || "").trim() && "FIREBASE_DATABASE_URL",
          !(env.DATA_ENCRYPTION_KEY || "").trim() && "DATA_ENCRYPTION_KEY",
          !(env.BOT_TOKEN || "").trim() && "BOT_TOKEN"
        ].filter(Boolean) as string[];
        if (missingEnv.length > 0) {
          return json({ ok: false, error: `server_env_missing:${missingEnv.join(", ")}` }, 503);
        }
        const body = await readJson(request);
        const { initData, telegramUser, referredBy } = body || {};
        const cfg = await getServerConfigWithDefaults(env);

        let verifiedTgUser: { id: number | string; first_name?: string; last_name?: string; username?: string; photo_url?: string } | null = null;
        let verifiedRefParam: string | null = null;

        if (initData && typeof initData === "string" && initData.trim()) {
          const check = await verifyTelegramInitData(env, initData.trim());
          if (!check.valid || !check.user) {
            return json({ ok: false, error: "invalid_telegram_init_data" }, 401);
          }
          verifiedTgUser = check.user;
          verifiedRefParam = check.startParam || null;
        } else {
          if (cfg.allowDemoLogin === false) {
            return json({ ok: false, error: "demo_login_disabled" }, 403);
          }
          const reqTid = String(telegramUser?.id || "724910385").trim();
          const isAllowedDemoId =
            reqTid === "724910385" || (/^7\d{8}$/.test(reqTid) && Number(reqTid) >= 700000000 && Number(reqTid) <= 799999999);
          if (!isAllowedDemoId) {
            return json({ ok: false, error: "telegram_init_data_required" }, 401);
          }
          verifiedTgUser = {
            id: reqTid,
            first_name: String(telegramUser?.first_name || "Demo").slice(0, 64),
            last_name: String(telegramUser?.last_name || "User").slice(0, 64),
            username: String(telegramUser?.username || "demo_user").slice(0, 64),
            photo_url: String(telegramUser?.photo_url || "").slice(0, 500)
          };
        }

        const tid = String(verifiedTgUser.id).trim();
        const nowIso = new Date().toISOString();
        const todayStr = nowIso.slice(0, 10);
        const displayName = [verifiedTgUser.first_name, verifiedTgUser.last_name].filter(Boolean).join(" ").trim() || "User";
        const rawRef = (verifiedRefParam || referredBy || "").toString().trim().replace(/^(?:ref_|c2c_|r_|startapp_|start_|startapp\/|start\/|ref\/|r\/)/i, "");
        const cleanReferrer = rawRef && rawRef !== tid && /^\d+$/.test(rawRef) ? rawRef : null;

        let user = await fetchFirebase<any>(env, `users/${tid}`);
        let isBrandNewUser = false;
        const appTitle = String(cfg.appName || env.APP_NAME || "Nagad88").trim();
        const miniUrl = String(cfg.miniAppUrl || env.MINI_APP_URL || DEFAULT_MINI_APP_URL).trim();
        const openAppMarkup = buildWebAppMarkup(miniUrl, `🚀 Open ${appTitle} App`);
        const wb = Number(cfg.welcomeBonus ?? 0.01);
        const l1Bonus = Number(cfg.referralBonus ?? 0.5);
        const minWithdraw = Number(cfg.minWithdraw ?? 5);
        const isDemo = tid === "724910385" || verifiedTgUser.username === "demo_user";

        if (user && user.telegramId) {
          if (user.banned) return json({ ok: false, error: "banned", user }, 403);
          user.firstName = verifiedTgUser.first_name || user.firstName || "User";
          user.lastName = verifiedTgUser.last_name ?? user.lastName ?? "";
          user.username = verifiedTgUser.username || user.username || "";
          if (verifiedTgUser.photo_url && (!user.photoUrl || !String(user.photoUrl).startsWith("http"))) {
            user.photoUrl = verifiedTgUser.photo_url;
          }
          if (user.todayDate !== todayStr) {
            user.todayDate = todayStr;
            user.todayEarned = 0;
            user.adsWatchedToday = 0;
          }
          user.lastLogin = nowIso;
          user.updatedAt = Date.now();
          await putFirebase(env, `users/${tid}`, user);

          const postLoginTasks: Promise<unknown>[] = [];
          if (!user.welcomeSent && !isDemo && /^\d+$/.test(tid)) {
            postLoginTasks.push(
              sendWelcomeMessageOnce(
                env,
                tid,
                { firstName: user.firstName, welcomeBonus: wb, balance: Number(user.balance || 0), referralBonus: l1Bonus, minWithdraw },
                openAppMarkup
              )
            );
          }
          if (!user.referredBy && cleanReferrer && cleanReferrer !== tid && !isDemo) {
            postLoginTasks.push(
              creditReferralChain(env, {
                tid,
                displayName,
                referrerId: cleanReferrer,
                cfg,
                openAppMarkup,
                nowIso
              }).then((credited) => {
                if (credited) user.referredBy = cleanReferrer;
              })
            );
          }
          if (postLoginTasks.length > 0) {
            await Promise.allSettled(postLoginTasks);
          }
        } else {
          isBrandNewUser = true;
          user = {
            telegramId: tid,
            username: verifiedTgUser.username || "",
            firstName: verifiedTgUser.first_name || "User",
            lastName: verifiedTgUser.last_name || "",
            photoUrl: verifiedTgUser.photo_url || "",
            bio: "",
            balance: Number(wb.toFixed(2)),
            lifetimeEarned: Number(wb.toFixed(2)),
            todayEarned: Number(wb.toFixed(2)),
            todayDate: todayStr,
            adsWatchedToday: 0,
            adHourlyCounts: {},
            referralCount: 0,
            level2Count: 0,
            referralEarned: 0,
            referredBy: cleanReferrer,
            binanceId: "",
            following: [],
            watchedVideos: {},
            verified: false,
            banned: false,
            welcomeSent: false,
            createdAt: nowIso,
            lastLogin: nowIso,
            updatedAt: Date.now()
          };
          await putFirebase(env, `users/${tid}`, user);

          const tasks: Promise<unknown>[] = [];
          if (wb > 0) {
            const wbLogId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            tasks.push(
              putFirebase(env, `logs/${wbLogId}`, {
                id: wbLogId,
                telegramId: tid,
                kind: "task",
                label: "🎁 সাইনআপ ওয়েলকাম বোনাস",
                amount: Number(wb.toFixed(2)),
                createdAt: nowIso
              })
            );
          }
          if (!isDemo && /^\d+$/.test(tid)) {
            tasks.push(
              sendWelcomeMessageOnce(
                env,
                tid,
                { firstName: user.firstName, welcomeBonus: wb, balance: Number(user.balance), referralBonus: l1Bonus, minWithdraw },
                openAppMarkup
              )
            );
          }
          if (cleanReferrer && cleanReferrer !== tid && !isDemo) {
            tasks.push(
              creditReferralChain(env, {
                tid,
                displayName,
                referrerId: cleanReferrer,
                cfg,
                openAppMarkup,
                nowIso
              })
            );
          }
          await Promise.allSettled(tasks);
        }

        const userToken = await signAuthToken(env, { role: "user", tid, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
        return json({ ok: true, user, userToken, isBrandNewUser, welcomeDelivered: Boolean(user.welcomeSent) });
      }

      // 2. Retry Welcome
      if (pathname === "/api/user/retry-welcome" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.userTid) return json({ ok: false, error: "user_unauthorized" }, 401);
        const tid = auth.userTid;
        const user = await fetchFirebase<any>(env, `users/${tid}`);
        if (!user) return json({ ok: false, error: "user_not_found" }, 404);
        if (user.welcomeSent) return json({ ok: true, alreadySent: true, delivered: true, user });
        const isDemo = tid === "724910385" || user.username === "demo_user";
        if (isDemo || !/^\d+$/.test(tid)) return json({ ok: true, delivered: false, user });

        const cfg = await getServerConfigWithDefaults(env);
        const appTitle = String(cfg.appName || env.APP_NAME || "Nagad88").trim();
        const miniUrl = String(cfg.miniAppUrl || env.MINI_APP_URL || DEFAULT_MINI_APP_URL).trim();
        const delivered = await sendTelegramMessage(
          env,
          tid,
          buildWelcomeMessageText({
            firstName: user.firstName || "User",
            welcomeBonus: Number(cfg.welcomeBonus ?? 0.01),
            balance: Number(user.balance || 0),
            referralBonus: Number(cfg.referralBonus ?? 0.5),
            minWithdraw: Number(cfg.minWithdraw ?? 5)
          }),
          buildWebAppMarkup(miniUrl, `🚀 Open ${appTitle} App`)
        );
        if (delivered) {
          user.welcomeSent = true;
          await patchFirebaseItem(env, `users/${tid}`, { welcomeSent: true });
        }
        return json({ ok: true, delivered, user });
      }

      // 3. Telegram Webhook
      if (pathname === "/api/telegram-webhook" && request.method === "POST") {
        const update = await readJson(request);
        if (update?.message) {
          ctx.waitUntil(handleTelegramMessage(env, update.message).catch(() => {}));
        }
        if (update?.callback_query) {
          ctx.waitUntil(handleTelegramCallbackQuery(env, update.callback_query).catch(() => {}));
        }
        return json({ ok: true });
      }

      // 4. Verify Channels
      if (pathname === "/api/verify-channels" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.userTid) return json({ ok: false, error: "user_unauthorized" }, 401);
        const tid = auth.userTid;
        const body = await readJson(request);
        const clickedIds: string[] = Array.isArray(body?.clickedIds) ? body.clickedIds : [];
        const isManualClick = Boolean(body?.isManualClick);
        const isEntryCheck = Boolean(body?.isEntryCheck);
        const cfg = await getServerConfigWithDefaults(env);
        const user = await fetchFirebase<any>(env, `users/${tid}`);
        if (!user) return json({ ok: false, error: "user_not_found" }, 404);

        if (cfg.forceChannelVerification === false) {
          if (!user.verified) await patchFirebaseItem(env, `users/${tid}`, { verified: true });
          return json({ ok: true, verified: true, joinedMap: {}, missingNames: [], adminNotice: null });
        }

        const channels = Array.isArray(cfg.requiredChannels) && cfg.requiredChannels.length > 0 ? cfg.requiredChannels : SERVER_DEFAULT_CHANNELS;
        const joinedMap: Record<string, boolean> = {};
        const missingNames: string[] = [];
        let allMembers = true;
        let adminNotice: string | null = null;
        const isDemo = tid === "724910385" || user.username === "demo_user";
        const botToken = (env.BOT_TOKEN || "").trim();

        for (const ch of channels) {
          if (!ch?.username) {
            if (ch?.id) joinedMap[ch.id] = true;
            continue;
          }
          const clean = String(ch.username).replace(/^(https?:\/\/)?(www\.)?(t\.me\/|telegram\.me\/)/i, "").replace(/^@/, "").split("/")[0].split("?")[0].trim();
          const targetChatId = clean.startsWith("-") || /^\d+$/.test(clean) ? clean : `@${clean}`;
          const tgRes: any = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(targetChatId)}&user_id=${encodeURIComponent(tid)}`).then((r) => r.json()).catch(() => ({ ok: false }));
          if (tgRes.ok && tgRes.result) {
            const st = tgRes.result.status;
            const member = st === "creator" || st === "administrator" || st === "member" || st === "restricted";
            joinedMap[ch.id] = member;
            if (!member) { allMembers = false; missingNames.push(ch.name || ch.username); }
          } else if (String(tgRes.description || "").includes("member list is inaccessible")) {
            adminNotice = `⚠️ বটের মেম্বারশিপ চেকের জন্য @${clean} এ বটকে অ্যাডমিন করতে হবে`;
            joinedMap[ch.id] = true;
          } else if (isDemo && cfg.allowDemoLogin !== false && (clickedIds.includes(ch.id) || isManualClick || user.verified)) {
            joinedMap[ch.id] = true;
          } else {
            joinedMap[ch.id] = false;
            allMembers = false;
            missingNames.push(ch.name || ch.username);
          }
        }
        const wasVerified = Boolean(user.verified);
        await patchFirebaseItem(env, `users/${tid}`, { verified: allMembers });

        if (allMembers && !isDemo && /^\d+$/.test(tid) && (isManualClick || isEntryCheck || !wasVerified)) {
          const appTitle = String(cfg.appName || env.APP_NAME || "Nagad88").trim();
          const miniUrl = String(cfg.miniAppUrl || env.MINI_APP_URL || DEFAULT_MINI_APP_URL).trim();
          const botUser = String(cfg.botUsername || env.BOT_USERNAME || "Nadag88Bot").trim().replace(/^@/, "");
          const verifyMsg = buildChannelVerifiedMessageText({
            firstName: user.firstName || "ইউজার",
            balance: Number(user.balance || 0),
            referralCount: Number(user.referralCount || 0),
            botUsername: botUser,
            tid
          });
          await sendTelegramMessage(env, tid, verifyMsg, buildWebAppMarkup(miniUrl, `🚀 Open ${appTitle} App`)).catch(() => {});
        }

        return json({ ok: true, verified: allMembers, joinedMap, missingNames, adminNotice });
      }

      if (pathname === "/api/check-member" && request.method === "GET") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin && !auth.userTid) return json({ ok: false, error: "unauthorized" }, 401);
        const channel = url.searchParams.get("channel") || "";
        const userId = url.searchParams.get("userId") || "";
        const botToken = (env.BOT_TOKEN || "").trim();
        if (!botToken || !channel || !userId) return json({ ok: false, isMember: false }, 400);
        const clean = channel.replace(/^(https?:\/\/)?(www\.)?(t\.me\/|telegram\.me\/)/i, "").replace(/^@/, "").split("/")[0].split("?")[0].trim();
        const target = clean.startsWith("-") || /^\d+$/.test(clean) ? clean : `@${clean}`;
        const parsed: any = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(target)}&user_id=${encodeURIComponent(userId)}`).then((r) => r.json()).catch(() => ({ ok: false }));
        if (parsed.ok && parsed.result) {
          const st = parsed.result.status;
          return json({ ok: true, isMember: ["creator", "administrator", "member", "restricted"].includes(st), status: st });
        }
        return json({ ok: false, isMember: false, error: parsed.description || "Telegram check failed" });
      }

      // 5. Earn Routes
      if (pathname === "/api/earn/ad" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.userTid) return json({ ok: false, error: "user_unauthorized" }, 401);
        const tid = auth.userTid;
        const body = await readJson(request);
        const slotId = String(body?.slotId || "").trim();
        if (!slotId) return json({ ok: false, error: "missing_slot" }, 400);
        const user = await fetchFirebase<any>(env, `users/${tid}`);
        if (!user) return json({ ok: false, error: "user_not_found" }, 404);
        if (user.banned) return json({ ok: false, error: "banned" }, 403);
        const cfg = await getServerConfigWithDefaults(env);
        const slots = Array.isArray(cfg.adSlots) && cfg.adSlots.length > 0 ? cfg.adSlots : SERVER_DEFAULT_AD_SLOTS;
        const slot = slots.find((s: any) => s.id === slotId);
        if (!slot) return json({ ok: false, error: "invalid_slot" }, 404);
        const nowMs = Date.now();
        if (user.lastAdClaimAt && nowMs - Number(user.lastAdClaimAt) < 45_000) return json({ ok: false, error: "too_fast_claim" }, 429);
        const nowIso = new Date(nowMs).toISOString();
        const todayStr = nowIso.slice(0, 10);
        const hourKey = nowIso.slice(0, 13);
        if (user.todayDate !== todayStr) { user.todayDate = todayStr; user.todayEarned = 0; user.adsWatchedToday = 0; }
        const rawHourly = user.adHourlyCounts && typeof user.adHourlyCounts === "object" ? { ...user.adHourlyCounts } : {};
        const curHourMap = { ...(rawHourly[hourKey] || {}) };
        const slotCountHour = Number(curHourMap[slot.id] || 0);
        if (slotCountHour >= Number(cfg.adHourlyLimitPerSlot || 10)) return json({ ok: false, error: "hourly_limit_reached", user }, 429);
        let slotCountToday = 0;
        for (const [hk, map] of Object.entries(rawHourly)) {
          if (hk.startsWith(todayStr) && map && typeof map === "object") slotCountToday += Number((map as any)[slot.id] || 0);
        }
        if (slotCountToday >= Number(cfg.adDailyLimitPerSlot || 200)) return json({ ok: false, error: "daily_limit_reached", user }, 429);
        const reward = Number(Number(slot.reward || 0.05).toFixed(2));
        curHourMap[slot.id] = slotCountHour + 1;
        rawHourly[hourKey] = curHourMap;
        user.adHourlyCounts = rawHourly;
        user.lastAdClaimAt = nowMs;
        user.balance = Number(((Number(user.balance) || 0) + reward).toFixed(2));
        user.todayEarned = Number(((Number(user.todayEarned) || 0) + reward).toFixed(2));
        user.lifetimeEarned = Number(((Number(user.lifetimeEarned) || 0) + reward).toFixed(2));
        user.adsWatchedToday = (Number(user.adsWatchedToday) || 0) + 1;
        user.updatedAt = nowMs;
        await putFirebase(env, `users/${tid}`, user);
        const logId = `log_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
        const logItem = { id: logId, telegramId: tid, kind: "ad", label: `${slot.title} (${slot.id})`, amount: reward, createdAt: nowIso };
        ctx.waitUntil(putFirebase(env, `logs/${logId}`, logItem));
        return json({ ok: true, reward, user, log: logItem });
      }

      if (pathname === "/api/earn/video" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.userTid) return json({ ok: false, error: "user_unauthorized" }, 401);
        const tid = auth.userTid;
        const body = await readJson(request);
        const videoId = String(body?.videoId || "").trim();
        if (!videoId) return json({ ok: false, error: "missing_video" }, 400);
        const user = await fetchFirebase<any>(env, `users/${tid}`);
        if (!user) return json({ ok: false, error: "user_not_found" }, 404);
        if (user.banned) return json({ ok: false, error: "banned" }, 403);
        if (user.watchedVideos && user.watchedVideos[videoId]) return json({ ok: false, error: "already_watched", user }, 409);
        const cfg = await getServerConfigWithDefaults(env);
        const videos = Array.isArray(cfg.videos) && cfg.videos.length > 0 ? cfg.videos : SERVER_DEFAULT_VIDEOS;
        const video = videos.find((v: any) => v.id === videoId);
        if (!video) return json({ ok: false, error: "invalid_video" }, 404);
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const todayStr = nowIso.slice(0, 10);
        if (user.todayDate !== todayStr) { user.todayDate = todayStr; user.todayEarned = 0; user.adsWatchedToday = 0; }
        const reward = Number(Number(video.reward || 0.05).toFixed(2));
        user.watchedVideos = { ...(user.watchedVideos || {}), [video.id]: true };
        user.balance = Number(((Number(user.balance) || 0) + reward).toFixed(2));
        user.todayEarned = Number(((Number(user.todayEarned) || 0) + reward).toFixed(2));
        user.lifetimeEarned = Number(((Number(user.lifetimeEarned) || 0) + reward).toFixed(2));
        user.updatedAt = nowMs;
        await putFirebase(env, `users/${tid}`, user);
        const logId = `log_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
        const logItem = { id: logId, telegramId: tid, kind: "task", label: `ভিডিও দেখা: ${video.title}`, amount: reward, createdAt: nowIso };
        ctx.waitUntil(putFirebase(env, `logs/${logId}`, logItem));
        return json({ ok: true, reward, user, log: logItem });
      }

      if (pathname === "/api/earn/task" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.userTid) return json({ ok: false, error: "user_unauthorized" }, 401);
        const tid = auth.userTid;
        const body = await readJson(request);
        const taskId = String(body?.taskId || "").trim();
        if (!taskId) return json({ ok: false, error: "missing_task" }, 400);
        const user = await fetchFirebase<any>(env, `users/${tid}`);
        if (!user) return json({ ok: false, error: "user_not_found" }, 404);
        if (user.banned) return json({ ok: false, error: "banned" }, 403);
        const nowMs = Date.now();
        if (user.lastTaskClaimAt && nowMs - Number(user.lastTaskClaimAt) < 45_000) return json({ ok: false, error: "too_fast_claim" }, 429);
        const cfg = await getServerConfigWithDefaults(env);
        const tasks = Array.isArray(cfg.tasks) && cfg.tasks.length > 0 ? cfg.tasks : SERVER_DEFAULT_TASKS;
        const task = tasks.find((t: any) => t.id === taskId);
        if (!task) return json({ ok: false, error: "invalid_task" }, 404);
        const nowIso = new Date(nowMs).toISOString();
        const todayStr = nowIso.slice(0, 10);
        if (user.todayDate !== todayStr) { user.todayDate = todayStr; user.todayEarned = 0; user.adsWatchedToday = 0; }
        const reward = Number(Number(task.reward || 0.05).toFixed(2));
        user.lastTaskClaimAt = nowMs;
        user.balance = Number(((Number(user.balance) || 0) + reward).toFixed(2));
        user.todayEarned = Number(((Number(user.todayEarned) || 0) + reward).toFixed(2));
        user.lifetimeEarned = Number(((Number(user.lifetimeEarned) || 0) + reward).toFixed(2));
        user.updatedAt = nowMs;
        await putFirebase(env, `users/${tid}`, user);
        const logId = `log_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
        const logItem = { id: logId, telegramId: tid, kind: "task", label: task.title || "Task Reward", amount: reward, createdAt: nowIso };
        ctx.waitUntil(putFirebase(env, `logs/${logId}`, logItem));
        return json({ ok: true, reward, user, log: logItem });
      }

      // 6. Withdrawals & Task Submissions & Profile
      if (pathname === "/api/withdrawals/request" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.userTid) return json({ ok: false, error: "user_unauthorized" }, 401);
        const tid = auth.userTid;
        const body = await readJson(request);
        const rawAmount = Number(body?.amount);
        const account = String(body?.account || "").trim();
        const method = String(body?.method || "bKash").trim();
        if (!account) return json({ ok: false, reason: "missing_account" }, 400);
        const cleanAcct = account.replace(/[\s-]/g, "");
        const isBinance = method.toLowerCase().includes("binance");
        if (isBinance ? cleanAcct.length < 4 : !/^01\d{9}$/.test(cleanAcct)) return json({ ok: false, reason: "missing_account" }, 400);
        const user = await fetchFirebase<any>(env, `users/${tid}`);
        if (!user) return json({ ok: false, reason: "user_not_found" }, 404);
        if (user.banned) return json({ ok: false, reason: "banned" }, 403);
        const cfg = await getServerConfigWithDefaults(env);
        const amount = Number(rawAmount.toFixed(2));
        if (!Number.isFinite(amount) || amount < Number(cfg.minWithdraw ?? 5)) return json({ ok: false, reason: "below_minimum" }, 400);
        if (Number(user.balance || 0) < amount) return json({ ok: false, reason: "insufficient_balance" }, 400);
        if (Number(user.referralCount || 0) < Number(cfg.minReferralsForWithdraw ?? 15)) return json({ ok: false, reason: "not_enough_referrals" }, 400);
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        user.balance = Number((Number(user.balance) - amount).toFixed(2));
        user.binanceId = account;
        user.updatedAt = nowMs;
        await putFirebase(env, `users/${tid}`, user);
        const wdId = `wd_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const wd = { id: wdId, telegramId: tid, name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || tid, amount, fee: 0, method, account, status: "pending", refunded: false, createdAt: nowIso, updatedAt: nowIso };
        await putFirebase(env, `withdrawals/${wdId}`, wd);
        return json({ ok: true, withdrawal: wd, user });
      }

      if (pathname === "/api/task-submissions" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.userTid) return json({ ok: false, error: "user_unauthorized" }, 401);
        const tid = auth.userTid;
        const body = await readJson(request);
        const taskId = String(body?.taskId || "").trim();
        const screenshots: string[] = Array.isArray(body?.screenshots) ? body.screenshots : [];
        const note = String(body?.note || "").trim().slice(0, 500);
        if (!taskId || screenshots.length === 0) return json({ ok: false, reason: "missing_data" }, 400);
        const user = await fetchFirebase<any>(env, `users/${tid}`);
        if (!user) return json({ ok: false, reason: "user_not_found" }, 404);
        if (user.banned) return json({ ok: false, reason: "banned" }, 403);
        const cfg = await getServerConfigWithDefaults(env);
        const posts = Array.isArray(cfg.taskPosts) && cfg.taskPosts.length > 0 ? cfg.taskPosts : SERVER_DEFAULT_TASK_POSTS;
        const post = posts.find((p: any) => p.id === taskId && p.active !== false);
        if (!post) return json({ ok: false, reason: "task_not_found" }, 404);
        const reqShots = Math.max(1, Math.min(3, Number(post.requiredScreenshots) || 1));
        if (screenshots.length < reqShots) return json({ ok: false, reason: "missing_data" }, 400);
        const existingMap = (await fetchFirebase<Record<string, any>>(env, "taskSubmissions")) || {};
        const userSubs = Object.values(existingMap).filter((s: any) => s?.taskId === post.id && s?.telegramId === tid);
        if (userSubs.some((s: any) => s?.status === "pending")) return json({ ok: false, reason: "already_pending" }, 409);
        if (userSubs.filter((s: any) => s?.status === "approved").length >= Math.max(1, Math.floor(Number(post.maxCompletions) || 1))) return json({ ok: false, reason: "already_approved" }, 409);
        const nowMs = Date.now();
        const subId = `tsub_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const sub = { id: subId, taskId: post.id, taskTitle: String(post.title || ""), taskBannerUrl: String(post.bannerUrl || ""), telegramId: tid, userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || tid, reward: Number(Number(post.reward || 0).toFixed(2)), screenshots: screenshots.slice(0, 3), note, status: "pending", createdAt: new Date(nowMs).toISOString() };
        await putFirebase(env, `taskSubmissions/${subId}`, sub);
        return json({ ok: true, submission: sub });
      }

      if (pathname === "/api/user/profile" && request.method === "PATCH") {
        const auth = await getCallerAuth(env, request);
        if (!auth.userTid) return json({ ok: false, error: "user_unauthorized" }, 401);
        const body = await readJson(request);
        const safePatch: Record<string, any> = {};
        if (typeof body.firstName === "string") safePatch.firstName = body.firstName.trim().slice(0, 64);
        if (typeof body.lastName === "string") safePatch.lastName = body.lastName.trim().slice(0, 64);
        if (typeof body.bio === "string") safePatch.bio = body.bio.trim().slice(0, 240);
        if (typeof body.photoUrl === "string") safePatch.photoUrl = body.photoUrl.trim().slice(0, 2000);
        if (typeof body.binanceId === "string") safePatch.binanceId = body.binanceId.trim().slice(0, 128);
        if (Array.isArray(body.following)) safePatch.following = body.following.map(String).slice(0, 200);
        const updated = await patchFirebaseItem(env, `users/${auth.userTid}`, safePatch);
        return json({ ok: Boolean(updated), user: updated });
      }

      // 7. Admin Auth & Reviews
      if (pathname === "/api/admin/login" && request.method === "POST") {
        const body = await readJson(request);
        const pin = String(body?.pin || "").trim();
        if (!pin) return json({ ok: false, error: "সিকিউরিটি পিন দিন।" }, 400);
        const cfg = await getServerConfigWithDefaults(env);
        const expectedHash = String(cfg.adminPinHash || DEFAULT_ADMIN_PIN_HASH).toLowerCase();
        const enteredHash = (await sha256Hex(pin)).toLowerCase();
        if (!timingSafeCompare(enteredHash, expectedHash)) return json({ ok: false, error: "ভুল সিকিউরিটি পিন!" }, 401);
        const adminToken = await signAuthToken(env, { role: "admin", exp: Date.now() + 365 * 24 * 60 * 60 * 1000 });
        return json({ ok: true, adminToken });
      }

      if (pathname === "/api/admin/session" && request.method === "GET") {
        const auth = await getCallerAuth(env, request);
        return auth.isAdmin ? json({ ok: true, role: "admin" }) : json({ ok: false, error: "admin_unauthorized" }, 401);
      }

      if (pathname === "/api/admin/change-pin" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const body = await readJson(request);
        const currentPin = String(body?.currentPin || "").trim();
        const newPin = String(body?.newPin || "").trim();
        if (!newPin || newPin.length < 4) return json({ ok: false, error: "নতুন পিন কমপক্ষে ৪ সংখ্যার হতে হবে।" }, 400);
        const cfg = (await fetchFirebase<Record<string, any>>(env, "config")) || {};
        const expectedHash = String(cfg.adminPinHash || DEFAULT_ADMIN_PIN_HASH).toLowerCase();
        if (!timingSafeCompare((await sha256Hex(currentPin)).toLowerCase(), expectedHash)) {
          return json({ ok: false, error: "বর্তমান পিনটি সঠিক নয়।" }, 401);
        }
        await putFirebase(env, "config", { ...cfg, adminPinHash: await sha256Hex(newPin), updatedAt: Date.now() });
        return json({ ok: true });
      }

      // Admin Withdrawal Review
      const wdReviewMatch = pathname.match(/^\/api\/admin\/withdrawals\/([^/]+)\/review$/);
      if (wdReviewMatch && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const id = decodeURIComponent(wdReviewMatch[1]);
        const body = await readJson(request);
        const existing = await fetchFirebase<any>(env, `withdrawals/${id}`);
        if (!existing) return json({ ok: false, error: "withdrawal_not_found" }, 404);
        const nextStatus = body?.status;
        if (!["pending", "approved", "rejected"].includes(nextStatus)) return json({ ok: false, error: "invalid_status" }, 400);
        const nextAmount = body?.amount !== undefined && Number.isFinite(Number(body.amount)) ? Number(Number(body.amount).toFixed(2)) : Number(existing.amount || 0);
        const nextAccount = typeof body?.account === "string" && body.account.trim() ? body.account.trim() : existing.account;
        const nextMethod = typeof body?.method === "string" && body.method.trim() ? body.method.trim() : existing.method;
        const prevRefunded = Boolean(existing.refunded) || existing.status === "rejected";
        let nextRefunded = prevRefunded;
        const updatedUser = await fetchFirebase<any>(env, `users/${existing.telegramId}`);
        if (updatedUser) {
          if (!prevRefunded && nextStatus === "rejected") {
            updatedUser.balance = Number(((Number(updatedUser.balance) || 0) + nextAmount).toFixed(2));
            updatedUser.updatedAt = Date.now();
            await putFirebase(env, `users/${existing.telegramId}`, updatedUser);
            nextRefunded = true;
          } else if (prevRefunded && nextStatus !== "rejected") {
            updatedUser.balance = Math.max(0, Number(((Number(updatedUser.balance) || 0) - nextAmount).toFixed(2)));
            updatedUser.updatedAt = Date.now();
            await putFirebase(env, `users/${existing.telegramId}`, updatedUser);
            nextRefunded = false;
          }
        }
        const updatedWd = { ...existing, amount: nextAmount, account: nextAccount, method: nextMethod, status: nextStatus, refunded: nextRefunded, updatedAt: new Date().toISOString() };
        await putFirebase(env, `withdrawals/${id}`, updatedWd);
        if (existing.status !== nextStatus) {
          if (nextStatus === "approved") {
            ctx.waitUntil(sendTelegramMessage(env, existing.telegramId, `✅ <b>উইথড্র সফলভাবে পেমেন্ট করা হয়েছে!</b>\n\n💵 <b>পরিমাণ:</b> $${nextAmount.toFixed(2)} USDT\n🏦 <b>মাধ্যম:</b> ${sanitizeHtml(nextMethod)}\n📱 <b>একাউন্ট:</b> <code>${sanitizeHtml(nextAccount)}</code>`));
          } else if (nextStatus === "rejected") {
            ctx.waitUntil(sendTelegramMessage(env, existing.telegramId, `⚠️ <b>উইথড্র আবেদন বাতিল ও রিফান্ড হয়েছে</b>\n\n💵 <b>রিফান্ড পরিমাণ:</b> +$${nextAmount.toFixed(2)} USDT আপনার মূল ব্যালেন্সে ফেরত দেওয়া হয়েছে।`));
          }
        }
        return json({ ok: true, withdrawal: updatedWd, user: updatedUser });
      }

      // Admin Task Submission Review
      const subReviewMatch = pathname.match(/^\/api\/admin\/task-submissions\/([^/]+)\/review$/);
      if (subReviewMatch && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const id = decodeURIComponent(subReviewMatch[1]);
        const body = await readJson(request);
        const decision = body?.decision;
        if (decision !== "approved" && decision !== "rejected") return json({ ok: false, error: "invalid_decision" }, 400);
        const existing = await fetchFirebase<any>(env, `taskSubmissions/${id}`);
        if (!existing) return json({ ok: false, error: "submission_not_found" }, 404);
        if (existing.status !== "pending") return json({ ok: false, error: "already_reviewed", submission: existing }, 409);
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const updatedSub = { ...existing, status: decision, rejectReason: decision === "rejected" ? String(body?.rejectReason || "").trim() || "প্রমাণ সঠিক নয়, পুনরায় সঠিক স্ক্রিনশট দিয়ে চেষ্টা করুন।" : "", reviewedAt: nowIso };
        await putFirebase(env, `taskSubmissions/${id}`, updatedSub);
        let updatedUser: any = null;
        if (decision === "approved" && Number(existing.reward) > 0) {
          const reward = Number(Number(existing.reward).toFixed(2));
          const user = await fetchFirebase<any>(env, `users/${existing.telegramId}`);
          if (user) {
            const todayStr = nowIso.slice(0, 10);
            if (user.todayDate !== todayStr) { user.todayDate = todayStr; user.todayEarned = 0; user.adsWatchedToday = 0; }
            user.balance = Number(((Number(user.balance) || 0) + reward).toFixed(2));
            user.todayEarned = Number(((Number(user.todayEarned) || 0) + reward).toFixed(2));
            user.lifetimeEarned = Number(((Number(user.lifetimeEarned) || 0) + reward).toFixed(2));
            user.updatedAt = nowMs;
            await putFirebase(env, `users/${existing.telegramId}`, user);
            updatedUser = user;
          }
          const logId = `log_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
          ctx.waitUntil(putFirebase(env, `logs/${logId}`, { id: logId, telegramId: existing.telegramId, kind: "task", label: `টাস্ক সম্পন্ন: ${existing.taskTitle}`, amount: reward, createdAt: nowIso }));
          ctx.waitUntil(sendTelegramMessage(env, existing.telegramId, `🎉 <b>টাস্ক রিওয়ার্ড অনুমোদিত হয়েছে!</b>\n\n✅ <b>টাস্ক:</b> ${sanitizeHtml(existing.taskTitle)}\n💵 <b>পুরস্কার:</b> +$${reward.toFixed(2)} USDT\n\nআপনার মূল ব্যালেন্সে টাকা যোগ করা হয়েছে!`));
        } else if (decision === "rejected") {
          ctx.waitUntil(sendTelegramMessage(env, existing.telegramId, `⚠️ <b>টাস্ক সাবমিশন বাতিল হয়েছে</b>\n\n📌 <b>টাস্ক:</b> ${sanitizeHtml(existing.taskTitle)}\n📝 <b>কারণ:</b> ${sanitizeHtml(updatedSub.rejectReason)}\n\nসঠিক স্ক্রিনশট সহ আবার সাবমিট করতে পারবেন।`));
        }
        return json({ ok: true, submission: updatedSub, user: updatedUser });
      }

      if (pathname === "/api/send-message" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const body = await readJson(request);
        if (!body?.chatId || !body?.text) return json({ ok: false }, 400);
        const ok = await sendTelegramMessage(env, body.chatId, body.text, body.replyMarkup || body.reply_markup);
        return json({ ok });
      }

      if (pathname === "/api/set-menu-button" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const body = await readJson(request);
        const cfg = await getServerConfigWithDefaults(env);
        const targetUrl = String(body?.url || cfg.miniAppUrl || env.MINI_APP_URL || DEFAULT_MINI_APP_URL).trim();
        const botToken = (env.BOT_TOKEN || "").trim();
        if (!botToken || !targetUrl) return json({ ok: false });
        const r = await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menu_button: { type: "web_app", text: `🚀 Open ${cfg.appName || "Nagad88"}`, web_app: { url: targetUrl } } })
        });
        return json(await r.json().catch(() => ({ ok: false })));
      }

      if (pathname === "/api/bot/sync-profile" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const botToken = (env.BOT_TOKEN || "").trim();
        if (!botToken) return json({ ok: false, error: "missing_bot_token" }, 503);
        const cfg = await getServerConfigWithDefaults(env);
        const activeAppName = String(cfg.appName || env.APP_NAME || "Nagad88").trim();
        const activeMiniUrl = String(cfg.miniAppUrl || env.MINI_APP_URL || DEFAULT_MINI_APP_URL).trim();
        const tgPost = (method: string, payload: Record<string, any>) =>
          fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }).then((r) => r.json()).catch(() => ({ ok: false }));

        await tgPost("setMyShortDescription", {
          short_description: `🛍️ ${activeAppName} - ভিডিও বিজ্ঞাপন দেখুন ও রেফার করে সরাসরি বিকাশ, নগদ বা বাইন্যান্সে ইনকাম করুন!`
        });
        await tgPost("setMyDescription", {
          description: `👋 স্বাগতম ${activeAppName} অফিসিয়াল বটে!\n\n💰 প্রতিদিন ভিডিও বিজ্ঞাপন দেখুন ও স্পেশাল টাস্ক সম্পন্ন করে সরাসরি আয় করুন।\n👥 প্রতি সফল রেফারে পাবেন +$0.50 USDT!\n💵 নূন্যতম উইথড্র: $5.00 USDT (বিকাশ, নগদ, বাইন্যান্স)।\n\n🚀 এখনই কাজ শুরু করতে নিচের Start বাটনে চাপুন অথবা মেনু থেকে Mini App খুলুন!`
        });
        if (activeMiniUrl.startsWith("https://")) {
          await tgPost("setChatMenuButton", {
            menu_button: { type: "web_app", text: `🚀 Open ${activeAppName}`, web_app: { url: activeMiniUrl } }
          });
        }
        return json({ ok: true });
      }

      if (pathname === "/api/bot/set-webhook" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const botToken = (env.BOT_TOKEN || "").trim();
        if (!botToken) return json({ ok: false, error: "missing_bot_token" }, 503);
        const body = await readJson(request);
        const cfg = await getServerConfigWithDefaults(env);
        const base = String(body?.url || cfg.miniAppUrl || env.MINI_APP_URL || DEFAULT_MINI_APP_URL).trim().replace(/\/+$/, "");
        const webhookUrl = base.endsWith("/api/telegram-webhook") ? base : `${base}/api/telegram-webhook`;
        const r = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "callback_query"] })
        });
        return json(await r.json().catch(() => ({ ok: false })));
      }

      if (pathname === "/api/upload-image" && request.method === "POST") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin && !auth.userTid) return json({ ok: false, error: "unauthorized" }, 401);
        const body = await readJson(request);
        const rawImage = String(body?.imageBase64 || "").trim();
        if (!rawImage) return json({ ok: false, error: "missing_image" }, 400);
        const cleanBase64 = rawImage.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
        const cfg = (await fetchFirebase<Record<string, any>>(env, "config")) || {};
        const apiKey = String(cfg.imgbbApiKey || env.IMGBB_API_KEY || "").trim();
        if (!apiKey) return json({ ok: false, error: "upload_key_not_configured" }, 503);
        const upRes = await fetch("https://api.imgbb.com/1/upload", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ key: apiKey, image: cleanBase64 }).toString()
        });
        const parsed: any = await upRes.json().catch(() => null);
        const outUrl = parsed?.data?.display_url || parsed?.data?.url || null;
        return outUrl ? json({ ok: true, url: outUrl }) : json({ ok: false, error: "imgbb_upload_failed" }, 502);
      }

      // 8. RTDB Proxy Endpoints & SSE Snapshot
      if (pathname === "/api/rtdb/stream" && request.method === "GET") {
        const auth = await getCallerAuth(env, request);
        const [usersRaw, cfgRaw, wdsRaw, refsRaw, subsRaw] = await Promise.all([
          fetchFirebase<Record<string, any>>(env, "users"),
          fetchFirebase<Record<string, any>>(env, "config"),
          auth.isAdmin || auth.userTid ? fetchFirebase<Record<string, any>>(env, "withdrawals") : Promise.resolve(null),
          auth.isAdmin || auth.userTid ? fetchFirebase<Record<string, any>>(env, "referrals") : Promise.resolve(null),
          auth.isAdmin || auth.userTid ? fetchFirebase<Record<string, any>>(env, "taskSubmissions") : Promise.resolve(null)
        ]);
        const safeCfg = sanitizePublicConfig(cfgRaw) || {};
        if (!safeCfg.botUsername) safeCfg.botUsername = (env.BOT_USERNAME || "Nadag88Bot").replace(/^@/, "");
        if (!safeCfg.miniAppUrl) safeCfg.miniAppUrl = env.MINI_APP_URL || DEFAULT_MINI_APP_URL;
        const wds = toSortedArray("withdrawals", wdsRaw);
        const refs = toSortedArray("referrals", refsRaw);
        const subs = toSortedArray("taskSubmissions", subsRaw);
        const snap = {
          users: sanitizeUsersMapForCaller(usersRaw, auth),
          config: safeCfg,
          withdrawals: auth.isAdmin ? wds : wds.filter((w) => w?.telegramId === auth.userTid),
          referrals: auth.isAdmin ? refs : refs.filter((r) => r?.referrerTelegramId === auth.userTid || r?.referredTelegramId === auth.userTid),
          taskSubmissions: auth.isAdmin ? subs : subs.filter((s) => s?.telegramId === auth.userTid)
        };
        const sseBody = `retry: 15000\nevent: snapshot\ndata: ${JSON.stringify(snap)}\n\n`;
        return new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
        });
      }

      if (pathname === "/api/rtdb/config") {
        if (request.method === "GET") {
          const cfg = await fetchFirebase<Record<string, any>>(env, "config");
          const safe = sanitizePublicConfig(cfg) || {};
          if (!safe.botUsername) safe.botUsername = (env.BOT_USERNAME || "Nadag88Bot").replace(/^@/, "");
          if (!safe.miniAppUrl) safe.miniAppUrl = env.MINI_APP_URL || DEFAULT_MINI_APP_URL;
          return json({ ok: true, config: Object.keys(safe).length > 0 ? safe : null });
        }
        if (request.method === "PUT") {
          const auth = await getCallerAuth(env, request);
          if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
          const body = await readJson(request);
          const current = (await fetchFirebase<Record<string, any>>(env, "config")) || {};
          const next = { ...body, updatedAt: Date.now() };
          delete next.botToken;
          delete next.adminPassword;
          next.adminPinHash = current.adminPinHash || DEFAULT_ADMIN_PIN_HASH;
          if (!next.imgbbApiKey) next.imgbbApiKey = current.imgbbApiKey || "";
          cachedCfg = null;
          const ok = await putFirebase(env, "config", next);
          return json({ ok });
        }
      }

      if (pathname === "/api/rtdb/users" && request.method === "GET") {
        const auth = await getCallerAuth(env, request);
        const users = (await fetchFirebase<Record<string, any>>(env, "users")) || {};
        return json({ ok: true, users: sanitizeUsersMapForCaller(users, auth) });
      }

      const userItemMatch = pathname.match(/^\/api\/rtdb\/users\/([^/]+)$/);
      if (userItemMatch) {
        const tid = decodeURIComponent(userItemMatch[1]);
        const auth = await getCallerAuth(env, request);
        if (request.method === "GET") {
          const u = await fetchFirebase<any>(env, `users/${tid}`);
          if (!u) return json({ ok: true, user: null });
          return json({ ok: true, user: auth.isAdmin || auth.userTid === tid ? u : sanitizePublicUser(u) });
        }
        if (request.method === "PUT") {
          if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
          const body = await readJson(request);
          return json({ ok: await putFirebase(env, `users/${tid}`, { ...body, telegramId: tid, updatedAt: Date.now() }) });
        }
        if (request.method === "PATCH") {
          if (!auth.isAdmin && auth.userTid !== tid) return json({ ok: false, error: "forbidden" }, 403);
          const body = await readJson(request);
          const existing = (await fetchFirebase<any>(env, `users/${tid}`)) || { telegramId: tid };
          if (auth.isAdmin) {
            const cleanBody = { ...body };
            const watchedVideoId = typeof cleanBody.watchedVideoId === "string" ? cleanBody.watchedVideoId.trim() : "";
            delete cleanBody.watchedVideoId;
            if (watchedVideoId) existing.watchedVideos = { ...(existing.watchedVideos || {}), [watchedVideoId]: true };
            const merged = { ...existing, ...cleanBody, telegramId: tid, updatedAt: Date.now() };
            const ok = await putFirebase(env, `users/${tid}`, merged);
            return json({ ok, user: ok ? merged : null });
          }
          const safePatch: Record<string, any> = {};
          if (typeof body.firstName === "string") safePatch.firstName = body.firstName.trim().slice(0, 64);
          if (typeof body.lastName === "string") safePatch.lastName = body.lastName.trim().slice(0, 64);
          if (typeof body.bio === "string") safePatch.bio = body.bio.trim().slice(0, 240);
          if (typeof body.photoUrl === "string") safePatch.photoUrl = body.photoUrl.trim().slice(0, 2000);
          if (typeof body.binanceId === "string") safePatch.binanceId = body.binanceId.trim().slice(0, 128);
          if (Array.isArray(body.following)) safePatch.following = body.following.map(String).slice(0, 200);
          const merged = { ...existing, ...safePatch, telegramId: tid, updatedAt: Date.now() };
          const ok = await putFirebase(env, `users/${tid}`, merged);
          return json({ ok, user: ok ? merged : null });
        }
        if (request.method === "DELETE") {
          if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
          await deleteFirebase(env, `users/${tid}`);
          const allWds = (await fetchFirebase<Record<string, any>>(env, "withdrawals")) || {};
          for (const [key, val] of Object.entries(allWds)) {
            if (val?.telegramId === tid) await deleteFirebase(env, `withdrawals/${key}`);
          }
          const allRefs = (await fetchFirebase<Record<string, any>>(env, "referrals")) || {};
          for (const [key, val] of Object.entries(allRefs)) {
            if (val?.referredTelegramId === tid) await deleteFirebase(env, `referrals/${key}`);
          }
          return json({ ok: true });
        }
      }

      if (pathname === "/api/rtdb/withdrawals" && request.method === "GET") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin && !auth.userTid) return json({ ok: true, withdrawals: [] });
        const list = toSortedArray("withdrawals", await fetchFirebase(env, "withdrawals"));
        return json({ ok: true, withdrawals: auth.isAdmin ? list : list.filter((w) => w?.telegramId === auth.userTid) });
      }
      const wdItemMatch = pathname.match(/^\/api\/rtdb\/withdrawals\/([^/]+)$/);
      if (wdItemMatch) {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const id = decodeURIComponent(wdItemMatch[1]);
        if (request.method === "PUT") {
          const body = await readJson(request);
          return json({ ok: await putFirebase(env, `withdrawals/${id}`, { ...body, id, updatedAt: Date.now() }) });
        }
        if (request.method === "DELETE") return json({ ok: await deleteFirebase(env, `withdrawals/${id}`) });
      }

      if (pathname === "/api/rtdb/referrals" && request.method === "GET") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin && !auth.userTid) return json({ ok: true, referrals: [] });
        const list = toSortedArray("referrals", await fetchFirebase(env, "referrals"));
        return json({ ok: true, referrals: auth.isAdmin ? list : list.filter((r) => r?.referrerTelegramId === auth.userTid || r?.referredTelegramId === auth.userTid) });
      }
      const refItemMatch = pathname.match(/^\/api\/rtdb\/referrals\/([^/]+)$/);
      if (refItemMatch && request.method === "PUT") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const id = decodeURIComponent(refItemMatch[1]);
        const body = await readJson(request);
        return json({ ok: await putFirebase(env, `referrals/${id}`, { ...body, id, createdAtTimestamp: Date.now() }) });
      }

      if (pathname === "/api/rtdb/task-submissions" && request.method === "GET") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin && !auth.userTid) return json({ ok: true, taskSubmissions: [] });
        const list = toSortedArray("taskSubmissions", await fetchFirebase(env, "taskSubmissions"));
        return json({ ok: true, taskSubmissions: auth.isAdmin ? list : list.filter((s) => s?.telegramId === auth.userTid) });
      }
      const subItemMatch = pathname.match(/^\/api\/rtdb\/task-submissions\/([^/]+)$/);
      if (subItemMatch) {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const id = decodeURIComponent(subItemMatch[1]);
        if (request.method === "PUT") {
          const body = await readJson(request);
          return json({ ok: await putFirebase(env, `taskSubmissions/${id}`, { ...body, id, updatedAt: Date.now() }) });
        }
        if (request.method === "DELETE") return json({ ok: await deleteFirebase(env, `taskSubmissions/${id}`) });
      }

      if (pathname === "/api/rtdb/broadcasts" && request.method === "GET") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        return json({ ok: true, broadcasts: toSortedArray("broadcasts", await fetchFirebase(env, "broadcasts")) });
      }
      const bcItemMatch = pathname.match(/^\/api\/rtdb\/broadcasts\/([^/]+)$/);
      if (bcItemMatch) {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const id = decodeURIComponent(bcItemMatch[1]);
        if (request.method === "PUT") {
          const body = await readJson(request);
          return json({ ok: await putFirebase(env, `broadcasts/${id}`, { ...body, id, updatedAtTimestamp: Date.now() }) });
        }
        if (request.method === "DELETE") return json({ ok: await deleteFirebase(env, `broadcasts/${id}`) });
      }

      const logItemMatch = pathname.match(/^\/api\/rtdb\/logs\/([^/]+)$/);
      if (logItemMatch && request.method === "PUT") {
        const auth = await getCallerAuth(env, request);
        if (!auth.isAdmin) return json({ ok: false, error: "admin_unauthorized" }, 401);
        const id = decodeURIComponent(logItemMatch[1]);
        const body = await readJson(request);
        return json({ ok: await putFirebase(env, `logs/${id}`, { ...body, id }) });
      }

      return json({ ok: false, error: "not_found" }, 404);
    } catch (err: any) {
      const msg = String(err?.message || "worker_error");
      if (msg.startsWith("server_env_missing:")) {
        return json({ ok: false, error: msg }, 503);
      }
      return json({ ok: false, error: msg }, 500);
    }
  }
};
