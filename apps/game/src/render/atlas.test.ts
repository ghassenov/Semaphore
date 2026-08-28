/**
 * The atlas's arithmetic and its named frames.
 *
 * A wrong frame index does not throw: Phaser hands out a frame that is half of
 * two tiles and the room renders looking merely a bit off. So the named
 * constants, which were read off a contact sheet by eye, are held to the sizes
 * of the sheets they index into.
 *
 * That the files those sizes describe actually exist on disk is checked by
 * `scripts/check-art.mjs` at build time, not here. It needs `node:fs`, and this
 * app's tsconfig deliberately carries no Node types (see `check-bundle.mjs`,
 * which is outside the typecheck scope for the same reason).
 */

import { describe, expect, it } from "vitest";
import {
  CHANNEL_SHEETS,
  GROUND_FILL,
  LOAD,
  PLATE,
  SHARED_SHEETS,
  SLICE,
  TILE,
  groundFrame,
  textureKey,
} from "./atlas.js";

describe("the art table", () => {
  it("loads every sheet under a key of its own", () => {
    const keys = LOAD.map((sheet) => sheet.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("carries the same fittings in all three channels", () => {
    // The renderer picks a channel and then a sheet, in that order, so a sheet
    // missing from one colour is a device that cannot change channel. Holding
    // the three directories to the same contents is what makes that impossible
    // rather than merely unlikely.
    for (const sheet of Object.keys(CHANNEL_SHEETS)) {
      for (const channel of ["pilot", "keeper", "shared"] as const) {
        const key = textureKey(channel, sheet);
        expect(
          LOAD.some((entry) => entry.key === key),
          key,
        ).toBe(true);
      }
    }
  });

  it("points every sheet at a path under its own channel's directory", () => {
    for (const sheet of LOAD) {
      expect(sheet.url, sheet.key).toMatch(/^art\/(pilot|keeper|shared)\/[a-z-]+\.png$/);
    }
  });

  it("claims a whole number of tiles for every sheet", () => {
    expect(TILE).toBe(16);
    for (const sheet of LOAD) expect(sheet.frames, sheet.key).toBeGreaterThan(0);
  });

  it("keeps every named frame inside its sheet", () => {
    for (const [name, frame] of Object.entries(SLICE)) {
      expect(frame, name).toBeLessThan(CHANNEL_SHEETS["walls-out"]);
    }
    for (const frame of GROUND_FILL) {
      expect(frame).toBeLessThan(SHARED_SHEETS.ground);
    }
    for (const [name, frame] of Object.entries(PLATE)) {
      expect(frame, name).toBeLessThan(SHARED_SHEETS["ground-special"]);
    }
  });

  it("names all nine slices of a wall, and no two the same", () => {
    // A nine-slice missing a corner is a room with a hole in it.
    expect(new Set(Object.values(SLICE)).size).toBe(9);
  });

  it("varies the ground without ever leaving the fill set", () => {
    const seen = new Set<number>();
    for (let col = 0; col < 20; col += 1) {
      for (let row = 0; row < 20; row += 1) {
        const frame = groundFrame(col, row);
        expect(GROUND_FILL).toContain(frame);
        seen.add(frame);
      }
    }
    // A floor that resolves to one tile is a floor with no decoration on it,
    // which is the bug this arithmetic exists to avoid.
    expect(seen.size).toBe(GROUND_FILL.length);
  });

  it("gives the same tile the same frame every time", () => {
    // A floor that reshuffles its rivets every frame shimmers, and a
    // screenshot of a seed should be the same screenshot every time.
    expect(groundFrame(7, 4)).toBe(groundFrame(7, 4));
  });
});
