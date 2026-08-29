/**
 * What is in the room the pair is standing in, decided without a renderer.
 *
 * This replaces the tile-plan half of `room.ts` (D-042). The station used to be
 * a top-down floor plan built from 16px tiles; it is a lit three-dimensional
 * space now, so a room is no longer a grid of frames but a **box with things
 * standing in it**, measured in metres.
 *
 * The split this module is on one side of has not moved, and it is the reason
 * the rewrite was survivable at all. **Everything a frame has to decide is
 * decided here, and `stage.ts` only builds and lights.** That is the half that
 * can be wrong in a way nobody notices by looking, so it is the half with
 * tests. A chamber that reached for a camera, a material or a light would be a
 * chamber nobody could check.
 *
 * Two rules from this app's CLAUDE.md govern every layout below.
 *
 * **A glyph's name is KEEPER's half of the split and never appears on PILOT's
 * side.** A fixture carries its *position* or its *number* as a label, which is
 * what KEEPER can be told to act on, and wears the glyph as a drawing.
 *
 * **Colour is which party perceives the thing, and it never bends.** A
 * fixture's channel picks the colour it is lit in and the colour it emits, so a
 * lever cannot acquire a colour without acquiring the meaning that goes with
 * it.
 *
 * ## Coordinates
 *
 * Room-local, right-handed, metres. The origin is the **centre of the floor**:
 * `x` runs left to right, `y` is up, and `z` runs from the back wall (negative)
 * to the front of the room (positive). A fixture never learns where its room
 * sits in the station, exactly as the tile version never did, so a room can be
 * moved or resized without every fixture in it being wrong by the same amount.
 */

import type { PilotView } from "@semaphore/protocol";
import type { RenderChannel } from "./palette.js";
import type { FloorId } from "./floors.js";

/** A point in room-local metres. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * What a fixture is, which decides the geometry `stage.ts` builds for it.
 *
 * A closed union rather than a free string, so a chamber cannot ask for a thing
 * the stage has no shape for and have it silently not appear.
 */
export type FixtureKind =
  | "lever"
  | "key"
  | "gauge"
  | "dial"
  | "grate"
  | "wheel"
  | "bar"
  | "bolt"
  | "door"
  | "page"
  | "beacon"
  | "monitor"
  | "crate"
  | "lamp";

/**
 * One thing standing in a room.
 *
 * `id` is stable across frames and is how `stage.ts` keeps a fixture's motion
 * state. That matters more here than it did in two dimensions: a lever swings
 * over a quarter of a second, and a lever that lost its identity between frames
 * would restart its swing on every one of them.
 */
export interface Fixture {
  /** Stable within a room, so motion state survives a repaint. */
  readonly id: string;
  readonly kind: FixtureKind;
  /** Where it stands, in room-local metres. */
  readonly at: Vec3;
  /** Who perceives it. Picks its colour and its light, and is not decoration. */
  readonly channel: RenderChannel;
  /** The primary binary state: thrown, pressed, lit, open, armed. */
  readonly on: boolean;
  /** Drawn beneath it. Never a glyph's name (see this module's docs). */
  readonly label?: string;
  /** A glyph id, drawn on a plate above it. */
  readonly glyph?: string;
  /** Yaw in radians. Zero faces the front of the room, toward the camera. */
  readonly facing?: number;
  /** How full, 0 to 1: a gauge's needle, a grip's remaining stamina. */
  readonly level?: number;
  /** Where `level` is supposed to land, 0 to 1. Drawn as a mark on the scale. */
  readonly target?: number;
  /** How many cells a gauge column has, so the count stays countable. */
  readonly steps?: number;
  /** Present but inert. Drawn without its emission rather than removed. */
  readonly dim?: boolean;
}

