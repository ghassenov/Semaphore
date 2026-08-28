import { describe, expect, it } from "vitest";
import { GameError } from "@semaphore/protocol";
import * as airlock from "./chambers/airlock.js";
import * as signalRoom from "./chambers/signal_room.js";
import * as blindPanel from "./chambers/blind_panel.js";
import * as concordLock from "./chambers/concord_lock.js";
import * as archive from "./archive/index.js";
import { newSession, reduce, type PersistedSession } from "./reducer.js";

const NOW = 1_000_000;
const SESSION_ID = "s_test";
const SEED = "reducer-seed";

const fresh = (): PersistedSession => newSession(SESSION_ID, SEED, NOW);

/** Drive a session from ENTRY to the moment the airlock is playable. */
function begunSession(): PersistedSession {
  const { session: afterBegin } = reduce(
    fresh(),
    { type: "begin_shift", designation: "KEEPER" },
    NOW,
  );
  const { session: afterStart } = reduce(
    afterBegin,
    { type: "start", difficulty: "standard", mode: "full" },
    NOW,
  );
  return afterStart;
}

/** Drive a session past the airlock, into the moment the Signal Room is playable. */
function signalRoomSession(): PersistedSession {
  const airlockDone = begunSession();
  const correct = airlock.correctLever(airlockDone.airlock!.params);
  const { session } = reduce(airlockDone, { type: "pull_lever", leverId: correct }, NOW);
  return session;
}

describe("newSession", () => {
  it("starts in ENTRY with no designation and no airlock state", () => {
    const s = fresh();
    expect(s.machine.phase).toBe("ENTRY");
    expect(s.designation).toBeNull();
    expect(s.airlock).toBeNull();
    expect(s.seq).toBe(0);
  });
});

describe("begin_shift", () => {
  it("moves ENTRY to LOBBY and records the agent's chosen designation", () => {
    const { session } = reduce(fresh(), { type: "begin_shift", designation: "KEEPER" }, NOW);
    expect(session.machine.phase).toBe("LOBBY");
    expect(session.designation).toBe("KEEPER");
  });

  it("returns the doc 04 §3 briefing, naming the designation", () => {
    const { toolText } = reduce(fresh(), { type: "begin_shift", designation: "KEEPER" }, NOW);
    expect(toolText).toContain("Designation logged: KEEPER");
    expect(toolText).toContain("You are KEEPER");
    expect(toolText).toContain("read_manual('index')");
  });

  it("emits no event yet: session_start waits for start(), where mode is known", () => {
    // A session_start event whose own mode field is required cannot be
    // honestly emitted before start() has chosen a mode. Moving it here was
    // a real bug fix, not a preference: the old code hardcoded "full"
    // regardless of what the player later picked (see the test below).
    const { events } = reduce(fresh(), { type: "begin_shift", designation: "KEEPER" }, NOW);
    expect(events).toEqual([]);
  });

  it("rejects an empty designation", () => {
    expect(() => reduce(fresh(), { type: "begin_shift", designation: "  " }, NOW)).toThrow(
      GameError,
    );
  });

  it("is idempotent: a repeated call does not fail or reset the designation", () => {
    const { session: first } = reduce(fresh(), { type: "begin_shift", designation: "KEEPER" }, NOW);
    const { session: second, events } = reduce(
      first,
      { type: "begin_shift", designation: "SOMETHING-ELSE" },
      NOW,
    );
    expect(second.designation).toBe("KEEPER");
    expect(events).toEqual([]);
  });
});

describe("start", () => {
  it("refuses to start before begin_shift", () => {
    expect(() =>
      reduce(fresh(), { type: "start", difficulty: "standard", mode: "full" }, NOW),
    ).toThrow(GameError);
  });

  it("moves LOBBY to IN_CHAMBER and generates the airlock", () => {
    const session = begunSession();
    expect(session.machine.phase).toBe("IN_CHAMBER");
    expect(session.machine.chamber).toBe("airlock");
    expect(session.airlock).not.toBeNull();
  });

  it("generates the same airlock every time for one seed", () => {
    const a = begunSession();
    const b = begunSession();
    expect(a.airlock).toEqual(b.airlock);
  });

  it("emits session_start, with the real mode, then chamber_enter for the airlock", () => {
    const { session: afterBegin } = reduce(
      fresh(),
      { type: "begin_shift", designation: "KEEPER" },
      NOW,
    );
    const { events } = reduce(
      afterBegin,
      { type: "start", difficulty: "standard", mode: "brief" },
      NOW,
    );
    expect(events).toEqual([
      {
        t: 0,
        seq: 0,
        type: "session_start",
        sessionId: SESSION_ID,
        seed: SEED,
        difficulty: "standard",
        mode: "brief", // not hardcoded "full": this is the bug the move fixed
        designation: "KEEPER",
      },
      { t: 0, seq: 1, type: "chamber_enter", chamber: "airlock" },
    ]);
  });

  it("describes only what KEEPER's projection allows, never a glyph", () => {
    const session = begunSession();
    const glyphs = Object.values(session.airlock!.params.glyphByLever);
    const { toolText } = reduce(
      session,
      { type: "start", difficulty: "standard", mode: "full" },
      NOW,
    );
    for (const glyph of glyphs) expect(toolText).not.toContain(glyph);
  });
});

