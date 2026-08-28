/**
 * The art, authored as pixels in source rather than loaded as files.
 *
 * Every sprite in this file is an array of strings, one row per pixel row, one
 * character per pixel, mapped to the locked palette. Three reasons it is done
 * this way rather than with a PNG pipeline.
 *
 * **The palette cannot drift.** A character maps to a `PALETTE` key, so a
 * fifteenth colour cannot arrive through an image editor without going through
 * the decision log first (doc 06 section 2). An imported PNG can hold any
 * colour it likes and nothing would notice.
 *
 * **It costs nothing.** No asset files, no loader, no atlas, no request. The
 * generated textures come to a few kilobytes of source against a 400KB budget
 * that Phaser has already spent 358KB of (D-026).
 *
 * **It is ours.** A hackathon submission is MIT-licensed and its provenance
 * has to be clean. Every pixel here was authored in this file, so there is no
 * third-party licence to track, attribute or get wrong.
 *
 * The glyphs are the part that matters. They are the game's central `VISUAL`
 * fact: PILOT sees a shape and has to get it across a gap to a partner holding
 * a table of names. Rendering them as their *names* - which the greybox did -
 * quietly deleted the puzzle, because reading a label aloud is not describing
 * a shape. `wave` and `knot` are deliberately alike at a glance (doc, the
 * `confusableWith` field): a good agent asks a clarifying question there and a
 * bad one guesses, and the benchmark measures exactly that difference.
 */

import { PALETTE, type PaletteColour } from "./palette.js";

/** Every sprite is drawn on this grid. Tiles are 16x16 (doc 06 section 3). */
export const SPRITE_SIZE = 16;

/**
 * A sprite: rows of characters, and what each character means.
 *
 * `.` is always transparent and is never in the map, so a sprite's shape is
 * readable in source as the thing it draws.
 */
export interface Sprite {
  readonly rows: readonly string[];
  readonly ink: Readonly<Record<string, PaletteColour>>;
}

/** The character every sprite uses for "nothing here". */
const CLEAR = ".";

/**
 * The twelve glyphs, drawn.
 *
 * Each is monochrome: the shape carries the meaning, and the colour is applied
 * at draw time from the channel the fact belongs to. That is deliberate. A
 * glyph tinted amber on a lever says "only PILOT can see this" with the same
 * mark that says "this is a spiral", and the two must not be able to disagree.
 */
const GLYPH_INK = { "#": "bone" } as const satisfies Record<string, PaletteColour>;

