/**
 * The room's floor plan, tested without a canvas.
 *
 * `roomPlan` is pure and takes only a `PilotView`, which is what makes this
 * possible and is also the property worth protecting: if a later change gave
 * the renderer a second input, this file would stop compiling before anyone
 * had to notice the design law had been broken.
 *
 * The tests are written against what the four chambers actually put in
 * `projectForPilot` output, taken from `apps/worker/src/chambers/*.ts`. A
 * fixture that invents a field would prove nothing.
 */

import { describe, expect, it } from "vitest";
import type { PilotView } from "@semaphore/protocol";
import {
  CANVAS_TILES,
  GAUGE_MAX,
  MAX_INTERIOR,
  interlude,
  roomPlan,
  roomTitle,
  spread,
} from "./room.js";
import { CHANNEL_SHEETS, FRAMES } from "./atlas.js";

/** A view in a chamber, with whatever facts a test wants in it. */
function view(over: Partial<PilotView> = {}): PilotView {
  return {
    phase: "IN_CHAMBER",
    chamber: "airlock",
    designation: "KEEPER",
    remainingMs: 120_000,
    retries: 0,
    facts: {},
    notes: [],
    mode: "full",
    ...over,
  };
}

const AIRLOCK_FACTS = {
  glyphByLever: { lever_a: "cross", lever_b: "spiral", lever_c: "wave" },
  lastSound: "a hard hiss of venting air",
  pulled: ["lever_a"],
  doorOpen: false,
};

const SIGNAL_FACTS = {
  glyphByKey: { 1: "arch", 2: "knot", 3: "eye", 4: "comb", 5: "hook", 6: "star" },
  manualPageState: "vandalised",
  pressedSequence: [3, 1],
  strikes: 1,
  lastSound: "a soft chime",
};

const BLIND_FACTS = {
  gaugeValues: { 1: 4, 2: 0, 3: 8, 4: 2 },
  targets: { 1: 4, 2: 6, 3: 1, 4: 2 },
  lastClicks: 3,
  rotationCount: 5,
  solved: false,
};

const CONCORD_FACTS = {
  cipherOffset: 11,
  boltsAligned: 2,
  armed: true,
  staminaRemainingMs: 4_000,
  staminaWindowMs: 16_000,
  lockedOutUntilMs: null,
  attemptedPhrases: ["WRONG WORDS HERE"],
  lastSound: "a bolt seating",
};

const EVERY_CHAMBER = [
  ["airlock", AIRLOCK_FACTS],
  ["signal_room", SIGNAL_FACTS],
  ["blind_panel", BLIND_FACTS],
  ["concord_lock", CONCORD_FACTS],
] as const;

describe("spread", () => {
  it("lands every item on a whole tile", () => {
    for (let count = 0; count <= 8; count += 1) {
      for (const cols of spread(count, 12, 2)) expect(Number.isInteger(cols)).toBe(true);
    }
  });

  it("centres a lone item and pins the ends of a bank", () => {
    expect(spread(1, 9, 0)).toEqual([4]);
    expect(spread(3, 9, 0)).toEqual([0, 4, 8]);
  });

  it("stays inside the span it was given", () => {
    for (const col of spread(6, 10, 3)) {
      expect(col).toBeGreaterThanOrEqual(3);
      expect(col).toBeLessThan(13);
    }
  });

  it("has nothing to place for an empty bank", () => {
    expect(spread(0, 10)).toEqual([]);
  });
});

