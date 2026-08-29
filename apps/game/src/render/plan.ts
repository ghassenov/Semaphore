/**
 * The station as one building: where each room sits, and the corridors between.
 *
 * `room.ts` decides what is *in* a room and knows nothing about where that room
 * is; this module decides where the rooms are and knows nothing about what is
 * in them. That split is deliberate and it is the same one D-035 drew: a
 * chamber that reached for an absolute station coordinate could not be moved,
 * and a layout that knew about levers could not be tested without inventing
 * facts.
 *
 * **The whole station is autotiled in one pass.** A corridor meeting a room is
 * a junction, and two separate passes would each draw a wall the other one
 * wanted open. Resolved together, the wall simply ends in a corner on each side
 * of the opening, which is what a doorway is. This is also why the corridors
 * are declared as plain rectangles rather than as art: there is no corridor
 * tile, there is only floor, and the walls fall out of where the floor is not.
 *
 * **The layout is authored per mode, not derived.** There are two modes and
 * BRIEF is a genuinely different building (it drops the Blind Panel, and with
 * it the Archive, which only exists after the Blind Panel). Deriving one plan
 * from the other would mean corridors that dangle into a room that is not
 * there. Two authored plans and a test that floods the floor to prove each one
 * is a single connected space is far less machinery than a packing algorithm,
 * and it is the part that can actually be wrong.
 *
 * Nothing here is a puzzle fact. The building's shape is the same for every
 * seed, both parties could draw it, and a room the pair has not reached yet is
 * an empty shell: `roomPlan` returns nothing for a chamber whose facts have not
 * arrived, so there is no state to leak even if the walls are on screen.
 */

import { MODE_CHAMBERS, type SessionMode } from "@semaphore/protocol";
import {
  CANVAS,
  CHAMBER_ACCENT,
  CHAMBER_NOTCHES,
  INTERLUDE_PLAN,
  cellKey,
  shapeCells,
  tilesForCells,
  type CellOwner,
  type Rect,
  type Tile,
} from "./room.js";
import { TILE } from "./atlas.js";
import { FLOOR_NAMES, floorsFor, type FloorId } from "./floors.js";
import type { RenderChannel } from "./palette.js";

/**
 * Where one floor sits in the station, in station tiles.
 *
 * The size is not repeated here: it comes from `CHAMBER_NOTCHES`, so a chamber
 * that changes shape changes shape in the building too and cannot be laid out
 * against a stale width.
 */
export interface Placement {
  readonly col: number;
  readonly row: number;
}

/** One mode's building: where its floors are, and the corridors joining them. */
export interface StationLayout {
  readonly rooms: Readonly<Partial<Record<FloorId, Placement>>>;
  /** Corridors, in station tiles. Plain floor; the walls fall out around them. */
  readonly corridors: readonly Rect[];
}

/**
 * The Archive's own outline.
 *
 * It is not a chamber, so it has no entry in `CHAMBER_NOTCHES`, but it is a
 * room PILOT stands in and it needs a floor. Ten by six because the interlude
 * writes two lines of 8px text across the middle of it and a narrower room
 * would put "A DEAD MONITOR, STILL WARM" through both walls.
 */
export const ARCHIVE_SHAPE = { cols: 10, rows: 6, notches: [] as readonly Rect[] } as const;

/** The channel each floor's walls wear. The Archive is nobody's room. */
export const FLOOR_ACCENT: Readonly<Record<FloorId, RenderChannel>> = {
  ...CHAMBER_ACCENT,
  archive: "shared",
};

/**
 * The two buildings.
 *
 * FULL is a ring: the Airlock top-left, the Signal Room top-right, the Blind
 * Panel bottom-right and the Concord Lock bottom-left, with a spine of
 * corridors between them and the Archive hanging off the middle of the lower
 * one. Walking it in play order takes the pair clockwise around the building
 * and back to the door they came in near, which is the shape of the story.
 *
 * BRIEF has three rooms and no Archive (the Archive follows the Blind Panel,
 * which BRIEF drops), so it is a shallow V: across the top, then down into the
 * Concord Lock.
 *
 * Every number here is checked by `plan.test.ts`, which proves that nothing
 * overlaps, that the floor is one connected space, that every device in every
 * chamber still lands on floor, and that the whole thing fits the camera's
 * wide shot. The numbers were arrived at by hand and should not be trusted on
 * their own.
 */
