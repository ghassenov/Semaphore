/**
 * The room, as geometry, derived from one `PilotView` and nothing else.
 *
 * This module is pure on purpose. Every decision about what a chamber looks
 * like - how many levers, which are spent, where the needle sits, whether the
 * door reads open - is made here as plain numbers, and `ChamberScene` does
 * nothing but paint the result. Two things follow.
 *
 * It is testable without a canvas, a GPU or a browser, so the room's behaviour
 * is covered by ordinary unit tests rather than by looking at it.
 *
 * It is auditable against the design law in one read: the only input is
 * `PilotView`, which is `projectForPilot` output plus the machine fields, so
 * there is no path by which a `TACTILE` or `HIDDEN` fact could reach a frame
 * even if a later template asked for one.
 *
 * Everything is in native pixels on the 320x180 canvas. Greybox before art
 * (doc 06 section 11): flat rectangles in palette colours, playtested, then
 * drawn over.
 */

import type { PilotView } from "@semaphore/protocol";
import type { RenderChannel } from "./palette.js";

/** Native canvas size. Integer scaling only; see `boot.ts`. */
export const NATIVE_WIDTH = 320;
export const NATIVE_HEIGHT = 180;

/**
 * The band of the canvas the room owns. The HUD holds the rest.
 *
 * The room stops well above the floor of the canvas because every piece draws
 * its caption *underneath* itself, and a caption that runs past `ROOM_BOTTOM`
 * lands on whichever HUD panel is there. `rooms.test.ts` holds the pieces to
 * this band and `CAPTION_HEIGHT` is the margin the captions need inside it.
 */
export const ROOM_TOP = 24;
export const ROOM_BOTTOM = 120;

/** Room for one 8px caption line under the lowest piece in the room. */
export const CAPTION_HEIGHT = 10;

/** The floor line PILOT stands on, and the grate KEEPER is behind. */
export const FLOOR_Y = ROOM_BOTTOM - CAPTION_HEIGHT - 4;
export const GRATE_X = 252;

/**
 * The rightmost pixel a room's own furniture may occupy.
 *
 * Everything from `GRATE_X` rightward belongs to KEEPER, and the grate between
 * them is the relationship: the pair can see each other and cannot reach each
 * other. A lever drawn past this line is a lever PILOT could walk to, which
 * would quietly hand the human a mechanism the design gives only to the agent.
 * `rooms.test.ts` holds every chamber to it.
 */
export const ROOM_RIGHT = GRATE_X - 4;

/**
 * One drawn rectangle, with everything needed to colour and caption it.
 *
 * `channel` decides the colour and the shape marker together, which is the
 * whole reason it is on the piece rather than being chosen at paint time:
 * colour alone must never carry information, so a piece cannot acquire a
 * colour without also acquiring the marker that goes with it.
 */
export interface Piece {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly channel: RenderChannel;
  /** Drawn in the channel's dim variant when false. */
  readonly active: boolean;
  /** Caption drawn under the piece, on canvas. Never in the DOM. */
  readonly label?: string;
  /**
   * A glyph id to draw on the piece's face, rather than its name.
   *
   * This is the difference between the game and a reading exercise. A lever
   * captioned "spiral" lets PILOT say the word and be done; a lever wearing
   * the shape makes them describe it, which is the entire Airlock and most of
   * the Signal Room. The name is KEEPER's half - it is in the manual's stroke
   * table - and it must not appear on PILOT's side of the split.
   */
  readonly glyph?: string;
}

/** Everything `ChamberScene` needs to draw one frame of one room. */
export interface RoomLayout {
  /** The room's name, for the HUD's top bar. */
  readonly title: string;
  readonly pieces: readonly Piece[];
  /**
   * The `AUDIBLE` fact, as one line. Both parties perceive it, so it is drawn
   * bone-white with the double ring the legend teaches.
   */
  readonly sound: string | null;
  /** Whether the room's own success condition is met. Drives the bone flash. */
  readonly solved: boolean;
}

/** Human names for the four chambers, and the phases with no room at all. */
const ROOM_TITLES: Readonly<Record<string, string>> = {
  airlock: "AIRLOCK",
  signal_room: "SIGNAL ROOM",
  blind_panel: "BLIND PANEL",
  concord_lock: "CONCORD LOCK",
};

/**
 * A fact, narrowed.
 *
 * `PilotView.facts` is `Record<string, unknown>` because the four chambers
 * share no shape, so every read here goes through one of these. They return a
 * fallback rather than throwing: a frame drawn from a partial view is better
 * than a scene that dies mid-session because the server added a field.
 */
