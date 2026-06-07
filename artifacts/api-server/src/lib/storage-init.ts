/**
 * Storage Initialization — runs once at server startup.
 *
 * Bucket name: "driver-verification"
 *   • Used by the driver registration flow (truck-front photo + license).
 *   • Must be public so `getPublicUrl()` returns permanent, unauthenticated URLs
 *     that the app can store in the DB and render without a signed URL.
 *
 * Why service role?
 *   `listBuckets()` and `createBucket()` are storage-admin operations.
 *   The anon key only has access to buckets/objects that RLS permits for
 *   unauthenticated users — it cannot enumerate or create buckets.
 *   The service role key bypasses RLS and has full admin rights.
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { logger } from "./logger";

export const DRIVER_DOCS_BUCKET = "driver-verification";

/**
 * ensureDriverBucket()
 *
 * 1. Builds a Supabase admin client using SUPABASE_SERVICE_ROLE_KEY.
 * 2. Lists all buckets on the project.
 * 3. If "driver-verification" is missing, creates it as a public bucket.
 * 4. Logs the result so the outcome is always visible in server logs.
 *
 * Non-fatal: if the service role key is absent or the call fails, the server
 * continues — drivers will still get a clear upload error rather than a crash.
 */
export async function ensureDriverBucket(): Promise<void> {
  const supabaseUrl     = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    logger.warn("ensureDriverBucket: SUPABASE_URL not set — skipping bucket check");
    return;
  }

  if (!serviceRoleKey) {
    logger.warn(
      { bucket: DRIVER_DOCS_BUCKET },
      "ensureDriverBucket: SUPABASE_SERVICE_ROLE_KEY not set — " +
      "cannot verify/create bucket automatically. " +
      "Create the bucket manually in the Supabase dashboard (Storage → New bucket → public: true)."
    );
    return;
  }

  // Normalise the URL (strip trailing path segments that sneak in from copy-paste)
  const projectUrl = supabaseUrl
    .replace(/\/(rest|auth|storage|realtime|functions)(\/.*)?$/, "")
    .replace(/\/$/, "");

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  // ── Step 1: list all buckets ─────────────────────────────────────────────
  const { data: buckets, error: listError } = await admin.storage.listBuckets();

  if (listError) {
    logger.error(
      { bucket: DRIVER_DOCS_BUCKET, err: listError.message },
      "ensureDriverBucket: listBuckets() failed — check SUPABASE_SERVICE_ROLE_KEY"
    );
    return;
  }

  const bucketNames = (buckets ?? []).map((b) => b.name);
  logger.debug({ found: bucketNames }, "ensureDriverBucket: existing buckets");

  // ── Step 2: create if missing ────────────────────────────────────────────
  if (bucketNames.includes(DRIVER_DOCS_BUCKET)) {
    logger.info(
      { bucket: DRIVER_DOCS_BUCKET },
      `✅ Storage bucket "${DRIVER_DOCS_BUCKET}" already exists — driver uploads are ready`
    );
    return;
  }

  logger.warn(
    { bucket: DRIVER_DOCS_BUCKET },
    `⚠️  Bucket "${DRIVER_DOCS_BUCKET}" not found — creating it now…`
  );

  const { error: createError } = await admin.storage.createBucket(DRIVER_DOCS_BUCKET, {
    public: true,            // objects get permanent public URLs — no signed URLs needed
    allowedMimeTypes: [      // restrict to images/video only
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ],
    fileSizeLimit: 20971520, // 20 MB per file
  });

  if (createError) {
    logger.error(
      { bucket: DRIVER_DOCS_BUCKET, err: createError.message },
      `❌ Failed to create bucket "${DRIVER_DOCS_BUCKET}" — driver uploads will fail until it is created manually`
    );
    return;
  }

  logger.info(
    { bucket: DRIVER_DOCS_BUCKET },
    `✅ Bucket "${DRIVER_DOCS_BUCKET}" created successfully (public, 20 MB limit) — driver uploads are ready`
  );
}
