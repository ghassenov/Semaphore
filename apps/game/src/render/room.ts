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
import { CORNER, EDGE, FRAMES, PLATE, TILE, floorFrame, wallFrame } from "./atlas.js";

/**
 * The canvas, in tiles.
 *
 * Twenty tiles of sixteen pixels is the 320x320 native resolution D-031 pinned,
 * unchanged: the room got bigger because the heads-up display left the canvas
 * for the DOM console (D-036), not because the canvas did.
 */
export const CANVAS_TILES = 20;

/**
 * The canvas, in pixels.
 *
 * Here rather than in `scenes.ts` because `station.ts` configures the scale
 * manager with it and may not import `scenes.ts`: that module imports Phaser
 * statically, and the whole point of D-026 is that the engine is fetched only
 * when a session actually begins.
 */
export const CANVAS = CANVAS_TILES * TILE;

/** The wall is one tile thick, so this is the largest interior that fits. */
export const MAX_INTERIOR = CANVAS_TILES - 2;

/**
 * A rectangle of tiles, in room-local coordinates.
 *
 * Used only to cut pieces *out* of a room. A chamber's device layout is
 * written against its full `cols` by `rows` box, so a shape that added tiles
 * outside that box would move the origin under every device in the room; a
 * shape that removes tiles the chamber never puts anything on cannot.
 */
export interface Rect {
  readonly col: number;
  readonly row: number;
  readonly cols: number;
  readonly rows: number;
}

/** One tile of the building: a piece of floor, or a piece of the wall around it. */
export interface Tile {
  readonly col: number;
  readonly row: number;
  /** Which sheet. Walls are drawn in the room's accent, floors never are. */
  readonly wall: boolean;
  readonly frame: number;
}

/**
 * The floor and the wall around it, for a room of a given shape.
 *
 * A room used to be a rectangle painted with one flat tile and ringed by a
 * nine-slice. Both halves are chosen from the neighbours now, which is what
 * buys the shape: notch a corner out and the floor grows its own inset edge
 * along the cut and the wall turns the corner to follow it, with no per-chamber
 * art and no per-chamber special case.
 *
 * Wall tiles are emitted only where they touch floor. A tile deep inside a
 * notch is outside the building, and drawing solid fill there would put a grey
 * block in the void instead of leaving the room's outline against it.
 */
export function tilesFor(cols: number, rows: number, notches: readonly Rect[]): readonly Tile[] {
  const cut = (col: number, row: number): boolean =>
    notches.some(
      (n) => col >= n.col && col < n.col + n.cols && row >= n.row && row < n.row + n.rows,
    );
  const floor = (col: number, row: number): boolean =>
    col >= 0 && col < cols && row >= 0 && row < rows && !cut(col, row);

  const tiles: Tile[] = [];
  for (let row = -1; row <= rows; row += 1) {
    for (let col = -1; col <= cols; col += 1) {
      // Which orthogonal neighbours are floor. The floor sheet is indexed by
      // the sides that are *not*, so the two uses are one mask read twice.
      const sides =
        (floor(col, row - 1) ? EDGE.top : 0) |
        (floor(col, row + 1) ? EDGE.bottom : 0) |
        (floor(col - 1, row) ? EDGE.left : 0) |
        (floor(col + 1, row) ? EDGE.right : 0);

      if (floor(col, row)) {
        tiles.push({ col, row, wall: false, frame: floorFrame(~sides) });
        continue;
      }

      const corners =
        (floor(col - 1, row - 1) ? CORNER.topLeft : 0) |
        (floor(col + 1, row - 1) ? CORNER.topRight : 0) |
        (floor(col - 1, row + 1) ? CORNER.bottomLeft : 0) |
        (floor(col + 1, row + 1) ? CORNER.bottomRight : 0);
      if (sides === 0 && corners === 0) continue;
      tiles.push({ col, row, wall: true, frame: wallFrame(sides, corners) });
    }
  }
  return tiles;
}

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
  /** The floor and the wall around it, already resolved to frames. */
  readonly tiles: readonly Tile[];
  /**
   * The channel the room's walls wear.
   *
   * Not decoration and not a fifth colour: it is the same law the devices
   * obey, applied to the building. A room whose puzzle is only PILOT's to read
   * is walled in amber, a room only KEEPER can act in is walled in cyan, and a
   * room both parties work in is bone. The pack ships the walls in all three,
   * so this costs no art and cannot disagree with the devices inside it.
   */
  readonly accent: RenderChannel;
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
 * A door: three leaves side by side in the top wall, centred.
 *
 * Contiguous, which is why this is not `spread`. A door is one object three
 * tiles wide, and spreading three leaves evenly across four tiles leaves a gap
 * in the middle of it - a doorway with a pillar in it, which reads as a
 * rendering fault rather than as a door.
 *
 * The caption rides on a second draw of the middle leaf so the bank reads as
 * one door rather than as three narrow ones, and it lands on the row below,
 * which is why nothing else may be placed on row 1.
 */
