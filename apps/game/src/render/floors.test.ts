/**
 * The station's floors, and the progress they display.
 *
 * The section this module used to lay out is gone (D-035), but the questions
 * it answered are the console's now and are exactly as easy to get wrong: a
 * session that promises a room it will never open, or a progress trail that
 * lights the floor next door.
 */

import { describe, expect, it } from "vitest";
import type { PilotView } from "@semaphore/protocol";
import { FLOOR_NAMES, activeFloor, floorsFor, stationFloors } from "./floors.js";

function view(over: Partial<PilotView> = {}): PilotView {
  return {
    phase: "IN_CHAMBER",
    chamber: "airlock",
    mode: "full",
    designation: "KEEPER",
    remainingMs: 120_000,
    assist: null,
    objective: null,
    progress: null,
    seq: 0,
    retries: 0,
    facts: {},
    ghost: null,
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
    // BRIEF plays a genuinely different building. Showing a floor nobody will
    // enter is the station promising a room that does not exist.
    expect(floorsFor("brief")).toEqual(["airlock", "signal_room", "concord_lock"]);
  });

  it("has a name for every floor it can produce", () => {
    for (const mode of ["full", "brief"] as const) {
      for (const id of floorsFor(mode)) expect(FLOOR_NAMES[id], id).toBeTruthy();
    }
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
    // **With a null chamber, because that is what the worker actually sends.**
    // The machine clears `chamber` on the way into FINALE and again into
    // ESCAPED (`machine.ts`, `transitionOut`). This test used to pass
    // `chamber: "concord_lock"`, which the server never produces, so it
    // asserted the right answer from an input that cannot occur and went on
    // passing while the real path returned null for both phases.
    expect(activeFloor(view({ phase: "FINALE", chamber: null }))).toBe("concord_lock");
    expect(activeFloor(view({ phase: "ESCAPED", chamber: null }))).toBe("concord_lock");
  });

  it("marks the Concord Lock cleared-through at the ending, not the lobby", () => {
    // The knock-on the console shows: with the ending reporting no floor, the
    // whole list went unmarked at exactly the moment the pair had finished it.
    const floors = stationFloors(view({ phase: "ESCAPED", chamber: null }));
    expect(floors.find((f) => f.id === "concord_lock")?.active).toBe(true);
    expect(floors.filter((f) => f.cleared).map((f) => f.id)).toEqual([
      "airlock",
      "signal_room",
      "blind_panel",
      "archive",
    ]);
  });

  it("lights nothing in the lobby or a transition", () => {
    expect(activeFloor(view({ phase: "LOBBY", chamber: null }))).toBeNull();
    expect(activeFloor(view({ phase: "TRANSITIONING", chamber: "airlock" }))).toBeNull();
  });
});

describe("the progress trail", () => {
  it("marks exactly the floors already walked out of as cleared", () => {
    const floors = stationFloors(view({ phase: "ARCHIVE", chamber: "blind_panel" }));
    expect(floors.filter((floor) => floor.cleared).map((floor) => floor.id)).toEqual([
      "airlock",
      "signal_room",
      "blind_panel",
    ]);
    expect(floors.find((floor) => floor.active)?.id).toBe("archive");
    expect(floors.find((floor) => floor.id === "concord_lock")?.cleared).toBe(false);
  });

  it("clears nothing before the pair has been anywhere", () => {
    const floors = stationFloors(view({ chamber: "airlock" }));
    expect(floors.some((floor) => floor.cleared)).toBe(false);
    expect(floors.find((floor) => floor.active)?.id).toBe("airlock");
  });

  it("lights and clears nothing at all from outside the building", () => {
    // The lobby is the honest picture of not having gone in yet.
    const floors = stationFloors(view({ phase: "LOBBY", chamber: null }));
    expect(floors.some((floor) => floor.active)).toBe(false);
    expect(floors.some((floor) => floor.cleared)).toBe(false);
  });

  it("never lights two floors at once", () => {
    for (const phase of ["IN_CHAMBER", "ARCHIVE", "FINALE", "ESCAPED", "DEADLOCK"] as const) {
      const floors = stationFloors(view({ phase, chamber: "concord_lock" }));
      expect(
        floors.filter((floor) => floor.active),
        phase,
      ).toHaveLength(activeFloor(view({ phase, chamber: "concord_lock" })) === null ? 0 : 1);
    }
  });

  it("gives the console one entry per floor of the session it is in", () => {
    expect(stationFloors(view({ mode: "brief" }))).toHaveLength(3);
    expect(stationFloors(view({ mode: "full" }))).toHaveLength(5);
  });
});
