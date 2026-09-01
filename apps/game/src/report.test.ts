/**
 * The grade, and the one property that makes it evidence rather than decoration.
 *
 * Each mark is moved on its own axis and only that mark may move. A metric
 * that does not separate the thing it claims to separate is not evidence, and
 * two such metrics have already been built and deleted in this project
 * (`NEXT-STEPS.md`, the instruments section). The cheapest way to find out
 * that "precision" is quietly reading the clock is to change the clock.
 */

import { describe, expect, it } from "vitest";
import { CHAMBER_TIMER_MS } from "@semaphore/protocol";
import { ASSIST_TOOL, cellsOf, gradeShift, shareText, type Replay } from "./report.js";

/** Par for the two rooms every fixture below plays. */
const PAR = CHAMBER_TIMER_MS.airlock + CHAMBER_TIMER_MS.signal_room;

/** One KEEPER call. `wasted` is the only field the grade reads. */
function call(t: number, wasted = false, tool = "pull_lever"): Replay["calls"][number] {
  return { t, tool, result: "ok", latencyMs: 800, wasted, concordBits: 1.5 };
}

/**
 * A two-chamber session, cleared in `usedMs` total, with `calls` calls of
 * which `wasted` were wasted, `deadlocks` stalls and `assists` intercom calls.
 *
 * One builder rather than four fixtures, so a test that moves one axis is
 * visibly moving one argument.
 */
function replay(
  over: {
    usedMs?: number;
    calls?: number;
    wasted?: number;
    deadlocks?: number;
    assists?: number;
    notes?: number;
  } = {},
): Replay {
  const usedMs = over.usedMs ?? PAR / 2;
  const total = over.calls ?? 10;
  const wasted = over.wasted ?? 0;
  const half = Math.round(usedMs / 2);
  return {
    sessionId: "s-1",
    designation: "WREN",
    difficulty: "standard",
    mode: "full",
    outcome: "escaped",
    chambersCleared: 2,
    durationMs: usedMs,
    staminaWindowMs: 2700,
    medianLatencyMs: 800,
    calls: [
      ...Array.from({ length: total }, (_, i) => call(i * 10, i < wasted)),
      ...Array.from({ length: over.assists ?? 0 }, (_, i) => call(5000 + i, false, ASSIST_TOOL)),
    ],
    beats: [],
    chambers: [
      { t: 0, kind: "enter", chamber: "airlock" },
      { t: half, kind: "solved", chamber: "airlock" },
      { t: half, kind: "enter", chamber: "signal_room" },
      { t: usedMs, kind: "solved", chamber: "signal_room" },
    ],
    failures: Array.from({ length: over.deadlocks ?? 0 }, (_, i) => ({
      t: 100 + i,
      chamber: "airlock" as const,
      concordBits: 2,
    })),
    notes: Array.from({ length: over.notes ?? 0 }, (_, i) => ({
      t: i,
      author: "PILOT" as const,
      text: "the third lever sticks",
    })),
    track: null,
  };
}

describe("the three marks separate independently", () => {
  it("moves pace, and only pace, when the pair takes longer", () => {
    const fast = gradeShift(replay({ usedMs: PAR / 2 })).marks;
    const slow = gradeShift(replay({ usedMs: PAR })).marks;
    expect(fast.pace).toBeGreaterThan(slow.pace);
    expect(slow.precision).toBe(fast.precision);
    expect(slow.resolve).toBe(fast.resolve);
  });

  it("moves precision, and only precision, when KEEPER wastes calls", () => {
    const clean = gradeShift(replay({ wasted: 0 })).marks;
    const sloppy = gradeShift(replay({ wasted: 5 })).marks;
    expect(clean.precision).toBeGreaterThan(sloppy.precision);
    expect(sloppy.pace).toBe(clean.pace);
    expect(sloppy.resolve).toBe(clean.resolve);
  });

  it("moves resolve, and only resolve, when the pair stalls or asks for help", () => {
    const steady = gradeShift(replay()).marks;
    const stalled = gradeShift(replay({ deadlocks: 1 })).marks;
    const helped = gradeShift(replay({ assists: 2 })).marks;
    expect(steady.resolve).toBeGreaterThan(helped.resolve);
    expect(helped.resolve).toBeGreaterThan(stalled.resolve);
    for (const other of [stalled, helped]) {
      expect(other.pace).toBe(steady.pace);
      expect(other.precision).toBe(steady.precision);
    }
  });

  it("does not grade the notepad, because a pair that talks out loud writes nothing", () => {
    // Reported, deliberately not scored. Grading it would punish the most
    // natural way two people in one room play this.
    const quiet = gradeShift(replay({ notes: 0 }));
    const chatty = gradeShift(replay({ notes: 9 }));
    expect(chatty.marks).toEqual(quiet.marks);
    expect(chatty.notes).toBe(9);
  });
});

