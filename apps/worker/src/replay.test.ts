/**
 * The replay projection, and the one thing it must never do.
 *
 * These sit beside `archive.test.ts` in intent: both assert that a surface
 * built out of a session log carries one party's half and not the other's, and
 * both assert it on the projection rather than trusting the caller.
 */

import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@semaphore/protocol";
import { projectReplay } from "./replay.js";

/** A small but complete session, with one of every event type in it. */
function log(): SessionEvent[] {
  return [
    {
      t: 0,
      seq: 0,
      type: "session_start",
      sessionId: "s-1",
      seed: "seed-1",
      difficulty: "standard",
      mode: "full",
      designation: "WREN",
    },
    { t: 0, seq: 1, type: "chamber_enter", chamber: "airlock" },
    {
      t: 1200,
      seq: 2,
      type: "state_delta",
      path: "blindPanel.params.linkage",
      from: null,
      // The permutation is the whole of Chamber II's secret. If this string
      // can be found anywhere in the projection, the projection is broken.
      to: { "1": { gauge: "4", step: -1 } },
    },
    {
      t: 2000,
      seq: 3,
      type: "tool_call",
      tool: "pull_lever",
      input: { lever_id: "lever_c" },
      result: "ok",
      latencyMs: 900,
      keeperViewHash: "abc123",
      concordBits: 1.58,
      wasted: false,
    },
    { t: 2100, seq: 4, type: "audible", cue: "detent", count: 3 },
    { t: 2200, seq: 5, type: "pilot_action", action: "move", target: "concord_lock_door" },
    { t: 2400, seq: 6, type: "tool_cancel", tool: "press_key", elapsedMs: 40 },
    { t: 2500, seq: 7, type: "chamber_solved", chamber: "airlock" },
    {
      t: 3000,
      seq: 8,
      type: "session_end",
      outcome: "escaped",
      chambersCleared: 4,
      medianLatencyMs: 900,
      staminaWindowMs: 2700,
    },
  ];
}

describe("projectReplay", () => {
  it("carries both tracks and the trace between them", () => {
    const replay = projectReplay(log());
    expect(replay).not.toBeNull();
    expect(replay!.designation).toBe("WREN");
    expect(replay!.outcome).toBe("escaped");
    expect(replay!.durationMs).toBe(3000);
    expect(replay!.calls).toHaveLength(1);
    expect(replay!.calls[0]!.tool).toBe("pull_lever");
    // The CONCORD trace is the viewer's third row and it is copied, not
    // recomputed: a replay that disagreed with the meter the pair watched
    // would be a different session.
    expect(replay!.calls[0]!.concordBits).toBe(1.58);
    expect(replay!.beats.map((beat) => beat.kind)).toEqual(["audible", "action"]);
    expect(replay!.chambers.map((c) => c.kind)).toEqual(["enter", "solved"]);
  });

  it("never lets a HIDDEN field out, even though the session is over", () => {
    // The argument for shipping the raw log is that the session has ended.
    // It is wrong: a seed is reproducible by construction (doc 05 section 9),
    // so a raw replay of seed `s` is a solution key for every future session
    // on seed `s`, and a replay URL is meant to be shareable.
    const serialised = JSON.stringify(projectReplay(log()));
    expect(serialised).not.toContain("linkage");
    expect(serialised).not.toContain("state_delta");
    expect(serialised).not.toContain("gauge");
  });

  it("does not blame KEEPER for a tool the registry took away", () => {
    // A `tool_cancel` is a transition, not an action. Drawing it on the cyan
    // track would read as an agent abandoning a call it never abandoned.
    const replay = projectReplay(log());
    expect(replay!.calls.some((call) => call.tool === "press_key")).toBe(false);
  });

  it("returns null for a log with no beginning", () => {
    expect(projectReplay([])).toBeNull();
    expect(projectReplay(log().filter((e) => e.type !== "session_start"))).toBeNull();
  });

  it("still describes a session that stopped without an ending", () => {
    // A session that deadlocked or was abandoned never wrote `session_end`.
    // The viewer still has to draw it rather than showing nothing.
    const replay = projectReplay(log().filter((e) => e.type !== "session_end"));
    expect(replay!.outcome).toBe("abandoned");
    expect(replay!.chambersCleared).toBe(1);
  });
});
