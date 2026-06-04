/**
 * OrderNotification
 *
 * Animated toast banner that slides down from the top of the screen
 * when a new order arrives in the driver's commune via Supabase Realtime.
 * Auto-dismisses after 8 seconds; also dismissible by tapping.
 */

import { useEffect, useRef } from "react";
import { Bell, X, Package } from "lucide-react";

interface OrderNotificationProps {
  show: boolean;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 8000;

export function OrderNotification({ show, onDismiss }: OrderNotificationProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!show) return;

    // Play a subtle vibration on supported devices
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, onDismiss]);

  if (!show) return null;

  return (
    <div
      className="fixed top-4 left-4 right-4 z-[300] flex justify-center pointer-events-none"
      dir="rtl"
    >
      <button
        onClick={onDismiss}
        className="pointer-events-auto w-full max-w-sm flex items-center gap-4 p-4 rounded-3xl shadow-2xl border border-primary/20 cursor-pointer animate-in slide-in-from-top-4 fade-in duration-400 bg-gradient-to-l from-primary to-cyan-500 text-white"
        aria-label="إغلاق الإشعار"
      >
        {/* Pulsing bell icon */}
        <div className="relative flex-shrink-0">
          <div className="absolute inset-0 rounded-full bg-white/30 animate-ping" />
          <div className="relative w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
            <Bell className="w-6 h-6 text-white fill-white" />
          </div>
        </div>

        {/* Text */}
        <div className="flex-1 text-right">
          <p className="font-black text-base leading-tight">طلب جديد في منطقتك! 🔔</p>
          <p className="text-white/80 text-sm font-medium mt-0.5 flex items-center gap-1.5 justify-end">
            <Package className="w-3.5 h-3.5" />
            اضغط لعرض الطلبات المتاحة
          </p>
        </div>

        {/* Close button */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <X className="w-4 h-4 text-white" />
        </div>
      </button>
    </div>
  );
}
