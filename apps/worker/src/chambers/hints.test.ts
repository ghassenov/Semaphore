/**
 * The intercom's authored lines, and the three things none of them may do.
 *
 * They may not state an answer, they may not name a `VISUAL` fact, and they
 * may not say anything the manual has not already established. The third is
 * the one that is easy to lose: an assist is the previous keeper being
 * helpful, not the designer breaking cover, and the Blind Panel's cross-link
 * is the specific fact this file must never be the first place to mention.
 */

import { describe, expect, it } from "vitest";
import { ASSISTS_PER_CHAMBER, CHAMBER_ORDER } from "@semaphore/protocol";
import { ASSISTS, assistFor } from "./hints.js";
import { GLYPHS } from "./glyphs.js";

const EVERY_LINE = CHAMBER_ORDER.flatMap((chamber) => ASSISTS[chamber]);

describe("the shelf", () => {
  it("holds exactly the published number for every room", () => {
    // The number the tool description quotes to an agent has to be the number
    // that governs, or the tool is lying about what it costs to use.
    for (const chamber of CHAMBER_ORDER) {
      expect(ASSISTS[chamber], chamber).toHaveLength(ASSISTS_PER_CHAMBER);
    }
  });

  it("runs out rather than repeating its last line", () => {
    // An intercom that keeps saying the same thing is a clock the pair can
    // spend on nothing, and the reducer has to be able to tell the two apart
    // in order to charge for one and not the other.
    for (const chamber of CHAMBER_ORDER) {
      expect(assistFor(chamber, ASSISTS_PER_CHAMBER)).toBeNull();
      expect(assistFor(chamber, -1)).toBeNull();
      expect(assistFor(chamber, 0)).toBe(ASSISTS[chamber][0]);
    }
  });

  it("escalates: each line is more specific than the one before", () => {
    // A proxy rather than a judgement, but a load-bearing one. Three lines of
    // the same generality is one hint played three times at full price.
    for (const chamber of CHAMBER_ORDER) {
      const [first, , third] = ASSISTS[chamber] as readonly string[];
      expect(third!.length, chamber).toBeGreaterThan(first!.length * 0.8);
      expect(new Set(ASSISTS[chamber]).size, chamber).toBe(ASSISTS_PER_CHAMBER);
    }
  });
});

describe("what a line may never contain", () => {
  it("never names a glyph, which is PILOT's half of the work", () => {
    // Whole words, not substrings: the mirror's version of this check once
    // tripped on `cross` inside `across`, and narrowing the match is the fix
    // rather than widening what counts as a leak.
    for (const line of EVERY_LINE) {
      const words = line.toLowerCase().split(/[^a-z]+/);
      for (const glyph of Object.keys(GLYPHS)) {
        expect(words, `"${line.slice(0, 40)}..." names ${glyph}`).not.toContain(glyph);
      }
    }
  });

  it("never mentions the cross-link, which the manual does not either", () => {
    // The Blind Panel's page says a linkage may be inverted and says nothing
    // at all about two gauges sharing a dial. An assist is the previous
    // keeper being helpful, not a second manual with more in it.
    for (const line of EVERY_LINE) {
      expect(line.toLowerCase()).not.toContain("cross-link");
      expect(line.toLowerCase()).not.toContain("crosslink");
      expect(line.toLowerCase()).not.toContain("two needles");
    }
  });

  it("holds no interpolation hole, so a session's answer cannot arrive in one", () => {
    // These are constants and that is the whole safety argument. The cheapest
    // way for it to stop being true is a template literal, which would not
    // otherwise fail anything.
    for (const line of EVERY_LINE) {
      expect(line).not.toMatch(/\$\{|\[object |undefined|null/);
    }
  });

  it("uses no em dash and no emoji, per the repository's formatting law", () => {
    for (const line of EVERY_LINE) {
      expect(line).not.toContain("—");
      expect(line).toMatch(/^[\p{L}\p{N}\p{P}\p{Zs}]+$/u);
    }
  });
});
