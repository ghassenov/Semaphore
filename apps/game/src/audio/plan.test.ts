/**
 * The audio layer's decisions, which are the only part of it a test can reach.
 *
 * Web Audio does not exist in the test environment and never will, so the
 * split this file relies on is load-bearing rather than tidy: everything that
 * chooses lives in `plan.ts` and is checked here, and everything that makes a
 * noise chooses nothing.
 */

import { describe, expect, it } from "vitest";
import { CHAMBER_ORDER, type PilotView } from "@semaphore/protocol";
import {
  acousticFor,
  DETENT_MS,
  KEEPER_AT,
  occlusionHz,
  placeFor,
  resolutionFor,
  scoreFor,
  semitone,
  soundingFor,
  TOOL_NOTES,
  toolPitch,
} from "./plan.js";
import { THEME_CHORDS, THEME_GROUND } from "./voices.js";

const CHAMBER_MS = 180_000;

/**
 * What plays whatever the clock says: the ambience, the warm theme and the
 * drone. Named rather than repeated, because the point of most of these
 * assertions is what is added *to* it.
 */
const BASE = ["bed", "theme", "drone"] as const;

function viewOf(over: Partial<PilotView>): PilotView {
  return {
    phase: "IN_CHAMBER",
    chamber: "blind_panel",
    mode: "full",
    designation: "KEEPER",
    remainingMs: CHAMBER_MS,
    retries: 0,
    facts: {},
    notes: [],
    ghost: null,
    assist: null,
    blackout: false,
    objective: null,
    progress: null,
    seq: 0,
    ...over,
  };
}

describe("the tension layers", () => {
  it("adds each layer at the fraction doc 06 names", () => {
    const at = (left: number) => scoreFor(CHAMBER_MS * left, CHAMBER_MS).layers;
    expect(at(1)).toEqual(BASE);
    expect(at(0.75)).toEqual(BASE);
    expect(at(0.4)).toEqual([...BASE, "pulse"]);
    expect(at(0.2)).toEqual([...BASE, "pulse", "arpeggio"]);
    expect(at(0.05)).toEqual([...BASE, "pulse", "arpeggio", "heartbeat"]);
  });

  it("only ever adds, never swaps", () => {
    // The whole design is that tension accumulates. A layer that appeared and
    // then left would read as the clock having been given back.
    let held: readonly string[] = [];
    for (let left = 100; left >= 0; left -= 1) {
      const layers = scoreFor((CHAMBER_MS * left) / 100, CHAMBER_MS).layers;
      for (const was of held) expect(layers, `lost ${was} at ${String(left)}%`).toContain(was);
      held = layers;
    }
  });

  it("never takes the theme away, at any point on the clock", () => {
    // It is the station's resting state rather than a tension layer: what
    // happens as the clock drains is that harder things arrive on top of it.
    // Under the heartbeat it ducks, which is `bed`, not a layer leaving.
    for (let left = 100; left >= -20; left -= 1) {
      const score = scoreFor((CHAMBER_MS * left) / 100, CHAMBER_MS);
      expect(score.layers, `lost the theme at ${String(left)}%`).toContain("theme");
    }
    expect(scoreFor(null, 0).layers).toContain("theme");
  });

  it("ducks the bed only under the heartbeat", () => {
    expect(scoreFor(CHAMBER_MS * 0.2, CHAMBER_MS).bed).toBe(1);
    expect(scoreFor(CHAMBER_MS * 0.05, CHAMBER_MS).bed).toBeLessThan(1);
  });

  it("never escalates an untimed session", () => {
    // Practice is the preset for looking at the station without being hurried
    // (doc 02 section 7). A heartbeat would hurry it.
    expect(scoreFor(null, 0).layers).toEqual(BASE);
    expect(scoreFor(null, CHAMBER_MS).layers).toEqual(BASE);
    expect(scoreFor(CHAMBER_MS, 0).layers).toEqual(BASE);
  });

  it("treats a chamber past its deadline as the last tenth, not as fresh", () => {
    // A negative remainder arrives between the deadline passing and the
    // DEADLOCK frame landing. Clamping it to zero keeps the heartbeat going;
    // dividing it raw would produce a negative fraction, which is less than
    // every threshold and would coincidentally still be right - but only by
    // accident, and it would break the moment a threshold went negative.
    expect(scoreFor(-4000, CHAMBER_MS).layers).toContain("heartbeat");
  });
});

