/**
 * The station's geometry, proved rather than eyeballed.
 *
 * Every number in `STATION_LAYOUT` was worked out by hand against five room
 * sizes and four corridors, and hand arithmetic over that many coordinates is
 * wrong roughly once per attempt. These tests are what the layout is actually
 * authored against: they say the rooms do not overlap, that the floor is one
 * connected space rather than two buildings that look like one, that no
 * corridor lands in a chamfered corner, that every device still stands on
 * floor once its room has been moved into the building, and that the whole
 * thing fits inside what the camera's wide shot can show.
 *
 * The connectivity test is the one that matters. A corridor off by a single
 * row still *renders*, as a room with a stub beside it and no way in, and the
 * only way to notice by looking is to play far enough to be trapped.
 */

import { describe, expect, it } from "vitest";
import type { PilotView, SessionMode } from "@semaphore/protocol";
import {
  STATION_LAYOUT,
  WIDE_EXTENT,
  WIDE_ZOOM,
  centreOf,
  centreOfStation,
  floorsOf,
  placementOf,
  shapeOf,
  shotFor,
  stationBounds,
  stationCells,
  stationTiles,
} from "./plan.js";
import { cellKey, roomPlan } from "./room.js";
import { TILE } from "./atlas.js";
import { floorsFor, type FloorId } from "./floors.js";

const MODES: readonly SessionMode[] = ["full", "brief"];

/** Facts real enough to lay out each chamber, taken from the worker's own views. */
const FACTS: Readonly<Record<string, object>> = {
  airlock: {
    glyphByLever: { lever_a: "cross", lever_b: "spiral", lever_c: "wave" },
    pulled: ["lever_a"],
    doorOpen: false,
  },
  signal_room: {
    glyphByKey: { 1: "arch", 2: "knot", 3: "eye", 4: "comb", 5: "hook", 6: "star" },
    pressedSequence: [3],
    strikes: 1,
    manualPageState: "vandalised",
  },
  blind_panel: { gaugeValues: { 1: 4, 2: 0, 3: 8, 4: 2 }, targets: { 1: 4, 2: 6, 3: 1, 4: 2 } },
  concord_lock: {
    cipherOffset: 3,
    boltsAligned: 2,
    armed: true,
    staminaWindowMs: 1000,
    staminaRemainingMs: 600,
    attemptedPhrases: ["a"],
  },
};

function view(chamber: string, mode: SessionMode = "full"): PilotView {
  return {
    phase: "IN_CHAMBER",
    chamber: chamber as never,
    designation: "KEEPER",
    remainingMs: 1,
    retries: 0,
    facts: (FACTS[chamber] ?? {}) as never,
    notes: [],
    mode,
  };
}