/** The interior of a room, in metres. */
export interface RoomSize {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/** Everything the stage needs to build and light one room. */
export interface RoomPlan {
  readonly id: FloorId;
  readonly size: RoomSize;
  readonly fixtures: readonly Fixture[];
  /**
   * The channel the room's own light and its wall trim wear.
   *
   * Not decoration and not a fourth colour: it is the same law the fixtures
   * obey, applied to the building. A room whose puzzle is only PILOT's to read
   * is lit warm, a room only KEEPER can act in is lit cold, and a room both
   * parties work in is lit neutral. It is the first thing on screen in a
   * chamber and it says whose room this is before anything in it is read.
   */
  readonly accent: RenderChannel;
  /**
   * The `AUDIBLE` fact. Both parties perceive it, so it is the one thing on
   * screen PILOT never has to describe.
   */
  readonly sound: string | null;
  /** Whether the room's own success condition is met. Drives the pearl flash. */
  readonly solved: boolean;
  /**
   * How far the water has risen, 0 to 1 of ankle depth.
   *
   * The Airlock's visual escalation (doc 06 section 6). It has no mechanical
   * effect whatsoever and must not acquire one: it is the room telling PILOT
   * that guessing has a cost, in a chamber that deliberately cannot be failed.
   */
  readonly flood: number;
}

/** Human names for the four chambers. */
const ROOM_TITLES: Readonly<Record<string, string>> = {
  airlock: "AIRLOCK",
  signal_room: "SIGNAL ROOM",
  blind_panel: "BLIND PANEL",
  concord_lock: "CONCORD LOCK",
};

/**
 * Which channel each room is lit in.
 *
 * A table rather than a literal per chamber, because `plan.ts` lights the same
 * rooms from outside in the wide shot and the two must not be able to drift
 * apart.
 */
export const CHAMBER_ACCENT = {
  // Both parties work this room: PILOT reads the glyphs, KEEPER pulls the
  // levers, and neither half is the room's own.
  airlock: "shared",
  // The six shapes on the ring are PILOT's alone, and the whole room is the
  // problem of getting them across.
  signal_room: "pilot",
  // PILOT can read every gauge and reach nothing; the only hands here are
  // KEEPER's, behind the grate.
  blind_panel: "keeper",
  // The last room is the one they have to be in together.
  concord_lock: "shared",
} as const satisfies Record<string, RenderChannel>;

/**
 * Each room's interior, in metres.
 *
 * The proportions are doc 06 section 6's silhouettes taken literally, because
 * that table's whole purpose is that no two rooms in the demo video read alike:
 * the Airlock is cramped, low and wide; the Signal Room is tall and
 * vertiginous; the Blind Panel is wide, shallow and industrial; the Archive is
 * small and close; the Concord Lock is vast and vertical. In two dimensions
 * that distinction survived only as a floor outline. A ceiling height is what
 * makes it land.
 */
export const ROOM_SIZES: Readonly<Record<FloorId, RoomSize>> = {
  airlock: { width: 12, depth: 8, height: 3.6 },
  signal_room: { width: 13, depth: 13, height: 7.5 },
  blind_panel: { width: 15, depth: 7, height: 4.2 },
  archive: { width: 8, depth: 7, height: 3.2 },
  concord_lock: { width: 14, depth: 12, height: 9 },
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
 * Spread `count` things evenly across `span` metres, centred on zero.
 *
 * One function because three of the four chambers lay out a bank of identical
 * fixtures, and a bank whose spacing is worked out separately each time is a
 * bank that ends up spaced three different ways.
 */
export function spread(count: number, span: number): readonly number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => -span / 2 + i * step);
}

/**
 * Positions on a shallow arc across the back of a room.
 *
 * The Signal Room's ring. Doc 02 section 3.2 asks for six glyphs in a ring with
 * a beacon turning at its centre, which the tile renderer could only approximate
 * as two rows of three. An arc is what the room is actually described as, and it
 * is worth having back: a ring has an order you can point along, which is
 * exactly what PILOT has to describe.
 *
 * The arc spans the back rather than closing into a full circle, because two of
 * six positions behind the camera are two glyphs nobody can read.
 */
export function arc(count: number, radius: number, sweep = 2.36): readonly Vec3[] {
  if (count <= 0) return [];
  const start = -Math.PI / 2 - sweep / 2;
  const step = count === 1 ? 0 : sweep / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const angle = start + i * step;
    return { x: radius * Math.cos(angle), y: 0, z: radius * Math.sin(angle) };
  });
}

