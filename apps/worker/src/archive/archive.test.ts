/**
 * The two halves of the Archive, and the wall between them.
 *
 * `keeperEntries` and `pilotTrack` are two filters over one session log
 * (doc 02 section 4). The test that matters is not that either one works: it
 * is that neither can see the other's half, because that split is the beat's
 * whole mechanic and it is enforced by these two functions and nothing else.
 */

import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@semaphore/protocol";
import { GHOST_LOG, describeEntry, keeperEntries, pilotTrack } from "./index.js";

describe("pilotTrack", () => {
  it("carries nothing a tool call put in the log", () => {
    const track = pilotTrack(GHOST_LOG);
    expect(track).not.toBeNull();
    const rendered = JSON.stringify(track);
    // Every tool name, every argument value, and the two derived fields a
    // call carries. If any of them can be found anywhere in PILOT's half, the
    // monitor is showing KEEPER's half and there is nothing left to
    // reconstruct together.
    for (const call of keeperEntries(GHOST_LOG)) {
      expect(rendered, `tool ${call.tool}`).not.toContain(call.tool);
      expect(rendered).not.toContain(call.keeperViewHash);
      for (const value of Object.values(call.input)) {
        expect(rendered).not.toContain(`"${String(value)}"`);
      }
    }
  });

  it("keeps what a body in the room did, in order", () => {
    const track = pilotTrack(GHOST_LOG);
    // The fixture plays BRIEF: three rooms entered, two of them solved, and
    // one grip of the release bar that is never released.
    expect(track?.beats.filter((b) => b.kind === "enter").map((b) => b.chamber)).toEqual([
      "airlock",
      "signal_room",
      "concord_lock",
    ]);
    expect(track?.beats.filter((b) => b.action === "grip")).toHaveLength(1);
    expect(track?.beats.some((b) => b.action === "release")).toBe(false);
    expect(track?.beats.every((b, i, all) => i === 0 || b.t >= (all[i - 1]?.t ?? 0))).toBe(true);
  });

  it("reports a log that stops mid-attempt as stopping, not as a failure", () => {
    // Doc 02 section 4: "the log ends mid-call." There is no `session_end`
    // line in the fixture and none is invented here.
    expect(GHOST_LOG.some((e) => e.type === "session_end")).toBe(false);
    expect(pilotTrack(GHOST_LOG)?.outcome).toBe("cut");
  });

  it("runs to the last event of the log, not to the last thing PILOT did", () => {
    // The ghost's final stretch is all KEEPER's calls, with PILOT holding the
    // bar and nothing else happening. That silence is the beat; a replay that
    // stopped at the last `pilot_action` would cut it off.
    const track = pilotTrack(GHOST_LOG);
    expect(track?.durationMs).toBe(GHOST_LOG.at(-1)?.t);
    expect(track?.durationMs).toBeGreaterThan(track?.beats.at(-1)?.t ?? 0);
  });

  it("has nothing to play for a log with no session start", () => {
    expect(pilotTrack([])).toBeNull();
    const orphan: readonly SessionEvent[] = [
      { t: 0, seq: 0, type: "chamber_enter", chamber: "airlock" },
    ];
    expect(pilotTrack(orphan)).toBeNull();
  });
});

describe("keeperEntries", () => {
  it("carries nothing PILOT's body put in the log", () => {
    // The mirror of the first test above, and the reason it is here rather
    // than assumed: the two filters are edited together and a widened one
    // would otherwise fail only on the side somebody thought to check.
    const rendered = JSON.stringify(keeperEntries(GHOST_LOG));
    for (const beat of pilotTrack(GHOST_LOG)?.beats ?? []) {
      if (beat.target !== undefined) expect(rendered).not.toContain(beat.target);
    }
  });

  it("says how many entries there are when asked for one that is not there", () => {
    const total = keeperEntries(GHOST_LOG).length;
    expect(describeEntry(GHOST_LOG, total + 1)).toContain(String(total));
    expect(describeEntry(GHOST_LOG, 0)).toContain(String(total));
  });
});
