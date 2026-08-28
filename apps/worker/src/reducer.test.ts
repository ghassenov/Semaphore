import { describe, expect, it } from "vitest";
import { GameError } from "@semaphore/protocol";
import * as airlock from "./chambers/airlock.js";
import * as signalRoom from "./chambers/signal_room.js";
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

  it("emits a session_start event carrying the seed and designation", () => {
    const { events } = reduce(fresh(), { type: "begin_shift", designation: "KEEPER" }, NOW);
    expect(events).toEqual([
      {
        t: 0,
        seq: 0,
        type: "session_start",
        sessionId: SESSION_ID,
        seed: SEED,
        difficulty: "standard",
        mode: "full",
        designation: "KEEPER",
      },
    ]);
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

  it("emits a chamber_enter event for the airlock", () => {
    const { session: afterBegin } = reduce(
      fresh(),
      { type: "begin_shift", designation: "KEEPER" },
      NOW,
    );
    const { events } = reduce(
      afterBegin,
      { type: "start", difficulty: "standard", mode: "full" },
      NOW,
    );
    expect(events).toEqual([{ t: 0, seq: 1, type: "chamber_enter", chamber: "airlock" }]);
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

  it("solves the chamber and auto-advances once every key lands in order", () => {
    const session = signalRoomSession();
    const solved = solveSignalRoom(session);
    // blind_panel is not implemented yet, so the machine stops here honestly
    // rather than fabricating a chamber that does not exist (see reducer.ts).
    expect(signalRoom.isSolved(solved.signalRoom!)).toBe(true);
    expect(solved.machine.phase).toBe("TRANSITIONING");
    expect(solved.machine.chamber).toBe("signal_room");
  });

  it("treats a press after the chamber is solved as free and inert", () => {
    const session = signalRoomSession();
    const solved = solveSignalRoom(session);
    const {
      session: after,
      events,
      toolText,
    } = reduce(solved, { type: "press_key", keyId: 1 }, NOW);
    expect(events).toEqual([]);
    expect(after).toBe(solved);
    expect(toolText).toContain("already settled");
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