describe("what a frame sounds like", () => {
  it("sounds a cue once per event, not once per frame", () => {
    const first = viewOf({ seq: 4, facts: { lastCue: "klaxon" } });
    expect(soundingFor(null, first)).toEqual({ cue: "klaxon", count: 1 });
    // The same frame again: the view is pushed on a timer as well as on an
    // action, so most frames carry an event that has already been heard.
    expect(soundingFor(first, first)).toBeNull();
  });

  it("sounds two identical rotations twice", () => {
    // The reason `seq` is on the view at all. Two rotations that each register
    // three clicks produce frames identical in every other field, and PILOT
    // has to hear six detents: doc 02 section 3.3 makes the count the puzzle.
    const once = viewOf({ seq: 9, facts: { lastClicks: 3 } });
    const twice = viewOf({ seq: 10, facts: { lastClicks: 3 } });
    expect(soundingFor(null, once)).toEqual({ cue: "detent", count: 3 });
    expect(soundingFor(once, twice)).toEqual({ cue: "detent", count: 3 });
  });

  it("is silent when a rotation registers nothing", () => {
    // Silence is the honest sound of zero detents, and it is informative: it
    // says the linkage is against a bound. The subtitle still says so in
    // words, and the tool call's own thump says KEEPER did something.
    const view = viewOf({ seq: 3, facts: { lastClicks: 0 } });
    expect(soundingFor(null, view)).toBeNull();
  });

  it("says nothing about a frame with no audible fact", () => {
    expect(soundingFor(null, viewOf({ seq: 1 }))).toBeNull();
    expect(soundingFor(null, viewOf({ seq: 1, facts: { doorOpen: true } }))).toBeNull();
  });

  it("refuses a cue the client cannot synthesise", () => {
    // `facts` is `Record<string, unknown>` off the wire, so this is the only
    // thing standing between a renamed cue and a crash inside the synth table.
    const view = viewOf({ seq: 2, facts: { lastCue: "trumpets" } });
    expect(soundingFor(null, view)).toBeNull();
  });

  it("caps a detent run, however many clicks a frame claims", () => {
    const view = viewOf({ seq: 2, facts: { lastClicks: 5000 } });
    const sounding = soundingFor(null, view);
    expect(sounding?.count).toBeLessThanOrEqual(16);
    // And the run it produces still has to be shorter than a chamber.
    expect((sounding?.count ?? 0) * DETENT_MS).toBeLessThan(5000);
  });
});

/* ------------------------------------------------- the station as a place -- */

describe("where a sound stands", () => {
  it("puts KEEPER in the east wall, where the body is drawn", () => {
    // `render/keeper.ts` draws the body into the east wall in every room, and
    // `KEEPER_ALCOVE` reserves the same spot for it. The thump has to agree
    // with the silhouette or the one sound that says where your partner is
    // says the wrong thing.
    expect(KEEPER_AT.x).toBeGreaterThan(0.5);
    expect(Math.abs(KEEPER_AT.z)).toBeLessThan(0.5);
  });

  it("gives every chamber a mechanism to sound from, inside its own walls", () => {
    for (const chamber of CHAMBER_ORDER) {
      const place = placeFor(chamber);
      expect(Math.abs(place.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(place.z)).toBeLessThanOrEqual(1);
      // Never on the open south face the camera looks through: a mechanism
      // sounding from behind the player is a mechanism they will turn to look
      // for and not find.
      expect(place.z).toBeGreaterThan(0);
    }
  });

  it("falls back to the middle distance between rooms", () => {
    expect(placeFor(null)).toEqual({ x: 0, z: 0.6 });
  });
});

describe("how a room rings", () => {
  it("gives every room its own acoustic", () => {
    const tails = CHAMBER_ORDER.map((c) => acousticFor(c).seconds);
    expect(new Set(tails).size).toBeGreaterThan(1);
  });

  it("makes the tall room ring longest and the cluttered one driest", () => {
    // Not taste: the Concord Lock is a tower and the Blind Panel is low and
    // half-full of machinery. The second one also matters mechanically - it is
    // the room where a count has to be picked out of the reverb.
    expect(acousticFor("concord_lock").seconds).toBeGreaterThan(acousticFor("signal_room").seconds);
    expect(acousticFor("blind_panel").seconds).toBeLessThan(acousticFor("airlock").seconds);
  });

  it("keeps every tail a length a convolver can actually hold", () => {
    for (const chamber of [...CHAMBER_ORDER, null]) {
      const { seconds, decay } = acousticFor(chamber);
      expect(seconds).toBeGreaterThan(0.2);
      expect(seconds).toBeLessThan(8);
      expect(decay).toBeGreaterThan(1);
    }
  });
});

describe("how far away KEEPER sounds", () => {
  it("opens up as PILOT walks toward the alcove", () => {
    expect(occlusionHz(0)).toBeGreaterThan(occlusionHz(1));
    expect(occlusionHz(1)).toBeGreaterThan(occlusionHz(2));
  });

  it("stops opening at the wall and stops closing across the room", () => {
    expect(occlusionHz(-1)).toBe(occlusionHz(0));
    expect(occlusionHz(9)).toBe(occlusionHz(2));
  });

  it("stays muffled even with your ear against the wall", () => {
    // KEEPER is *inside* the wall. Standing next to it should bring its hands
    // into focus, never into the room.
    expect(occlusionHz(0)).toBeLessThan(2000);
  });
});

/* ------------------------------------------ what KEEPER's hands sound like -- */

/** The tools registered together, by tier, from `webmcp/tools.*`. */
const ROOMS: readonly (readonly string[])[] = [
  [
    "get_status",
    "describe_chamber",
    "inspect",
    "read_manual",
    "read_note",
    "write_note",
    "request_assistance",
  ],
  ["read_station_log"],
  ["pull_lever"],
  ["press_key", "reset_sequence"],
  ["rotate_dial", "pilot_rotate_dial"],
  ["read_ciphertext", "get_lock_state", "align_bolt", "speak_passphrase"],
];

/** How far apart two frequencies are, in semitones. */
const apart = (a: number, b: number) => Math.abs(12 * Math.log2(a / b));

/** The same, in whole semitones, which is what the table is written in. */
const gapBetween = (a: string, b: string) => Math.abs((TOOL_NOTES[a] ?? 0) - (TOOL_NOTES[b] ?? 0));

describe("the note each tool speaks with", () => {
  it("holds the tools alive in one room at least a minor third apart", () => {
    // The check that replaces "a hash gives every tool its own note for free".
    // It did not: a hash is uniform over the *name*, not over the ear. Three
    // semitones is the interval an untrained ear reliably hears as a different
    // thing rather than as that again, slightly off.
    for (const room of ROOMS) {
      const withPersistent = [...room, ...(ROOMS[0] ?? [])];
      const names = [...new Set(withPersistent)];
      // Compared in whole semitones off the table rather than in hertz. The
      // round trip through a frequency and back lands a written 3 on
      // 2.9999999999999996, and a test that fails by a rounding error gets a
      // constant nudged rather than believed.
      const tooClose: string[] = [];
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const a = names[i] as string;
          const b = names[j] as string;
          if (gapBetween(a, b) < 3) tooClose.push(`${a}/${b}`);
        }
      }
      expect(tooClose).toEqual([]);
    }
  });

  it("keeps every note in A natural minor, like the theme it plays under", () => {
    // A tool call arrives ten or twenty times a chamber, underneath the score.
    // A pitch outside the key is interference rather than music, and nothing in
    // this pipeline can hear one.
    const IN_KEY = new Set([0, 2, 3, 5, 7, 8, 10]);
    for (const [tool, note] of Object.entries(TOOL_NOTES)) {
      expect({ tool, inKey: IN_KEY.has(((note % 12) + 12) % 12) }).toMatchObject({ inKey: true });
    }
  });

  it("gives an unlisted tool the root rather than nothing", () => {
    expect(toolPitch("a_tool_nobody_has_written_yet")).toBe(semitone(0));
  });
});