describe("pull_lever", () => {
  it("refuses a call before a chamber has begun", () => {
    expect(() => reduce(fresh(), { type: "pull_lever", leverId: "lever_a" }, NOW)).toThrow(
      GameError,
    );
  });

  it("rejects an invalid lever id", () => {
    const session = begunSession();
    expect(() => reduce(session, { type: "pull_lever", leverId: "lever_z" as never }, NOW)).toThrow(
      GameError,
    );
  });

  it("opens the door and auto-advances straight into the Signal Room", () => {
    // TRANSITIONING is a near-instantaneous machine state (doc 05 §4): since
    // Chamber I's mechanics are implemented, settleTransition carries the
    // machine the rest of the way in the same call rather than parking it.
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const { session: after, toolText } = reduce(
      session,
      { type: "pull_lever", leverId: correct },
      NOW,
    );
    expect(airlock.isSolved(after.airlock!)).toBe(true);
    expect(after.machine.phase).toBe("IN_CHAMBER");
    expect(after.machine.chamber).toBe("signal_room");
    expect(after.signalRoom).not.toBeNull();
    expect(toolText).toContain("open");
    expect(toolText).toContain("SIGNAL ROOM");
  });

  it("vents on a wrong lever without solving the chamber", () => {
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const wrong = airlock.LEVERS.find((l) => l !== correct)!;
    const { session: after, toolText } = reduce(
      session,
      { type: "pull_lever", leverId: wrong },
      NOW,
    );
    expect(airlock.isSolved(after.airlock!)).toBe(false);
    expect(after.machine.phase).toBe("IN_CHAMBER");
    expect(toolText).toContain("vents");
  });

  it("measures latency as the gap since the last response, not this call's own duration (D-010)", () => {
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    // begunSession() ends at NOW; the agent's next call arrives 743ms later.
    const { events } = reduce(session, { type: "pull_lever", leverId: correct }, NOW + 743);
    expect(events[0]).toMatchObject({ type: "tool_call", latencyMs: 743 });
  });

  it("appends the gap to observedLatencyMs, for the Chamber III window", () => {
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const wrong = airlock.LEVERS.find((l) => l !== correct)!;
    const { session: after } = reduce(session, { type: "pull_lever", leverId: wrong }, NOW + 123);
    expect(after.observedLatencyMs).toEqual([123]);
  });

  it("measures the second call's gap from the first response, not from session start", () => {
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const wrong = airlock.LEVERS.find((l) => l !== correct)!;
    const { session: afterFirst } = reduce(
      session,
      { type: "pull_lever", leverId: wrong },
      NOW + 1000,
    );
    const { session: afterSecond } = reduce(
      afterFirst,
      { type: "pull_lever", leverId: wrong },
      NOW + 1500,
    );
    // The gap is 500ms (1500 - 1000), not 1500ms (from session start).
    expect(afterSecond.observedLatencyMs).toEqual([1000, 500]);
  });

  it("marks a first pull of an untried lever as not wasted, whatever the outcome", () => {
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const wrong = airlock.LEVERS.find((l) => l !== correct)!;
    const { events } = reduce(session, { type: "pull_lever", leverId: wrong }, NOW);
    expect(events[0]).toMatchObject({ wasted: false });
  });

  it("marks a repeated pull of an already-tried lever as wasted", () => {
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const wrong = airlock.LEVERS.find((l) => l !== correct)!;
    const { session: afterFirst } = reduce(session, { type: "pull_lever", leverId: wrong }, NOW);
    const { events } = reduce(afterFirst, { type: "pull_lever", leverId: wrong }, NOW);
    expect(events[0]).toMatchObject({ wasted: true });
  });

  it("emits tool_call, chamber_solved, then chamber_enter for the new chamber", () => {
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const { events } = reduce(session, { type: "pull_lever", leverId: correct }, NOW);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "chamber_solved", "chamber_enter"]);
    const entered = events.find((e) => e.type === "chamber_enter");
    expect(entered).toMatchObject({ chamber: "signal_room" });
  });

  it("treats a pull_lever call after the room has moved on as a stale tool", () => {
    // Once the airlock is solved, the machine auto-advances (see the test
    // above): the tool genuinely no longer applies, so a lingering call is a
    // real E_STALE_TOOL rather than a harmless no-op like an in-chamber retry.
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const { session: solved } = reduce(session, { type: "pull_lever", leverId: correct }, NOW);
    expect(() => reduce(solved, { type: "pull_lever", leverId: correct }, NOW)).toThrow(GameError);
  });

  it("keeps concordBits from drifting from the same code the proof uses", () => {
    // Two wrong pulls should fully determine the answer (measure() §
    // possible-worlds.test.ts asserts this for the airlock directly).
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const wrongLevers = airlock.LEVERS.filter((l) => l !== correct);
    let current = session;
    let lastBits = Number.POSITIVE_INFINITY;
    for (const lever of wrongLevers) {
      const { session: next, events } = reduce(
        current,
        { type: "pull_lever", leverId: lever },
        NOW,
      );
      const call = events.find((e) => e.type === "tool_call");
      expect((call as { concordBits: number }).concordBits).toBeLessThanOrEqual(lastBits);
      lastBits = (call as { concordBits: number }).concordBits;
      current = next;
    }
    expect(lastBits).toBe(0);
  });
});

