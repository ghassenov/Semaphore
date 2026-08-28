import { defineConfig } from "vite";

/**
 * The client's build. Two things here are deliberate.
 *
 * `base: "./"` keeps every asset reference relative, so the same bundle works
 * from a Pages project root and from a preview deployment's path without a
 * rebuild.
 *
 * The dev proxy is what lets `VITE_WORKER_ORIGIN` stay empty in development:
 * the client always talks to `/session/...` on its own origin, and in dev that
 * is forwarded to a local `wrangler dev`. No origin is ever written into a
 * source file (see the repo CLAUDE.md, section 3).
 */
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  server: {
    proxy: {
      "/session": {
        target: process.env.WORKER_DEV_ORIGIN ?? "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
