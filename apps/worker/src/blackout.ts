/**
 * The Blackout: the one window in the game where the two roles trade places.
 *
 * Doc 01 section 6 scoped role inversion out as "compelling, expensive". It is
 * neither, once the asymmetry is a perception model rather than a convention:
 * `INVERTED_PERCEPTION` is the design law with its two lists exchanged, and
 * every projection in the worker already takes the model it projects under. So
 * the beat is a window, a flag, and one honest question - **does the proof
 * still hold with the parties swapped?**
 *
 * ## Why the Blind Panel, and only the Blind Panel
 *
 * Measured, not chosen. Running the possible-worlds measurement under both
 * maps, at chamber entry, over the proof's own seeds:
 *
 * | Chamber | Under the law | Inverted |
 * |---|---|---|
 * | 0 Airlock | 6 worlds, 3 actions | **1 world, 1 action** |
 * | I Signal Room | 1956 / 1956 | **0 worlds** (not even spanned) |
 * | II Blind Panel | 384 / 384 | **384 / 384** |
 * | III Concord Lock | 26 / 26 | **1 world, 1 action** |
 *
 * Three of the four collapse: their secrets live on `VISUAL`, so handing
 * `VISUAL` to KEEPER hands KEEPER the answer. The Blind Panel does not,
 * because its secret is on neither channel - the dial-to-gauge wiring is
 * `HIDDEN`, and inverting a two-party model exchanges two lists and cannot
 * invent a channel neither list names. The room is exactly as hard from the
 * other side, which is a stronger claim than "it still works".
 *
 * ## Swapping perception alone would hand the agent the game
 *
 * This is the part that a per-state proof cannot see, and it is worth stating
 * plainly because it was nearly built wrong. The proof measures one instant.
 * The game is a trajectory, and this chamber is solved by *system
 * identification*: rotate, observe, revise. An agent that could see the gauges
 * and still had the dials would need nobody - it would rotate and watch, alone,
 * and the pair would have been deleted while every clause of the proof stayed
 * green.
 *
 * **So the Blackout inverts agency as well as perception.** In the dark KEEPER
 * cannot find the dials; PILOT is standing at the panel and turns them by
 * hand. KEEPER reads the gauges out and PILOT reports what moved under their
 * fingers - the same conversation, with the sentences swapped. `rotate_dial`
 * leaves KEEPER's registry for the duration, which is a `toolchange` firing
 * *inside* a chamber rather than at its boundary, and KEEPER's body loses the
 * limb and gets it back.
 *
 * ## Everything here is derived
 *
 * The window is a function of the rotation count, which the chamber already
 * stores. Nothing is written down, so nothing can drift, an eviction cannot
 * lose it, and a replay of the same seed blacks out at the same moment.
 */

import { INVERTED_PERCEPTION, PERCEIVED_BY, type Channel, type Party } from "@semaphore/protocol";
import type { PerceptionModel } from "@semaphore/asymmetry";
import * as blindPanel from "./chambers/blind_panel.js";
import type { PersistedSession } from "./reducer.js";

/**
 * How many rotations the pair gets under the lamps before they fail.
 *
 * Four, because the room has to be *understood* before it is inverted. A
 * blackout on the first rotation is a different chamber; a blackout after the
 * pair has formed a hypothesis is the same chamber from the other side, which
 * is the whole point of the beat.
 */
export const BLACKOUT_AFTER_ROTATIONS = 4;

/**
 * How many rotations the lamps stay out for.
 *
 * Counted in rotations rather than seconds so the beat is identical in
 * Practice, where there is no clock at all, and so a `?seed=` replay blacks
 * out at the same point in the same room every time.
 */
export const BLACKOUT_ROTATIONS = 3;

/**
 * Whether the lamps are out right now.
 *
 * Guarded on the phase as well as the chamber: `machine.chamber` stays set
 * through `ARCHIVE`, `TRANSITIONING` and `DEADLOCK` so the machine knows which
 * room was last entered, and a beat keyed on the chamber alone would go on
 * inverting the world after the pair had left the room.
 */
export function blackoutOpen(session: PersistedSession): boolean {
  if (!session.blackout) return false;
  if (session.machine.phase !== "IN_CHAMBER") return false;
  if (session.machine.chamber !== "blind_panel") return false;
  const panel = session.blindPanel;
  if (!panel || blindPanel.isSolved(panel)) return false;
  const rotations = panel.history.length;
  return (
    rotations >= BLACKOUT_AFTER_ROTATIONS &&
    rotations < BLACKOUT_AFTER_ROTATIONS + BLACKOUT_ROTATIONS
  );
}

/** How many rotations remain before the lamps come back. Zero when they are on. */
export function rotationsUntilLampsReturn(session: PersistedSession): number {
  if (!blackoutOpen(session)) return 0;
  const rotations = session.blindPanel?.history.length ?? 0;
  return BLACKOUT_AFTER_ROTATIONS + BLACKOUT_ROTATIONS - rotations;
}

/**
 * The perception model every projection in this session must use right now.
 *
 * **The single decision point.** `views.ts` and `pilot.ts` both call this
 * rather than each deciding for itself, because two surfaces that worked out
 * the perception map separately are two surfaces that can disagree about it -
 * and a disagreement here is not a bug, it is one party holding the other's
 * half.
 */
export function perceptionFor(session: PersistedSession): PerceptionModel<Party, Channel> {
  return blackoutOpen(session) ? INVERTED_PERCEPTION : PERCEIVED_BY;
}
