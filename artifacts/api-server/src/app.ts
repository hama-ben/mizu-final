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
// Known production frontend origins — kept here as a hard-coded baseline so
// the server is never accidentally open to all origins even if CORS_ORIGIN is
// missing from the environment.  The CORS_ORIGIN env var (comma-separated) can
// extend or override this list at runtime (useful for custom domains / staging).
const KNOWN_ORIGINS = [
  "https://mellow-naiad-f2a5d9.netlify.app",
];

const corsOrigins: string[] | true = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : process.env.NODE_ENV === "production"
    ? KNOWN_ORIGINS
    : true; // development: allow all (Replit proxy, local dev servers)

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth rate limiter — scoped to /api/auth/* only.
// /api/health and /api/healthz are on a different path and are never affected.
app.use("/api/auth", authRateLimiter);

app.use("/api", router);

export default app;
