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
  BODY_RADIUS,
  LAMP_REACH,
  LEAN_REACH,
  clearOf,
  interlude,
  lampReveal,
  nearestFixture,
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

  it("keeps every piece of dressing inside its own room", () => {
    /*
     * Including its *length*, turned by its facing.
     *
     * This is the assertion that would have caught the Archive's racks. They
     * were built running along their local z while every other long dressing
     * runs along x, so facing them at a side wall turned them ninety degrees
     * the wrong way and pushed most of a four-metre rack out through the
     * masonry. The anchor was inside the room the whole time - only the run was
     * wrong - so a check on position alone would have passed it.
     */
    for (const plan of allPlans()) {
      const { width, depth } = plan.size;
      for (const item of plan.dressing) {
        const half = (item.length ?? 0) / 2;
        const yaw = item.facing ?? 0;
        // Long dressing runs along its own x. Anything relying on that
        // convention has to be built to it; the shelf was not.
        const spanX = Math.abs(Math.cos(yaw)) * half;
        const spanZ = Math.abs(Math.sin(yaw)) * half;
        const where = `${plan.id}/${item.kind}`;
        // `height` is a different field on purpose, so nothing here has to
        // guess whether a number is a run or a rise.
        expect(
          Math.abs(item.at.x) + spanX,
          `${where} runs out through a side wall`,
        ).toBeLessThanOrEqual(width / 2 + 0.001);
        expect(
          Math.abs(item.at.z) + spanZ,
          `${where} runs out through an end wall`,
        ).toBeLessThanOrEqual(depth / 2 + 0.001);
      }
    }
  });

  it("stands no piece of dressing inside a fixture", () => {
    // Overlap is not a crash, it is a room that looks assembled by accident:
    // the Archive had its crates standing inside its racks.
    for (const plan of allPlans()) {
      for (const item of plan.dressing) {
        // Only the pieces of dressing that stand on the floor and take up
        // room. A crate is a *fixture*, not dressing, so it is on the other
        // side of this comparison already.
        if (item.kind !== "cabinet" && item.kind !== "shelf") continue;
        for (const fixture of plan.fixtures) {
          if (fixture.at.y > 1.4) continue;
          const apart = Math.hypot(item.at.x - fixture.at.x, item.at.z - fixture.at.z);
          expect(apart, `${plan.id}: ${item.kind} stands in ${fixture.id}`).toBeGreaterThan(0.8);
        }
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

describe("PILOT's lamp", () => {
  it("resolves what is at hand and loses what is across the room", () => {
    const here = { x: 0, y: 0, z: 0 };
    expect(lampReveal(0, 0, here)).toBe(1);
    expect(lampReveal(LAMP_REACH - 0.1, 0, here)).toBe(1);
    // Beyond the reach it falls off rather than cutting out, so standing on the
    // boundary does not strobe.
    const edge = lampReveal(LAMP_REACH + 1, 0, here);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    expect(lampReveal(40, 0, here)).toBe(0);
  });

  it("ignores height, because a gauge up a wall is still at the bank", () => {
    // Making a player crane at a fixed camera would be a puzzle about the
    // renderer rather than about the station.
    expect(lampReveal(0, 0, { x: 0, y: 0, z: 0 })).toBe(lampReveal(0, 0, { x: 0, y: 3, z: 0 }));
  });

  it("cannot reach the Concord Lock's wheel and its bar at once", () => {
    // The finale's whole tension (doc 02 section 3.4), and it is not enforced
    // anywhere: it falls out of the room being wider than the lamp is bright.
    // If the room ever narrows, or the lamp brightens, this fails rather than
    // the chamber quietly becoming soluble from one spot.
    const plan = roomPlan(CHAMBERS[3]?.view ?? viewOf({}));
    const wheel = plan?.fixtures.find((f) => f.id === "wheel");
    const bar = plan?.fixtures.find((f) => f.id === "bar");
    if (!wheel || !bar) throw new Error("the Concord Lock has a wheel and a bar");
    const apart = Math.hypot(wheel.at.x - bar.at.x, wheel.at.z - bar.at.z);
    expect(apart).toBeGreaterThan(LAMP_REACH * 2);
    // Standing at either one, the other is unreadable.
    expect(lampReveal(wheel.at.x, wheel.at.z, bar.at)).toBe(0);
    expect(lampReveal(bar.at.x, bar.at.z, wheel.at)).toBe(0);
  });

  it("picks the nearest thing that has something to read", () => {
    const plan = roomPlan(CHAMBERS[0]?.view ?? viewOf({}));
    if (!plan) throw new Error("the airlock has a room");
    const lever = plan.fixtures.find((f) => f.id === "lever_a");
    if (!lever) throw new Error("the airlock has lever_a");
    expect(nearestFixture(plan, lever.at.x, lever.at.z)?.id).toBe("lever_a");
    // Nothing within reach is null rather than the least-far thing: leaning in
    // on something across the room would be a camera move nobody asked for.
    expect(nearestFixture(plan, 500, 500)).toBeNull();
  });

  it("leans in on the Archive's monitor, which has no caption at all", () => {
    // The worst possible hole in the default rule: leaning in defaulted to
    // "things with a caption or a glyph", and the monitor has neither, so `E`
    // did nothing in the one room whose whole content is a screen.
    const monitor = ARCHIVE_PLAN.fixtures.find((f) => f.id === "monitor");
    if (!monitor) throw new Error("the Archive has a monitor");
    expect(monitor.label).toBeUndefined();
    expect(nearestFixture(ARCHIVE_PLAN, monitor.at.x, monitor.at.z + 2)?.id).toBe("monitor");
  });

  it("reaches further than the lamp does, because that is what it is for", () => {
    // Tying the lean to the lamp's reach made `E` work only where you could
    // already read the thing, which is exactly backwards.
    expect(LEAN_REACH).toBeGreaterThan(LAMP_REACH);
  });

  it("never leans in on something with nothing to read", () => {
    // A grate and a crate are furniture. Framing one answers no question.
    const plan = roomPlan(CHAMBERS[2]?.view ?? viewOf({}));
    if (!plan) throw new Error("the blind panel has a room");
    const grate = plan.fixtures.find((f) => f.id === "grate");
    if (!grate) throw new Error("the blind panel has a grate");
    expect(nearestFixture(plan, grate.at.x, grate.at.z)?.id).not.toBe("grate");
  });
});

describe("captions that change", () => {
  /*
   * The renderer bakes a caption into a texture, so a label that changes has to
   * *be* a different string for anything downstream to notice. These assert the
   * half of that which can be checked without a renderer: that the plan really
   * does emit new words when the world moves.
   *
   * The other half - that the renderer rebuilds the texture rather than keeping
   * the first one - was broken for the whole of this rework and was found by
   * somebody playing, not by a test. A gauge read 0/7 after it had moved to 1/7
   * and a reload "fixed" it.
   */
  const gaugeLabels = (values: Record<string, number>): readonly (string | undefined)[] => {
    const plan = roomPlan(
      viewOf({
        chamber: "blind_panel",
        facts: { gaugeValues: values, targets: { 1: 7, 2: 3, 3: 5, 4: 5 }, solved: false },
      }),
    );
    return (plan?.fixtures ?? []).filter((f) => f.kind === "gauge").map((f) => f.label);
  };

  it("says a different thing when a gauge moves", () => {
    const before = gaugeLabels({ 1: 0, 2: 0, 3: 0, 4: 0 });
    const after = gaugeLabels({ 1: 1, 2: 0, 3: 0, 4: 0 });
    expect(before[0]).toBe("0/7");
    expect(after[0]).toBe("1/7");
    // And only the one that moved.
    expect(after.slice(1)).toEqual(before.slice(1));
  });

  it("says a different thing when a door opens", () => {
    const shut = roomPlan(viewOf({ chamber: "airlock", facts: { pulled: [], doorOpen: false } }));
    const open = roomPlan(viewOf({ chamber: "airlock", facts: { pulled: [], doorOpen: true } }));
    const labelOf = (plan: RoomPlan | null) => plan?.fixtures.find((f) => f.id === "door")?.label;
    expect(labelOf(shut)).not.toBe(labelOf(open));
  });

  it("says a different thing when the manual page is forged", () => {
    // The one caption whose staleness would be a puzzle bug rather than a
    // cosmetic one: PILOT reads this to answer KEEPER's trust question.
    const clean = roomPlan(
      viewOf({ chamber: "signal_room", facts: { glyphByKey: {}, manualPageState: "clean" } }),
    );
    const marked = roomPlan(
      viewOf({ chamber: "signal_room", facts: { glyphByKey: {}, manualPageState: "vandalised" } }),
    );
    const labelOf = (plan: RoomPlan | null) => plan?.fixtures.find((f) => f.id === "page")?.label;
    expect(labelOf(clean)).toBeDefined();
    expect(labelOf(clean)).not.toBe(labelOf(marked));
  });
});

describe("walking into things", () => {
  it("pushes a body out of a fixture it is standing in", () => {
    const plan = roomPlan(CHAMBERS[0]?.view ?? viewOf({}));
    if (!plan) throw new Error("the airlock has a room");
    const lever = plan.fixtures.find((f) => f.id === "lever_a");
    if (!lever) throw new Error("the airlock has lever_a");
    const clear = clearOf(plan, lever.at.x, lever.at.z);
    expect(Math.hypot(clear.x - lever.at.x, clear.z - lever.at.z)).toBeGreaterThan(BODY_RADIUS);
  });

  it("leaves a body alone where nothing is in the way", () => {
    const plan = roomPlan(CHAMBERS[0]?.view ?? viewOf({}));
    if (!plan) throw new Error("the airlock has a room");
    // The middle of the floor, well clear of the back wall's levers.
    const clear = clearOf(plan, 0, 2.6);
    expect(clear.x).toBeCloseTo(0);
    expect(clear.z).toBeCloseTo(2.6);
  });

  it("stops a body walking through the Signal Room's rail", () => {
    // The rail is *dressing*, and dressing had no collision at all: a body
    // strolled through a waist-high barrier, which is the clearest way a room
    // stops reading as a place. It is also a run rather than a post, so both
    // ends have to block as well as the middle.
    const plan = roomPlan(CHAMBERS[1]?.view ?? viewOf({}));
    if (!plan) throw new Error("the signal room has a room");
    const rail = plan.dressing.find((item) => item.kind === "rail");
    if (!rail) throw new Error("the signal room has a rail");
    const half = (rail.length ?? 0) / 2;
    for (const offset of [-half + 0.3, 0, half - 0.3]) {
      const clear = clearOf(plan, rail.at.x + offset, rail.at.z);
      expect(
        Math.hypot(clear.x - (rail.at.x + offset), clear.z - rail.at.z),
        `the rail is walkable at offset ${String(offset)}`,
      ).toBeGreaterThan(0.1);
    }
    // And past its end it is not a wall: a rail that fenced off the whole room
    // would be worse than one you could walk through.
    const beyond = clearOf(plan, rail.at.x + half + 2, rail.at.z);
    expect(beyond.x).toBeCloseTo(rail.at.x + half + 2);
  });

  it("lets a body walk through what it should: puddles, pipes, beams", () => {
    const plan = roomPlan(CHAMBERS[0]?.view ?? viewOf({}));
    if (!plan) throw new Error("the airlock has a room");
    for (const kind of ["puddle", "pipe", "beam"] as const) {
      const item = plan.dressing.find((d) => d.kind === kind);
      if (!item) continue;
      const clear = clearOf(plan, item.at.x, item.at.z);
      // A puddle is something you walk in; a pipe and a beam are above you.
      expect(clear.x, `${kind} blocks`).toBeCloseTo(item.at.x);
    }
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