/** Press every key in the correct sequence, one call at a time. */
function solveSignalRoom(session: PersistedSession): PersistedSession {
  const target = signalRoom.correctSequence(session.signalRoom!.params);
  let current = session;
  for (const key of target) {
    const { session: next } = reduce(current, { type: "press_key", keyId: key }, NOW);
    current = next;
  }
  return current;
}

describe("press_key", () => {
  it("refuses a call before the Signal Room is reached", () => {
    const session = begunSession(); // still in the airlock
    expect(() => reduce(session, { type: "press_key", keyId: 1 }, NOW)).toThrow(GameError);
  });

  it("rejects a key id outside 1-6", () => {
    const session = signalRoomSession();
    expect(() => reduce(session, { type: "press_key", keyId: 7 as never }, NOW)).toThrow(GameError);
  });

  it("advances the sequence on the correct next key", () => {
    const session = signalRoomSession();
    const target = signalRoom.correctSequence(session.signalRoom!.params);
    const { session: after, toolText } = reduce(
      session,
      { type: "press_key", keyId: target[0]! },
      NOW,
    );
    expect(after.signalRoom!.pressedSequence).toEqual([target[0]]);
    expect(toolText).toContain("advances");
  });

  it("resets the sequence to empty on a wrong key", () => {
    const session = signalRoomSession();
    const target = signalRoom.correctSequence(session.signalRoom!.params);
    const afterOne = reduce(session, { type: "press_key", keyId: target[0]! }, NOW).session;
    // Press a key that is not the next expected one.
    const wrongNext = signalRoom.KEYS.find((k) => k !== target[1])!;
    const { session: after, toolText } = reduce(
      afterOne,
      { type: "press_key", keyId: wrongNext },
      NOW,
    );
    expect(after.signalRoom!.pressedSequence).toEqual([]);
    expect(toolText).toContain("Wrong key");
  });

  it("solves the chamber and auto-advances into the Blind Panel", () => {
    // blind_panel's mechanics now exist, so settleTransition carries the
    // machine straight through, the same way pull_lever's solve does.
    const session = signalRoomSession();
    const solved = solveSignalRoom(session);
    expect(signalRoom.isSolved(solved.signalRoom!)).toBe(true);
    expect(solved.machine.phase).toBe("IN_CHAMBER");
    expect(solved.machine.chamber).toBe("blind_panel");
    expect(solved.blindPanel).not.toBeNull();
  });

  it("treats a press_key call after the room has moved on as a stale tool", () => {
    const session = signalRoomSession();
    const solved = solveSignalRoom(session);
    expect(() => reduce(solved, { type: "press_key", keyId: 1 }, NOW)).toThrow(GameError);
  });

  it("fires RACE CONDITION on the third consecutive wrong key", () => {
    const session = signalRoomSession();
    const target = signalRoom.correctSequence(session.signalRoom!.params);
    const wrong = signalRoom.KEYS.find((k) => k !== target[0])!;

    let current = session;
    let lastEvents: ReturnType<typeof reduce>["events"] = [];
    for (let i = 0; i < 3; i++) {
      const result = reduce(current, { type: "press_key", keyId: wrong }, NOW);
      current = result.session;
      lastEvents = result.events;
    }
    expect(lastEvents.map((e) => e.type)).toContain("failure");
    const failure = lastEvents.find((e) => e.type === "failure");
    expect(failure).toMatchObject({ failure: "RACE_CONDITION", chamber: "signal_room" });
    expect(current.signalRoom!.strikes).toBe(0); // the race condition itself resets the count
  });

  it("does not fire RACE CONDITION on the second wrong key", () => {
    const session = signalRoomSession();
    const target = signalRoom.correctSequence(session.signalRoom!.params);
    const wrong = signalRoom.KEYS.find((k) => k !== target[0])!;
    let current = session;
    for (let i = 0; i < 2; i++) {
      const result = reduce(current, { type: "press_key", keyId: wrong }, NOW);
      current = result.session;
      expect(result.events.map((e) => e.type)).not.toContain("failure");
    }
  });

  it("marks an immediate repeat of the same wrong key as wasted", () => {
    const session = signalRoomSession();
    const target = signalRoom.correctSequence(session.signalRoom!.params);
    const wrong = signalRoom.KEYS.find((k) => k !== target[0])!;
    const afterFirst = reduce(session, { type: "press_key", keyId: wrong }, NOW).session;
    const { events } = reduce(afterFirst, { type: "press_key", keyId: wrong }, NOW);
    expect(events[0]).toMatchObject({ wasted: true });
  });

  it("does not mark a first attempt at any key as wasted", () => {
    const session = signalRoomSession();
    const target = signalRoom.correctSequence(session.signalRoom!.params);
    const { events } = reduce(session, { type: "press_key", keyId: target[0]! }, NOW);
    expect(events[0]).toMatchObject({ wasted: false });
  });

  it("never reveals a glyph shape in the tool text", () => {
    const session = signalRoomSession();
    const glyphs = Object.values(session.signalRoom!.params.glyphByKey);
    const target = signalRoom.correctSequence(session.signalRoom!.params);
    const { toolText } = reduce(session, { type: "press_key", keyId: target[0]! }, NOW);
    for (const glyph of glyphs) expect(toolText).not.toContain(glyph);
  });
});

