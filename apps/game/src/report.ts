/**
 * The shift report: what a finished session was actually like, as a grade.
 *
 * Doc 08 phase 3.2 asks the ending to "offer the stats". Until now it offered
 * one sentence and a link, which is a session that stops rather than a session
 * that ends. This is the arithmetic behind the thing it offers instead.
 *
 * ## It is pure, and it derives nothing new
 *
 * Every input is a field the worker's `/replay/:id` projection already
 * carries, and that projection has its own long argument for why a finished
 * session may not ship raw (`apps/worker/src/replay.ts`). Nothing here asks
 * the server for anything else, so the report cannot widen what leaves it.
 * There is no DOM in this file and no renderer: it takes a `Replay` and
 * returns numbers, which is the half that can be wrong in a way nobody
 * notices by looking, and it is the half with tests.
 *
 * ## Three marks, because one number would grade one player
 *
 * The game is two people holding different halves of a room. A single score
 * would silently be a score for whichever half the formula happened to
 * measure, so the report reads three things that separate on different axes:
 *
 *   - **pace** is the pair's, against the clock the room was designed around.
 *   - **precision** is KEEPER's, from `wasted`, which is the one field that
 *     tells an agent that reasoned from an agent that pressed keys until one
 *     worked (`packages/protocol/src/log.ts` says so at the field itself).
 *   - **resolve** is the pair's again: whether they held it together, from
 *     the deadlocks they took and the help they asked the station for.
 *
 * Notes written are reported and **not** graded. A pair sitting in one room
 * talks out loud and writes nothing, and grading them down for it would
 * punish the most natural way to play the game.
 *
 * A metric that does not separate the thing it claims to separate is not
 * evidence, and this project has already built and deleted two that did not
 * (`NEXT-STEPS.md`). `report.test.ts` moves each of the three axes on its own
 * and asserts that only that mark moves.
 */

import {
  CHAMBER_TIMER_MS,
  DIFFICULTIES,
  type ChamberId,
  type Difficulty,
} from "@semaphore/protocol";
import { formatTimer } from "./render/hud.js";
import type { paintMonitor } from "./render/monitor.js";

/**
 * The projection the worker's `/replay/:id` route returns.
 *
 * Declared here rather than in `replay.ts` because two surfaces now read it -
 * the viewer and the ending strip - and a shape copied into both is a shape
 * that will disagree with itself the first time the worker adds a field.
 */
export interface Replay {
  readonly sessionId: string;
  readonly designation: string;
  readonly difficulty: string;
  readonly mode: string;
  readonly outcome: string;
  readonly chambersCleared: number;
  readonly durationMs: number;
  readonly staminaWindowMs: number;
  readonly medianLatencyMs: number;
  readonly calls: readonly {
    readonly t: number;
    readonly tool: string;
    readonly result: "ok" | "error";
    readonly latencyMs: number;
    readonly wasted: boolean;
    readonly concordBits: number;
  }[];
  readonly beats: readonly {
    readonly t: number;
    readonly kind: "action" | "audible";
    readonly what: string;
    readonly count?: number;
  }[];
  readonly chambers: readonly {
    readonly t: number;
    readonly kind: string;
    readonly chamber: ChamberId;
  }[];
  /** Every deadlock the run took. Empty for a run that never stalled. */
  readonly failures: readonly {
    readonly t: number;
    readonly chamber: ChamberId;
    readonly concordBits: number;
  }[];
  /** What the pair wrote to each other. The one track that is neither party alone. */
  readonly notes: readonly {
    readonly t: number;
    readonly author: "PILOT" | "KEEPER";
    readonly text: string;
  }[];
  readonly track: Parameters<typeof paintMonitor>[1];
}

/** The tool whose calls are the pair asking the station for help. */
export const ASSIST_TOOL = "request_assistance";

/** One room, and how long it held the pair. */
export interface ChamberSplit {
  readonly chamber: ChamberId;
  /** Time from entering to solving, in milliseconds. */
  readonly ms: number;
  /** The clock this room was designed around, under this session's difficulty. */
  readonly parMs: number;
  /** Whether the pair got out of it at all. */
  readonly cleared: boolean;
}

/** The three axes, each 0 to 1. */
export interface Marks {
  readonly pace: number;
  readonly precision: number;
  readonly resolve: number;
}

/** A finished session, graded. */
export interface ShiftReport {
  readonly designation: string;
  readonly grade: "S" | "A" | "B" | "C" | "D";
  readonly durationMs: number;
  readonly splits: readonly ChamberSplit[];
  readonly calls: number;
  readonly wasted: number;
  readonly assists: number;
  readonly deadlocks: number;
  readonly notes: number;
  readonly marks: Marks;
}

/** Hold a number to 0..1. Every mark is a fraction and none may leave the range. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * The par clock for one room under one difficulty.
 *
 * `practice` has no clock at all, so `timerFor` would answer null and there
 * would be nothing to be fast against. It falls back to the base timer: "you
 * took three times as long as this room was built for" is still a true and
 * useful sentence in a room with no countdown in it.
 */
function parFor(chamber: ChamberId, difficulty: Difficulty): number {
  const scale = DIFFICULTIES[difficulty].timerScale ?? 1;
  return Math.round(CHAMBER_TIMER_MS[chamber] * scale);
}

