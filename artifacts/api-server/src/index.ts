// Node.js 20 has no native WebSocket — polyfill before any Supabase import.
import WebSocket from "ws";
(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;

import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "./lib/migrate";
import { ensureDriverBucket } from "./lib/storage-init";
import { initRealtimeBroadcast } from "./lib/supabase-server";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run DB migrations before accepting any traffic.
// Uses CREATE TABLE IF NOT EXISTS — safe to run on every cold start.
runMigrations()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");

      ensureDriverBucket().catch((e) =>
        logger.error({ err: e }, "Unexpected error in ensureDriverBucket")
      );

      initRealtimeBroadcast();
    });
  })
  .catch((err) => {
    logger.error({ err }, "DB migration failed — aborting startup");
    process.exit(1);
  });
