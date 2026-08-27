import { describe, expect, it } from "vitest";
import { GameError } from "@semaphore/protocol";
import * as airlock from "./chambers/airlock.js";
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

  it("opens the door on the correct lever, with matching narration", () => {
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const { session: after, toolText } = reduce(
      session,
      { type: "pull_lever", leverId: correct },
      NOW,
    );
    expect(airlock.isSolved(after.airlock!)).toBe(true);
    expect(after.machine.phase).toBe("TRANSITIONING");
    expect(toolText).toContain("open");
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

  it("emits a chamber_solved event only when the correct lever is pulled", () => {
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const { events } = reduce(session, { type: "pull_lever", leverId: correct }, NOW);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "chamber_solved"]);
  });

  it("treats a call after the door is open as free and inert", () => {
    const session = begunSession();
    const correct = airlock.correctLever(session.airlock!.params);
    const { session: solved } = reduce(session, { type: "pull_lever", leverId: correct }, NOW);
    const {
      session: after,
      events,
      toolText,
    } = reduce(solved, { type: "pull_lever", leverId: correct }, NOW);
    expect(events).toEqual([]);
    expect(after).toBe(solved);
    expect(toolText).toContain("already open");
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