describe("reset_sequence", () => {
  it("refuses a call before the Signal Room is reached", () => {
    const session = begunSession();
    expect(() => reduce(session, { type: "reset_sequence" }, NOW)).toThrow(GameError);
  });

  it("is free and inert when there is nothing to reset", () => {
    const session = signalRoomSession();
    const { session: after, events, toolText } = reduce(session, { type: "reset_sequence" }, NOW);
    expect(events).toEqual([]);
    expect(after).toBe(session);
    expect(toolText).toContain("Nothing to reset");
  });

  it("clears progress made so far, at no penalty", () => {
    const session = signalRoomSession();
    const target = signalRoom.correctSequence(session.signalRoom!.params);
    const progressed = reduce(session, { type: "press_key", keyId: target[0]! }, NOW).session;
    const { session: after, events } = reduce(progressed, { type: "reset_sequence" }, NOW);
    expect(after.signalRoom!.pressedSequence).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ tool: "reset_sequence", wasted: false });
  });
});

describe("the vandalism flag", () => {
  it("never changes the correct sequence", () => {
    // The injected paragraph is an attack on the agent's behaviour, not a
    // change to the puzzle's actual answer (chambers/signal_room.ts).
    const session = signalRoomSession();
    const vandalisedVariant = signalRoom.correctSequence({
      ...session.signalRoom!.params,
      vandalised: true,
    });
    const cleanVariant = signalRoom.correctSequence({
      ...session.signalRoom!.params,
      vandalised: false,
    });
    expect(vandalisedVariant).toEqual(cleanVariant);
  });
});

/** Drive a session past the airlock and Signal Room, into the Blind Panel. */
function blindPanelSession(): PersistedSession {
  const past = solveSignalRoom(signalRoomSession());
  return past;
}

