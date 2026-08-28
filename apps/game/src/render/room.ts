/**
 * What is in the room the pair is standing in, decided without a canvas.
 *
 * This replaces the side-on `rooms.ts` (D-035). The station used to be drawn
 * as a section, every floor at once, with each chamber a band of flat
 * rectangles; it is now one room seen from above, built from the art pack's
 * tiles. The reason for the change is that the pack is top-down and a top-down
 * tileset drawn into a side elevation looks borrowed, but the reason it is an
 * improvement is simpler: a floor plan has room for the mechanism, and the
 * band never did. The Signal Room's six keys had twenty-four pixels each.
 *
 * The split this module is on one side of has not moved. **Everything a frame
 * has to decide is decided here, and `scenes.ts` only paints.** That is the
 * half that can be wrong in a way nobody notices by looking, so it is the half
 * with tests.
 *
 * Two rules from this app's CLAUDE.md govern every layout below.
 *
 * **A glyph's name is KEEPER's half of the split and never appears on PILOT's
 * side.** A device carries its *position* or its *number* as a caption, which
 * is what KEEPER can be told to act on, and wears the glyph as a drawing.
 *
 * **Colour is which party perceives the thing, and it never bends.** A device's
 * channel picks the directory its sprite is loaded from, so a lever cannot
 * acquire a colour without acquiring the meaning that goes with it.
 */

import type { PilotView } from "@semaphore/protocol";
import type { ChannelSheet } from "./atlas.js";
import type { RenderChannel } from "./palette.js";
import { FRAMES, PLATE } from "./atlas.js";

/**
 * The canvas, in tiles.
 *
 * Twenty tiles of sixteen pixels is the 320x320 native resolution D-031 pinned,
 * unchanged: the room got bigger because the heads-up display left the canvas
 * for the DOM console (D-036), not because the canvas did.
 */
export const CANVAS_TILES = 20;

/** The wall is one tile thick, so this is the largest interior that fits. */
export const MAX_INTERIOR = CANVAS_TILES - 2;

/**
 * One device on the floor.
 *
 * Coordinates are tiles, local to the room's interior, so a chamber does not
 * know where on the canvas it will be drawn. That is the same independence the
 * old floor-local layouts had and it is kept for the same reason: a room that
 * reached for an absolute canvas constant could not be moved or resized
 * without every chamber being wrong by the same amount.
 */
export interface Device {
  readonly col: number;
  readonly row: number;
  /** Which sheet to draw, and therefore what the thing is. */
  readonly sheet: ChannelSheet;
  /** Who perceives it. Picks the sprite's colour, and is not decoration. */
  readonly channel: RenderChannel;
  readonly frame: number;
  /** Drawn under the device. Never a glyph's name (see this module's docs). */
  readonly label?: string;
  /** A glyph id, drawn on a plate one tile above the device. */
  readonly glyph?: string;
  /** Present but inert: drawn at reduced alpha rather than removed. */
  readonly dim?: boolean;
}

/** A decorative floor plate. Carries no fact and is never channel-coded. */
export interface Plate {
  readonly col: number;
  readonly row: number;
  readonly frame: number;
}

/** Everything the scene needs to draw one frame of one room. */
export interface RoomPlan {
  /** Interior size in tiles. The wall is drawn around it. */
  readonly cols: number;
  readonly rows: number;
  readonly devices: readonly Device[];
  readonly plates: readonly Plate[];
  /**
   * The `AUDIBLE` fact. Both parties perceive it, so it is the one thing on
   * screen PILOT never has to describe.
   */
  readonly sound: string | null;
  /** Whether the room's own success condition is met. Drives the bone flash. */
  readonly solved: boolean;
}

/** Human names for the four chambers, and for the phases with no room at all. */
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
 * share no shape, so every read goes through one of these. They return a
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
 * Spread `count` things across `span` tiles, evenly, on whole tiles.
 *
 * Whole tiles because a sprite on a half tile is the fractional-scaling
 * shimmer D-031 exists to prevent, arriving through the back door. One
 * function because three of the four chambers lay out a bank of identical
 * devices and they should not each round differently.
 */
export function spread(count: number, span: number, start = 0): readonly number[] {
  if (count <= 0) return [];
  if (count === 1) return [start + Math.floor((span - 1) / 2)];
  const step = (span - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => start + Math.round(i * step));
}