export const STATION_LAYOUT: Readonly<Record<SessionMode, StationLayout>> = {
  full: {
    rooms: {
      airlock: { col: 0, row: 0 },
      signal_room: { col: 22, row: 0 },
      archive: { col: 15, row: 15 },
      blind_panel: { col: 22, row: 22 },
      concord_lock: { col: 0, row: 22 },
    },
    corridors: [
      // Airlock to Signal Room, across the top.
      { col: 16, row: 4, cols: 6, rows: 2 },
      // Signal Room down the right-hand side into the Blind Panel.
      { col: 28, row: 14, cols: 2, rows: 8 },
      // The lower spine, joining the Blind Panel to the Concord Lock.
      { col: 16, row: 27, cols: 6, rows: 2 },
      // The stub up off that spine into the Archive, which is why the Archive
      // is a detour rather than a room on the way.
      { col: 19, row: 21, cols: 2, rows: 6 },
    ],
  },
  brief: {
    rooms: {
      airlock: { col: 0, row: 0 },
      signal_room: { col: 22, row: 0 },
      concord_lock: { col: 14, row: 18 },
    },
    corridors: [
      { col: 16, row: 4, cols: 6, rows: 2 },
      // Down out of the Signal Room. Columns 23 and 24 rather than the middle
      // of the wall, because the Concord Lock's top corners are chamfered and
      // a corridor into a chamfer is a corridor into the void.
      { col: 23, row: 14, cols: 2, rows: 4 },
    ],
  },
};

/** The outline of one floor: its box, and the pieces cut out of it. */
export function shapeOf(floor: FloorId): {
  readonly cols: number;
  readonly rows: number;
  readonly notches: readonly Rect[];
} {
  return floor === "archive" ? ARCHIVE_SHAPE : (CHAMBER_NOTCHES[floor] ?? ARCHIVE_SHAPE);
}

/**
 * Where a floor sits in this mode's station, or null if the mode has no such
 * floor.
 *
 * Null rather than a default position, because a caller that asks for the
 * Blind Panel in a BRIEF session has made a mistake and drawing it at the
 * origin would hide that behind a room stacked on the Airlock.
 */
export function placementOf(mode: SessionMode, floor: FloorId): Placement | null {
  return STATION_LAYOUT[mode].rooms[floor] ?? null;
}

/**
 * Every floor cell of a mode's station, tagged with the floor it belongs to.
 *
 * Corridors are tagged with no floor, which is what makes them read as
 * in-between: they take no channel colour and they never light up as the room
 * the pair is standing in.
 */
export function stationCells(mode: SessionMode): ReadonlyMap<string, CellOwner> {
  const layout = STATION_LAYOUT[mode];
  const owners = new Map<string, CellOwner>();
  for (const floor of floorsFor(mode)) {
    const at = layout.rooms[floor];
    if (at === undefined) continue;
    const shape = shapeOf(floor);
    for (const key of shapeCells(shape.cols, shape.rows, shape.notches, at.col, at.row)) {
      owners.set(key, { channel: FLOOR_ACCENT[floor], owner: floor });
    }
  }
  for (const run of layout.corridors) {
    for (let row = run.row; row < run.row + run.rows; row += 1) {
      for (let col = run.col; col < run.col + run.cols; col += 1) {
        // A corridor never overwrites a room. If one ever did, the room would
        // silently lose its channel along that run.
        const key = cellKey(col, row);
        if (!owners.has(key)) owners.set(key, { channel: "shared", owner: null });
      }
    }
  }
  return owners;
}

/**
 * The whole building for one mode, resolved to tiles.
 *
 * Static for the life of a session, so `scenes.ts` builds it once. That is not
 * only a saving: it is what lets the station be plain game objects rather than
 * a pool, and a pool is the thing that would have to be re-sorted every frame
 * for a building that never changes.
 */
export function stationTiles(mode: SessionMode): readonly Tile[] {
  const owners = stationCells(mode);
  return tilesForCells(new Set(owners.keys()), owners);
}

