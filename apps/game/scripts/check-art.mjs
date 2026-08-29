/**
 * The art table against the files it names, enforced on every build.
 *
 * `src/render/atlas.ts` says how many 16x16 frames each sheet holds. Nothing at
 * runtime checks that claim: Phaser loads whatever PNG it is given, slices it
 * on the numbers it was told, and hands out frames that are half of two tiles.
 * The room then renders looking merely a bit wrong, which is exactly the class
 * of failure nobody catches in review and everybody catches in a demo video.
 *
 * A build script rather than a unit test because reading the files needs
 * `node:fs`, and the client's tsconfig deliberately carries no Node types. That
 * is the same arrangement `check-bundle.mjs` is in, for the same reason. The
 * arithmetic in the atlas that *can* be checked without a filesystem is checked
 * in `src/render/atlas.test.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const TILE = 16;
const root = join(import.meta.dirname, "..");

/**
 * The load table, read out of the source rather than duplicated here.
 *
 * A second copy of the frame counts would be a second thing to keep in step,
 * and the whole point of this script is that one of the two copies is already
 * wrong. So it parses the table it is checking: the sheet names and their
 * counts come from `atlas.ts` itself, and only the directory layout is
 * restated.
 */
function loadTable() {
  const source = readFileSync(join(root, "src", "render", "atlas.ts"), "utf8");
  const table = (name) => {
    const start = source.indexOf(`export const ${name} = {`);
    if (start < 0) throw new Error(`atlas.ts has no ${name}`);
    const end = source.indexOf("} as const;", start);
    const body = source.slice(start, end);
    return [...body.matchAll(/^ {2}"?([a-z-]+)"?:\s*(\d+),$/gm)].map((m) => [m[1], Number(m[2])]);
  };
  const sheets = [];
  for (const [sheet, frames] of table("CHANNEL_SHEETS")) {
    for (const dir of ["pilot", "keeper", "shared"])
      sheets.push([`art/${dir}/${sheet}.png`, frames]);
  }
  for (const [sheet, frames] of table("SHARED_SHEETS")) {
    sheets.push([`art/shared/${sheet}.png`, frames]);
  }
  return sheets;
}

/** A PNG's dimensions, from its IHDR. Sixteen bytes, no image library. */
function size(url) {
  const bytes = readFileSync(join(root, "public", url));
  if (bytes.readUInt32BE(0) !== 0x89504e47) throw new Error(`${url} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const problems = [];
const sheets = loadTable();
for (const [url, frames] of sheets) {
  let dimensions;
  try {
    dimensions = size(url);
  } catch (error) {
    problems.push(`${url}: ${error.message}`);
    continue;
  }
  const { width, height } = dimensions;
  if (width % TILE !== 0 || height % TILE !== 0) {
    problems.push(`${url}: ${width}x${height} is not a whole number of ${TILE}px tiles`);
    continue;
  }
  const actual = (width / TILE) * (height / TILE);
  if (actual !== frames) {
    problems.push(`${url}: atlas.ts claims ${frames} frames, the file holds ${actual}`);
  }
}

if (problems.length > 0) {
  console.error("art check: the atlas and the files disagree.\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("\nSee apps/game/public/art/CREDITS.md for what each directory holds.");
  process.exit(1);
}
console.log(`art check: ${String(sheets.length)} sheets match the atlas [verified]`);
