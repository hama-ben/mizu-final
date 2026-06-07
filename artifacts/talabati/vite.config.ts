import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const port = 5000;
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig(async ({ mode }) => {
  // loadEnv with prefix "" reads ALL keys from .env files (including non-VITE_ ones).
  // This lets local Android builds work with a plain .env.production.local file
  // while Replit hosted builds continue to use server-side process.env.
  const fileEnv = loadEnv(mode, path.resolve(import.meta.dirname), "");

  const supabaseUrl =
    process.env.SUPABASE_URL ??
    fileEnv.SUPABASE_URL ??
    fileEnv.VITE_SUPABASE_URL ??
    "";

  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ??
    fileEnv.SUPABASE_ANON_KEY ??
    fileEnv.VITE_SUPABASE_ANON_KEY ??
    "";

  const apiBaseUrl =
    process.env.VITE_API_BASE_URL ??
    fileEnv.VITE_API_BASE_URL ??
    "";

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    define: {
      "import.meta.env.VITE_SUPABASE_URL":      JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey),
      "import.meta.env.VITE_API_BASE_URL":       JSON.stringify(apiBaseUrl),
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      proxy: {
        "/api": {
          target: "http://localhost:8080",
          changeOrigin: true,
        },
      },
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