/**
 * The Airlock: three levers and the door they open.
 *
 * The levers are PILOT's channel because their identity is the lit glyph and
 * nothing else. KEEPER can feel all three and they are identical to the touch,
 * which is exactly the asymmetry the room is built on, so the amber is not
 * decoration: it is the statement that this is the half only PILOT holds.
 *
 * The door is shared and it is drawn in the wall rather than on the floor,
 * because a door in the middle of a room is a prop and a door in a wall is a
 * way out.
 */
function airlock(facts: Readonly<Record<string, unknown>>): RoomPlan {
  const cols = 14;
  const rows = 8;
  const glyphByLever = record(facts, "glyphByLever");
  const pulled = new Set(list(facts, "pulled").map(String));
  const doorOpen = bool(facts, "doorOpen");
  const levers = Object.keys(glyphByLever).sort();

  const devices: Device[] = [];
  const door = spread(3, 4, Math.floor((cols - 4) / 2));
  for (const col of door) {
    devices.push({
      col,
      row: 0,
      sheet: "door",
      channel: "shared",
      frame: doorOpen ? FRAMES.door.open : FRAMES.door.shut,
    });
  }
  // One caption for the bank of three, under the middle leaf, so the door
  // reads as one door rather than as three narrow ones.
  const middle = door[1];
  if (middle !== undefined) {
    devices.push({
      col: middle,
      row: 0,
      sheet: "door",
      channel: "shared",
      frame: doorOpen ? FRAMES.door.open : FRAMES.door.shut,
      label: doorOpen ? "DOOR OPEN" : "DOOR SEALED",
    });
  }

  // The levers sit on the row below the glyph plates, which is why they are
  // not on the last row: the plate needs the tile above each one.
  const leverRow = rows - 3;
  spread(levers.length, cols - 4, 2).forEach((col, index) => {
    const lever = levers[index];
    if (lever === undefined) return;
    const thrown = pulled.has(lever);
    devices.push({
      col,
      row: leverRow,
      sheet: "lever",
      channel: "pilot",
      frame: thrown ? FRAMES.lever.down : FRAMES.lever.up,
      // The lever's *position*, which is what KEEPER can be told to pull. The
      // glyph's name appears nowhere: it lives in KEEPER's stroke table.
      label: lever.replace(/^lever_/, "").toUpperCase(),
      glyph: String(glyphByLever[lever] ?? ""),
      dim: thrown,
    });
  });

  return {
    cols,
    rows,
    devices,
    // A chequered threshold in front of the door: the room saying which way
    // out is, without a caption doing it.
    plates: door.map((col) => ({ col, row: 1, frame: PLATE.chequer })),
    sound: text(facts, "lastSound"),
    solved: doorOpen,
  };
}

/**
 * The Signal Room: six glyph keys, three strike lamps, and this session's page.
 *
 * `manualPageState` is drawn because PILOT can see whether the page has been
 * scratched over and KEEPER cannot. It is the visible half of the trust
 * puzzle, and leaving it undrawn would remove the only cue the human has that
 * their partner is reading something false.
 */
function signalRoom(facts: Readonly<Record<string, unknown>>): RoomPlan {
  const cols = 16;
  const rows = 11;
  const glyphByKey = record(facts, "glyphByKey");
  const pressed = new Set(list(facts, "pressedSequence").map(String));
  const strikes = num(facts, "strikes");
  const keys = Object.keys(glyphByKey).sort((a, b) => Number(a) - Number(b));

  const devices: Device[] = [];
  // Two rows of three, each key with its glyph plate on the tile above it.
  const columns = spread(3, 8, 2);
  keys.forEach((key, index) => {
    const col = columns[index % 3];
    if (col === undefined) return;
    const down = pressed.has(key);
    devices.push({
      col,
      row: 3 + Math.floor(index / 3) * 4,
      sheet: "button",
      channel: "pilot",
      frame: down ? FRAMES.button.pressed : FRAMES.button.up,
      // The number is how KEEPER names a key. The shape is what PILOT has to
      // get across, and it is the only thing on the face.
      label: String(key),
      glyph: String(glyphByKey[key] ?? ""),
      dim: down,
    });
  });

  // Three strike lamps, because the room vents on the third. Shared: both
  // parties know how close they are, and that shared clock is what makes the
  // vandalised page dangerous rather than merely wrong.
  for (let i = 0; i < 3; i += 1) {
    devices.push({
      col: cols - 3,
      row: 2 + i * 2,
      sheet: "led",
      channel: "shared",
      frame: i < strikes ? FRAMES.led.on : FRAMES.led.off,
      ...(i === 2 ? { label: "STRIKES" } : {}),
      dim: i >= strikes,
    });
  }

  const page = text(facts, "manualPageState");
  const plates: Plate[] = columns.map((col) => ({ col, row: 8, frame: PLATE.rivets }));
  if (page !== null) {
    const marked = page === "vandalised";
    devices.push({
      col: cols - 3,
      row: rows - 2,
      sheet: "pad",
      channel: "pilot",
      frame: marked ? FRAMES.pad.lit : FRAMES.pad.dark,
      // It has to say which of the two states it is: the whole trust puzzle
      // turns on PILOT noticing.
      label: marked ? "PAGE MARKED" : "PAGE OK",
      dim: !marked,
    });
  }

  return {
    cols,
    rows,
    devices,
    plates,
    sound: text(facts, "lastSound"),
    // No `solved` fact reaches PILOT here, and the correct sequence is a
    // subset of the six keys whose size only the server knows. Deriving one
    // from `pressedSequence` would be the client guessing at the answer, which
    // is the one thing it may never do. The room is solved by leaving it.
    solved: false,
  };
}

