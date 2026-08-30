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
  /**
   * Where the caption hangs, in metres above the fixture's anchor.
   *
   * Captions are drawn over geometry (see `kit.label`), which is what stops a
   * caption near a wall being sliced in half by it - and which means two
   * captions at the same height and the same `x` will overlap whatever their
   * depth. The Airlock had exactly that: the door's sign and the middle lever
   * stand on the same centre line, so DOOR SEALED was printed across the
   * lever's glyph plate.
   *
   * A door's sign belongs above the door, where a sign on a bulkhead actually
   * is. This is how a fixture says so.
   */
  readonly captionAt?: number;
  /**
   * Worth leaning in on, even with nothing written under it.
   *
   * Leaning in defaults to "things with a caption or a glyph", because those
   * are the things with something to read. That default has one bad hole: **the
   * Archive's monitor carries neither**, so `E` did nothing at all in the one
   * room whose entire content is a screen you are meant to study. This is how a
   * fixture says it is worth a closer look regardless.
   */
  readonly study?: boolean;
}

/**
 * A piece of the room that carries no fact.
 *
 * Pipework, cabling, beams, rails, puddles, shelving. **Dressing is a separate
 * type from `Fixture` on purpose, and the reason is the colour law rather than
 * tidiness: dressing has no channel, so it structurally cannot take one of the
 * two colours that mean "only this party perceives it".** In a game whose whole
 * task is finding the channel-coded object, a pipe that could be lit amber is a
 * pipe that could be mistaken for a fact.
 *
 * It also has no state and no id: nothing here animates, nothing here is read,
 * and nothing here needs to survive a repaint.
 */
export type DressingKind =
  /** A sloped instrument desk, the housing a bank of gauges is set into. */
  | "console"
  /** A framed chart or schedule screwed to a wall. */
  | "chart"
  | "pipe"
  | "valve"
  | "cable"
  | "puddle"
  | "shelf"
  | "beam"
  | "column"
  | "rail"
  | "vent"
  /** A round window onto the sea. The only view out of the station. */
  | "porthole"
  /** A tall equipment cabinet against a wall. */
  | "locker"
  /** Hazard chevrons painted on the floor, at a threshold. */
  | "chevron"
  /** A heavy frame around a doorway, which is what makes a door a bulkhead. */
  | "bulkhead"
  /** A card index: drawers, brass pulls, and a few left open. */
  | "cabinet"
  /** One bare bulb on a flex. */
  | "bulb";

