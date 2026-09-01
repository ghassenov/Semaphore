/**
 * The objective, and the two things it may never do.
 *
 * It may not name a `VISUAL` fact, and it may not report a reading to a party
 * that cannot perceive it. Both are asserted here against the real
 * projections rather than against hand-written fact objects, because a
 * fabricated input can protect a bug instead of catching it: a test that
 * builds its own "KEEPER view" will happily prove that `progressIn` hides a
 * key the real projection was never going to send it anyway.
 */

import { describe, expect, it } from "vitest";
import { CHAMBER_ORDER } from "@semaphore/protocol";
import { objectiveFor, objectiveLine, progressIn } from "./objective.js";
import { projectForKeeper, projectForPilot } from "./projection.js";
import * as airlock from "./chambers/airlock.js";
import * as signalRoom from "./chambers/signal_room.js";
import * as blindPanel from "./chambers/blind_panel.js";
import * as concordLock from "./chambers/concord_lock.js";
import { GLYPHS } from "./chambers/glyphs.js";
import { Rng } from "@semaphore/seed";

/** The Blind Panel's own state, generated the way the reducer generates it. */
function blindPanelState(): blindPanel.BlindPanelState {
  return blindPanel.initial(blindPanel.generate(new Rng("seed:blind")), 0, null);
}

/** The Signal Room's, likewise. */
function signalRoomState(): signalRoom.SignalRoomState {
  return signalRoom.initial(signalRoom.generate(new Rng("seed:signal")));
}

/** A fresh set of facts for each chamber, from the chambers' own generators. */
function factsFor(chamber: string): Record<string, unknown> {
  if (chamber === "airlock") {
    return airlock.facts(airlock.initial(airlock.generate(new Rng("seed:airlock"))));
  }
  if (chamber === "signal_room") return signalRoom.facts(signalRoomState());
  if (chamber === "blind_panel") return blindPanel.facts(blindPanelState());
  const drawn = concordLock.generate(new Rng("seed:concord"));
  return concordLock.facts(
    concordLock.initial(drawn.params, drawn.cipherOffset, 2700),
    0,
  ) as unknown as Record<string, unknown>;
}

describe("the authored lines", () => {
  it("gives every chamber an objective", () => {
    for (const chamber of CHAMBER_ORDER) {
      expect(objectiveFor(chamber).length).toBeGreaterThan(20);
    }
  });

  it("never names a glyph, which is PILOT's half of the work", () => {
    // The same rule the renderer's captions live under: a lever described as
    // "the spiral one" deletes the chamber it is in. Matched whole-word, not
    // by substring - the mirror's version of this check once tripped on
    // `cross` inside `across`, and narrowing the match is the fix.
    for (const chamber of CHAMBER_ORDER) {
      const words = objectiveFor(chamber)
        .toLowerCase()
        .split(/[^a-z]+/);
      for (const glyph of Object.keys(GLYPHS)) {
        expect(words, `${chamber} names ${glyph}`).not.toContain(glyph);
      }
    }
  });

  it("says the same thing on arrival as it does five minutes in", () => {
    // Authored constants, so this is true by construction. The test exists
    // because the cheapest way for that to stop being true is for somebody to
    // interpolate a count into a line, and nothing else would notice.
    const before = CHAMBER_ORDER.map((chamber) => objectiveFor(chamber));
    const after = CHAMBER_ORDER.map((chamber) => objectiveFor(chamber));
    expect(after).toEqual(before);
  });
});

describe("progress cannot leak, because it reads what it is handed", () => {
  it("gives each party a reading only from its own projection", () => {
    for (const chamber of CHAMBER_ORDER) {
      const facts = factsFor(chamber);
      const pilot = progressIn(chamber, projectForPilot(facts as never));
      const keeper = progressIn(chamber, projectForKeeper(facts as never));
      expect(pilot, `${chamber} tells PILOT nothing`).not.toBeNull();
      expect(keeper, `${chamber} tells KEEPER nothing`).not.toBeNull();
    }
  });

  it("reports needles to PILOT and rotations to KEEPER in the Blind Panel", () => {
    // The one chamber where the two parties genuinely count different things,
    // and the reason `progressIn` reads the projection rather than the state.
    // The gauges and the target plate are both VISUAL, so the branch that
    // reads them is structurally unreachable from KEEPER's projection.
    const facts = blindPanel.facts(blindPanelState());
    expect(progressIn("blind_panel", projectForPilot(facts))?.label).toBe("needles on mark");
    expect(progressIn("blind_panel", projectForKeeper(facts))?.label).toBe("rotations made");
  });

  it("never publishes the Signal Room's sequence length to anybody", () => {
    // The length is a function of which glyphs this session drew, so it is
    // the answer in a different shape. It counts up and never says how far.
    const facts = signalRoom.facts(signalRoomState());
    for (const view of [projectForPilot(facts), projectForKeeper(facts)]) {
      expect(progressIn("signal_room", view)?.total).toBeNull();
    }
  });

  it("answers null rather than nought when a party cannot perceive the count", () => {
    // A bar reading "0 of 3" to somebody with no way to see the bolts is a
    // claim about the room. Nothing may assert a state to a party that has no
    // way to know it.
    expect(progressIn("concord_lock", {})).toBeNull();
    expect(progressIn("airlock", {})).toBeNull();
    expect(progressIn("blind_panel", {})).toBeNull();
  });
});

describe("objectiveLine", () => {
  it("appends the reading, and omits a total there is not one of", () => {
    expect(objectiveLine("airlock", { done: 1, total: 3, label: "levers tried" })).toContain(
      "(levers tried: 1 of 3)",
    );
    expect(
      objectiveLine("signal_room", { done: 2, total: null, label: "keys accepted" }),
    ).toContain("(keys accepted: 2)");
  });

  it("is just the objective when there is no reading", () => {
    expect(objectiveLine("airlock", null)).toBe(objectiveFor("airlock"));
  });
});