describe("roomPlan", () => {
  it("draws nothing when the pair is not standing in a room", () => {
    // The Archive keeps `machine.chamber` set so the machine knows which room
    // was last entered (D-025). Drawing from that alone would put the Blind
    // Panel behind the Archive's dead monitor.
    expect(roomPlan(view({ phase: "ARCHIVE", chamber: "blind_panel", facts: {} }))).toBeNull();
    expect(roomPlan(view({ phase: "LOBBY", chamber: null, facts: {} }))).toBeNull();
  });

  it("fits every room on the canvas, walls included", () => {
    for (const [chamber, facts] of EVERY_CHAMBER) {
      const plan = roomPlan(view({ chamber, facts }));
      expect(plan, chamber).not.toBeNull();
      expect(plan?.cols ?? 0, `${chamber} cols`).toBeLessThanOrEqual(MAX_INTERIOR);
      expect(plan?.rows ?? 0, `${chamber} rows`).toBeLessThanOrEqual(MAX_INTERIOR);
    }
  });

  it("keeps every device inside its own room", () => {
    for (const [chamber, facts] of EVERY_CHAMBER) {
      const plan = roomPlan(view({ chamber, facts }));
      for (const device of plan?.devices ?? []) {
        expect(device.col, `${chamber} left`).toBeGreaterThanOrEqual(0);
        expect(device.col, `${chamber} right`).toBeLessThan(plan?.cols ?? 0);
        expect(device.row, `${chamber} top`).toBeGreaterThanOrEqual(0);
        expect(device.row, `${chamber} bottom`).toBeLessThan(plan?.rows ?? 0);
      }
      for (const plate of plan?.plates ?? []) {
        expect(plate.col, `${chamber} plate x`).toBeGreaterThanOrEqual(0);
        expect(plate.col, `${chamber} plate x`).toBeLessThan(plan?.cols ?? 0);
        expect(plate.row, `${chamber} plate y`).toBeGreaterThanOrEqual(0);
        expect(plate.row, `${chamber} plate y`).toBeLessThan(plan?.rows ?? 0);
      }
    }
  });

  it("leaves the tile above a glyph-bearing device free for its plate", () => {
    // The glyph is drawn one tile up, so a device on row zero would put the
    // shape PILOT has to describe outside the room.
    for (const [chamber, facts] of EVERY_CHAMBER) {
      const plan = roomPlan(view({ chamber, facts }));
      for (const device of plan?.devices ?? []) {
        if (device.glyph) expect(device.row, `${chamber} ${device.label ?? ""}`).toBeGreaterThan(0);
      }
    }
  });

  it("never stacks two devices on one tile", () => {
    // Two sprites on a tile is one sprite the player cannot see, and in a game
    // about describing what you can see that is a lost fact rather than a
    // cosmetic overlap. The Airlock's captioned door leaf is the one deliberate
    // exception: it is a second draw of the same leaf, carrying the caption.
    for (const [chamber, facts] of EVERY_CHAMBER) {
      const plan = roomPlan(view({ chamber, facts }));
      const seen = new Map<string, string>();
      for (const device of plan?.devices ?? []) {
        const at = `${String(device.col)},${String(device.row)}`;
        const existing = seen.get(at);
        if (existing !== undefined) expect(existing, `${chamber} at ${at}`).toBe(device.sheet);
        seen.set(at, device.sheet);
      }
    }
  });

  it("names only sheets the art table actually loads", () => {
    for (const [chamber, facts] of EVERY_CHAMBER) {
      const plan = roomPlan(view({ chamber, facts }));
      for (const device of plan?.devices ?? []) {
        expect(Object.keys(CHANNEL_SHEETS), `${chamber} ${device.sheet}`).toContain(device.sheet);
        expect(device.frame, `${chamber} ${device.sheet} frame`).toBeLessThan(
          CHANNEL_SHEETS[device.sheet],
        );
      }
    }
  });

  it("puts no glyph name anywhere a caption can be read", () => {
    // The rule the game is built on: a lever captioned "spiral" deletes the
    // chamber, because reading a label aloud is not describing a shape.
    const glyphs = [
      ...Object.values(AIRLOCK_FACTS.glyphByLever),
      ...Object.values(SIGNAL_FACTS.glyphByKey),
    ];
    for (const [chamber, facts] of EVERY_CHAMBER) {
      const plan = roomPlan(view({ chamber, facts }));
      for (const device of plan?.devices ?? []) {
        for (const glyph of glyphs) {
          expect(device.label?.toLowerCase() ?? "", `${chamber}`).not.toContain(glyph);
        }
      }
    }
  });
});

