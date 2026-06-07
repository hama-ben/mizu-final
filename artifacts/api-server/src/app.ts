import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authRateLimiter } from "./middlewares/auth-rate-limit";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// CORS origin resolver.
//
// Allowed in production:
//   1. Any *.netlify.app subdomain  — covers every deploy preview automatically
//   2. Any origin listed in CORS_ORIGIN (comma-separated env var) — use this
//      for custom domains (e.g. talabati.dz) or your specific Netlify site URL
//
// In development every origin is allowed so Replit's proxy and local dev
// servers work without config.
const extraOrigins: string[] = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // server-to-server / curl
  if (process.env.NODE_ENV !== "production") return true;
  if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(origin)) return true;
  if (extraOrigins.includes(origin)) return true;
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        logger.warn({ origin }, "CORS blocked origin");
        callback(new Error(`Origin not allowed: ${origin}`));
      }
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth rate limiter — scoped to /api/auth/* only.
// /api/health and /api/healthz are on a different path and are never affected.
app.use("/api/auth", authRateLimiter);

app.use("/api", router);

export default app;
