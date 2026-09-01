/**
 * What the station should be playing, as a pure function of the view.
 *
 * Separated from every node and every context on purpose, and for the same
 * reason `chamber.ts` is separated from `stage.ts`: Web Audio exists in a
 * browser and nowhere else, so any decision left inside a node graph is a
 * decision no test can reach. Everything here is arithmetic over a `PilotView`.
 * `engine.ts` and `voices.ts` hold the parts that make noise and decide
 * nothing.
 */

import { isCue, type ChamberId, type Cue, type PilotView } from "@semaphore/protocol";

/**
 * A continuous voice. The bed always runs; the rest are doc 06 section 11's
 * adaptive tension layers, added as the chamber's clock drains.
 */
export type Layer = "bed" | "theme" | "drone" | "pulse" | "arpeggio" | "heartbeat";

/** What should be sounding continuously, and how loud the ambience sits. */
export interface Score {
  readonly layers: readonly Layer[];
  /**
   * How loud the atmospheric half sits, 0 to 1: the ambience and the theme.
   *
   * Ducked under the heartbeat, which is the one place doc 06 asks for it: at
   * the last tenth of the clock it steps out of the way rather than competing.
   * The theme rides this rather than carrying a level of its own, because
   * "the warm layer" and "the ambience" want to move together in every case
   * that has come up, and two knobs that are always turned together are one
   * knob and a chance to forget the second.
   */
  readonly bed: number;
}

/** Where each layer joins, as a fraction of the chamber's clock remaining. */
const PULSE_AT = 0.5;
const ARPEGGIO_AT = 0.25;
const HEARTBEAT_AT = 0.1;

/** How far the bed drops once the heartbeat is under it. */
const BED_DUCKED = 0.45;

/**
 * The layers owed to a chamber with `remainingMs` of `totalMs` left.
 *
 * An untimed session gets the bed and the drone and never escalates, which is
 * the whole point of Practice: doc 02 section 7 makes it the preset a player
 * uses to look at the station without being hurried, and a heartbeat would
 * hurry them. A chamber with no clock is the same case.
 */
export function scoreFor(remainingMs: number | null, totalMs: number): Score {
  // The theme is always on, and it is the station's resting state: warm, slow
  // and unresolved. It does not escalate and it is never taken away. What
  // happens as the clock drains is that harder things arrive *on top of* it,
  // which is why the last tenth ducks it rather than cutting it - a warm
  // instrumental under a heartbeat is the room still being the room while
  // something goes wrong in it.
  const base: readonly Layer[] = ["bed", "theme", "drone"];
  if (remainingMs === null || totalMs <= 0) return { layers: base, bed: 1 };

  const left = Math.max(0, remainingMs) / totalMs;
  const layers = [...base];
  if (left <= PULSE_AT) layers.push("pulse");
  if (left <= ARPEGGIO_AT) layers.push("arpeggio");
  if (left <= HEARTBEAT_AT) layers.push("heartbeat");
  return { layers, bed: left <= HEARTBEAT_AT ? BED_DUCKED : 1 };
}

/** One thing to sound once, now. */
export interface Sounding {
  readonly cue: Cue;
  /** How many times, spaced by `DETENT_MS`. One for everything but a detent. */
  readonly count: number;
}

/**
 * How far apart two detents sit, in milliseconds.
 *
 * Doc 06 section 11 fixes this at 180ms and calls it a design constraint
 * rather than a taste: PILOT counts these through a grate to learn what
 * KEEPER's rotation actually registered (doc 02 section 3.3), and a count is
 * only countable if the ear has time to separate the clicks.
 */
export const DETENT_MS = 180;

/**
 * What to sound, given the frame before and the frame now.
 *
 * **Keyed on `seq`, never on the facts.** The Blind Panel is the reason: two
 * rotations that each register three clicks produce frames whose every field
 * is identical, and PILOT has to hear six detents rather than three. A diff of
 * the facts hears the second rotation as silence, which in the one chamber
 * where the count is the puzzle is not a missing flourish but a wrong answer.
 *
 * Returns null when nothing new has happened, which is most frames: the view
 * is pushed on a timer as well as on an action.
 */
