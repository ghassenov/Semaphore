/**
 * The station as a section: every floor at once, stacked, with the machine
 * deck down one side.
 *
 * The client drew one room at a time until this landed, and three things were
 * wrong with that. The station never read as a *building*, so "which room are
 * we in" was a caption rather than a place. The phases between chambers had
 * nothing to draw and said so. And progress was invisible: a pair four rooms
 * in saw exactly what a pair one room in saw.
 *
 * A section fixes all three at once. Solved floors stay on screen as the rooms
 * you have already got out of, the outer door is visible from the first
 * minute, and moving between chambers is a journey through somewhere rather
 * than a fade.
 *
 * **The floors are not equal, and that is the whole trick.** The Signal Room
 * needs six glyph keys in two rows with captions, which is about seventy
 * pixels; five equal floors on a 320-tall canvas would give it forty-six. So
 * the floor the pair is standing in gets most of the height and the rest
 * collapse to silhouette strips. That is not a flourish to save space, it is
 * what makes the tallest chamber fit at all, and it happens to put the eye
 * exactly where the game wants it.
 *
 * Pure, like `rooms.ts` and for the same reason: this decides where every
 * floor sits, which is the kind of thing that is wrong by four pixels in a way
 * nobody sees until it is on a screenshot.
 */

import { MODE_CHAMBERS, type ChamberId, type PilotView } from "@semaphore/protocol";

/** The canvas. Square, to match the section, and integer-scaled as always. */
export const CANVAS = 320;

/** The drawn border around everything, in the reference's manner. */
export const FRAME = 4;

/** The band the section occupies, between the top readouts and the panels. */
export const SECTION_TOP = 30;
export const SECTION_BOTTOM = 248;

/**
 * The machine deck: KEEPER's column, down the right of every floor.
 *
 * A column rather than an alcove in one room, because KEEPER is not in a room.
 * It is behind the whole station, reaching into every chamber's cavities at
 * once, and a section is the first drawing that can say so.
 */
export const DECK_X = 264;
export const DECK_WIDTH = CANVAS - FRAME - DECK_X;

/** Where a floor's own contents may go. The deck owns everything right of it. */
export const ROOM_LEFT = FRAME + 4;
export const ROOM_RIGHT = DECK_X - 6;
export const ROOM_WIDTH = ROOM_RIGHT - ROOM_LEFT;

/** The slab between two floors. Thin, so the floors read as one building. */
export const SLAB = 3;

/** A collapsed floor: enough for a name and a row of silhouettes. */
export const STRIP_HEIGHT = 26;

/** Every floor of the station, in the order PILOT walks them. */
export type FloorId = ChamberId | "archive";

/** Where the Archive sits: after the Blind Panel, before the Concord Lock. */
const ARCHIVE_AFTER: ChamberId = "blind_panel";

/** What each floor is called on its strip. */
export const FLOOR_NAMES: Readonly<Record<FloorId, string>> = {
  airlock: "AIRLOCK",
  signal_room: "SIGNAL ROOM",
  blind_panel: "BLIND PANEL",
  archive: "THE ARCHIVE",
  concord_lock: "CONCORD LOCK",
};

/** One floor, placed. */
export interface Floor {
  readonly id: FloorId;
  readonly name: string;
  /** Top edge of the floor's interior, in canvas pixels. */
  readonly y: number;
  /** Interior height, excluding the slab beneath it. */
  readonly height: number;
  /** The floor the pair is standing in, drawn at working size. */
  readonly active: boolean;
  /** Already got out of. Drawn lit but dim, as progress. */
  readonly cleared: boolean;
}

/** The whole section for one frame. */
export interface Cutaway {
  readonly floors: readonly Floor[];
  /** The active floor, or null in the phases that are not in a room. */
  readonly active: Floor | null;
}

/**
 * The floors this session has, in order.
 *
 * BRIEF drops Chamber II, so the station it plays is genuinely a different
 * building and is drawn as one. Reading it from the view's `mode` rather than
 * assuming four chambers is what stops the cutaway promising a room the pair
 * will never enter.
 */
export function floorsFor(mode: PilotView["mode"]): readonly FloorId[] {
  const chambers = MODE_CHAMBERS[mode];
  const floors: FloorId[] = [];
  for (const chamber of chambers) {
    floors.push(chamber);
    // The Archive is a beat rather than a chamber, but it is a room PILOT
    // stands in, so it is a floor. It only exists if the run reaches it.
    if (chamber === ARCHIVE_AFTER) floors.push("archive");
  }
  return floors;
}

/**
 * Which floor the pair is standing in, or null.
 *
 * `machine.chamber` outlives the room (D-025), so the Archive has to be read
 * off the phase: during `ARCHIVE` the chamber field still names the Blind
 * Panel, and trusting it would light the wrong floor.
 */
export function activeFloor(view: PilotView): FloorId | null {
  if (view.phase === "ARCHIVE") return "archive";
  if (view.chamber === null) return null;
  if (view.phase === "IN_CHAMBER" || view.phase === "PENALISED" || view.phase === "DEADLOCK") {
    return view.chamber;
  }
  // FINALE is the Concord Lock's floor with the door open at the end of it,
  // so the pair is still standing there and the floor stays lit.
  if (view.phase === "FINALE" || view.phase === "ESCAPED") return "concord_lock";
  return null;
}

/**
 * Lay the section out for one frame.
 *
 * The active floor takes whatever the strips leave. With no active floor - the
 * lobby, a transition - every floor gets an equal share instead, which draws
 * the station whole and is the honest picture of standing outside it.
 */
export function cutaway(view: PilotView): Cutaway {
  const ids = floorsFor(view.mode);
  const activeId = activeFloor(view);
  const order = ids.indexOf(activeId ?? ("" as FloorId));
  const available = SECTION_BOTTOM - SECTION_TOP - SLAB * (ids.length - 1);

  const heights = new Map<FloorId, number>();
  if (activeId === null || order < 0) {
    // Nobody is inside. Equal floors, which is the station seen from outside.
    const each = Math.floor(available / ids.length);
    for (const id of ids) heights.set(id, each);
  } else {
    for (const id of ids) heights.set(id, STRIP_HEIGHT);
    heights.set(activeId, available - STRIP_HEIGHT * (ids.length - 1));
  }

  const floors: Floor[] = [];
  let y = SECTION_TOP;
  for (const [index, id] of ids.entries()) {
    const height = heights.get(id) ?? STRIP_HEIGHT;
    floors.push({
      id,
      name: FLOOR_NAMES[id],
      y,
      height,
      active: id === activeId,
      // Cleared means walked out of, which is strictly the floors before this
      // one. A pair that has reached the Concord Lock has cleared everything
      // above it, and that stack is the only progress display the game has.
      cleared: order >= 0 && index < order,
    });
    y += height + SLAB;
  }

  return { floors, active: floors.find((floor) => floor.active) ?? null };
}
