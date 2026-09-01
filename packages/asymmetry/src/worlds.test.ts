/**
 * The proof, over a toy space small enough to check by hand.
 *
 * A lamp is behind a screen. The human sees which of four positions the switch
 * is in; the agent can feel only whether the housing is warm. The correct
 * action is naming the position, so the agent's view is underdetermined by
 * construction, and the arithmetic below is checkable without running it.
 */

import { describe, expect, it } from "vitest";
import { canonicalise, viewHash } from "./canonical.ts";
import type { PerceptionModel } from "./perception.ts";
import { consistentWorlds, distinctActions, isUnderdetermined, measure } from "./worlds.ts";
import type { Space } from "./worlds.ts";

type Channel = "SIGHT" | "TOUCH" | "BOTH";
const MODEL: PerceptionModel<"HUMAN" | "AGENT", Channel> = {
  HUMAN: ["SIGHT", "BOTH"],
  AGENT: ["TOUCH", "BOTH"],
};

const POSITIONS = [0, 1, 2, 3] as const;
interface Lamp {
  readonly position: (typeof POSITIONS)[number];
}

/** Warm at the two upper positions, so touch halves the space and no more. */
const lamp: Space<Lamp, Channel> = {
  id: "lamp",
  facts: (s) => ({
    position: { value: s.position, channel: "SIGHT" },
    warm: { value: s.position >= 2, channel: "TOUCH" },
  }),
  candidates: () => POSITIONS.map((position) => ({ position })),
  correctAction: (s) => `set ${s.position}`,
};

describe("consistentWorlds", () => {
  it("keeps every world the party cannot tell apart", () => {
    // Touch says "warm", which is positions 2 and 3 and nothing narrower.
    expect(consistentWorlds(lamp, { position: 3 }, MODEL, "AGENT")).toEqual([
      { position: 2 },
      { position: 3 },
    ]);
  });

  it("narrows to one when the party can see", () => {
    expect(consistentWorlds(lamp, { position: 3 }, MODEL, "HUMAN")).toEqual([{ position: 3 }]);
  });

  it("always contains the observed state", () => {
    for (const position of POSITIONS) {
      const worlds = consistentWorlds(lamp, { position }, MODEL, "AGENT");
      expect(worlds).toContainEqual({ position });
    }
  });
});

describe("measure", () => {
  it("reports decision-relevant ambiguity in bits", () => {
    // Two worlds that disagree about the action: exactly one bit to supply.
    expect(measure(lamp, { position: 3 }, MODEL, "AGENT")).toEqual({
      worlds: 2,
      actions: 2,
      bits: 1,
    });
  });

  it("reports nothing left to supply once the view determines the answer", () => {
    expect(measure(lamp, { position: 3 }, MODEL, "HUMAN")).toEqual({
      worlds: 1,
      actions: 1,
      bits: 0,
    });
  });
});

describe("distinctActions", () => {
  it("preserves null as an outcome distinct from an action", () => {
    const solved: Space<Lamp, Channel> = {
      ...lamp,
      correctAction: (s) => (s.position === 0 ? null : `set ${s.position}`),
    };
    const actions = distinctActions(solved, [{ position: 0 }, { position: 1 }]);
    expect(actions).toEqual(new Set([null, "set 1"]));
  });
});

describe("isUnderdetermined", () => {
  it("holds for the party that cannot see and fails for the one that can", () => {
    expect(isUnderdetermined(lamp, { position: 3 }, MODEL, "AGENT")).toBe(true);
    expect(isUnderdetermined(lamp, { position: 3 }, MODEL, "HUMAN")).toBe(false);
  });
});

describe("canonicalise", () => {
  it("sorts keys, so insertion order cannot inflate a consistent set", () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe(canonicalise({ a: 2, b: 1 }));
  });

  it("sorts through nesting and inside arrays", () => {
    expect(canonicalise({ x: [{ b: 1, a: 2 }] })).toBe(canonicalise({ x: [{ a: 2, b: 1 }] }));
  });
});

describe("viewHash", () => {
  it("is stable for equal views and differs for unequal ones", () => {
    expect(viewHash({ a: 1, b: 2 })).toBe(viewHash({ b: 2, a: 1 }));
    expect(viewHash({ a: 1 })).not.toBe(viewHash({ a: 2 }));
    expect(viewHash({ a: 1 })).toHaveLength(8);
  });
});