function doorway(
  cols: number,
  sheet: "door" | "door-locked",
  frame: number,
  label: string,
): { readonly cols: readonly number[]; readonly devices: Device[] } {
  const start = Math.floor((cols - DOOR_WIDTH) / 2);
  const leaves = Array.from({ length: DOOR_WIDTH }, (_, i) => start + i);
  const devices: Device[] = leaves.map((col) => ({
    col,
    row: 0,
    sheet,
    channel: "shared" as const,
    frame,
  }));
  const middle = leaves[1];
  if (middle !== undefined) {
    devices.push({ col: middle, row: 0, sheet, channel: "shared", frame, label });
  }
  return { cols: leaves, devices };
}

/** How many tiles wide a door is. Three reads as a doorway; one reads as a hatch. */
export const DOOR_WIDTH = 3;

/**
 * The row a door's threshold plate sits on.
 *
 * Two rather than one, because the door's caption is drawn under its tile and
 * therefore occupies row 1. A plate there would have the words sitting on the
 * chequer, which at 8px is two patterns competing rather than one label.
 */
const THRESHOLD_ROW = 2;

/**
 * Each chamber's outline, as the pieces cut out of its box.
 *
 * Every notch is chosen against that chamber's own device layout and takes
 * only tiles it never places anything on, which is what lets a room change
 * shape without a single device moving. Two rows are load-bearing everywhere
 * and are never cut: the bottom row, which is the floor PILOT walks across,
 * and whichever row holds the door.
 *
 * Resolved to tiles once at module load rather than per frame. The shapes are
 * constants, and re-deriving four hundred tiles sixty times a second to get
 * the same answer is the kind of work that only shows up as a warm laptop.
 */
const SHAPES = {
  // A shallow vestibule: the way out is a stub between two corners that are
  // outside the building, rather than a gap in a flat wall.
  airlock: {
    cols: 16,
    rows: 12,
    notches: [
      { col: 0, row: 0, cols: 4, rows: 2 },
      { col: 12, row: 0, cols: 4, rows: 2 },
    ],
  },
  // Narrow and deep, so the keypad sits in a bay of its own.
  signal_room: {
    cols: 16,
    rows: 14,
    notches: [
      { col: 0, row: 0, cols: 3, rows: 3 },
      { col: 13, row: 0, cols: 3, rows: 3 },
    ],
  },
  // Barely chamfered. The gauge bank runs nearly the full width and the room
  // is the boxy instrument housing it, so the corners are trimmed and no more.
  blind_panel: {
    cols: 16,
    rows: 14,
    notches: [
      { col: 0, row: 0, cols: 3, rows: 2 },
      { col: 13, row: 0, cols: 3, rows: 2 },
    ],
  },
  // The deepest vestibule in the station, because this door is the one the
  // pair has played the whole session to reach.
  concord_lock: {
    cols: 16,
    rows: 14,
    notches: [
      { col: 0, row: 0, cols: 4, rows: 3 },
      { col: 12, row: 0, cols: 4, rows: 3 },
    ],
  },
} as const satisfies Record<string, { cols: number; rows: number; notches: readonly Rect[] }>;

