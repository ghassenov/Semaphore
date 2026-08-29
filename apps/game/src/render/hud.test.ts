/**
 * The console's arithmetic.
 *
 * Small functions, but every one of them is a thing that can be wrong in a way
 * nobody notices by looking at the screen: a clock that reads zero a second
 * early, a meter that fills instead of emptying, a log that drops the newest
 * line instead of the oldest. Those are exactly the bugs a playtest blames on
 * the puzzle.
 *
 * The band-overlap and truncation suites that used to be here went with the
 * canvas HUD (D-036). Both existed because six panels were being packed into
 * seventy pixels at an estimated character width; the console is DOM now, so
 * the browser measures its own text and CSS decides where a line stops.
 */

import { describe, expect, it } from "vitest";
import { CHANNEL_MARKER, PALETTE } from "./palette.js";
import {
  LEGEND,
  LOG_LINES,
  MANIFEST_LINES,
  PAD_LINES,
  formatCall,
  formatNote,
  formatTimer,
  meterFill,
  pushLine,
} from "./hud.js";

describe("formatTimer", () => {
  it("reads minutes and seconds", () => {
    expect(formatTimer(180_000)).toBe("3:00");
    expect(formatTimer(65_000)).toBe("1:05");
    expect(formatTimer(9_000)).toBe("0:09");
  });

  it("rounds up, so the last second is shown for the whole of it", () => {
    // A clock that reads 0:00 while the room is still live makes the pair
    // panic early. The server decides when time is out, not this function.
    expect(formatTimer(1)).toBe("0:01");
    expect(formatTimer(999)).toBe("0:01");
    expect(formatTimer(0)).toBe("0:00");
  });

  it("never shows a negative clock", () => {
    // The socket sends a floor of zero, but a frame in flight past a deadline
    // must not be able to render "-0:03".
    expect(formatTimer(-4_000)).toBe("0:00");
  });

  it("says so when the session is untimed", () => {
    expect(formatTimer(null)).toBe("UNTIMED");
  });
});

describe("meterFill", () => {
  it("is full at the room's opening ambiguity and empty at certainty", () => {
    expect(meterFill(1.58, 1.58)).toBe(1);
    expect(meterFill(0, 1.58)).toBe(0);
  });

  it("empties as ambiguity is eliminated", () => {
    expect(meterFill(0.79, 1.58)).toBeCloseTo(0.5, 5);
  });

  it("reads empty rather than full when there is nothing to measure", () => {
    // Outside a chamber the route answers null. An unmeasured meter that drew
    // full would claim the pair knows nothing at the moment they know most.
    expect(meterFill(null, 1.58)).toBe(0);
    expect(meterFill(1.58, 0)).toBe(0);
  });

  it("clamps a reading above the room's own peak", () => {
    // Chamber II's ambiguity can rise: a rotation that eliminates nothing but
    // adds a cross-linked possibility. The bar stops at full rather than
    // drawing past the end of its track.
    expect(meterFill(4, 2)).toBe(1);
  });
});

describe("the action log", () => {
  it("puts the newest line first", () => {
    expect(pushLine(["older"], "newest")).toEqual(["newest", "older"]);
  });

  it("drops the oldest line when it is full", () => {
    let lines: readonly string[] = [];
    for (let i = 0; i < LOG_LINES + 3; i += 1) lines = pushLine(lines, `call ${String(i)}`);
    expect(lines).toHaveLength(LOG_LINES);
    expect(lines[0]).toBe(`call ${String(LOG_LINES + 2)}`);
  });

  it("names the tool and the outcome, and never the arguments", () => {
    // A log line carrying `{ lever_id: "lever_b" }` would put a puzzle-shaped
    // fact on screen for whichever party is reading over the other's shoulder.
    expect(formatCall("pull_lever", "ok", 143.6)).toBe("pull_lever ok 144ms");
  });
});

describe("the channel legend", () => {
  it("teaches all three channels the player can perceive", () => {
    expect(LEGEND.map((row) => row.channel)).toEqual(["pilot", "keeper", "shared"]);
  });

  it("gives every row a shape marker, because colour alone must not carry it", () => {
    for (const row of LEGEND) {
      expect(row.marker).toBe(CHANNEL_MARKER[row.channel]);
      expect(row.marker.length).toBeGreaterThan(0);
    }
  });
});

describe("the palette", () => {
  it("holds exactly the fourteen locked colours", () => {
    // Adding a fifteenth is a decision-log entry, not a judgement call
    // (doc 06 section 2). This test is where that rule is enforced.
    expect(Object.keys(PALETTE)).toHaveLength(14);
  });

  it("has no green in it, so success cannot be signalled with one", () => {
    // Red/green signalling is the most common accessibility failure in puzzle
    // games, and the cheapest defence is not having the colour available.
    for (const value of Object.values(PALETTE)) {
      const [r, g, b] = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
      const dominantlyGreen = g > r + 24 && g > b + 24;
      expect(dominantlyGreen, `#${value.toString(16)} is green`).toBe(false);
    }
  });
});

describe("the notepad", () => {
  it("marks each line with its writer, because the pad is the shared surface", () => {
    expect(formatNote("KEEPER", "third lever is the spiral")).toBe("K third lever is the spiral");
    expect(formatNote("PILOT", "gauge two reads four")).toBe("P gauge two reads four");
  });
});

describe("the console's running lists", () => {
  it("keeps enough of each to be worth glancing at", () => {
    // A cap rather than a scrollbar, so all three have to hold more than the
    // one line that would make them useless mid-sentence.
    for (const [name, lines] of [
      ["log", LOG_LINES],
      ["pad", PAD_LINES],
      ["manifest", MANIFEST_LINES],
    ] as const) {
      expect(lines, name).toBeGreaterThan(1);
    }
  });

  it("holds every tool the registry can carry on the manifest at once", () => {
    // The plate exists to prove the toolchange animation is not a lie, and a
    // plate that elides a tool under-reports KEEPER's faculties, which is
    // worse than no plate at all. Twelve is above the largest tier.
    expect(MANIFEST_LINES).toBeGreaterThanOrEqual(12);
  });
});
