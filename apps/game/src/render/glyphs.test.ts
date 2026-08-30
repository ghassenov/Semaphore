/**
 * The twelve glyphs, held to the properties the puzzle depends on.
 *
 * These are the game's central `VISUAL` fact. If two of them are accidentally
 * the same drawing, the Signal Room becomes unsolvable for reasons nobody can
 * diagnose from the outside; if `wave` and `knot` drift apart, the chamber
 * quietly gets easier and the benchmark's clarification metric stops measuring
 * anything. Neither failure is visible in a screenshot, which is why they are
 * asserted here.
 */

import { describe, expect, it } from "vitest";
import { GLYPHS, GLYPH_IDS, GLYPH_SIZE, inkCount, overlap } from "./glyphs.js";

/** The pair the Signal Room is built around being able to confuse. */
const CONFUSABLE = ["wave", "knot"] as const;

describe("the glyph set", () => {
  it("has twelve glyphs, one per stroke count the manual's table uses", () => {
    expect(GLYPH_IDS).toHaveLength(12);
  });

  it("draws every glyph on the same square grid", () => {
    for (const [id, rows] of Object.entries(GLYPHS)) {
      expect(rows, `${id} is the wrong height`).toHaveLength(GLYPH_SIZE);
      for (const row of rows) expect(row.length, `${id} has a ragged row`).toBe(GLYPH_SIZE);
    }
  });

  it("uses only set and clear pixels", () => {
    // A stray character does not throw at build time: it would throw at draw
    // time, in the middle of a session, on whichever seed happened to pick that
    // glyph.
    for (const [id, rows] of Object.entries(GLYPHS)) {
      for (const row of rows) {
        expect(/^[#.]+$/.test(row), `${id} has a character that is neither "#" nor "."`).toBe(true);
      }
    }
  });

  it("draws something in every glyph", () => {
    for (const [id, rows] of Object.entries(GLYPHS)) {
      expect(inkCount(rows), `${id} is blank`).toBeGreaterThan(20);
    }
  });

  it("has no two identical glyphs", () => {
    // Two identical shapes make the room unsolvable in a way that looks like
    // the agent being wrong.
    const drawn = new Map<string, string>();
    for (const [id, rows] of Object.entries(GLYPHS)) {
      const key = rows.join("\n");
      const clash = drawn.get(key);
      expect(clash, `${id} is the same drawing as ${String(clash)}`).toBeUndefined();
      drawn.set(key, id);
    }
  });
});

describe("the confusable pair", () => {
  it("keeps wave and knot alike at a glance", () => {
    const [a, b] = CONFUSABLE;
    const wave = GLYPHS[a];
    const knot = GLYPHS[b];
    if (!wave || !knot) throw new Error("the confusable pair must exist");

    // Alike enough that a careless glance conflates them, which is what makes a
    // clarifying question worth asking and a guess worth punishing.
    expect(overlap(wave, knot)).toBeGreaterThan(0.25);
    // And not the same drawing, which would make the question unanswerable.
    expect(overlap(wave, knot)).toBeLessThan(0.75);
  });

  it("keeps them the same weight, which is what makes them alike at a glance", () => {
    // Similar ink at similar height is closer to what "reads alike in a quick
    // look" means than pixel coincidence is, and it is the property that would
    // actually break if one of the two were redrawn heavier than the other.
    const [a, b] = CONFUSABLE;
    const wave = GLYPHS[a];
    const knot = GLYPHS[b];
    if (!wave || !knot) throw new Error("the confusable pair must exist");
    const heavier = Math.max(inkCount(wave), inkCount(knot));
    const lighter = Math.min(inkCount(wave), inkCount(knot));
    expect(lighter / heavier).toBeGreaterThan(0.6);
  });
});

/*
 * A claim this file deliberately does not make.
 *
 * A first pass asserted that `wave` and `knot` were the *most* overlapping pair
 * in the set. They are not: `spiral` and `arch` score higher, and they look
 * nothing like each other. Pixel overlap measures how much two drawings occupy
 * the same cells, which for two large shapes is mostly a fact about how large
 * they are.
 *
 * The assertion was removed rather than tuned, on this repository's own rule
 * about metrics: a number that does not separate the thing it claims to
 * separate reads as evidence and is not. What actually settles whether two
 * glyphs are confusable is the glyph-description corpus doc 07 section 7.2
 * asks for - twelve shapes shown cold to ten people, every phrase written down
 * - and that is still outstanding. Until it exists, `confusableWith` in the
 * worker's glyph table is the design intent and this file checks only that the
 * two shapes stayed similar in weight and did not become the same drawing.
 */

describe("measuring overlap", () => {
  it("is one for a glyph against itself and zero for disjoint shapes", () => {
    const rows = GLYPHS.cross;
    if (!rows) throw new Error("cross must exist");
    expect(overlap(rows, rows)).toBe(1);
    const blank = Array.from({ length: GLYPH_SIZE }, () => ".".repeat(GLYPH_SIZE));
    expect(overlap(rows, blank)).toBe(0);
    expect(overlap(blank, blank)).toBe(0);
  });
});
