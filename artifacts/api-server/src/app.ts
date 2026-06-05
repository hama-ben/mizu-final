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
// In production, restrict CORS to the frontend origin declared in CORS_ORIGIN.
// Multiple origins can be comma-separated: "https://a.com,https://b.com".
// In development (no CORS_ORIGIN set) all origins are allowed so Replit's
// proxy and local dev servers work without configuration.
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : true;
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth rate limiter — scoped to /api/auth/* only.
// /api/health and /api/healthz are on a different path and are never affected.
app.use("/api/auth", authRateLimiter);

app.use("/api", router);

export default app;
