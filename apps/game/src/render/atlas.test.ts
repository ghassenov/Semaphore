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
  CORNER,
  EDGE,
  EDGE_ALL,
  FLOOR_BY_EDGE,
  LOAD,
  PLATE,
  SHARED_SHEETS,
  SLICE,
  TILE,
  floorFrame,
  wallFrame,
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
    for (const frame of FLOOR_BY_EDGE) {
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

  it("has a distinct ground frame for all sixteen edge combinations", () => {
    // Sixteen frames for sixteen masks. Two masks sharing a frame would mean a
    // room whose edge is shaded on the wrong side, which reads as a wall in
    // the middle of the floor.
    expect(FLOOR_BY_EDGE).toHaveLength(16);
    expect(new Set(FLOOR_BY_EDGE).size).toBe(16);
  });

  it("gives every ground mask a frame, including bits set outside the table", () => {
    // `tilesFor` passes `~sides`, which sets bits well above EDGE_ALL. Masking
    // is what stops that reading off the end of the table and drawing frame 0,
    // which is transparent.
    for (let mask = 0; mask < 64; mask += 1) {
      expect(FLOOR_BY_EDGE).toContain(floorFrame(mask));
    }
    expect(floorFrame(~0)).toBe(floorFrame(EDGE_ALL));
    expect(floorFrame(~EDGE_ALL)).toBe(floorFrame(0));
  });

  it("shades a ground tile on the sides its mask names", () => {
    // The interior tile and the isolated tile are the two ends of the table,
    // and getting either the wrong way round inverts every room.
    expect(floorFrame(0)).toBe(20);
    expect(floorFrame(EDGE_ALL)).toBe(40);
    expect(floorFrame(EDGE.top | EDGE.left)).toBe(10);
    expect(floorFrame(EDGE.bottom | EDGE.right)).toBe(30);
  });

  it("turns a wall to face the floor beside it", () => {
    // Floor below means this is the room's top edge, not its bottom.
    expect(wallFrame(EDGE.bottom, 0)).toBe(SLICE.top);
    expect(wallFrame(EDGE.top, 0)).toBe(SLICE.bottom);
    expect(wallFrame(EDGE.right, 0)).toBe(SLICE.left);
    expect(wallFrame(EDGE.bottom | EDGE.right, 0)).toBe(SLICE.topLeft);
  });

  it("wraps a convex corner from the diagonal alone", () => {
    // The tile outside a room's top-left corner touches floor only on its
    // bottom-right diagonal. Drawn as solid fill it puts a notch in the
    // outline, which is the one wall case a side mask cannot see.
    expect(wallFrame(0, CORNER.bottomRight)).toBe(SLICE.topLeft);
    expect(wallFrame(0, CORNER.topLeft)).toBe(SLICE.bottomRight);
    expect(wallFrame(0, 0)).toBe(SLICE.centre);
  });
});
