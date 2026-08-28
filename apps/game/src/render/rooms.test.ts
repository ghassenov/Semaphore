/**
 * The room's geometry, tested without a canvas.
 *
 * `roomLayout` is pure and takes only a `PilotView`, which is what makes this
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
import { WALL_PAD_WIDTH, WALL_PAD_X, textWidth } from "./hud.js";
import {
  CAPTION_HEIGHT,
  FLOOR_Y,
  GRATE_X,
  NATIVE_HEIGHT,
  NATIVE_WIDTH,
  ROOM_BOTTOM,
  ROOM_TOP,
  interlude,
  roomLayout,
  roomTitle,
} from "./rooms.js";

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

describe("roomLayout", () => {
  it("draws nothing when the pair is not standing in a room", () => {
    // The Archive keeps `machine.chamber` set so the machine knows which room
    // was last entered (D-025). Drawing from that alone would put the Blind
    // Panel behind the Archive's ghost monitor.
    expect(roomLayout(view({ phase: "ARCHIVE", chamber: "blind_panel", facts: {} }))).toBeNull();
    expect(roomLayout(view({ phase: "LOBBY", chamber: null, facts: {} }))).toBeNull();
  });

  it("keeps every piece inside the band the room owns", () => {
    for (const [chamber, facts] of [
      ["airlock", AIRLOCK_FACTS],
      ["signal_room", SIGNAL_FACTS],
      ["blind_panel", BLIND_FACTS],
      ["concord_lock", CONCORD_FACTS],
    ] as const) {
      const layout = roomLayout(view({ chamber, facts }));
      expect(layout, chamber).not.toBeNull();
      for (const piece of layout?.pieces ?? []) {
        expect(piece.x, `${chamber} left`).toBeGreaterThanOrEqual(0);
        expect(piece.x + piece.w, `${chamber} right`).toBeLessThanOrEqual(NATIVE_WIDTH);
        expect(piece.y, `${chamber} top`).toBeGreaterThanOrEqual(ROOM_TOP);
        expect(piece.y + piece.h, `${chamber} bottom`).toBeLessThanOrEqual(ROOM_BOTTOM);
        expect(piece.y + piece.h, `${chamber} fits the canvas`).toBeLessThanOrEqual(NATIVE_HEIGHT);
      }
    }
  });

  it("leaves KEEPER's side of the grate clear of room furniture", () => {
    // The grate is the relationship: they can see each other and cannot reach
    // each other. A lever drawn behind it would be a lever PILOT could walk to.
    for (const [chamber, facts] of [
      ["airlock", AIRLOCK_FACTS],
      ["signal_room", SIGNAL_FACTS],
      ["blind_panel", BLIND_FACTS],
      ["concord_lock", CONCORD_FACTS],
    ] as const) {
      const layout = roomLayout(view({ chamber, facts }));
      for (const piece of layout?.pieces ?? []) {
        // Captions are centred under their piece and are routinely wider than
        // it, so the caption is what actually reaches the grate first.
        const reach =
          piece.label === undefined
            ? piece.x + piece.w
            : Math.max(piece.x + piece.w, piece.x + piece.w / 2 + textWidth(piece.label) / 2);
        expect(reach, `${chamber}: ${String(piece.label)} clears the grate`).toBeLessThanOrEqual(
          GRATE_X,
        );
      }
    }
  });

  describe("the airlock", () => {
    it("gives every lever the pilot channel, because only PILOT sees a glyph", () => {
      const layout = roomLayout(view({ chamber: "airlock", facts: AIRLOCK_FACTS }));
      const levers = layout?.pieces.filter((piece) => piece.channel === "pilot") ?? [];
      expect(levers).toHaveLength(3);
      expect(levers.map((piece) => piece.label)).toEqual(["cross", "spiral", "wave"]);
    });

    it("spends a lever that has been pulled", () => {
      const layout = roomLayout(view({ chamber: "airlock", facts: AIRLOCK_FACTS }));
      const byLabel = new Map(layout?.pieces.map((piece) => [piece.label, piece.active]));
      expect(byLabel.get("cross")).toBe(false);
      expect(byLabel.get("spiral")).toBe(true);
    });

    it("reads the door from the shared fact, and flashes when it opens", () => {
      const shut = roomLayout(view({ chamber: "airlock", facts: AIRLOCK_FACTS }));
      expect(shut?.solved).toBe(false);
      expect(shut?.pieces[0]?.label).toBe("DOOR SEALED");

      const open = roomLayout(
        view({ chamber: "airlock", facts: { ...AIRLOCK_FACTS, doorOpen: true } }),
      );
      expect(open?.solved).toBe(true);
      expect(open?.pieces[0]?.channel).toBe("shared");
    });

    it("carries the audible fact both parties perceive", () => {
      const layout = roomLayout(view({ chamber: "airlock", facts: AIRLOCK_FACTS }));
      expect(layout?.sound).toBe("a hard hiss of venting air");
    });
  });

  describe("the signal room", () => {
    it("lays six keys out in two rows and spends the pressed ones", () => {
      const layout = roomLayout(view({ chamber: "signal_room", facts: SIGNAL_FACTS }));
      const keys = layout?.pieces.filter((piece) => piece.label?.includes(":")) ?? [];
      expect(keys).toHaveLength(6);
      expect(new Set(keys.map((piece) => piece.y)).size).toBe(2);
      expect(keys.find((piece) => piece.label === "1:arch")?.active).toBe(false);
      expect(keys.find((piece) => piece.label === "2:knot")?.active).toBe(true);
    });

    it("lights one strike pip per strike, on the shared channel", () => {
      const layout = roomLayout(view({ chamber: "signal_room", facts: SIGNAL_FACTS }));
      const pips = layout?.pieces.filter((piece) => piece.w === 6 && piece.h === 6) ?? [];
      expect(pips.map((piece) => piece.active)).toEqual([true, false, false]);
      expect(pips.every((piece) => piece.channel === "shared")).toBe(true);
    });

    it("shows PILOT the state of this session's manual page", () => {
      const layout = roomLayout(view({ chamber: "signal_room", facts: SIGNAL_FACTS }));
      const page = layout?.pieces.find((piece) => piece.label?.startsWith("PAGE"));
      expect(page?.label).toBe("PAGE MARKED");
      expect(page?.channel).toBe("pilot");
    });

    it("never claims to be solved, because no fact says so", () => {
      // The correct sequence is a subset of the six keys whose size only the
      // server knows. Deriving a solved state here would be the client
      // guessing at the answer.
      const layout = roomLayout(
        view({
          chamber: "signal_room",
          facts: { ...SIGNAL_FACTS, pressedSequence: [1, 2, 3, 4, 5, 6] },
        }),
      );
      expect(layout?.solved).toBe(false);
    });
  });

  describe("the blind panel", () => {
    it("fills each gauge in proportion to its needle", () => {
      const layout = roomLayout(view({ chamber: "blind_panel", facts: BLIND_FACTS }));
      const columns = layout?.pieces.filter((piece) => piece.label?.includes("/")) ?? [];
      expect(columns.map((piece) => piece.label)).toEqual(["4/4", "0/6", "8/1", "2/2"]);
      // Gauge 2 reads zero, so it has a column and no fill: an empty gauge and
      // a missing gauge must not look the same.
      const fills = layout?.pieces.filter(
        (piece) => piece.channel === "pilot" && piece.label === undefined,
      );
      expect(fills).toHaveLength(3);
    });

    it("marks a gauge that has reached its target", () => {
      const layout = roomLayout(view({ chamber: "blind_panel", facts: BLIND_FACTS }));
      const active = layout?.pieces.filter(
        (piece) => piece.channel === "pilot" && piece.label === undefined && piece.active,
      );
      // Gauges 1 and 4 are on target; gauge 3 is over it.
      expect(active).toHaveLength(2);
    });

    it("draws the dial bank in KEEPER's colour and gives it no value", () => {
      const layout = roomLayout(view({ chamber: "blind_panel", facts: BLIND_FACTS }));
      const dials = layout?.pieces.filter((piece) => piece.channel === "keeper") ?? [];
      expect(dials).toHaveLength(4);
      expect(dials.map((piece) => piece.label)).toEqual(["DIAL 1", "DIAL 2", "DIAL 3", "DIAL 4"]);
    });

    it("renders the registered click count as the audible fact", () => {
      const layout = roomLayout(view({ chamber: "blind_panel", facts: BLIND_FACTS }));
      expect(layout?.sound).toBe("3 clicks registered");
      const silent = roomLayout(
        view({ chamber: "blind_panel", facts: { ...BLIND_FACTS, lastClicks: null } }),
      );
      expect(silent?.sound).toBeNull();
    });
  });

  describe("the concord lock", () => {
    it("seats one bolt piece per aligned bolt", () => {
      const layout = roomLayout(view({ chamber: "concord_lock", facts: CONCORD_FACTS }));
      const bolts = layout?.pieces.filter((piece) => piece.label?.startsWith("BOLT")) ?? [];
      expect(bolts.map((piece) => piece.active)).toEqual([true, true, false]);
      expect(layout?.solved).toBe(false);
    });

    it("solves when all three bolts are seated", () => {
      const layout = roomLayout(
        view({ chamber: "concord_lock", facts: { ...CONCORD_FACTS, boltsAligned: 3 } }),
      );
      expect(layout?.solved).toBe(true);
    });

    it("shortens the grip bar as the stamina window runs down", () => {
      const wide = roomLayout(
        view({
          chamber: "concord_lock",
          facts: { ...CONCORD_FACTS, staminaRemainingMs: 16_000 },
        }),
      );
      const narrow = roomLayout(view({ chamber: "concord_lock", facts: CONCORD_FACTS }));
      const fillOf = (pieces: readonly { w: number; active: boolean; h: number }[]) =>
        pieces.find((piece) => piece.h === 10 && piece.active)?.w ?? 0;
      expect(fillOf(wide?.pieces ?? [])).toBeGreaterThan(fillOf(narrow?.pieces ?? []));
    });

    it("draws no grip fill at all when the lock is slack", () => {
      // A bar left lit while nobody is gripping would tell the pair they have
      // time they do not have, at the one moment that is unrecoverable.
      const layout = roomLayout(
        view({ chamber: "concord_lock", facts: { ...CONCORD_FACTS, armed: false } }),
      );
      expect(layout?.pieces.filter((piece) => piece.h === 10 && piece.active)).toHaveLength(0);
    });

    it("shows PILOT the wheel offset, which only PILOT can read", () => {
      const layout = roomLayout(view({ chamber: "concord_lock", facts: CONCORD_FACTS }));
      const wheel = layout?.pieces.find((piece) => piece.label?.startsWith("WHEEL"));
      expect(wheel?.label).toBe("WHEEL 11");
      expect(wheel?.channel).toBe("pilot");
    });
  });

  it("leaves the wall pad's column clear in every chamber", () => {
    // The notepad hangs in the room's left margin and is drawn by the scene
    // rather than by `roomLayout`, so nothing else here can notice a room
    // growing leftward into it.
    for (const [chamber, facts] of [
      ["airlock", AIRLOCK_FACTS],
      ["signal_room", SIGNAL_FACTS],
      ["blind_panel", BLIND_FACTS],
      ["concord_lock", CONCORD_FACTS],
    ] as const) {
      for (const piece of roomLayout(view({ chamber, facts }))?.pieces ?? []) {
        const reach =
          piece.label === undefined
            ? piece.x
            : Math.min(piece.x, piece.x + piece.w / 2 - textWidth(piece.label) / 2);
        expect(
          reach,
          `${chamber}: ${String(piece.label)} covers the wall pad`,
        ).toBeGreaterThanOrEqual(WALL_PAD_X + WALL_PAD_WIDTH);
      }
    }
  });

  it("leaves every caption inside the room's band", () => {
    // Captions are drawn *under* their piece. One that runs past ROOM_BOTTOM
    // lands on the audible strip, which is how three lever names ended up
    // written across a sentence in the first build of this scene.
    for (const [chamber, facts] of [
      ["airlock", AIRLOCK_FACTS],
      ["signal_room", SIGNAL_FACTS],
      ["blind_panel", BLIND_FACTS],
      ["concord_lock", CONCORD_FACTS],
    ] as const) {
      for (const piece of roomLayout(view({ chamber, facts }))?.pieces ?? []) {
        if (piece.label === undefined) continue;
        expect(
          piece.y + piece.h + CAPTION_HEIGHT,
          `${chamber}: the caption on ${piece.label} runs past the room`,
        ).toBeLessThanOrEqual(ROOM_BOTTOM);
      }
    }
  });

  it("never collides two captioned pieces, caption text included", () => {
    // Fills are drawn inside their own track deliberately (the gauge column,
    // the grip bar), so they carry no caption and are exempt.
    //
    // The box tested is the piece *union its caption*, because the caption is
    // centred under the piece and is routinely wider than it. Two pieces that
    // clear each other by a pixel can still have captions that read as one
    // string, which is how "6:triangle" and "PAGE CLEAN" ended up looking like
    // a single label in the first build of the Signal Room.
    const boxOf = (piece: { x: number; y: number; w: number; h: number; label?: string }) => {
      const caption = piece.label === undefined ? 0 : textWidth(piece.label);
      const centre = piece.x + piece.w / 2;
      return {
        left: Math.min(piece.x, centre - caption / 2),
        right: Math.max(piece.x + piece.w, centre + caption / 2),
        top: piece.y,
        // The caption sits on the 8px line immediately below the piece.
        bottom: piece.y + piece.h + (piece.label === undefined ? 0 : 9),
      };
    };

    for (const [chamber, facts] of [
      ["airlock", AIRLOCK_FACTS],
      ["signal_room", SIGNAL_FACTS],
      ["blind_panel", BLIND_FACTS],
      ["concord_lock", CONCORD_FACTS],
    ] as const) {
      const captioned = (roomLayout(view({ chamber, facts }))?.pieces ?? []).filter(
        (piece) => piece.label !== undefined,
      );
      for (let i = 0; i < captioned.length; i += 1) {
        for (let j = i + 1; j < captioned.length; j += 1) {
          const a = captioned[i];
          const b = captioned[j];
          if (!a || !b) continue;
          const [boxA, boxB] = [boxOf(a), boxOf(b)];
          const apart =
            boxA.right <= boxB.left ||
            boxB.right <= boxA.left ||
            boxA.bottom <= boxB.top ||
            boxB.bottom <= boxA.top;
          expect(apart, `${chamber}: ${String(a.label)} collides with ${String(b.label)}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("survives a frame with fields it does not recognise", () => {
    // The server is free to add a fact; the client must draw the frame anyway
    // rather than dying mid-session over a field it has never seen.
    const layout = roomLayout(
      view({ chamber: "airlock", facts: { ...AIRLOCK_FACTS, somethingNew: { deep: [1, 2] } } }),
    );
    expect(layout?.pieces.length).toBeGreaterThan(0);
  });

  it("survives a frame missing the fields it expects", () => {
    const layout = roomLayout(view({ chamber: "concord_lock", facts: { armed: true } }));
    expect(layout?.title).toBe("CONCORD LOCK");
    expect(layout?.pieces.length).toBeGreaterThan(0);
  });
});

describe("roomTitle", () => {
  it("names the room when there is one", () => {
    expect(roomTitle(view({ chamber: "signal_room", facts: SIGNAL_FACTS }))).toBe("SIGNAL ROOM");
  });

  it("names the phase when there is no room, rather than going blank", () => {
    expect(roomTitle(view({ phase: "ARCHIVE", chamber: "blind_panel", facts: {} }))).toBe(
      "THE ARCHIVE",
    );
    expect(roomTitle(view({ phase: "LOBBY", chamber: null, facts: {} }))).toBe("STANDING BY");
    expect(roomTitle(view({ phase: "ESCAPED", chamber: null, facts: {} }))).toBe("ESCAPED");
  });
});

describe("the canvas the room is drawn on", () => {
  it("is 320x180, because integer scaling depends on it", () => {
    expect([NATIVE_WIDTH, NATIVE_HEIGHT]).toEqual([320, 180]);
  });

  it("leaves the floor inside the room band", () => {
    expect(FLOOR_Y).toBeGreaterThan(ROOM_TOP);
    expect(FLOOR_Y).toBeLessThan(ROOM_BOTTOM);
  });
});

describe("the phases with no room", () => {
  it("says what is happening in every one of them", () => {
    // A first pass drew "NO ROOM HERE" in all of these, which is accurate and
    // reads as a rendering fault at exactly the moment the game should land.
    for (const phase of [
      "ENTRY",
      "LOBBY",
      "TRANSITIONING",
      "ARCHIVE",
      "FINALE",
      "ESCAPED",
    ] as const) {
      const [headline] = interlude(view({ phase, chamber: null, facts: {} }));
      expect(headline.length, phase).toBeGreaterThan(0);
      expect(headline, phase).not.toContain("NO ROOM");
    }
  });

  it("gives the last frame of the game a real ending", () => {
    const [headline, instruction] = interlude(view({ phase: "ESCAPED", chamber: null, facts: {} }));
    expect(headline).toBe("THE DOOR IS OPEN");
    expect(instruction.length).toBeGreaterThan(0);
  });

  it("keeps both lines inside the canvas at the greybox font", () => {
    for (const phase of [
      "ENTRY",
      "LOBBY",
      "TRANSITIONING",
      "ARCHIVE",
      "FINALE",
      "ESCAPED",
    ] as const) {
      for (const line of interlude(view({ phase, chamber: null, facts: {} }))) {
        expect(textWidth(line), `${phase}: "${line}"`).toBeLessThanOrEqual(NATIVE_WIDTH - 8);
      }
    }
  });

  it("offers no instruction where there is nothing to do", () => {
    // Inventing one for a beat that has none is worse than silence.
    expect(interlude(view({ phase: "TRANSITIONING", chamber: null, facts: {} }))[1]).toBe("");
  });
});

describe("the blind panel's audible line", () => {
  it("is singular at one click", () => {
    // The count is puzzle-critical here - it is how KEEPER learns a linkage
    // hit its bound - so the line carrying it should not read like a stub.
    const one = roomLayout(
      view({ chamber: "blind_panel", facts: { ...BLIND_FACTS, lastClicks: 1 } }),
    );
    expect(one?.sound).toBe("1 click registered");
    const three = roomLayout(view({ chamber: "blind_panel", facts: BLIND_FACTS }));
    expect(three?.sound).toBe("3 clicks registered");
  });

  it("says nothing at all when no dial has been turned", () => {
    const none = roomLayout(
      view({ chamber: "blind_panel", facts: { ...BLIND_FACTS, lastClicks: null } }),
    );
    expect(none?.sound).toBeNull();
  });
});
