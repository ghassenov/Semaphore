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
  DOOR_WIDTH,
  GAUGE_MAX,
  MAX_INTERIOR,
  interlude,
  roomPlan,
  roomTitle,
  spread,
  tilesFor,
  CHAMBER_NOTCHES,
} from "./room.js";
import { CHANNEL_SHEETS, FRAMES, SLICE } from "./atlas.js";

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

  it("draws every door as one unbroken opening", () => {
    // Spreading three leaves evenly across four tiles leaves a gap in the
    // middle of the doorway, which reads as a rendering fault rather than as
    // a door. A door is one object three tiles wide.
    for (const [chamber, facts] of EVERY_CHAMBER) {
      const plan = roomPlan(view({ chamber, facts }));
      const leaves = (plan?.devices ?? []).filter(
        (device) => device.sheet === "door" || device.sheet === "door-locked",
      );
      if (leaves.length === 0) continue;
      const cols = [...new Set(leaves.map((leaf) => leaf.col))].sort((a, b) => a - b);
      expect(cols, `${chamber} door width`).toHaveLength(DOOR_WIDTH);
      for (let i = 1; i < cols.length; i += 1) {
        expect(cols[i]! - cols[i - 1]!, `${chamber} gap in the doorway`).toBe(1);
      }
    }
  });

  it("leaves the row under a door clear for its caption", () => {
    // The caption is drawn beneath its tile, so row 1 belongs to the door's
    // label. A threshold plate there puts words on a chequer, which at 8px is
    // two patterns competing rather than one legible label.
    for (const [chamber, facts] of EVERY_CHAMBER) {
      const plan = roomPlan(view({ chamber, facts }));
      const hasDoor = (plan?.devices ?? []).some((device) => device.sheet.startsWith("door"));
      if (!hasDoor) continue;
      for (const plate of plan?.plates ?? []) {
        expect(plate.row, `${chamber} plate on the caption row`).not.toBe(1);
      }
      for (const device of plan?.devices ?? []) {
        expect(device.row, `${chamber} device on the caption row`).not.toBe(1);
      }
    }
  });

  it("gives every room enough of the canvas to be worth looking at", () => {
    // A room much smaller than the square it is drawn on is a room floating in
    // void. The canvas is twenty tiles; a chamber using half of them vertically
    // was what the side-on bands did, and is the thing this rewrite is for.
    for (const [chamber, facts] of EVERY_CHAMBER) {
      const plan = roomPlan(view({ chamber, facts }));
      expect(plan?.rows ?? 0, `${chamber} is short`).toBeGreaterThanOrEqual(12);
      expect(plan?.cols ?? 0, `${chamber} is narrow`).toBeGreaterThanOrEqual(12);
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
    for (const phase of [
      "ENTRY",
      "LOBBY",
      "TRANSITIONING",
      "ARCHIVE",
      "FINALE",
      "ESCAPED",
    ] as const)
      expect(interlude(view({ phase }))[0], phase).not.toBe("");
  });
});

