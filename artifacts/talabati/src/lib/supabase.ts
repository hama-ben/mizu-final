import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "VITE_SUPABASE_URL أو VITE_SUPABASE_ANON_KEY غير مضبوطَين في إعدادات Vite"
  );
}

// FIX 3: Storage operations use a dedicated client with auth.persistSession = false
// and no lingering session tokens. Since RLS is fully disabled on the storage bucket,
// uploads succeed with only the anon key — no Authorization overrides needed.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const DRIVER_DOCS_BUCKET = "driver-verification";

/**
 * Upload a single File to the public Supabase Storage bucket "driver-verification".
 * - Bucket has RLS disabled → the anon key is sufficient, no extra auth headers needed.
 * - upsert: true  → idempotent; re-uploading replaces the previous file.
 * - getPublicUrl  → returns the permanent public URL stored in the DB.
 */
export async function uploadDriverFile(
  driverId: string,
  slot: "truck-front" | "license",
  file: File
): Promise<string> {
  const ext  = file.name.split(".").pop() ?? "bin";
  const path = `${driverId}/${slot}.${ext}`;

  // Use the vanilla storage client — no custom Authorization headers, no service role key.
  // The bucket is public (RLS off), so the anon key is enough.
  const { error } = await supabase.storage
    .from(DRIVER_DOCS_BUCKET)
    .upload(path, file, {
      upsert:      true,
      contentType: file.type,
    });

  if (error) {
    throw new Error(`فشل رفع الملف (${slot}): ${error.message}`);
  }

  // getPublicUrl never throws — it always returns a well-formed URL for public buckets.
  const { data } = supabase.storage
    .from(DRIVER_DOCS_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Update the driver's live GPS location in Supabase.
 * Uses the driver_locations table — يجب إنشاؤها مسبقاً في Supabase:
 *
 *   CREATE TABLE driver_locations (
 *     driver_id TEXT PRIMARY KEY,
 *     latitude  DOUBLE PRECISION NOT NULL,
 *     longitude DOUBLE PRECISION NOT NULL,
 *     updated_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 */
export async function updateDriverLocation(
  driverId: string,
  latitude: number,
  longitude: number
): Promise<void> {
  try {
    await supabase
      .from("driver_locations")
      .upsert(
        {
          driver_id:  driverId,
          latitude,
          longitude,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "driver_id" }
      );
  } catch {
    // Silently ignore — table may not exist yet
  }
}