/** One piece of dressing, in room-local metres. */
export interface Dressing {
  readonly kind: DressingKind;
  readonly at: Vec3;
  /** Yaw in radians. Zero runs along the room's width. */
  readonly facing?: number;
  /**
   * How long, for the things that *run*: pipes, beams, rails, racks, cabinets.
   *
   * **A run is always along the piece's own x**, turned by `facing`. That
   * convention is not a style choice: the collision solver measures along it,
   * and the Archive's racks were built along their z instead, so facing one at
   * a side wall turned it ninety degrees the wrong way, pushed most of it
   * through the masonry, and left the collision measuring a segment at right
   * angles to the one being drawn. One convention, or two bugs.
   */
  readonly length?: number;
  /**
   * How tall, for the things that *stand* or *hang*: columns, bulbs.
   *
   * Separate from `length` deliberately. Both were `length` at first, which
   * meant the field said "a run along x" for one piece and "a height" for the
   * next, and nothing reading it could tell which - a check that a piece stays
   * inside its room read a nine-metre column as a nine-metre floor run.
   */
  readonly height?: number;
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
  /** Everything in the room that carries no fact. Never channel-coloured. */
  readonly dressing: readonly Dressing[];
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
 * A run of pipe along a wall, at a height, with valves spaced along it.
 *
 * The single most useful piece of dressing in the station: a bare wall reads as
 * a computer drawing, and a wall with a pipe on it reads as somewhere that was
 * built for a purpose by people who are no longer here. It is horizontal, so it
 * never competes with the vertical mechanisms, and it is material-coloured, so
 * it can never be mistaken for a fact.
 */
function pipeRun(
  y: number,
  z: number,
  width: number,
  valves: readonly number[] = [],
): readonly Dressing[] {
  const run: Dressing[] = [{ kind: "pipe", at: { x: 0, y, z }, length: width }];
  for (const x of valves) run.push({ kind: "valve", at: { x, y, z }, facing: 0 });
  return run;
}

/**
 * Beams across the open top of a room, over its back half only.
 *
 * **Never over the front half**, and that is the cutaway rule reaching one more
 * thing. The camera stands to the south and looks down, so a beam near the
 * south edge is a bar drawn between the viewer and the mechanism: the first
 * pass spanned the whole depth and put a girder across the levers. The back
 * half gives the room a ceiling to have without giving it one to look through.
 */
function beams(size: RoomSize, count: number): readonly Dressing[] {
  const back = -size.depth / 2 + 0.9;
  const span = size.depth * 0.34;
  return spread(count, span).map((offset) => ({
    kind: "beam" as const,
    at: { x: 0, y: size.height - 0.35, z: back + span / 2 + offset },
    length: size.width,
  }));
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
      // Above the doorway, clear of the lever standing in front of it.
      captionAt: 3.25,
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
    // Cramped, low and wet: pipework low on the back wall behind the levers,
    // a vent, and standing water in the corners even before anything goes
    // wrong. Doc 06 section 6 calls this room cramped and low, and pipes at
    // shoulder height in a 3.6m room are what make it feel it.
    // An airlock, rather than a room with levers in it.
    //
    // The first pass was a grey box with pipes on the back wall, and the
    // honest complaint about it was that it is not beautiful. What was missing
    // is that nothing said what the room is *for*. So: a heavy bulkhead frame
    // around the door, hazard chevrons painted on the threshold, a porthole
    // onto the sea on one wall and an equipment locker on the other, and a hose
    // reel's worth of pipework overhead. Every one of them is a thing a real
    // airlock has and none of them is channel-coloured, so the room gets busier
    // without a single new thing for the eye to mistake for a fact.
    dressing: [
      { kind: "bulkhead", at: { x: 0, y: 0, z: -size.depth / 2 + 0.08 }, length: 3.4 },
      { kind: "chevron", at: { x: 0, y: 0, z: -size.depth / 2 + 1.9 }, length: 3.6 },
      // The one view out of the station, and the reason the room is cold.
      { kind: "porthole", at: { x: size.width / 2 - 0.2, y: 2.05, z: 1.4 }, facing: -Math.PI / 2 },
      { kind: "locker", at: { x: -size.width / 2 + 0.45, y: 0, z: 1.1 }, facing: Math.PI / 2 },
      ...pipeRun(2.62, -size.depth / 2 + 0.3, size.width - 1.2, [-4.4, 1.6]),
      ...pipeRun(3.0, -size.depth / 2 + 0.3, size.width - 1.2),
      { kind: "vent", at: { x: size.width / 2 - 0.35, y: 2.3, z: -1.6 }, facing: -Math.PI / 2 },
      { kind: "cable", at: { x: -2.6, y: size.height, z: -1.2 }, length: 1.1 },
      { kind: "puddle", at: { x: -3.4, y: 0, z: 1.9 }, length: 2.6 },
      { kind: "puddle", at: { x: 2.9, y: 0, z: 2.4 }, length: 2 },
      ...beams(size, 3),
    ],
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
    // A lamp gallery: a rail around the beacon's plinth, cable dropping to it
    // from the beams, and the room's height used rather than merely declared.
    // Doc 06 section 6 calls this room tall and vertiginous, and a rail at
    // waist height with seven metres of air above it is what says so.
    dressing: [
      { kind: "rail", at: { x: 0, y: 1.05, z: 2.1 }, length: 6.5 },
      { kind: "cable", at: { x: -1.5, y: size.height, z: -1 }, length: 3.4 },
      { kind: "cable", at: { x: 2.1, y: size.height, z: 0.4 }, length: 4.2 },
      ...pipeRun(5.4, -size.depth / 2 + 0.35, size.width - 2, [-3.5, 3.5]),
      { kind: "puddle", at: { x: -4.4, y: 0, z: 3.4 }, length: 2.2 },
      ...beams(size, 4),
    ],
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

/**
 * How near PILOT's lamp has to be before a fixture's detail resolves, in metres.
 *
 * **This is what makes walking mean something**, and it is doc 06 section 4's
 * own rule rather than a new one: the lamp casts a real light, so moving the
 * avatar changes what is visible. Until it was built, PILOT could walk and the
 * position was decorative - which is exactly what it looked like.
 *
 * What resolves is *detail*: the glyph on a plate, the reading on a gauge, the
 * offset on the cipher wheel, the caption under a device. What never fades is
 * the device itself, so the room stays navigable and you can always see that
 * there is a lever over there worth walking to. The difference between "there
 * is something here" and "I can tell you what it says" is the difference
 * between a room and a job.
 *
 * It has one consequence the finale is built on. The Concord Lock's cipher
 * wheel and its release bar are at opposite walls, further apart than this, so
 * **PILOT cannot read the offset and hold the bar at the same time** (doc 02
 * section 3.4). That exclusion is not enforced anywhere in code: it falls out
 * of the room being wider than the lamp is bright.
 */
export const LAMP_REACH = 3.6;

/** Beyond this much further again, detail is gone entirely rather than dim. */
export const LAMP_FALLOFF = 3.0;

/**
 * How near PILOT has to be to lean in on something, in metres.
 *
 * Deliberately further than the lamp reaches. Leaning in is *how you go and
 * look at* a thing you cannot read from here, so tying it to the distance at
 * which you can already read is exactly backwards: it made `E` work only where
 * it was least needed. It is still a reach rather than a whole room, because
 * leaning in on something across the hall is a camera move nobody asked for.
 */
export const LEAN_REACH = 6;

/**
 * How strongly PILOT's lamp resolves a fixture, from 0 (unreadable) to 1.
 *
 * Distance is measured on the floor plane. Height is deliberately ignored: a
 * gauge three metres up the wall is as readable as the dial beneath it once you
 * are standing at the bank, and making a player crane at a fixed camera would
 * be a puzzle about the renderer.
 */
export function lampReveal(pilotX: number, pilotZ: number, at: Vec3): number {
  const distance = Math.hypot(at.x - pilotX, at.z - pilotZ);
  if (distance <= LAMP_REACH) return 1;
  const beyond = (distance - LAMP_REACH) / LAMP_FALLOFF;
  return Math.max(0, 1 - beyond);
}

/**
 * The fixture PILOT is closest to, or null if nothing is within reach.
 *
 * What "lean in" pushes the camera at, and what the console names as the thing
 * being looked at. Fixtures with nothing to read - a grate, a crate - are never
 * chosen, because leaning in on a crate is a camera move that answers nothing.
 */
export function nearestFixture(plan: RoomPlan, pilotX: number, pilotZ: number): Fixture | null {
  let best: Fixture | null = null;
  let bestDistance = LEAN_REACH;
  for (const fixture of plan.fixtures) {
    const worth =
      fixture.study === true || fixture.label !== undefined || fixture.glyph !== undefined;
    if (!worth) continue;
    const distance = Math.hypot(fixture.at.x - pilotX, fixture.at.z - pilotZ);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = fixture;
    }
  }
  return best;
}

/**
 * How much floor a body takes up, in metres of radius.
 *
 * PILOT is a person in a heavy coat, not a point. Without this a body walks
 * through a lever, stands inside the beacon, and ends up half inside the wall
 * it was heading for, which is the one thing that makes a room stop reading as
 * a place.
 */
export const BODY_RADIUS = 0.42;

/**
 * The strip of every room that KEEPER's body stands in, room-local.
 *
 * KEEPER is drawn *in the east wall* of whatever room the pair is in - it is
 * not on the floor with PILOT, it is behind the panelling, reaching in. That
 * placement is made once, in `stage.ts`, and until this constant existed no
 * room plan knew about it: the Archive put a four-and-a-half-metre rack of
 * tape reels at x 3.65 and KEEPER's alcove stands at x 3.2 to 4.0, so the two
 * largest objects in the room occupied the same space and interpenetrated.
 *
 * Reserved rather than merely documented, because it is invisible in the pure
 * layer: a room plan is written in its own coordinates and has no reason to
 * suspect that something it never declared is already standing there.
 */
export const KEEPER_ALCOVE = {
  /** How far the alcove reaches in from the east wall, in metres. */
  depth: 0.8,
  /** Half its run along the wall, centred on the room's z axis. */
  reach: 1.1,
} as const;

/** KEEPER's alcove as a room-local box, for placement and for the check. */
export function keeperAlcove(size: RoomSize): {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
} {
  return {
    x0: size.width / 2 - KEEPER_ALCOVE.depth,
    x1: size.width / 2,
    z0: -KEEPER_ALCOVE.reach,
    z1: KEEPER_ALCOVE.reach,
  };
}

/** How much floor a fixture takes up, by kind, in metres of radius. */
const FIXTURE_RADIUS: Readonly<Record<FixtureKind, number>> = {
  lever: 0.4,
  key: 0.55,
  gauge: 0.45,
  dial: 0.3,
  // A grate is set into a wall and is not walked into; the wall stops you.
  grate: 0,
  wheel: 0.5,
  bar: 0.35,
  // Bolts are on the face of a door, several metres up.
  bolt: 0,
  door: 1.6,
  page: 0.4,
  beacon: 0.8,
  monitor: 1.6,
  crate: 0.55,
  lamp: 0,
};

/**
 * How much floor a piece of dressing takes up, in metres of radius.
 *
 * Zero means a body walks through it, and most of the list is zero on purpose:
 * a pipe is high on a wall, a beam is at the ceiling, a cable hangs above head
 * height, and a puddle is something you walk *in*. What blocks is what stands
 * on the floor in front of you.
 */
const DRESSING_RADIUS: Readonly<Record<DressingKind, number>> = {
  pipe: 0,
  valve: 0,
  cable: 0,
  puddle: 0,
  vent: 0,
  beam: 0,
  shelf: 0.4,
  column: 0.55,
  locker: 0.45,
  console: 0.55,
  chart: 0,
  cabinet: 0.45,
  // A bulb hangs above head height.
  bulb: 0,
  // A porthole is in a wall, a chevron is paint on the floor, and a bulkhead
  // frame surrounds an opening you are meant to walk through.
  porthole: 0,
  chevron: 0,
  bulkhead: 0,
  // A rail is a barrier at waist height, and being able to stroll through one
  // is the single clearest way a room stops reading as a place.
  rail: 0.3,
};

/** The closest point to `(x, z)` on a horizontal segment, as a distance. */
function alongSegment(
  item: Dressing,
  x: number,
  z: number,
): { readonly x: number; readonly z: number } {
  const half = (item.length ?? 0) / 2;
  const yaw = item.facing ?? 0;
  // The segment runs along the item's own local x, turned by its facing.
  const dirX = Math.cos(yaw);
  const dirZ = -Math.sin(yaw);
  const alongTo = (x - item.at.x) * dirX + (z - item.at.z) * dirZ;
  const clamped = Math.max(-half, Math.min(half, alongTo));
  return { x: item.at.x + dirX * clamped, z: item.at.z + dirZ * clamped };
}

/**
 * Slide a body to a position it is allowed to occupy.
 *
 * Pushed out of anything it overlaps rather than stopped dead, so walking into
 * a lever at an angle slides along it instead of sticking. Solved by
 * separation rather than by a physics step, because the only thing moving is
 * one body at walking pace and a solver would be machinery for a problem that
 * does not have it.
 *
 * The walls are not here: the walkable box is already inset from them
 * (`WALK_SPAN` in `stage.ts`), which is a cheaper and more reliable way of
 * keeping a body out of masonry than pushing it back out afterwards.
 *
 * **Dressing blocks too**, and it has to: the Signal Room's gallery rail is
 * dressing, and being able to stroll through a waist-high barrier is the single
 * clearest way a room stops reading as a place.
 */
export function clearOf(
  plan: RoomPlan,
  x: number,
  z: number,
): { readonly x: number; readonly z: number } {
  let atX = x;
  let atZ = z;

  /** Push the body out of a circle, if it is inside one. */
  const pushOut = (centreX: number, centreZ: number, radius: number): void => {
    const dx = atX - centreX;
    const dz = atZ - centreZ;
    const distance = Math.hypot(dx, dz);
    if (distance >= radius) return;
    if (distance < 1e-4) {
      // Exactly on top of it, which has no direction to be pushed along. Out
      // toward the front of the room, which is where PILOT came from.
      atZ = centreZ + radius;
      return;
    }
    atX = centreX + (dx / distance) * radius;
    atZ = centreZ + (dz / distance) * radius;
  };

  for (const item of plan.dressing) {
    const radius = DRESSING_RADIUS[item.kind];
    if (radius <= 0) continue;
    // A rail and a shelf are runs rather than posts, so the body is pushed off
    // the nearest point *on the run*: treating a six-metre rail as one circle
    // would either leave both ends walkable or fence off half the room.
    const near =
      item.length !== undefined && item.length > 1
        ? alongSegment(item, atX, atZ)
        : { x: item.at.x, z: item.at.z };
    pushOut(near.x, near.z, radius + BODY_RADIUS);
  }

  for (const fixture of plan.fixtures) {
    const radius = FIXTURE_RADIUS[fixture.kind] + BODY_RADIUS;
    if (radius <= BODY_RADIUS) continue;
    // Only things standing on the floor block a body. A gauge two metres up a
    // wall is above head height and a bolt is on a door.
    if (fixture.at.y > 1.4) continue;
    pushOut(fixture.at.x, fixture.at.z, radius);
  }
  return { x: atX, z: atZ };
}

/** Gauge travel, matching the chamber's own clamp of 0 to 8. */
export const GAUGE_MAX = 8;

/**
 * How wide the grate across the dial recess is, in metres.
 *
 * Exported because two files need it and they used to hold it separately:
 * `fixtures.ts` drew a 9.5m grate while this file spread the dials across
 * eleven, which stood the outer two 0.6m past its ends in a room whose own
 * description puts every dial behind it. One number, both ends, for the same
 * reason `MONITOR_DEPTH` is shared.
 */
export const GRATE_WIDTH = 9.5;

/**
 * How wide the dial bank is, in metres.
 *
 * Deliberately much narrower than the gauge bank, and that is the fix for the
 * defect described on the dial loop below rather than a spacing preference. It
 * has to clear the grate's ends and it has to miss every gauge column.
 */
const DIAL_SPAN = 5.4;

/**
 * How many dials KEEPER can reach.
 *
 * A constant rather than `gauges.length`, because it is one: `blind_panel.ts`
 * declares four dials for every session. Deriving it from the gauge facts was
 * part of what tied the two banks together in the first place.
 */
const DIAL_COUNT = 4;

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
      // The gauge's own number, and it is load-bearing rather than a nicety.
      //
      // The reading alone gave a gauge no name. PILOT could see `0/6` and had
      // no word for which `0/6`, so the only handle in reach was the dial
      // caption underneath - which is how a playtester came to tell KEEPER
      // "dial 4 has 0/6" about a gauge dial 4 does not drive. The pair needs a
      // shared noun for a thing whose *value* stays PILOT's alone, and the
      // server already has one: these are its own gauge ids.
      label: `GAUGE ${gauge}  ${String(value)}/${String(target)}`,
      // At the top of its own column, beside the cells it is counting.
      //
      // Both this and the dial beneath it used to fall back to the same
      // floor-clamped height at the same `x`, so a gauge's reading was printed
      // on top of its dial's name. They are three metres apart now, and the
      // reading is where you are already looking when you count the cells.
      captionAt: 3.55,
    });
  });

  // KEEPER's dials, in a bank of their own.
  //
  // **Built in a separate loop from the gauges, and that is the whole fix.**
  // They used to be pushed inside the loop above at the gauge's own `x`, which
  // drew DIAL n directly beneath GAUGE n for every n. The wiring is a random
  // permutation of dials onto gauges, so that column pairing was an assertion
  // of the one fact this chamber exists to withhold - and it was a false one.
  // A player read it straight off the frame and reported the pairing back to
  // KEEPER as fact.
  //
  // The bank is narrow because it has to sit behind the grate, which the gauge
  // spacing did not: at eleven metres the outer two dials stood past its ends.
  // Nothing here may line up with a gauge column again, and the test says so.
  spread(DIAL_COUNT, DIAL_SPAN).forEach((x, index) => {
    fixtures.push({
      id: `dial-${String(index + 1)}`,
      kind: "dial",
      at: { x, y: 0.42, z: -size.depth / 2 + 0.55 },
      channel: "keeper",
      // Settles when the *room* is solved, never when one gauge reaches its
      // target. `buildDial` stops a settled dial turning, which is a cue PILOT
      // can act on, and keying it to `value === target` at the paired index
      // published a dial-to-gauge link that the renderer cannot know and that
      // was wrong in every session where the permutation was not the identity.
      on: solved,
      label: `DIAL ${String(index + 1)}`,
    });
  });

  // The grate the dials sit behind. Shared, because both parties know it is
  // there: PILOT can see it and hear through it, KEEPER reaches past it.
  fixtures.push({
    id: "grate",
    kind: "grate",
    at: { x: 0, y: 0.42, z: -size.depth / 2 + 0.2 },
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
    captionAt: 3.25,
  });

  const clicks = facts.lastClicks;
  return {
    id: "blind_panel",
    size,
    fixtures,
    // Industrial: pipework feeding the gauge bank from above and below, valves
    // between the columns, and a vent at each end. This is the room doc 06
    // section 6 calls wide, shallow and industrial, and the pipes are what make
    // the gauge wall read as plumbing rather than as a scoreboard.
    // An instrument hall.
    //
    // The room was four columns of light on a bare wall, and what it was
    // missing is that nothing said the gauges are *equipment*. They stand in a
    // console now: a sloped desk running the width of the bank, with the dials
    // set into its foot behind the grate, feed pipes dropping into each column
    // from a header overhead, and a chart on each side wall. The columns did
    // not move - the room grew round them.
    dressing: [
      { kind: "console", at: { x: 0, y: 0, z: -size.depth / 2 + 0.75 }, length: size.width - 2.4 },
      // The header the gauges feed from, with a drop into each column.
      ...pipeRun(4.05, -size.depth / 2 + 0.5, size.width - 1, [-5.5, -1.8, 1.8, 5.5]),
      { kind: "chart", at: { x: -size.width / 2 + 0.35, y: 2.2, z: -0.6 }, facing: Math.PI / 2 },
      { kind: "chart", at: { x: size.width / 2 - 0.35, y: 2.2, z: -0.6 }, facing: -Math.PI / 2 },
      { kind: "vent", at: { x: -size.width / 2 + 0.4, y: 2.5, z: 1.8 }, facing: Math.PI / 2 },
      { kind: "vent", at: { x: size.width / 2 - 0.4, y: 2.5, z: 1.8 }, facing: -Math.PI / 2 },
      { kind: "cable", at: { x: -4.6, y: size.height, z: -0.4 }, length: 1.5 },
      { kind: "cable", at: { x: 5.1, y: size.height, z: -0.2 }, length: 1.2 },
      { kind: "puddle", at: { x: 4.2, y: 0, z: 1.6 }, length: 2.8 },
      { kind: "puddle", at: { x: -4.8, y: 0, z: 2.1 }, length: 2.2 },
      ...beams(size, 3),
    ],
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
/**
 * The Concord Lock at the end, with the puzzle gone out of it.
 *
 * Built rather than derived from facts, and the *absence* of the mechanisms is
 * the point. The wheel and the release bar carried readings - `WHEEL 14`,
 * `UNDER TENSION` - and a phase with no facts behind it would print `WHEEL 0`
 * and `SLACK`, which is not a stale number but a false one. What is left is
 * what is still true: twelve bolts home, and a door standing open.
 *
 * Nothing here is a leak. The door being open is what `view.phase` already
 * says, and the console's own rail prints it.
 */
function finale(): RoomPlan {
  const size = ROOM_SIZES.concord_lock;
  const fixtures: Fixture[] = [
    {
      id: "door",
      kind: "door",
      at: { x: 0, y: 0, z: -size.depth / 2 },
      channel: "shared",
      on: true,
      label: "THE DOOR IS OPEN",
      captionAt: 5.6,
    },
  ];
  for (const [index, at] of boltRing(size).entries()) {
    // Home and **unlit**. `on` retracts them into the door, which is what
    // aligned means; `dim` takes the glow off, because their glow is the signal
    // that they are moving and nothing here is moving any more. Twelve lit
    // bolts ringing an open doorway read as a mirror rather than as a way out.
    fixtures.push({
      id: `bolt-${String(index)}`,
      kind: "bolt",
      at,
      channel: "shared",
      on: true,
      dim: true,
    });
  }
  return {
    id: "concord_lock",
    size,
    fixtures,
    dressing: concordDressing(size),
    accent: CHAMBER_ACCENT.concord_lock,
    sound: null,
    solved: true,
    flood: 0,
  };
}

/**
 * The Concord Lock's cathedral, shared by the chamber and by the finale.
 *
 * One definition, because the ending is the same room and a second copy of the
 * columns is a second thing to forget to change.
 */
function concordDressing(size: RoomSize): readonly Dressing[] {
  return [
    ...spread(3, size.depth * 0.55).flatMap((z) => [
      { kind: "column" as const, at: { x: -size.width / 2 + 0.6, y: 0, z }, height: size.height },
      { kind: "column" as const, at: { x: size.width / 2 - 0.6, y: 0, z }, height: size.height },
    ]),
    {
      kind: "cable" as const,
      at: { x: -2.4, y: size.height, z: -size.depth / 2 + 1.4 },
      length: 4.6,
    },
    {
      kind: "cable" as const,
      at: { x: 2.9, y: size.height, z: -size.depth / 2 + 1.1 },
      length: 3.8,
    },
    { kind: "puddle" as const, at: { x: 0, y: 0, z: 2.4 }, length: 4.5 },
    ...beams(size, 4),
  ];
}

/**
 * Where the twelve bolts sit, which is **on the door's own frame**.
 *
 * One definition, used by the chamber and by the finale. The first pass rang
 * them at radius 2.5 about y 3.4, which is centred nearly two metres above a
 * door 2.9m tall: the ring floated on the blank wall over the doorway and read
 * as a row of lamps rather than as the bolts holding a door shut. Sized to the
 * door instead, the side bolts land just outside its jambs and the top one just
 * over its lintel, which is where a bolt on a door actually is.
 */
export function boltRing(size: RoomSize): readonly Vec3[] {
  const RADIUS = 1.8;
  const CENTRE_Y = 2.0;
  return Array.from({ length: DOOR_BOLTS }, (_unused, index) => {
    const angle = (index / DOOR_BOLTS) * Math.PI * 2 - Math.PI / 2;
    return {
      x: Math.cos(angle) * RADIUS,
      y: CENTRE_Y + Math.sin(angle) * RADIUS,
      z: -size.depth / 2 + 0.35,
    };
  });
}

export const DOOR_BOLTS = 12;

/** How many bolts `align_bolt` can land. The array is a multiple of this. */
export const ALIGNABLE_BOLTS = 3;

/** Which bolt is at the top of the ring, and so is the one that carries the count. */
export const TOP_BOLT = DOOR_BOLTS / 2;

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
  for (const [index, at] of boltRing(size).entries()) {
    fixtures.push({
      id: `bolt-${String(index)}`,
      kind: "bolt",
      at,
      channel: "shared",
      on: index < bolts * perBolt,
      dim: index >= bolts * perBolt,
      // On the bolt at the **top** of the ring. Bolt 0 is at the bottom, where
      // its caption clamps to the same floor height as the door's own sign
      // directly below it, and the two printed on top of each other.
      ...(index === TOP_BOLT
        ? { label: `${String(bolts)}/${String(ALIGNABLE_BOLTS)} ALIGNED` }
        : {}),
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
    // A cathedral. Columns down both sides carrying the height, cable falling
    // from the dark above the door, and nothing on the floor between PILOT and
    // the door: the room's whole job is to make the last twelve metres feel
    // like a walk.
    dressing: concordDressing(size),
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
      // The one screen in the game, in the one room that is nothing but a
      // screen. It carries no caption, so without this the lean-in skipped it
      // and `E` did nothing in the Archive at all.
      study: true,
    },
    // Tape crates, either side of the floor. Shared, because a crate is
    // furniture: it carries no fact and neither party can act on it.
    // Two crates, pulled out into the aisle rather than against the walls: the
    // racks stand there now, and a crate inside a rack is the overlap that
    // makes a room look assembled by accident.
    {
      id: "crate-left",
      kind: "crate",
      at: { x: -1.5, y: 0, z: 2.1 },
      channel: "shared",
      on: false,
      dim: true,
    },
    {
      id: "crate-right",
      kind: "crate",
      at: { x: 1.7, y: 0, z: 2.5 },
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
  // Small, cluttered and close (doc 06 section 6): shelving down both walls,
  // cable hanging over the monitor, a puddle under it. This is the one room in
  // the station whose dressing is the point rather than the frame - it is a
  // records room, and it should look like one nobody has filed in for years.
  // A tape library with one working screen in it.
  //
  // The room is small, close and cluttered (doc 06 section 6), and the way to
  // make that read is to fill the walls and leave the middle empty: racks of
  // reels down both sides, a card index under the monitor, one bare bulb on a
  // flex, and nothing at all on the floor between the door and the screen. What
  // the pair does here is stand and watch, so the composition's only job is to
  // put the monitor at the end of an aisle.
  dressing: [
    // One rack, on the east wall. The west wall is the way out, and a rack of
    // reels standing in the doorway is how the first pass of this room looked.
    // Two short racks on the east wall rather than one long one, because the
    // middle of that wall is KEEPER's alcove (`keeperAlcove`) and a 4.6m rack
    // ran straight through the body.
    {
      kind: "shelf",
      at: { x: ROOM_SIZES.archive.width / 2 - 0.35, y: 0, z: 2.4 },
      facing: -Math.PI / 2,
      length: 1.6,
    },
    {
      kind: "shelf",
      at: { x: ROOM_SIZES.archive.width / 2 - 0.35, y: 0, z: -2.4 },
      facing: -Math.PI / 2,
      length: 1.6,
    },
    // Outboard of the monitor, which is four metres wide: at 2.5 they buried
    // 0.4m of themselves in its housing on each side.
    {
      kind: "cabinet",
      at: { x: -3.05, y: 0, z: -ROOM_SIZES.archive.depth / 2 + 0.45 },
      length: 1.8,
    },
    {
      kind: "cabinet",
      at: { x: 3.05, y: 0, z: -ROOM_SIZES.archive.depth / 2 + 0.45 },
      length: 1.8,
    },
    // **A pair, off the centre line**, and that is a sightline decision rather
    // than a symmetry one. A single pendant hung at x 0 is a lamp swinging
    // directly between the camera and the screen: it projected onto the middle
    // of the picture, and it was reported the same way the beams were - "I
    // can't see the screen". Flanking the monitor also lights the room from
    // both sides, which a records room wants more than a bulb in the middle.
    { kind: "bulb", at: { x: -2.6, y: ROOM_SIZES.archive.height, z: 0.6 }, height: 0.7 },
    { kind: "bulb", at: { x: 2.6, y: ROOM_SIZES.archive.height, z: 0.6 }, height: 0.7 },
    { kind: "cable", at: { x: 2.1, y: ROOM_SIZES.archive.height, z: 1.6 }, length: 1.1 },
    { kind: "puddle", at: { x: -0.5, y: 0, z: 1.9 }, length: 2.4 },
    // **No beams.** The room is 3.2m tall and the monitor is 2.9m of that, so
    // a beam under the ceiling is a girder drawn straight across the screen -
    // in the one room whose whole content is that screen. The bulb on its flex
    // is this room's ceiling instead.
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
  // The last two beats, before the chamber check, for the same reason the
  // Archive is: the machine clears `chamber` on the way into FINALE and again
  // into ESCAPED, and the worker sends no facts for a phase with no puzzle
  // left in it. Asking the chamber first therefore drew **an empty room** -
  // the Concord Lock's bare shell, with the caption THE DOOR IS OPEN over it
  // and no door, no bolts, no columns and nobody standing there. That is the
  // payoff of the entire game and it was a grey box.
  if (view.phase === "FINALE" || view.phase === "ESCAPED") return finale();

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
      return ["", ""];
  }
}

/**
 * Whether this phase's own words are the thing on screen.
 *
 * The band used to be shown wherever there was no room to draw, which was the
 * same set until the finale grew a room. The moment it did, the last two
 * headlines in the game - THE OUTER DOOR, and THE DOOR IS OPEN - stopped being
 * printed at all. What the band is actually for is a phase whose content is the
 * phase, so that is what it asks.
 */
export function hasInterlude(view: PilotView): boolean {
  return interlude(view)[0].length > 0;
}
