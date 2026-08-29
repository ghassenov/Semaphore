/**
 * The Archive's recording, checked without a canvas.
 *
 * The interpolation is the part worth testing: it is invented (PILOT's
 * position is never logged) and it is wrong in the way a rendering glitch is
 * wrong, which is to say invisibly until somebody watches the whole loop.
 */

import { describe, expect, it } from "vitest";
import type { GhostTrack } from "@semaphore/protocol";
import { TAIL_MS, ghostFrame } from "./ghost.js";

/** A ghost that walks into one room, grips the bar, and is never heard from. */
const TRACK: GhostTrack = {
  designation: "WREN",
  durationMs: 10_000,
  outcome: "cut",
  beats: [
    { t: 0, kind: "enter", chamber: "concord_lock" },
    { t: 4000, kind: "action", chamber: null, action: "grip", target: "release_bar" },
  ],
};

describe("ghostFrame", () => {
  it("walks between two beats instead of teleporting", () => {
    const start = ghostFrame(TRACK, 0).walk;
    const middle = ghostFrame(TRACK, 2000).walk;
    const end = ghostFrame(TRACK, 4000).walk;
    expect(middle).toBeGreaterThan(start);
    expect(middle).toBeLessThan(end);
    // Half way through the gap is half way along it, which is the whole claim
    // the interpolation makes and the only one it is entitled to.
    expect(middle).toBeCloseTo((start + end) / 2, 5);
  });

  it("holds the last beat's position rather than drifting past it", () => {
    expect(ghostFrame(TRACK, 9000).walk).toBe(ghostFrame(TRACK, 4000).walk);
  });

  it("keeps the ghost gripping until they let go", () => {
    expect(ghostFrame(TRACK, 3999).gripping).toBe(false);
    expect(ghostFrame(TRACK, 4000).gripping).toBe(true);
    expect(ghostFrame(TRACK, 9999).gripping).toBe(true);
  });

  it("lets go when the ghost does, and on walking into the next room", () => {
    const released: GhostTrack = {
      ...TRACK,
      beats: [
        ...TRACK.beats,
        { t: 6000, kind: "action", chamber: null, action: "release", target: "release_bar" },
      ],
    };
    expect(ghostFrame(released, 6000).gripping).toBe(false);

    const moved: GhostTrack = {
      ...TRACK,
      beats: [...TRACK.beats, { t: 6000, kind: "enter", chamber: "airlock" }],
    };
    expect(ghostFrame(moved, 6000).gripping).toBe(false);
    expect(ghostFrame(moved, 6000).chamber).toBe("airlock");
  });

  it("says the recording stops rather than looking stalled", () => {
    expect(ghostFrame(TRACK, 9999).ended).toBe(false);
    const over = ghostFrame(TRACK, 10_000);
    expect(over.ended).toBe(true);
    expect(over.caption).toContain("STOPS");
    expect(over.progress).toBe(1);
  });

  it("names the ending from how the log ends", () => {
    const out: GhostTrack = { ...TRACK, outcome: "escaped" };
    expect(ghostFrame(out, 10_000).caption).toBe("THEY GOT OUT");
  });

  it("loops back to the beginning after holding the last frame", () => {
    const cycle = TRACK.durationMs + TAIL_MS;
    expect(ghostFrame(TRACK, cycle).walk).toBe(ghostFrame(TRACK, 0).walk);
    expect(ghostFrame(TRACK, cycle + 2000).walk).toBe(ghostFrame(TRACK, 2000).walk);
    // Still on the ending during the tail, which is what the tail is for.
    expect(ghostFrame(TRACK, cycle - 1).ended).toBe(true);
  });

  it("gives the monitor a room to draw before the first beat lands", () => {
    const late: GhostTrack = {
      ...TRACK,
      beats: [{ t: 5000, kind: "enter", chamber: "airlock" }],
    };
    const frame = ghostFrame(late, 0);
    expect(frame.chamber).toBeNull();
    expect(frame.width).toBeGreaterThan(0);
    expect(frame.depth).toBeGreaterThan(0);
  });

  it("survives a track with no beats and no length at all", () => {
    // A fixture can be regenerated into something shorter, and a division by
    // its length is the arithmetic that would take the whole scene down.
    const empty: GhostTrack = { designation: "NOBODY", durationMs: 0, outcome: "cut", beats: [] };
    const frame = ghostFrame(empty, 0);
    expect(Number.isFinite(frame.walk)).toBe(true);
    expect(Number.isFinite(frame.progress)).toBe(true);
  });
});
