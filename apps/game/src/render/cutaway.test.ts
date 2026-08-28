/**
 * The section's geometry.
 *
 * Floors that overlap by a pixel, a station that runs off the bottom of the
 * canvas, an active floor too short for the room it has to hold - all of them
 * are wrong in ways that look like a rendering glitch rather than a layout
 * bug, and none of them shows up anywhere but a screenshot.
 */

import { describe, expect, it } from "vitest";
import type { PilotView } from "@semaphore/protocol";
import {
  CANVAS,
  FRAME,
  ROOM_RIGHT,
  SECTION_BOTTOM,
  SECTION_TOP,
  STRIP_HEIGHT,
  activeFloor,
  cutaway,
  floorsFor,
} from "./cutaway.js";

function view(over: Partial<PilotView> = {}): PilotView {
  return {
    phase: "IN_CHAMBER",
    chamber: "airlock",
    mode: "full",
    designation: "KEEPER",
    remainingMs: 120_000,
    retries: 0,
    facts: {},
    notes: [],
    ...over,
  };
}

describe("the station's floors", () => {
  it("has five in a full session, with the Archive between II and III", () => {
    expect(floorsFor("full")).toEqual([
      "airlock",
      "signal_room",
      "blind_panel",
      "archive",
      "concord_lock",
    ]);
  });

  it("drops the Blind Panel in a brief session, and the Archive with it", () => {
    // BRIEF plays a genuinely different building. Drawing a floor nobody will
    // enter is the station promising a room that does not exist.
    expect(floorsFor("brief")).toEqual(["airlock", "signal_room", "concord_lock"]);
  });
});

describe("which floor is lit", () => {
  it("follows the chamber while the pair is standing in one", () => {
    expect(activeFloor(view({ chamber: "signal_room" }))).toBe("signal_room");
    expect(activeFloor(view({ phase: "DEADLOCK", chamber: "blind_panel" }))).toBe("blind_panel");
  });

  it("lights the Archive from the phase, never from the chamber", () => {
    // `machine.chamber` outlives the room (D-025): during ARCHIVE it still
    // names the Blind Panel, and trusting it would light the wrong floor.
    expect(activeFloor(view({ phase: "ARCHIVE", chamber: "blind_panel" }))).toBe("archive");
  });

  it("keeps the pair on the Concord Lock's floor through the ending", () => {
    expect(activeFloor(view({ phase: "FINALE", chamber: "concord_lock" }))).toBe("concord_lock");
    expect(activeFloor(view({ phase: "ESCAPED", chamber: "concord_lock" }))).toBe("concord_lock");
  });

  it("lights nothing in the lobby or a transition", () => {
    expect(activeFloor(view({ phase: "LOBBY", chamber: null }))).toBeNull();
    expect(activeFloor(view({ phase: "TRANSITIONING", chamber: "airlock" }))).toBeNull();
  });
});

describe("the section's layout", () => {
  const modes = ["full", "brief"] as const;

  it("stacks the floors without a gap or an overlap", () => {
    for (const mode of modes) {
      for (const chamber of [null, "airlock", "signal_room", "concord_lock"] as const) {
        const { floors } = cutaway(
          view({ mode, chamber, phase: chamber ? "IN_CHAMBER" : "LOBBY" }),
        );
        for (const [i, floor] of floors.entries()) {
          if (i === 0) expect(floor.y, `${mode} first floor`).toBe(SECTION_TOP);
          const next = floors[i + 1];
          if (next) {
            // Exactly one slab between, every time.
            expect(next.y - (floor.y + floor.height), `${mode} slab ${String(i)}`).toBe(3);
          }
        }
      }
    }
  });

  it("keeps the whole station inside the section band", () => {
    for (const mode of modes) {
      const { floors } = cutaway(view({ mode, chamber: "airlock" }));
      const last = floors.at(-1);
      expect(last, mode).toBeDefined();
      expect(last!.y + last!.height, `${mode} runs past the section`).toBeLessThanOrEqual(
        SECTION_BOTTOM,
      );
    }
  });

  it("gives the active floor room for the tallest chamber there is", () => {
    // The Signal Room needs six glyph keys in two rows with captions, which is
    // about seventy pixels. Five equal floors would give it forty-six, which
    // is the reason the floors are not equal.
    const { active } = cutaway(view({ chamber: "signal_room" }));
    expect(active?.id).toBe("signal_room");
    expect(active?.height).toBeGreaterThanOrEqual(70);
  });

  it("collapses every floor the pair is not in", () => {
    const { floors } = cutaway(view({ chamber: "blind_panel" }));
    for (const floor of floors) {
      if (!floor.active) expect(floor.height, floor.id).toBe(STRIP_HEIGHT);
    }
  });

  it("splits the station evenly when nobody is inside it", () => {
    // The lobby draws the building from outside, which is the honest picture
    // of not having gone in yet.
    const { floors, active } = cutaway(view({ phase: "LOBBY", chamber: null }));
    expect(active).toBeNull();
    const heights = new Set(floors.map((floor) => floor.height));
    expect(heights.size).toBe(1);
  });

  it("marks exactly the floors already walked out of as cleared", () => {
    // The stack of cleared floors is the only progress display the game has.
    const { floors } = cutaway(view({ phase: "ARCHIVE", chamber: "blind_panel" }));
    expect(floors.filter((f) => f.cleared).map((f) => f.id)).toEqual([
      "airlock",
      "signal_room",
      "blind_panel",
    ]);
    expect(floors.find((f) => f.active)?.id).toBe("archive");
    expect(floors.find((f) => f.id === "concord_lock")?.cleared).toBe(false);
  });

  it("clears nothing before the pair has been anywhere", () => {
    const { floors } = cutaway(view({ chamber: "airlock" }));
    expect(floors.some((floor) => floor.cleared)).toBe(false);
  });
});

describe("the canvas the section is drawn on", () => {
  it("is square, so the section reads as a building rather than a strip", () => {
    expect(CANVAS).toBe(320);
  });

  it("leaves the machine deck clear of every room's width", () => {
    // KEEPER's column is not in a room. It runs down the whole station,
    // reaching into every chamber at once, which is what a section can say
    // and a single-room view could not.
    expect(ROOM_RIGHT).toBeLessThan(320 - FRAME);
    expect(SECTION_TOP).toBeGreaterThan(FRAME);
  });
});
