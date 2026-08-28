import { defineConfig } from "vite";

/**
 * The archive origin's build.
 *
 * `base: "./"` for the same reason the game uses it: the bundle has to work
 * from a Pages project root and from a preview deployment's path without a
 * rebuild, and this project gets a preview deploy on every pull request
 * because the cross-origin delegation path cannot be tested on one origin.
 *
 * The dev server listens on a fixed port so that "a second origin" is a
 * stable thing to point `VITE_ARCHIVE_ORIGIN` at during local development.
 * On localhost a second origin is a second port; in production it is a second
 * hostname, and neither is written into a source file.
 */
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  server: { port: 5174, strictPort: true },
});
