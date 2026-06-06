import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, driverStatusTable, driverDetailsTable } from "@workspace/db";
import { RegisterBody, LoginBody, LoginResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Feature 4: 2-device session limit
// In-memory session store: userId → ring buffer of up to 2 session tokens
// ─────────────────────────────────────────────────────────────────────────────
const MAX_SESSIONS = 2;
const sessionStore = new Map<string, string[]>(); // userId → [oldest, newest]

export function createSession(userId: string): string {
  const token = crypto.randomUUID();
  const sessions = sessionStore.get(userId) ?? [];
  sessions.push(token);
  if (sessions.length > MAX_SESSIONS) sessions.splice(0, sessions.length - MAX_SESSIONS);
  sessionStore.set(userId, sessions);
  logger.info({ userId, activeSessions: sessions.length }, "Session created");
  return token;
}

export function isAtSessionLimit(userId: string): boolean {
  const sessions = sessionStore.get(userId);
  return sessions != null && sessions.length >= MAX_SESSIONS;
}

export function validateSession(userId: string, token: string): boolean {
  const sessions = sessionStore.get(userId);
  return sessions != null && sessions.includes(token);
}

export function revokeSession(userId: string, token: string): void {
  const sessions = sessionStore.get(userId);
  if (!sessions) return;
  const idx = sessions.indexOf(token);
  if (idx !== -1) sessions.splice(idx, 1);
  if (sessions.length === 0) sessionStore.delete(userId);
}

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Supabase client — Bug #3 fix: singleton pattern
// The client is instantiated once per server process and reused on every
// request, eliminating the per-request overhead of creating new HTTP agents
// and internal Supabase state objects.
// ─────────────────────────────────────────────────────────────────────────────
let _supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_supabaseClient) return _supabaseClient;

  const rawUrl = process.env.SUPABASE_URL?.trim();
  const key    = process.env.SUPABASE_ANON_KEY?.trim();

  if (!rawUrl || !key) {
    throw new Error(
      "SUPABASE_URL و SUPABASE_ANON_KEY غير مضبوطَين في المتغيرات البيئية"
    );
  }

  if (!rawUrl.startsWith("https://")) {
    throw new Error(
      `SUPABASE_URL غير صالح: "${rawUrl.slice(0, 40)}..." — يجب أن يبدأ بـ https://`
    );
  }

  const url = rawUrl
    .replace(/\/(rest|auth|storage|realtime|functions)(\/.*)?$/, "")
    .replace(/\/$/, "");

  logger.debug({ host: new URL(url).hostname }, "Supabase singleton client created");

  _supabaseClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _supabaseClient;
}

