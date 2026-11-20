import express from "express";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import http from "http";
import https from "https";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import {
  fetchFirebase,
  putFirebase,
  patchFirebaseItem,
  deleteFirebase,
  sanitizePublicConfig,
  sanitizePublicUser,
  sanitizeUsersMapForCaller,
  getRawServerConfig,
  getTokenSigningKey,
  registerSseClient,
  startSecureRtdbSyncLoop,
  toSortedArray
} from "./server/secureFirebase.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
const BOT_USERNAME = (process.env.BOT_USERNAME || "Nadag88Bot").trim().replace(/^@/, "");
const APP_NAME = (process.env.APP_NAME || "Nagad88").trim();
const DEFAULT_MINI_APP_URL = "https://nagad88.apk5y.workers.dev/";
const MINI_APP_URL = (process.env.MINI_APP_URL || DEFAULT_MINI_APP_URL || process.env.APP_URL || "").trim();
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

interface AuthTokenPayload {
  role: "admin" | "user";
  tid?: string;
  exp: number;
}

function getClientIp(req: Request): string {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim();
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function signAuthToken(payload: AuthTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getTokenSigningKey()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verifyAuthToken(token: string | undefined | null): AuthTokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  try {
    const expectedSig = crypto.createHmac("sha256", getTokenSigningKey()).update(encoded).digest("base64url");
    if (!timingSafeCompare(sig, expectedSig)) return null;
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AuthTokenPayload;
    if (!decoded || typeof decoded.exp !== "number" || Date.now() > decoded.exp) {
      return null;
    }
    if (decoded.role !== "admin" && decoded.role !== "user") return null;
    return decoded;
  } catch {
    return null;
  }
}

function getCallerAuth(req: Request): { isAdmin: boolean; userTid: string | null } {
  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  const adminTokenHeader = String(req.headers["x-admin-token"] || req.query.adminToken || "");
  const userTokenHeader = String(req.headers["x-user-token"] || req.query.userToken || "");

  let isAdmin = false;
  let userTid: string | null = null;

  const aPayload = verifyAuthToken(adminTokenHeader || bearer);
  if (aPayload && aPayload.role === "admin") {
    isAdmin = true;
  }

  const uPayload = verifyAuthToken(userTokenHeader || bearer);
  if (uPayload && uPayload.role === "user" && uPayload.tid) {
    userTid = String(uPayload.tid);
  }

  return { isAdmin, userTid };
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getCallerAuth(req);
  if (!auth.isAdmin) {
    return res.status(401).json({ ok: false, error: "admin_unauthorized" });
  }
  return next();
}

function requireUser(req: Request, res: Response, next: NextFunction) {
  const auth = getCallerAuth(req);
  if (!auth.userTid) {
    return res.status(401).json({ ok: false, error: "user_unauthorized" });
  }
  (req as any).userTid = auth.userTid;
  return next();
}

function requireUserOrAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getCallerAuth(req);
  if (!auth.isAdmin && !auth.userTid) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  (req as any).callerAuth = auth;
  return next();
}

function verifyTelegramInitData(initData: string): {
  valid: boolean;
  user?: { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
  startParam?: string | null;
} {
  if (!initData || !BOT_TOKEN) return { valid: false };
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

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (!timingSafeCompare(hash.toLowerCase(), computedHash.toLowerCase())) {
      return { valid: false };
    }

    const authDate = Number(params.get("auth_date") || 0);
    if (authDate > 0 && Math.floor(Date.now() / 1000) - authDate > 7 * 86400) {
      return { valid: false };
    }

    const userRaw = params.get("user");
    const parsedUser = userRaw ? JSON.parse(userRaw) : undefined;
    if (!parsedUser || !parsedUser.id) return { valid: false };

    const rawStart = params.get("start_param") || null;
    const cleanStart = rawStart
      ? String(rawStart).trim().replace(/^(ref_|c2c_|r_|startapp_|start_)/i, "")
      : null;

    return { valid: true, user: parsedUser, startParam: cleanStart || null };
  } catch {
    return { valid: false };
  }
}

function sanitizeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getServerConfigWithDefaults(): Promise<Record<string, any>> {
  const cfg = getRawServerConfig() || (await fetchFirebase<Record<string, any>>("config")) || {};
  return {
    appName: APP_NAME,
    botUsername: BOT_USERNAME,
    miniAppUrl: MINI_APP_URL,
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

// Rate limiter for failed admin PIN attempts
const adminPinFailures = new Map<string, { count: number; lockedUntil: number }>();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));

// Security headers (iframe-compatible for AI Studio preview & Telegram WebApp)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

// Basic in-memory API rate limiter against automated scraping
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
app.use("/api", (req, res, next) => {
  if (req.path === "/rtdb/stream" || req.path === "/health") {
    return next();
  }
  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > 300) {
    return res.status(429).json({ ok: false, error: "rate_limited" });
  }
  return next();
});

function buildWebAppMarkup(url: string | undefined | null, buttonText: string) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl || !/^https:\/\//i.test(cleanUrl)) return undefined;
  return {
    inline_keyboard: [[{ text: buttonText, web_app: { url: cleanUrl } }]]
  };
}

// Helper for sending Telegram messages
async function postTelegramSendMessage(payloadObj: Record<string, any>): Promise<{ ok: boolean; description?: string }> {
  return new Promise((resolve) => {
    const payload = JSON.stringify(payloadObj);
    const req = https.request(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload, "utf8")
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ ok: Boolean(parsed.ok), description: parsed.description });
          } catch {
            resolve({ ok: false, description: "invalid_json" });
          }
        });
      }
    );
    req.on("error", (err) => resolve({ ok: false, description: err?.message || "network_error" }));
    req.write(payload);
    req.end();
  });
}

async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: any): Promise<boolean> {
  if (!BOT_TOKEN || !chatId) return false;
  const targetChatId = String(chatId).trim().replace(/^@/, "");
  // Ignore mock demo preview accounts
  if (targetChatId === "724910385" || targetChatId.startsWith("demo_") || targetChatId === "0") {
    return true;
  }

  let res = await postTelegramSendMessage({
    chat_id: targetChatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });

  if (res.ok) {
    console.log(`[Telegram Bot] Message sent successfully to ${targetChatId}`);
    return true;
  }

  const desc = String(res.description || "");
  if (
    desc.includes("chat not found") ||
    desc.includes("bot can't initiate conversation") ||
    desc.includes("bot was blocked")
  ) {
    console.log(`[Telegram Bot] PM unavailable for ${targetChatId}: ${desc}`);
    return false;
  }

  // Fallback 1: Retry without reply_markup if Telegram rejected button URL
  if (replyMarkup && (desc.includes("reply_markup") || desc.includes("BUTTON") || desc.includes("URL"))) {
    res = await postTelegramSendMessage({
      chat_id: targetChatId,
      text,
      parse_mode: "HTML"
    });
    if (res.ok) return true;
  }

  // Fallback 2: Retry plain text without HTML parse_mode
  if (desc.includes("parse") || desc.includes("entity")) {
    const plainText = text.replace(/<[^>]*>/g, "");
    res = await postTelegramSendMessage({
      chat_id: targetChatId,
      text: plainText,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    });
    if (res.ok) return true;

    if (replyMarkup) {
      res = await postTelegramSendMessage({ chat_id: targetChatId, text: plainText });
      if (res.ok) return true;
    }
  }

  console.warn(`[Telegram Bot] sendMessage to ${targetChatId} failed:`, res.description);
  return false;
}

// Encrypted Firebase helpers imported from ./server/secureFirebase.ts

// Helper to answer Telegram callback query
async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false): Promise<boolean> {
  if (!BOT_TOKEN || !callbackQueryId) return false;
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || "",
      show_alert: showAlert
    });
    const req = https.request(
      `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      () => resolve(true)
    );
    req.on("error", () => resolve(false));
    req.write(payload);
    req.end();
  });
}

// Check membership in a specific channel using getChatMember
async function checkUserInTelegramChannel(usernameOrId: string, userId: string): Promise<boolean> {
  if (!BOT_TOKEN || !usernameOrId || !userId) return false;
  const clean = usernameOrId.replace(/^(https?:\/\/)?(www\.)?(t\.me\/|telegram\.me\/)/i, "").replace(/^@/, "").split("/")[0].split("?")[0].trim();
  const targetChatId = clean.startsWith("-") || /^\d+$/.test(clean) ? clean : `@${clean}`;

  return new Promise((resolve) => {
    https.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(targetChatId)}&user_id=${encodeURIComponent(userId)}`,
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok && parsed.result) {
              const st = parsed.result.status;
              resolve(st === "creator" || st === "administrator" || st === "member" || st === "restricted");
              return;
            }
            const desc = parsed.description || "";
            if (desc.includes("member list is inaccessible")) {
              // Bot lacks admin privileges to inspect private channel, don't penalize user
              resolve(true);
              return;
            }
            resolve(false);
          } catch {
            resolve(false);
          }
        });
      }
    ).on("error", () => resolve(false));
  });
}

// Verify membership across all required channels from Firebase config
async function checkAllRequiredChannels(chatId: string): Promise<{ allJoined: boolean; missingChannels: string[] }> {
  const config = await fetchFirebase<any>("config");
  const channels = (config && Array.isArray(config.requiredChannels) && config.requiredChannels.length > 0)
    ? config.requiredChannels
    : [
        { id: "main", name: "Main Channel", username: "ManiShop_Community", url: "https://t.me/ManiShop_Community" },
        { id: "payment", name: "Payment Channel", username: "Earning_Money_Lob", url: "https://t.me/Earning_Money_Lob" }
      ];

  const missingChannels: string[] = [];
  for (const ch of channels) {
    if (!ch.username) continue;
    const isMember = await checkUserInTelegramChannel(ch.username, chatId);
    if (!isMember) {
      missingChannels.push(ch.name || ch.username);
    }
  }

  return {
    allJoined: missingChannels.length === 0,
    missingChannels
  };
}

function buildWelcomeMessageText(params: {
  firstName: string;
  welcomeBonus: number;
  balance: number;
  referralBonus: number;
  minWithdraw: number;
}): string {
  return `🎉 <b>স্বাগতম ${sanitizeHtml(params.firstName)}!</b>\n\n🎁 <b>নতুন জয়েনিং বোনাস:</b> +$${params.welcomeBonus.toFixed(2)} USDT আপনার একাউন্টে যোগ হয়েছে!\n💵 <b>বর্তমান ব্যালেন্স:</b> $${params.balance.toFixed(2)} USDT\n\n👉 প্রতিদিন ভিডিও অ্যাড দেখুন ও স্পেশাল টাস্ক পূরণ করে সরাসরি বিকাশ, নগদ বা বাইন্যান্সে টাকা তুলুন।\n👥 <b>প্রতি সফল রেফারে পাবেন:</b> +$${params.referralBonus.toFixed(2)} USDT!\n💰 <b>নূন্যতম উইথড্র:</b> $${params.minWithdraw.toFixed(2)} USDT\n\n🚀 এখনই কাজ শুরু করতে নিচের বাটনে চাপুন!`;
}

function buildChannelVerifiedMessageText(params: {
  firstName: string;
  balance: number;
  referralCount: number;
  botUsername: string;
  tid: string;
}): string {
  const safeName = sanitizeHtml(params.firstName || "ইউজার");
  const cleanBot = String(params.botUsername || BOT_USERNAME || "Nadag88Bot").trim().replace(/^@/, "");
  const refLink = `https://t.me/${cleanBot}?start=ref_${params.tid}`;
  return `✅ <b>চ্যানেল ভেরিফিকেশন সফল হয়েছে, ${safeName}!</b>\n\n💵 <b>আপনার বর্তমান ব্যালেন্স:</b> $${params.balance.toFixed(2)} USDT\n👥 <b>বর্তমান রেফার:</b> ${params.referralCount} জন\n\n🔗 <b>আপনার রেফারেল লিংক (ক্লিক করলেই কপি হবে):</b>\n<code>${sanitizeHtml(refLink)}</code>`;
}

const welcomeInFlight = new Set<string>();
async function sendWelcomeMessageOnce(
  tid: string,
  params: { firstName: string; welcomeBonus: number; balance: number; referralBonus: number; minWithdraw: number },
  replyMarkup?: any
): Promise<boolean> {
  if (!tid || welcomeInFlight.has(tid)) return false;
  welcomeInFlight.add(tid);
  try {
    const latest = await fetchFirebase<any>(`users/${tid}`);
    if (latest?.welcomeSent) return true;
    const delivered = await sendTelegramMessage(tid, buildWelcomeMessageText(params), replyMarkup);
    if (delivered) {
      await patchFirebaseItem(`users/${tid}`, { welcomeSent: true });
    }
    return delivered;
  } finally {
    welcomeInFlight.delete(tid);
  }
}

