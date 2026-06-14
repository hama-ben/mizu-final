/**
 * mailer.ts — Self-managed OTP email delivery
 *
 * Sends 6-digit numeric OTP codes via nodemailer (SMTP).
 *
 * Required env vars (set via Replit Secrets):
 *   SMTP_HOST     e.g. smtp.gmail.com
 *   SMTP_PORT     e.g. 587
 *   SMTP_USER     e.g. yourapp@gmail.com
 *   SMTP_PASS     Gmail App Password or SMTP password
 *   SMTP_FROM     Display name + address, e.g. "Mizu <yourapp@gmail.com>"
 *                 (defaults to SMTP_USER if not set)
 *
 * Development fallback:
 *   If SMTP_HOST is not set, the OTP is printed to the server console
 *   so development/testing works without SMTP credentials.
 */

import nodemailer from "nodemailer";
import { logger } from "./logger";

function getTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT?.trim() ?? "587", 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function fromAddress(): string {
  const from = process.env.SMTP_FROM?.trim();
  const user = process.env.SMTP_USER?.trim();
  return from ?? user ?? "Mizu <noreply@mizu.app>";
}

export async function sendOtpEmail(
  email: string,
  name: string,
  otp: string
): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    logger.warn(
      { email, otp },
      "⚠️  SMTP not configured — OTP printed to console (dev mode only)"
    );
    console.log(
      `\n╔══════════════════════════════════╗`,
      `\n║   رمز التحقق لـ ${email}`,
      `\n║   OTP CODE: ${otp}`,
      `\n╚══════════════════════════════════╝\n`
    );
    return;
  }

  const html = `
    <div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;">
      <h2 style="color:#0ea5e9;margin-bottom:8px;">مرحباً ${name || ""}،</h2>
      <p style="color:#374151;">رمز التحقق الخاص بك على تطبيق <strong>Mizu</strong>:</p>
      <div style="text-align:center;margin:24px 0;">
        <span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#0f172a;background:#f0f9ff;padding:16px 24px;border-radius:12px;display:inline-block;">${otp}</span>
      </div>
      <p style="color:#6b7280;font-size:14px;">صالح لمدة 10 دقائق. لا تشاركه مع أي شخص.</p>
    </div>`;

  await transporter.sendMail({
    from: fromAddress(),
    to: email,
    subject: `${otp} — رمز التحقق من Mizu`,
    html,
    text: `رمز التحقق الخاص بك: ${otp}\nصالح لمدة 10 دقائق.`,
  });

  logger.info({ email }, "✅ OTP email sent via SMTP");
}

export async function sendPasswordResetOtpEmail(
  email: string,
  otp: string
): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    logger.warn(
      { email, otp },
      "⚠️  SMTP not configured — reset OTP printed to console (dev mode only)"
    );
    console.log(
      `\n╔══════════════════════════════════╗`,
      `\n║   رمز إعادة تعيين كلمة المرور لـ ${email}`,
      `\n║   RESET OTP: ${otp}`,
      `\n╚══════════════════════════════════╝\n`
    );
    return;
  }

  const html = `
    <div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;">
      <h2 style="color:#f59e0b;margin-bottom:8px;">إعادة تعيين كلمة المرور</h2>
      <p style="color:#374151;">رمز إعادة تعيين كلمة المرور على تطبيق <strong>Mizu</strong>:</p>
      <div style="text-align:center;margin:24px 0;">
        <span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#0f172a;background:#fffbeb;padding:16px 24px;border-radius:12px;display:inline-block;">${otp}</span>
      </div>
      <p style="color:#6b7280;font-size:14px;">صالح لمدة 10 دقائق. إذا لم تطلب ذلك، تجاهل هذا البريد.</p>
    </div>`;

  await transporter.sendMail({
    from: fromAddress(),
    to: email,
    subject: `${otp} — رمز إعادة تعيين كلمة المرور من Mizu`,
    html,
    text: `رمز إعادة تعيين كلمة المرور: ${otp}\nصالح لمدة 10 دقائق.`,
  });

  logger.info({ email }, "✅ Password-reset OTP email sent via SMTP");
}