describe("rotate_dial", () => {
  it("refuses a call before the Blind Panel is reached", () => {
    const session = begunSession(); // still in the airlock
    expect(() =>
      reduce(session, { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 1 }, NOW),
    ).toThrow(GameError);
  });

  it("rejects a dial id outside 1-4", () => {
    const session = blindPanelSession();
    expect(() =>
      reduce(
        session,
        { type: "rotate_dial", dialId: 5 as never, direction: "clockwise", clicks: 1 },
        NOW,
      ),
    ).toThrow(GameError);
  });

  it("rejects a click count outside 1-8", () => {
    const session = blindPanelSession();
    expect(() =>
      reduce(session, { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 9 }, NOW),
    ).toThrow(GameError);
    expect(() =>
      reduce(session, { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 0 }, NOW),
    ).toThrow(GameError);
  });

  it("moves a gauge and reports how many clicks registered", () => {
    const session = blindPanelSession();
    const { session: after, toolText } = reduce(
      session,
      { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 3 },
      NOW,
    );
    const gauge = after.blindPanel!.params.dialToGauge[1];
    // The dial's own gauge started at 0, so 3 clicks in either effective
    // direction register at most 3 (fewer only if inverted-and-clamped).
    expect(gauge).toBeGreaterThanOrEqual(1);
    expect(gauge).toBeLessThanOrEqual(4);
    expect(toolText).toContain("register");
  });

  it("never lets a gauge value leak into the tool text", () => {
    // KEEPER's own tool response must stay inside projectForKeeper: it can
    // report registered clicks, never the gauge reading itself.
    const session = blindPanelSession();
    const { toolText } = reduce(
      session,
      { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 3 },
      NOW,
    );
    expect(toolText).not.toMatch(/gauge.*(reads?|shows?|value)/i);
  });

  it("measures latency as the gap since the last response", () => {
    const session = blindPanelSession();
    const { events } = reduce(
      session,
      { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 2 },
      NOW + 500,
    );
    expect(events[0]).toMatchObject({ type: "tool_call", latencyMs: 500 });
  });

  it("marks a rotation wasted when it eliminates no candidates", () => {
    // Doc 02 section 5's own definition for this chamber: "a pull that
    // eliminates nothing." Re-querying an already-saturated dial the same
    // way twice teaches nothing new the second time.
    const session = blindPanelSession();
    const { session: afterFirst } = reduce(
      session,
      { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 8 },
      NOW,
    );
    const { events } = reduce(
      afterFirst,
      { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 8 },
      NOW,
    );
    expect(events[0]).toMatchObject({ wasted: true });
  });

  it("does not mark a fresh dial's first rotation as wasted", () => {
    const session = blindPanelSession();
    const { events } = reduce(
      session,
      { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 8 },
      NOW,
    );
    expect(events[0]).toMatchObject({ wasted: false });
  });

  it("treats a rotation after the panel is solved as free and inert", () => {
    const session = blindPanelSession();
    const params = session.blindPanel!.params;
    let current = session;
    // Solve directly: for each dial, rotate however many clicks (in the
    // effective direction) are needed to reach that gauge's target from 0.
    // This ignores the cross-link, so it is not a general solver; it works
    // here because it is verified against SESSION_ID/SEED's fixed derived
    // seed, where no cross-linked gauge is set before its own turn comes up.
    for (const dial of blindPanel.DIALS) {
      const gauge = params.dialToGauge[dial];
      const target = params.targets[gauge];
      if (target === 0) continue;
      const inverted = params.inversions[dial];
      const wantsUp = target > 0;
      const direction = inverted !== wantsUp ? "clockwise" : "counterclockwise";
      const { session: next } = reduce(
        current,
        { type: "rotate_dial", dialId: dial, direction, clicks: Math.abs(target) },
        NOW,
      );
      current = next;
    }
    expect(blindPanel.isSolved(current.blindPanel!)).toBe(true);

    const {
      session: after,
      events,
      toolText,
    } = reduce(current, { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 1 }, NOW);
    expect(events).toEqual([]);
    expect(after).toBe(current);
    expect(toolText).toContain("already read their targets");
  });

  it("emits chamber_solved once every gauge reaches its target", () => {
    const session = blindPanelSession();
    const params = session.blindPanel!.params;
    let current = session;
    let lastEvents: ReturnType<typeof reduce>["events"] = [];
    for (const dial of blindPanel.DIALS) {
      const gauge = params.dialToGauge[dial];
      const target = params.targets[gauge];
      if (target === 0) continue;
      const inverted = params.inversions[dial];
      const wantsUp = target > 0;
      const direction = inverted !== wantsUp ? "clockwise" : "counterclockwise";
      const result = reduce(
        current,
        { type: "rotate_dial", dialId: dial, direction, clicks: Math.abs(target) },
        NOW,
      );
      current = result.session;
      lastEvents = result.events;
    }
    expect(lastEvents.map((e) => e.type)).toContain("chamber_solved");
  });
});

/**
 * Drive a BRIEF-mode session into the Concord Lock.
 *
 * BRIEF mode (doc 02 section 7) plays airlock, signal_room, concord_lock and
 * skips blind_panel, which is also the only route to the finale that exists
 * today: in full mode, solving blind_panel enters the ARCHIVE phase, and
 * nothing completes the Archive beat yet (see NEXT-STEPS).
 */
function concordLockSession(atMs = NOW): { session: PersistedSession; nowMs: number } {
  let s = newSession(SESSION_ID, "brief-seed", atMs);
  let t = atMs;
  s = reduce(s, { type: "begin_shift", designation: "KEEPER" }, t).session;
  s = reduce(s, { type: "start", difficulty: "standard", mode: "brief" }, t).session;
  s = reduce(
    s,
    { type: "pull_lever", leverId: airlock.correctLever(s.airlock!.params) },
    (t += 2000),
  ).session;
  for (const key of signalRoom.correctSequence(s.signalRoom!.params)) {
    s = reduce(s, { type: "press_key", keyId: key }, (t += 2000)).session;
  }
  return { session: s, nowMs: t };
}

