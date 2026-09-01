/**
 * The Blackout: the window in the Blind Panel where the two roles trade places.
 *
 * The proof that it is *safe* is in `tests/possible-worlds.test.ts`, which runs
 * a whole pass under the inverted perception model. What is asserted here is
 * that the window opens and closes where it says it does, that the hands move
 * with the eyes, and that the two projections actually differ inside it.
 *
 * That last one exists because the first build of this shipped with
 * `INVERTED_PERCEPTION` missing from the protocol's barrel export, so every
 * inverted projection silently fell back to the design law through a default
 * parameter and every measurement came back identical. Nothing failed. A
 * default that swallows a missing argument needs a check that reads the result
 * back, which is the same lesson D-079 records about a silent write.
 */

import { describe, expect, it } from "vitest";
import { GameError, INVERTED_PERCEPTION, PERCEIVED_BY } from "@semaphore/protocol";
import {
  BLACKOUT_AFTER_ROTATIONS,
  BLACKOUT_ROTATIONS,
  blackoutOpen,
  perceptionFor,
  rotationsUntilLampsReturn,
} from "./blackout.js";
import * as airlock from "./chambers/airlock.js";
import * as signalRoom from "./chambers/signal_room.js";
import { newSession, reduce, type Action, type PersistedSession } from "./reducer.js";
import { describeChamber, inspectObject } from "./views.js";
import { pilotView } from "./pilot.js";

const NOW = 1_000_000;

/**
 * A session standing in the Blind Panel with `rotations` turns behind it.
 *
 * The rotations are deliberately one click on one dial: enough to advance the
 * count, small enough that no seed in the corpus solves the room by accident
 * and closes the window under the test.
 */
function atBlindPanel(rotations: number, seed = "blackout-seed"): PersistedSession {
  let s = reduce(
    reduce(newSession(seed, seed, NOW), { type: "begin_shift", designation: "KEEPER" }, NOW)
      .session,
    { type: "start", difficulty: "standard", mode: "full" },
    NOW,
  ).session;
  s = reduce(
    s,
    { type: "pull_lever", leverId: airlock.correctLever(s.airlock!.params) },
    NOW,
  ).session;
  for (const key of signalRoom.correctSequence(s.signalRoom!.params)) {
    s = reduce(s, { type: "press_key", keyId: key }, NOW).session;
  }
  for (let i = 0; i < rotations; i++) {
    const action: Action = blackoutOpen(s)
      ? { type: "pilot_rotate_dial", dialId: 1, direction: "clockwise", clicks: 1 }
      : { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 1 };
    s = reduce(s, action, NOW).session;
  }
  return s;
}

describe("when the lamps fail", () => {
  it("stays on until the pair has had time to form a hypothesis", () => {
    for (let n = 0; n < BLACKOUT_AFTER_ROTATIONS; n++) {
      expect(blackoutOpen(atBlindPanel(n))).toBe(false);
    }
  });

  it("opens on the rotation it says it does, and closes when it says it does", () => {
    expect(blackoutOpen(atBlindPanel(BLACKOUT_AFTER_ROTATIONS))).toBe(true);
    expect(blackoutOpen(atBlindPanel(BLACKOUT_AFTER_ROTATIONS + BLACKOUT_ROTATIONS - 1))).toBe(
      true,
    );
    expect(blackoutOpen(atBlindPanel(BLACKOUT_AFTER_ROTATIONS + BLACKOUT_ROTATIONS))).toBe(false);
  });

  it("counts down the rotations left, and reports zero when the lamps are on", () => {
    expect(rotationsUntilLampsReturn(atBlindPanel(BLACKOUT_AFTER_ROTATIONS))).toBe(
      BLACKOUT_ROTATIONS,
    );
    expect(rotationsUntilLampsReturn(atBlindPanel(0))).toBe(0);
  });

  it("never opens in a session that has it switched off", () => {
    // How the benchmark runs (`bench/session.ts`), so the published numbers
    // measure the game the ablation chart claims to be about.
    const dark = atBlindPanel(BLACKOUT_AFTER_ROTATIONS);
    expect(blackoutOpen({ ...dark, blackout: false })).toBe(false);
  });

  it("never opens outside the room it belongs to", () => {
    const dark = atBlindPanel(BLACKOUT_AFTER_ROTATIONS);
    expect(blackoutOpen({ ...dark, machine: { ...dark.machine, chamber: "signal_room" } })).toBe(
      false,
    );
    expect(blackoutOpen({ ...dark, machine: { ...dark.machine, phase: "ARCHIVE" } })).toBe(false);
  });
});