/** One entry per `GlyphId` in `apps/worker/src/chambers/glyphs.ts`. */
export const GLYPH_SPRITES: Readonly<Record<string, Sprite>> = {
  // SPIRAL, one stroke. A square spiral reads more clearly at sixteen pixels
  // than a round one, which turns to mush below about twenty-four.
  spiral: {
    ink: GLYPH_INK,
    rows: [
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
  },
  // CROSS, two strokes.
  cross: {
    ink: GLYPH_INK,
    rows: [
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
  },
  // BENT HOOK, three strokes. A shepherd's crook: curl at the top, foot below.
  hook: {
    ink: GLYPH_INK,
    rows: [
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
  },
  // HORNED ARCH, four strokes.
  arch: {
    ink: GLYPH_INK,
    rows: [
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
  },
  // BROKEN WAVE, five strokes. Deliberately close to KNOT at a glance: both
  // read as "a curvy vertical squiggle". The difference is that this one is
  // open and ends in mid-air, and that is what a careful description catches.
  wave: {
    ink: GLYPH_INK,
    rows: [
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
  },
  // OPEN EYE, six strokes.
  eye: {
    ink: GLYPH_INK,
    rows: [
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
  },
  // FIVE-POINT STAR, seven strokes.
  star: {
    ink: GLYPH_INK,
    rows: [
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
  },
  // KNOTTED LOOP, eight strokes. The other half of the confusable pair: this
  // one closes on itself and crosses in the middle.
  knot: {
    ink: GLYPH_INK,
    rows: [
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
  },
  // STACKED TRIANGLE, nine strokes.
  triangle: {
    ink: GLYPH_INK,
    rows: [
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
  },
  // SIX-TOOTH COMB, ten strokes. Six teeth, countable at this size.
  comb: {
    ink: GLYPH_INK,
    rows: [
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
  },
  // BARRED GATE, eleven strokes.
  gate: {
    ink: GLYPH_INK,
    rows: [
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
  },
  // TIGHT COIL, twelve strokes.
  coil: {
    ink: GLYPH_INK,
    rows: [
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
  },
};

/**
 * The two bodies, seen from above.
 *
 * They were 16x24 side elevations until D-035, when the station became a floor
 * plan. A figure drawn from the side standing on a floor drawn from above is
 * the single tell that gives a reskin away, so both were redrawn rather than
 * reused: one tile each, on the same grid as everything else in the room.
 *
 * They stay authored as pixels in this file, which is now the exception rather
 * than the rule (D-034). The art pack has no characters in it, and these two
 * are the only sprites in the game that carry meaning the pack could not know:
 * PILOT must not be amber and KEEPER must not have eyes.
 */
export const BODY_HEIGHT = SPRITE_SIZE;

/**
 * PILOT: a person in a suit, from above.
 *
 * Bone and hull, not amber. Amber means "only PILOT can perceive this", and
 * PILOT is not a fact only PILOT can perceive: the human is looking at
 * themselves. Using the channel colour for the body would make the legend lie
 * the first time somebody checked it against the screen. The lamp on the
 * helmet is the one amber thing, and it is a lamp.
 */
export const PILOT_SPRITE: Sprite = {
  ink: { "#": "bone", "=": "hullLight", o: "amber", "*": "amberBright" },
  rows: [
    "................",
    "....########....",
    "..############..",
    ".####======####.",
    ".###========###.",
    "####========####",
    "####==oooo==####",
    "####==oooo==####",
    "####========####",
    "####========####",
    ".###========###.",
    ".####======####.",
    "..############..",
    "..###**##**###..",
    "...##########...",
    "....########....",
  ],
};

/**
 * KEEPER: a maintenance frame in its alcove, from above.
 *
 * Cyan and brass, and deliberately not a head: it has a visor band rather than
 * eyes, because it cannot see and a pair of eyes would be the sprite
 * contradicting the premise. The brass segments down the sides are where the
 * limb count is drawn from the live registry.
 */
export const KEEPER_SPRITE: Sprite = {
  ink: { "#": "cyanDeep", "=": "cyan", "*": "cyanBright", b: "brass", "-": "rust" },
  rows: [
    "................",
    ".b############b.",
    ".b############b.",
    ".##==========##.",
    ".##==========##.",
    ".##==bbbbbb==##.",
    ".##==bbbbbb==##.",
    ".##==========##.",
    ".##==========##.",
    ".b############b.",
    ".b############b.",
    ".##**********##.",
    ".##**********##.",
    ".##############.",
    ".-############-.",
    "................",
  ],
};

/**
 * Turn a sprite into a canvas, one source pixel to one canvas pixel.
 *
 * `createImageData` and a single `putImageData` rather than a fill per pixel:
 * a 16x24 body is 384 fills otherwise, and this runs once per sprite at boot
 * for a dozen sprites.
 *
 * Throws on an unknown character rather than drawing it transparent. A typo in
 * a pixel map is otherwise invisible - the sprite simply comes out slightly
 * wrong, in a way nobody notices until it is on a screenshot in a demo video.
 */
export function toCanvas(sprite: Sprite): HTMLCanvasElement {
  const height = sprite.rows.length;
  const width = Math.max(...sprite.rows.map((row) => row.length));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A 2D context is needed to build the sprites");

  const image = context.createImageData(width, height);
  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) {
      const char = row[x] ?? CLEAR;
      if (char === CLEAR && !(CLEAR in sprite.ink)) continue;
      const colour = sprite.ink[char];
      if (colour === undefined) {
        throw new Error(
          `Sprite row ${String(y)} uses "${char}", which its ink map does not define`,
        );
      }
      const value = PALETTE[colour];
      const at = (y * width + x) * 4;
      image.data[at] = (value >> 16) & 0xff;
      image.data[at + 1] = (value >> 8) & 0xff;
      image.data[at + 2] = value & 0xff;
      image.data[at + 3] = 255;
    }
  });
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Texture keys, so a scene never spells one by hand. */
export const TEXTURE = {
  glyph: (id: string) => `glyph-${id}`,
  pilot: "body-pilot",
  keeper: "body-keeper",
} as const;

/**
 * Every sprite, keyed by the texture name it becomes.
 *
 * One table so `scenes.ts` can register the lot in a loop, and so
 * `sprites.test.ts` can hold every one of them to the same well-formedness
 * checks without a list that drifts from this one.
 */
export function allSprites(): ReadonlyMap<string, Sprite> {
  const sprites = new Map<string, Sprite>();
  for (const [id, sprite] of Object.entries(GLYPH_SPRITES)) sprites.set(TEXTURE.glyph(id), sprite);
  sprites.set(TEXTURE.pilot, PILOT_SPRITE);
  sprites.set(TEXTURE.keeper, KEEPER_SPRITE);
  return sprites;
}
