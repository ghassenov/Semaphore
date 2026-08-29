/**
 * What is in a room, held to the rules the room is built on.
 *
 * Three of these assertions are about the game rather than about geometry, and
 * they are the reason this file exists rather than a screenshot:
 *
 * - **No caption anywhere names a glyph.** A lever captioned "spiral" deletes
 *   the chamber, because reading a label aloud is not describing a shape. This
 *   is the one rule in the client whose breach would look completely fine on
 *   screen and quietly remove the puzzle.
 * - **Nothing stands outside its room.** A fixture half a metre through a wall
 *   renders perfectly happily, as a lever floating in the dark next door.
 * - **Ids are unique within a room.** The stage keys motion state on them, so a
 *   duplicate is two fixtures sharing one animation and one of them silently
 *   never appearing.
 */

import { describe, expect, it } from "vitest";
import type { PilotView } from "@semaphore/protocol";
import {
  ARCHIVE_PLAN,
  CHAMBER_ACCENT,
  GAUGE_MAX,
  ROOM_SIZES,
  arc,
  facingCentre,
  interlude,
  roomPlan,
  roomTitle,
  spread,
  type RoomPlan,
} from "./chamber.js";
import { GLYPH_IDS } from "./glyphs.js";

/** A view with everything the chambers do not care about filled in. */
function viewOf(over: Partial<PilotView>): PilotView {
  return {
    phase: "IN_CHAMBER",
    chamber: null,
    mode: "full",
    designation: "TESTER",
    remainingMs: 60_000,
    retries: 0,
    facts: {},
    notes: [],
    ghost: null,
    ...over,
  };
}

/**
 * One representative view per chamber, with facts shaped as the worker sends
 * them.
 *
 * Hand-built, which is a risk this repo has been bitten by before: a test with
 * a fabricated input can protect a bug instead of catching it. These are kept
 * to the shapes `apps/worker/src/chambers/*.ts` actually project, and the
 * properties asserted below are structural rather than about the values, so a
 * drift in the worker's field names shows up as an empty room rather than as a
 * passing test about nothing.
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

/** Every plan the game can draw, including the Archive's constant one. */
function allPlans(): readonly RoomPlan[] {
  const plans = CHAMBERS.map(({ name, view }) => {
    const plan = roomPlan(view);
    if (plan === null) throw new Error(`${name} produced no room`);
    return plan;
  });
  return [...plans, ARCHIVE_PLAN];
}