/** Which way a fixture on the arc faces to look back at the room's centre. */
export function facingCentre(at: Vec3): number {
  return Math.atan2(at.x, at.z) + Math.PI;
}

/**
 * The Airlock: three levers, the door they open, and the rising water.
 *
 * The levers are PILOT's channel because their identity is the lit glyph and
 * nothing else. KEEPER can feel all three and they are identical to the touch,
 * which is exactly the asymmetry the room is built on, so the warm light is not
 * decoration: it is the statement that this is the half only PILOT holds.
 */
function airlock(facts: Readonly<Record<string, unknown>>): RoomPlan {
  const size = ROOM_SIZES.airlock;
  const glyphByLever = record(facts, "glyphByLever");
  const pulled = new Set(list(facts, "pulled").map(String));
  const doorOpen = bool(facts, "doorOpen");
  const levers = Object.keys(glyphByLever).sort();

  const fixtures: Fixture[] = [
    {
      id: "door",
      kind: "door",
      at: { x: 0, y: 0, z: -size.depth / 2 },
      channel: "shared",
      on: doorOpen,
      label: doorOpen ? "DOOR OPEN" : "DOOR SEALED",
    },
  ];

  // Along the back wall, standing off it far enough to cast a shadow on it.
  spread(levers.length, size.width - 5).forEach((x, index) => {
    const lever = levers[index];
    if (lever === undefined) return;
    const thrown = pulled.has(lever);
    fixtures.push({
      id: lever,
      kind: "lever",
      at: { x, y: 0, z: -size.depth / 2 + 1.1 },
      channel: "pilot",
      on: thrown,
      // The lever's *position*, which is what KEEPER can be told to pull. The
      // glyph's name appears nowhere: it lives in KEEPER's stroke table.
      label: lever.replace(/^lever_/, "").toUpperCase(),
      glyph: String(glyphByLever[lever] ?? ""),
      dim: thrown,
    });
  });

  return {
    id: "airlock",
    size,
    fixtures,
    accent: CHAMBER_ACCENT.airlock,
    sound: text(facts, "lastSound"),
    solved: doorOpen,
    // Every lever pulled while the door is still shut is a lever that vented
    // the chamber. Three wrong pulls is ankle-deep, which is as far as it goes.
    flood: doorOpen ? 0 : Math.min(1, pulled.size / 3),
  };
}

/**
 * The Signal Room: a ring of six glyphs, the keys under them, and this
 * session's page on the wall.
 *
 * `manualPageState` is drawn because PILOT can see whether the page has been
 * scratched over and KEEPER cannot. It is the visible half of the trust puzzle,
 * and leaving it undrawn would remove the only cue the human has that their
 * partner is reading something false.
 */