(function validateSupabaseOnStartup() {
  try {
    const rawUrl = process.env.SUPABASE_URL?.trim() ?? "";
    const key    = process.env.SUPABASE_ANON_KEY?.trim() ?? "";

    if (!rawUrl || !key) {
      logger.warn("⚠️  SUPABASE_URL أو SUPABASE_ANON_KEY غير مضبوطَين — المصادقة ستفشل");
      return;
    }

    if (!rawUrl.startsWith("https://")) {
      logger.error(
        { urlPrefix: rawUrl.slice(0, 30) },
        "❌ SUPABASE_URL يبدو محلياً — يجب استخدام https://xxxx.supabase.co"
      );
      return;
    }

    const host = new URL(rawUrl).hostname;
    logger.info({ host }, "✅ Supabase مضبوط بشكل صحيح");
  } catch {
    logger.error("❌ SUPABASE_URL تعذّر تحليله — تحقق من صحة القيمة");
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// DB error helper — identifies "relation does not exist" (code 42P01)
// and other common Postgres errors, logging them clearly
// ─────────────────────────────────────────────────────────────────────────────
function handleDbError(err: unknown, context: string): { status: number; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const pgCode   = (err as { code?: string })?.code;

  if (pgCode === "42P01") {
    logger.error({ context, err: message },
      "❌ جدول غير موجود في قاعدة البيانات — تأكد من تطبيق المخطط (schema) على Supabase"
    );
    return {
      status: 503,
      message: "خطأ في قاعدة البيانات: جدول غير موجود — تواصل مع المشرف",
    };
  }

  logger.error({ context, pgCode, err: message }, "DB error");
  return { status: 500, message: "خطأ داخلي في الخادم" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Password hashing
// ─────────────────────────────────────────────────────────────────────────────
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory pending-registration store (TTL = 10 min)
// ─────────────────────────────────────────────────────────────────────────────
const OTP_TTL_MS = 10 * 60 * 1000;

interface PendingRegistration {
  expiresAt: number;
  name: string;
  email: string;
  password: string;
  phone: string;
  userType: "مستهلك" | "سائق";
  wilaya: string;
  commune: string;
}

const pendingStore = new Map<string, PendingRegistration>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingStore) {
    if (val.expiresAt < now) pendingStore.delete(key);
  }
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Validate inputs → send real Supabase OTP to email
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/register-request", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }

  const { name, email, password, phone, userType, wilaya, commune } = parsed.data;

  if (!wilaya || !commune) {
    res.status(400).json({ error: "الولاية والبلدية مطلوبتان" });
    return;
  }

  // Uniqueness checks — wrap in try/catch for table-name resiliency
  try {
    const [existingEmail] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (existingEmail) {
      res.status(400).json({ error: "الحساب مسجل بالفعل" });
      return;
    }

    const [existingPhone] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, phone));
    if (existingPhone) {
      res.status(400).json({ error: "الرقم مستخدم بالفعل" });
      return;
    }
  } catch (err) {
    const { status, message } = handleDbError(err, "register-request uniqueness check");
    res.status(status).json({ error: message });
    return;
  }

  pendingStore.set(email, {
    expiresAt: Date.now() + OTP_TTL_MS,
    name, email, password, phone, userType,
    wilaya: wilaya as string,
    commune: commune as string,
  });

  let supabase: SupabaseClient;
  try {
    supabase = getSupabase();
  } catch (configErr) {
    pendingStore.delete(email);
    const msg = configErr instanceof Error ? configErr.message : "خطأ في إعدادات Supabase";
    req.log.error({ err: msg }, "Supabase config error on register-request");
    res.status(503).json({ error: msg });
    return;
  }

  // Bug #2 fix: shouldCreateUser is intentionally true so Supabase can deliver
  // the OTP email to users who are not yet in Supabase Auth.
  // Supabase Auth is used here ONLY as an OTP delivery + verification mechanism.
  // The application's authoritative user record lives exclusively in usersTable
  // (managed by Drizzle). The Supabase Auth ghost user is a known side-effect
  // of this pattern and does not interfere with the app's auth flow.
  // If the same email re-registers (abandoned flow), signInWithOtp simply
  // re-sends a fresh OTP to the existing Supabase Auth entry — no duplicate.
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { source: "al-shuaiba-registration" },
    },
  });

  if (otpError) {
    pendingStore.delete(email);
    req.log.error({ email, err: otpError.message }, "Supabase OTP send failed");
    console.error("[OTP SEND ERROR]", { email, supabaseError: otpError });
    res.status(502).json({
      error: `فشل إرسال رمز التحقق عبر Supabase: ${otpError.message}`,
    });
    return;
  }

  req.log.info({ email }, "✅ Supabase OTP sent");
  res.status(202).json({
    message: "تم إرسال رمز التحقق المكوّن من 6 أرقام إلى بريدك الإلكتروني",
    email,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Verify OTP → create user in DB
//
// FIX 1: Drivers are auto-approved (accountStatus = 'active') at registration.
//         They bypass the "under review" screen entirely and go straight
//         to the docs upload flow, then directly to the dashboard.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const { email, otp } = req.body as { email?: string; otp?: string };

  if (!email || !otp) {
    res.status(400).json({ error: "البريد الإلكتروني ورمز التحقق مطلوبان" });
    return;
  }

  // Bug #1 fix: strictly enforce 6-digit numeric OTP before hitting Supabase
  if (!/^\d{6}$/.test(otp.trim())) {
    res.status(400).json({ error: "رمز التحقق يجب أن يكون مكوّناً من 6 أرقام فقط" });
    return;
  }

  const pending = pendingStore.get(email);
  if (!pending) {
    res.status(400).json({
      error: "لم يتم العثور على طلب تسجيل — يرجى البدء من جديد",
    });
    return;
  }
  if (Date.now() > pending.expiresAt) {
    pendingStore.delete(email);
    res.status(400).json({
      error: "انتهت صلاحية الجلسة — يرجى التسجيل من جديد",
    });
    return;
  }

  let supabase: SupabaseClient;
  try {
    supabase = getSupabase();
  } catch (configErr) {
    const msg = configErr instanceof Error ? configErr.message : "خطأ في إعدادات Supabase";
    req.log.error({ err: msg }, "Supabase config error on verify-otp");
    res.status(503).json({ error: msg });
    return;
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: otp.trim(),
    type: "email",
  });

  if (verifyError) {
    req.log.warn({ email, err: verifyError.message }, "Supabase OTP verification rejected");
    console.error("[OTP VERIFY ERROR]", { email, supabaseError: verifyError });
    res.status(400).json({
      error: "رمز التحقق غير صحيح أو منتهي الصلاحية",
    });
    return;
  }

  pendingStore.delete(email);

  const passwordHash = hashPassword(pending.password);

  // ── FIX 1: Drivers are auto-approved immediately — no pending state ──────
  // accountStatus 'active' means the driver can access the dashboard right away
  // after uploading their docs. Consumers keep the default 'pending' value
  // since they don't have an approval flow to worry about.
  const accountStatus = pending.userType === "سائق" ? "active" : "pending";

  let user: typeof usersTable.$inferSelect;
  try {
    const [inserted] = await db
      .insert(usersTable)
      .values({
        name:          pending.name,
        email:         pending.email,
        phone:         pending.phone,
        passwordHash,
        userType:      pending.userType,
        wilaya:        pending.wilaya,
        commune:       pending.commune,
        accountStatus,
      })
      .returning();
    user = inserted;
  } catch (err) {
    const { status, message } = handleDbError(err, "verify-otp insert user");
    res.status(status).json({ error: message });
    return;
  }

  req.log.info(
    { userId: user.id, userType: user.userType, accountStatus },
    "✅ User registered via Supabase OTP"
  );

  if (user.userType === "سائق") {
    try {
      await db
        .insert(driverStatusTable)
        .values({ driverId: user.id, currentStatus: "مغلق" })
        .onConflictDoNothing();

      await db
        .insert(driverDetailsTable)
        .values({ driverId: user.id, wilaya: pending.wilaya, commune: pending.commune })
        .onConflictDoNothing();
    } catch (err) {
      // FIX 2: Log but don't crash — driver auxiliary rows are non-critical
      logger.warn({ err }, "Failed to create driver auxiliary records — continuing");
    }
  }

  const sessionToken = createSession(user.id);
  res.status(201).json({
    ...LoginResponse.parse({
      userId:   user.id,
      name:     user.name,
      email:    user.email,
      userType: user.userType,
    }),
    sessionToken,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const passwordHash = hashPassword(password);

  let user: typeof usersTable.$inferSelect | undefined;
  try {
    const [found] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));
    user = found;
  } catch (err) {
    const { status, message } = handleDbError(err, "login select user");
    res.status(status).json({ error: message });
    return;
  }

  if (!user || user.passwordHash !== passwordHash) {
    res.status(401).json({ error: "بيانات تسجيل الدخول غير صحيحة" });
    return;
  }

  if (isAtSessionLimit(user.id)) {
    res.status(403).json({ error: "عذراً، لقد تجاوزت الحد المسموح به للأجهزة. يُسمح بجهازَين فقط في نفس الوقت." });
    return;
  }

  const sessionToken = createSession(user.id);
  req.log.info({ userId: user.id }, "User logged in");
  res.json({
    ...LoginResponse.parse({
      userId:   user.id,
      name:     user.name,
      email:    user.email,
      userType: user.userType,
    }),
    sessionToken,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Logout — revoke this device's session token
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/logout", (req, res): void => {
  const userId      = req.headers["x-user-id"] as string | undefined;
  const sessionToken = req.headers["x-session-token"] as string | undefined;
  if (userId && sessionToken) revokeSession(userId, sessionToken);
  res.status(204).end();
});

// ─────────────────────────────────────────────────────────────────────────────
// Change password (for logged-in users) — requires valid session headers
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/change-password", async (req, res): Promise<void> => {
  const userId      = req.headers["x-user-id"] as string | undefined;
  const sessionToken = req.headers["x-session-token"] as string | undefined;

  if (!userId || !sessionToken || !validateSession(userId, sessionToken)) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }

  const { oldPassword, newPassword } = req.body as { oldPassword?: string; newPassword?: string };

  if (!oldPassword || !newPassword) {
    res.status(400).json({ error: "كلمة المرور القديمة والجديدة مطلوبتان" });
    return;
  }

  if (typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" });
    return;
  }

  let user: typeof usersTable.$inferSelect | undefined;
  try {
    const [found] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    user = found;
  } catch (err) {
    const { status, message } = handleDbError(err, "change-password select");
    res.status(status).json({ error: message });
    return;
  }

  if (!user) {
    res.status(404).json({ error: "الحساب غير موجود" });
    return;
  }

  if (user.passwordHash !== hashPassword(oldPassword)) {
    res.status(401).json({ error: "كلمة المرور القديمة غير صحيحة" });
    return;
  }

  try {
    await db
      .update(usersTable)
      .set({ passwordHash: hashPassword(newPassword) })
      .where(eq(usersTable.id, userId));
  } catch (err) {
    const { status, message } = handleDbError(err, "change-password update");
    res.status(status).json({ error: message });
    return;
  }

  req.log.info({ userId }, "✅ Password changed by logged-in user");
  res.json({ message: "تم تغيير كلمة المرور بنجاح" });
});