describe("what a room contains", () => {
  it("builds a room for every chamber the game has", () => {
    for (const { name, view } of CHAMBERS) {
      const plan = roomPlan(view);
      expect(plan, `${name} produced no room`).not.toBeNull();
      expect(plan?.fixtures.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("never puts a glyph's name on a caption", () => {
    // The rule that keeps the whole game a conversation. A caption may say a
    // lever's position or a key's number, because that is what KEEPER can be
    // told to act on. It may never say what the shape above it is called.
    const names = new Set(GLYPH_IDS.map((id) => id.toUpperCase()));
    for (const plan of allPlans()) {
      for (const fixture of plan.fixtures) {
        if (fixture.label === undefined) continue;
        for (const word of fixture.label.toUpperCase().split(/[^A-Z]+/)) {
          expect(names.has(word), `${plan.id} captions a fixture "${fixture.label}"`).toBe(false);
        }
      }
    }
  });

  it("stands every fixture inside its own room", () => {
    for (const plan of allPlans()) {
      const { width, depth, height } = plan.size;
      for (const fixture of plan.fixtures) {
        const where = `${plan.id}/${fixture.id}`;
        expect(Math.abs(fixture.at.x), `${where} is outside the width`).toBeLessThanOrEqual(
          width / 2 + 0.001,
        );
        expect(Math.abs(fixture.at.z), `${where} is outside the depth`).toBeLessThanOrEqual(
          depth / 2 + 0.001,
        );
        expect(fixture.at.y, `${where} is below the floor`).toBeGreaterThanOrEqual(0);
        expect(fixture.at.y, `${where} is through the ceiling`).toBeLessThan(height);
      }
    }
  });

  it("gives every fixture in a room a distinct id", () => {
    for (const plan of allPlans()) {
      const ids = plan.fixtures.map((fixture) => fixture.id);
      expect(new Set(ids).size, `${plan.id} repeats a fixture id`).toBe(ids.length);
    }
  });

  it("only ever asks for a glyph the client can draw", () => {
    for (const plan of allPlans()) {
      for (const fixture of plan.fixtures) {
        if (fixture.glyph === undefined || fixture.glyph === "") continue;
        expect(GLYPH_IDS, `${plan.id} wants an unknown glyph`).toContain(fixture.glyph);
      }
    }
  });

  it("keeps a gauge's level and target inside the scale", () => {
    const plan = roomPlan(CHAMBERS[2]?.view ?? viewOf({}));
    const gauges = plan?.fixtures.filter((fixture) => fixture.kind === "gauge") ?? [];
    expect(gauges).toHaveLength(4);
    for (const gauge of gauges) {
      expect(gauge.level).toBeGreaterThanOrEqual(0);
      expect(gauge.level).toBeLessThanOrEqual(1);
      expect(gauge.target).toBeGreaterThanOrEqual(0);
      expect(gauge.target).toBeLessThanOrEqual(1);
      expect(gauge.steps).toBe(GAUGE_MAX);
    }
  });

  it("lights each chamber in the channel whose room it is", () => {
    for (const { name, view } of CHAMBERS) {
      const plan = roomPlan(view);
      expect(plan?.accent).toBe(CHAMBER_ACCENT[name as keyof typeof CHAMBER_ACCENT]);
    }
  });

  it("floods the Airlock by how many levers were pulled in vain", () => {
    // The escalation is visual and has no mechanical effect, so nothing else
    // will notice if it stops working. It also has to stop the moment the door
    // opens, or a solved chamber is left standing in water.
    const dry = roomPlan(viewOf({ chamber: "airlock", facts: { pulled: [], doorOpen: false } }));
    const wet = roomPlan(
      viewOf({ chamber: "airlock", facts: { pulled: ["lever_a", "lever_b"], doorOpen: false } }),
    );
    const open = roomPlan(
      viewOf({ chamber: "airlock", facts: { pulled: ["lever_a"], doorOpen: true } }),
    );
    expect(dry?.flood).toBe(0);
    expect(wet?.flood ?? 0).toBeGreaterThan(0);
    expect(open?.flood).toBe(0);
  });

  it("never claims the Signal Room is solved", () => {
    // The correct sequence is a subset of six keys whose size only the server
    // knows, so deriving "solved" from what has been pressed would be the
    // client guessing at the answer. The room is solved by leaving it.
    const plan = roomPlan(CHAMBERS[1]?.view ?? viewOf({}));
    expect(plan?.solved).toBe(false);
  });
});

describe("the phases with no room", () => {
  it("draws the Archive's own room rather than the room behind it", () => {
    // `machine.chamber` outlives the room (D-025): it still names the Blind
    // Panel all the way through the Archive. Asking the chamber first would
    // build the solved Blind Panel behind the monitor.
    //
    // The worker sends no facts in this phase (`pilot.ts`, `inTheRoom`), so the
    // first case is what actually arrives. The second is the same phase with
    // facts fabricated onto it, which the worker never does: it is here because
    // the two functions have to agree about which room the pair is in even if
    // one of them is handed something impossible, and `roomTitle` did not.
    const real = viewOf({ phase: "ARCHIVE", chamber: "blind_panel", facts: {} });
    expect(roomPlan(real)).toBe(ARCHIVE_PLAN);
    expect(roomTitle(real)).toBe("THE ARCHIVE");

    const impossible = viewOf({
      phase: "ARCHIVE",
      chamber: "blind_panel",
      facts: { gaugeValues: { 1: 3 }, targets: { 1: 3 } },
    });
    expect(roomPlan(impossible)).toBe(ARCHIVE_PLAN);
    expect(roomTitle(impossible)).toBe("THE ARCHIVE");
  });

  it("has no room where the server sends no facts", () => {
    expect(roomPlan(viewOf({ phase: "FINALE", chamber: "concord_lock", facts: {} }))).toBeNull();
    expect(roomPlan(viewOf({ phase: "LOBBY", chamber: null }))).toBeNull();
  });

  it("says something in every phase that has no room", () => {
    // A first pass drew "NO ROOM HERE" in all of these, which is accurate and
    // reads as a rendering fault at exactly the moment the game should be
    // landing. Every roomless phase gets its own words instead.
    const seen = new Set<string>();
    for (const phase of ["ENTRY", "LOBBY", "TRANSITIONING", "FINALE", "ESCAPED"] as const) {
      const [headline] = interlude(viewOf({ phase }));
      expect(headline.length, `${phase} says nothing`).toBeGreaterThan(0);
      expect(roomTitle(viewOf({ phase })).length, `${phase} has no title`).toBeGreaterThan(0);
      seen.add(headline);
    }
    // Each of them says something different. A shared fallback would pass every
    // assertion above while telling the player nothing.
    expect(seen.size).toBe(5);
  });
});

describe("the layout helpers", () => {
  it("spreads a bank evenly and centred", () => {
    expect(spread(0, 10)).toEqual([]);
    expect(spread(1, 10)).toEqual([0]);
    expect(spread(3, 10)).toEqual([-5, 0, 5]);
    // The sum of a centred spread is zero, whatever the count.
    expect(spread(6, 9).reduce((total, x) => total + x, 0)).toBeCloseTo(0);
  });

  it("puts the ring across the back of the room, never behind the camera", () => {
    const ring = arc(6, 5);
    expect(ring).toHaveLength(6);
    for (const at of ring) {
      // Every position is north of the centre, so all six are in shot. Two
      // glyphs behind the camera are two glyphs nobody can read.
      expect(at.z).toBeLessThan(0);
      expect(Math.hypot(at.x, at.z)).toBeCloseTo(5);
    }
  });

  it("turns every ring position back toward the middle", () => {
    for (const at of arc(6, 5)) {
      const facing = facingCentre(at);
      // Facing the centre means the outward direction and the fixture's own
      // forward vector point opposite ways.
      const forward = { x: Math.sin(facing), z: Math.cos(facing) };
      const outward = Math.hypot(at.x, at.z);
      const dot = (forward.x * at.x + forward.z * at.z) / outward;
      expect(dot).toBeLessThan(-0.99);
    }
  });

  it("gives every room a size the camera can frame", () => {
    for (const [id, size] of Object.entries(ROOM_SIZES)) {
      expect(size.width, `${id} has no width`).toBeGreaterThan(0);
      expect(size.depth, `${id} has no depth`).toBeGreaterThan(0);
      expect(size.height, `${id} has no height`).toBeGreaterThan(0);
    }
  });
});
