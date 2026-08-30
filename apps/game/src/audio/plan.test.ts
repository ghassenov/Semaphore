/**
 * The audio layer's decisions, which are the only part of it a test can reach.
 *
 * Web Audio does not exist in the test environment and never will, so the
 * split this file relies on is load-bearing rather than tidy: everything that
 * chooses lives in `plan.ts` and is checked here, and everything that makes a
 * noise chooses nothing.
 */

import { describe, expect, it } from "vitest";
import type { PilotView } from "@semaphore/protocol";
import { DETENT_MS, scoreFor, soundingFor } from "./plan.js";

const CHAMBER_MS = 180_000;

function viewOf(over: Partial<PilotView>): PilotView {
  return {
    phase: "IN_CHAMBER",
    chamber: "blind_panel",
    mode: "full",
    designation: "KEEPER",
    remainingMs: CHAMBER_MS,
    retries: 0,
    facts: {},
    notes: [],
    ghost: null,
    seq: 0,
    ...over,
  };
}

describe("the tension layers", () => {
  it("adds each layer at the fraction doc 06 names", () => {
    const at = (left: number) => scoreFor(CHAMBER_MS * left, CHAMBER_MS).layers;
    expect(at(1)).toEqual(["bed", "drone"]);
    expect(at(0.75)).toEqual(["bed", "drone"]);
    expect(at(0.4)).toEqual(["bed", "drone", "pulse"]);
    expect(at(0.2)).toEqual(["bed", "drone", "pulse", "arpeggio"]);
    expect(at(0.05)).toEqual(["bed", "drone", "pulse", "arpeggio", "heartbeat"]);
  });

  it("only ever adds, never swaps", () => {
    // The whole design is that tension accumulates. A layer that appeared and
    // then left would read as the clock having been given back.
    let held: readonly string[] = [];
    for (let left = 100; left >= 0; left -= 1) {
      const layers = scoreFor((CHAMBER_MS * left) / 100, CHAMBER_MS).layers;
      for (const was of held) expect(layers, `lost ${was} at ${String(left)}%`).toContain(was);
      held = layers;
    }
  });

  it("ducks the bed only under the heartbeat", () => {
    expect(scoreFor(CHAMBER_MS * 0.2, CHAMBER_MS).bed).toBe(1);
    expect(scoreFor(CHAMBER_MS * 0.05, CHAMBER_MS).bed).toBeLessThan(1);
  });

  it("never escalates an untimed session", () => {
    // Practice is the preset for looking at the station without being hurried
    // (doc 02 section 7). A heartbeat would hurry it.
    expect(scoreFor(null, 0).layers).toEqual(["bed", "drone"]);
    expect(scoreFor(null, CHAMBER_MS).layers).toEqual(["bed", "drone"]);
    expect(scoreFor(CHAMBER_MS, 0).layers).toEqual(["bed", "drone"]);
  });

  it("treats a chamber past its deadline as the last tenth, not as fresh", () => {
    // A negative remainder arrives between the deadline passing and the
    // DEADLOCK frame landing. Clamping it to zero keeps the heartbeat going;
    // dividing it raw would produce a negative fraction, which is less than
    // every threshold and would coincidentally still be right - but only by
    // accident, and it would break the moment a threshold went negative.
    expect(scoreFor(-4000, CHAMBER_MS).layers).toContain("heartbeat");
  });
});

describe("what a frame sounds like", () => {
  it("sounds a cue once per event, not once per frame", () => {
    const first = viewOf({ seq: 4, facts: { lastCue: "klaxon" } });
    expect(soundingFor(null, first)).toEqual({ cue: "klaxon", count: 1 });
    // The same frame again: the view is pushed on a timer as well as on an
    // action, so most frames carry an event that has already been heard.
    expect(soundingFor(first, first)).toBeNull();
  });

  it("sounds two identical rotations twice", () => {
    // The reason `seq` is on the view at all. Two rotations that each register
    // three clicks produce frames identical in every other field, and PILOT
    // has to hear six detents: doc 02 section 3.3 makes the count the puzzle.
    const once = viewOf({ seq: 9, facts: { lastClicks: 3 } });
    const twice = viewOf({ seq: 10, facts: { lastClicks: 3 } });
    expect(soundingFor(null, once)).toEqual({ cue: "detent", count: 3 });
    expect(soundingFor(once, twice)).toEqual({ cue: "detent", count: 3 });
  });

  it("is silent when a rotation registers nothing", () => {
    // Silence is the honest sound of zero detents, and it is informative: it
    // says the linkage is against a bound. The subtitle still says so in
    // words, and the tool call's own thump says KEEPER did something.
    const view = viewOf({ seq: 3, facts: { lastClicks: 0 } });
    expect(soundingFor(null, view)).toBeNull();
  });

  it("says nothing about a frame with no audible fact", () => {
    expect(soundingFor(null, viewOf({ seq: 1 }))).toBeNull();
    expect(soundingFor(null, viewOf({ seq: 1, facts: { doorOpen: true } }))).toBeNull();
  });

  it("refuses a cue the client cannot synthesise", () => {
    // `facts` is `Record<string, unknown>` off the wire, so this is the only
    // thing standing between a renamed cue and a crash inside the synth table.
    const view = viewOf({ seq: 2, facts: { lastCue: "trumpets" } });
    expect(soundingFor(null, view)).toBeNull();
  });

  it("caps a detent run, however many clicks a frame claims", () => {
    const view = viewOf({ seq: 2, facts: { lastClicks: 5000 } });
    const sounding = soundingFor(null, view);
    expect(sounding?.count).toBeLessThanOrEqual(16);
    // And the run it produces still has to be shorter than a chamber.
    expect((sounding?.count ?? 0) * DETENT_MS).toBeLessThan(5000);
  });
});