describe("what the two of them can perceive while it is out", () => {
  it("hands out the inverted model, and the design law otherwise", () => {
    expect(perceptionFor(atBlindPanel(BLACKOUT_AFTER_ROTATIONS))).toBe(INVERTED_PERCEPTION);
    expect(perceptionFor(atBlindPanel(0))).toBe(PERCEIVED_BY);
  });

  it("actually projects differently, which a default argument could hide", () => {
    expect(INVERTED_PERCEPTION).not.toEqual(PERCEIVED_BY);
    expect(INVERTED_PERCEPTION.KEEPER).toEqual(PERCEIVED_BY.PILOT);
    expect(INVERTED_PERCEPTION.PILOT).toEqual(PERCEIVED_BY.KEEPER);
  });

  it("lets KEEPER read the gauges out, and only in the dark", () => {
    const dark = describeChamber(atBlindPanel(BLACKOUT_AFTER_ROTATIONS));
    expect(dark).toContain("IN THE DARK");
    expect(dark).toMatch(/gauge 1 reads \d/);

    const lit = describeChamber(atBlindPanel(0));
    expect(lit).not.toContain("IN THE DARK");
    expect(lit).not.toMatch(/gauge 1 reads \d/);
  });

  it("still tells KEEPER the wiring is nobody's, in either state", () => {
    // The one sentence that must survive the inversion, because it is the one
    // fact the chamber exists to withhold from both of them.
    for (const rotations of [0, BLACKOUT_AFTER_ROTATIONS]) {
      expect(describeChamber(atBlindPanel(rotations))).toContain("recorded nowhere");
    }
  });

  it("tells KEEPER what to do with a dial it can no longer feel", () => {
    const text = inspectObject(atBlindPanel(BLACKOUT_AFTER_ROTATIONS), "dial_2");
    expect(text).toContain("out of reach");
    expect(text).toContain("PILOT");
  });

  it("puts the lamps on the frame, so the client is never guessing", () => {
    expect(pilotView(atBlindPanel(BLACKOUT_AFTER_ROTATIONS), NOW).blackout).toBe(true);
    expect(pilotView(atBlindPanel(0), NOW).blackout).toBe(false);
  });
});

describe("whose hands are on the panel", () => {
  const rotate = (s: PersistedSession, type: "rotate_dial" | "pilot_rotate_dial") =>
    reduce(s, { type, dialId: 2, direction: "clockwise", clicks: 1 }, NOW);

  it("refuses KEEPER in the dark, and says what PILOT is doing instead", () => {
    const dark = atBlindPanel(BLACKOUT_AFTER_ROTATIONS);
    expect(() => rotate(dark, "rotate_dial")).toThrow(GameError);
    try {
      rotate(dark, "rotate_dial");
    } catch (error) {
      // A bare rejection teaches an agent nothing. This one has to name the
      // other party and the thing KEEPER can do instead (doc 03 section 9).
      const message = (error as GameError).message;
      expect(message).toContain("lamps are out");
      expect(message).toContain("PILOT");
      expect(message).toContain("gauges");
    }
  });

  it("refuses PILOT in the light, because the grate is in the way", () => {
    expect(() => rotate(atBlindPanel(0), "pilot_rotate_dial")).toThrow(GameError);
  });

  it("lets PILOT turn the dial in the dark, and it really turns", () => {
    const dark = atBlindPanel(BLACKOUT_AFTER_ROTATIONS);
    const { session, toolText } = rotate(dark, "pilot_rotate_dial");
    expect(session.blindPanel!.history.length).toBe(dark.blindPanel!.history.length + 1);
    expect(toolText).toContain("clicks register");
  });

  it("logs the rotation under the party that actually made it", () => {
    // A replay of a blacked-out session should show the rotations crossing to
    // the amber track and back, not KEEPER claiming three it never made.
    const dark = atBlindPanel(BLACKOUT_AFTER_ROTATIONS);
    expect(rotate(dark, "pilot_rotate_dial").events[0]).toMatchObject({
      type: "tool_call",
      tool: "pilot_rotate_dial",
    });
    expect(rotate(atBlindPanel(0), "rotate_dial").events[0]).toMatchObject({
      type: "tool_call",
      tool: "rotate_dial",
    });
  });

  it("hands the room back when the lamps return", () => {
    const after = atBlindPanel(BLACKOUT_AFTER_ROTATIONS + BLACKOUT_ROTATIONS);
    expect(() => rotate(after, "rotate_dial")).not.toThrow();
    expect(() => rotate(after, "pilot_rotate_dial")).toThrow(GameError);
  });
});