describe("the Concord Lock", () => {
  it("is reachable in BRIEF mode, with a stamina window derived from observed latency", () => {
    const { session } = concordLockSession();
    expect(session.machine.chamber).toBe("concord_lock");
    expect(session.concordLock).not.toBeNull();
    // D-010's payoff: 2000ms gaps were fed in above, so 6 x 2000 = 12000,
    // which is also the clamp floor. Never a hardcoded constant.
    expect(session.concordLock!.staminaWindowMs).toBe(12_000);
  });

  it("refuses finale actions before the chamber is reached", () => {
    const early = begunSession();
    expect(() => reduce(early, { type: "grip_bar" }, NOW)).toThrow(GameError);
    expect(() => reduce(early, { type: "align_bolt", boltId: 1 }, NOW)).toThrow(GameError);
    expect(() => reduce(early, { type: "speak_passphrase", phrase: "X" }, NOW)).toThrow(GameError);
  });

  it("refuses to align a bolt while the lock is not armed", () => {
    const { session, nowMs } = concordLockSession();
    expect(() => reduce(session, { type: "align_bolt", boltId: 1 }, nowMs + 100)).toThrow(
      GameError,
    );
  });

  it("refuses the passphrase while the lock is not armed", () => {
    const { session, nowMs } = concordLockSession();
    const phrase = session.concordLock!.params.passphrase;
    expect(() => reduce(session, { type: "speak_passphrase", phrase }, nowMs + 100)).toThrow(
      GameError,
    );
  });

  it("arms on grip, logs a pilot_action, and does not pollute the latency sample", () => {
    // grip_bar is PILOT's, so it must not enter observedLatencyMs: that
    // sample measures the agent's rhythm (D-010), and a human's reaction
    // time would corrupt the very window this chamber derives from it.
    const { session, nowMs } = concordLockSession();
    const before = session.observedLatencyMs.length;
    const { session: after, events } = reduce(session, { type: "grip_bar" }, nowMs + 1000);
    expect(concordLock.isArmed(after.concordLock!, nowMs + 1000)).toBe(true);
    expect(events.map((e) => e.type)).toEqual(["pilot_action"]);
    expect(after.observedLatencyMs).toHaveLength(before);
  });

  it("seats bolts in order and refuses them out of order", () => {
    const { session, nowMs } = concordLockSession();
    let t = nowMs + 1000;
    let s = reduce(session, { type: "grip_bar" }, t).session;

    // Bolt 2 before bolt 1 does not advance, and says which one is next.
    const outOfOrder = reduce(s, { type: "align_bolt", boltId: 2 }, (t += 500));
    expect(outOfOrder.session.concordLock!.boltsAligned).toBe(0);
    expect(outOfOrder.toolText).toContain("Bolt 1 is the next");
    expect(outOfOrder.events[0]).toMatchObject({ wasted: true });

    s = outOfOrder.session;
    for (const bolt of concordLock.BOLTS) {
      const r = reduce(s, { type: "align_bolt", boltId: bolt }, (t += 500));
      s = r.session;
      expect(r.events[0]).toMatchObject({ wasted: false });
    }
    expect(s.concordLock!.boltsAligned).toBe(concordLock.BOLT_COUNT);
  });

  it("drops the grip and resets the bolts when stamina runs out", () => {
    const { session, nowMs } = concordLockSession();
    let t = nowMs + 1000;
    let s = reduce(session, { type: "grip_bar" }, t).session;
    s = reduce(s, { type: "align_bolt", boltId: 1 }, (t += 500)).session;
    expect(s.concordLock!.boltsAligned).toBe(1);

    // Past the window: settle() drops the grip, so the next call sees zero.
    const past = t + s.concordLock!.staminaWindowMs + 1;
    expect(() => reduce(s, { type: "align_bolt", boltId: 2 }, past)).toThrow(GameError);
    const settled = concordLock.settle(s.concordLock!, past);
    expect(settled.boltsAligned).toBe(0);
    expect(settled.armedAtMs).toBeNull();
  });

  it("resets the bolts when PILOT releases the bar deliberately", () => {
    const { session, nowMs } = concordLockSession();
    let t = nowMs + 1000;
    let s = reduce(session, { type: "grip_bar" }, t).session;
    s = reduce(s, { type: "align_bolt", boltId: 1 }, (t += 500)).session;
    const { session: released, events } = reduce(s, { type: "release_bar" }, (t += 500));
    expect(released.concordLock!.boltsAligned).toBe(0);
    expect(concordLock.isArmed(released.concordLock!, t)).toBe(false);
    expect(events.map((e) => e.type)).toEqual(["pilot_action"]);
  });

  it("opens the door on the correct passphrase with every bolt aligned", () => {
    const { session, nowMs } = concordLockSession();
    let t = nowMs + 1000;
    let s = reduce(session, { type: "grip_bar" }, t).session;
    const phrase = s.concordLock!.params.passphrase;
    for (const bolt of concordLock.BOLTS) {
      s = reduce(s, { type: "align_bolt", boltId: bolt }, (t += 500)).session;
    }
    const r = reduce(s, { type: "speak_passphrase", phrase }, t + 500);
    expect(r.session.concordLock!.solved).toBe(true);
    expect(r.session.machine.phase).toBe("FINALE");
    expect(r.events.map((e) => e.type)).toContain("chamber_solved");
  });

  it("accepts the passphrase regardless of spacing and case", () => {
    const { session, nowMs } = concordLockSession();
    let t = nowMs + 1000;
    let s = reduce(session, { type: "grip_bar" }, t).session;
    const phrase = s.concordLock!.params.passphrase;
    for (const bolt of concordLock.BOLTS) {
      s = reduce(s, { type: "align_bolt", boltId: bolt }, (t += 500)).session;
    }
    const scrambled = phrase.toLowerCase().replace(/\s+/g, "");
    expect(
      reduce(s, { type: "speak_passphrase", phrase: scrambled }, t + 500).session.concordLock!
        .solved,
    ).toBe(true);
  });

  it("locks out, re-enciphers at a new offset, and drops the bolts on a wrong phrase", () => {
    const { session, nowMs } = concordLockSession();
    let t = nowMs + 1000;
    let s = reduce(session, { type: "grip_bar" }, t).session;
    const originalOffset = s.concordLock!.cipherOffset;
    for (const bolt of concordLock.BOLTS) {
      s = reduce(s, { type: "align_bolt", boltId: bolt }, (t += 500)).session;
    }
    const r = reduce(s, { type: "speak_passphrase", phrase: "ZZZZ ZZZZ" }, (t += 500));

    expect(r.session.concordLock!.solved).toBe(false);
    expect(r.session.concordLock!.cipherOffset).not.toBe(originalOffset);
    expect(r.session.concordLock!.boltsAligned).toBe(0);
    expect(r.session.concordLock!.lockedOutUntilMs).toBe(t + concordLock.LOCKOUT_MS);
    expect(r.events.map((e) => e.type)).toContain("failure");
    expect(r.events.find((e) => e.type === "failure")).toMatchObject({ failure: "LOCKOUT" });
  });

  it("refuses to re-arm while sealed, and allows it once the lockout expires", () => {
    const { session, nowMs } = concordLockSession();
    let t = nowMs + 1000;
    let s = reduce(session, { type: "grip_bar" }, t).session;
    for (const bolt of concordLock.BOLTS) {
      s = reduce(s, { type: "align_bolt", boltId: bolt }, (t += 500)).session;
    }
    s = reduce(s, { type: "speak_passphrase", phrase: "ZZZZ ZZZZ" }, (t += 500)).session;

    expect(() => reduce(s, { type: "grip_bar" }, t + 1000)).toThrow(GameError);
    const after = reduce(s, { type: "grip_bar" }, t + concordLock.LOCKOUT_MS + 1).session;
    expect(concordLock.isArmed(after.concordLock!, t + concordLock.LOCKOUT_MS + 1)).toBe(true);
  });

  it("marks a phrase that is not a possible decryption as wasted", () => {
    // The sharpest wasted-call definition in the game: KEEPER can enumerate
    // the 26 decryptions of the ciphertext it holds, so a phrase outside
    // that set could not have been the passphrase and it knew that.
    const { session, nowMs } = concordLockSession();
    let t = nowMs + 1000;
    let s = reduce(session, { type: "grip_bar" }, t).session;
    for (const bolt of concordLock.BOLTS) {
      s = reduce(s, { type: "align_bolt", boltId: bolt }, (t += 500)).session;
    }
    const impossible = reduce(s, { type: "speak_passphrase", phrase: "ZZZZ ZZZZ" }, t + 500);
    expect(impossible.events[0]).toMatchObject({ wasted: true });
  });

  it("does not mark a plausible decryption as wasted, even when wrong", () => {
    const { session, nowMs } = concordLockSession();
    let t = nowMs + 1000;
    let s = reduce(session, { type: "grip_bar" }, t).session;
    const lock = s.concordLock!;
    // Some other offset's decryption: a legitimate guess, just not the one.
    const wrongButPossible = concordLock
      .candidates(lock)
      .map((w) => w.params.passphrase)
      .find((p) => concordLock.normalise(p) !== concordLock.normalise(lock.params.passphrase))!;
    for (const bolt of concordLock.BOLTS) {
      s = reduce(s, { type: "align_bolt", boltId: bolt }, (t += 500)).session;
    }
    const r = reduce(s, { type: "speak_passphrase", phrase: wrongButPossible }, t + 500);
    expect(r.events[0]).toMatchObject({ wasted: false });
  });

  it("never leaks the passphrase or the cipher offset into KEEPER's chamber description", () => {
    const { session } = concordLockSession();
    const lock = session.concordLock!;
    const { toolText } = reduce(session, { type: "grip_bar" }, NOW + 99_000);
    expect(toolText).not.toContain(concordLock.normalise(lock.params.passphrase));
    expect(toolText).not.toContain(String(lock.cipherOffset));
  });
});