function num(facts: Readonly<Record<string, unknown>>, key: string, fallback = 0): number {
  const value = facts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(facts: Readonly<Record<string, unknown>>, key: string): boolean {
  return facts[key] === true;
}

function text(facts: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = facts[key];
  return typeof value === "string" ? value : null;
}

function list(facts: Readonly<Record<string, unknown>>, key: string): readonly unknown[] {
  const value = facts[key];
  return Array.isArray(value) ? value : [];
}

function record(
  facts: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  const value = facts[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The Airlock: three levers, one door.
 *
 * The levers carry the `pilot` channel because their identity is the lit glyph
 * and nothing else. KEEPER can feel all three and they are identical by
 * construction, which is exactly the asymmetry the room is built on, so the
 * amber is not decoration: it is the statement that this is the half only
 * PILOT holds.
 */
function airlock(facts: Readonly<Record<string, unknown>>): RoomLayout {
  const glyphByLever = record(facts, "glyphByLever");
  const pulled = new Set(list(facts, "pulled").map(String));
  const doorOpen = bool(facts, "doorOpen");
  const levers = Object.keys(glyphByLever).sort();

  const pieces: Piece[] = [
    {
      x: 128,
      y: ROOM_TOP + 2,
      w: 64,
      h: 34,
      channel: "shared",
      active: doorOpen,
      label: doorOpen ? "DOOR OPEN" : "DOOR SEALED",
    },
  ];

  // Levers spread evenly across the usable floor so three of them read as a
  // bank rather than a cluster, whatever the seed named them.
  const span = 150;
  levers.forEach((lever, index) => {
    const x = 46 + (levers.length > 1 ? (span / (levers.length - 1)) * index : span / 2);
    pieces.push({
      x: Math.round(x) - 9,
      y: FLOOR_Y - 30,
      w: 18,
      h: 30,
      channel: "pilot",
      active: !pulled.has(lever),
      // The lever's *position*, which is what KEEPER can be told to pull, and
      // the glyph's *shape*, which is what PILOT has to describe. The glyph's
      // name appears nowhere: it lives in KEEPER's stroke table.
      label: lever.replace(/^lever_/, "").toUpperCase(),
      glyph: String(glyphByLever[lever] ?? ""),
    });
  });

  return {
    title: ROOM_TITLES.airlock ?? "AIRLOCK",
    pieces,
    sound: text(facts, "lastSound"),
    solved: doorOpen,
  };
}

/**
 * The Signal Room: six glyph keys, a strike counter, and this session's page.
 *
 * `manualPageState` is drawn because PILOT can see whether the manual page has
 * been scratched over and KEEPER cannot. It is the visible half of the trust
 * puzzle, and leaving it undrawn would remove the only cue the human has that
 * their partner is reading something false.
 */
function signalRoom(facts: Readonly<Record<string, unknown>>): RoomLayout {
  const glyphByKey = record(facts, "glyphByKey");
  const pressed = new Set(list(facts, "pressedSequence").map(String));
  const strikes = num(facts, "strikes");
  const keys = Object.keys(glyphByKey).sort((a, b) => Number(a) - Number(b));

  const pieces: Piece[] = keys.map((key, index) => ({
    x: 46 + (index % 3) * 46,
    y: ROOM_TOP + 8 + Math.floor(index / 3) * 40,
    w: 24,
    h: 24,
    channel: "pilot" as const,
    active: !pressed.has(key),
    // The number is how KEEPER names a key. The shape is what PILOT has to get
    // across, and it is the only thing on the face.
    label: String(key),
    glyph: String(glyphByKey[key] ?? ""),
  }));

  // Three strike pips, because the room vents on the third. Shared: both
  // parties know how close they are, and that shared clock is what makes the
  // vandalised page dangerous rather than merely wrong.
  for (let i = 0; i < 3; i += 1) {
    pieces.push({
      x: 190 + i * 10,
      y: ROOM_TOP + 4,
      w: 6,
      h: 6,
      channel: "shared",
      active: i < strikes,
      ...(i === 2 ? { label: "STRIKES" } : {}),
    });
  }

  const page = text(facts, "manualPageState");
  if (page !== null) {
    // Stacked under the strike pips in the right-hand column rather than on
    // the floor. On the floor it shared a caption row with the sixth key, and
    // the two captions read as one string.
    pieces.push({
      x: 190,
      y: ROOM_TOP + 26,
      w: 56,
      h: 18,
      channel: "pilot",
      active: page === "vandalised",
      // Short, because a wider caption on this plate reaches left far enough
      // to run into the third key's glyph name. It still has to say which of
      // the two states it is: the whole trust puzzle turns on PILOT noticing.
      label: page === "vandalised" ? "PAGE MARKED" : "PAGE OK",
    });
  }

  return {
    title: ROOM_TITLES.signal_room ?? "SIGNAL ROOM",
    pieces,
    sound: text(facts, "lastSound"),
    // No `solved` fact reaches PILOT here, and the correct sequence is a
    // subset of the six keys whose size only the server knows. Deriving one
    // from `pressedSequence` would be the client guessing at the answer, which
    // is the one thing it may never do. The room is solved by leaving it.
    solved: false,
  };
}

/** Gauge travel, matching the chamber's own clamp of 0 to 8. */
const GAUGE_MAX = 8;
const GAUGE_HEIGHT = 48;

/**
 * The Blind Panel: four needles PILOT reads and four dials KEEPER turns.
 *
 * The dials are drawn as well as the gauges, in cyan, because the room's point
 * is that the two banks are not wired in the order anyone would assume. Seeing
 * the dial bank without any indication of which gauge it drives is the human
 * half of that puzzle, so the dial pieces deliberately carry no value.
 */
function blindPanel(facts: Readonly<Record<string, unknown>>): RoomLayout {
  const values = record(facts, "gaugeValues");
  const targets = record(facts, "targets");
  const gauges = Object.keys(values).sort((a, b) => Number(a) - Number(b));
  const solved = bool(facts, "solved");
  const pieces: Piece[] = [];

  gauges.forEach((gauge, index) => {
    const x = 28 + index * 40;
    const value = Math.max(0, Math.min(GAUGE_MAX, Number(values[gauge] ?? 0)));
    const target = Number(targets[gauge] ?? 0);
    const filled = Math.round((value / GAUGE_MAX) * GAUGE_HEIGHT);
    // The column, then the fill inside it. Two pieces rather than one so the
    // empty travel stays visible: a needle at zero and a needle missing look
    // the same otherwise, and they mean very different things.
    pieces.push({
      x,
      y: ROOM_TOP + 6,
      w: 20,
      h: GAUGE_HEIGHT,
      channel: "pilot",
      active: false,
      label: `${String(value)}/${String(target)}`,
    });
    if (filled > 0) {
      pieces.push({
        x,
        y: ROOM_TOP + 6 + (GAUGE_HEIGHT - filled),
        w: 20,
        h: filled,
        channel: "pilot",
        active: value === target,
      });
    }
    pieces.push({
      x: x + 2,
      y: FLOOR_Y - 18,
      w: 16,
      h: 16,
      channel: "keeper",
      active: true,
      label: `DIAL ${String(index + 1)}`,
    });
  });

  const clicks = facts.lastClicks;
  return {
    title: ROOM_TITLES.blind_panel ?? "BLIND PANEL",
    pieces,
    // Singular at one. The count is puzzle-critical in this room - it is how
    // KEEPER learns a linkage hit its bound - so the line that carries it
    // should not read like a placeholder.
    sound:
      typeof clicks === "number"
        ? `${String(clicks)} click${clicks === 1 ? "" : "s"} registered`
        : null,
    solved,
  };
}

/**
 * The Concord Lock: the cipher wheel, the bolts, and the grip clock.
 *
 * The stamina bar is the only piece in the game that has to be read by both
 * parties at once under time pressure, so it is wide, shared, and drawn last
 * where nothing can overlap it.
 */
function concordLock(facts: Readonly<Record<string, unknown>>): RoomLayout {
  const offset = num(facts, "cipherOffset");
  const bolts = num(facts, "boltsAligned");
  const armed = bool(facts, "armed");
  const window_ = num(facts, "staminaWindowMs", 1);
  const remaining = num(facts, "staminaRemainingMs");
  const attempts = list(facts, "attemptedPhrases").length;

  const pieces: Piece[] = [
    {
      x: 24,
      y: ROOM_TOP + 8,
      w: 48,
      h: 48,
      channel: "pilot",
      active: true,
      label: `WHEEL ${String(offset)}`,
    },
  ];

  for (let i = 0; i < 3; i += 1) {
    pieces.push({
      x: 84 + i * 34,
      y: ROOM_TOP + 18,
      w: 26,
      h: 26,
      channel: "shared",
      active: i < bolts,
      label: `BOLT ${String(i + 1)}`,
    });
  }

  pieces.push({
    x: 186,
    y: ROOM_TOP + 8,
    w: 60,
    h: 20,
    channel: "shared",
    active: armed,
    label: armed ? "UNDER TENSION" : "SLACK",
  });

  // The grip clock. Full width so it cannot be missed, and it collapses to
  // nothing rather than disappearing, because a bar that vanishes reads as a
  // rendering fault at exactly the moment nobody can afford to wonder.
  const track = ROOM_RIGHT - 28;
  const held = window_ > 0 ? Math.max(0, Math.min(1, remaining / window_)) : 0;
  pieces.push({
    x: 28,
    y: FLOOR_Y - 14,
    w: track,
    h: 10,
    channel: "shared",
    active: false,
    label: `${String(attempts)} phrases tried`,
  });
  if (armed && held > 0) {
    pieces.push({
      x: 28,
      y: FLOOR_Y - 14,
      w: Math.max(1, Math.round(track * held)),
      h: 10,
      channel: "shared",
      active: true,
    });
  }

  return {
    title: ROOM_TITLES.concord_lock ?? "CONCORD LOCK",
    pieces,
    sound: text(facts, "lastSound"),
    solved: bolts >= 3,
  };
}

/**
 * The phases that have a title but no room, and what the HUD calls them.
 *
 * These are not chambers, so `facts` is empty by construction and there is
 * nothing to draw. They still need a name, because a HUD that goes blank
 * during the Archive looks broken rather than deliberate.
 */
const PHASE_TITLES: Readonly<Record<string, string>> = {
  LOBBY: "STANDING BY",
  BRIEFING: "BRIEFING",
  TRANSITIONING: "MOVING",
  ARCHIVE: "THE ARCHIVE",
  FINALE: "THE DOOR",
  ESCAPED: "ESCAPED",
  FAILED: "SHIFT OVER",
};

/**
 * The room for one frame, or null when the pair is not standing in one.
 *
 * Null rather than an empty layout, so a caller has to decide what to draw in
 * the Archive instead of silently rendering a room with no furniture in it.
 */
export function roomLayout(view: PilotView): RoomLayout | null {
  const { facts, chamber } = view;
  // An empty `facts` is the server saying there is no room here, whatever
  // `machine.chamber` still names (D-025). Trusting the chamber alone would
  // draw the Blind Panel behind the Archive's ghost monitor.
  if (chamber === null || Object.keys(facts).length === 0) return null;
  switch (chamber) {
    case "airlock":
      return airlock(facts);
    case "signal_room":
      return signalRoom(facts);
    case "blind_panel":
      return blindPanel(facts);
    case "concord_lock":
      return concordLock(facts);
  }
}

/** The HUD's room name, in every phase including the ones with no room. */
export function roomTitle(view: PilotView): string {
  if (view.chamber !== null && Object.keys(view.facts).length > 0) {
    return ROOM_TITLES[view.chamber] ?? view.chamber.toUpperCase();
  }
  return PHASE_TITLES[view.phase] ?? view.phase;
}

/**
 * What the room band says when there is no room to draw.
 *
 * The phases between chambers are not dead air: the Archive is a designed
 * beat, the finale is the moment the pair has played fifteen minutes for, and
 * `ESCAPED` is the last thing anybody sees. A first pass drew "NO ROOM HERE"
 * in all of them, which is accurate and reads as a rendering fault at exactly
 * the moment the game should be landing.
 *
 * Two lines: what is happening, and what to do about it. The second is empty
 * where there is nothing to do, because inventing an instruction for a beat
 * that has none is worse than silence.
 */
export function interlude(view: PilotView): readonly [string, string] {
  switch (view.phase) {
    case "ENTRY":
      return ["THE STATION IS DARK", "YOUR AGENT OPENS THE DOOR"];
    case "LOBBY":
      return ["THE SHIFT HAS NOT BEGUN", "CHOOSE A SESSION LENGTH BELOW"];
    case "TRANSITIONING":
      return ["THE DOOR AHEAD IS OPENING", ""];
    case "ARCHIVE":
      return ["A DEAD MONITOR, STILL WARM", "KEEPER READS THE GHOST LOGS"];
    case "FINALE":
      return ["THE OUTER DOOR", "ONE THING LEFT TO DO"];
    case "ESCAPED":
      // The last frame of the game. It is worth a sentence.
      return ["THE DOOR IS OPEN", "COLD AIR, AND THE SOUND OF THE SEA"];
    default:
      return ["NOTHING TO SEE FROM HERE", ""];
  }
}