// ─────────────────────────────────────────────────────────────────────────────
// In-memory reset-token store (server-issued after OTP verification)
// TTL = 10 min; token is single-use
// ─────────────────────────────────────────────────────────────────────────────
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

interface PendingReset {
  email: string;
  expiresAt: number;
}

const resetTokenStore = new Map<string, PendingReset>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of resetTokenStore) {
    if (val.expiresAt < now) resetTokenStore.delete(key);
  }
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 (password reset): Send Supabase OTP to email
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/send-reset-otp", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: "البريد الإلكتروني مطلوب" });
    return;
  }

  // Check that the user account actually exists before sending an OTP
  try {
    const [found] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email.trim()));

    if (!found) {
      // Return same response to avoid email-enumeration attacks
      res.status(202).json({ message: "تم إرسال رمز التحقق إذا كان البريد مسجلاً" });
      return;
    }
  } catch (err) {
    const { status, message } = handleDbError(err, "send-reset-otp lookup");
    res.status(status).json({ error: message });
    return;
  }

  let supabase: SupabaseClient;
  try {
    supabase = getSupabase();
  } catch (configErr) {
    const msg = configErr instanceof Error ? configErr.message : "خطأ في إعدادات Supabase";
    res.status(503).json({ error: msg });
    return;
  }

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false },
  });

  if (otpError) {
    req.log.warn({ email: email.trim(), err: otpError.message }, "send-reset-otp: Supabase OTP failed");
    // Return 202 regardless to avoid leaking user info
    res.status(202).json({ message: "تم إرسال رمز التحقق إذا كان البريد مسجلاً" });
    return;
  }

  req.log.info({ email: email.trim() }, "✅ Password-reset OTP sent");
  res.status(202).json({ message: "تم إرسال رمز التحقق على بريدك الإلكتروني" });
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 (password reset): Verify OTP server-side → issue short-lived resetToken
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/verify-reset-otp", async (req, res): Promise<void> => {
  const { email, otp } = req.body as { email?: string; otp?: string };

  if (!email || !otp) {
    res.status(400).json({ error: "البريد الإلكتروني والرمز مطلوبان" });
    return;
  }

  if (!/^\d{6}$/.test(otp.trim())) {
    res.status(400).json({ error: "رمز التحقق يجب أن يكون مكوّناً من 6 أرقام" });
    return;
  }

  let supabase: SupabaseClient;
  try {
    supabase = getSupabase();
  } catch (configErr) {
    const msg = configErr instanceof Error ? configErr.message : "خطأ في إعدادات Supabase";
    res.status(503).json({ error: msg });
    return;
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: otp.trim(),
    type: "email",
  });

  if (verifyError) {
    req.log.warn({ email: email.trim(), err: verifyError.message }, "verify-reset-otp: Supabase OTP rejected");
    res.status(400).json({ error: "رمز التحقق غير صحيح أو منتهي الصلاحية" });
    return;
  }

  // OTP verified — issue a single-use, time-limited reset token
  const resetToken = crypto.randomUUID();
  resetTokenStore.set(resetToken, {
    email: email.trim(),
    expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
  });

  req.log.info({ email: email.trim() }, "✅ Password-reset OTP verified, resetToken issued");
  res.json({ resetToken });
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 (password reset): Exchange server-issued resetToken for password update
// Requires the server-issued token — direct API calls without a valid token fail
// ─────────────────────────────────────────────────────────────────────────────
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { resetToken, newPassword } = req.body as { resetToken?: string; newPassword?: string };

  if (!resetToken || !newPassword) {
    res.status(400).json({ error: "رمز التحقق وكلمة المرور الجديدة مطلوبان" });
    return;
  }

  if (typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    return;
  }

  const pending = resetTokenStore.get(resetToken);
  if (!pending) {
    res.status(400).json({ error: "رمز إعادة التعيين غير صالح أو منتهي الصلاحية" });
    return;
  }
  if (Date.now() > pending.expiresAt) {
    resetTokenStore.delete(resetToken);
    res.status(400).json({ error: "انتهت صلاحية رمز إعادة التعيين — يرجى البدء من جديد" });
    return;
  }

  // Single-use: delete before updating to prevent replay
  resetTokenStore.delete(resetToken);

  const passwordHash = hashPassword(newPassword);

  try {
    const result = await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.email, pending.email))
      .returning({ id: usersTable.id });

    if (result.length === 0) {
      res.status(404).json({ error: "الحساب غير موجود" });
      return;
    }

    logger.info({ userId: result[0].id }, "✅ Password reset via server-verified OTP token");
    res.json({ message: "تم تحديث كلمة المرور بنجاح" });
  } catch (err) {
    const { status, message } = handleDbError(err, "reset-password update");
    res.status(status).json({ error: message });
  }
});

export default router;
