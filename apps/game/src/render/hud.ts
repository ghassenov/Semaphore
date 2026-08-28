/**
 * The console's arithmetic, with no surface in it.
 *
 * Everything the heads-up display has to *decide* lives here: how a timer
 * reads at four seconds left, how full the CONCORD meter is, what the channel
 * legend says. Whoever is drawing paints the answers.
 *
 * The display itself moved off the canvas in D-036. It used to be six panels
 * crammed into the seventy pixels above and below the section, at an estimated
 * 4.8 pixels per character; it is DOM now, beside the canvas, where a browser
 * measures its own text and a screen reader can read it. So this file lost its
 * band coordinates and its character-width estimate, and kept every function
 * that can be wrong in a way nobody notices by looking.
 *
 * What is *not* here, and may not come back, is anything that decides a puzzle
 * fact. The console shows the room's name, the clock, the registry, the log and
 * the pad. Every one of those is a thing KEEPER can already obtain for itself
 * or a thing both parties perceive, which is why they are allowed to be text
 * nodes at all (see this app's CLAUDE.md). The glyphs, the needle values and
 * the cipher offset stay on the canvas.
 */

import type { RenderChannel } from "./palette.js";
import { CHANNEL_MARKER } from "./palette.js";

/**
 * How many rows the console keeps of each running list.
 *
 * A cap rather than a scrollbar: these are three panels somebody glances at
 * mid-sentence, and the useful contents of all three is what just happened.
 */
export const LOG_LINES = 6;
export const PAD_LINES = 6;
export const MANIFEST_LINES = 12;

/**
 * A note as the pad shows it: the writer's initial, then their words.
 *
 * Each line is coloured by its writer's channel, which is the whole reason
 * authorship is tracked at all. Amber is PILOT's, cyan is KEEPER's, and the
 * pad is the one surface in the game where the two appear together.
 */
export function formatNote(author: string, text: string): string {
  return `${author === "KEEPER" ? "K" : "P"} ${text}`;
}

/**
 * The chamber clock, as PILOT reads it aloud.
 *
 * Rounds up, so the last second is shown as "1" for its whole duration rather
 * than as "0" for half of it. A clock that reads zero while the room is still
 * live is a clock that makes the pair panic early, and the server is the only
 * thing that decides when time is actually out.
 */
export function formatTimer(remainingMs: number | null): string {
  if (remainingMs === null) return "UNTIMED";
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Below this fraction of the chamber's clock, the timer turns alarm-red. */
export const TIMER_URGENT_FRACTION = 0.15;

/**
 * The meter's lit fraction, relative to the most ambiguity seen in this room.
 *
 * The absolute scale is not comparable across chambers - the Airlock opens at
 * log2(3) bits and the Blind Panel at several times that - so a fixed maximum
 * would render the Airlock as permanently near-empty and teach the player
 * nothing. Normalising against the room's own high-water mark makes the meter
 * mean what doc 02 section 5 says it means: how much of *this room's* opening
 * ambiguity is left.
 *
 * Returns 0 for an unmeasured room, which draws as empty rather than as full.
 * An empty meter beside a room nobody is in is the honest reading.
 */
export function meterFill(bits: number | null, peakBits: number): number {
  if (bits === null || peakBits <= 0) return 0;
  return Math.max(0, Math.min(1, bits / peakBits));
}

/**
 * The channel legend, which is teaching material rather than decoration.
 *
 * It is on screen permanently because the colour law is the game's core
 * mechanic made visible, and a player who has not internalised it cannot tell
 * a fact they must describe from a fact their partner already has. Each row
 * carries its shape marker, because colour alone must never carry information.
 */
export interface LegendRow {
  readonly channel: RenderChannel;
  readonly marker: string;
  readonly text: string;
}

export const LEGEND: readonly LegendRow[] = [
  { channel: "pilot", marker: CHANNEL_MARKER.pilot, text: "YOURS ONLY" },
  { channel: "keeper", marker: CHANNEL_MARKER.keeper, text: "KEEPER ONLY" },
  { channel: "shared", marker: CHANNEL_MARKER.shared, text: "BOTH" },
] as const;

/**
 * One line of the action log.
 *
 * Kept as a formatted string rather than a structured record because the log
 * is read, never queried: the session log in the Durable Object is the
 * queryable one, and duplicating its schema here would invite the two to
 * disagree about what happened.
 */
export function formatCall(tool: string, outcome: string, durationMs: number): string {
  return `${tool} ${outcome} ${String(Math.round(durationMs))}ms`;
}

/**
 * Trim the log to what fits, newest first.
 *
 * A pure function rather than an array mutation on the model, so the "newest
 * first, oldest dropped" rule is checkable without constructing a renderer.
 */
export function pushLine(lines: readonly string[], line: string): readonly string[] {
  return [line, ...lines].slice(0, LOG_LINES);
}
