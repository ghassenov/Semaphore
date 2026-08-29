/**
 * The station's floors, and which one the pair is standing on.
 *
 * This was `cutaway.ts`, which laid the whole building out as a side-on
 * section: five floors stacked on one 320-pixel canvas, the active one at
 * working size and the rest collapsed to strips. The section is gone (D-035)
 * because the room is drawn from above now and gets the canvas to itself, but
 * the question the section existed to answer was never a drawing question:
 *
 * - which rooms does *this* session have, and in what order
 * - which one are we in right now
 * - which ones have we already got out of
 *
 * That is progress, and it is the only progress display the game has. It moved
 * to the console beside the canvas (D-036), so this module lost its pixels and
 * kept its answers. Everything here is still pure, and for the original
 * reason: it is wrong in ways that look like a rendering glitch.
 */

import { MODE_CHAMBERS, type ChamberId, type PilotView } from "@semaphore/protocol";

/** Every floor of the station, in the order PILOT walks them. */
export type FloorId = ChamberId | "archive";

/** Where the Archive sits: after the Blind Panel, before the Concord Lock. */
const ARCHIVE_AFTER: ChamberId = "blind_panel";

/** What each floor is called. */
export const FLOOR_NAMES: Readonly<Record<FloorId, string>> = {
  airlock: "AIRLOCK",
  signal_room: "SIGNAL ROOM",
  blind_panel: "BLIND PANEL",
  archive: "THE ARCHIVE",
  concord_lock: "CONCORD LOCK",
};

/** One floor, and where the pair stands in relation to it. */
export interface Floor {
  readonly id: FloorId;
  readonly name: string;
  /** The floor the pair is standing in. At most one is true. */
  readonly active: boolean;
  /** Already got out of. Strictly the floors before the active one. */
  readonly cleared: boolean;
}

/**
 * The floors this session has, in order.
 *
 * BRIEF drops Chamber II, so the station it plays is genuinely a different
 * building and is shown as one. Reading it from the view's `mode` rather than
 * assuming four chambers is what stops the console promising a room the pair
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
  // FINALE is the Concord Lock's floor with the door open at the end of it, so
  // the pair is still standing there and the floor stays lit.
  //
  // **Before the null guard, not after it.** The machine clears `chamber` on
  // the way into FINALE and again into ESCAPED (`machine.ts`, `transitionOut`),
  // so a guard that returns early on a null chamber makes this line
  // unreachable and the last two phases of the game report standing nowhere.
  // It read as the console's floor list simply going quiet at the finale,
  // which is a plausible enough thing for it to do that it survived two
  // rewrites; it only became obvious once the camera started framing whatever
  // this returns.
  if (view.phase === "FINALE" || view.phase === "ESCAPED") return "concord_lock";
  if (view.chamber === null) return null;
  if (view.phase === "IN_CHAMBER" || view.phase === "PENALISED" || view.phase === "DEADLOCK") {
    return view.chamber;
  }
  return null;
}

/**
 * The whole station for one frame: every floor, marked.
 *
 * With no active floor - the lobby, a transition - nothing is cleared either,
 * which is the honest picture of standing outside the building.
 */
export function stationFloors(view: PilotView): readonly Floor[] {
  const ids = floorsFor(view.mode);
  const activeId = activeFloor(view);
  const order = activeId === null ? -1 : ids.indexOf(activeId);

  return ids.map((id, index) => ({
    id,
    name: FLOOR_NAMES[id],
    active: id === activeId,
    // Cleared means walked out of, which is strictly the floors before this
    // one. A pair that has reached the Concord Lock has cleared everything
    // above it.
    cleared: order >= 0 && index < order,
  }));
}