function signalRoom(facts: Readonly<Record<string, unknown>>): RoomPlan {
  const size = ROOM_SIZES.signal_room;
  const glyphByKey = record(facts, "glyphByKey");
  const pressed = new Set(list(facts, "pressedSequence").map(String));
  const strikes = num(facts, "strikes");
  const keys = Object.keys(glyphByKey).sort((a, b) => Number(a) - Number(b));

  const fixtures: Fixture[] = [];

  // The ring, and the key bank directly beneath it, so that "the glyph above
  // them" in the manual's rule is literally true on screen.
  const ring = arc(keys.length, size.width / 2 - 1.6);
  keys.forEach((key, index) => {
    const at = ring[index];
    if (at === undefined) return;
    const down = pressed.has(key);
    fixtures.push({
      id: `key-${key}`,
      kind: "key",
      at: { x: at.x, y: 0, z: at.z },
      channel: "pilot",
      on: down,
      facing: facingCentre(at),
      // The number is how KEEPER names a key. The shape above it is what PILOT
      // has to get across, and it is the only thing the key does not say.
      label: String(key),
      glyph: String(glyphByKey[key] ?? ""),
      dim: down,
    });
  });

  // The beacon at the centre, turning. It lights each glyph in turn, which is
  // the room's one piece of motion and the reason the ring reads as a ring.
  fixtures.push({
    id: "beacon",
    kind: "beacon",
    at: { x: 0, y: 0, z: 0 },
    channel: "pilot",
    on: true,
  });

  // Three strike lamps, because the room vents on the third. Shared: both
  // parties know how close they are, and that shared clock is what makes the
  // vandalised page dangerous rather than merely wrong.
  spread(3, 1.6).forEach((x, index) => {
    fixtures.push({
      id: `strike-${String(index)}`,
      kind: "lamp",
      at: { x: x + size.width / 2 - 1.2, y: 2.2, z: size.depth / 2 - 0.35 },
      channel: "shared",
      on: index < strikes,
      facing: Math.PI,
      ...(index === 1 ? { label: "STRIKES" } : {}),
      dim: index >= strikes,
    });
  });

  const page = text(facts, "manualPageState");
  if (page !== null) {
    const marked = page === "vandalised";
    fixtures.push({
      id: "page",
      kind: "page",
      at: { x: -size.width / 2 + 0.4, y: 1.9, z: 1.4 },
      channel: "pilot",
      on: marked,
      facing: Math.PI / 2,
      // It has to say which of the two states it is: the whole trust puzzle
      // turns on PILOT noticing, and a page nobody looked at teaches nothing.
      label: marked ? "PAGE MARKED" : "PAGE INTACT",
    });
  }

  return {
    id: "signal_room",
    size,
    fixtures,
    accent: CHAMBER_ACCENT.signal_room,
    sound: text(facts, "lastSound"),
    // No `solved` fact reaches PILOT here, and the correct sequence is a subset
    // of the six keys whose size only the server knows. Deriving one from
    // `pressedSequence` would be the client guessing at the answer, which is
    // the one thing it may never do. The room is solved by leaving it.
    solved: false,
    flood: 0,
  };
}

/** Gauge travel, matching the chamber's own clamp of 0 to 8. */
export const GAUGE_MAX = 8;

/**
 * The Blind Panel: four gauges PILOT reads and four dials KEEPER turns.
 *
 * A gauge is a column of lit cells rather than a swinging needle, and that is a
 * puzzle decision rather than a modelling one: the chamber is read aloud one
 * number at a time - "the third one is at five" - and a column of cells is
 * countable across a room in a way an analogue needle is not.
 *
 * The dials are drawn too, in KEEPER's colour, behind the grate. The room's
 * whole point is that the two banks are not wired in the order anyone would
 * assume, so seeing the dial bank with no indication of which gauge it drives
 * is the human half of that puzzle. The dial fixtures deliberately carry no
 * value.
 */