// Handle an incoming Telegram message (from polling or webhook)
async function handleTelegramMessage(message: any) {
  if (!message || !message.chat || message.chat.type !== "private" || message.from?.is_bot) return;
  const chatId = String(message.chat.id);
  const text = String(message.text || "").trim();
  const firstName = String(message.from?.first_name || "User").trim() || "User";
  const lastName = String(message.from?.last_name || "").trim();
  const username = String(message.from?.username || "").trim();

  console.log(`[Telegram Bot] Received message from ${firstName} (${chatId}): "${text}"`);

  const isStart = text.startsWith("/start");
  let referrerId: string | null = null;
  if (isStart) {
    const parts = text.split(/\s+/);
    if (parts.length > 1 && parts[1].trim()) {
      const rawRef = parts[1].trim().replace(/^(ref_|c2c_|r_|startapp_|start_)/i, "");
      if (rawRef && rawRef !== chatId && /^\d+$/.test(rawRef)) {
        referrerId = rawRef;
      }
    }
  }

  const cfg = await getServerConfigWithDefaults();
  const appTitle = String(cfg.appName || APP_NAME).trim() || APP_NAME;
  const miniUrl = String(cfg.miniAppUrl || MINI_APP_URL || "").trim();
  const wb = Number(cfg.welcomeBonus ?? 0.01);
  const l1Bonus = Number(cfg.referralBonus ?? 0.5);
  const l2Bonus = Number(cfg.level2Bonus ?? 0.1);
  const minWithdraw = Number(cfg.minWithdraw ?? 5);
  const minRefs = Number(cfg.minReferralsForWithdraw ?? 15);
  const openAppMarkup = buildWebAppMarkup(miniUrl, `🚀 Open ${appTitle} App`);

  const existingUser = await fetchFirebase<any>(`users/${chatId}`);
  const now = new Date().toISOString();

  if (!existingUser || !existingUser.telegramId) {
    console.log(`[Telegram Bot] Registering new user: ${firstName} (${chatId}), referrer: ${referrerId || "none"}`);
    const newUser = {
      telegramId: chatId,
      username,
      firstName,
      lastName,
      photoUrl: "",
      bio: "",
      balance: Number(wb.toFixed(2)),
      lifetimeEarned: Number(wb.toFixed(2)),
      todayEarned: Number(wb.toFixed(2)),
      todayDate: now.slice(0, 10),
      adsWatchedToday: 0,
      adHourlyCounts: {},
      referralCount: 0,
      level2Count: 0,
      referralEarned: 0,
      referredBy: referrerId,
      binanceId: "",
      following: [],
      watchedVideos: {},
      verified: false,
      banned: false,
      welcomeSent: true,
      createdAt: now,
      lastLogin: now,
      updatedAt: Date.now()
    };
    await putFirebase(`users/${chatId}`, newUser);

    if (wb > 0) {
      const wbLogId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await putFirebase(`logs/${wbLogId}`, {
        id: wbLogId,
        telegramId: chatId,
        kind: "task",
        label: "🎁 সাইনআপ ওয়েলকাম বোনাস",
        amount: Number(wb.toFixed(2)),
        createdAt: now
      });
    }

    // Credit Level 1 & Level 2 Referrer atomically on brand new user
    if (referrerId) {
      const existingRefs = (await fetchFirebase<Record<string, any>>("referrals")) || {};
      const alreadyRef = Object.values(existingRefs).some((r: any) => r?.referredTelegramId === chatId);

      if (!alreadyRef) {
        const parent = await fetchFirebase<any>(`users/${referrerId}`);
        if (parent && parent.telegramId) {
          parent.referralCount = (Number(parent.referralCount) || 0) + 1;
          parent.balance = Number(((Number(parent.balance) || 0) + l1Bonus).toFixed(2));
          parent.lifetimeEarned = Number(((Number(parent.lifetimeEarned) || 0) + l1Bonus).toFixed(2));
          parent.referralEarned = Number(((Number(parent.referralEarned) || 0) + l1Bonus).toFixed(2));
          parent.updatedAt = Date.now();
          await putFirebase(`users/${referrerId}`, parent);

          const refId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          await putFirebase(`referrals/${refId}`, {
            id: refId,
            referrerTelegramId: referrerId,
            referredTelegramId: chatId,
            level: 1,
            bonus: l1Bonus,
            createdAt: now
          });

          const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || "User";
          await sendTelegramMessage(
            referrerId,
            `🎉 <b>নতুন রেফারেল যুক্ত হয়েছে!</b>\n\n👤 <b>নতুন সদস্য:</b> ${sanitizeHtml(fullName)}\n📊 <b>আপনার বর্তমান রেফারেল:</b> ${parent.referralCount} জন\n💰 <b>রেফারেল বোনাস:</b> +$${l1Bonus.toFixed(2)} USDT\n💵 <b>বর্তমান ব্যালেন্স:</b> $${parent.balance.toFixed(2)} USDT\n🎯 <b>উইথড্র রিকোয়ারমেন্ট:</b> ${parent.referralCount}/${minRefs} জন`,
            openAppMarkup
          );

          if (parent.referredBy && parent.referredBy !== referrerId && parent.referredBy !== chatId) {
            const grandParent = await fetchFirebase<any>(`users/${parent.referredBy}`);
            if (grandParent && grandParent.telegramId) {
              grandParent.level2Count = (Number(grandParent.level2Count) || 0) + 1;
              grandParent.balance = Number(((Number(grandParent.balance) || 0) + l2Bonus).toFixed(2));
              grandParent.lifetimeEarned = Number(((Number(grandParent.lifetimeEarned) || 0) + l2Bonus).toFixed(2));
              grandParent.referralEarned = Number(((Number(grandParent.referralEarned) || 0) + l2Bonus).toFixed(2));
              grandParent.updatedAt = Date.now();
              await putFirebase(`users/${parent.referredBy}`, grandParent);

              const gRefId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              await putFirebase(`referrals/${gRefId}`, {
                id: gRefId,
                referrerTelegramId: parent.referredBy,
                referredTelegramId: chatId,
                level: 2,
                bonus: l2Bonus,
                createdAt: now
              });

              await sendTelegramMessage(
                parent.referredBy,
                `🌟 <b>লেভেল ২ টিম মেম্বার যুক্ত হয়েছে!</b>\n\n📊 <b>লেভেল ২ টিম সাইজ:</b> ${grandParent.level2Count} জন\n💰 <b>লেভেল ২ বোনাস:</b> +$${l2Bonus.toFixed(2)} USDT\n💵 <b>বর্তমান ব্যালেন্স:</b> $${grandParent.balance.toFixed(2)} USDT`,
                openAppMarkup
              );
            }
          }
        }
      }
    }

    // Send 1 Welcome message to new user
    const welcomeText = buildWelcomeMessageText({
      firstName,
      welcomeBonus: wb,
      balance: newUser.balance,
      referralBonus: l1Bonus,
      minWithdraw
    });
    await sendTelegramMessage(chatId, welcomeText, openAppMarkup);
    return;
  }

  // Existing user: sync latest basic profile & check if Welcome was still undelivered
  const currentBal = Number(existingUser.balance || 0);
  const wasWelcomeMissing = !existingUser.welcomeSent;

  await patchFirebaseItem(`users/${chatId}`, {
    firstName,
    lastName: lastName || existingUser.lastName || "",
    username: username || existingUser.username || "",
    welcomeSent: true,
    lastLogin: now
  });

  if (wasWelcomeMissing) {
    const welcomeText = buildWelcomeMessageText({
      firstName,
      welcomeBonus: wb,
      balance: currentBal,
      referralBonus: l1Bonus,
      minWithdraw
    });
    await sendTelegramMessage(chatId, welcomeText, openAppMarkup);
    return;
  }

  // Every subsequent message from user -> send ONE single message showing current balance
  const singleBalanceMsg = `💵 <b>আপনার বর্তমান ব্যালেন্স আছে: $${currentBal.toFixed(2)} USDT</b>\n\n👤 <b>ইউজার:</b> ${sanitizeHtml(firstName)}\n👥 <b>মোট রেফারেল:</b> ${Number(existingUser.referralCount || 0)} জন\n\n🚀 কাজ শুরু করতে বা ব্যালেন্স তুলতে নিচের বাটনে ক্লিক করুন:`;
  await sendTelegramMessage(chatId, singleBalanceMsg, openAppMarkup);
}

// Handle incoming Telegram callback query (from inline button clicks)
async function handleTelegramCallbackQuery(query: any) {
  if (!query || !query.message) return;
  const callbackId = String(query.id);
  const chatId = String(query.message.chat?.id || query.from?.id);
  const data = String(query.data || "");
  const firstName = query.from?.first_name || "User";

  console.log(`[Telegram Bot] Callback query from ${firstName} (${chatId}): "${data}"`);

  if (data === "check_channels" || data === "verify") {
    const cfg = await getServerConfigWithDefaults();
    const appTitle = String(cfg.appName || APP_NAME).trim() || APP_NAME;
    const miniUrl = String(cfg.miniAppUrl || MINI_APP_URL || "").trim();
    const { allJoined, missingChannels } = await checkAllRequiredChannels(chatId);

    if (allJoined) {
      await patchFirebaseItem(`users/${chatId}`, {
        verified: true,
        updatedAt: Date.now()
      });

      await answerCallbackQuery(callbackId, "🎉 অভিনন্দন! চ্যানেল ভেরিফিকেশন সফল হয়েছে!", true);

      const user = await fetchFirebase<any>(`users/${chatId}`);
      const botUser = String(cfg.botUsername || BOT_USERNAME || "Nadag88Bot").trim().replace(/^@/, "");
      const successText = buildChannelVerifiedMessageText({
        firstName: user?.firstName || firstName,
        balance: Number(user?.balance || 0),
        referralCount: Number(user?.referralCount || 0),
        botUsername: botUser,
        tid: chatId
      });

      await sendTelegramMessage(chatId, successText, buildWebAppMarkup(miniUrl, `🚀 Open ${appTitle} App`));
    } else {
      await answerCallbackQuery(
        callbackId,
        `⚠️ আপনি এখনো ${missingChannels.join(" ও ")} এ জয়েন করেননি! দয়া করে আগে জয়েন করুন।`,
        true
      );
    }
  } else {
    await answerCallbackQuery(callbackId);
  }
}

// Background Long-Polling for Telegram Bot
let isPolling = false;
let lastUpdateOffset = 0;
const processedUpdateIds = new Set<number>();

