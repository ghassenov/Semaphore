/**
 * The proof that the authored doorways and the authored corridors agree.
 *
 * `doorways.ts` says which wall of a room has a hole in it; `plan.ts` says
 * where the corridors run, and the masonry is resolved from those corridors
 * rather than from the doorways. Nothing forces the two to match, and a door
 * standing in solid wall renders perfectly: it just looks like a door, in a
 * room, on a wall you cannot walk through. That is precisely the class of
 * defect the screenshot tour cannot catch, because the frame is unambiguous
 * and wrong (D-049).
 *
 * So the openings are derived here from the same one-metre grid the walls are
 * built from, and every authored doorway has to be inside one.
 */

import { describe, expect, it } from "vitest";
import { MODE_CHAMBERS, type SessionMode } from "@semaphore/protocol";
import { DOORWAYS, DOORWAY_WIDTH, doorsOf, type Doorway, type Wall } from "./doorways.js";
import { cellKey, floorsOf, roomStrip, stationCells } from "./plan.js";
import { floorsFor, type FloorId } from "./floors.js";

const MODES: readonly SessionMode[] = Object.keys(MODE_CHAMBERS) as SessionMode[];

/**
 * Every opening in one room's walls, derived from the grid, as spans in
 * room-local metres keyed by wall.
 *
 * A cell is an opening when the cell immediately outside the room is also
 * floor: that is the same condition `stage.ts` uses to decide not to stand a
 * wall block there.
 */
function openingsOf(mode: SessionMode, floor: FloorId): Map<Wall, number[]> {
  const cells = stationCells(mode);
  const strip = roomStrip(mode, floor);
  const found = new Map<Wall, number[]>();
  if (strip === null) return found;

  const x0 = Math.round(strip.x - strip.width / 2);
  const z0 = Math.round(strip.z - strip.depth / 2);
  const x1 = x0 + Math.round(strip.width) - 1;
  const z1 = z0 + Math.round(strip.depth) - 1;
  const push = (wall: Wall, at: number): void => {
    const list = found.get(wall) ?? [];
    // The cell's centre, turned into the room's own coordinates.
    list.push(at + 0.5 - (wall === "north" || wall === "south" ? strip.x : strip.z));
    found.set(wall, list);
  };

  for (let x = x0; x <= x1; x += 1) {
    if (cells.has(cellKey(x, z0 - 1))) push("north", x);
    if (cells.has(cellKey(x, z1 + 1))) push("south", x);
  }
  for (let z = z0; z <= z1; z += 1) {
    if (cells.has(cellKey(x0 - 1, z))) push("west", z);
    if (cells.has(cellKey(x1 + 1, z))) push("east", z);
  }
  return found;
}

describe("the authored doorways stand in the building's actual openings", () => {
  for (const mode of MODES) {
    for (const floor of floorsOf(mode)) {
      const doors = doorsOf(mode, floor);
      for (const [which, door] of Object.entries(doors) as [string, Doorway][]) {
        it(`${mode}: ${floor}'s ${which} door is in a hole`, () => {
          const opening = openingsOf(mode, floor).get(door.wall) ?? [];
          expect(
            opening.length,
            `${floor} has no opening in its ${door.wall} wall`,
          ).toBeGreaterThan(0);
          // The centre of the run of open cells, which is where a door that
          // fills its doorway has to sit.
          const centre = (Math.min(...opening) + Math.max(...opening)) / 2;
          expect(door.along).toBeCloseTo(centre, 5);
          // And the run is exactly one corridor wide, so a door built to
          // `DOORWAY_WIDTH` covers it rather than leaving a gap beside itself.
          expect(opening.length).toBe(DOORWAY_WIDTH);
        });
      }
    }
  }
});

describe("the table describes the station this mode actually plays", () => {
  for (const mode of MODES) {
    it(`${mode} names no room it does not have`, () => {
      const real = new Set<string>(floorsFor(mode));
      for (const named of Object.keys(DOORWAYS[mode])) expect(real).toContain(named);
    });

    it(`${mode} gives every room after the first a way back`, () => {
      // The mechanic is walking back through a door, so every room the pair
      // can be standing in except the one they came into from the sea has to
      // have one. Without this, a chamber quietly becomes a room you enter and
      // cannot leave, and nothing else in the codebase would notice.
      const floors = floorsFor(mode).filter((floor) => roomStrip(mode, floor) !== null);
      for (const floor of floors.slice(1)) {
        expect(doorsOf(mode, floor).back, `${floor} has no way back`).toBeDefined();
      }
      expect(doorsOf(mode, floors[0] ?? "airlock").back).toBeUndefined();
    });
  }
});