function blindPanel(facts: Readonly<Record<string, unknown>>): RoomPlan {
  const size = ROOM_SIZES.blind_panel;
  const values = record(facts, "gaugeValues");
  const targets = record(facts, "targets");
  const gauges = Object.keys(values).sort((a, b) => Number(a) - Number(b));
  const solved = bool(facts, "solved");

  const fixtures: Fixture[] = [];
  const columns = spread(gauges.length, size.width - 4);

  gauges.forEach((gauge, index) => {
    const x = columns[index];
    if (x === undefined) return;
    const value = Math.max(0, Math.min(GAUGE_MAX, num(values, gauge)));
    const target = num(targets, gauge);

    fixtures.push({
      id: `gauge-${gauge}`,
      kind: "gauge",
      at: { x, y: 0.55, z: -size.depth / 2 + 0.35 },
      channel: "pilot",
      on: value === target,
      level: value / GAUGE_MAX,
      target: target / GAUGE_MAX,
      steps: GAUGE_MAX,
      label: `${String(value)}/${String(target)}`,
    });

    // KEEPER's dial, under the gauge it does not necessarily drive.
    fixtures.push({
      id: `dial-${String(index + 1)}`,
      kind: "dial",
      at: { x, y: 0.42, z: -size.depth / 2 + 0.55 },
      channel: "keeper",
      on: value === target,
      label: `DIAL ${String(index + 1)}`,
    });
  });

  // The grate the dials sit behind. Shared, because both parties know it is
  // there: PILOT can see it and hear through it, KEEPER reaches past it.
  fixtures.push({
    id: "grate",
    kind: "grate",
    at: { x: 0, y: 0.5, z: -size.depth / 2 + 0.18 },
    channel: "shared",
    on: true,
  });

  // On the west wall, not the south one. The station is a cutaway model and
  // every room is open on its south face (`camera.ts`), so a door there is not
  // a way out, it is a panel hanging in the gap the camera looks through. The
  // north wall is spoken for by the gauge bank, which leaves the side.
  fixtures.push({
    id: "door",
    kind: "door",
    at: { x: -size.width / 2, y: 0, z: 0 },
    channel: "shared",
    on: solved,
    facing: Math.PI / 2,
    label: solved ? "DOOR OPEN" : "DOOR SEALED",
  });

  const clicks = facts.lastClicks;
  return {
    id: "blind_panel",
    size,
    fixtures,
    accent: CHAMBER_ACCENT.blind_panel,
    // Singular at one. The count is puzzle-critical in this room - it is how
    // KEEPER learns a linkage hit its bound - so the line that carries it
    // should not read like a placeholder.
    sound:
      typeof clicks === "number"
        ? `${String(clicks)} click${clicks === 1 ? "" : "s"} registered`
        : null,
    solved,
    flood: 0,
  };
}

/**
 * How many bolts are drawn around the great door.
 *
 * Twelve, as doc 02 section 3.4 describes, while `align_bolt` drives three. One
 * aligned bolt therefore lands four of the twelve, so the ring fills in thirds
 * and the last call retracts the whole array. Drawing three bolts on a door
 * described as having twelve would be the renderer disagreeing with the
 * fiction; drawing twelve and lighting them in thirds is the same fiction with
 * the mechanism's real granularity visible in it.
 */
export const DOOR_BOLTS = 12;

/** How many bolts `align_bolt` can land. The array is a multiple of this. */
export const ALIGNABLE_BOLTS = 3;

/**
 * The Concord Lock: the cipher wheel, the bolt ring, the release bar, the door.
 *
 * The one room in the station where amber and cyan meet at a single object, and
 * the only one both parties have to read at once under time pressure. So the
 * grip is drawn as a bar that visibly drains rather than as a number: it is
 * legible from anywhere in the room, at a glance, mid-sentence.
 */
