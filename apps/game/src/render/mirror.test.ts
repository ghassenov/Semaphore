/**
 * The accessibility mirror, and the one line it may not cross.
 *
 * This is what a player who cannot see the canvas has instead of the canvas,
 * so it gets the same treatment `chamber.test.ts` gives the picture: the
 * describer is checked against every chamber, and the glyph rule is asserted
 * rather than trusted.
 */

import { describe, expect, it } from "vitest";
import type { PilotView } from "@semaphore/protocol";
import { describeRoom } from "./mirror.js";
import { GLYPH_IDS } from "./glyphs.js";

function viewOf(over: Partial<PilotView>): PilotView {
  return {
    phase: "IN_CHAMBER",
    chamber: null,
    mode: "full",
    designation: "TESTER",
    remainingMs: 60_000,
    assist: null,
    objective: null,
    progress: null,
    seq: 0,
    retries: 0,
    facts: {},
    notes: [],
    ghost: null,
    ...over,
  };
}

/**
 * The same shapes `chamber.test.ts` uses, kept to what the worker projects.
 *
 * Deliberately carrying glyph ids in `facts`, because that is the input the
 * leak would come from: a describer that printed `facts.glyphByLever` would
 * pass a test whose fixture had no glyphs in it.
 */
const CHAMBERS: readonly { readonly name: string; readonly view: PilotView }[] = [
  {
    name: "airlock",
    view: viewOf({
      chamber: "airlock",
      facts: {
        glyphByLever: { lever_a: "spiral", lever_b: "cross", lever_c: "wave" },
        pulled: ["lever_b"],
        doorOpen: false,
        lastSound: "a lever clunks behind the wall",
      },
    }),
  },
  {
    name: "signal_room",
    view: viewOf({
      chamber: "signal_room",
      facts: {
        glyphByKey: { 1: "star", 2: "knot", 3: "arch", 4: "comb", 5: "eye", 6: "coil" },
        pressedSequence: ["3"],
        strikes: 1,
        manualPageState: "vandalised",
      },
    }),
  },
  {
    name: "blind_panel",
    view: viewOf({
      chamber: "blind_panel",
      facts: {
        gaugeValues: { 1: 3, 2: 0, 3: 8, 4: 5 },
        targets: { 1: 6, 2: 2, 3: 8, 4: 1 },
        lastClicks: 3,
        solved: false,
      },
    }),
  },
  {
    name: "concord_lock",
    view: viewOf({
      chamber: "concord_lock",
      facts: {
        cipherOffset: 11,
        boltsAligned: 2,
        armed: true,
        staminaWindowMs: 20_000,
        staminaRemainingMs: 8_000,
        attemptedPhrases: ["MAVQ KIAQ"],
      },
    }),
  },
];

describe("describeRoom", () => {
  it("says something about every chamber", () => {
    for (const { name, view } of CHAMBERS) {
      const lines = describeRoom(view);
      // A room with nothing in it is the failure this catches: a drift in the
      // worker's field names would produce an empty plan, and a mirror that
      // silently describes nothing is worse than one that throws.
      expect(lines.length, name).toBeGreaterThan(3);
      expect(lines.join(" "), name).toMatch(/metres across/);
    }
  });

  it("never names a glyph, in any chamber", () => {
    // The rule the picture lives by, applied to the words. A lever described
    // as "spiral" deletes Chamber I: reading a label aloud is not describing a
    // shape, and the describing is the game.
    for (const { name, view } of CHAMBERS) {
      // Whole words, not substrings. `cross` is inside `across`, and "12
      // metres across" is not a leak - narrowing the match is the fix, because
      // loosening what counts as a leak would be the one change never
      // accepted. The rule asserted is still the full one: no glyph id may
      // appear as a word anywhere in the mirror.
      const words = new Set(
        describeRoom(view)
          .join(" ")
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((word) => word.length > 0),
      );
      for (const glyph of GLYPH_IDS) {
        expect(words.has(glyph.toLowerCase()), `${name} leaked the glyph ${glyph}`).toBe(false);
      }
    }
  });

  it("says a mark is there without saying what it is", () => {
    const text = describeRoom(CHAMBERS[0]!.view).join(" ");
    expect(text).toContain("a mark you would have to describe");
  });

  it("gives a gauge its reading and its target, which PILOT can see", () => {
    // `AUDIBLE` and `VISUAL` facts are PILOT's to have. The mirror is a
    // different medium for the same projection, not a wider one.
    const text = describeRoom(CHAMBERS[2]!.view).join(" ");
    expect(text).toMatch(/reading \d+ of \d+/);
    expect(text).toMatch(/wanting \d+/);
    expect(text).toContain("clicks registered");
  });

  it("places things in thirds rather than in metres", () => {
    // A coordinate is not something a player can walk to.
    const text = describeRoom(CHAMBERS[0]!.view).join(" ");
    expect(text).toMatch(/on the left|in the middle|on the right/);
  });

  it("returns nothing rather than a sentence when there is no room", () => {
    // The caller has the phase and says it better than this can.
    expect(describeRoom(null)).toEqual([]);
    expect(describeRoom(viewOf({ phase: "LOBBY" }))).toEqual([]);
  });
});