async function clearTelegramWebhookForPolling(): Promise<void> {
  if (!BOT_TOKEN) return;
  await new Promise<void>((resolve) => {
    https.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook?drop_pending_updates=false`,
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve());
      }
    ).on("error", () => resolve());
  });
}

async function startTelegramPolling() {
  if (isPolling || !BOT_TOKEN) return;

  // If an external Cloudflare Worker is live and healthy at MINI_APP_URL, prefer 24/7 Worker webhook instead of competing polling
  try {
    const cfg = await getServerConfigWithDefaults();
    const targetBase = String(cfg.miniAppUrl || MINI_APP_URL || DEFAULT_MINI_APP_URL).trim().replace(/\/+$/, "");
    if (targetBase.startsWith("https://") && !targetBase.includes(".run.app")) {
      const healthRes = await fetch(`${targetBase}/api/health`).then((r) => r.json()).catch(() => null);
      if (healthRes && healthRes.ok === true) {
        const webhookUrl = `${targetBase}/api/telegram-webhook`;
        const info = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`).then((r) => r.json()).catch(() => null);
        if (info?.result?.url !== webhookUrl) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "callback_query"] })
          }).catch(() => {});
        }
        console.log(`[Telegram Webhook] External Cloudflare Worker is live; using 24/7 webhook: ${webhookUrl}`);
        return;
      }
    }
  } catch {}

  isPolling = true;
  await clearTelegramWebhookForPolling();
  console.log("[Telegram Polling] Starting 24/7 background Telegram bot polling...");

  while (isPolling) {
    try {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateOffset}&timeout=20`;
      const { updates, ok, description } = await new Promise<{ updates: any[]; ok: boolean; description?: string }>((resolve) => {
        https.get(url, (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              resolve({
                ok: Boolean(json.ok),
                description: json.description,
                updates: json.ok && Array.isArray(json.result) ? json.result : []
              });
            } catch {
              resolve({ ok: false, updates: [] });
            }
          });
        }).on("error", (err) => resolve({ ok: false, description: err?.message, updates: [] }));
      });
      if (!ok) {
        if (description && !description.includes("409")) {
          console.warn("[Telegram Polling] getUpdates error:", description);
        }
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }

      for (const update of updates) {
        const uid = Number(update.update_id);
        lastUpdateOffset = Math.max(lastUpdateOffset, uid + 1);
        if (processedUpdateIds.has(uid)) continue;
        processedUpdateIds.add(uid);
        if (processedUpdateIds.size > 2000) {
          const first = processedUpdateIds.values().next().value;
          if (typeof first === "number") processedUpdateIds.delete(first);
        }

        if (update.message) {
          await handleTelegramMessage(update.message).catch((err) => {
            console.warn("[Telegram Polling] Error handling message:", err);
          });
        }
        if (update.callback_query) {
          await handleTelegramCallbackQuery(update.callback_query).catch((err) => {
            console.warn("[Telegram Polling] Error handling callback_query:", err);
          });
        }
      }
    } catch (err) {
      console.warn("[Telegram Polling] Polling loop error, retrying in 3s...", err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// API Routes
// ==========================================
// BROADCAST ENGINE
// ==========================================
interface BroadcastItem {
  id: string;
  serialNumber: number;
  title: string;
  messageType: 'text' | 'photo' | 'video' | 'document';
  text: string;
  mediaUrl?: string;
  buttons: Array<{ label: string; url: string }>;
  buttonLayout: 'single' | 'double';
  targetAudience: string;
  targetValue?: string;
  totalTarget: number;
  sentCount: number;
  failedCount: number;
  status: 'draft' | 'running' | 'paused' | 'stopped' | 'completed';
  currentIndex: number;
  targetUserIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

let activeCampaign: BroadcastItem | null = null;
let broadcastShouldPause = false;
let broadcastShouldStop = false;
let isBroadcastWorkerActive = false;

function buildBroadcastInlineKeyboard(buttons: Array<{ label: string; url: string }>, layout: 'single' | 'double') {
  if (!buttons || !Array.isArray(buttons) || buttons.length === 0) return undefined;
  const validButtons = buttons
    .filter((b) => b && b.label && b.url)
    .map((b) => ({ text: b.label.trim(), url: b.url.trim() }));
  if (validButtons.length === 0) return undefined;

  if (layout === 'double') {
    const rows: any[] = [];
    for (let i = 0; i < validButtons.length; i += 2) {
      if (i + 1 < validButtons.length) {
        rows.push([validButtons[i], validButtons[i + 1]]);
      } else {
        rows.push([validButtons[i]]);
      }
    }
    return { inline_keyboard: rows };
  }
  return { inline_keyboard: validButtons.map((b) => [b]) };
}

async function sendBroadcastTelegramItem(
  chatId: string,
  messageType: 'text' | 'photo' | 'video' | 'document',
  text: string,
  mediaUrl?: string,
  replyMarkup?: any
): Promise<{ ok: boolean; retryAfter?: number; error?: string }> {
  return new Promise((resolve) => {
    let endpoint = "sendMessage";
    const body: any = {
      chat_id: chatId,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    };

    if (messageType === 'photo' && mediaUrl) {
      endpoint = "sendPhoto";
      body.photo = mediaUrl;
      body.caption = text;
    } else if (messageType === 'video' && mediaUrl) {
      endpoint = "sendVideo";
      body.video = mediaUrl;
      body.caption = text;
    } else if (messageType === 'document' && mediaUrl) {
      endpoint = "sendDocument";
      body.document = mediaUrl;
      body.caption = text;
    } else {
      body.text = text;
    }

    const payload = JSON.stringify(body);
    const req = https.request(
      `https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok) {
              resolve({ ok: true });
            } else {
              resolve({
                ok: false,
                retryAfter: parsed.parameters?.retry_after,
                error: parsed.description || "Telegram API Error"
              });
            }
          } catch {
            resolve({ ok: false, error: "Invalid JSON response" });
          }
        });
      }
    );
    req.on("error", (err) => resolve({ ok: false, error: err?.message }));
    req.write(payload);
    req.end();
  });
}

async function runBroadcastWorker() {
  if (isBroadcastWorkerActive || !activeCampaign) return;
  isBroadcastWorkerActive = true;
  broadcastShouldPause = false;
  broadcastShouldStop = false;

  console.log(`[Broadcast Engine] Starting broadcast #${activeCampaign.serialNumber} ("${activeCampaign.title}") targeting ${activeCampaign.totalTarget} users...`);

  const replyMarkup = buildBroadcastInlineKeyboard(activeCampaign.buttons, activeCampaign.buttonLayout);
  let lastSyncTime = Date.now();

  try {
    while (activeCampaign && activeCampaign.currentIndex < activeCampaign.targetUserIds.length) {
      if (broadcastShouldStop) {
        activeCampaign.status = 'stopped';
        activeCampaign.updatedAt = new Date().toISOString();
        await putFirebase(`broadcasts/${activeCampaign.id}`, activeCampaign);
        break;
      }

      if (broadcastShouldPause) {
        activeCampaign.status = 'paused';
        activeCampaign.updatedAt = new Date().toISOString();
        await putFirebase(`broadcasts/${activeCampaign.id}`, activeCampaign);
        break;
      }

      const currentUid = activeCampaign.targetUserIds[activeCampaign.currentIndex];

      if (currentUid && /^\d+$/.test(currentUid)) {
        let result = await sendBroadcastTelegramItem(
          currentUid,
          activeCampaign.messageType,
          activeCampaign.text,
          activeCampaign.mediaUrl,
          replyMarkup
        );

        if (!result.ok && result.retryAfter && result.retryAfter > 0) {
          console.log(`[Broadcast Engine] Rate limit notice. Waiting ${result.retryAfter}s...`);
          await new Promise((r) => setTimeout(r, (result.retryAfter! * 1000) + 150));
          result = await sendBroadcastTelegramItem(
            currentUid,
            activeCampaign.messageType,
            activeCampaign.text,
            activeCampaign.mediaUrl,
            replyMarkup
          );
        }

        if (result.ok) {
          activeCampaign.sentCount++;
        } else {
          activeCampaign.failedCount++;
        }
      } else {
        activeCampaign.failedCount++;
      }

      activeCampaign.currentIndex++;
      activeCampaign.updatedAt = new Date().toISOString();

      // Sync progress to Firebase every 10 users or every 2 seconds
      if (activeCampaign.currentIndex % 10 === 0 || Date.now() - lastSyncTime > 2000) {
        lastSyncTime = Date.now();
        await putFirebase(`broadcasts/${activeCampaign.id}`, activeCampaign);
      }

      // Safe pacing: 40ms (~25 msgs/sec for maximum speed without hitting 30/s ceiling)
      await new Promise((r) => setTimeout(r, 40));
    }

    if (activeCampaign && activeCampaign.currentIndex >= activeCampaign.targetUserIds.length) {
      activeCampaign.status = 'completed';
      activeCampaign.completedAt = new Date().toISOString();
      activeCampaign.updatedAt = new Date().toISOString();
      await putFirebase(`broadcasts/${activeCampaign.id}`, activeCampaign);
      console.log(`[Broadcast Engine] Broadcast #${activeCampaign.serialNumber} finished! Sent: ${activeCampaign.sentCount}, Failed: ${activeCampaign.failedCount}`);
    }
  } catch (err) {
    console.warn("[Broadcast Engine] Error in worker loop:", err);
  } finally {
    isBroadcastWorkerActive = false;
  }
}

// Broadcast Endpoints (Admin-only)
app.post("/api/broadcast/start", requireAdmin, async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.text || !Array.isArray(data.targetUserIds)) {
      return res.status(400).json({ ok: false, error: "Invalid broadcast payload" });
    }

    if (isBroadcastWorkerActive && activeCampaign && activeCampaign.status === 'running') {
      return res.status(409).json({ ok: false, error: "A broadcast is already running. Please pause or stop it first." });
    }

    const now = new Date().toISOString();
    const campaignId = data.id || `bc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Read previous campaigns to get auto-increment serial number
    const existing = (await fetchFirebase<Record<string, any>>("broadcasts")) || {};
    const count = Object.keys(existing).length;
    const serial = Number(data.serialNumber) || count + 1;

    activeCampaign = {
      id: campaignId,
      serialNumber: serial,
      title: data.title || `Broadcast #${serial}`,
      messageType: data.messageType || 'text',
      text: data.text,
      mediaUrl: data.mediaUrl || "",
      buttons: Array.isArray(data.buttons) ? data.buttons : [],
      buttonLayout: data.buttonLayout === 'double' ? 'double' : 'single',
      targetAudience: data.targetAudience || 'all',
      targetValue: data.targetValue || "",
      totalTarget: data.targetUserIds.length,
      sentCount: 0,
      failedCount: 0,
      status: 'running',
      currentIndex: 0,
      targetUserIds: data.targetUserIds,
      createdAt: now,
      updatedAt: now
    };

    await putFirebase(`broadcasts/${activeCampaign.id}`, activeCampaign);
    runBroadcastWorker();

    res.json({ ok: true, campaign: activeCampaign });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

app.post("/api/broadcast/pause", requireAdmin, async (req, res) => {
  broadcastShouldPause = true;
  if (activeCampaign) {
    activeCampaign.status = 'paused';
    activeCampaign.updatedAt = new Date().toISOString();
    await putFirebase(`broadcasts/${activeCampaign.id}`, activeCampaign);
  }
  res.json({ ok: true, status: 'paused', campaign: activeCampaign });
});

app.post("/api/broadcast/resume", requireAdmin, async (req, res) => {
  const { id } = req.body || {};
  let campaignToResume = activeCampaign;

  if (id && (!activeCampaign || activeCampaign.id !== id)) {
    const fetched = await fetchFirebase<BroadcastItem>(`broadcasts/${id}`);
    if (fetched) {
      campaignToResume = fetched;
      activeCampaign = fetched;
    }
  }

  if (!campaignToResume) {
    return res.status(404).json({ ok: false, error: "Campaign not found" });
  }

  campaignToResume.status = 'running';
  campaignToResume.updatedAt = new Date().toISOString();
  await putFirebase(`broadcasts/${campaignToResume.id}`, campaignToResume);

  runBroadcastWorker();
  res.json({ ok: true, status: 'running', campaign: activeCampaign });
});

app.post("/api/broadcast/stop", requireAdmin, async (req, res) => {
  broadcastShouldStop = true;
  if (activeCampaign) {
    activeCampaign.status = 'stopped';
    activeCampaign.updatedAt = new Date().toISOString();
    await putFirebase(`broadcasts/${activeCampaign.id}`, activeCampaign);
  }
  res.json({ ok: true, status: 'stopped', campaign: activeCampaign });
});

app.get("/api/broadcast/status", requireAdmin, (req, res) => {
  res.json({
    ok: true,
    isRunning: isBroadcastWorkerActive,
    activeCampaign
  });
});

app.get("/api/broadcast/history", requireAdmin, async (req, res) => {
  try {
    const data = (await fetchFirebase<Record<string, BroadcastItem>>("broadcasts")) || {};
    const list = Object.values(data);
    list.sort((a, b) => (b.serialNumber || 0) - (a.serialNumber || 0));
    res.json({ ok: true, broadcasts: list });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

app.get("/api/check-member", requireUserOrAdmin, async (req, res) => {
  const caller = (req as any).callerAuth as { isAdmin: boolean; userTid: string | null };
  const rawCh = String(req.query.channel || "").trim();
  const clean = rawCh.replace(/^(https?:\/\/)?(www\.)?(t\.me\/|telegram\.me\/)/i, "").replace(/^@/, "").split("/")[0].split("?")[0].trim();
  const requestedUserId = String(req.query.userId || "").trim();
  const userId = caller.isAdmin ? requestedUserId : String(caller.userTid || "");

  if (!clean || !userId) {
    return res.status(400).json({ ok: false, error: "Missing channel or userId" });
  }

  try {
    const targetChatId = clean.startsWith("-") || /^\d+$/.test(clean) ? clean : `@${clean}`;
    const tgRes = await new Promise<any>((resolve) => {
      https.get(
        `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(targetChatId)}&user_id=${encodeURIComponent(userId)}`,
        (apiRes) => {
          let data = "";
          apiRes.on("data", (c) => (data += c));
          apiRes.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ ok: false });
            }
          });
        }
      ).on("error", () => resolve({ ok: false }));
    });

    if (tgRes.ok && tgRes.result) {
      const st = tgRes.result?.status;
      const isMember = st === "creator" || st === "administrator" || st === "member" || st === "restricted";
      return res.json({ ok: true, isMember, status: st });
    }

    const desc = tgRes.description || "";
    if (desc.includes("member list is inaccessible")) {
      return res.json({ ok: false, isMember: false, needsBotAdmin: true, error: desc });
    }
    return res.json({ ok: false, isMember: false, status: "error", error: desc || "Telegram check failed" });
  } catch (err: any) {
    res.status(500).json({ ok: false, isMember: false, error: err?.message || "Internal server error" });
  }
});

app.post("/api/send-message", requireAdmin, async (req, res) => {
  const { chatId, text, replyMarkup, reply_markup } = req.body || {};
  const targetMarkup = replyMarkup || reply_markup;
  if (!chatId || !text) {
    return res.status(400).json({ ok: false, error: "Missing chatId or text" });
  }
  const ok = await sendTelegramMessage(chatId, text, targetMarkup);
  res.json({ ok });
});

