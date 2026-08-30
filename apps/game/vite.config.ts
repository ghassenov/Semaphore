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
/**
 * Hostnames the dev server will answer to, beyond localhost.
 *
 * Vite rejects requests carrying an unrecognised `Host` header, which is the
 * right default and exactly what a tunnel trips over: testing in ChatGPT's
 * in-app browser means putting the dev server behind a public hostname, and
 * that hostname is different every time the tunnel restarts.
 *
 * It comes from the environment rather than from this file because a domain
 * name in a source file is a bug (repo CLAUDE.md section 3), and because the
 * host is a property of whoever is tunnelling today, not of the project.
 *
 *   DEV_ALLOWED_HOSTS=".trycloudflare.com" pnpm dev
 *
 * A leading dot matches subdomains. Empty by default, so nothing is exposed
 * to an unexpected host unless somebody asks for it.
 */
const allowedHosts = (process.env.DEV_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter((host) => host.length > 0);

export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  server: {
    ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
    proxy: {
      "/session": {
        target: process.env.WORKER_DEV_ORIGIN ?? "http://127.0.0.1:8787",
        changeOrigin: true,
        // PILOT's view arrives over a WebSocket on the same path prefix, so
        // the proxy has to forward the upgrade as well as the fetches.
        ws: true,
      },
      // The recording SPECTATE and attract mode play. It is the worker's one
      // route with no session behind it, so it does not live under `/session`
      // and would otherwise be answered by this dev server with its own index
      // page. In production `VITE_WORKER_ORIGIN` names the worker and no
      // proxy is involved; in development the client asks its own origin and
      // this is what forwards it. Without this entry the gate screen shows a
      // monitor reading NO TAPE, which is a prop rather than an error, so
      // nothing anywhere reports that it is broken.
      "/ghost": {
        target: process.env.WORKER_DEV_ORIGIN ?? "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      // A finished session's log, for the replay viewer.
      //
      // Only the API path is forwarded. The *page* at `/replay/:id` is this
      // dev server's own index.html, served by Vite's history fallback, and
      // the client tells them apart the same way production does: the page is
      // an HTML navigation and this is a `fetch`. That works here only because
      // the client asks for `/replay/:id` with an `Accept: application/json`
      // preference and the proxy is keyed on the path - see `bypass`.
      // Only the API lives under this prefix. The *page* is `/replay?id=...`,
      // which has no trailing slash and so does not match: Vite's history
      // fallback serves the app for it, and this forwards only the data
      // request the app then makes.
      //
      // The separation is not tidiness. The page and the API shared
      // `/replay/:id` at first, and because the API answers with a
      // `cache-control` header, a navigation to a URL the app had already
      // fetched was served the cached JSON instead of the app: one request,
      // 200, and no modules loaded at all. `src/replay.ts` has the other
      // reason the path form had to go.
      "/replay/": {
        target: process.env.WORKER_DEV_ORIGIN ?? "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
    // Over a tunnel the page is served on https:443 while Vite still listens
    // on 5173, so the hot-reload socket has to be told where to call home or
    // it retries against a port the tunnel does not expose.
    ...(allowedHosts.length > 0 ? { hmr: { clientPort: 443, protocol: "wss" } } : {}),
  },
});