describe("the station's plan", () => {
  it("places every floor the mode plays, and no floor it does not", () => {
    for (const mode of MODES) {
      const placed = Object.keys(STATION_LAYOUT[mode].rooms).sort();
      const expected = [...floorsFor(mode)].sort();
      expect(placed, mode).toEqual(expected);
    }
  });

  it("never lets two rooms or a corridor and a room share a cell", () => {
    // Overlap is the failure that looks deliberate: two rooms merge into one
    // odd-shaped space and the wall between them simply is not drawn.
    for (const mode of MODES) {
      const seen = new Set<string>();
      const claim = (col: number, row: number, what: string) => {
        const key = cellKey(col, row);
        expect(seen.has(key), `${mode}: ${what} overlaps at ${key}`).toBe(false);
        seen.add(key);
      };
      for (const floor of floorsOf(mode)) {
        const at = placementOf(mode, floor);
        const shape = shapeOf(floor);
        if (at === null) continue;
        for (let row = 0; row < shape.rows; row += 1) {
          for (let col = 0; col < shape.cols; col += 1) {
            claim(at.col + col, at.row + row, floor);
          }
        }
      }
      // Corridors are claimed against the rooms' full boxes, chamfers
      // included, so a corridor that runs through a cut-away corner is caught
      // here rather than becoming a passage into the void.
      for (const run of STATION_LAYOUT[mode].corridors) {
        for (let row = run.row; row < run.row + run.rows; row += 1) {
          for (let col = run.col; col < run.col + run.cols; col += 1) {
            claim(col, row, "a corridor");
          }
        }
      }
    }
  });

  it("makes each mode's station one connected space", () => {
    // The test this file exists for. A corridor off by one row still renders:
    // it draws as a stub beside a sealed room, and the only way to notice by
    // looking is to play far enough to be trapped in it.
    for (const mode of MODES) {
      const cells = stationCells(mode);
      const all = new Set(cells.keys());
      const start = all.values().next().value;
      expect(start, mode).toBeDefined();
      if (start === undefined) continue;

      const seen = new Set<string>([start]);
      const queue = [start];
      while (queue.length > 0) {
        const key = queue.pop();
        if (key === undefined) break;
        const [col, row] = key.split(",").map(Number) as [number, number];
        for (const [dc, dr] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ] as const) {
          const next = cellKey(col + dc, row + dr);
          if (!all.has(next) || seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      expect(seen.size, `${mode}: ${String(all.size - seen.size)} cells unreachable`).toBe(
        all.size,
      );
    }
  });

  it("reaches every floor of every mode on foot", () => {
    // Connectivity of the cells is not quite the same claim as connectivity of
    // the rooms: a mode could connect all its corridors to each other and
    // strand a chamber. Walk from the Airlock and require every floor.
    for (const mode of MODES) {
      const cells = stationCells(mode);
      const airlock = placementOf(mode, "airlock");
      expect(airlock, mode).not.toBeNull();
      if (airlock === null) continue;

      const start = cellKey(airlock.col + 8, airlock.row + 8);
      expect(cells.has(start), `${mode}: the Airlock's own floor`).toBe(true);
      const seen = new Set<string>([start]);
      const queue = [start];
      const reached = new Set<FloorId>();
      while (queue.length > 0) {
        const key = queue.pop();
        if (key === undefined) break;
        const owner = cells.get(key)?.owner;
        if (owner !== null && owner !== undefined) reached.add(owner as FloorId);
        const [col, row] = key.split(",").map(Number) as [number, number];
        for (const [dc, dr] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ] as const) {
          const next = cellKey(col + dc, row + dr);
          if (!cells.has(next) || seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      expect([...reached].sort(), mode).toEqual([...floorsOf(mode)].sort());
    }
  });

  it("stands every device and caption on floor once its room is in the building", () => {
    // `room.ts` lays a chamber out against its own box and knows nothing about
    // where the building puts it. This is the check that the two agree.
    for (const mode of MODES) {
      const cells = stationCells(mode);
      for (const floor of floorsOf(mode)) {
        if (floor === "archive") continue;
        const at = placementOf(mode, floor);
        const plan = roomPlan(view(floor, mode));
        if (at === null || plan === null) continue;
        for (const device of plan.devices) {
          const key = cellKey(at.col + device.col, at.row + device.row);
          expect(cells.get(key)?.owner, `${mode} ${floor}: ${device.sheet} at ${key}`).toBe(floor);
          if (device.label === undefined) continue;
          const caption = cellKey(at.col + device.col, at.row + device.row + 1);
          expect(cells.has(caption), `${mode} ${floor}: caption at ${caption}`).toBe(true);
        }
      }
    }
  });

  it("fits both buildings inside the camera's wide shot", () => {
    // The layouts are authored against this, not merely checked by it: the
    // half-zoom is what keeps one source pixel on one device pixel at the
    // usual 2x scale (D-031), so a building that does not fit at a half would
    // force a fractional zoom and the shimmer that goes with it.
    expect(WIDE_EXTENT).toBe(320 / WIDE_ZOOM);
    for (const mode of MODES) {
      const bounds = stationBounds(mode);
      expect(bounds.cols * TILE, `${mode} width`).toBeLessThanOrEqual(WIDE_EXTENT);
      expect(bounds.rows * TILE, `${mode} height`).toBeLessThanOrEqual(WIDE_EXTENT);
    }
  });

  it("draws a wall on every side of the building and nothing beyond it", () => {
    for (const mode of MODES) {
      const cells = stationCells(mode);
      const tiles = stationTiles(mode);
      const floor = new Set(tiles.filter((t) => !t.wall).map((t) => cellKey(t.col, t.row)));
      const wall = new Set(tiles.filter((t) => t.wall).map((t) => cellKey(t.col, t.row)));

      // Every floor cell of the layout is drawn, and only those.
      expect(floor, mode).toEqual(new Set(cells.keys()));

      // No floor cell has a hole beside it.
      for (const key of floor) {
        const [col, row] = key.split(",").map(Number) as [number, number];
        for (const [dc, dr] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ] as const) {
          const side = cellKey(col + dc, row + dr);
          expect(floor.has(side) || wall.has(side), `${mode}: ${key} -> ${side}`).toBe(true);
        }
      }

      // And no wall is stranded out in the space between two rooms.
      for (const key of wall) {
        const [col, row] = key.split(",").map(Number) as [number, number];
        const touching = [-1, 0, 1].some((dc) =>
          [-1, 0, 1].some((dr) => floor.has(cellKey(col + dc, row + dr))),
        );
        expect(touching, `${mode}: stranded wall at ${key}`).toBe(true);
      }
    }
  });

  it("colours a room's walls with that room's channel and leaves corridors bone", () => {
    const tiles = stationTiles("full");
    const wallOf = (floor: FloorId) =>
      new Set(tiles.filter((t) => t.wall && t.owner === floor).map((t) => t.channel));
    expect(wallOf("signal_room")).toEqual(new Set(["pilot"]));
    expect(wallOf("blind_panel")).toEqual(new Set(["keeper"]));
    expect(wallOf("airlock")).toEqual(new Set(["shared"]));
    // A corridor belongs to no floor, which is what keeps it reading as the
    // space between rooms rather than as an extension of either.
    const corridorWalls = tiles.filter((t) => t.wall && t.owner === null);
    expect(corridorWalls.length).toBeGreaterThan(0);
    expect(new Set(corridorWalls.map((t) => t.channel))).toEqual(new Set(["shared"]));
  });

  it("frames the room the pair is standing in, and pulls back everywhere else", () => {
    const inRoom = shotFor("full", "IN_CHAMBER", "blind_panel");
    expect(inRoom.zoom).toBe(1);
    expect(inRoom.floor).toBe("blind_panel");
    expect({ x: inRoom.x, y: inRoom.y }).toEqual(centreOf("full", "blind_panel"));

    // The walk between chambers is the wide shot's reason to exist: it is the
    // only moment the station is a building rather than a room.
    for (const phase of ["TRANSITIONING", "ESCAPED", "FAILED"]) {
      const shot = shotFor("full", phase, "blind_panel");
      expect(shot.zoom, phase).toBe(WIDE_ZOOM);
      expect(shot.floor, phase).toBeNull();
    }

    // A floor this mode does not have cannot be framed, so it falls to wide
    // rather than to a room stacked on the Airlock.
    expect(shotFor("brief", "IN_CHAMBER", "blind_panel").zoom).toBe(WIDE_ZOOM);
    expect(shotFor("full", "LOBBY", null).zoom).toBe(WIDE_ZOOM);
  });

  it("pulls back on demand, whatever the phase says", () => {
    // The wide shot has to be a parameter rather than a phase. `TRANSITIONING`
    // is the phase that looks like the moment to pull back, and the worker
    // settles it inside the same call that solved the chamber, so it never
    // reaches a client as a frame: a camera keyed on it alone would be a beat
    // that can never fire. The caller supplies the walk and the map key.
    const asked = shotFor("full", "IN_CHAMBER", "airlock", true);
    expect(asked.zoom).toBe(WIDE_ZOOM);
    expect(asked.floor).toBeNull();
    expect({ x: asked.x, y: asked.y }).toEqual(centreOfStation("full"));

    // And not pulled back when nothing asks.
    expect(shotFor("full", "IN_CHAMBER", "airlock", false).zoom).toBe(1);
  });
});