// Dedicated Real-Time Referral & Welcome Notification Engine
app.post("/api/notify-referral", requireAdmin, async (req, res) => {
  try {
    const { newUserId, newUserName, referrerId, isExisting } = req.body || {};

    // Existing users must NEVER trigger referrer notification or welcome message
    if (isExisting) {
      return res.json({ ok: true, status: "existing_user_ignored" });
    }

    const cleanNewUserId = String(newUserId || "").trim().replace(/^@/, '');
    const cleanUserName = String(newUserName || "ইউজার").trim();
    const cleanRefId = String(referrerId || "").trim().replace(/^@/, '');

    // Double check that this user isn't already registered in Firebase
    if (cleanNewUserId && cleanNewUserId !== "724910385") {
      const existingInDb = await fetchFirebase<any>(`users/${cleanNewUserId}`);
      if (existingInDb && (existingInDb.welcomeSent || (existingInDb.createdAt && Date.now() - new Date(existingInDb.createdAt).getTime() > 120000))) {
        return res.json({ ok: true, status: "already_registered" });
      }
    }

    console.log(`[Referral Event] Genuinely New User: ${cleanUserName} (${cleanNewUserId}), Referrer: ${cleanRefId}`);

    const now = new Date().toISOString();
    const cfg = await getServerConfigWithDefaults();
    const activeAppName = String(cfg.appName || APP_NAME).trim();
    const miniUrl = String(cfg.miniAppUrl || MINI_APP_URL || "").trim();
    const openMarkup = buildWebAppMarkup(miniUrl, `🚀 Open ${activeAppName} App`);

    // 1. Send welcome message to brand new user
    if (cleanNewUserId && /^\d+$/.test(cleanNewUserId) && cleanNewUserId !== "724910385") {
      const welcomeText = `🎉 <b>স্বাগতম ${cleanUserName}!</b>\n\n🎁 <b>নতুন জয়েনিং বোনাস:</b> +$0.01 USDT আপনার একাউন্টে যোগ হয়েছে!\n💵 <b>বর্তমান ব্যালেন্স:</b> $0.01 USDT\n\n👉 প্রতিদিন ভিডিও অ্যাড দেখুন ও স্পেশাল টাস্ক পূরণ করে সরাসরি বিকাশ, নগদ বা বাইন্যান্সে টাকা তুলুন।\n👥 <b>প্রতি সফল রেফারে পাবেন:</b> +$0.50 USDT!\n💰 <b>নূন্যতম উইথড্র:</b> $5.00 USDT\n\n🚀 এখনই কাজ শুরু করতে নিচের বাটনে চাপুন!`;
      await sendTelegramMessage(cleanNewUserId, welcomeText, openMarkup);
    }

    // 2. If valid referrer exists, credit them and send Telegram message
    if (cleanRefId && cleanRefId !== cleanNewUserId && /^\d+$/.test(cleanRefId) && cleanRefId !== "724910385") {
      const parent = await fetchFirebase<any>(`users/${cleanRefId}`);
      let currentRefBonus = 0.50;
      let parentCount = 1;
      let parentBalance = 0.50;

      if (parent) {
        parent.referralCount = (Number(parent.referralCount) || 0) + 1;
        parent.balance = Number(((Number(parent.balance) || 0) + currentRefBonus).toFixed(2));
        parent.lifetimeEarned = Number(((Number(parent.lifetimeEarned) || 0) + currentRefBonus).toFixed(2));
        parent.referralEarned = Number(((Number(parent.referralEarned) || 0) + currentRefBonus).toFixed(2));
        parent.updatedAt = Date.now();
        await putFirebase(`users/${cleanRefId}`, parent);

        parentCount = parent.referralCount;
        parentBalance = parent.balance;
      }

      // Record referral in Firebase RTDB
      const refId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await putFirebase(`referrals/${refId}`, {
        id: refId,
        referrerTelegramId: cleanRefId,
        referredTelegramId: cleanNewUserId,
        level: 1,
        bonus: currentRefBonus,
        createdAt: now
      });

      // Send telegram message to referrer
      const referrerText = `🎉 <b>নতুন রেফারেল যুক্ত হয়েছে!</b>\n\n👤 <b>নতুন সদস্য:</b> ${cleanUserName}\n📊 <b>আপনার বর্তমান রেফারেল:</b> ${parentCount} জন\n💰 <b>রেফারেল বোনাস:</b> +$${currentRefBonus.toFixed(2)} USDT\n💵 <b>বর্তমান ব্যালেন্স:</b> $${parentBalance.toFixed(2)} USDT\n🎯 <b>উইথড্র রিকোয়ারমেন্ট:</b> ${parentCount}/15 জন`;
      await sendTelegramMessage(cleanRefId, referrerText, openMarkup);

      // 3. Level 2 Grandparent check
      if (parent && parent.referredBy && parent.referredBy !== cleanRefId && parent.referredBy !== cleanNewUserId) {
        const grandParent = await fetchFirebase<any>(`users/${parent.referredBy}`);
        if (grandParent) {
          grandParent.level2Count = (Number(grandParent.level2Count) || 0) + 1;
          grandParent.balance = Number(((Number(grandParent.balance) || 0) + 0.10).toFixed(2));
          grandParent.lifetimeEarned = Number(((Number(grandParent.lifetimeEarned) || 0) + 0.10).toFixed(2));
          grandParent.referralEarned = Number(((Number(grandParent.referralEarned) || 0) + 0.10).toFixed(2));
          grandParent.updatedAt = Date.now();
          await putFirebase(`users/${parent.referredBy}`, grandParent);

          const gRefId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          await putFirebase(`referrals/${gRefId}`, {
            id: gRefId,
            referrerTelegramId: parent.referredBy,
            referredTelegramId: cleanNewUserId,
            level: 2,
            bonus: 0.10,
            createdAt: now
          });

          await sendTelegramMessage(
            parent.referredBy,
            `🌟 <b>লেভেল ২ টিম মেম্বার যুক্ত হয়েছে!</b>\n\n📊 <b>লেভেল ২ টিম সাইজ:</b> ${grandParent.level2Count} জন\n💰 <b>লেভেল ২ বোনাস:</b> +$0.10 USDT\n💵 <b>বর্তমান ব্যালেন্স:</b> $${grandParent.balance.toFixed(2)} USDT`,
            openMarkup
          );
        }
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[Referral Event Error]:", err);
    res.status(500).json({ ok: false, error: err?.message });
  }
});

app.post("/api/set-menu-button", requireAdmin, async (req, res) => {
  const cfg = await getServerConfigWithDefaults();
  const url = String(req.body?.url || cfg.miniAppUrl || MINI_APP_URL || "").trim();
  const appLabel = String(cfg.appName || APP_NAME).trim();
  if (!BOT_TOKEN || !url) {
    return res.json({ ok: false });
  }
  try {
    const payload = JSON.stringify({
      menu_button: {
        type: "web_app",
        text: `🚀 Open ${appLabel}`,
        web_app: { url }
      }
    });
    const reqTg = https.request(
      `https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (resTg) => {
        let data = "";
        resTg.on("data", (c) => (data += c));
        resTg.on("end", () => {
          try {
            res.json(JSON.parse(data));
          } catch {
            res.json({ ok: false });
          }
        });
      }
    );
    reqTg.on("error", () => res.json({ ok: false }));
    reqTg.write(payload);
    reqTg.end();
  } catch {
    res.json({ ok: false });
  }
});

app.post("/api/telegram-webhook", async (req, res) => {
  if (req.body) {
    if (req.body.message) {
      handleTelegramMessage(req.body.message).catch(console.error);
    }
    if (req.body.callback_query) {
      handleTelegramCallbackQuery(req.body.callback_query).catch(console.error);
    }
  }
  res.sendStatus(200);
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

let botProfileCooldownUntil = 0;

// Bot Security & Bio Integrity Watchdog
async function syncOfficialBotBio(purgeForeign = false): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  if (Date.now() < botProfileCooldownUntil) return false;
  try {
    const postCall = (endpoint: string, body: any) => new Promise<any>((resolve) => {
      if (Date.now() < botProfileCooldownUntil) return resolve({ ok: false, skipped: true });
      const p = JSON.stringify(body);
      const r = https.request(`https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(p, "utf8") }
      }, (res) => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => {
          try {
            const parsed = JSON.parse(d);
            if (parsed?.error_code === 429 && parsed?.parameters?.retry_after) {
              botProfileCooldownUntil = Date.now() + (Number(parsed.parameters.retry_after) + 5) * 1000;
            }
            resolve(parsed);
          } catch {
            resolve({});
          }
        });
      });
      r.on("error", () => resolve({}));
      r.write(p);
      r.end();
    });

    if (purgeForeign) {
      const foreignLangs = ['ru', 'bn', 'hi', 'ar', 'es', 'pt', 'id', 'de', 'fr', 'zh', 'fa', 'tr', 'uz'];
      for (const l of foreignLangs) {
        if (Date.now() < botProfileCooldownUntil) break;
        await postCall("setMyShortDescription", { short_description: "", language_code: l });
        await postCall("setMyDescription", { description: "", language_code: l });
      }
    }

    const cfg = await getServerConfigWithDefaults();
    const activeAppName = String(cfg.appName || APP_NAME).trim();
    const activeMiniUrl = String(cfg.miniAppUrl || MINI_APP_URL || "").trim();

    // 2. Set official default bio & description
    const defaultShort = `🛍️ ${activeAppName} - ভিডিও বিজ্ঞাপন দেখুন ও রেফার করে সরাসরি বিকাশ, নগদ বা বাইন্যান্সে ইনকাম করুন!`;
    const defaultDesc = `👋 স্বাগতম ${activeAppName} অফিসিয়াল বটে!\n\n💰 প্রতিদিন ভিডিও বিজ্ঞাপন দেখুন ও স্পেশাল টাস্ক সম্পন্ন করে সরাসরি আয় করুন।\n👥 প্রতি সফল রেফারে পাবেন +$0.50 USDT!\n💵 নূন্যতম উইথড্র: $5.00 USDT (বিকাশ, নগদ, বাইন্যান্স)।\n\n🚀 এখনই কাজ শুরু করতে নিচের Start বাটনে চাপুন অথবা মেনু থেকে Mini App খুলুন!`;
    await postCall("setMyShortDescription", { short_description: defaultShort });
    await postCall("setMyDescription", { description: defaultDesc });

    // 3. Set official English bio & description (so English Telegram users see official info)
    const enShort = `🛍️ ${activeAppName} - Watch video ads, complete tasks, invite friends and earn USDT!`;
    const enDesc = `👋 Welcome to ${activeAppName} Official Bot!\n\n💰 Watch daily video ads and complete tasks to earn USDT.\n👥 Earn +$0.50 USDT per referral!\n💵 Minimum withdrawal: $5.00 USDT (Bkash, Nagad, Binance).\n\n🚀 Tap Start below or open the Mini App to start earning now!`;
    await postCall("setMyShortDescription", { short_description: enShort, language_code: "en" });
    await postCall("setMyDescription", { description: enDesc, language_code: "en" });

    // 4. Set Mini App Menu Button
    if (activeMiniUrl && activeMiniUrl.startsWith("https://")) {
      await postCall("setChatMenuButton", {
        menu_button: {
          type: "web_app",
          text: `🚀 Open ${activeAppName}`,
          web_app: { url: activeMiniUrl }
        }
      });
    }

    if (Date.now() >= botProfileCooldownUntil) {
      console.log(`[Bot Security] Official ${activeAppName} (@${BOT_USERNAME}) bio, description & menu button (${activeMiniUrl}) enforced successfully.`);
    }
    return Date.now() >= botProfileCooldownUntil;
  } catch (err) {
    console.warn("[Bot Security] syncOfficialBotBio error:", err);
    return false;
  }
}

async function enforceBotProfile() {
  if (!BOT_TOKEN || Date.now() < botProfileCooldownUntil) return;
  try {
    const fetchApi = (method: string, lang = "") => new Promise<any>((resolve) => {
      const qs = lang ? `?language_code=${encodeURIComponent(lang)}` : "";
      https.get(`https://api.telegram.org/bot${BOT_TOKEN}/${method}${qs}`, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try { resolve(JSON.parse(d)); } catch { resolve({}); }
        });
      }).on("error", () => resolve({}));
    });

    const cfg = await getServerConfigWithDefaults();
    const expectedAppName = String(cfg.appName || APP_NAME).trim();
    const expectedMiniUrl = String(cfg.miniAppUrl || MINI_APP_URL || "").trim();

    const [defShort, enShort, menuBtn] = await Promise.all([
      fetchApi("getMyShortDescription"),
      fetchApi("getMyShortDescription", "en"),
      fetchApi("getChatMenuButton")
    ]);

    const s1 = defShort?.result?.short_description || "";
    const s2 = enShort?.result?.short_description || "";
    const currentMenuUrl = String(menuBtn?.result?.web_app?.url || "").trim();
    const currentMenuText = String(menuBtn?.result?.text || "").trim();
    const menuUrlMismatch = Boolean(expectedMiniUrl && expectedMiniUrl.startsWith("https://") && currentMenuUrl !== expectedMiniUrl);
    const menuTextMismatch = currentMenuText !== `🚀 Open ${expectedAppName}`;

    if (s1.includes("chatprovider") || s2.includes("chatprovider") || !s1.includes(expectedAppName) || !s2.includes(expectedAppName) || menuUrlMismatch || menuTextMismatch) {
      console.log(`[Bot Security] Profile or Menu mismatch detected! Syncing official ${expectedAppName} profile & menu button...`);
      await syncOfficialBotBio(false);
    }
  } catch (e) {
    // Ignore minor network quirks
  }
}