/** Narrow the replay's free-text difficulty, falling back to the one the game defaults to. */
function difficultyOf(replay: Replay): Difficulty {
  return replay.difficulty in DIFFICULTIES ? (replay.difficulty as Difficulty) : "standard";
}

/**
 * Pair the `enter` and `solved` boundaries into one row per room.
 *
 * A room can be entered twice: a deadlock and a retry re-enter the same
 * chamber. The split runs from the **first** entry to the solve, because the
 * question the report answers is how long that room held the pair in total,
 * not how long the successful attempt took.
 */
function splitsFrom(replay: Replay): ChamberSplit[] {
  const difficulty = difficultyOf(replay);
  const firstEntry = new Map<ChamberId, number>();
  const order: ChamberId[] = [];
  const solved = new Map<ChamberId, number>();

  for (const boundary of replay.chambers) {
    if (boundary.kind === "enter") {
      if (!firstEntry.has(boundary.chamber)) {
        firstEntry.set(boundary.chamber, boundary.t);
        order.push(boundary.chamber);
      }
    } else if (boundary.kind === "solved") {
      solved.set(boundary.chamber, boundary.t);
    }
  }

  return order.map((chamber) => {
    const from = firstEntry.get(chamber) ?? 0;
    const to = solved.get(chamber);
    return {
      chamber,
      // An unsolved room is measured to the end of the session, which is what
      // actually happened to it.
      ms: Math.max(0, (to ?? replay.durationMs) - from),
      parMs: parFor(chamber, difficulty),
      cleared: to !== undefined,
    };
  });
}

/**
 * Pace: total time against total par, on a curve where half of par is full
 * marks and all of par is none.
 *
 * The rooms are timed generously on purpose - a pair that spends the whole
 * clock has been struggling, not pacing itself - so a linear `1 - used/par`
 * would compress every real session into the bottom third of the scale and
 * separate nothing. Doubling it puts the interesting range where sessions
 * actually land.
 */
function paceMark(splits: readonly ChamberSplit[]): number {
  const par = splits.reduce((sum, split) => sum + split.parMs, 0);
  if (par <= 0) return 0;
  const used = splits.reduce((sum, split) => sum + split.ms, 0);
  return clamp01(2 * (1 - used / par));
}

/**
 * Resolve: whether the pair got through without stalling or asking.
 *
 * Measured per room rather than in absolute counts, so a brief session is not
 * flattered by having fewer rooms in which to come unstuck. A deadlock costs
 * a whole room's worth; an assist costs a third of one, because asking the
 * station for help is a move the game offers rather than a mistake.
 */
function resolveMark(splits: readonly ChamberSplit[], deadlocks: number, assists: number): number {
  const rooms = Math.max(1, splits.length);
  return clamp01(1 - (deadlocks + assists / 3) / rooms);
}

/** Grade one finished session. Pure, and it asks the server for nothing. */
export function gradeShift(replay: Replay): ShiftReport {
  const splits = splitsFrom(replay);
  const wasted = replay.calls.filter((call) => call.wasted).length;
  const assists = replay.calls.filter((call) => call.tool === ASSIST_TOOL).length;
  const deadlocks = replay.failures.length;

  const marks: Marks = {
    pace: paceMark(splits),
    // No calls at all means nothing was wasted. It is not reachable in a run
    // that finished - no room opens without a tool call - but a partial log
    // must not divide by zero on its way to the screen.
    precision: replay.calls.length === 0 ? 1 : 1 - wasted / replay.calls.length,
    resolve: resolveMark(splits, deadlocks, assists),
  };

  return {
    designation: replay.designation,
    grade: bandOf((marks.pace + marks.precision + marks.resolve) / 3),
    durationMs: replay.durationMs,
    splits,
    calls: replay.calls.length,
    wasted,
    assists,
    deadlocks,
    notes: replay.notes.length,
    marks,
  };
}

/** Where a mean lands. Five bands, because four cannot hold a top one apart from a good one. */
function bandOf(mean: number): ShiftReport["grade"] {
  if (mean >= 0.9) return "S";
  if (mean >= 0.75) return "A";
  if (mean >= 0.55) return "B";
  if (mean >= 0.35) return "C";
  return "D";
}

/** How many cells of five a mark fills. The bar, and the shareable block, read the same number. */
export function cellsOf(mark: number): number {
  return Math.round(clamp01(mark) * 5);
}

/**
 * The result as a block of text somebody would paste into a chat.
 *
 * Plain text and no link preview games: the point is that it survives being
 * pasted anywhere, and that the URL at the end takes a reader to the replay
 * rather than to a screenshot of one.
 */
export function shareText(report: ShiftReport, url: string): string {
  const bar = (mark: number): string => "#".repeat(cellsOf(mark)).padEnd(5, ".");
  const cleared = report.splits.filter((split) => split.cleared).length;
  return [
    `SEMAPHORE - grade ${report.grade}`,
    `${report.designation || "KEEPER"} and PILOT, ${String(cleared)} chambers in ${formatTimer(report.durationMs)}`,
    `pace ${bar(report.marks.pace)}  precision ${bar(report.marks.precision)}  resolve ${bar(report.marks.resolve)}`,
    url,
  ].join("\n");
}