describe("the airlock", () => {
  it("throws the levers that have been pulled and leaves the rest upright", () => {
    const plan = roomPlan(view({ chamber: "airlock", facts: AIRLOCK_FACTS }));
    const levers = plan?.devices.filter((device) => device.sheet === "lever") ?? [];
    expect(levers).toHaveLength(3);
    expect(levers.filter((lever) => lever.frame === FRAMES.lever.down)).toHaveLength(1);
    // The pulled one is the one named in `pulled`, not merely one of them.
    expect(levers.find((lever) => lever.frame === FRAMES.lever.down)?.label).toBe("A");
  });

  it("gives every lever a glyph and PILOT's channel", () => {
    const plan = roomPlan(view({ chamber: "airlock", facts: AIRLOCK_FACTS }));
    for (const lever of plan?.devices.filter((d) => d.sheet === "lever") ?? []) {
      expect(lever.channel).toBe("pilot");
      expect(lever.glyph).toBeTruthy();
    }
  });

  it("opens the door only when the room says so, and shares it", () => {
    const shut = roomPlan(view({ chamber: "airlock", facts: AIRLOCK_FACTS }));
    const open = roomPlan(
      view({ chamber: "airlock", facts: { ...AIRLOCK_FACTS, doorOpen: true } }),
    );
    for (const door of shut?.devices.filter((d) => d.sheet === "door") ?? []) {
      expect(door.frame).toBe(FRAMES.door.shut);
      expect(door.channel).toBe("shared");
    }
    for (const door of open?.devices.filter((d) => d.sheet === "door") ?? []) {
      expect(door.frame).toBe(FRAMES.door.open);
    }
    expect(shut?.solved).toBe(false);
    expect(open?.solved).toBe(true);
  });
});

describe("the signal room", () => {
  it("draws one key per glyph, all in PILOT's channel", () => {
    const plan = roomPlan(view({ chamber: "signal_room", facts: SIGNAL_FACTS }));
    const keys = plan?.devices.filter((device) => device.sheet === "button") ?? [];
    expect(keys).toHaveLength(6);
    for (const key of keys) expect(key.channel).toBe("pilot");
    // Two pressed, per the fixture's `pressedSequence`.
    expect(keys.filter((key) => key.frame === FRAMES.button.pressed)).toHaveLength(2);
  });

  it("lights one strike lamp per strike, shared", () => {
    const plan = roomPlan(view({ chamber: "signal_room", facts: SIGNAL_FACTS }));
    const lamps = plan?.devices.filter((device) => device.sheet === "led") ?? [];
    expect(lamps).toHaveLength(3);
    expect(lamps.filter((lamp) => lamp.frame === FRAMES.led.on)).toHaveLength(1);
    for (const lamp of lamps) expect(lamp.channel).toBe("shared");
  });

  it("says which state the manual page is in, in PILOT's channel alone", () => {
    // The trust puzzle turns on PILOT seeing this and KEEPER not.
    const marked = roomPlan(view({ chamber: "signal_room", facts: SIGNAL_FACTS }));
    const page = marked?.devices.find((device) => device.sheet === "pad");
    expect(page?.channel).toBe("pilot");
    expect(page?.label).toBe("PAGE MARKED");

    const clean = roomPlan(
      view({ chamber: "signal_room", facts: { ...SIGNAL_FACTS, manualPageState: "intact" } }),
    );
    expect(clean?.devices.find((device) => device.sheet === "pad")?.label).toBe("PAGE OK");
  });
});

