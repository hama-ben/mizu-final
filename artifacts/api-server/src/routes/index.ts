import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import authRouter, { validateSession } from "./auth";
import driverRouter from "./driver";
import ordersRouter from "./orders";
import ratingsRouter from "./ratings";
import announcementsRouter from "./announcements";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Session validation middleware (Feature 4: 2-device limit)
// Applies to all routes except /auth/* and /health
// ─────────────────────────────────────────────────────────────────────────────
function requireValidSession(req: Request, res: Response, next: NextFunction): void {
  // Skip auth routes (login, register, logout, verify-otp) and health check
  const path = req.path;
  if (
    path.startsWith("/auth/") ||
    path.startsWith("/health")
  ) {
    next();
    return;
  }

  const userId      = req.headers["x-user-id"] as string | undefined;
  const sessionToken = req.headers["x-session-token"] as string | undefined;

  // If no session headers at all, pass through (backward-compatible with
  // requests that don't yet include the session token)
  if (!userId || !sessionToken) {
    next();
    return;
  }

  if (!validateSession(userId, sessionToken)) {
    res.status(401).json({
      error: "انتهت جلستك — تم تسجيل الدخول من جهاز آخر. يرجى إعادة تسجيل الدخول.",
      code:  "SESSION_EVICTED",
    });
    return;
  }

  next();
}

router.use(healthRouter);
router.use(authRouter);
router.use(requireValidSession);
router.use(driverRouter);
router.use(ordersRouter);
router.use(ratingsRouter);
router.use(announcementsRouter);

export default router;
