/**
 * Where the holes in the walls are, room by room.
 *
 * A door had been placed wherever a room's composition had space for one, and
 * that is not where the building's openings are. `plan.ts` rasterises the
 * station's floor to a one-metre grid and a wall is every cell that is not
 * floor and touches floor, so a doorway is not something anybody places: it is
 * the gap where a corridor meets a room. Nothing had ever reconciled the two.
 * The Airlock announced DOOR OPEN on its north wall, which is solid masonry,
 * while the way to the Signal Room was an unmarked three-metre gap in the east
 * wall that no fixture stood in and nothing named.
 *
 * That was survivable while a door was only a success light. It is not
 * survivable now that walking back through one is a mechanic: a door you hold
 * `E` at has to be the door you come out of, or the model is lying about
 * itself in the one place the player is looking hardest.
 *
 * ## Why this is its own file
 *
 * A doorway is a fact about the *building*, so it belongs beside the corridors
 * in `plan.ts`. But `plan.ts` imports `chamber.ts` for the room sizes, and
 * `chamber.ts` is what has to build the door fixture, so putting it there would
 * close an import cycle. Holding it separately costs one small module and
 * leaves the direction of dependency where it has always been.
 *
 * Everything here is in **room-local** terms - a wall, and a distance along it
 * - so a room still knows nothing about where in the station it stands.
 * Turning that into metres needs the room's size and happens in `chamber.ts`.
 *
 * ## It is authored, and it is proved
 *
 * These are hand-written numbers, exactly like the corridors they have to
 * agree with, and the same answer applies: `doorways.test.ts` derives the real
 * openings from `stationCells` and fails if a door here is not standing in
 * one. Two authored tables and a proof that they agree is far less machinery
 * than deriving one from the other, and the proof is the part that can be
 * wrong.
 */

import type { SessionMode } from "@semaphore/protocol";
import { nextFloor, previousFloor, type FloorId } from "./floors.js";

/** Which wall an opening is cut in. South is the face the camera looks through. */
export type Wall = "north" | "east" | "south" | "west";

/** One opening, in room-local terms. */
export interface Doorway {
  readonly wall: Wall;
  /**
   * Where the opening's centre sits along that wall, in room-local metres.
   *
   * Along `x` for a north or south wall, along `z` for an east or west one.
   * These are rarely whole numbers, and that is not sloppiness: the station's
   * masonry stands on whole metres while a room's centre does not have to, so
   * an opening centred in its corridor lands half a metre off the room's own
   * centre line more often than not.
   */
  readonly along: number;
}

/** The two ways out of a room: the one you came in by, and the one you leave by. */
export interface RoomDoors {
  /**
   * Toward the previous room in play order. Absent for the first room, which
   * was entered from the sea.
   */
  readonly back?: Doorway;
  /**
   * Toward the next room. Absent where the way on is not a doorway at all: the
   * Concord Lock's way on is the great door to the sea, and the Archive is a
   * dead end whose way on is the way it was entered.
   */
  readonly out?: Doorway;
}

/**
 * Every opening in the station, by mode.
 *
 * Every one of them is on a north, east or west wall, and that is a law rather
 * than a coincidence: the station is a cutaway and **every south face is open
 * masonry** (`stage.ts`), so a bulkhead standing in one would hang between the
 * camera and the room it is meant to lead out of. The corridors were rerouted
 * to hold to it (D-053) rather than the doors being placed wherever there
 * happened to be room for them.
 *
 * The Concord Lock has no `out`. Its way on is the great door to the sea,
 * which is the end of the game rather than a way through, and the chamber
 * places that itself on the north wall where nothing joins.
 *
 * The Archive has no `out` either, for the honest reason: it is a dead end off
 * the southern spine, and the way on is the way you came in.
 */
export const DOORWAYS: Readonly<
  Record<SessionMode, Readonly<Partial<Record<FloorId, RoomDoors>>>>
> = {
  full: {
    airlock: { out: { wall: "east", along: 0.5 } },
    // Straight through: in at the west wall, out at the east, at the same
    // point on each. The room is a ring of keys around a beacon and walking
    // its diameter is the shape of the beat.
    signal_room: {
      back: { wall: "west", along: 0.5 },
      out: { wall: "east", along: 0.5 },
    },
    blind_panel: {
      back: { wall: "east", along: -1.5 },
      out: { wall: "west", along: 0.5 },
    },
    archive: { back: { wall: "west", along: -0.5 } },
    concord_lock: { back: { wall: "east", along: 2.5 } },
  },
  brief: {
    airlock: { out: { wall: "east", along: 0.5 } },
    signal_room: {
      back: { wall: "west", along: 0.5 },
      out: { wall: "east", along: 0.5 },
    },
    // Further north along the same wall than in FULL: this mode's corridor
    // arrives off the long eastern run rather than off the southern spine, so
    // it meets a different part of it.
    concord_lock: { back: { wall: "east", along: -2.5 } },
  },
};

/** The openings of one room. Empty for a room this mode does not have. */
export function doorsOf(mode: SessionMode, floor: FloorId): RoomDoors {
  return DOORWAYS[mode][floor] ?? {};
}

/** How wide an opening is, in metres: one corridor's width, which the door fills. */
export const DOORWAY_WIDTH = 3;

/** The id `chamber.ts` gives the door that leads back the way you came. */
export const BACK_DOOR_ID = "door-back";

/**
 * Where a door leads, or null if it leads nowhere PILOT may go.
 *
 * The whole gate for walking back (D-054), and deliberately one function, so
 * there is one place to read it and one place to test it.
 *
 * Three conditions, and the third is the one that matters. The door has to be
 * **open**, because "after it is opened" is the mechanic. It has to lead
 * somewhere in play order. And the room on the other side has to be one the
 * pair has **already stood in** - `reachable` answers that from the rooms the
 * client has actually been sent frames for. A room ahead of them has never
 * been drawn, so a door onto one answers null and `E` does nothing but frame
 * it. That is what keeps this a camera feature rather than a hole in the
 * design law: no projection the server has not already pushed can be reached
 * through it, and nothing withheld becomes visible.
 */
export function doorLeadsTo(
  mode: SessionMode,
  from: FloorId,
  door: { readonly id: string; readonly kind: string; readonly on: boolean },
  reachable: (floor: FloorId) => boolean,
): FloorId | null {
  if (door.kind !== "door" || !door.on) return null;
  const to = door.id === BACK_DOOR_ID ? previousFloor(mode, from) : nextFloor(mode, from);
  if (to === null || to === from) return null;
  return reachable(to) ? to : null;
}
