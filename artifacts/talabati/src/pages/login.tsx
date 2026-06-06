import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogin } from "@workspace/api-client-react";
import { Mail, Lock, Loader2, ArrowRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Link } from "wouter";
import { WaterDrops, WaterTruckIcon, AuthControls } from "@/components/layout";
import { useTranslation } from "@/lib/i18n";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";

type ForgotStep = "email" | "otp" | "reset" | "done";

export default function Login() {
  const [, setLocation] = useLocation();
  const { userId, userType, setAuth } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // ── Forgot password state ─────────────────────────────────────────────────
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotResetToken, setForgotResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const loginMutation = useLogin();

  useEffect(() => {
    if (userId) {
      setLocation(userType === "سائق" ? "/driver-dashboard" : "/dashboard");
    }
  }, [userId, userType, setLocation]);

  // ── Login submit ───────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError(t("login.error.fields"));
      return;
    }
    loginMutation.mutate({ data: { email, password } }, {
      onSuccess: (data: any) => {
        setAuth({
          userId: data.userId,
          name: data.name,
          email: data.email,
          userType: data.userType,
          sessionToken: data.sessionToken,
        });
        setLocation(data.userType === "سائق" ? "/driver-dashboard" : "/dashboard");
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error || t("login.error.credentials"));
      },
    });
  };

  // ── Forgot: Step 1 — send OTP via backend ─────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    if (!forgotEmail.trim()) {
      setForgotError(t("forgot.error.email"));
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/send-reset-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      setForgotStep("otp");
    } catch (err: any) {
      setForgotError(err.message || t("common.error"));
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Forgot: Step 2 — verify OTP via backend, get server-issued resetToken ──
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    if (forgotOtp.length !== 6) {
      setForgotError(t("forgot.otp.error"));
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/verify-reset-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim(), otp: forgotOtp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("forgot.otp.error"));
      setForgotResetToken(data.resetToken);
      setForgotStep("reset");
    } catch (err: any) {
      setForgotError(err.message || t("forgot.otp.error"));
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Forgot: Step 3 — exchange resetToken + newPassword ────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    if (newPassword.length < 6) {
      setForgotError(t("forgot.reset.error.short"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setForgotError(t("forgot.reset.error.match"));
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken: forgotResetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      setForgotStep("done");
    } catch (err: any) {
      setForgotError(err.message || t("common.error"));
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgotFlow = () => {
    setShowForgot(false);
    setForgotStep("email");
    setForgotEmail("");
    setForgotOtp("");
    setForgotResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setForgotError("");
    setForgotLoading(false);
  };

  // ── Forgot password screens ────────────────────────────────────────────────
  if (showForgot) {
    return (
      <div
        className="min-h-[100dvh] flex flex-col items-center justify-center p-6 relative overflow-hidden bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950"
        dir="rtl"
      >
        <AuthControls />
        <WaterDrops />
        <div className="w-full max-w-sm relative z-10">
          {forgotStep !== "done" && (
            <button
              onClick={resetForgotFlow}
              className="inline-flex items-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors mb-6 gap-1"
            >
              <ArrowRight className="w-4 h-4" />
              {t("forgot.back")}
            </button>
          )}

          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-primary to-cyan-400 rounded-3xl flex items-center justify-center shadow-lg shadow-primary/30 mb-4">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">
              {forgotStep === "done" ? t("forgot.done") : t("forgot.title")}
            </h1>
            {forgotStep === "email" && (
              <p className="text-slate-500 text-sm text-center">{t("forgot.subtitle")}</p>
            )}
            {forgotStep === "otp" && (
              <p className="text-slate-500 text-sm text-center">
                {t("forgot.otp.subtitle")} <span className="text-primary font-medium">{forgotEmail}</span>
              </p>
            )}
            {forgotStep === "reset" && (
              <p className="text-slate-500 text-sm text-center">{t("forgot.reset.title")}</p>
            )}
          </div>

          {/* ── Step: email ── */}
          {forgotStep === "email" && (
            <form onSubmit={handleSendOtp} className="glass-panel rounded-3xl p-6 space-y-4">
              {forgotError && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-2xl text-center">{forgotError}</div>
              )}
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  type="email"
                  placeholder={t("forgot.email")}
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full bg-white/50 dark:bg-black/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  dir="ltr"
                />
              </div>
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20 active:scale-[0.98] disabled:opacity-60"
              >
                {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : t("forgot.submit")}
              </button>
            </form>
          )}

          {/* ── Step: OTP ── */}
          {forgotStep === "otp" && (
            <form onSubmit={handleVerifyOtp} className="glass-panel rounded-3xl p-6 space-y-6">
              {forgotError && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-2xl text-center">{forgotError}</div>
              )}
              <div className="flex flex-col items-center gap-4">
                <p className="text-sm text-slate-500">{t("forgot.otp.title")}</p>
                <InputOTP
                  maxLength={6}
                  value={forgotOtp}
                  onChange={setForgotOtp}
                  pattern={REGEXP_ONLY_DIGITS}
                  dir="ltr"
                >
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="w-11 h-12 text-lg font-bold rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white first:rounded-xl last:rounded-xl first:border-l"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <button
                type="submit"
                disabled={forgotLoading || forgotOtp.length < 6}
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20 active:scale-[0.98] disabled:opacity-60"
              >
                {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : t("forgot.otp.verify")}
              </button>
              <button
                type="button"
                onClick={() => { setForgotStep("email"); setForgotOtp(""); setForgotError(""); }}
                className="w-full text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
              >
                {t("common.back")}
              </button>
            </form>
          )}

          {/* ── Step: reset password ── */}
          {forgotStep === "reset" && (
            <form onSubmit={handleResetPassword} className="glass-panel rounded-3xl p-6 space-y-4">
              {forgotError && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-2xl text-center">{forgotError}</div>
              )}
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  type={showNewPassword ? "text" : "password"}
                  placeholder={t("forgot.reset.new")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-white/50 dark:bg-black/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pr-10 pl-10 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  dir="rtl"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(v => !v)}
                  className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  type={showNewPassword ? "text" : "password"}
                  placeholder={t("forgot.reset.confirm")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-white/50 dark:bg-black/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  dir="rtl"
                />
              </div>
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20 active:scale-[0.98] disabled:opacity-60"
              >
                {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : t("forgot.reset.submit")}
              </button>
            </form>
          )}

          {/* ── Step: done ── */}
          {forgotStep === "done" && (
            <div className="glass-panel rounded-3xl p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-sm">{t("forgot.done")}</p>
              <button
                onClick={resetForgotFlow}
                className="mt-2 w-full bg-primary hover:bg-primary/90 text-white font-medium py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20"
              >
                {t("login.submit")}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main login screen ──────────────────────────────────────────────────────
  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center p-6 relative overflow-hidden bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950"
      dir="rtl"
    >
      <AuthControls />
      <WaterDrops />
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob" />
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-cyan-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
      <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-sky-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000" />

      <div className="w-full max-w-sm relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-tr from-primary to-cyan-400 rounded-3xl flex items-center justify-center shadow-lg shadow-primary/30 mb-6 rotate-3">
            <WaterTruckIcon className="w-12 h-8 text-white -rotate-3" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-1">{t("login.title")}</h1>
          <p className="text-sm font-medium text-primary mb-1">{t("login.tagline")}</p>
          <p className="text-slate-500 dark:text-slate-400 text-center text-sm">{t("login.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-6 mb-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-2xl mb-4 text-center">{error}</div>
          )}
          <div className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="h-5 w-5" />
              </div>
              <input
                type="email"
                placeholder={t("login.email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/50 dark:bg-black/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                dir="ltr"
                data-testid="input-email"
              />
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-5 w-5" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder={t("login.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/50 dark:bg-black/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pr-10 pl-10 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                dir="rtl"
                data-testid="input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20 active:scale-[0.98]"
              data-testid="button-submit-login"
            >
              {loginMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <><span>{t("login.submit")}</span><ArrowRight className="w-4 h-4 rotate-180" /></>
              )}
            </button>
          </div>
        </form>

        <div className="text-center space-y-3">
          <button
            onClick={() => setShowForgot(true)}
            className="text-sm text-primary/70 hover:text-primary transition-colors hover:underline"
          >
            {t("login.forgotPassword")}
          </button>
          <p className="text-slate-600 dark:text-slate-400">
            {t("login.noAccount")}{" "}
            <Link href="/register" className="text-primary font-bold hover:underline" data-testid="link-register">
              {t("login.register")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
