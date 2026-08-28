/**
 * The HUD's arithmetic.
 *
 * Small functions, but every one of them is a thing that can be wrong in a way
 * nobody notices by looking at the screen: a clock that reads zero a second
 * early, a meter that fills instead of emptying, a log that drops the newest
 * line instead of the oldest. Those are exactly the bugs a playtest blames on
 * the puzzle.
 */

import { describe, expect, it } from "vitest";
import { CHANNEL_MARKER, PALETTE } from "./palette.js";
import { CANVAS, FRAME, SECTION_BOTTOM, SECTION_TOP } from "./cutaway.js";
import {
  AUDIBLE_HEIGHT,
  AUDIBLE_Y,
  LEGEND,
  LEGEND_Y,
  LINE_HEIGHT,
  LOG_LINES,
  LOG_WIDTH,
  MANIFEST_LINES,
  METER_HEIGHT,
  METER_Y,
  PANEL_Y,
  charsThatFit,
  formatCall,
  formatTimer,
  meterFill,
  pushLine,
  truncate,
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

describe("truncate", () => {
  it("leaves a line that fits alone", () => {
    expect(truncate("pull_lever ok 41ms", LOG_WIDTH)).toBe("pull_lever ok 41ms");
  });

  it("cuts a line that would run into the panel beside it", () => {
    // `start full` answers with a paragraph of briefing written for an agent.
    // Left whole it runs straight through the manifest plate and makes both
    // unreadable, which is not a cosmetic problem at 8px.
    const briefing =
      "start full: THE AIRLOCK. A cramped chamber, ankle-deep in cold water. Three levers.";
    const cut = truncate(briefing, LOG_WIDTH);
    expect(cut.length).toBeLessThanOrEqual(charsThatFit(LOG_WIDTH));
    expect(cut.endsWith("\u2026")).toBe(true);
  });

  it("never returns a string longer than the box it was measured against", () => {
    // Including the degenerate box with room for one character, where the
    // ellipsis is the whole of the output.
    for (const width of [1, 5, 20, LOG_WIDTH]) {
      expect(truncate("pull_lever ok 41ms and then some", width).length).toBeLessThanOrEqual(
        charsThatFit(width),
      );
    }
  });
});

describe("the HUD's vertical budget", () => {
  /** Every band, as a half-open [top, bottom) pair, in drawing order. */
  const bands: readonly (readonly [string, number, number])[] = [
    ["top bar", FRAME, METER_Y],
    ["meter", METER_Y, METER_Y + METER_HEIGHT],
    ["meter label", METER_Y + METER_HEIGHT + 1, SECTION_TOP],
    ["section", SECTION_TOP, SECTION_BOTTOM],
    ["audible", AUDIBLE_Y - 1, AUDIBLE_Y + AUDIBLE_HEIGHT + 1],
    ["panels", PANEL_Y, PANEL_Y + LINE_HEIGHT + 2 + LOG_LINES * LINE_HEIGHT],
    ["legend", LEGEND_Y, LEGEND_Y + LINE_HEIGHT],
  ];

  it("stacks every band without one landing on another", () => {
    // At 320x180 two bands a few pixels apart do not look cramped, they look
    // like one illegible band. This is the only way to notice before someone
    // takes a screenshot.
    for (let i = 1; i < bands.length; i += 1) {
      const [name, top] = bands[i]!;
      const [previous, , bottom] = bands[i - 1]!;
      expect(top, `${name} overlaps ${previous}`).toBeGreaterThanOrEqual(bottom);
    }
  });

  it("fits inside the canvas, frame included", () => {
    for (const [name, , bottom] of bands) {
      expect(bottom, `${name} runs off the canvas`).toBeLessThanOrEqual(CANVAS - FRAME);
    }
  });

  it("shows as many manifest rows as log rows, so the two panels line up", () => {
    expect(MANIFEST_LINES).toBe(LOG_LINES);
  });
});
