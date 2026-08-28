/**
 * The bundle budget, enforced on every build (plan section 0.4, doc 07 section 6).
 *
 * The budget is 400KB gzipped on what a browser downloads to render the first
 * screen. Phaser alone is roughly 358KB of that, which is why it sits behind a
 * dynamic import in `render/station.ts` and lands in a chunk of its own: a
 * browser without WebMCP gets the gate screen and never fetches it at all.
 *
 * That arrangement is one careless `import Phaser from "phaser"` away from
 * being undone, and nothing about the resulting page would look wrong. So this
 * script measures the entry chunk specifically, rather than the total, and
 * fails the build when the engine leaks back into it.
 */

import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Everything the browser fetches before the first paint, gzipped. */
const ENTRY_BUDGET_BYTES = 400 * 1024;

/**
 * The eager entry chunk, which is the one the budget is about.
 *
 * Vite names the entry after the HTML page it serves, so it is the `index-*`
 * file; the lazily imported chunks carry their own module's name. Matching on
 * the prefix rather than parsing the manifest keeps this script to one read.
 */
const dist = join(import.meta.dirname, "..", "dist", "assets");
const eager = readdirSync(dist).filter((name) => /^index-.*\.(js|css)$/.test(name));

if (eager.length === 0) {
  console.error("bundle budget: no entry chunk in dist/assets. Did the build run?");
  process.exit(1);
}

let total = 0;
for (const name of eager) {
  const bytes = gzipSync(readFileSync(join(dist, name))).length;
  total += bytes;
  console.log(`  ${name}  ${(bytes / 1024).toFixed(1)}KB gzipped`);
}

const kb = (total / 1024).toFixed(1);
const budgetKb = (ENTRY_BUDGET_BYTES / 1024).toFixed(0);
if (total > ENTRY_BUDGET_BYTES) {
  console.error(
    `bundle budget: entry is ${kb}KB gzipped, over the ${budgetKb}KB budget.\n` +
      "The usual cause is a static import of phaser outside render/station.ts's dynamic import.",
  );
  process.exit(1);
}
console.log(`bundle budget: entry ${kb}KB / ${budgetKb}KB gzipped [verified]`);
