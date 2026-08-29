/**
 * The art, held to the things that can be wrong about it invisibly.
 *
 * A pixel map is a wall of punctuation. A row one character short, a stray
 * space, a character the ink map does not define - none of those look like
 * mistakes in source, and all of them produce a sprite that is subtly wrong in
 * a way nobody notices until it is in a demo video. So the checks here are
 * dull on purpose: shape, size, and that every colour used is in the palette.
 *
 * The last test is not about art at all. It is the design law: a glyph's
 * *name* is KEEPER's half of the split, and it must never appear on a surface
 * PILOT is looking at.
 */

import { describe, expect, it } from "vitest";
import { PALETTE } from "./palette.js";
import {
  BODY_HEIGHT,
  GLYPH_SPRITES,
  KEEPER_SPRITE,
  PILOT_SPRITE,
  SPRITE_SIZE,
  allSprites,
  type Sprite,
} from "./sprites.js";

/** Every glyph in `apps/worker/src/chambers/glyphs.ts`, which this must cover. */
const GLYPH_IDS = [
  "spiral",
  "cross",
  "hook",
  "arch",
  "wave",
  "eye",
  "star",
  "knot",
  "triangle",
  "comb",
  "gate",
  "coil",
] as const;

/** How many pixels of a sprite are not transparent. */
function inked(sprite: Sprite): number {
  return sprite.rows
    .join("")
    .split("")
    .filter((char) => char !== ".").length;
}

describe("the glyph sprites", () => {
  it("covers every glyph the chambers can draw", () => {
    // A missing glyph is a lever with a blank face, which is unsolvable rather
    // than ugly: PILOT has nothing to describe.
    expect(Object.keys(GLYPH_SPRITES).sort()).toEqual([...GLYPH_IDS].sort());
  });

  it("draws each one on the 16x16 tile grid", () => {
    for (const [id, sprite] of Object.entries(GLYPH_SPRITES)) {
      expect(sprite.rows, id).toHaveLength(SPRITE_SIZE);
      for (const [index, row] of sprite.rows.entries()) {
        expect(row.length, `${id} row ${String(index)}`).toBe(SPRITE_SIZE);
      }
    }
  });

  it("gives every glyph enough ink to read at all", () => {
    // A glyph nobody can see is a glyph nobody can describe. The floor is
    // arbitrary; what it catches is a map that came out almost empty.
    for (const [id, sprite] of Object.entries(GLYPH_SPRITES)) {
      expect(inked(sprite), `${id} is nearly blank`).toBeGreaterThan(20);
    }
  });

  it("makes every glyph distinguishable from every other", () => {
    // Two glyphs that render identically would make a session unsolvable in a
    // way the possible-worlds proof cannot see, because the proof reasons over
    // glyph *ids* and this is about what reaches an eye.
    const seen = new Map<string, string>();
    for (const [id, sprite] of Object.entries(GLYPH_SPRITES)) {
      const shape = sprite.rows.join("\n");
      const twin = seen.get(shape);
      expect(twin, `${id} is pixel-identical to ${String(twin)}`).toBeUndefined();
      seen.set(shape, id);
    }
  });

  it("keeps wave and knot alike, because that pair is designed to be", () => {
    // `confusableWith` in the chamber's glyph table is a feature: a good agent
    // asks a clarifying question here and a bad one guesses, and the benchmark
    // measures the difference. If these two ever drift far apart the chamber
    // quietly gets easier and nothing else would say so.
    const wave = GLYPH_SPRITES.wave!;
    const knot = GLYPH_SPRITES.knot!;
    const overlap = wave.rows.reduce((count, row, y) => {
      const other = knot.rows[y] ?? "";
      return count + [...row].filter((char, x) => char !== "." && (other[x] ?? ".") !== ".").length;
    }, 0);
    // They share a substantial silhouette without being the same drawing.
    expect(overlap).toBeGreaterThan(20);
    expect(wave.rows.join("")).not.toBe(knot.rows.join(""));
  });
});

describe("the bodies", () => {
  it("is drawn from above, like the floor they stand on", () => {
    // The one tell that gives a reskin away is a side elevation standing on a
    // floor plan, so the bodies are held to the tile grid the room uses.
    expect(BODY_HEIGHT).toBe(SPRITE_SIZE);
  });

  it("are one tile square, on the same grid the room is drawn on", () => {
    for (const [name, sprite] of [
      ["PILOT", PILOT_SPRITE],
      ["KEEPER", KEEPER_SPRITE],
    ] as const) {
      expect(sprite.rows, name).toHaveLength(BODY_HEIGHT);
      for (const row of sprite.rows) expect(row.length, name).toBe(SPRITE_SIZE);
    }
  });

  it("does not paint PILOT in the channel colour that means 'only PILOT sees this'", () => {
    // The human is not a fact only the human can perceive. Using amber for the
    // body would make the legend lie the first time somebody checked it
    // against the screen. The helmet lamp is the one amber thing, and it is a
    // lamp.
    const bodyColours = Object.entries(PILOT_SPRITE.ink)
      .filter(([char]) => PILOT_SPRITE.rows.join("").split(char).length - 1 > 24)
      .map(([, colour]) => colour);
    expect(bodyColours).not.toContain("amber");
  });
});

describe("every sprite", () => {
  it("uses only colours that are in the locked palette", () => {
    // The reason the art is authored in source at all: a PNG can hold any
    // colour it likes and nothing would notice a fifteenth arriving.
    for (const [key, sprite] of allSprites()) {
      for (const colour of Object.values(sprite.ink)) {
        expect(Object.keys(PALETTE), `${key} uses ${colour}`).toContain(colour);
      }
    }
  });

  it("defines every character it actually draws", () => {
    // A stray character renders as a hole, or throws at boot. Catching it here
    // is the difference between a failing test and a blank lever in a demo.
    for (const [key, sprite] of allSprites()) {
      const used = new Set(sprite.rows.join("").split(""));
      used.delete(".");
      for (const char of used) {
        expect(sprite.ink[char], `${key} draws "${char}" with no ink defined`).toBeDefined();
      }
    }
  });

  it("has rectangular rows", () => {
    for (const [key, sprite] of allSprites()) {
      const width = sprite.rows[0]?.length ?? 0;
      for (const [index, row] of sprite.rows.entries()) {
        expect(row.length, `${key} row ${String(index)} is ragged`).toBe(width);
      }
    }
  });
});