/**
 * Every notch of every chamber, so the shape rule can be proved rather than
 * remembered. Exported for the test and used nowhere else.
 *
 * **A notch may only be cut from a corner of the box.** `walls-out` is a
 * nine-slice of *convex* corners; the pack has no concave wall corner at all.
 * A notch cut into the middle of an edge therefore has to turn the wall inward
 * and back out using two convex corners butted together, which draws the
 * border twice and reads as a crack in the building. At a corner of the box
 * the wall turns once, and the outline stays a single line.
 */
export const CHAMBER_NOTCHES: Readonly<
  Record<
    string,
    { readonly cols: number; readonly rows: number; readonly notches: readonly Rect[] }
  >
> = SHAPES;

/** Every chamber's tiles, resolved once. */
const TILES: Readonly<Record<keyof typeof SHAPES, readonly Tile[]>> = Object.fromEntries(
  Object.entries(SHAPES).map(([id, shape]) => [
    id,
    tilesFor(shape.cols, shape.rows, shape.notches),
  ]),
) as Readonly<Record<keyof typeof SHAPES, readonly Tile[]>>;

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
  const cols = 16;
  const rows = 12;
  const glyphByLever = record(facts, "glyphByLever");
  const pulled = new Set(list(facts, "pulled").map(String));
  const doorOpen = bool(facts, "doorOpen");
  const levers = Object.keys(glyphByLever).sort();

  const door = doorway(
    cols,
    "door",
    doorOpen ? FRAMES.door.open : FRAMES.door.shut,
    doorOpen ? "DOOR OPEN" : "DOOR SEALED",
  );
  const devices: Device[] = [...door.devices];

  // The levers sit on the row below their glyph plates, which is why they are
  // not on the last row: each one needs the tile above it.
  const leverRow = rows - 4;
  // An odd span, so three levers land on even centres rather than on the 4-3
  // split an even one rounds to.
  spread(levers.length, cols - 5, 2).forEach((col, index) => {
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
    // A chequered threshold in front of the door, and nothing else. The floor
    // carries meaning only where it says "this is the way out"; in a game
    // whose whole task is finding the channel-coded object, decoration that
    // competes with it is not decoration, it is noise.
    plates: door.cols.map((col) => ({ col, row: THRESHOLD_ROW, frame: PLATE.chequer })),
    tiles: TILES.airlock,
    // Bone. Both parties work this room: PILOT reads the glyphs, KEEPER pulls
    // the levers, and neither half is the room's own.
    accent: "shared",
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
  const rows = 14;
  const glyphByKey = record(facts, "glyphByKey");
  const pressed = new Set(list(facts, "pressedSequence").map(String));
  const strikes = num(facts, "strikes");
  const keys = Object.keys(glyphByKey).sort((a, b) => Number(a) - Number(b));

  const devices: Device[] = [];
  // Two rows of three, each key with its glyph plate on the tile above it.
  const columns = spread(3, 9, 2);
  keys.forEach((key, index) => {
    const col = columns[index % 3];
    if (col === undefined) return;
    const down = pressed.has(key);
    devices.push({
      col,
      row: 3 + Math.floor(index / 3) * 5,
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
      // From row three, so the top lamp clears the chamfer the room's
      // top-right corner is cut back to.
      row: 3 + i * 2,
      sheet: "led",
      channel: "shared",
      frame: i < strikes ? FRAMES.led.on : FRAMES.led.off,
      ...(i === 2 ? { label: "STRIKES" } : {}),
      dim: i >= strikes,
    });
  }

  const page = text(facts, "manualPageState");
  // No decorative plates. The six keys are what the room is for, and a floor
  // pattern near them is one more rectangle for the eye to check.
  const plates: Plate[] = [];
  if (page !== null) {
    const marked = page === "vandalised";
    devices.push({
      col: 2,
      row: rows - 3,
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
    tiles: TILES.signal_room,
    // Amber. The six shapes on the keys are PILOT's alone, and the whole room
    // is the problem of getting them across.
    accent: "pilot",
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
  const rows = 14;
  const values = record(facts, "gaugeValues");
  const targets = record(facts, "targets");
  const gauges = Object.keys(values).sort((a, b) => Number(a) - Number(b));
  const solved = bool(facts, "solved");

  const devices: Device[] = [];
  const plates: Plate[] = [];
  // The row the top lamp of every gauge sits on. Two rather than one, so the
  // outer gauges clear the chamfer the room's top corners are cut back to.
  const top = 2;
  const dialRow = rows - 2;
  // A span of thirteen for four gauges: the steps come out at exactly four
  // tiles rather than at the 4-4-5 an even span would round to.
  const columns = spread(gauges.length, 13, 1);
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
        row: top + (GAUGE_MAX - 1 - step),
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
      row: dialRow,
      sheet: "switch",
      channel: "keeper",
      frame: value === target ? FRAMES.switch.on : FRAMES.switch.off,
      label: `DIAL ${String(index + 1)}`,
    });
  });

  const clicks = facts.lastClicks;
  return {
    cols,
    rows,
    devices,
    plates,
    tiles: TILES.blind_panel,
    // Cyan. PILOT can read every gauge and reach nothing; the only hands in
    // this room are KEEPER's.
    accent: "keeper",
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
export const GRIP_TILES = 11;

/**
 * The Concord Lock: the cipher wheel, the bolts, the grip clock and the door.
 *
 * The grip clock is a laser beam that shortens rather than a bar that empties.
 * It is the only thing in the game both parties have to read at once under
 * time pressure, and a beam retracting toward its turret is legible at a
 * glance from anywhere in the room, which a bar in a corner was not.
 */
function concordLock(facts: Readonly<Record<string, unknown>>): RoomPlan {
  const cols = 16;
  const rows = 14;
  const offset = num(facts, "cipherOffset");
  const bolts = num(facts, "boltsAligned");
  const armed = bool(facts, "armed");
  const window_ = num(facts, "staminaWindowMs", 1);
  const remaining = num(facts, "staminaRemainingMs");
  const attempts = list(facts, "attemptedPhrases").length;

  // The outer door. Locked until the bolts are aligned, and then it is simply
  // a door: the last sprite change of the session.
  const open = bolts >= 3;
  const door = doorway(
    cols,
    open ? "door" : "door-locked",
    open ? FRAMES.door.open : FRAMES.doorLocked.shut,
    open ? "THE DOOR IS OPEN" : "DOOR LOCKED",
  );
  const devices: Device[] = [...door.devices];

  // The cipher wheel: PILOT's, because the offset is on its face and KEEPER
  // has only the phrase.
  devices.push({
    col: 2,
    row: 5,
    sheet: "pad",
    channel: "pilot",
    frame: FRAMES.pad.lit,
    label: `WHEEL ${String(offset)}`,
  });

  // Three bolts, shared, because both parties are told how far along the lock
  // is. A span of five puts them exactly two tiles apart.
  spread(3, 5, cols - 8).forEach((col, index) => {
    devices.push({
      col,
      row: 5,
      sheet: "led",
      channel: "shared",
      frame: index < bolts ? FRAMES.led.on : FRAMES.led.off,
      label: `BOLT ${String(index + 1)}`,
      dim: index >= bolts,
    });
  });

  // The release bar, as a turret, and the grip clock as its beam. PILOT holds
  // the bar; the beam is how long they have left to hold it.
  const gripRow = rows - 4;
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
    plates: door.cols.map((col) => ({ col, row: THRESHOLD_ROW, frame: PLATE.chequer })),
    tiles: TILES.concord_lock,
    // Bone. The last room is the one they have to be in together.
    accent: "shared",
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
  tiles: tilesFor(12, 8, []),
  accent: "shared",
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
