import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getSupabaseServer } from "../lib/supabase-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Legacy ping (no DB check) ─────────────────────────────────────────────────
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// ── Full health check with Supabase connectivity probe ───────────────────────
// Returns 200 { status: "ok", timestamp } when the DB is reachable.
// Returns 503 { status: "error", timestamp, detail } when it is not.
// No auth headers required — the session middleware skips /health/* paths.
router.get("/health", async (_req, res) => {
  logger.info("Health check requested");

  const timestamp = new Date().toISOString();
  const client = getSupabaseServer();

  if (!client) {
    res.status(503).json({
      status: "error",
      timestamp,
      detail: "Supabase client not initialised — SUPABASE_URL or key missing",
    });
    return;
  }

  try {
    const { error } = await client.from("_health_probe").select("1").limit(1);

    // A "relation does not exist" error (code 42P01) means the DB is reachable
    // but the table doesn't exist — that still counts as a healthy connection.
    if (error && error.code !== "42P01") {
      logger.warn({ err: error }, "Health check: Supabase probe failed");
      res.status(503).json({
        status: "error",
        timestamp,
        detail: error.message,
      });
      return;
    }

    res.status(200).json({ status: "ok", timestamp });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "Health check: unexpected error during Supabase probe");
    res.status(503).json({ status: "error", timestamp, detail: message });
  }
});

export default router;