function concordLock(facts: Readonly<Record<string, unknown>>): RoomPlan {
  const size = ROOM_SIZES.concord_lock;
  const offset = num(facts, "cipherOffset");
  const bolts = num(facts, "boltsAligned");
  const armed = bool(facts, "armed");
  const window_ = num(facts, "staminaWindowMs", 1);
  const remaining = num(facts, "staminaRemainingMs");
  const attempts = list(facts, "attemptedPhrases").length;
  const open = bolts >= ALIGNABLE_BOLTS;

  const fixtures: Fixture[] = [
    {
      id: "door",
      kind: "door",
      at: { x: 0, y: 0, z: -size.depth / 2 },
      channel: "shared",
      on: open,
      label: open ? "THE DOOR IS OPEN" : "DOOR LOCKED",
    },
  ];

  // The bolt ring, on the face of the door. Each aligned bolt lands a third of
  // the array, which is why this counts in quarters of the way round.
  const perBolt = DOOR_BOLTS / ALIGNABLE_BOLTS;
  for (let index = 0; index < DOOR_BOLTS; index += 1) {
    const angle = (index / DOOR_BOLTS) * Math.PI * 2 - Math.PI / 2;
    const radius = 2.5;
    fixtures.push({
      id: `bolt-${String(index)}`,
      kind: "bolt",
      at: {
        x: Math.cos(angle) * radius,
        y: 3.4 + Math.sin(angle) * radius,
        z: -size.depth / 2 + 0.35,
      },
      channel: "shared",
      on: index < bolts * perBolt,
      dim: index >= bolts * perBolt,
      ...(index === 0 ? { label: `${String(bolts)}/${String(ALIGNABLE_BOLTS)} ALIGNED` } : {}),
    });
  }

  // The cipher wheel: PILOT's, because the offset is on its face and KEEPER has
  // only the enciphered phrase.
  fixtures.push({
    id: "wheel",
    kind: "wheel",
    at: { x: size.width / 2 - 0.5, y: 1.8, z: -1 },
    channel: "pilot",
    on: true,
    facing: -Math.PI / 2,
    level: offset / 26,
    label: `WHEEL ${String(offset)}`,
  });

  // The release bar, on the opposite wall, so PILOT cannot be at the wheel and
  // at the bar at once. That impossibility is the chamber.
  fixtures.push({
    id: "bar",
    kind: "bar",
    at: { x: -size.width / 2 + 0.5, y: 1.2, z: -1 },
    channel: "shared",
    on: armed,
    facing: Math.PI / 2,
    level: armed && window_ > 0 ? Math.max(0, Math.min(1, remaining / window_)) : 0,
    label: armed ? "UNDER TENSION" : "SLACK",
  });

  fixtures.push({
    id: "attempts",
    kind: "crate",
    at: { x: size.width / 2 - 1.2, y: 0, z: size.depth / 2 - 1.4 },
    channel: "shared",
    on: false,
    label: `${String(attempts)} TRIED`,
    dim: true,
  });

  return {
    id: "concord_lock",
    size,
    fixtures,
    accent: CHAMBER_ACCENT.concord_lock,
    sound: text(facts, "lastSound"),
    solved: open,
    flood: 0,
  };
}

/**
 * Where the monitor's screen sits in the Archive, in room-local metres.
 *
 * Exported because the housing is a fixture and the picture on it is painted by
 * `stage.ts`, and the two may not hold a second opinion about where the glass
 * is. `proud` is how far in front of the housing's own origin the picture
 * hangs: the housing is `MONITOR_DEPTH` deep and centred on that origin, so
 * anything at or behind half of it is *inside the box*. The first tour showed
 * exactly that - the recording was playing on a plane buried in the casing, and
 * what reached the camera was the bezel behind it.
 */
export const MONITOR_DEPTH = 1.1;
export const ARCHIVE_SCREEN = {
  width: 3.2,
  height: 2.1,
  y: 1.95,
  proud: MONITOR_DEPTH / 2 + 0.06,
} as const;

/**
 * The Archive: a monitor, two crates of tape, and the way on.
 *
 * Not a chamber (doc 02 section 4), so this takes no facts and there is nothing
 * here to solve. It is a room all the same, and it is the one room in the
 * station whose furniture is the mechanic: the monitor is PILOT's half of the
 * archive, and it is lit warm for the same reason every other warm thing is,
 * because KEEPER has no tool that reaches it. What KEEPER has is
 * `read_station_log`, which reaches nothing in this room.
 *
 * A constant rather than a function. The room does not change during the beat:
 * what changes is the recording playing on it, and that is `ghost.ts`.
 */
export const ARCHIVE_PLAN: RoomPlan = {
  id: "archive",
  size: ROOM_SIZES.archive,
  fixtures: [
    {
      id: "monitor",
      kind: "monitor",
      at: { x: 0, y: ARCHIVE_SCREEN.y, z: -ROOM_SIZES.archive.depth / 2 + 0.25 },
      channel: "pilot",
      on: true,
    },
    // Tape crates, either side of the floor. Shared, because a crate is
    // furniture: it carries no fact and neither party can act on it.
    {
      id: "crate-left",
      kind: "crate",
      at: { x: -ROOM_SIZES.archive.width / 2 + 1, y: 0, z: -1.2 },
      channel: "shared",
      on: false,
      dim: true,
    },
    {
      id: "crate-right",
      kind: "crate",
      at: { x: ROOM_SIZES.archive.width / 2 - 1.1, y: 0, z: -0.6 },
      channel: "shared",
      on: false,
      dim: true,
    },
    // West wall, for the same reason the Blind Panel's is: a door on the south
    // face stands in the opening the camera looks through, and the north wall
    // is the monitor's.
    {
      id: "door",
      kind: "door",
      at: { x: -ROOM_SIZES.archive.width / 2, y: 0, z: 0 },
      channel: "shared",
      on: true,
      facing: Math.PI / 2,
    },
  ],
  accent: "shared",
  sound: null,
  solved: false,
  flood: 0,
};

