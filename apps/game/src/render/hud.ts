/**
 * The HUD's arithmetic, with no canvas in it.
 *
 * Everything the heads-up display has to *decide* lives here: how a timer
 * reads at four seconds left, how many pixels of the CONCORD meter are lit,
 * what the channel legend says. `ChamberScene` paints the answers.
 *
 * The split is the same one `rooms.ts` makes and for the same reason: this is
 * the part that can be wrong in a way nobody notices by looking, so it is the
 * part that gets unit tests.
 */

import type { RenderChannel } from "./palette.js";
import { CANVAS, FRAME, SECTION_BOTTOM } from "./cutaway.js";
import { CHANNEL_MARKER } from "./palette.js";

/**
 * Where the HUD's bands sit on the 320x180 canvas.
 *
 * The vertical budget is tight and every band is measured against the 8px
 * line height, because at this resolution two bands a few pixels apart do not
 * look cramped, they look like one illegible band. `hud.test.ts` asserts they
 * do not overlap, which is the only way to notice before a screenshot.
 */
export const METER_Y = FRAME + 10;
export const METER_HEIGHT = 5;
/** The audible fact's strip, drawn between the section and the panels. */
export const AUDIBLE_Y = SECTION_BOTTOM + 4;
export const AUDIBLE_HEIGHT = 10;
export const PANEL_Y = SECTION_BOTTOM + 20;
export const LEGEND_Y = CANVAS - FRAME - 12;

/** One line of 8px text, which is what every band below is measured in. */
export const LINE_HEIGHT = 8;

/**
 * The panel row, in three columns: what KEEPER did, what the pair wrote down,
 * and what KEEPER can currently do.
 *
 * The middle column is the widest because it holds sentences two people wrote
 * for each other, and the other two hold identifiers. Three columns rather
 * than two because the notepad is the exhibit, not an extra: it is the only
 * surface both parties write to, and a pad the player cannot see is a pad
 * they will not use.
 */
export const LOG_X = FRAME + 4;
export const LOG_WIDTH = 88;
/** How many lines fit before the oldest is dropped. */
export const LOG_LINES = 3;

export const PAD_X = 102;
export const PAD_WIDTH = 128;
export const PAD_LINES = 3;

/**
 * The pad's in-world marker: a paper pad on the wall of the floor the pair is
 * standing in, in its left margin, clear of every chamber's furniture.
 *
 * Narrow, because the readable copy is in the panel below and the point of
 * this one is that the pad is a physical thing in the station rather than an
 * interface element. `rooms.test.ts` holds every chamber's pieces clear of it.
 */
export const WALL_PAD_X = 2;
export const WALL_PAD_WIDTH = 12;

/** The manifest plate: KEEPER's registry, as the page actually reports it. */
export const MANIFEST_X = 236;
export const MANIFEST_WIDTH = CANVAS - FRAME - MANIFEST_X;
export const MANIFEST_LINES = 3;

/**
 * Characters that fit in a box, at the greybox font's width.
 *
 * Monospace 8px measures very close to 4.8px per character in every browser
 * that runs this. It is an estimate rather than a measurement because the
 * alternative is a canvas metrics call per line per frame, and the cost of
 * being one character out is one character of ellipsis.
 */
const CHAR_WIDTH = 4.8;

export function charsThatFit(widthPx: number): number {
  return Math.max(1, Math.floor(widthPx / CHAR_WIDTH));
}

/** How wide a string draws, at the same estimate. */
export function textWidth(text: string): number {
  return Math.ceil(text.length * CHAR_WIDTH);
}

/**
 * Cut a line to what its box can hold.
 *
 * Every string that reaches the HUD comes from the server, and the server
 * writes for an agent: `start full` answers with a paragraph of briefing. Left
 * whole, that paragraph runs straight through the panel beside it and makes
 * both unreadable. Truncating is not cosmetic here, it is the difference
 * between two panels and one smear.
 */
export function truncate(line: string, widthPx: number): string {
  const limit = charsThatFit(widthPx);
  if (line.length <= limit) return line;
  // The ellipsis is itself a character, so a box with room for one gets the
  // ellipsis alone. Anything else returns a string longer than the box it was
  // measured against, which defeats the point of measuring.
  return limit <= 1 ? "\u2026" : `${line.slice(0, limit - 1)}\u2026`;
}

/**
 * A note as the pad draws it: the writer's initial, then their words.
 *
 * Each line is drawn in its writer's channel colour, which is the whole reason
 * authorship is tracked at all. Amber is PILOT's, cyan is KEEPER's, and the
 * pad is the one surface in the game where the two appear together.
 */
export function formatNote(author: string, text: string, widthPx: number): string {
  return truncate(`${author === "KEEPER" ? "K" : "P"} ${text}`, widthPx);
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
 * A pure function rather than an array mutation on the scene, so the "newest
 * first, oldest dropped" rule is checkable without constructing a scene.
 */
export function pushLine(lines: readonly string[], line: string): readonly string[] {
  return [line, ...lines].slice(0, LOG_LINES);
}