export function soundingFor(previous: PilotView | null, current: PilotView): Sounding | null {
  if (previous !== null && previous.seq === current.seq) return null;

  // The intercom, before anything the chamber says.
  //
  // Keyed on the assist's own index rather than on `seq` alone, because a
  // frame bumps `seq` for plenty of reasons that have nothing to do with the
  // intercom. First, because a chamber's `lastClicks` stays on the frame
  // after the rotation that set it: reaching the branch below on an intercom
  // frame would replay the previous rotation's detents underneath the
  // announcement, and in Chamber II a detent count is a puzzle fact rather
  // than a flourish.
  if ((current.assist?.index ?? 0) > (previous?.assist?.index ?? 0)) {
    return { cue: "chime", count: 1 };
  }

  // The Blind Panel speaks in detents and has no `lastCue` of its own: the
  // count *is* the cue, and it already travels as this chamber's own AUDIBLE
  // fact. Reading it here rather than adding a second field keeps one fact
  // meaning one thing.
  const clicks = current.facts["lastClicks"];
  if (typeof clicks === "number") {
    // A rotation that registered nothing is genuinely silent, and that silence
    // is information: it says the linkage is against a bound. The subtitle
    // still reads "0 clicks registered", and the behind-the-wall sound of the
    // tool call itself is what tells PILOT that KEEPER did something at all.
    return clicks > 0 ? { cue: "detent", count: Math.min(clicks, MAX_DETENTS) } : null;
  }

  const cue = current.facts["lastCue"];
  return isCue(cue) ? { cue, count: 1 } : null;
}

/**
 * A ceiling on detents, so a malformed frame cannot schedule a minute of
 * clicking. The chamber's own clamp is 8 marks of travel, so nothing honest
 * ever reaches this.
 */
const MAX_DETENTS = 16;

/* -------------------------------------------------------- where a sound is --
 *
 * The station is a place, and until now it did not sound like one: every voice
 * arrived at the centre of the head at the same distance, in a game whose whole
 * subject is perceiving a room well enough to describe it out loud.
 *
 * Positions here are **normalised room coordinates**, not metres: `x` runs -1
 * at the west wall to +1 at the east, `z` runs -1 at the open south face the
 * camera looks through to +1 at the far wall. Normalised rather than metric
 * because the audio layer must not import `render/chamber.ts` - that module is
 * eighteen hundred lines of room geometry and pulling it into the entry chunk
 * to place four sounds would cost more bundle than the whole audio layer weighs.
 * The stage normalises PILOT's real position on its way in, which is one
 * division at the one place that already holds both the position and the room's
 * size.
 */

/** Where something stands in a room, -1 to 1 on each axis. */
export interface Place {
  readonly x: number;
  readonly z: number;
}

/**
 * KEEPER, in the east wall.
 *
 * `render/keeper.ts` draws the body into the wall rather than on the floor -
 * it is not in the room, it is behind the station's panels - and every room
 * reserves the same alcove for it (`KEEPER_ALCOVE`). So the muffled thump of a
 * tool call has a direction, it is the same direction all session, and it is
 * the one sound in the game that tells PILOT where their partner is.
 */
export const KEEPER_AT: Place = { x: 0.95, z: 0 };

/**
 * Where each room's mechanism stands, which is where its cues come from.
 *
 * One place per chamber rather than one per fixture. A fixture table would have
 * to be kept in step with the renderer's own, and the difference between "the
 * far wall" and "the third gauge on the far wall" is not something a listener
 * can resolve on two speakers - so the coarse version is not a compromise, it
 * is the resolution the medium actually has.
 */