app.post("/api/bot/sync-profile", requireAdmin, async (req, res) => {
  const ok = await syncOfficialBotBio();
  res.json({ ok });
});

app.post("/api/bot/set-webhook", requireAdmin, async (req, res) => {
  if (!BOT_TOKEN) return res.status(503).json({ ok: false, error: "missing_bot_token" });
  const cfg = await getServerConfigWithDefaults();
  const base = String(req.body?.url || cfg.miniAppUrl || MINI_APP_URL || DEFAULT_MINI_APP_URL).trim().replace(/\/+$/, "");
  const webhookUrl = base.endsWith("/api/telegram-webhook") ? base : `${base}/api/telegram-webhook`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "callback_query"] })
    });
    res.json(await r.json().catch(() => ({ ok: false })));
  } catch {
    res.json({ ok: false });
  }
});

// ==========================================
// ADMIN AUTHENTICATION & SECURITY PIN ROUTES
// ==========================================
app.post("/api/admin/login", async (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const failState = adminPinFailures.get(ip);
  if (failState && failState.lockedUntil > now) {
    const mins = Math.ceil((failState.lockedUntil - now) / 60000);
    return res.status(429).json({
      ok: false,
      error: `অনেকবার ভুল পিন দেওয়া হয়েছে! অনুগ্রহ করে ${mins} মিনিট পর চেষ্টা করুন।`
    });
  }

  const pin = String(req.body?.pin || "").trim();
  if (!pin) {
    return res.status(400).json({ ok: false, error: "সিকিউরিটি পিন দিন।" });
  }

  const cfg = await getServerConfigWithDefaults();
  const expectedHash = String(cfg.adminPinHash || DEFAULT_ADMIN_PIN_HASH).toLowerCase();
  const enteredHash = sha256Hex(pin).toLowerCase();

  if (!timingSafeCompare(enteredHash, expectedHash)) {
    const nextCount = (failState?.count || 0) + 1;
    const lockedUntil = nextCount >= 5 ? now + 10 * 60_000 : 0;
    adminPinFailures.set(ip, { count: nextCount, lockedUntil });
    return res.status(401).json({ ok: false, error: "ভুল সিকিউরিটি পিন!" });
  }

  adminPinFailures.delete(ip);
  const adminToken = signAuthToken({
    role: "admin",
    exp: now + 12 * 60 * 60 * 1000
  });
  return res.json({ ok: true, adminToken });
});

app.get("/api/admin/session", requireAdmin, (req, res) => {
  return res.json({ ok: true });
});

app.post("/api/admin/change-pin", requireAdmin, async (req, res) => {
  const currentPin = String(req.body?.currentPin || "").trim();
  const newPin = String(req.body?.newPin || "").trim();

  if (!currentPin || !newPin) {
    return res.status(400).json({ ok: false, error: "সবগুলো ঘর পূরণ করুন" });
  }
  if (newPin.length < 4) {
    return res.status(400).json({ ok: false, error: "নতুন পিন নূন্যতম ৪ সংখ্যার হতে হবে" });
  }

  const rawCfg = (await fetchFirebase<Record<string, any>>("config")) || {};
  const expectedHash = String(rawCfg.adminPinHash || DEFAULT_ADMIN_PIN_HASH).toLowerCase();
  const enteredCurHash = sha256Hex(currentPin).toLowerCase();

  if (!timingSafeCompare(enteredCurHash, expectedHash)) {
    return res.status(403).json({ ok: false, error: "বর্তমান সিকিউরিটি পিন সঠিক নয়" });
  }

  const nextHash = sha256Hex(newPin);
  const nextCfg = {
    ...rawCfg,
    adminPinHash: nextHash,
    updatedAt: Date.now()
  };
  const ok = await putFirebase("config", nextCfg);
  return res.json({ ok });
});