describe("the canvas", () => {
  it("leaves a whole tile of wall on every side", () => {
    expect(MAX_INTERIOR).toBe(CANVAS_TILES - 2);
  });

  describe("the shape of a room", () => {
    /** Every chamber, with facts real enough to lay its devices out. */
    const ROOMS = [
      view({ chamber: "airlock", facts: AIRLOCK_FACTS }),
      view({ chamber: "signal_room", facts: SIGNAL_FACTS }),
      view({ chamber: "blind_panel", facts: BLIND_FACTS }),
      view({ chamber: "concord_lock", facts: CONCORD_FACTS }),
    ];

    /** The floor tiles of a plan, as "col,row" keys. */
    function floorOf(plan: NonNullable<ReturnType<typeof roomPlan>>): Set<string> {
      return new Set(
        plan.tiles.filter((t) => !t.wall).map((t) => `${String(t.col)},${String(t.row)}`),
      );
    }

    it("stands every device, caption and plate on floor, in every chamber", () => {
      // The one thing a notch can break. A chamber's device layout is written
      // against its full box, so cutting a corner out of the box can leave a
      // lever standing in the void with nothing to say it went wrong.
      for (const v of ROOMS) {
        const plan = roomPlan(v);
        expect(plan, v.chamber ?? "?").not.toBeNull();
        if (!plan) continue;
        const floor = floorOf(plan);
        for (const device of plan.devices) {
          expect(floor, `${String(v.chamber)} device ${device.sheet}`).toContain(
            `${String(device.col)},${String(device.row)}`,
          );
          // A caption is drawn on the row below its device and must land on
          // floor too, or it prints over the wall.
          expect(
            device.label === undefined ||
              floor.has(`${String(device.col)},${String(device.row + 1)}`),
            `${String(v.chamber)} caption under ${device.sheet}`,
          ).toBe(true);
        }
        for (const plate of plan.plates) {
          expect(floor, `${String(v.chamber)} plate`).toContain(
            `${String(plate.col)},${String(plate.row)}`,
          );
        }
      }
    });

    it("keeps the bottom row whole, because PILOT walks it", () => {
      // `scenes.ts` puts PILOT anywhere on the last row. A notch there would
      // let the human walk out of the building.
      for (const v of ROOMS) {
        const plan = roomPlan(v);
        if (!plan) continue;
        const floor = floorOf(plan);
        for (let col = 0; col < plan.cols; col += 1) {
          expect(floor, `${String(v.chamber)} col ${String(col)}`).toContain(
            `${String(col)},${String(plan.rows - 1)}`,
          );
        }
      }
    });

    it("walls every floor tile that has void beside it", () => {
      // The proof that the outline closes. Any floor cell with a non-floor
      // orthogonal neighbour must have a wall tile on that neighbour, or the
      // room has a hole in it and you can see the canvas through the gap.
      const tiles = tilesFor(6, 4, [{ col: 0, row: 0, cols: 2, rows: 2 }]);
      const floor = new Set(
        tiles.filter((t) => !t.wall).map((t) => `${String(t.col)},${String(t.row)}`),
      );
      const wall = new Set(
        tiles.filter((t) => t.wall).map((t) => `${String(t.col)},${String(t.row)}`),
      );
      expect(floor.size).toBe(6 * 4 - 4);
      for (const cell of floor) {
        const [col, row] = cell.split(",").map(Number) as [number, number];
        for (const [dc, dr] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ] as const) {
          const side = `${String(col + dc)},${String(row + dr)}`;
          expect(floor.has(side) || wall.has(side), `${cell} -> ${side}`).toBe(true);
        }
      }
    });

    it("leaves no wall tile stranded away from the room", () => {
      // Wall is emitted only where it touches floor, which is what keeps the
      // notch reading as outside the building rather than as a grey block.
      const tiles = tilesFor(8, 8, [{ col: 0, row: 0, cols: 4, rows: 4 }]);
      const floor = new Set(
        tiles.filter((t) => !t.wall).map((t) => `${String(t.col)},${String(t.row)}`),
      );
      for (const tile of tiles.filter((t) => t.wall)) {
        const touching = [-1, 0, 1].some((dc) =>
          [-1, 0, 1].some((dr) => floor.has(`${String(tile.col + dc)},${String(tile.row + dr)}`)),
        );
        expect(touching, `${String(tile.col)},${String(tile.row)}`).toBe(true);
      }
      // The middle of the notch is outside the building and drawn as nothing.
      expect(tiles.some((t) => t.col === 0 && t.row === 0)).toBe(false);
    });

    it("gives each chamber the wall colour of the channel that owns it", () => {
      // The channel law, applied to the building. Amber is the room only PILOT
      // can read, cyan the room only KEEPER can act in.
      const accent = (v: PilotView) => roomPlan(v)?.accent;
      expect(accent(ROOMS[1] as PilotView)).toBe("pilot");
      expect(accent(ROOMS[2] as PilotView)).toBe("keeper");
      expect(accent(ROOMS[0] as PilotView)).toBe("shared");
      expect(accent(ROOMS[3] as PilotView)).toBe("shared");
    });
  });

  describe("the rule the wall art imposes on a shape", () => {
    it("cuts every notch from a corner of its box", () => {
      // `walls-out` is a nine-slice of convex corners and the pack ships no
      // concave one. A notch in the middle of an edge turns the wall in and
      // back out with two convex corners butted together, which draws the
      // border twice and reads as a crack in the building. This is the rule
      // that keeps a future chamber from shipping that artifact.
      for (const [id, shape] of Object.entries(CHAMBER_NOTCHES)) {
        for (const n of shape.notches) {
          const onLeft = n.col === 0;
          const onRight = n.col + n.cols === shape.cols;
          const onTop = n.row === 0;
          const onBottom = n.row + n.rows === shape.rows;
          expect(
            (onLeft || onRight) && (onTop || onBottom),
            `${id} notch at ${String(n.col)},${String(n.row)} is not on a corner`,
          ).toBe(true);
        }
      }
    });

    it("proves a mid-edge notch really does double the wall", () => {
      // The evidence for the rule above rather than a restatement of it. Cut
      // two tiles out of the middle of the top edge and the wall tiles that
      // close the cut are two convex corners standing side by side, which is
      // the doubled border. A corner notch never produces that pair.
      const CONVEX: readonly number[] = [
        SLICE.topLeft,
        SLICE.topRight,
        SLICE.bottomLeft,
        SLICE.bottomRight,
      ];
      const adjacentCorners = (notch: { col: number; row: number; cols: number; rows: number }) =>
        tilesFor(8, 8, [notch])
          .filter((t) => t.wall && CONVEX.includes(t.frame))
          .some((t, _i, all) =>
            all.some((o) => o.row === t.row && o.col === t.col + 1 && o.frame !== t.frame),
          );

      expect(adjacentCorners({ col: 3, row: 0, cols: 2, rows: 2 })).toBe(true);
      expect(adjacentCorners({ col: 0, row: 0, cols: 2, rows: 2 })).toBe(false);
    });
  });
});