export const MECHANISM_AT: Readonly<Record<ChamberId, Place>> = {
  // Three levers on the far wall, and the door beyond them.
  airlock: { x: 0, z: 0.85 },
  // The key bank under the glyph ring.
  signal_room: { x: 0, z: 0.8 },
  // The grate at floor level. Not the gauge bank above it: what PILOT hears
  // from this room is the dials, and the needles make no sound at all.
  blind_panel: { x: 0.3, z: 0.9 },
  // The door itself, which is most of the far wall.
  concord_lock: { x: 0, z: 0.9 },
} as const;

/** Where a cue comes from, given the room. Centre when the pair is between rooms. */
export function placeFor(chamber: ChamberId | null): Place {
  return chamber ? MECHANISM_AT[chamber] : { x: 0, z: 0.6 };
}

/* --------------------------------------------------------- how a room rings --
 *
 * One impulse response for every room made the station one room. These are the
 * two numbers a listener actually hears the difference between: how long the
 * tail runs, and how hard the early part of the curve arrives.
 */

/** What the convolver should be built from for a given room. */
export interface Acoustic {
  /** How long the tail runs, in seconds. */
  readonly seconds: number;
  /**
   * The decay exponent. Higher is a faster front and a tighter room; lower
   * leaves energy in the tail and reads as large and hard-walled.
   */
  readonly decay: number;
}

/**
 * How each room rings, from what the room actually is.
 *
 * The Concord Lock is the tall one and it is meant to sound like the inside of
 * a tower. The Blind Panel is low, cluttered and half-full of machinery, so it
 * is the driest room in the station - which also matters mechanically, because
 * it is the one room where a count has to be picked out of the reverb.
 */
export const ACOUSTICS: Readonly<Record<ChamberId | "elsewhere", Acoustic>> = {
  airlock: { seconds: 1.6, decay: 2.2 },
  signal_room: { seconds: 2.4, decay: 2.6 },
  blind_panel: { seconds: 1.1, decay: 3.4 },
  concord_lock: { seconds: 3.6, decay: 1.9 },
  /** Corridors, the Archive, and the beats between rooms. */
  elsewhere: { seconds: 2.4, decay: 2.6 },
} as const;

/** The acoustic owed to a room, or the station's default between them. */
export function acousticFor(chamber: ChamberId | null): Acoustic {
  return chamber ? ACOUSTICS[chamber] : ACOUSTICS.elsewhere;
}

/* ----------------------------------------------------- how far away KEEPER is --
 */

/** The lowest the tool-call thump is filtered to, in Hz, standing across the room. */
const OCCLUDED_HZ = 260;
/** The highest it opens to, standing at the alcove with your ear on the wall. */
const CLOSE_HZ = 1150;

/**
 * How open KEEPER's thump sounds, given how far PILOT is standing from it.
 *
 * KEEPER is *inside the wall*: they can see each other and reach each other
 * nowhere. A fixed low-pass said "behind something" and never said "behind
 * that". Walking toward the alcove now brings the agent's hands into focus,
 * which is the one thing in the game that rewards standing near your partner.
 *
 * Linear in distance rather than in the inverse square, deliberately: the
 * physical law is about level, this is about *timbre*, and a curve tuned to
 * sound right beats a curve derived from the wrong law.
 */
export function occlusionHz(distance: number): number {
  const near = Math.max(0, Math.min(1, distance / 2));
  return CLOSE_HZ + (OCCLUDED_HZ - CLOSE_HZ) * near;
}

/* -------------------------------------------------- what KEEPER's hands sound like --
 */

/**
 * A, two octaves below middle. The root everything else here is measured from.
 *
 * The theme is in A natural minor (`theme.test.ts` holds it), and a tool call
 * that is not in that key is interference rather than music. It arrives ten or
 * twenty times a chamber, under the score, so it had better belong to it.
 */
const TOOL_ROOT_HZ = 55;

/** Equal temperament, from the root. */
export const semitone = (n: number): number => TOOL_ROOT_HZ * 2 ** (n / 12);

