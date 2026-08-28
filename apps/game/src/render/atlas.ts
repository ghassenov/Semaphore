/**
 * The art pack, described as data.
 *
 * Every file under `public/art/` is named here once, with the number of frames
 * it holds and the channel it belongs to, and nothing else in the client
 * spells an art path or a frame number by hand. That is the same discipline
 * `palette.ts` applies to colour and it exists for the same reason: a frame
 * index that is wrong by one is invisible in review and obvious on a screen.
 *
 * **This module contains no Phaser.** It is a table plus the arithmetic that
 * turns a tile coordinate into a frame, which makes it the half of the art
 * layer that can be tested without a canvas. `scenes.ts` reads `LOAD` and does
 * the loading.
 *
 * **The three directories are the three channels** (D-034). The pack ships
 * every object in six colours; Semaphore uses exactly three of them because
 * colour here is not decoration, it is which of the two parties perceives the
 * thing. Yellow is PILOT's, blue is KEEPER's, neutral is what both see. That
 * mapping is why an off-the-shelf pack fits a game about asymmetry at all, and
 * it is the reason there is no tinting step: the artist's own shading survives,
 * and a channel cannot be applied to a sprite by accident because it was
 * chosen when the file was named.
 */

import type { RenderChannel } from "./palette.js";

/** Every sprite in the pack is drawn on this grid. */
export const TILE = 16;

/** Where each channel's art lives, under `public/art/`. */
export const CHANNEL_DIR: Readonly<Record<RenderChannel, string>> = {
  pilot: "pilot",
  keeper: "keeper",
  shared: "shared",
} as const;

/**
 * The sheets each channel carries, and how many 16x16 frames each holds.
 *
 * Present in all three colours, so a device can move channel without the
 * caller checking whether the art exists. That symmetry is worth the handful
 * of unused files it costs: the alternative is a lookup that can fail, in the
 * one part of the renderer whose whole job is to make the channel visible.
 */
export const CHANNEL_SHEETS = {
  lever: 3,
  button: 2,
  switch: 2,
  led: 2,
  key: 1,
  box: 1,
  door: 3,
  "door-locked": 3,
  pad: 2,
  "pad-vfx": 4,
  turret: 2,
  laser: 1,
  "walls-out": 9,
} as const;

/** The sheets that exist only in neutral: the building, rather than its fittings. */
export const SHARED_SHEETS = {
  ground: 81,
  "ground-special": 30,
  hole: 81,
  "walls-in": 9,
  chest: 2,
  block: 1,
  "stairs-down": 1,
  "stairs-up": 1,
} as const;

export type ChannelSheet = keyof typeof CHANNEL_SHEETS;
export type SharedSheet = keyof typeof SHARED_SHEETS;

/**
 * The texture key for one sheet.
 *
 * Channel in the key rather than a tint at draw time, because two sprites that
 * differ only by who can perceive them must not be able to become the same
 * object through a forgotten `setTint`.
 */
export function textureKey(channel: RenderChannel, sheet: string): string {
  return `art-${CHANNEL_DIR[channel]}-${sheet}`;
}

/** One sheet to load: what Phaser's `load.spritesheet` needs, as plain data. */
export interface SheetLoad {
  readonly key: string;
  readonly url: string;
  readonly frames: number;
}

/**
 * Every sheet the client loads, in one list.
 *
 * Individual files rather than one packed atlas. A build step that packs them
 * would save thirty-odd requests on a connection that multiplexes them anyway,
 * and would cost a generator, a generated file in the tree, and a way for the
 * art and its coordinates to disagree. Thirty small files that are exactly the
 * artist's own files is the arrangement with nothing in it to drift.
 */
export const LOAD: readonly SheetLoad[] = [
  ...(["pilot", "keeper", "shared"] as const).flatMap((channel) =>
    Object.entries(CHANNEL_SHEETS).map(([sheet, frames]) => ({
      key: textureKey(channel, sheet),
      url: `art/${CHANNEL_DIR[channel]}/${sheet}.png`,
      frames,
    })),
  ),
  ...Object.entries(SHARED_SHEETS).map(([sheet, frames]) => ({
    key: textureKey("shared", sheet),
    url: `art/shared/${sheet}.png`,
    frames,
  })),
];

/**
 * The nine frames of a 48x48 wall sheet, in the order a row-major load gives
 * them.
 *
 * The pack draws its walls as one framed box, which is a nine-slice whether or
 * not it was authored as one: four corners that are placed, four edges that
 * repeat, and a centre that is the inside of the room. Naming them here is
 * what lets `scenes.ts` build a room of any size without a comment explaining
 * that 2 means top-right.
 */
export const SLICE = {
  topLeft: 0,
  top: 1,
  topRight: 2,
  left: 3,
  centre: 4,
  right: 5,
  bottomLeft: 6,
  bottom: 7,
  bottomRight: 8,
} as const;

/**
 * The ground frames that are surrounded on every side.
 *
 * The pack's ground is a 47-tile blob set for irregular shapes, and every
 * chamber here is a rectangle, so only the interior tiles are ever wanted. The
 * five differ by where their rivets sit, which is the whole decoration budget
 * for a floor: enough that a large room is not one flat colour, not so much
 * that the eye stops on the floor instead of on the mechanism.
 */
export const GROUND_FILL: readonly number[] = [24, 25, 33, 34, 42];

/**
 * Floor plates, for the places a room wants to say something without a device.
 *
 * The pack's special-ground sheet pads its unused cells with a flat fill
 * colour rather than transparency, so a frame index picked by eye off the
 * image is a solid olive square on the floor. These four are the ones that are
 * actually drawn art, which is why they are a named list rather than a range.
 */
export const PLATE = {
  /** Four corner rivets: a maintenance plate. Reads as a place to stand. */
  rivets: 26,
  /** A pale diamond inlay. The brightest thing the floor is allowed to be. */
  inlay: 18,
  /** A dark diamond inlay, for a floor that should stay quiet. */
  inlayDim: 15,
  /** Chequered plate: a threshold, or the strip in front of a door. */
  chequer: 23,
} as const;

/**
 * Which frame of a device sheet is which state.
 *
 * The pack's strips run from rest to acted-on, so these are in that order and
 * the names say what the game means rather than what the file was called.
 */
export const FRAMES = {
  /** The face-view lever: upright, halfway, thrown. */
  lever: { up: 0, mid: 1, down: 2 },
  button: { up: 0, pressed: 1 },
  switch: { off: 0, on: 1 },
  /** The lamp. Off is a dark bezel, on is lit: the pips and bolts use both. */
  led: { off: 0, on: 1 },
  /** The door, opening. `shut` is solid, `open` is a clear opening. */
  door: { shut: 0, ajar: 1, open: 2 },
  /** The locked door, which has a keyhole where the door has panels. */
  doorLocked: { shut: 0, ajar: 1, open: 2 },
  /** The round pad. Dark until it is carrying something. */
  pad: { dark: 0, lit: 1 },
  turret: { idle: 0, firing: 1 },
  chest: { shut: 0, open: 1 },
} as const;

/**
 * The ground frame for one tile of a room.
 *
 * Deterministic in the tile's own coordinates rather than random, because a
 * floor that reshuffles its rivets on every frame shimmers, and because a
 * screenshot of a seed should be the same screenshot every time. The multipliers
 * are coprime with the list length so neighbouring tiles rarely match, which is
 * the entire trick to making five tiles look like a floor.
 */
export function groundFrame(col: number, row: number): number {
  const index = (col * 3 + row * 7) % GROUND_FILL.length;
  return GROUND_FILL[index] ?? GROUND_FILL[0] ?? 0;
}
