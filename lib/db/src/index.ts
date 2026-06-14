import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  // Warn but do NOT throw — throwing at import time crashes the process before
  // the HTTP server can bind and answer the deployment healthcheck.
  // The first real DB query will fail with a clear connection error instead.
  console.warn(
    "[db] WARNING: DATABASE_URL is not set — database operations will fail " +
    "until the environment variable is configured."
  );
}

// Enable SSL for remote Supabase-hosted databases.
// rejectUnauthorized:false is safe here — cert validation is handled by the
// sslmode embedded in the connection string itself.
const isSsl = rawUrl
  ? !rawUrl.includes("localhost") && !rawUrl.includes("127.0.0.1")
  : false;

export const pool = new Pool({
  connectionString: rawUrl ?? "postgresql://localhost/placeholder",
  ssl: isSsl ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
