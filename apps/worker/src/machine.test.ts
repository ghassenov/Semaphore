import { describe, expect, it } from "vitest";
import { PHASES, type Phase } from "@semaphore/protocol";
import {
  IllegalTransitionError,
  INITIAL_STATE,
  preservesSeed,
  transition,
  type MachineEvent,
  type MachineState,
} from "./machine.js";

/** One representative legal event from a state, or null if none exists (ESCAPED). */
function anyLegalEvent(state: MachineState): MachineEvent | null {
  const candidates: MachineEvent[] = [
    { type: "BEGIN_SHIFT" },
    { type: "START", mode: "full" },
    { type: "INVALID_ACTION" },
    { type: "PENALTY_RESOLVED" },
    { type: "CHAMBER_SOLVED" },
    { type: "ARCHIVE_COMPLETE" },
    { type: "TRANSITION_COMPLETE" },
    { type: "DOOR_OPENED" },
    { type: "TIMER_EXPIRED" },
    { type: "RETRY" },
  ];
  for (const event of candidates) {
    try {
      transition(state, event);
      return event;
    } catch {
      continue;
    }
  }
  return null;
}

describe("the initial state", () => {
  it("starts at ENTRY with no chamber", () => {
    expect(INITIAL_STATE).toEqual({ phase: "ENTRY", chamber: null, mode: "full", retries: 0 });
  });
});

