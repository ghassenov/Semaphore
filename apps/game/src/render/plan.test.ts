/**
 * The station's layout, proved rather than eyeballed.
 *
 * Every coordinate in `STATION_LAYOUT` was worked out by hand across five room
 * sizes and four corridors, and hand arithmetic over that many numbers is wrong
 * about once per attempt. Worse, the failure is quiet: a corridor one metre
 * short still renders. It draws as a stub beside a sealed room, and the only
 * way to notice by looking is to play far enough to be trapped in a chamber
 * with no way on.
 *
 * So the properties that matter are asserted directly: the building is one
 * connected space, every room in it can be walked to from the Airlock, nothing
 * is standing inside anything else, and the whole thing fits in the shot that
 * has to show it.
 */

import { describe, expect, it } from "vitest";
import { MODE_CHAMBERS, type SessionMode } from "@semaphore/protocol";
import {
  STATION_LAYOUT,
  cellKey,
  centreOfStation,
  floorsOf,
  footprintOf,
  placementOf,
  roomStrip,
  stationBounds,
  stationCells,
  stationStrips,
  type Strip,
} from "./plan.js";
import { floorsFor, type FloorId } from "./floors.js";

const MODES: readonly SessionMode[] = ["full", "brief"];

/** Whether two rectangles share any area. Touching edges do not count. */
function overlaps(a: Strip, b: Strip): boolean {
  const gapX = Math.abs(a.x - b.x) - (a.width + b.width) / 2;
  const gapZ = Math.abs(a.z - b.z) - (a.depth + b.depth) / 2;
  return gapX < -0.001 && gapZ < -0.001;
}

/** Every cell reachable on foot from one starting cell. */
function reachableFrom(cells: ReadonlyMap<string, number>, start: string): ReadonlySet<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const key = queue.pop();
    if (key === undefined) break;
    const [x, z] = key.split(",").map(Number) as [number, number];
    for (const [dx, dz] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const next = cellKey(x + dx, z + dz);
      if (!cells.has(next) || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/** The grid cell at the centre of a floor, which is always inside it. */
function centreCell(mode: SessionMode, floor: FloorId): string {
  const at = placementOf(mode, floor);
  if (at === null) throw new Error(`${mode} has no ${floor}`);
  return cellKey(Math.round(at.x), Math.round(at.z));
}

describe("the station's floors", () => {
  it.each(MODES)("%s lists exactly the floors the mode plays", (mode) => {
    const listed = floorsOf(mode);
    // Every floor the session will visit has somewhere to stand, and nothing
    // is laid out that the session will never reach. A room in the layout that
    // the mode does not play is a promise of a chamber that does not exist.
    expect([...listed].sort()).toEqual([...floorsFor(mode)].sort());
    for (const floor of listed) expect(placementOf(mode, floor)).not.toBeNull();
  });

  it("BRIEF has no Blind Panel and therefore no Archive", () => {
    // The Archive follows the Blind Panel, so dropping one drops both. A BRIEF
    // layout carrying an Archive would be a corridor into a room the reducer
    // never enters.
    expect(MODE_CHAMBERS.brief).not.toContain("blind_panel");
    expect(floorsOf("brief")).not.toContain("archive");
    expect(placementOf("brief", "archive")).toBeNull();
    expect(placementOf("brief", "blind_panel")).toBeNull();
  });
});

describe("the station's geometry", () => {
  it.each(MODES)("%s stands no room inside another", (mode) => {
    const rooms = floorsOf(mode)
      .map((floor) => ({ floor, strip: roomStrip(mode, floor) }))
      .filter((entry): entry is { floor: FloorId; strip: Strip } => entry.strip !== null);

    for (let a = 0; a < rooms.length; a += 1) {
      for (let b = a + 1; b < rooms.length; b += 1) {
        const first = rooms[a];
        const second = rooms[b];
        if (!first || !second) continue;
        expect(overlaps(first.strip, second.strip), `${first.floor} overlaps ${second.floor}`).toBe(
          false,
        );
      }
    }
  });

  it.each(MODES)("%s runs no corridor through a room", (mode) => {
    // A corridor crossing a room would not fail to render: it would silently
    // take a strip of that room's floor and, because a corridor never
    // overwrites a room in `stationCells`, would leave a low wall through the
    // middle of it in the wide shot.
    for (const corridor of STATION_LAYOUT[mode].corridors) {
      for (const floor of floorsOf(mode)) {
        const room = roomStrip(mode, floor);
        if (room === null) continue;
        expect(overlaps(corridor, room), `a corridor crosses ${floor}`).toBe(false);
      }
    }
  });

  it.each(MODES)("%s is one connected space", (mode) => {
    const cells = stationCells(mode);
    const start = centreCell(mode, "airlock");
    expect(cells.has(start)).toBe(true);
    expect(reachableFrom(cells, start).size).toBe(cells.size);
  });

  it.each(MODES)("%s can be walked from the Airlock to every other room", (mode) => {
    // Stronger than connectedness and the property that actually matters: a
    // corridor that joins two corridors to each other but reaches no room
    // would pass the test above and strand the pair.
    const cells = stationCells(mode);
    const reachable = reachableFrom(cells, centreCell(mode, "airlock"));
    for (const floor of floorsOf(mode)) {
      expect(reachable.has(centreCell(mode, floor)), `${floor} is cut off`).toBe(true);
    }
  });

  it.each(MODES)("%s gives every room its declared footprint", (mode) => {
    for (const floor of floorsOf(mode)) {
      const strip = roomStrip(mode, floor);
      const size = footprintOf(floor);
      expect(strip).not.toBeNull();
      expect(strip?.width).toBe(size.width);
      expect(strip?.depth).toBe(size.depth);
    }
  });

  it.each(MODES)("%s bounds contain every strip in it", (mode) => {
    const bounds = stationBounds(mode);
    for (const strip of stationStrips(mode)) {
      expect(strip.x - strip.width / 2).toBeGreaterThanOrEqual(bounds.x - bounds.width / 2 - 0.001);
      expect(strip.x + strip.width / 2).toBeLessThanOrEqual(bounds.x + bounds.width / 2 + 0.001);
      expect(strip.z - strip.depth / 2).toBeGreaterThanOrEqual(bounds.z - bounds.depth / 2 - 0.001);
      expect(strip.z + strip.depth / 2).toBeLessThanOrEqual(bounds.z + bounds.depth / 2 + 0.001);
    }
    expect(centreOfStation(mode)).toEqual({ x: bounds.x, z: bounds.z });
  });

  it("gives a room's own walls its own height, never a corridor's", () => {
    // The rule that stops a tall chamber growing a low lintel where something
    // joins it. Rooms are rasterised before corridors and a corridor never
    // overwrites a cell, so every cell inside a room carries the room's height.
    const cells = stationCells("full");
    for (const floor of floorsOf("full")) {
      expect(cells.get(centreCell("full", floor))).toBe(footprintOf(floor).height);
    }
  });
});
