/**
 * What the room wants, and how far into it the pair is.
 *
 * The console has always shown a room name, a clock and a set of facts, and
 * never once said what any of it was *for*. KEEPER has `describe_chamber` and
 * the manual to answer that; PILOT had nothing equivalent, which is why the
 * first minute in a new room is spent working out what the game is asking
 * rather than playing it.
 *
 * ## The objective is SHARED, and it is authored
 *
 * Each line is a constant. Nothing is interpolated into it and nothing reads
 * chamber state, so there is no channel for a projection to strip - the same
 * argument `Note` makes for itself in `packages/protocol/src/game.ts`. Both
 * parties are told which room they are in and what a room is for; that is the
 * premise of the game rather than a fact inside it. What a line may never do
 * is name a `VISUAL` fact or state an answer, and `objective.test.ts` holds
 * every one of them to that.
 *
 * ## Progress cannot leak, by construction
 *
 * `progressIn` reads keys off **whatever projection it is handed** and returns
 * null for a key that is not there. Hand it `projectForPilot` output and it
 * answers with PILOT's reading; hand it `projectForKeeper` output and it
 * answers with KEEPER's; neither can reach the other's, because neither
 * projection contains the other's keys in the first place. That is one
 * function with two callers rather than two functions that have to be audited
 * against each other, and it is why the Blind Panel can honestly report
 * needles to one party and rotations to the other from the same line of code.
 *
 * `total` is nullable for exactly one reason and it is a puzzle reason: the
 * Signal Room's sequence length is a function of which glyphs this session
 * drew, so publishing "3 of 4 keys" would hand both parties a fact the
 * chamber exists to withhold. It counts up and never says how far it has to
 * go.
 */

import type { ChamberId, Progress } from "@semaphore/protocol";
import { LEVERS } from "./chambers/airlock.js";
import { GAUGES } from "./chambers/blind_panel.js";
import { BOLT_COUNT } from "./chambers/concord_lock.js";

/**
 * One line per room: what the pair is trying to do, in the second person.
 *
 * Written to be true before anybody has touched anything, so it reads the
 * same on arrival as it does five minutes in. It names mechanisms by the
 * words both parties already have for them (a lever is a lever to the hand
 * and to the eye) and never by a glyph, which is PILOT's half of the work.
 */
const OBJECTIVES: Readonly<Record<ChamberId, string>> = {
  airlock: "Get the outer door open. One of the three levers releases it; the others vent air.",
  signal_room:
    "Press the right brass keys, in the right order. Three wrong presses in a row reset the room.",
  blind_panel: "Bring all four needles onto their marks at the same time.",
  concord_lock: "Hold the lock open, align its three bolts, then speak the passphrase.",
} as const;

/** What the room in `chamber` is asking for. */
export function objectiveFor(chamber: ChamberId): string {
  return OBJECTIVES[chamber];
}

/** Read a number off a projected fact set, or null if this party cannot perceive it. */
function count(facts: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = facts[key];
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return value.length;
  return null;
}

/**
 * How far into the room this party can see the pair to be.
 *
 * Returns null when the projection it was handed holds nothing to count,
 * which is the honest answer rather than a zero: a bar reading "0 of 4" to
 * somebody who cannot perceive the needles is a claim about the room, and the
 * one thing this file may not do is assert something the party it is speaking
 * to has no way to know.
 */
export function progressIn(
  chamber: ChamberId,
  facts: Readonly<Record<string, unknown>>,
): Progress | null {
  switch (chamber) {
    case "airlock": {
      const tried = count(facts, "pulled");
      return tried === null ? null : { done: tried, total: LEVERS.length, label: "levers tried" };
    }
    case "signal_room": {
      // No total. See the module docstring: the sequence length is this
      // session's answer wearing a different hat.
      const accepted = count(facts, "pressedSequence");
      return accepted === null ? null : { done: accepted, total: null, label: "keys accepted" };
    }
    case "blind_panel": {
      // PILOT reads the needles against the plate; both are VISUAL, so this
      // branch is unreachable for KEEPER and falls through to the rotations.
      const values = facts["gaugeValues"] as Record<string, number> | undefined;
      const targets = facts["targets"] as Record<string, number> | undefined;
      if (values && targets) {
        const onMark = GAUGES.filter((gauge) => values[gauge] === targets[gauge]).length;
        return { done: onMark, total: GAUGES.length, label: "needles on mark" };
      }
      const rotations = count(facts, "rotationCount");
      return rotations === null ? null : { done: rotations, total: null, label: "rotations made" };
    }
    case "concord_lock": {
      const aligned = count(facts, "boltsAligned");
      return aligned === null ? null : { done: aligned, total: BOLT_COUNT, label: "bolts aligned" };
    }
  }
}

/** The objective and the progress as one line of tool output. */
export function objectiveLine(chamber: ChamberId, progress: Progress | null): string {
  if (!progress) return objectiveFor(chamber);
  const of = progress.total === null ? "" : ` of ${String(progress.total)}`;
  return `${objectiveFor(chamber)} (${progress.label}: ${String(progress.done)}${of})`;
}
