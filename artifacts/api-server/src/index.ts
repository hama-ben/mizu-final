import app from "./app";
import { logger } from "./lib/logger";
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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Verify the driver-verification storage bucket exists; create it if missing.
  // Runs after the server is already accepting requests so startup latency is unaffected.
  ensureDriverBucket().catch((e) =>
    logger.error({ err: e }, "Unexpected error in ensureDriverBucket")
  );

  // Connect the persistent Realtime broadcast channel used for new-order notifications.
  initRealtimeBroadcast();
});