/** Gauge travel, matching the chamber's own clamp of 0 to 8. */
export const GAUGE_MAX = 8;

/**
 * The Blind Panel: four needles PILOT reads and four dials KEEPER turns.
 *
 * A gauge is a column of lamps rather than a bar, which is the one place the
 * top-down rewrite changed what a chamber *is* rather than how it is drawn. It
 * is a better fit for the room: the puzzle is read aloud one number at a time
 * ("the third one is at five"), and a column of lit lamps is countable across
 * a room in a way a bar's height is not.
 *
 * The dials are drawn as well as the gauges, in cyan, because the room's point
 * is that the two banks are not wired in the order anyone would assume. Seeing
 * the dial bank without any indication of which gauge it drives is the human
 * half of that puzzle, so the dial devices deliberately carry no value.
 */
function blindPanel(facts: Readonly<Record<string, unknown>>): RoomPlan {
  const cols = 16;
  const rows = 12;
  const values = record(facts, "gaugeValues");
  const targets = record(facts, "targets");
  const gauges = Object.keys(values).sort((a, b) => Number(a) - Number(b));
  const solved = bool(facts, "solved");

  const devices: Device[] = [];
  const plates: Plate[] = [];
  const columns = spread(gauges.length, cols - 4, 2);
  gauges.forEach((gauge, index) => {
    const col = columns[index];
    if (col === undefined) return;
    const value = Math.max(0, Math.min(GAUGE_MAX, num(values, gauge)));
    const target = num(targets, gauge);

    // Lamps from the bottom up, so a gauge fills the way a column of liquid
    // would. The unlit ones are drawn rather than omitted: a needle at zero
    // and a needle missing look the same otherwise, and they mean very
    // different things.
    for (let step = 0; step < GAUGE_MAX; step += 1) {
      const lit = step < value;
      devices.push({
        col,
        row: GAUGE_MAX - 1 - step,
        sheet: "led",
        channel: "pilot",
        frame: lit ? FRAMES.led.on : FRAMES.led.off,
        dim: !lit,
        ...(step === 0 ? { label: `${String(value)}/${String(target)}` } : {}),
      });
    }

    // KEEPER's dial, under the gauge it does not necessarily drive.
    devices.push({
      col,
      row: rows - 2,
      sheet: "switch",
      channel: "keeper",
      frame: value === target ? FRAMES.switch.on : FRAMES.switch.off,
      label: `DIAL ${String(index + 1)}`,
    });
    plates.push({ col, row: rows - 3, frame: PLATE.rivets });
  });

  const clicks = facts.lastClicks;
  return {
    cols,
    rows,
    devices,
    plates,
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

/** How many tiles of beam the grip clock runs across at full stamina. */
export const GRIP_TILES = 10;

/**
 * The Concord Lock: the cipher wheel, the bolts, the grip clock and the door.
 *
 * The grip clock is a laser beam that shortens rather than a bar that empties.
 * It is the only thing in the game both parties have to read at once under
 * time pressure, and a beam retracting toward its turret is legible at a
 * glance from anywhere in the room, which a bar in a corner was not.
 */
function concordLock(facts: Readonly<Record<string, unknown>>): RoomPlan {
  const cols = 15;
  const rows = 12;
  const offset = num(facts, "cipherOffset");
  const bolts = num(facts, "boltsAligned");
  const armed = bool(facts, "armed");
  const window_ = num(facts, "staminaWindowMs", 1);
  const remaining = num(facts, "staminaRemainingMs");
  const attempts = list(facts, "attemptedPhrases").length;

  const devices: Device[] = [];

  // The outer door, three leaves in the top wall. Locked until the bolts are
  // aligned, and then it is simply a door.
  const door = spread(3, 4, Math.floor((cols - 4) / 2));
  const open = bolts >= 3;
  for (const col of door) {
    devices.push({
      col,
      row: 0,
      sheet: open ? "door" : "door-locked",
      channel: "shared",
      frame: open ? FRAMES.door.open : FRAMES.doorLocked.shut,
    });
  }

  // The cipher wheel: PILOT's, because the offset is on its face and KEEPER
  // has only the phrase.
  devices.push({
    col: 2,
    row: 3,
    sheet: "pad",
    channel: "pilot",
    frame: FRAMES.pad.lit,
    label: `WHEEL ${String(offset)}`,
  });

  // Three bolts, shared, because both parties are told how far along the lock is.
  spread(3, 5, cols - 8).forEach((col, index) => {
    devices.push({
      col,
      row: 3,
      sheet: "led",
      channel: "shared",
      frame: index < bolts ? FRAMES.led.on : FRAMES.led.off,
      label: `BOLT ${String(index + 1)}`,
      dim: index >= bolts,
    });
  });

  // The release bar, as a turret, and the grip clock as its beam. PILOT holds
  // the bar; the beam is how long they have left to hold it.
  const gripRow = rows - 3;
  devices.push({
    col: 1,
    row: gripRow,
    sheet: "turret",
    channel: "shared",
    frame: armed ? FRAMES.turret.firing : FRAMES.turret.idle,
    label: armed ? "UNDER TENSION" : "SLACK",
  });
  const held = window_ > 0 ? Math.max(0, Math.min(1, remaining / window_)) : 0;
  if (armed) {
    // At least one tile while the grip holds, because a beam that vanishes
    // reads as a rendering fault at exactly the moment nobody can afford to
    // wonder.
    const length = Math.max(1, Math.round(GRIP_TILES * held));
    for (let i = 0; i < length; i += 1) {
      devices.push({ col: 2 + i, row: gripRow, sheet: "laser", channel: "shared", frame: 0 });
    }
  }

  devices.push({
    col: cols - 2,
    row: gripRow,
    sheet: "box",
    channel: "shared",
    frame: 0,
    label: `${String(attempts)} TRIED`,
    dim: true,
  });

  return {
    cols,
    rows,
    devices,
    plates: door.map((col) => ({ col, row: 1, frame: PLATE.chequer })),
    sound: text(facts, "lastSound"),
    solved: open,
  };
}

/**
 * The phases that have a title but no room, and what the console calls them.
 *
 * These are not chambers, so `facts` is empty by construction and there is
 * nothing to draw. They still need a name, because a console that goes blank
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
 * Null rather than an empty plan, so a caller has to decide what to draw in
 * the Archive instead of silently rendering a room with no furniture in it.
 */
export function roomPlan(view: PilotView): RoomPlan | null {
  const { facts, chamber } = view;
  // An empty `facts` is the server saying there is no room here, whatever
  // `machine.chamber` still names (D-025). Trusting the chamber alone would
  // draw the Blind Panel behind the Archive's dead monitor.
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

/**
 * The empty room drawn during a phase that has no chamber in it.
 *
 * A real room with a real floor rather than a blank canvas, because the
 * Archive is a designed beat and the finale is the moment the pair has played
 * fifteen minutes for. Both deserve somewhere to stand.
 */
export const INTERLUDE_PLAN: RoomPlan = {
  cols: 12,
  rows: 8,
  devices: [],
  plates: [],
  sound: null,
  solved: false,
};

/** The console's room name, in every phase including the ones with no room. */
export function roomTitle(view: PilotView): string {
  if (view.chamber !== null && Object.keys(view.facts).length > 0) {
    return ROOM_TITLES[view.chamber] ?? view.chamber.toUpperCase();
  }
  return PHASE_TITLES[view.phase] ?? view.phase;
}

/**
 * What the room says when there is no room to draw.
 *
 * The phases between chambers are not dead air. A first pass drew "NO ROOM
 * HERE" in all of them, which is accurate and reads as a rendering fault at
 * exactly the moment the game should be landing.
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
