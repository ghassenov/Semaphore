/**
 * The twelve glyphs, authored as pixels, engraved into the 3D station.
 *
 * These are the game's central `VISUAL` fact and the one piece of art that
 * could never be bought, borrowed or generated: PILOT sees a shape and has to
 * get it across a gap to a partner holding a table of names. Rendering them as
 * their *names* deletes the puzzle, because reading a label aloud is not
 * describing a shape (D-029, and it stands).
 *
 * So they survived the renderer being replaced (D-042) unchanged, pixel for
 * pixel. What changed is only what they become: they were sprite textures on a
 * tile, and they are now **unlit marks on a plate**, tinted with the channel
 * they belong to, standing in front of a brass plate above the mechanism they
 * name.
 *
 * **Three deliberate properties, none of them cosmetic.**
 *
 * *They stay pixels in a smooth world.* The texture filter is nearest, so a
 * glyph is crisp-edged against geometry that is not. That reads as something
 * stamped or engraved by a machine rather than modelled, which is what these
 * are in the fiction, and it makes the one thing PILOT must describe the one
 * thing in the frame with hard edges.
 *
 * *They are unlit.* Every other surface in the station answers to a light.
 * These may not: a glyph in shadow is a glyph nobody can describe, and the
 * chamber would stall on a lighting decision. `MeshBasicMaterial` is the
 * correct choice here for a reason that is about the puzzle, not about cost.
 *
 * *They are monochrome in source and tinted at draw time.* The mark that says
 * "this is a spiral" is the same mark that says "only PILOT perceives this",
 * so the two cannot be made to disagree.
 *
 * `wave` and `knot` are deliberately alike at a glance, honouring
 * `confusableWith` in the worker's glyph table: a good agent asks a clarifying
 * question there and a bad one guesses, and the benchmark measures exactly that
 * difference. `glyphs.test.ts` holds the pair to that.
 */

/** Every glyph is drawn on this grid. */
export const GLYPH_SIZE = 16;

/**
 * How many device pixels each source pixel becomes in the generated texture.
 *
 * Eight, so a 16x16 mark becomes 128x128. Large enough that the nearest-filter
 * upscale to a plate a few hundred pixels across on screen stays square-edged,
 * small enough that twelve of them cost well under a megabyte of texture memory
 * between them.
 */
const GLYPH_SCALE = 8;

/** A glyph: rows of characters, `#` set and `.` clear. */
export type GlyphRows = readonly string[];

/**
 * The twelve glyphs.
 *
 * Ordered by stroke count, which is the quantity KEEPER's manual table is keyed
 * on and the Signal Room's rule sorts by, so the source reads in the order the
 * puzzle does. One entry per `GlyphId` in `apps/worker/src/chambers/glyphs.ts`.
 */