// ==========================================
// USER AUTH SESSION & SERVER-AUTHORITATIVE EARN/FINANCIAL ROUTES
// ==========================================
app.post("/api/auth/session", async (req, res) => {
  try {
    const { initData, telegramUser, referredBy } = req.body || {};
    const cfg = await getServerConfigWithDefaults();

    let verifiedTgUser: { id: number | string; first_name?: string; last_name?: string; username?: string; photo_url?: string } | null = null;
    let verifiedRefParam: string | null = null;

    if (initData && typeof initData === "string" && initData.trim()) {
      const check = verifyTelegramInitData(initData.trim());
      if (!check.valid || !check.user) {
        return res.status(401).json({ ok: false, error: "invalid_telegram_init_data" });
      }
      verifiedTgUser = check.user;
      verifiedRefParam = check.startParam || null;
    } else {
      // Browser preview / demo mode only allowed when allowDemoLogin is enabled and limited to demo IDs
      if (cfg.allowDemoLogin === false) {
        return res.status(403).json({ ok: false, error: "demo_login_disabled" });
      }
      const reqTid = String(telegramUser?.id || "724910385").trim();
      const isAllowedDemoId =
        reqTid === "724910385" ||
        (/^7\d{8}$/.test(reqTid) && Number(reqTid) >= 700000000 && Number(reqTid) <= 799999999);
      if (!isAllowedDemoId) {
        return res.status(401).json({ ok: false, error: "telegram_init_data_required" });
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
    const displayName =
      [verifiedTgUser.first_name, verifiedTgUser.last_name].filter(Boolean).join(" ").trim() || "User";

    const rawRef = (verifiedRefParam || referredBy || "").toString().trim().replace(/^(ref_|c2c_|r_|startapp_|start_)/i, "");
    const cleanReferrer =
      rawRef && rawRef !== tid && /^\d+$/.test(rawRef) ? rawRef : null;

    let user = await fetchFirebase<any>(`users/${tid}`);
    let isBrandNewUser = false;
    let welcomeDelivered = false;
    const appTitle = String(cfg.appName || APP_NAME).trim() || APP_NAME;
    const miniUrl = String(cfg.miniAppUrl || MINI_APP_URL || "").trim();
    const openAppMarkup = buildWebAppMarkup(miniUrl, `🚀 Open ${appTitle} App`);
    const wb = Number(cfg.welcomeBonus ?? 0.01);
    const l1Bonus = Number(cfg.referralBonus ?? 0.5);
    const minWithdraw = Number(cfg.minWithdraw ?? 5);
    const isDemo = tid === "724910385" || verifiedTgUser.username === "demo_user";

    if (user && user.telegramId) {
      if (user.banned) {
        return res.status(403).json({ ok: false, error: "banned", user });
      }
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
      await putFirebase(`users/${tid}`, user);

      if (!user.welcomeSent && !isDemo && /^\d+$/.test(tid)) {
        sendWelcomeMessageOnce(
          tid,
          {
            firstName: user.firstName,
            welcomeBonus: wb,
            balance: Number(user.balance || 0),
            referralBonus: l1Bonus,
            minWithdraw
          },
          openAppMarkup
        ).catch(() => {});
      } else {
        welcomeDelivered = Boolean(user.welcomeSent);
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
      await putFirebase(`users/${tid}`, user);

      // Dispatch welcome log, Telegram Welcome PM, and L1/L2 referral bonuses asynchronously so account creation finishes instantly
      (async () => {
        if (wb > 0) {
          const wbLogId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          putFirebase(`logs/${wbLogId}`, {
            id: wbLogId,
            telegramId: tid,
            kind: "task",
            label: "🎁 সাইনআপ ওয়েলকাম বোনাস",
            amount: Number(wb.toFixed(2)),
            createdAt: nowIso
          }).catch(() => {});
        }

        if (!isDemo && /^\d+$/.test(tid)) {
          sendWelcomeMessageOnce(
            tid,
            {
              firstName: user.firstName,
              welcomeBonus: wb,
              balance: Number(user.balance),
              referralBonus: l1Bonus,
              minWithdraw
            },
            openAppMarkup
          ).catch(() => {});
        }

        if (cleanReferrer && cleanReferrer !== tid && !isDemo) {
          try {
            const existingRefs = (await fetchFirebase<Record<string, any>>("referrals")) || {};
            const alreadyRef = Object.values(existingRefs).some((r: any) => r?.referredTelegramId === tid);

            if (!alreadyRef) {
              const parent = await fetchFirebase<any>(`users/${cleanReferrer}`);
              if (parent && parent.telegramId) {
                parent.referralCount = (Number(parent.referralCount) || 0) + 1;
                parent.balance = Number(((Number(parent.balance) || 0) + l1Bonus).toFixed(2));
                parent.lifetimeEarned = Number(((Number(parent.lifetimeEarned) || 0) + l1Bonus).toFixed(2));
                parent.referralEarned = Number(((Number(parent.referralEarned) || 0) + l1Bonus).toFixed(2));
                parent.updatedAt = Date.now();
                await putFirebase(`users/${cleanReferrer}`, parent);

                const refId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                await putFirebase(`referrals/${refId}`, {
                  id: refId,
                  referrerTelegramId: cleanReferrer,
                  referredTelegramId: tid,
                  level: 1,
                  bonus: l1Bonus,
                  createdAt: nowIso
                });

                const minRefs = Number(cfg.minReferralsForWithdraw ?? 15);
                const referrerText = `🎉 <b>নতুন রেফারেল যুক্ত হয়েছে!</b>\n\n👤 <b>নতুন সদস্য:</b> ${sanitizeHtml(displayName)}\n📊 <b>আপনার বর্তমান রেফারেল:</b> ${parent.referralCount} জন\n💰 <b>রেফারেল বোনাস:</b> +$${l1Bonus.toFixed(2)} USDT\n💵 <b>বর্তমান ব্যালেন্স:</b> $${parent.balance.toFixed(2)} USDT\n🎯 <b>উইথড্র রিকোয়ারমেন্ট:</b> ${parent.referralCount}/${minRefs} জন`;
                sendTelegramMessage(cleanReferrer, referrerText, openAppMarkup).catch(() => {});

                if (parent.referredBy && parent.referredBy !== cleanReferrer && parent.referredBy !== tid) {
                  const l2Bonus = Number(cfg.level2Bonus ?? 0.1);
                  const grandParent = await fetchFirebase<any>(`users/${parent.referredBy}`);
                  if (grandParent && grandParent.telegramId) {
                    grandParent.level2Count = (Number(grandParent.level2Count) || 0) + 1;
                    grandParent.balance = Number(((Number(grandParent.balance) || 0) + l2Bonus).toFixed(2));
                    grandParent.lifetimeEarned = Number(((Number(grandParent.lifetimeEarned) || 0) + l2Bonus).toFixed(2));
                    grandParent.referralEarned = Number(((Number(grandParent.referralEarned) || 0) + l2Bonus).toFixed(2));
                    grandParent.updatedAt = Date.now();
                    await putFirebase(`users/${parent.referredBy}`, grandParent);

                    const gRefId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    await putFirebase(`referrals/${gRefId}`, {
                      id: gRefId,
                      referrerTelegramId: parent.referredBy,
                      referredTelegramId: tid,
                      level: 2,
                      bonus: l2Bonus,
                      createdAt: nowIso
                    });

                    sendTelegramMessage(
                      parent.referredBy,
                      `🌟 <b>লেভেল ২ টিম মেম্বার যুক্ত হয়েছে!</b>\n\n📊 <b>লেভেল ২ টিম সাইজ:</b> ${grandParent.level2Count} জন\n💰 <b>লেভেল ২ বোনাস:</b> +$${l2Bonus.toFixed(2)} USDT\n💵 <b>বর্তমান ব্যালেন্স:</b> $${grandParent.balance.toFixed(2)} USDT`,
                      openAppMarkup
                    ).catch(() => {});
                  }
                }
              }
            }
          } catch (refErr) {
            console.warn("[Auth Session Background Referral Error]:", refErr);
          }
        }
      })().catch(() => {});
    }

    const userToken = signAuthToken({
      role: "user",
      tid,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    });
    return res.json({ ok: true, user, userToken, isBrandNewUser, welcomeDelivered });
  } catch (err: any) {
    console.warn("[Auth Session Error]:", err);
    return res.status(500).json({ ok: false, error: "auth_failed" });
  }
});

// Retry sending welcome message once Telegram write access is granted from Mini App
app.post("/api/user/retry-welcome", requireUser, async (req, res) => {
  try {
    const tid = String((req as any).userTid);
    const user = await fetchFirebase<any>(`users/${tid}`);
    if (!user) return res.status(404).json({ ok: false, error: "user_not_found" });
    if (user.welcomeSent) {
      return res.json({ ok: true, alreadySent: true, delivered: true, user });
    }
    const isDemo = tid === "724910385" || user.username === "demo_user";
    if (isDemo || !/^\d+$/.test(tid)) {
      return res.json({ ok: true, delivered: false, user });
    }

    const cfg = await getServerConfigWithDefaults();
    const appTitle = String(cfg.appName || APP_NAME).trim() || APP_NAME;
    const miniUrl = String(cfg.miniAppUrl || MINI_APP_URL || "").trim();
    const wb = Number(cfg.welcomeBonus ?? 0.01);
    const l1Bonus = Number(cfg.referralBonus ?? 0.5);
    const minWithdraw = Number(cfg.minWithdraw ?? 5);

    const welcomeMsg = buildWelcomeMessageText({
      firstName: user.firstName || "User",
      welcomeBonus: wb,
      balance: Number(user.balance || 0),
      referralBonus: l1Bonus,
      minWithdraw
    });
    const delivered = await sendTelegramMessage(tid, welcomeMsg, buildWebAppMarkup(miniUrl, `🚀 Open ${appTitle} App`));
    if (delivered) {
      user.welcomeSent = true;
      user.updatedAt = Date.now();
      await patchFirebaseItem(`users/${tid}`, { welcomeSent: true });
    }
    return res.json({ ok: true, delivered, user });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "retry_welcome_failed" });
  }
});

app.post("/api/verify-channels", requireUser, async (req, res) => {
  try {
    const tid = String((req as any).userTid);
    const clickedIds: string[] = Array.isArray(req.body?.clickedIds) ? req.body.clickedIds : [];
    const isManualClick = Boolean(req.body?.isManualClick);

    const cfg = await getServerConfigWithDefaults();
    const user = await fetchFirebase<any>(`users/${tid}`);
    if (!user) return res.status(404).json({ ok: false, error: "user_not_found" });

    if (cfg.forceChannelVerification === false) {
      if (!user.verified) {
        await patchFirebaseItem(`users/${tid}`, { verified: true });
      }
      return res.json({ ok: true, verified: true, joinedMap: {}, missingNames: [], adminNotice: null });
    }

    const channels = Array.isArray(cfg.requiredChannels) && cfg.requiredChannels.length > 0
      ? cfg.requiredChannels
      : SERVER_DEFAULT_CHANNELS;

    const joinedMap: Record<string, boolean> = {};
    const missingNames: string[] = [];
    let allMembers = true;
    let adminNotice: string | null = null;
    const isDemo = tid === "724910385" || user.username === "demo_user";

    for (const ch of channels) {
      if (!ch?.username) {
        if (ch?.id) joinedMap[ch.id] = true;
        continue;
      }
      const clean = String(ch.username)
        .replace(/^(https?:\/\/)?(www\.)?(t\.me\/|telegram\.me\/)/i, "")
        .replace(/^@/, "")
        .split("/")[0]
        .split("?")[0]
        .trim();
      const targetChatId = clean.startsWith("-") || /^\d+$/.test(clean) ? clean : `@${clean}`;

      const tgRes = await new Promise<any>((resolve) => {
        https.get(
          `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(targetChatId)}&user_id=${encodeURIComponent(tid)}`,
          (apiRes) => {
            let data = "";
            apiRes.on("data", (c) => (data += c));
            apiRes.on("end", () => {
              try { resolve(JSON.parse(data)); } catch { resolve({ ok: false }); }
            });
          }
        ).on("error", () => resolve({ ok: false }));
      });

      if (tgRes.ok && tgRes.result) {
        const st = tgRes.result.status;
        const member = st === "creator" || st === "administrator" || st === "member" || st === "restricted";
        joinedMap[ch.id] = member;
        if (!member) {
          allMembers = false;
          missingNames.push(ch.name || ch.username);
        }
      } else if ((tgRes.description || "").includes("member list is inaccessible")) {
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
    await patchFirebaseItem(`users/${tid}`, { verified: allMembers });

    if (allMembers && !isDemo && /^\d+$/.test(tid) && (isManualClick || !wasVerified)) {
      const appTitle = String(cfg.appName || APP_NAME).trim() || APP_NAME;
      const miniUrl = String(cfg.miniAppUrl || MINI_APP_URL || DEFAULT_MINI_APP_URL).trim();
      const botUser = String(cfg.botUsername || BOT_USERNAME || "Nadag88Bot").trim().replace(/^@/, "");
      const verifyMsg = buildChannelVerifiedMessageText({
        firstName: user.firstName || "ইউজার",
        balance: Number(user.balance || 0),
        referralCount: Number(user.referralCount || 0),
        botUsername: botUser,
        tid
      });
      sendTelegramMessage(tid, verifyMsg, buildWebAppMarkup(miniUrl, `🚀 Open ${appTitle} App`)).catch(() => {});
    }

    return res.json({
      ok: true,
      verified: allMembers,
      joinedMap,
      missingNames,
      adminNotice
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "verify_failed" });
  }
});

// Server-Authoritative Ad Reward Endpoint
app.post("/api/earn/ad", requireUser, async (req, res) => {
  try {
    const tid = String((req as any).userTid);
    const slotId = String(req.body?.slotId || "").trim();
    if (!slotId) return res.status(400).json({ ok: false, error: "missing_slot" });

    const user = await fetchFirebase<any>(`users/${tid}`);
    if (!user) return res.status(404).json({ ok: false, error: "user_not_found" });
    if (user.banned) return res.status(403).json({ ok: false, error: "banned" });

    const cfg = await getServerConfigWithDefaults();
    const slots = Array.isArray(cfg.adSlots) && cfg.adSlots.length > 0 ? cfg.adSlots : SERVER_DEFAULT_AD_SLOTS;
    const slot = slots.find((s: any) => s.id === slotId);
    if (!slot) return res.status(404).json({ ok: false, error: "invalid_slot" });

    const nowMs = Date.now();
    if (user.lastAdClaimAt && nowMs - Number(user.lastAdClaimAt) < 45_000) {
      return res.status(429).json({ ok: false, error: "too_fast_claim" });
    }

    const nowIso = new Date(nowMs).toISOString();
    const todayStr = nowIso.slice(0, 10);
    const hourKey = nowIso.slice(0, 13);

    if (user.todayDate !== todayStr) {
      user.todayDate = todayStr;
      user.todayEarned = 0;
      user.adsWatchedToday = 0;
    }

    const rawHourly = (user.adHourlyCounts && typeof user.adHourlyCounts === "object") ? { ...user.adHourlyCounts } : {};
    // Prune hour keys older than 48 hours
    const cutoffIso = new Date(nowMs - 48 * 3600 * 1000).toISOString().slice(0, 13);
    for (const k of Object.keys(rawHourly)) {
      if (k < cutoffIso) delete rawHourly[k];
    }

    const curHourMap = { ...(rawHourly[hourKey] || {}) };
    const slotCountHour = Number(curHourMap[slot.id] || 0);
    const hourlyLimit = Number(cfg.adHourlyLimitPerSlot || 10);
    if (slotCountHour >= hourlyLimit) {
      return res.status(429).json({ ok: false, error: "hourly_limit_reached", user });
    }

    const dailyLimit = Number(cfg.adDailyLimitPerSlot || 200);
    let slotCountToday = 0;
    for (const [hk, map] of Object.entries(rawHourly)) {
      if (hk.startsWith(todayStr) && map && typeof map === "object") {
        slotCountToday += Number((map as Record<string, any>)[slot.id] || 0);
      }
    }
    if (slotCountToday >= dailyLimit) {
      return res.status(429).json({ ok: false, error: "daily_limit_reached", user });
    }

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

    await putFirebase(`users/${tid}`, user);

    const logId = `log_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
    const logItem = {
      id: logId,
      telegramId: tid,
      kind: "ad",
      label: `${slot.title} (${slot.id})`,
      amount: reward,
      createdAt: nowIso
    };
    await putFirebase(`logs/${logId}`, logItem);

    return res.json({ ok: true, reward, user, log: logItem });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "ad_earn_error" });
  }
});

// Server-Authoritative Video Watch Reward Endpoint
app.post("/api/earn/video", requireUser, async (req, res) => {
  try {
    const tid = String((req as any).userTid);
    const videoId = String(req.body?.videoId || "").trim();
    if (!videoId) return res.status(400).json({ ok: false, error: "missing_video" });

    const user = await fetchFirebase<any>(`users/${tid}`);
    if (!user) return res.status(404).json({ ok: false, error: "user_not_found" });
    if (user.banned) return res.status(403).json({ ok: false, error: "banned" });

    if (user.watchedVideos && user.watchedVideos[videoId]) {
      return res.status(409).json({ ok: false, error: "already_watched", user });
    }

    const cfg = await getServerConfigWithDefaults();
    const videos = Array.isArray(cfg.videos) && cfg.videos.length > 0 ? cfg.videos : SERVER_DEFAULT_VIDEOS;
    const video = videos.find((v: any) => v.id === videoId);
    if (!video) return res.status(404).json({ ok: false, error: "invalid_video" });

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const todayStr = nowIso.slice(0, 10);
    if (user.todayDate !== todayStr) {
      user.todayDate = todayStr;
      user.todayEarned = 0;
      user.adsWatchedToday = 0;
    }

    const reward = Number(Number(video.reward || 0.05).toFixed(2));
    user.watchedVideos = { ...(user.watchedVideos || {}), [video.id]: true };
    user.balance = Number(((Number(user.balance) || 0) + reward).toFixed(2));
    user.todayEarned = Number(((Number(user.todayEarned) || 0) + reward).toFixed(2));
    user.lifetimeEarned = Number(((Number(user.lifetimeEarned) || 0) + reward).toFixed(2));
    user.updatedAt = nowMs;

    await putFirebase(`users/${tid}`, user);

    const logId = `log_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
    const logItem = {
      id: logId,
      telegramId: tid,
      kind: "task",
      label: `ভিডিও দেখা: ${video.title}`,
      amount: reward,
      createdAt: nowIso
    };
    await putFirebase(`logs/${logId}`, logItem);

    return res.json({ ok: true, reward, user, log: logItem });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "video_earn_error" });
  }
});

// Server-Authoritative Direct Link Task Reward Endpoint
app.post("/api/earn/task", requireUser, async (req, res) => {
  try {
    const tid = String((req as any).userTid);
    const taskId = String(req.body?.taskId || "").trim();
    if (!taskId) return res.status(400).json({ ok: false, error: "missing_task" });

    const user = await fetchFirebase<any>(`users/${tid}`);
    if (!user) return res.status(404).json({ ok: false, error: "user_not_found" });
    if (user.banned) return res.status(403).json({ ok: false, error: "banned" });

    const nowMs = Date.now();
    if (user.lastTaskClaimAt && nowMs - Number(user.lastTaskClaimAt) < 45_000) {
      return res.status(429).json({ ok: false, error: "too_fast_claim" });
    }

    const cfg = await getServerConfigWithDefaults();
    const tasks = Array.isArray(cfg.tasks) && cfg.tasks.length > 0 ? cfg.tasks : SERVER_DEFAULT_TASKS;
    const task = tasks.find((t: any) => t.id === taskId);
    if (!task) return res.status(404).json({ ok: false, error: "invalid_task" });

    const nowIso = new Date(nowMs).toISOString();
    const todayStr = nowIso.slice(0, 10);
    if (user.todayDate !== todayStr) {
      user.todayDate = todayStr;
      user.todayEarned = 0;
      user.adsWatchedToday = 0;
    }

    const reward = Number(Number(task.reward || 0.05).toFixed(2));
    user.lastTaskClaimAt = nowMs;
    user.balance = Number(((Number(user.balance) || 0) + reward).toFixed(2));
    user.todayEarned = Number(((Number(user.todayEarned) || 0) + reward).toFixed(2));
    user.lifetimeEarned = Number(((Number(user.lifetimeEarned) || 0) + reward).toFixed(2));
    user.updatedAt = nowMs;

    await putFirebase(`users/${tid}`, user);

    const logId = `log_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
    const logItem = {
      id: logId,
      telegramId: tid,
      kind: "task",
      label: task.title || "Task Reward",
      amount: reward,
      createdAt: nowIso
    };
    await putFirebase(`logs/${logId}`, logItem);

    return res.json({ ok: true, reward, user, log: logItem });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "task_earn_error" });
  }
});

// Server-Authoritative Withdrawal Request Endpoint
app.post("/api/withdrawals/request", requireUser, async (req, res) => {
  try {
    const tid = String((req as any).userTid);
    const rawAmount = Number(req.body?.amount);
    const account = String(req.body?.account || "").trim();
    const method = String(req.body?.method || "bKash").trim();

    if (!account) {
      return res.status(400).json({ ok: false, reason: "missing_account" });
    }
    const cleanAcct = account.replace(/[\s-]/g, "");
    const isBinance = method.toLowerCase().includes("binance");
    if (isBinance ? cleanAcct.length < 4 : !/^01\d{9}$/.test(cleanAcct)) {
      return res.status(400).json({ ok: false, reason: "missing_account" });
    }

    const user = await fetchFirebase<any>(`users/${tid}`);
    if (!user) return res.status(404).json({ ok: false, reason: "user_not_found" });
    if (user.banned) return res.status(403).json({ ok: false, reason: "banned" });

    const cfg = await getServerConfigWithDefaults();
    const minWithdraw = Number(cfg.minWithdraw ?? 5);
    const minRefs = Number(cfg.minReferralsForWithdraw ?? 15);
    const amount = Number(rawAmount.toFixed(2));

    if (!Number.isFinite(amount) || amount < minWithdraw) {
      return res.status(400).json({ ok: false, reason: "below_minimum" });
    }
    if (Number(user.balance || 0) < amount) {
      return res.status(400).json({ ok: false, reason: "insufficient_balance" });
    }
    if (Number(user.referralCount || 0) < minRefs) {
      return res.status(400).json({ ok: false, reason: "not_enough_referrals" });
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    user.balance = Number((Number(user.balance) - amount).toFixed(2));
    user.binanceId = account;
    user.updatedAt = nowMs;
    await putFirebase(`users/${tid}`, user);

    const wdId = `wd_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const wd = {
      id: wdId,
      telegramId: tid,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || tid,
      amount,
      fee: 0,
      method,
      account,
      status: "pending",
      refunded: false,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    await putFirebase(`withdrawals/${wdId}`, wd);

    return res.json({ ok: true, withdrawal: wd, user });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "withdrawal_failed" });
  }
});

