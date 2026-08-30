/**
 * The palette against the stylesheet, enforced on every build.
 *
 * `src/render/palette.ts` is the locked colour set. `src/style.css` restates
 * every one of those values as a custom property, because the console is styled
 * by CSS and the station is rendered by WebGL, and neither can read the other's
 * source. Two copies of a number is one copy that can be edited alone.
 *
 * Nothing at runtime notices when they drift. The room stays lit in one set of
 * colours and the panels around it slide into another, which does not throw, does
 * not warn, and reads as a design choice nobody made. It is exactly the class of
 * failure that survives review and is obvious in a screenshot - which is the
 * same argument the deleted `check-art.mjs` made about frame counts, and this
 * script stands in its place now the art pack is gone.
 *
 * A build script rather than a unit test for two reasons. Reading a sibling file
 * needs `node:fs`, and the client's tsconfig deliberately carries no Node types.
 * And Vitest stubs CSS imports to an empty string, so `?raw` cannot see the
 * stylesheet either: a test written that way passes by comparing the palette
 * against nothing. That is the same arrangement `check-bundle.mjs` is in, for
 * the same reason. The properties of the palette that *can* be checked without a
 * filesystem are checked in `src/render/palette.test.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

/**
 * The palette, read out of the source rather than duplicated here.
 *
 * A third copy of the colours would be a third thing to keep in step, and the
 * whole point of this script is that one of two copies is already wrong.
 */
function palette() {
  const source = readFileSync(join(root, "src", "render", "palette.ts"), "utf8");
  const entries = [...source.matchAll(/^ {2}([a-zA-Z]+):\s*(0x[0-9a-f]{6}),$/gm)];
  if (entries.length === 0) {
    throw new Error("palette.ts has no colour entries, or their shape changed");
  }
  return entries.map(([, name, value]) => [name, `#${value.slice(2).toLowerCase()}`]);
}

/** Every `--name: #rrggbb;` custom property declared in the stylesheet. */
function stylesheet() {
  const source = readFileSync(join(root, "src", "style.css"), "utf8");
  const declared = new Map();
  for (const [, name, value] of source.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    declared.set(name, value.toLowerCase());
  }
  return declared;
}

/** `lampDeep` in TypeScript is `--lamp-deep` in CSS. */
function kebab(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

const colours = palette();
const declared = stylesheet();
const problems = [];

for (const [name, value] of colours) {
  const property = kebab(name);
  const found = declared.get(property);
  if (found === undefined) {
    problems.push(`  style.css is missing --${property} (palette.ts has ${name}: ${value})`);
    continue;
  }
  if (found !== value) {
    problems.push(`  --${property} is ${found} in style.css and ${value} in palette.ts`);
  }
}

// The other direction too. A custom property the palette does not know about is
// a fifteenth colour that arrived through a stylesheet, which is exactly as much
// of a problem as one that arrives through an image editor and is easier to do
// by accident.
const known = new Set(colours.map(([name]) => kebab(name)));
for (const property of declared.keys()) {
  if (!known.has(property)) {
    problems.push(`  --${property} is in style.css and is not a palette colour`);
  }
}

if (problems.length > 0) {
  console.error(`palette: the stylesheet and the palette disagree.\n${problems.join("\n")}`);
  process.exit(1);
}

console.log(`palette: ${String(colours.length)} colours, style.css agrees [verified]`);