/**
 * Which note each tool speaks with, in semitones above the root.
 *
 * The previous version derived a pitch from a hash of the tool's name
 * (`hash % 11 * 7` Hz) and its docstring said this meant a new tool got its own
 * note for free. It did not: a hash is uniform over the *name*, not over the
 * ear, so two tools alive in the same room could land a couple of hertz apart
 * and be indistinguishable, and none of the pitches were in the theme's key. It
 * was free in the sense that nobody had to write a table, and it cost the one
 * thing the sound was for.
 *
 * So: authored, in A natural minor, and **held apart by a test** rather than by
 * whoever adds the next tool remembering. `plan.test.ts` asserts that the tools
 * registered together in any one room are at least a minor third apart, which
 * is the interval an untrained ear reliably hears as "a different thing"
 * rather than as "that again, slightly off".
 *
 * What this buys is not flavour. PILOT cannot see what KEEPER is doing and can
 * always hear that it is doing *something* (doc 06 section 11); with a note per
 * tool, PILOT can hear **which** something, and say so. That is a fact arriving
 * on the `AUDIBLE` channel, in the medium's own terms, which is the channel's
 * whole design: both parties perceive it, rendered differently to each.
 */
export const TOOL_NOTES: Readonly<Record<string, number>> = {
  // KEEPER's constant faculties, low and felt more than heard: 55Hz to about
  // 175. They are the background rhythm of a session rather than events in a
  // room, and they are alive at the same time as everything below, so every
  // one of them has to clear every one of those too.
  get_status: 0,
  describe_chamber: 3,
  inspect: 7,
  read_manual: 10,
  read_note: 14,
  write_note: 17,
  request_assistance: 20,
  // The front door, alone in its own tier and so under no constraint but the key.
  begin_shift: 12,
  // The Archive's one read, alive beside the persistent set and nothing else.
  read_station_log: 24,
  // Chamber mechanisms, an octave up where a room's own actions live and where
  // a note is pitched clearly enough to be named rather than just felt.
  pull_lever: 24,
  press_key: 24,
  reset_sequence: 27,
  rotate_dial: 24,
  pilot_rotate_dial: 27,
  read_ciphertext: 24,
  get_lock_state: 27,
  align_bolt: 31,
  speak_passphrase: 34,
  // The last call of the game, at the top of the range it has been climbing.
  open_the_door: 36,
} as const;

/** The note a tool speaks with, in Hz. Anything unlisted gets the root. */
export function toolPitch(tool: string): number {
  return semitone(TOOL_NOTES[tool] ?? 0);
}

/* --------------------------------------------------- the score, scored in bits --
 */

/**
 * Below this many bits of remaining ambiguity, the station starts to resolve.
 *
 * `concordBits` is `log2(distinct next actions)`: the decision-relevant
 * ambiguity left in the room, which is the quantity PILOT still has to supply.
 * Two bits is four courses of action still open; one bit is a coin flip; zero
 * is "the pair knows what to do".
 */
const RESOLVING_BELOW_BITS = 1.5;

/**
 * How much the theme's unresolved harmony closes, 0 to 1, at a given reading.
 *
 * **The score is scored in bits.** The theme is deliberately unresolved - no
 * leading note in a chord, no second in the melody, which is what keeps it
 * hanging - and this is the one thing that lets it settle. It is not a
 * difficulty curve and it is not the clock: it is the pair converging, sounding
 * like the pair converging.
 *
 * `null` means the meter is not running, which is every phase outside a chamber
 * and every benchmark session (doc 07 section 2.3 turns CONCORD off there so a
 * HUD element cannot contaminate what is being measured; a score keyed to it is
 * another such element and reads the same absence). Unresolved is the resting
 * state, so null resolves nothing.
 */
export function resolutionFor(bits: number | null): number {
  if (bits === null) return 0;
  if (bits >= RESOLVING_BELOW_BITS) return 0;
  return Math.max(0, Math.min(1, 1 - bits / RESOLVING_BELOW_BITS));
}