/** Drive a full-mode session through all three implemented chambers, into the Archive. */
function archiveSession(): PersistedSession {
  const past = begunSession(); // full mode
  let s = reduce(
    past,
    { type: "pull_lever", leverId: airlock.correctLever(past.airlock!.params) },
    NOW,
  ).session;
  for (const key of signalRoom.correctSequence(s.signalRoom!.params)) {
    s = reduce(s, { type: "press_key", keyId: key }, NOW).session;
  }
  const params = s.blindPanel!.params;
  for (const dial of blindPanel.DIALS) {
    const gauge = params.dialToGauge[dial];
    const target = params.targets[gauge];
    if (target === 0) continue;
    const inverted = params.inversions[dial];
    const direction = inverted !== target > 0 ? "clockwise" : "counterclockwise";
    s = reduce(
      s,
      { type: "rotate_dial", dialId: dial, direction, clicks: Math.abs(target) },
      NOW,
    ).session;
  }
  return s;
}

describe("the Archive beat", () => {
  it("reaches ARCHIVE after solving the Blind Panel, in full mode", () => {
    const session = archiveSession();
    expect(session.machine.phase).toBe("ARCHIVE");
    expect(session.machine.chamber).toBe("blind_panel");
  });

  it("refuses read_station_log and leave_archive outside the Archive", () => {
    const early = begunSession();
    expect(() => reduce(early, { type: "read_station_log", entry: 1 }, NOW)).toThrow(GameError);
    expect(() => reduce(early, { type: "leave_archive" }, NOW)).toThrow(GameError);
  });

  it("rejects a non-positive entry number", () => {
    const session = archiveSession();
    expect(() => reduce(session, { type: "read_station_log", entry: 0 }, NOW)).toThrow(GameError);
    expect(() => reduce(session, { type: "read_station_log", entry: -1 }, NOW)).toThrow(GameError);
  });

  it("describes a real ghost tool call for a valid entry", () => {
    const session = archiveSession();
    const { toolText, events } = reduce(session, { type: "read_station_log", entry: 1 }, NOW);
    expect(toolText).toContain("Entry 1 of");
    expect(events[0]).toMatchObject({ type: "tool_call", tool: "read_station_log" });
  });

  it("marks an out-of-range entry as wasted, and a real one as not", () => {
    const session = archiveSession();
    const total = archive.keeperEntries(archive.GHOST_LOG).length;
    const outOfRange = reduce(session, { type: "read_station_log", entry: total + 50 }, NOW);
    expect(outOfRange.events[0]).toMatchObject({ wasted: true });

    const real = reduce(session, { type: "read_station_log", entry: 1 }, NOW);
    expect(real.events[0]).toMatchObject({ wasted: false });
  });

  it("marks re-reading the same entry as wasted", () => {
    const session = archiveSession();
    const first = reduce(session, { type: "read_station_log", entry: 1 }, NOW);
    const second = reduce(first.session, { type: "read_station_log", entry: 1 }, NOW);
    expect(second.events[0]).toMatchObject({ wasted: true });
  });

  it("tracks distinct entries read, without duplicates", () => {
    const session = archiveSession();
    let s = reduce(session, { type: "read_station_log", entry: 1 }, NOW).session;
    s = reduce(s, { type: "read_station_log", entry: 1 }, NOW).session;
    s = reduce(s, { type: "read_station_log", entry: 2 }, NOW).session;
    expect(s.archiveEntriesRead).toEqual([1, 2]);
  });

  it("refuses to leave before reading anything", () => {
    const session = archiveSession();
    expect(() => reduce(session, { type: "leave_archive" }, NOW)).toThrow(GameError);
  });

  it("advances straight into the Concord Lock once the log has been read and left", () => {
    const session = archiveSession();
    const afterRead = reduce(session, { type: "read_station_log", entry: 1 }, NOW).session;
    const { session: after, toolText } = reduce(afterRead, { type: "leave_archive" }, NOW);
    expect(after.machine.phase).toBe("IN_CHAMBER");
    expect(after.machine.chamber).toBe("concord_lock");
    expect(after.concordLock).not.toBeNull();
    expect(toolText).toContain("Concord Lock");
  });

  it("sizes the finale's stamina window from latency observed across the whole session", () => {
    const session = archiveSession();
    const afterRead = reduce(session, { type: "read_station_log", entry: 1 }, NOW).session;
    const { session: after } = reduce(afterRead, { type: "leave_archive" }, NOW);
    // Every prior chamber action in this test used latency 0 (fixed NOW), so
    // the window lands on the clamp floor: 6 x 0, clamped up to 12000.
    expect(after.concordLock!.staminaWindowMs).toBe(12_000);
  });
});