/* ------------------------------------------------ the score, scored in bits -- */

describe("resolution", () => {
  it("resolves nothing while the meter is not running", () => {
    // Outside a chamber, and in every benchmark session, where doc 07 section
    // 2.3 turns CONCORD off so a HUD element cannot contaminate what is being
    // measured. A score keyed to it is another such element.
    expect(resolutionFor(null)).toBe(0);
  });

  it("resolves nothing while the room is still wide open", () => {
    expect(resolutionFor(10)).toBe(0);
    expect(resolutionFor(2)).toBe(0);
  });

  it("closes as the pair converges, and is complete when they know", () => {
    expect(resolutionFor(1)).toBeGreaterThan(0);
    expect(resolutionFor(0.5)).toBeGreaterThan(resolutionFor(1));
    expect(resolutionFor(0)).toBe(1);
  });

  it("never leaves the range a gain can take", () => {
    for (const bits of [-1, 0, 0.4, 1, 1.5, 3, 12]) {
      expect(resolutionFor(bits)).toBeGreaterThanOrEqual(0);
      expect(resolutionFor(bits)).toBeLessThanOrEqual(1);
    }
  });
});

describe("the ground the theme resolves onto", () => {
  it("adds no pitch class the theme did not already have", () => {
    // The constraint that makes this the *only* available resolution: the
    // theme has no dominant and no leading note by construction, and its mode
    // is missing its second. An open fifth on the tonic grounds the harmony
    // without moving it, so it cannot smuggle either of them back in.
    const classOf = (hz: number) => Math.round(12 * Math.log2(hz / 55)) % 12;
    const chordClasses = new Set(THEME_CHORDS.flat().map(classOf));
    for (const hz of THEME_GROUND) expect(chordClasses.has(classOf(hz))).toBe(true);
  });

  it("is a perfect fifth, below everything else in the piece", () => {
    const [root, fifth] = THEME_GROUND as [number, number];
    expect(apart(fifth, root)).toBeCloseTo(7, 1);
    expect(root).toBeLessThan(Math.min(...THEME_CHORDS.flat()));
  });
});
