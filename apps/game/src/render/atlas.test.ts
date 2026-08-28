/**
 * The atlas against the files it names.
 *
 * A wrong frame count or a renamed file does not throw at runtime: Phaser
 * loads the sheet, hands out a frame that is half of two tiles, and the room
 * renders looking merely a bit off. That is the failure this file exists to
 * turn into a red test, so it checks the table against the actual PNGs on disk
 * rather than against a second copy of the same numbers.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const ART = join(import.meta.dirname, "..", "..", "public");

/**
 * A PNG's dimensions, from its IHDR.
 *
 * Sixteen bytes of header parsing rather than an image library, because the
 * only question is how many tiles wide the file is and a dependency to answer
 * it would be the tail wagging the dog.
 */
function size(url: string): { width: number; height: number } {
  const bytes = readFileSync(join(ART, url));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("the art table", () => {
  it("names a file that exists, for every sheet", () => {
    for (const sheet of LOAD) expect(() => size(sheet.url), sheet.url).not.toThrow();
  });

  it("counts the frames each file actually holds", () => {
    for (const sheet of LOAD) {
      const { width, height } = size(sheet.url);
      expect(width % TILE, `${sheet.url} width`).toBe(0);
      expect(height % TILE, `${sheet.url} height`).toBe(0);
      expect((width / TILE) * (height / TILE), `${sheet.url} frames`).toBe(sheet.frames);
    }
  });

  it("loads every sheet under a key of its own", () => {
    const keys = LOAD.map((sheet) => sheet.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("carries the same fittings in all three channels", () => {
    // The renderer picks a channel and then a sheet, in that order, so a sheet
    // missing from one colour is a device that cannot change channel. Holding
    // the three directories to the same contents is what makes that
    // impossible rather than merely unlikely.
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

  it("keeps every named frame inside its sheet", () => {
    // The frame constants were read off a contact sheet by eye, which is the
    // right way to choose them and the wrong way to be sure of them.
    for (const frame of Object.values(SLICE)) {
      expect(frame).toBeLessThan(CHANNEL_SHEETS["walls-out"]);
    }
    for (const frame of [...GROUND_FILL]) {
      expect(frame).toBeLessThan(SHARED_SHEETS.ground);
    }
    for (const [name, frame] of Object.entries(PLATE)) {
      expect(frame, name).toBeLessThan(SHARED_SHEETS["ground-special"]);
    }
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
    expect(groundFrame(7, 4)).toBe(groundFrame(7, 4));
  });
});