/** The station's extent in tiles, wall ring included. */
export function stationBounds(mode: SessionMode): {
  readonly col: number;
  readonly row: number;
  readonly cols: number;
  readonly rows: number;
} {
  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = -Infinity;
  let maxRow = -Infinity;
  for (const key of stationCells(mode).keys()) {
    const [col, row] = key.split(",").map(Number) as [number, number];
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
  }
  // Grown by one on every side: the wall ring is part of the building.
  return {
    col: minCol - 1,
    row: minRow - 1,
    cols: maxCol - minCol + 3,
    rows: maxRow - minRow + 3,
  };
}

/**
 * The camera's zoom for the wide shot.
 *
 * A half rather than a fitted fraction. The canvas is scaled to a whole
 * multiple of 320 (D-031), so at the usual 2x a zoom of one half puts exactly
 * one source pixel on one device pixel and the building stays crisp; 0.47
 * would not, and the shimmer that follows is the thing D-031 exists to
 * prevent. `plan.test.ts` asserts both layouts fit inside what this shows,
 * which is the constraint the layouts were authored against rather than one
 * they happen to satisfy.
 */
export const WIDE_ZOOM = 0.5;

/** What the wide shot can show, in station pixels. */
export const WIDE_EXTENT = CANVAS / WIDE_ZOOM;

/** Where the camera is looking, in station pixels, and how close. */
export interface Shot {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  /** The floor the shot is framed on, or null for the wide shot. */
  readonly floor: FloorId | null;
}

/** The centre of one floor, in station pixels. */
export function centreOf(mode: SessionMode, floor: FloorId): { x: number; y: number } | null {
  const at = placementOf(mode, floor);
  if (at === null) return null;
  const shape = shapeOf(floor);
  return {
    x: (at.col + shape.cols / 2) * TILE,
    y: (at.row + shape.rows / 2) * TILE,
  };
}

/** The centre of the whole building, in station pixels. */
export function centreOfStation(mode: SessionMode): { x: number; y: number } {
  const bounds = stationBounds(mode);
  return {
    x: (bounds.col + bounds.cols / 2) * TILE,
    y: (bounds.row + bounds.rows / 2) * TILE,
  };
}

/**
 * Where the camera should be, for a phase, a floor, and whether the wide shot
 * has been asked for.
 *
 * Close on the room the pair is standing in, and wide when something asks for
 * the building. The wide shot is not a fallback: it is the only view in which
 * the station is a *building* rather than a room.
 *
 * **`wide` is a parameter rather than a phase because the phase that ought to
 * have driven it does not exist.** `TRANSITIONING` looks like the moment to
 * pull back and it is listed below, but the worker settles it inside the same
 * `reduce()` call that solved the chamber (doc 05 section 4, `settleTransition`),
 * so it never reaches a client as a frame. A camera keyed on it would be a
 * beat that can never fire. It stays in the list because it is the right
 * answer if the machine ever does park there, and the caller supplies the walk
 * and the map key it actually has.
 *
 * Pure, and returns a target rather than moving anything, so the framing can
 * be tested without a camera.
 */
export function shotFor(
  mode: SessionMode,
  phase: string,
  floor: FloorId | null,
  wide = false,
): Shot {
  const pulled = { ...centreOfStation(mode), zoom: WIDE_ZOOM, floor: null };
  if (wide || floor === null) return pulled;
  if (phase === "TRANSITIONING" || phase === "ESCAPED" || phase === "FAILED") return pulled;
  const centre = centreOf(mode, floor);
  if (centre === null) return pulled;
  return { ...centre, zoom: 1, floor };
}

/** A floor's name, for the label the wide shot writes across each room. */
export function labelOf(floor: FloorId): string {
  return FLOOR_NAMES[floor];
}

/** Every floor this mode's station actually contains, in play order. */
export function floorsOf(mode: SessionMode): readonly FloorId[] {
  return floorsFor(mode).filter((floor) => placementOf(mode, floor) !== null);
}

/** The chambers a mode plays, re-exported so the test can check the two agree. */
export const CHAMBERS_OF = MODE_CHAMBERS;

/** The interlude room's size, so the Archive's shape and the plan agree. */
export const INTERLUDE_SIZE = { cols: INTERLUDE_PLAN.cols, rows: INTERLUDE_PLAN.rows } as const;