describe("illegal transitions", () => {
  it("throws IllegalTransitionError, naming the phase and event", () => {
    try {
      transition(INITIAL_STATE, { type: "DOOR_OPENED" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalTransitionError);
      expect((err as IllegalTransitionError).phase).toBe("ENTRY");
      expect((err as IllegalTransitionError).event).toBe("DOOR_OPENED");
    }
  });

  it("refuses every event from ESCAPED, which is terminal", () => {
    const escaped: MachineState = { phase: "ESCAPED", chamber: null, mode: "full", retries: 0 };
    expect(anyLegalEvent(escaped)).toBeNull();
  });

  it("refuses START before BEGIN_SHIFT", () => {
    expect(() => transition(INITIAL_STATE, { type: "START", mode: "full" })).toThrow(
      IllegalTransitionError,
    );
  });

  it("refuses a second BEGIN_SHIFT from LOBBY", () => {
    const lobby = transition(INITIAL_STATE, { type: "BEGIN_SHIFT" });
    expect(() => transition(lobby, { type: "BEGIN_SHIFT" })).toThrow(IllegalTransitionError);
  });
});

describe("no phase but ESCAPED is a dead end", () => {
  // "No path reaches a stuck state" (doc 05 §10): from every phase other than
  // the deliberate terminal one, at least one event must be legal.
  it("has a legal event from every non-terminal phase", () => {
    for (const phase of PHASES) {
      if (phase === "ESCAPED") continue;
      const state: MachineState = { phase, chamber: "airlock", mode: "full", retries: 0 };
      expect(anyLegalEvent(state)).not.toBeNull();
    }
  });
});

describe("the full-mode path from ENTRY to ESCAPED", () => {
  it("walks every chamber, hits the Archive after blind_panel, and reaches FINALE", () => {
    let state = INITIAL_STATE;
    const seen: Phase[] = [state.phase];

    const step = (event: MachineEvent) => {
      state = transition(state, event);
      seen.push(state.phase);
    };

    step({ type: "BEGIN_SHIFT" });
    step({ type: "START", mode: "full" });
    expect(state.chamber).toBe("airlock");

    step({ type: "CHAMBER_SOLVED" }); // airlock is not the archive trigger
    expect(state.phase).toBe("TRANSITIONING");
    step({ type: "TRANSITION_COMPLETE" });
    expect(state.chamber).toBe("signal_room");

    step({ type: "CHAMBER_SOLVED" });
    step({ type: "TRANSITION_COMPLETE" });
    expect(state.chamber).toBe("blind_panel");

    step({ type: "CHAMBER_SOLVED" }); // blind_panel IS the archive trigger
    expect(state.phase).toBe("ARCHIVE");
    step({ type: "ARCHIVE_COMPLETE" });
    expect(state.phase).toBe("TRANSITIONING");
    step({ type: "TRANSITION_COMPLETE" });
    expect(state.chamber).toBe("concord_lock");

    step({ type: "CHAMBER_SOLVED" });
    step({ type: "TRANSITION_COMPLETE" }); // no chamber remains
    expect(state.phase).toBe("FINALE");
    expect(state.chamber).toBeNull();

    step({ type: "DOOR_OPENED" });
    expect(state.phase).toBe("ESCAPED");

    expect(seen).toEqual([
      "ENTRY",
      "LOBBY",
      "IN_CHAMBER",
      "TRANSITIONING",
      "IN_CHAMBER",
      "TRANSITIONING",
      "IN_CHAMBER",
      "ARCHIVE",
      "TRANSITIONING",
      "IN_CHAMBER",
      "TRANSITIONING",
      "FINALE",
      "ESCAPED",
    ]);
  });
});

describe("BRIEF mode", () => {
  it("skips blind_panel entirely, and never visits the Archive", () => {
    let state = transition(INITIAL_STATE, { type: "BEGIN_SHIFT" });
    state = transition(state, { type: "START", mode: "brief" });
    expect(state.chamber).toBe("airlock");

    state = transition(state, { type: "CHAMBER_SOLVED" });
    state = transition(state, { type: "TRANSITION_COMPLETE" });
    expect(state.chamber).toBe("signal_room");

    state = transition(state, { type: "CHAMBER_SOLVED" });
    // In brief mode, signal_room is not the archive trigger (blind_panel is
    // not played at all), so this goes straight to TRANSITIONING.
    expect(state.phase).toBe("TRANSITIONING");
    state = transition(state, { type: "TRANSITION_COMPLETE" });
    expect(state.chamber).toBe("concord_lock");
  });
});

describe("penalties", () => {
  it("returns to IN_CHAMBER once a penalty resolves", () => {
    let state = transition(INITIAL_STATE, { type: "BEGIN_SHIFT" });
    state = transition(state, { type: "START", mode: "full" });
    state = transition(state, { type: "INVALID_ACTION" });
    expect(state.phase).toBe("PENALISED");
    state = transition(state, { type: "PENALTY_RESOLVED" });
    expect(state.phase).toBe("IN_CHAMBER");
    expect(state.chamber).toBe("airlock"); // unchanged by the penalty
  });
});

describe("DEADLOCK and retry", () => {
  it("reaches DEADLOCK from IN_CHAMBER and from PENALISED alike", () => {
    let state = transition(INITIAL_STATE, { type: "BEGIN_SHIFT" });
    state = transition(state, { type: "START", mode: "full" });
    expect(transition(state, { type: "TIMER_EXPIRED" }).phase).toBe("DEADLOCK");

    const penalised = transition(state, { type: "INVALID_ACTION" });
    expect(transition(penalised, { type: "TIMER_EXPIRED" }).phase).toBe("DEADLOCK");
  });

  it("keeps the same chamber across a retry", () => {
    let state = transition(INITIAL_STATE, { type: "BEGIN_SHIFT" });
    state = transition(state, { type: "START", mode: "full" });
    state = transition(state, { type: "TIMER_EXPIRED" });
    state = transition(state, { type: "RETRY" });
    expect(state.phase).toBe("IN_CHAMBER");
    expect(state.chamber).toBe("airlock");
  });

  it("increments retries each time, and preservesSeed is true for the first only", () => {
    let state = transition(INITIAL_STATE, { type: "BEGIN_SHIFT" });
    state = transition(state, { type: "START", mode: "full" });

    state = transition(transition(state, { type: "TIMER_EXPIRED" }), { type: "RETRY" });
    expect(state.retries).toBe(1);
    expect(preservesSeed(state)).toBe(true);

    state = transition(transition(state, { type: "TIMER_EXPIRED" }), { type: "RETRY" });
    expect(state.retries).toBe(2);
    // "The first failure teaches; the second resets" (doc 02 §7).
    expect(preservesSeed(state)).toBe(false);
  });

  it("resets retries to zero on advancing to a new chamber", () => {
    let state = transition(INITIAL_STATE, { type: "BEGIN_SHIFT" });
    state = transition(state, { type: "START", mode: "full" });
    state = transition(transition(state, { type: "TIMER_EXPIRED" }), { type: "RETRY" });
    expect(state.retries).toBe(1);

    state = transition(state, { type: "CHAMBER_SOLVED" });
    state = transition(state, { type: "TRANSITION_COMPLETE" });
    expect(state.chamber).toBe("signal_room");
    expect(state.retries).toBe(0);
  });
});

describe("purity", () => {
  it("never mutates the state object it is given", () => {
    const before = JSON.stringify(INITIAL_STATE);
    transition(INITIAL_STATE, { type: "BEGIN_SHIFT" });
    expect(JSON.stringify(INITIAL_STATE)).toBe(before);
  });

  it("is deterministic: the same state and event always produce the same result", () => {
    const a = transition(INITIAL_STATE, { type: "BEGIN_SHIFT" });
    const b = transition(INITIAL_STATE, { type: "BEGIN_SHIFT" });
    expect(a).toEqual(b);
  });
});