export const GLYPHS: Readonly<Record<string, GlyphRows>> = {
  // SPIRAL, one stroke. A square spiral reads more clearly at sixteen pixels
  // than a round one, which turns to mush below about twenty-four.
  spiral: [
    "................",
    "..############..",
    "..#..........#..",
    "..#.########.#..",
    "..#.#......#.#..",
    "..#.#.####.#.#..",
    "..#.#.#..#.#.#..",
    "..#.#.#..#.#.#..",
    "..#.#.#..#.#.#..",
    "..#.#.#.##.#.#..",
    "..#.#.#....#.#..",
    "..#.#.######.#..",
    "..#.#........#..",
    "..#.##########..",
    "..#.............",
    "................",
  ],
  // CROSS, two strokes.
  cross: [
    "................",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    ".##############.",
    ".##############.",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    ".......##.......",
    "................",
  ],
  // BENT HOOK, three strokes. A shepherd's crook: curl at the top, foot below.
  hook: [
    "................",
    "........#####...",
    ".......##...##..",
    "......##.....##.",
    "......##.....##.",
    "......##.....##.",
    "......##....##..",
    "......#######...",
    "......##........",
    "......##........",
    "......##........",
    "......##........",
    "......##........",
    "..##..##........",
    "..##..##........",
    "..########......",
  ],
  // HORNED ARCH, four strokes.
  arch: [
    "................",
    "..##........##..",
    "..##........##..",
    "..##........##..",
    "..###......###..",
    "...####..####...",
    "....########....",
    "...##......##...",
    "..##........##..",
    "..##........##..",
    "..##........##..",
    "..##........##..",
    "..##........##..",
    "..##........##..",
    "..##........##..",
    "................",
  ],
  // BROKEN WAVE, five strokes. Deliberately close to KNOT at a glance: both
  // read as "a curvy vertical squiggle". The difference is that this one is
  // open and ends in mid-air, and that is what a careful description catches.
  wave: [
    "................",
    ".....#######....",
    "...###.....##...",
    "..##.........#..",
    "..##............",
    "..###...........",
    "...####.........",
    ".....#####......",
    "........#####...",
    "...........###..",
    "............##..",
    ".#.........##...",
    ".##.......###...",
    "..###...####....",
    "....#######.....",
    "................",
  ],
  // OPEN EYE, six strokes.
  eye: [
    "................",
    "................",
    "................",
    "....########....",
    "..##........##..",
    ".##...####...##.",
    ".#...######...#.",
    "##...######...##",
    "##...######...##",
    ".#...######...#.",
    ".##...####...##.",
    "..##........##..",
    "....########....",
    "................",
    "................",
    "................",
  ],
  // FIVE-POINT STAR, seven strokes.
  star: [
    "................",
    ".......##.......",
    ".......##.......",
    "......####......",
    "......####......",
    ".##############.",
    "..############..",
    "...##########...",
    "....########....",
    "....########....",
    "...###....###...",
    "..###......###..",
    ".###........###.",
    ".##..........##.",
    "................",
    "................",
  ],
  // KNOTTED LOOP, eight strokes. The other half of the confusable pair: this
  // one closes on itself and crosses in the middle.
  knot: [
    "................",
    "....######......",
    "...##....##.....",
    "..##......##....",
    "..##......##....",
    "...##....##.....",
    "....##..##......",
    ".....####.......",
    "....##..##......",
    "...##....##.....",
    "..##......##....",
    "..##......##....",
    "...##....##.....",
    "....######......",
    "................",
    "................",
  ],
  // STACKED TRIANGLE, nine strokes.
  triangle: [
    "................",
    ".......##.......",
    "......####......",
    ".....######.....",
    "....########....",
    "...##########...",
    "................",
    ".......##.......",
    "......####......",
    ".....######.....",
    "....########....",
    "...##########...",
    "..############..",
    ".##############.",
    "................",
    "................",
  ],
  // SIX-TOOTH COMB, ten strokes. Six teeth, countable at this size.
  comb: [
    "................",
    "................",
    "..############..",
    "..############..",
    "..############..",
    "..#.#.#.#.#.#...",
    "..#.#.#.#.#.#...",
    "..#.#.#.#.#.#...",
    "..#.#.#.#.#.#...",
    "..#.#.#.#.#.#...",
    "..#.#.#.#.#.#...",
    "..#.#.#.#.#.#...",
    "..#.#.#.#.#.#...",
    "..#.#.#.#.#.#...",
    "................",
    "................",
  ],
  // BARRED GATE, eleven strokes.
  gate: [
    "................",
    "................",
    ".##############.",
    ".##############.",
    ".##..##..##..##.",
    ".##..##..##..##.",
    ".##############.",
    ".##############.",
    ".##..##..##..##.",
    ".##..##..##..##.",
    ".##############.",
    ".##############.",
    ".##..##..##..##.",
    ".##..##..##..##.",
    ".##############.",
    ".##############.",
  ],
  // TIGHT COIL, twelve strokes.
  coil: [
    "................",
    "...##########...",
    "..##........##..",
    "...##########...",
    "..##........##..",
    "...##########...",
    "..##........##..",
    "...##########...",
    "..##........##..",
    "...##########...",
    "..##........##..",
    "...##########...",
    "..##........##..",
    "...##########...",
    "................",
    "................",
  ],
};

/** Every glyph id the station knows how to draw. */
export const GLYPH_IDS: readonly string[] = Object.freeze(Object.keys(GLYPHS));

/** Whether a character marks a set pixel. Everything else is clear. */
function isSet(char: string | undefined): boolean {
  return char === "#";
}

/**
 * How many pixels a glyph sets.
 *
 * Exported for the test rather than for the renderer: it is how "these two
 * shapes are similar but not the same drawing" is asserted without anybody
 * eyeballing a screenshot.
 */
export function inkCount(rows: GlyphRows): number {
  let count = 0;
  for (const row of rows) {
    for (const char of row) if (isSet(char)) count += 1;
  }
  return count;
}

/**
 * How much two glyphs overlap, as a fraction of the pixels either one sets.
 *
 * The Jaccard index over set pixels. One means the same drawing; zero means
 * they share nothing. `wave` and `knot` are supposed to land high and not at
 * one, which is the difference between "asks a clarifying question" and "cannot
 * tell them apart at all".
 */
export function overlap(a: GlyphRows, b: GlyphRows): number {
  let both = 0;
  let either = 0;
  for (let y = 0; y < GLYPH_SIZE; y += 1) {
    for (let x = 0; x < GLYPH_SIZE; x += 1) {
      const inA = isSet(a[y]?.[x]);
      const inB = isSet(b[y]?.[x]);
      if (inA && inB) both += 1;
      if (inA || inB) either += 1;
    }
  }
  return either === 0 ? 0 : both / either;
}

/**
 * Draw one glyph as an opaque-white-on-transparent canvas.
 *
 * White rather than the channel colour, because the material tints it: one
 * texture per glyph serves all three channels, and the tint is applied where
 * the channel is already known. Transparent rather than black-backed, so the
 * mark can be laid over a brass plate without a rectangle around it.
 *
 * Throws on a character that is neither set nor clear. A typo in a pixel map is
 * otherwise invisible: the glyph simply comes out slightly wrong, in a way
 * nobody notices until it is on a screenshot in a demo video.
 */
export function glyphCanvas(rows: GlyphRows, scale = GLYPH_SCALE): HTMLCanvasElement {
  const size = GLYPH_SIZE * scale;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A 2D context is needed to draw the glyphs");

  context.fillStyle = "#ffffff";
  rows.forEach((row, y) => {
    for (let x = 0; x < GLYPH_SIZE; x += 1) {
      const char = row[x] ?? ".";
      if (char === ".") continue;
      if (!isSet(char)) {
        throw new Error(`Glyph row ${String(y)} uses "${char}", which is neither "#" nor "."`);
      }
      context.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  return canvas;
}