// Server-Authoritative Task Proof Submission Endpoint
app.post("/api/task-submissions", requireUser, async (req, res) => {
  try {
    const tid = String((req as any).userTid);
    const taskId = String(req.body?.taskId || "").trim();
    const screenshots: string[] = Array.isArray(req.body?.screenshots) ? req.body.screenshots : [];
    const note = String(req.body?.note || "").trim().slice(0, 500);

    if (!taskId || screenshots.length === 0) {
      return res.status(400).json({ ok: false, reason: "missing_data" });
    }

    const user = await fetchFirebase<any>(`users/${tid}`);
    if (!user) return res.status(404).json({ ok: false, reason: "user_not_found" });
    if (user.banned) return res.status(403).json({ ok: false, reason: "banned" });

    const cfg = await getServerConfigWithDefaults();
    const posts = Array.isArray(cfg.taskPosts) && cfg.taskPosts.length > 0 ? cfg.taskPosts : SERVER_DEFAULT_TASK_POSTS;
    const post = posts.find((p: any) => p.id === taskId && p.active !== false);
    if (!post) {
      return res.status(404).json({ ok: false, reason: "task_not_found" });
    }

    const reqShots = Math.max(1, Math.min(3, Number(post.requiredScreenshots) || 1));
    if (screenshots.length < reqShots) {
      return res.status(400).json({ ok: false, reason: "missing_data" });
    }

    const maxLimit = Math.max(1, Math.floor(Number(post.maxCompletions) || 1));
    const existingMap = (await fetchFirebase<Record<string, any>>("taskSubmissions")) || {};
    const userSubs = Object.values(existingMap).filter(
      (s: any) => s?.taskId === post.id && s?.telegramId === tid
    );

    if (userSubs.some((s: any) => s?.status === "pending")) {
      return res.status(409).json({ ok: false, reason: "already_pending" });
    }
    const approvedCount = userSubs.filter((s: any) => s?.status === "approved").length;
    if (approvedCount >= maxLimit) {
      return res.status(409).json({ ok: false, reason: "already_approved" });
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const subId = `tsub_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const sub = {
      id: subId,
      taskId: post.id,
      taskTitle: String(post.title || ""),
      taskBannerUrl: String(post.bannerUrl || ""),
      telegramId: tid,
      userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || tid,
      reward: Number(Number(post.reward || 0).toFixed(2)),
      screenshots: screenshots.slice(0, 3),
      note,
      status: "pending",
      createdAt: nowIso
    };

    await putFirebase(`taskSubmissions/${subId}`, sub);
    return res.json({ ok: true, submission: sub });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "submission_failed" });
  }
});

// Safe Self-Profile Patch Endpoint (never allows balance/verified/banned tampering)
app.patch("/api/user/profile", requireUser, async (req, res) => {
  try {
    const tid = String((req as any).userTid);
    const body = req.body || {};
    const safePatch: Record<string, any> = {};

    if (typeof body.firstName === "string") safePatch.firstName = body.firstName.trim().slice(0, 64);
    if (typeof body.lastName === "string") safePatch.lastName = body.lastName.trim().slice(0, 64);
    if (typeof body.bio === "string") safePatch.bio = body.bio.trim().slice(0, 240);
    if (typeof body.photoUrl === "string") safePatch.photoUrl = body.photoUrl.trim().slice(0, 2000);
    if (typeof body.binanceId === "string") safePatch.binanceId = body.binanceId.trim().slice(0, 128);
    if (Array.isArray(body.following)) {
      safePatch.following = body.following.map((x: any) => String(x)).slice(0, 200);
    }

    const updated = await patchFirebaseItem(`users/${tid}`, safePatch);
    return res.json({ ok: Boolean(updated), user: updated });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "profile_update_failed" });
  }
});

// Admin Atomic Withdrawal Review Endpoint (prevents double refund/deduction)
app.post("/api/admin/withdrawals/:id/review", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing_id" });

    const existing = await fetchFirebase<any>(`withdrawals/${id}`);
    if (!existing) return res.status(404).json({ ok: false, error: "withdrawal_not_found" });

    const nextStatus = req.body?.status;
    if (nextStatus !== "pending" && nextStatus !== "approved" && nextStatus !== "rejected") {
      return res.status(400).json({ ok: false, error: "invalid_status" });
    }

    const nextAmount =
      req.body?.amount !== undefined && Number.isFinite(Number(req.body.amount))
        ? Number(Number(req.body.amount).toFixed(2))
        : Number(existing.amount || 0);
    const nextAccount =
      typeof req.body?.account === "string" && req.body.account.trim()
        ? req.body.account.trim()
        : existing.account;
    const nextMethod =
      typeof req.body?.method === "string" && req.body.method.trim()
        ? req.body.method.trim()
        : existing.method;

    const prevRefunded = Boolean(existing.refunded) || existing.status === "rejected";
    let nextRefunded = prevRefunded;

    let updatedUser = await fetchFirebase<any>(`users/${existing.telegramId}`);
    if (updatedUser) {
      if (!prevRefunded && nextStatus === "rejected") {
        // Refund once when rejecting
        updatedUser.balance = Number(((Number(updatedUser.balance) || 0) + nextAmount).toFixed(2));
        updatedUser.updatedAt = Date.now();
        await putFirebase(`users/${existing.telegramId}`, updatedUser);
        nextRefunded = true;
      } else if (prevRefunded && nextStatus !== "rejected") {
        // Re-deduct if un-rejecting a previously refunded withdrawal
        updatedUser.balance = Math.max(0, Number(((Number(updatedUser.balance) || 0) - nextAmount).toFixed(2)));
        updatedUser.updatedAt = Date.now();
        await putFirebase(`users/${existing.telegramId}`, updatedUser);
        nextRefunded = false;
      }
    }

    const updatedWd = {
      ...existing,
      amount: nextAmount,
      account: nextAccount,
      method: nextMethod,
      status: nextStatus,
      refunded: nextRefunded,
      updatedAt: new Date().toISOString()
    };

    await putFirebase(`withdrawals/${id}`, updatedWd);

    // Send Telegram notification on final status transition
    if (existing.status !== nextStatus) {
      if (nextStatus === "approved") {
        sendTelegramMessage(
          existing.telegramId,
          `✅ <b>উইথড্র সফলভাবে পেমেন্ট করা হয়েছে!</b>\n\n💵 <b>পরিমাণ:</b> $${nextAmount.toFixed(2)} USDT\n🏦 <b>মাধ্যম:</b> ${sanitizeHtml(nextMethod)}\n📱 <b>একাউন্ট:</b> <code>${sanitizeHtml(nextAccount)}</code>`
        ).catch(() => {});
      } else if (nextStatus === "rejected") {
        sendTelegramMessage(
          existing.telegramId,
          `⚠️ <b>উইথড্র আবেদন বাতিল ও রিফান্ড হয়েছে</b>\n\n💵 <b>রিফান্ড পরিমাণ:</b> +$${nextAmount.toFixed(2)} USDT আপনার মূল ব্যালেন্সে ফেরত দেওয়া হয়েছে।`
        ).catch(() => {});
      }
    }

    return res.json({ ok: true, withdrawal: updatedWd, user: updatedUser });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "review_failed" });
  }
});

// Admin Atomic Task Submission Review Endpoint (prevents double credit)
app.post("/api/admin/task-submissions/:id/review", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing_id" });

    const decision = req.body?.decision;
    if (decision !== "approved" && decision !== "rejected") {
      return res.status(400).json({ ok: false, error: "invalid_decision" });
    }
    const rejectReason = String(req.body?.rejectReason || "").trim();

    const existing = await fetchFirebase<any>(`taskSubmissions/${id}`);
    if (!existing) return res.status(404).json({ ok: false, error: "submission_not_found" });

    if (existing.status !== "pending") {
      return res.status(409).json({ ok: false, error: "already_reviewed", submission: existing });
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const updatedSub = {
      ...existing,
      status: decision,
      rejectReason:
        decision === "rejected"
          ? rejectReason || "প্রমাণ সঠিক নয়, পুনরায় সঠিক স্ক্রিনশট দিয়ে চেষ্টা করুন।"
          : "",
      reviewedAt: nowIso
    };

    await putFirebase(`taskSubmissions/${id}`, updatedSub);

    let updatedUser: any = null;
    if (decision === "approved" && Number(existing.reward) > 0) {
      const reward = Number(Number(existing.reward).toFixed(2));
      const user = await fetchFirebase<any>(`users/${existing.telegramId}`);
      if (user) {
        const todayStr = nowIso.slice(0, 10);
        if (user.todayDate !== todayStr) {
          user.todayDate = todayStr;
          user.todayEarned = 0;
          user.adsWatchedToday = 0;
        }
        user.balance = Number(((Number(user.balance) || 0) + reward).toFixed(2));
        user.todayEarned = Number(((Number(user.todayEarned) || 0) + reward).toFixed(2));
        user.lifetimeEarned = Number(((Number(user.lifetimeEarned) || 0) + reward).toFixed(2));
        user.updatedAt = nowMs;
        await putFirebase(`users/${existing.telegramId}`, user);
        updatedUser = user;
      }

      const logId = `log_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
      await putFirebase(`logs/${logId}`, {
        id: logId,
        telegramId: existing.telegramId,
        kind: "task",
        label: `টাস্ক সম্পন্ন: ${existing.taskTitle}`,
        amount: reward,
        createdAt: nowIso
      });

      sendTelegramMessage(
        existing.telegramId,
        `🎉 <b>টাস্ক রিওয়ার্ড অনুমোদিত হয়েছে!</b>\n\n✅ <b>টাস্ক:</b> ${sanitizeHtml(existing.taskTitle)}\n💵 <b>পুরস্কার:</b> +$${reward.toFixed(2)} USDT\n\nআপনার মূল ব্যালেন্সে টাকা যোগ করা হয়েছে!`
      ).catch(() => {});
    } else if (decision === "rejected") {
      sendTelegramMessage(
        existing.telegramId,
        `⚠️ <b>টাস্ক সাবমিশন বাতিল হয়েছে</b>\n\n📌 <b>টাস্ক:</b> ${sanitizeHtml(existing.taskTitle)}\n📝 <b>কারণ:</b> ${sanitizeHtml(updatedSub.rejectReason)}\n\nসঠিক স্ক্রিনশট সহ আবার সাবমিট করতে পারবেন।`
      ).catch(() => {});
    }

    return res.json({ ok: true, submission: updatedSub, user: updatedUser });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "task_review_failed" });
  }
});

