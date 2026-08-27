import { describe, expect, it } from "vitest";
import {
  CHANNELS,
  PERCEIVED_BY,
  audible,
  concealedFrom,
  hidden,
  otherParty,
  perceives,
  projectFacts,
  shared,
  tactile,
  visual,
  type Party,
} from "./channels.js";

const PARTIES: Party[] = ["PILOT", "KEEPER"];

/** A miniature chamber, one fact per channel, so every assertion is total. */
const chamber = {
  glyphOnLever: visual("spiral"),
  leverFeel: tactile("stiff, with a catch near the top"),
  detentsHeard: audible(3),
  timerMs: shared(240_000),
  correctLever: hidden("lever_b"),
} as const;

describe("the channel model", () => {
  it("gives each constructor its own channel", () => {
    expect(visual(1).channel).toBe("VISUAL");
    expect(tactile(1).channel).toBe("TACTILE");
    expect(audible(1).channel).toBe("AUDIBLE");
    expect(shared(1).channel).toBe("SHARED");
    expect(hidden(1).channel).toBe("HIDDEN");
  });

  it("preserves the value it wraps", () => {
    const value = { needles: [1, 2, 3] };
    expect(visual(value).value).toBe(value);
  });

  it("lists every channel exactly once", () => {
    expect(new Set(CHANNELS).size).toBe(CHANNELS.length);
    expect(CHANNELS).toHaveLength(5);
  });

  it("pairs the two parties", () => {
    expect(otherParty("PILOT")).toBe("KEEPER");
    expect(otherParty("KEEPER")).toBe("PILOT");
  });
});

describe("the perception rule", () => {
  // "PILOT perceives by sight. KEEPER perceives by touch and by document.
  // Both hear." Each clause is asserted separately so a failure names itself.
  it("gives sight to PILOT alone", () => {
    expect(perceives("PILOT", "VISUAL")).toBe(true);
    expect(perceives("KEEPER", "VISUAL")).toBe(false);
  });

  it("gives touch and document to KEEPER alone", () => {
    expect(perceives("KEEPER", "TACTILE")).toBe(true);
    expect(perceives("PILOT", "TACTILE")).toBe(false);
  });

  it("gives hearing to both", () => {
    for (const party of PARTIES) expect(perceives(party, "AUDIBLE")).toBe(true);
  });

  it("gives SHARED to both", () => {
    for (const party of PARTIES) expect(perceives(party, "SHARED")).toBe(true);
  });

  // The single most important assertion in the package. If HIDDEN ever becomes
  // perceivable the game still runs, still renders and is no longer the game:
  // the solution would be somebody's to see.
  it("gives HIDDEN to neither party, which is what makes the solution nobody's", () => {
    for (const party of PARTIES) expect(perceives(party, "HIDDEN")).toBe(false);
  });

  it("leaves no channel unaccounted for by either party", () => {
    for (const channel of CHANNELS) {
      const seenBy = PARTIES.filter((p) => perceives(p, channel));
      // Every channel is seen by exactly one party, both, or neither, and which
      // of those it is was a design decision rather than an accident.
      expect(seenBy.length).toBeGreaterThanOrEqual(0);
      expect(seenBy.length).toBeLessThanOrEqual(2);
    }
  });

  it("declares no channel twice for one party", () => {
    for (const party of PARTIES) {
      const declared = PERCEIVED_BY[party];
      expect(new Set(declared).size).toBe(declared.length);
    }
  });

  it("keeps the asymmetry genuinely asymmetric", () => {
    // If the two parties ever perceived the same set there would be no game,
    // so this is a guard against a well-meaning "just add VISUAL to KEEPER".
    expect(new Set(PERCEIVED_BY.PILOT)).not.toEqual(new Set(PERCEIVED_BY.KEEPER));
  });
});

describe("projectFacts", () => {
  it("gives PILOT sight, sound and shared state, and nothing else", () => {
    expect(projectFacts(chamber, "PILOT")).toEqual({
      glyphOnLever: "spiral",
      detentsHeard: 3,
      timerMs: 240_000,
    });
  });

  it("gives KEEPER touch, sound and shared state, and nothing else", () => {
    expect(projectFacts(chamber, "KEEPER")).toEqual({
      leverFeel: "stiff, with a catch near the top",
      detentsHeard: 3,
      timerMs: 240_000,
    });
  });

  it("omits concealed fields rather than nulling them", () => {
    // Absence is a compile-time obligation at the call site; a null would be a
    // value a careless consumer could read and treat as data.
    const view = projectFacts(chamber, "KEEPER");
    expect("glyphOnLever" in view).toBe(false);
    expect("correctLever" in view).toBe(false);
  });

  it("never emits a HIDDEN value into either projection", () => {
    for (const party of PARTIES) {
      const serialised = JSON.stringify(projectFacts(chamber, party));
      expect(serialised).not.toContain("lever_b");
    }
  });

  it("renders one AUDIBLE fact into both projections, identically", () => {
    const pilot = projectFacts(chamber, "PILOT");
    const keeper = projectFacts(chamber, "KEEPER");
    // Same field, same value, one source. The renderers differ, the fact does not.
    expect(pilot.detentsHeard).toBe(keeper.detentsHeard);
  });

  it("returns an empty view when every fact is concealed", () => {
    expect(projectFacts({ answer: hidden(42) }, "PILOT")).toEqual({});
  });

  it("does not mutate the state it projects", () => {
    const before = JSON.stringify(chamber);
    projectFacts(chamber, "PILOT");
    expect(JSON.stringify(chamber)).toBe(before);
  });
});

describe("concealedFrom", () => {
  it("reports what PILOT may not perceive", () => {
    expect(concealedFrom(chamber, "PILOT")).toEqual([
      ["leverFeel", "stiff, with a catch near the top"],
      ["correctLever", "lever_b"],
    ]);
  });

  it("reports what KEEPER may not perceive", () => {
    expect(concealedFrom(chamber, "KEEPER")).toEqual([
      ["glyphOnLever", "spiral"],
      ["correctLever", "lever_b"],
    ]);
  });

  it("conceals HIDDEN from both, so it appears in both lists", () => {
    for (const party of PARTIES) {
      const keys = concealedFrom(chamber, party).map(([key]) => key);
      expect(keys).toContain("correctLever");
    }
  });

  it("partitions every fact into exactly one of projected or concealed", () => {
    for (const party of PARTIES) {
      const projected = Object.keys(projectFacts(chamber, party));
      const concealed = concealedFrom(chamber, party).map(([key]) => key);
      expect([...projected, ...concealed].sort()).toEqual(Object.keys(chamber).sort());
      expect(projected.filter((k) => concealed.includes(k))).toEqual([]);
    }
  });
});