describe("the blind panel", () => {
  it("gives every gauge a full column of lamps, lit to its value", () => {
    const plan = roomPlan(view({ chamber: "blind_panel", facts: BLIND_FACTS }));
    const lamps = plan?.devices.filter((device) => device.sheet === "led") ?? [];
    expect(lamps).toHaveLength(4 * GAUGE_MAX);
    // The fixture's values are 4, 0, 8 and 2, which is fourteen lit lamps.
    expect(lamps.filter((lamp) => lamp.frame === FRAMES.led.on)).toHaveLength(14);
    for (const lamp of lamps) expect(lamp.channel).toBe("pilot");
  });

  it("draws an unlit lamp rather than omitting it", () => {
    // A gauge at zero and a gauge that is not there must not look the same.
    const plan = roomPlan(
      view({ chamber: "blind_panel", facts: { ...BLIND_FACTS, gaugeValues: { 1: 0 } } }),
    );
    expect(plan?.devices.filter((device) => device.sheet === "led")).toHaveLength(GAUGE_MAX);
  });

  it("gives KEEPER a dial per gauge that carries no value", () => {
    const plan = roomPlan(view({ chamber: "blind_panel", facts: BLIND_FACTS }));
    const dials = plan?.devices.filter((device) => device.sheet === "switch") ?? [];
    expect(dials).toHaveLength(4);
    for (const dial of dials) {
      expect(dial.channel).toBe("keeper");
      // The dial says which dial it is and nothing about where it is set. The
      // human half of the puzzle is not knowing what a dial drives.
      expect(dial.label).toMatch(/^DIAL \d$/);
    }
  });

  it("clamps a gauge reading the server sent out of range", () => {
    const plan = roomPlan(
      view({ chamber: "blind_panel", facts: { ...BLIND_FACTS, gaugeValues: { 1: 99 } } }),
    );
    const lamps = plan?.devices.filter((device) => device.sheet === "led") ?? [];
    expect(lamps.filter((lamp) => lamp.frame === FRAMES.led.on)).toHaveLength(GAUGE_MAX);
  });
});

describe("the concord lock", () => {
  it("shortens the grip beam as the stamina window runs down", () => {
    const beam = (remaining: number) =>
      roomPlan(
        view({
          chamber: "concord_lock",
          facts: { ...CONCORD_FACTS, staminaRemainingMs: remaining },
        }),
      )?.devices.filter((device) => device.sheet === "laser").length ?? 0;
    expect(beam(16_000)).toBeGreaterThan(beam(8_000));
    expect(beam(8_000)).toBeGreaterThan(beam(1_000));
    // Never nothing while the grip holds: a beam that vanishes reads as a bug.
    expect(beam(1)).toBeGreaterThanOrEqual(1);
  });

  it("draws no beam at all when nobody is holding the bar", () => {
    const plan = roomPlan(
      view({ chamber: "concord_lock", facts: { ...CONCORD_FACTS, armed: false } }),
    );
    expect(plan?.devices.filter((device) => device.sheet === "laser")).toHaveLength(0);
  });

  it("keeps the door locked until all three bolts are aligned", () => {
    const two = roomPlan(view({ chamber: "concord_lock", facts: CONCORD_FACTS }));
    expect(two?.devices.some((device) => device.sheet === "door-locked")).toBe(true);
    expect(two?.solved).toBe(false);

    const three = roomPlan(
      view({ chamber: "concord_lock", facts: { ...CONCORD_FACTS, boltsAligned: 3 } }),
    );
    expect(three?.devices.some((device) => device.sheet === "door-locked")).toBe(false);
    expect(three?.devices.some((device) => device.sheet === "door")).toBe(true);
    expect(three?.solved).toBe(true);
  });

  it("puts the cipher offset on PILOT's wheel and nowhere else", () => {
    const plan = roomPlan(view({ chamber: "concord_lock", facts: CONCORD_FACTS }));
    const wheel = plan?.devices.find((device) => device.sheet === "pad");
    expect(wheel?.channel).toBe("pilot");
    expect(wheel?.label).toBe("WHEEL 11");
  });
});

describe("roomTitle and interlude", () => {
  it("names the chamber when there is one", () => {
    expect(roomTitle(view({ chamber: "signal_room", facts: SIGNAL_FACTS }))).toBe("SIGNAL ROOM");
  });

  it("names the phase when there is no room", () => {
    // A console that goes blank during the Archive looks broken.
    expect(roomTitle(view({ phase: "ARCHIVE", chamber: "blind_panel", facts: {} }))).toBe(
      "THE ARCHIVE",
    );
    expect(roomTitle(view({ phase: "ESCAPED", chamber: null, facts: {} }))).toBe("ESCAPED");
  });

  it("gives every interlude a headline", () => {
    for (const phase of ["ENTRY", "LOBBY", "TRANSITIONING", "ARCHIVE", "FINALE", "ESCAPED"] as const)
      expect(interlude(view({ phase }))[0], phase).not.toBe("");
  });
});

describe("the canvas", () => {
  it("leaves a whole tile of wall on every side", () => {
    expect(MAX_INTERIOR).toBe(CANVAS_TILES - 2);
  });
});
