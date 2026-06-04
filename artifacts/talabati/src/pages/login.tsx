import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogin } from "@workspace/api-client-react";
import { Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { WaterDrops, WaterTruckIcon } from "@/components/layout";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [, setLocation] = useLocation();
  const { userId, userType, setAuth } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const loginMutation = useLogin();

  useEffect(() => {
    if (userId) {
      if (userType === "سائق") {
        setLocation("/driver-dashboard");
      } else {
        setLocation("/dashboard");
      }
    }
  }, [userId, userType, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("يرجى إدخال البريد الإلكتروني وكلمة المرور");
      return;
    }
    loginMutation.mutate({ data: { email, password } }, {
      onSuccess: (data: any) => {
        setAuth({ userId: data.userId, name: data.name, email: data.email, userType: data.userType, sessionToken: data.sessionToken });
        if (data.userType === "سائق") {
          setLocation("/driver-dashboard");
        } else {
          setLocation("/dashboard");
        }
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error || "حدث خطأ أثناء تسجيل الدخول");
      }
    });
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    if (!forgotEmail) { setForgotError("يرجى إدخال البريد الإلكتروني"); return; }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      setForgotError(err?.message || "فشل إرسال رابط الاسترداد");
    } finally {
      setForgotLoading(false);
    }
  };

  if (showForgot) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 relative overflow-hidden bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950">
        <WaterDrops />
        <div className="w-full max-w-sm relative z-10">
          <button onClick={() => { setShowForgot(false); setForgotSent(false); setForgotError(""); }}
            className="inline-flex items-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors mb-6">
            <ArrowRight className="w-4 h-4 ml-1" /> العودة لتسجيل الدخول
          </button>
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-primary to-cyan-400 rounded-3xl flex items-center justify-center shadow-lg shadow-primary/30 mb-4">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">نسيان كلمة المرور</h1>
            <p className="text-slate-500 text-sm text-center">سنرسل لك رابط إعادة تعيين كلمة المرور</p>
          </div>

          {forgotSent ? (
            <div className="glass-panel rounded-3xl p-6 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="font-bold text-lg text-slate-800 dark:text-white mb-2">تم الإرسال!</h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                تم إرسال رابط استرداد كلمة المرور إلى <strong className="text-primary">{forgotEmail}</strong>. تحقق من بريدك الإلكتروني.
              </p>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="glass-panel rounded-3xl p-6">
              {forgotError && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-2xl mb-4 text-center">{forgotError}</div>
              )}
              <div className="relative mb-4">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input type="email" placeholder="البريد الإلكتروني" value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full bg-white/50 dark:bg-black/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  dir="rtl" />
              </div>
              <button type="submit" disabled={forgotLoading}
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20 active:scale-[0.98]">
                {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "إرسال رابط الاسترداد"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 relative overflow-hidden bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950">
      <WaterDrops />
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-cyan-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-sky-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000"></div>

      <div className="w-full max-w-sm relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-tr from-primary to-cyan-400 rounded-3xl flex items-center justify-center shadow-lg shadow-primary/30 mb-6 rotate-3">
            <WaterTruckIcon className="w-12 h-8 text-white -rotate-3" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-1">الشعيبة</h1>
          <p className="text-sm font-medium text-primary mb-1">الشعيبة لتوصيل المياه</p>
          <p className="text-slate-500 dark:text-slate-400 text-center text-sm">أسرع وأسهل طريقة لطلب مياه الشرب</p>
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
              <input type="email" placeholder="البريد الإلكتروني" value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/50 dark:bg-black/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                dir="rtl" data-testid="input-email" />
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-5 w-5" />
              </div>
              <input type="password" placeholder="كلمة المرور" value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/50 dark:bg-black/50 border border-slate-200 dark:border-slate-800 rounded-2xl py-3 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                dir="rtl" data-testid="input-password" />
            </div>
            <button type="submit" disabled={loginMutation.isPending}
              className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20 active:scale-[0.98]"
              data-testid="button-submit-login">
              {loginMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <><span>تسجيل الدخول</span><ArrowRight className="w-4 h-4 rotate-180" /></>
              )}
            </button>
          </div>
        </form>

        <div className="text-center space-y-3">
          <button onClick={() => setShowForgot(true)}
            className="text-sm text-primary/70 hover:text-primary transition-colors hover:underline">
            نسيت كلمة المرور؟
          </button>
          <p className="text-slate-600 dark:text-slate-400">
            ليس لديك حساب؟{" "}
            <Link href="/register" className="text-primary font-bold hover:underline" data-testid="link-register">
              سجل الآن
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