describe("the grade", () => {
  it("separates a good run from a bad one across the whole band", () => {
    const best = gradeShift(replay({ usedMs: PAR / 4, wasted: 0 })).grade;
    const worst = gradeShift(replay({ usedMs: PAR, wasted: 9, deadlocks: 2 })).grade;
    expect(best).toBe("S");
    expect(worst).toBe("D");
  });

  it("never lets a mark leave nought to one, however bad the run", () => {
    // A pair can spend several times the par clock across retries, and a
    // negative bar would draw off the end of its track.
    const marks = gradeShift(replay({ usedMs: PAR * 6, deadlocks: 40 })).marks;
    for (const mark of Object.values(marks)) {
      expect(mark).toBeGreaterThanOrEqual(0);
      expect(mark).toBeLessThanOrEqual(1);
    }
  });
});

describe("splits", () => {
  it("measures a room from the first time it was entered, retries included", () => {
    // A deadlock re-enters the same chamber. The question the report answers
    // is how long that room held the pair, not how long the winning attempt
    // took, so the second entry must not restart the clock.
    const base = replay({ usedMs: 100_000 });
    const withRetry: Replay = {
      ...base,
      chambers: [
        { t: 0, kind: "enter", chamber: "airlock" },
        { t: 40_000, kind: "enter", chamber: "airlock" },
        { t: 50_000, kind: "solved", chamber: "airlock" },
        { t: 50_000, kind: "enter", chamber: "signal_room" },
        { t: 100_000, kind: "solved", chamber: "signal_room" },
      ],
    };
    const airlock = gradeShift(withRetry).splits[0];
    expect(airlock?.ms).toBe(50_000);
  });

  it("measures a room nobody got out of to the end of the session", () => {
    const base = replay({ usedMs: 100_000 });
    const stuck: Replay = {
      ...base,
      chambers: [{ t: 0, kind: "enter", chamber: "airlock" }],
    };
    const [airlock] = gradeShift(stuck).splits;
    expect(airlock?.cleared).toBe(false);
    expect(airlock?.ms).toBe(100_000);
  });
});

describe("shareText", () => {
  it("is plain text, carries the link, and has no em dash in it", () => {
    const report = gradeShift(replay());
    const text = shareText(report, "https://example.test/replay?id=s-1");
    expect(text).toContain("SEMAPHORE - grade");
    expect(text).toContain("https://example.test/replay?id=s-1");
    expect(text).not.toContain("—");
  });

  it("draws every bar at the same width, so three of them line up", () => {
    const bars = shareText(gradeShift(replay({ wasted: 5 })), "u")
      .split("\n")[2]!
      .match(/[#.]+/g);
    expect(bars).toHaveLength(3);
    for (const bar of bars!) expect(bar).toHaveLength(5);
  });
});

describe("cellsOf", () => {
  it("fills no cells at nought and every cell at one", () => {
    expect(cellsOf(0)).toBe(0);
    expect(cellsOf(1)).toBe(5);
    expect(cellsOf(-3)).toBe(0);
  });
});
