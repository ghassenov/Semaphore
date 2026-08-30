/**
 * The station as one building: where each room stands, and the corridors
 * between them.
 *
 * `chamber.ts` decides what is *in* a room and knows nothing about where that
 * room is; this module decides where the rooms are and knows nothing about what
 * is in them. That split survived the renderer being replaced (D-042) because
 * it was never about tiles: a chamber that reached for an absolute station
 * coordinate could not be moved, and a layout that knew about levers could not
 * be tested without inventing facts.
 *
 * What changed is the unit. The building was laid out on a 16px tile grid and
 * is laid out in **metres** now, on the floor plane, with `x` running east and
 * `z` running south. Rooms are boxes standing on that plane; corridors are
 * strips of floor joining them. Nothing here has a height: a room's ceiling is
 * `chamber.ts`'s business, because the wide shot looks down into open boxes and
 * never sees a roof.
 *
 * **The layout is authored per mode, not derived.** There are two modes and
 * BRIEF is a genuinely different building: it drops the Blind Panel, and with
 * it the Archive, which only exists after the Blind Panel. Deriving one plan
 * from the other would mean corridors that dangle into a room that is not
 * there. Two authored plans plus a test that floods the floor to prove each one
 * is a single connected space is far less machinery than a packing algorithm,
 * and it is the part that can actually be wrong.
 *
 * Nothing here is a puzzle fact. The building's shape is the same for every
 * seed, both parties could draw it, and a room the pair has not reached is an
 * empty shell: `roomPlan` returns nothing for a chamber whose facts have not
 * arrived, so there is no state to leak even with the walls on screen.
 */

import { MODE_CHAMBERS, type SessionMode } from "@semaphore/protocol";
import { ROOM_SIZES, CHAMBER_ACCENT, type RoomSize } from "./chamber.js";
import { FLOOR_NAMES, floorsFor, type FloorId } from "./floors.js";
import type { RenderChannel } from "./palette.js";

/** Where a room's floor centre sits in station metres. */
export interface Placement {
  readonly x: number;
  readonly z: number;
}