// Admin-only direct balance credit endpoint
app.post("/api/user/credit", requireAdmin, async (req, res) => {
  try {
    const { telegramId, kind, label, amount } = req.body;
    if (!telegramId || !amount || amount <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_params" });
    }

    const tid = String(telegramId).trim();
    const cleanAmount = Number(Number(amount).toFixed(2));

    let user = await fetchFirebase<any>(`users/${tid}`);
    if (!user) {
      return res.status(404).json({ ok: false, error: "user_not_found" });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (user.todayDate !== todayStr) {
      user.todayDate = todayStr;
      user.todayEarned = 0;
      user.adsWatchedToday = 0;
    }

    const oldBalance = Number(user.balance) || 0;
    const oldToday = Number(user.todayEarned) || 0;
    const oldLifetime = Number(user.lifetimeEarned) || 0;

    user.balance = Number((oldBalance + cleanAmount).toFixed(2));
    user.todayEarned = Number((oldToday + cleanAmount).toFixed(2));
    user.lifetimeEarned = Number((oldLifetime + cleanAmount).toFixed(2));
    if (kind === "ad") {
      user.adsWatchedToday = (Number(user.adsWatchedToday) || 0) + 1;
    }
    user.updatedAt = Date.now();

    await putFirebase(`users/${tid}`, user);

    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await putFirebase(`logs/${logId}`, {
      id: logId,
      telegramId: tid,
      kind: kind || "ad",
      label: label || "Ad Reward",
      amount: cleanAmount,
      createdAt: new Date().toISOString()
    });

    console.log(`[Admin Balance Credit] User ${tid} credited +$${cleanAmount}. New balance: $${user.balance}`);
    return res.json({ ok: true, user });
  } catch (err) {
    console.warn("[Balance Credit Error]:", err);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ==========================================
// SECURE ENCRYPTED RTDB PROXY & IMAGE PROXY
// ==========================================
app.get("/api/rtdb/stream", (req, res) => {
  const auth = getCallerAuth(req);
  registerSseClient(res, auth);
});

app.get("/api/rtdb/users", async (req, res) => {
  const auth = getCallerAuth(req);
  const users = (await fetchFirebase<Record<string, any>>("users")) || {};
  res.json({ ok: true, users: sanitizeUsersMapForCaller(users, auth) });
});

app.get("/api/rtdb/users/:tid", async (req, res) => {
  const tid = String(req.params.tid || "").trim();
  if (!tid) return res.status(400).json({ ok: false, error: "missing_tid" });
  const auth = getCallerAuth(req);
  const user = await fetchFirebase<any>(`users/${tid}`);
  if (!user) return res.json({ ok: true, user: null });
  if (auth.isAdmin || auth.userTid === tid) {
    return res.json({ ok: true, user });
  }
  return res.json({ ok: true, user: sanitizePublicUser(user) });
});

app.put("/api/rtdb/users/:tid", requireAdmin, async (req, res) => {
  const tid = String(req.params.tid || "").trim();
  if (!tid || !req.body || typeof req.body !== "object") {
    return res.status(400).json({ ok: false, error: "invalid_payload" });
  }
  const ok = await putFirebase(`users/${tid}`, { ...req.body, telegramId: tid, updatedAt: Date.now() });
  res.json({ ok });
});

app.patch("/api/rtdb/users/:tid", requireUserOrAdmin, async (req, res) => {
  const tid = String(req.params.tid || "").trim();
  const caller = (req as any).callerAuth as { isAdmin: boolean; userTid: string | null };
  if (!tid || !req.body || typeof req.body !== "object") {
    return res.status(400).json({ ok: false, error: "invalid_payload" });
  }
  if (!caller.isAdmin && caller.userTid !== tid) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const existing = (await fetchFirebase<any>(`users/${tid}`)) || { telegramId: tid };
  const body = req.body;

  if (caller.isAdmin) {
    const cleanBody = { ...body };
    const watchedVideoId = typeof cleanBody.watchedVideoId === "string" ? cleanBody.watchedVideoId.trim() : "";
    delete cleanBody.watchedVideoId;
    if (watchedVideoId) {
      existing.watchedVideos = { ...(existing.watchedVideos || {}), [watchedVideoId]: true };
    }
    const merged = { ...existing, ...cleanBody, telegramId: tid, updatedAt: Date.now() };
    const ok = await putFirebase(`users/${tid}`, merged);
    return res.json({ ok, user: ok ? merged : null });
  }

  // Regular user can only update safe profile fields
  const safePatch: Record<string, any> = {};
  if (typeof body.firstName === "string") safePatch.firstName = body.firstName.trim().slice(0, 64);
  if (typeof body.lastName === "string") safePatch.lastName = body.lastName.trim().slice(0, 64);
  if (typeof body.bio === "string") safePatch.bio = body.bio.trim().slice(0, 240);
  if (typeof body.photoUrl === "string") safePatch.photoUrl = body.photoUrl.trim().slice(0, 2000);
  if (typeof body.binanceId === "string") safePatch.binanceId = body.binanceId.trim().slice(0, 128);
  if (Array.isArray(body.following)) safePatch.following = body.following.map(String).slice(0, 200);

  const merged = { ...existing, ...safePatch, telegramId: tid, updatedAt: Date.now() };
  const ok = await putFirebase(`users/${tid}`, merged);
  return res.json({ ok, user: ok ? merged : null });
});

app.delete("/api/rtdb/users/:tid", requireAdmin, async (req, res) => {
  const tid = String(req.params.tid || "").trim();
  if (!tid) return res.status(400).json({ ok: false, error: "missing_tid" });

  await deleteFirebase(`users/${tid}`);

  const allWds = (await fetchFirebase<Record<string, any>>("withdrawals")) || {};
  for (const [key, val] of Object.entries(allWds)) {
    if (val?.telegramId === tid) {
      await deleteFirebase(`withdrawals/${key}`);
    }
  }

  const allRefs = (await fetchFirebase<Record<string, any>>("referrals")) || {};
  for (const [key, val] of Object.entries(allRefs)) {
    if (val?.referredTelegramId === tid) {
      await deleteFirebase(`referrals/${key}`);
    }
  }

  res.json({ ok: true });
});

app.get("/api/rtdb/withdrawals", async (req, res) => {
  const auth = getCallerAuth(req);
  if (!auth.isAdmin && !auth.userTid) {
    return res.json({ ok: true, withdrawals: [] });
  }
  const map = (await fetchFirebase<Record<string, any>>("withdrawals")) || {};
  const list = toSortedArray("withdrawals", map);
  res.json({
    ok: true,
    withdrawals: auth.isAdmin ? list : list.filter((w) => w?.telegramId === auth.userTid)
  });
});

app.put("/api/rtdb/withdrawals/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id || !req.body) return res.status(400).json({ ok: false });
  const ok = await putFirebase(`withdrawals/${id}`, { ...req.body, id, updatedAt: Date.now() });
  res.json({ ok });
});

app.delete("/api/rtdb/withdrawals/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ ok: false });
  const ok = await deleteFirebase(`withdrawals/${id}`);
  res.json({ ok });
});

app.get("/api/rtdb/referrals", async (req, res) => {
  const auth = getCallerAuth(req);
  if (!auth.isAdmin && !auth.userTid) {
    return res.json({ ok: true, referrals: [] });
  }
  const map = (await fetchFirebase<Record<string, any>>("referrals")) || {};
  const list = toSortedArray("referrals", map);
  res.json({
    ok: true,
    referrals: auth.isAdmin
      ? list
      : list.filter((r) => r?.referrerTelegramId === auth.userTid || r?.referredTelegramId === auth.userTid)
  });
});

app.put("/api/rtdb/referrals/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id || !req.body) return res.status(400).json({ ok: false });
  const ok = await putFirebase(`referrals/${id}`, { ...req.body, id, createdAtTimestamp: Date.now() });
  res.json({ ok });
});

app.get("/api/rtdb/config", async (req, res) => {
  const cfg = await fetchFirebase<Record<string, any>>("config");
  const safe = sanitizePublicConfig(cfg) || {};
  if (!safe.botUsername) safe.botUsername = BOT_USERNAME;
  if (!safe.miniAppUrl && MINI_APP_URL) safe.miniAppUrl = MINI_APP_URL;
  res.json({ ok: true, config: Object.keys(safe).length > 0 ? safe : null });
});

app.put("/api/rtdb/config", requireAdmin, async (req, res) => {
  if (!req.body || typeof req.body !== "object") return res.status(400).json({ ok: false });
  const current = (await fetchFirebase<Record<string, any>>("config")) || {};
  const next = { ...req.body, updatedAt: Date.now() };
  delete next.botToken;
  delete next.adminPassword;
  // Preserve existing adminPinHash unless explicitly changed via /api/admin/change-pin
  next.adminPinHash = current.adminPinHash || DEFAULT_ADMIN_PIN_HASH;
  // Preserve server-side imgbb key unless admin explicitly provides a new one
  if (!next.imgbbApiKey) {
    next.imgbbApiKey = current.imgbbApiKey || "";
  }
  const ok = await putFirebase("config", next);
  if (ok && next.miniAppUrl && String(next.miniAppUrl).startsWith("https://")) {
    syncOfficialBotBio().catch(() => {});
  }
  res.json({ ok });
});

app.get("/api/rtdb/broadcasts", requireAdmin, async (req, res) => {
  const map = (await fetchFirebase<Record<string, any>>("broadcasts")) || {};
  res.json({ ok: true, broadcasts: toSortedArray("broadcasts", map) });
});

app.put("/api/rtdb/broadcasts/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id || !req.body) return res.status(400).json({ ok: false });
  const ok = await putFirebase(`broadcasts/${id}`, { ...req.body, id, updatedAtTimestamp: Date.now() });
  res.json({ ok });
});

app.delete("/api/rtdb/broadcasts/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ ok: false });
  const ok = await deleteFirebase(`broadcasts/${id}`);
  res.json({ ok });
});

app.get("/api/rtdb/task-submissions", async (req, res) => {
  const auth = getCallerAuth(req);
  if (!auth.isAdmin && !auth.userTid) {
    return res.json({ ok: true, taskSubmissions: [] });
  }
  const map = (await fetchFirebase<Record<string, any>>("taskSubmissions")) || {};
  const list = toSortedArray("taskSubmissions", map);
  res.json({
    ok: true,
    taskSubmissions: auth.isAdmin ? list : list.filter((s) => s?.telegramId === auth.userTid)
  });
});

app.put("/api/rtdb/task-submissions/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id || !req.body) return res.status(400).json({ ok: false });
  const ok = await putFirebase(`taskSubmissions/${id}`, { ...req.body, id, updatedAt: Date.now() });
  res.json({ ok });
});

app.delete("/api/rtdb/task-submissions/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ ok: false });
  const ok = await deleteFirebase(`taskSubmissions/${id}`);
  res.json({ ok });
});

app.put("/api/rtdb/logs/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id || !req.body) return res.status(400).json({ ok: false });
  const ok = await putFirebase(`logs/${id}`, { ...req.body, id });
  res.json({ ok });
});

// Server-side ImgBB upload proxy (never exposes ImgBB API key to browser)
app.post("/api/upload-image", requireUserOrAdmin, async (req, res) => {
  try {
    const rawImage = String(req.body?.imageBase64 || "").trim();
    if (!rawImage) {
      return res.status(400).json({ ok: false, error: "missing_image" });
    }
    const cleanBase64 = rawImage.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    const serverCfg = getRawServerConfig() || (await fetchFirebase<Record<string, any>>("config"));
    const apiKey = (serverCfg?.imgbbApiKey || process.env.IMGBB_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(503).json({ ok: false, error: "upload_key_not_configured" });
    }

    const formBody = new URLSearchParams({
      key: apiKey,
      image: cleanBase64
    }).toString();

    const uploadResult = await new Promise<string | null>((resolve) => {
      const r = https.request(
        "https://api.imgbb.com/1/upload",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(formBody, "utf8")
          }
        },
        (apiRes) => {
          let data = "";
          apiRes.on("data", (c) => (data += c));
          apiRes.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed?.data?.display_url || parsed?.data?.url || null);
            } catch {
              resolve(null);
            }
          });
        }
      );
      r.on("error", () => resolve(null));
      r.write(formBody);
      r.end();
    });

    if (!uploadResult) {
      return res.status(502).json({ ok: false, error: "upload_failed" });
    }
    return res.json({ ok: true, url: uploadResult });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "upload_error" });
  }
});

// Setup Vite / Static Serving
async function startServer() {
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const staticImages = express.static(path.join(__dirname, "src", "assets", "images"), {
      maxAge: "365d",
      immutable: true
    });
    app.use("/src/assets/images", (req, res, next) => {
      if (
        req.query &&
        ("import" in req.query || "url" in req.query || "raw" in req.query || "inline" in req.query)
      ) {
        return next();
      }
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return staticImages(req, res, next);
    });
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use("/assets", express.static(path.join(__dirname, "dist", "assets"), {
      maxAge: "365d",
      immutable: true
    }));
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const server = http.createServer(app);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Secure Full-Stack Server running on port ${PORT}`);
    // Start encrypted Firebase RTDB real-time cache sync
    startSecureRtdbSyncLoop();
    // Start background Telegram polling
    startTelegramPolling();
    // Enforce official bio only if mismatched and monitor every 5 minutes
    enforceBotProfile();
    setInterval(enforceBotProfile, 300000);
  });
}

startServer().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
});
