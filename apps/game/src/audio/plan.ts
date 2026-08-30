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

import { isCue, type Cue, type PilotView } from "@semaphore/protocol";

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
