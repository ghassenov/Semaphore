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
 * Which sides of a floor tile have no floor beyond them, as bits.
 *
 * The pack's ground sheet is an autotile: each frame already carries the dark
 * inset shading for whichever of its four sides is an edge, which is what
 * makes a room read as a room rather than as a rectangle of texture. A tile
 * therefore has to be chosen from its neighbours, not from its own position.
 */
export const EDGE = { top: 1, bottom: 2, left: 4, right: 8 } as const;

/** Every side. A tile with no floor around it at all. */
export const EDGE_ALL = EDGE.top | EDGE.bottom | EDGE.left | EDGE.right;

/**
 * The sixteen ground frames, indexed by an `EDGE` mask.
 *
 * Derived by classifying every frame of `shared/ground.png` rather than picked
 * by eye: each entry is the frame whose art is shaded on exactly the sides the
 * index names. The sheet is a 47-tile blob set, but a room built from
 * rectangles only ever needs the sixteen orthogonal cases, and the pack has no
 * concave-corner art to want for the rest.
 *
 * This replaces `GROUND_FILL`, which scattered frames 24, 25, 33, 34 and 42
 * across the floor as though they were rivet variants. They are not: they are
 * one coherent bolted-floor set whose bolts are drawn to meet at shared tile
 * corners, so choosing between them per tile broke every bolt into a stray
 * fragment and stippled the whole room.
 */
export const FLOOR_BY_EDGE: readonly number[] = [
  20, 11, 29, 38, 19, 10, 28, 37, 21, 12, 30, 39, 22, 13, 31, 40,
];

/** The four diagonal neighbours, as bits. Used only by `wallFrame`. */
export const CORNER = { topLeft: 1, topRight: 2, bottomLeft: 4, bottomRight: 8 } as const;

/**
 * The wall frames, indexed by which orthogonal neighbours hold floor.
 *
 * The inverse of the floor table: a wall tile is chosen by where the room is,
 * so a wall with floor below it is the room's top edge, and a wall with floor
 * below and to the right is its top-left corner. A wall with floor on two
 * opposite sides is a partition one tile thick, which the pack has no art for,
 * so it falls to the solid centre fill.
 *
 * `-1` is the tile with no orthogonal floor at all: either solid wall or the
 * outside of a convex corner, which only the diagonals can tell apart.
 */
const WALL_BY_SIDE: readonly number[] = [
  -1,
  SLICE.bottom,
  SLICE.top,
  SLICE.centre,
  SLICE.right,
  SLICE.bottomRight,
  SLICE.topRight,
  SLICE.centre,
  SLICE.left,
  SLICE.bottomLeft,
  SLICE.topLeft,
  SLICE.centre,
  SLICE.centre,
  SLICE.centre,
  SLICE.centre,
  SLICE.centre,
];

/**
 * The ground frame for one tile, from the sides that are edges.
 *
 * Total over every mask, so a caller cannot produce a floor with a hole in it
 * by passing a combination nobody thought of.
 */
export function floorFrame(edges: number): number {
  return FLOOR_BY_EDGE[edges & EDGE_ALL] ?? FLOOR_BY_EDGE[0] ?? 0;
}

/**
 * The wall frame for one tile.
 *
 * `sides` names the orthogonal neighbours that are floor, in `EDGE` bits;
 * `corners` names the diagonal ones in `CORNER` bits. The diagonals are
 * consulted only for the tile with no orthogonal floor, which is exactly the
 * one sitting outside a room's convex corner: drawn as solid fill it puts a
 * notch in the outline, and the corner it actually needs is the one opposite
 * the diagonal the floor sits on.
 */
export function wallFrame(sides: number, corners: number): number {
  const direct = WALL_BY_SIDE[sides & EDGE_ALL] ?? -1;
  if (direct >= 0) return direct;
  if (corners & CORNER.bottomRight) return SLICE.topLeft;
  if (corners & CORNER.bottomLeft) return SLICE.topRight;
  if (corners & CORNER.topRight) return SLICE.bottomLeft;
  if (corners & CORNER.topLeft) return SLICE.bottomRight;
  return SLICE.centre;
}

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
