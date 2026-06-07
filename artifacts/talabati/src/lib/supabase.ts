import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

if (!supabaseUrl || !supabaseKey) {
  // Non-fatal warning — Realtime notifications will be unavailable until
  // VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are added to secrets.
  // All other app features (login, orders, subscriptions) continue working.
  console.warn(
    "[Supabase] VITE_SUPABASE_URL أو VITE_SUPABASE_ANON_KEY غير مضبوطَين — " +
    "ميزات الإشعارات الفورية معطّلة. الرجاء إضافة المفاتيح في إعدادات Secrets."
  );
}

export const supabase = createClient(
  supabaseUrl  || "https://placeholder.supabase.co",
  supabaseKey  || "placeholder-anon-key",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export const DRIVER_DOCS_BUCKET = "driver-verification";

/**
 * Upload a driver file by proxying through the API server.
 *
 * The new Supabase project has RLS enabled on storage.objects with no anon-insert
 * policy, so direct browser uploads with the anon key are blocked. The API server
 * holds the service_role key which bypasses RLS — files are uploaded server-side
 * and the public URL is returned here.
 *
 * The service_role key never touches the client. This is also more secure.
 */
export async function uploadDriverFile(
  driverId: string,
  slot: "truck-front" | "license",
  file: File
): Promise<string> {
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined ?? "").replace(/\/+$/, "");

  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("driverId", driverId);
  formData.append("slot", slot);

  const res = await fetch(`${apiBase}/api/driver/upload-file`, {
    method: "POST",
    body: formData,
    // Do NOT set Content-Type — the browser sets it with the correct multipart boundary.
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `فشل رفع الملف (${slot}): HTTP ${res.status}`);
  }

  const data = await res.json() as { url: string };
  return data.url;
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