/** A rectangle of floor on the station plane, in metres. */
export interface Strip {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

/** One mode's building: where its floors are, and the corridors joining them. */
export interface StationLayout {
  readonly rooms: Readonly<Partial<Record<FloorId, Placement>>>;
  /** Corridors, as centred rectangles. Plain floor, with walls around them. */
  readonly corridors: readonly Strip[];
}

/** How wide a corridor is. Wide enough to walk, narrow enough to read as one. */
const CORRIDOR = 3;

/** The channel each floor's light wears. The Archive is nobody's room. */
export const FLOOR_ACCENT: Readonly<Record<FloorId, RenderChannel>> = {
  ...CHAMBER_ACCENT,
  archive: "shared",
};

/**
 * The two buildings.
 *
 * FULL is a ring. The Airlock is north-west, the Signal Room north-east, the
 * Blind Panel south-east and the Concord Lock south-west, with the Archive
 * hanging off the southern spine. Walking it in play order takes the pair
 * clockwise round the building and back to the corner they came in at, which
 * is the shape of the story: you end up where you started, on the other side
 * of the door.
 *
 * The Archive is deliberately a **detour off the spine** rather than a room on
 * the way. You go down into the records and come back up, which is what makes
 * it feel like something you found rather than something you were routed
 * through.
 *
 * BRIEF has three rooms and no Archive, so it is a horseshoe: across the top,
 * down the outside, then back west into the Concord Lock.
 *
 * **The corridors go round the outside on the east side, not through the
 * middle** (D-053). A corridor may only meet a wall a door can stand in, and
 * that rules out every south face - they are open, so the camera can see in -
 * and it rules out the Blind Panel's north wall, which is eleven metres of
 * gauge bank. See `doorways.ts`.
 *
 * Every number here is checked by `plan.test.ts`, which proves that nothing
 * overlaps, that the floor is one connected space, that every fixture in every
 * chamber still stands inside its room, and that the whole building fits what
 * the wide shot can frame. The numbers were arrived at by hand and should not
 * be trusted on their own.
 */
export const STATION_LAYOUT: Readonly<Record<SessionMode, StationLayout>> = {
  full: {
    rooms: {
      airlock: { x: -16, z: -14 },
      signal_room: { x: 14, z: -14 },
      blind_panel: { x: 14, z: 12 },
      archive: { x: 0, z: 18 },
      concord_lock: { x: -16, z: 10 },
    },
    corridors: [
      // Airlock to Signal Room, across the north side.
      { x: -1.25, z: -14, width: 17.5, depth: CORRIDOR },
      // Out of the Signal Room's east wall, directly opposite the doorway it
      // was entered by, so the room is walked straight through.
      { x: 22.5, z: -13.5, width: CORRIDOR, depth: CORRIDOR },
      // The eastern spine, down the outside of the building and in through the
      // Blind Panel's east wall.
      //
      // It ran down the *middle* until the doors were put in the holes
      // (D-053): it left the Signal Room through its open south face, which is
      // the one face no door may stand in, and arrived at the Blind Panel's
      // north wall, which is eleven metres of gauge bank. Two rooms were
      // therefore entered through openings that nothing could mark. Outside
      // the building both walls are free, and the run is three metres longer.
      { x: 23.5, z: -0.5, width: CORRIDOR, depth: 25 },
      // The southern spine, joining the Blind Panel to the Concord Lock.
      { x: -1.25, z: 12, width: 15.5, depth: CORRIDOR },
      // Down off that spine and back east into the Archive's west wall, which
      // is why the Archive is somewhere you go down to rather than somewhere
      // you pass. West rather than north because the north wall is the
      // monitor's, and this room is an aisle with a screen at the end of it.
      { x: -6.5, z: 16.5, width: CORRIDOR, depth: 5 },
      { x: -5, z: 17.5, width: 2, depth: CORRIDOR },
    ],
  },
  brief: {
    rooms: {
      airlock: { x: -16, z: -14 },
      signal_room: { x: 14, z: -14 },
      concord_lock: { x: -2, z: 8 },
    },
    corridors: [
      { x: -1.25, z: -14, width: 17.5, depth: CORRIDOR },
      // Out of the Signal Room's east wall and down the outside, the same
      // shape FULL uses and for the same reason (D-053): the room's south face
      // is the one the camera looks through and no door may stand in it.
      { x: 22.5, z: -13.5, width: CORRIDOR, depth: CORRIDOR },
      { x: 23.5, z: -3, width: CORRIDOR, depth: 20 },
      // West along the bottom into the Concord Lock's east wall. It stops
      // exactly on that wall: it ran half a metre past it in the first draft,
      // which does not fail to render - it takes a strip of the room's floor,
      // and because a corridor never overwrites a room the strip keeps the
      // room's height and reads as nothing at all until you notice the wall is
      // missing. `plan.test.ts` caught it.
      { x: 15, z: 5.5, width: 20, depth: CORRIDOR },
    ],
  },
};

/** A room's footprint on the station plane. */
export function footprintOf(floor: FloorId): RoomSize {
  return ROOM_SIZES[floor];
}

/**
 * Where a floor stands in this mode's station, or null if the mode has no such
 * floor.
 *
 * Null rather than a default position, because a caller that asks for the Blind
 * Panel in a BRIEF session has made a mistake, and putting it at the origin
 * would hide that behind a room standing inside the Airlock.
 */
export function placementOf(mode: SessionMode, floor: FloorId): Placement | null {
  return STATION_LAYOUT[mode].rooms[floor] ?? null;
}

/** Every floor this mode's station actually contains, in play order. */
export function floorsOf(mode: SessionMode): readonly FloorId[] {
  return floorsFor(mode).filter((floor) => placementOf(mode, floor) !== null);
}

/** A floor's name, for the label the wide shot writes across each room. */
export function labelOf(floor: FloorId): string {
  return FLOOR_NAMES[floor];
}

/** One room's floor rectangle, in station metres. */
export function roomStrip(mode: SessionMode, floor: FloorId): Strip | null {
  const at = placementOf(mode, floor);
  if (at === null) return null;
  const size = footprintOf(floor);
  return { x: at.x, z: at.z, width: size.width, depth: size.depth };
}

/** Every rectangle of floor in this mode's station: rooms first, then corridors. */
export function stationStrips(mode: SessionMode): readonly Strip[] {
  const strips: Strip[] = [];
  for (const floor of floorsOf(mode)) {
    const strip = roomStrip(mode, floor);
    if (strip !== null) strips.push(strip);
  }
  strips.push(...STATION_LAYOUT[mode].corridors);
  return strips;
}

/** A cell on the station's one-metre grid. Signed, so a string not an index. */
export function cellKey(x: number, z: number): string {
  return `${String(x)},${String(z)}`;
}

/**
 * The station's floor, rasterised to a one-metre grid, each cell carrying the
 * height of the wall that should stand beside it.
 *
 * This is what makes walls resolvable in **one pass** (D-038's rule, carried
 * through D-042). A corridor meeting a room is a junction, and walls built
 * per-room would each close an opening the other one wanted. Rasterised
 * together, a wall is simply every cell that is not floor and touches floor,
 * and a doorway is not a feature anybody places: it is the absence of a wall
 * where two floors meet.
 *
 * Rooms are written first and a corridor never overwrites one, so the wall
 * between a room and a corridor takes the room's height rather than the
 * corridor's. That is what stops a tall chamber growing a low lintel wherever
 * something joins it.
 *
 * It lives here rather than in the renderer because it is the part that can be
 * wrong in a way nobody notices by looking: a corridor one metre short still
 * draws, as a stub beside a sealed room, and the only way to find it by eye is
 * to play far enough to be trapped.
 */
export function stationCells(mode: SessionMode): ReadonlyMap<string, number> {
  const heights = new Map<string, number>();
  for (const floor of floorsOf(mode)) {
    const strip = roomStrip(mode, floor);
    if (strip === null) continue;
    const height = footprintOf(floor).height;
    for (const key of cellsOf(strip)) heights.set(key, height);
  }
  for (const corridor of STATION_LAYOUT[mode].corridors) {
    for (const key of cellsOf(corridor)) {
      if (!heights.has(key)) heights.set(key, CORRIDOR_HEIGHT);
    }
  }
  return heights;
}

/**
 * Which room owns each cell of the station's floor, corridors excluded.
 *
 * The companion to `stationCells`, and pure for the same reason: it decides
 * which masonry belongs to which chamber, and the renderer uses it to drop
 * every wall that is not the current room's when the camera is standing in a
 * room.
 *
 * That matters because the station is a **cutaway**. Open at the top and on
 * the south face, a camera in one chamber looks straight over its east wall
 * into whatever stands beyond it, and what stands beyond it is unlit: the
 * neighbouring corridor and rooms arrive in the frame as flat black slabs
 * crowding the room the player is actually in. Hiding them is not a trick to
 * hide a defect, it is the model rule applied one level further in: in a room
 * you see that room's shell, and `M` steps back to see the building.
 *
 * Corridors are deliberately unowned. A corridor wall borders no chamber, so
 * it is hidden in every room shot and drawn only in the wide one.
 */
export function stationOwners(mode: SessionMode): ReadonlyMap<string, FloorId> {
  const owners = new Map<string, FloorId>();
  for (const floor of floorsOf(mode)) {
    const strip = roomStrip(mode, floor);
    if (strip === null) continue;
    for (const key of cellsOf(strip)) owners.set(key, floor);
  }
  return owners;
}

/** How tall a corridor's walls are. Lower than any room, so rooms read taller. */
export const CORRIDOR_HEIGHT = 2.6;

/** Every grid cell a strip covers. */
function cellsOf(strip: Strip): readonly string[] {
  const x0 = Math.round(strip.x - strip.width / 2);
  const z0 = Math.round(strip.z - strip.depth / 2);
  const keys: string[] = [];
  for (let z = z0; z < z0 + Math.round(strip.depth); z += 1) {
    for (let x = x0; x < x0 + Math.round(strip.width); x += 1) keys.push(cellKey(x, z));
  }
  return keys;
}

/** The building's extent on the floor plane, in metres. */
export function stationBounds(mode: SessionMode): Strip {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const strip of stationStrips(mode)) {
    minX = Math.min(minX, strip.x - strip.width / 2);
    maxX = Math.max(maxX, strip.x + strip.width / 2);
    minZ = Math.min(minZ, strip.z - strip.depth / 2);
    maxZ = Math.max(maxZ, strip.z + strip.depth / 2);
  }
  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ,
  };
}

/** The centre of one floor, in station metres, or null if the mode lacks it. */
export function centreOf(mode: SessionMode, floor: FloorId): Placement | null {
  return placementOf(mode, floor);
}

/** The centre of the whole building, in station metres. */
export function centreOfStation(mode: SessionMode): Placement {
  const bounds = stationBounds(mode);
  return { x: bounds.x, z: bounds.z };
}

/** The chambers a mode plays, re-exported so the test can check the two agree. */
export const CHAMBERS_OF = MODE_CHAMBERS;