/**
 * The phases that have a title but no room, and what the console calls them.
 *
 * These are not chambers, so `facts` is empty by construction and there is
 * nothing to draw. They still need a name, because a console that goes blank
 * during the Archive looks broken rather than deliberate.
 */
const PHASE_TITLES: Readonly<Record<string, string>> = {
  ENTRY: "OUTSIDE THE STATION",
  LOBBY: "STANDING BY",
  TRANSITIONING: "MOVING",
  ARCHIVE: "THE ARCHIVE",
  FINALE: "THE DOOR",
  ESCAPED: "ESCAPED",
  DEADLOCK: "SHIFT OVER",
};

/**
 * The room for one frame, or null when the pair is not standing in one.
 *
 * Null rather than an empty plan, so a caller has to decide what to draw
 * instead of silently building a room with no furniture in it.
 */
export function roomPlan(view: PilotView): RoomPlan | null {
  const { facts, chamber } = view;
  // Before the chamber check, not after it. `machine.chamber` still names the
  // Blind Panel throughout the Archive (D-025), so asking the chamber first
  // would build the room the pair has just left behind the monitor.
  if (view.phase === "ARCHIVE") return ARCHIVE_PLAN;
  // An empty `facts` is the server saying there is no room here, whatever
  // `machine.chamber` still names (D-025).
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
 * The console's room name, in every phase including the ones with no room.
 *
 * The phase is consulted before the chamber, in the same order and for the same
 * reason `roomPlan` consults it: `machine.chamber` outlives the room (D-025) and
 * still names the Blind Panel throughout the Archive. The two functions have to
 * agree about which room the pair is in, because the header naming one room
 * while the viewport shows another reads as a bug in whichever the reader
 * trusts less.
 */
export function roomTitle(view: PilotView): string {
  if (view.phase === "ARCHIVE") return PHASE_TITLES.ARCHIVE ?? "THE ARCHIVE";
  if (view.chamber !== null && Object.keys(view.facts).length > 0) {
    return ROOM_TITLES[view.chamber] ?? view.chamber.toUpperCase();
  }
  return PHASE_TITLES[view.phase] ?? view.phase;
}

/**
 * What the station says when there is no room to draw.
 *
 * The phases between chambers are not dead air. A first pass drew "NO ROOM
 * HERE" in all of them, which is accurate and reads as a rendering fault at
 * exactly the moment the game should be landing.
 *
 * Two lines: what is happening, and what to do about it. The second is empty
 * where there is nothing to do, because inventing an instruction for a beat
 * that has none is worse than silence.
 *
 * The Archive is not among them. It has a room of its own with a monitor in it,
 * and a caption over it would be words competing with the one thing on this
 * floor the pair is here to look at.
 */
export function interlude(view: PilotView): readonly [string, string] {
  switch (view.phase) {
    case "ENTRY":
      return ["THE STATION IS DARK", "YOUR AGENT OPENS THE DOOR"];
    case "LOBBY":
      return ["THE SHIFT HAS NOT BEGUN", "CHOOSE A SESSION LENGTH BELOW"];
    case "TRANSITIONING":
      return ["THE DOOR AHEAD IS OPENING", ""];
    case "FINALE":
      return ["THE OUTER DOOR", "ONE THING LEFT TO DO"];
    case "ESCAPED":
      // The last frame of the game. It is worth a sentence.
      return ["THE DOOR IS OPEN", "COLD AIR, AND THE SOUND OF THE SEA"];
    default:
      return ["NOTHING TO SEE FROM HERE", ""];
  }
}
