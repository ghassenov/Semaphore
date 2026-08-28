/**
 * Chamber 0, THE AIRLOCK (doc 02 section 3.1).
 *
 * Three levers on the far wall, a glyph lit above each, and a manual that says
 * to pull the one bearing the spiral. PILOT sees which glyph sits above which
 * lever. KEEPER is told only that three levers exist and where they are.
 *
 * The puzzle is deliberately trivial, because the *mechanic* is the discovery:
 * ninety seconds to teach that KEEPER genuinely cannot see, that PILOT
 * genuinely cannot act, and that talking is the interface. If a player does
 * not feel the click here, nothing downstream lands.
 *
 * It is also the smallest possible instance of the possible-worlds proof, at
 * three decision-relevant worlds and 1.58 bits, which makes it the right place
 * to get the proof machinery correct before Chamber II's 384.
 */

import { audible, hidden, shared, tactile, visual, type Tagged } from "@semaphore/protocol";
import type { Rng } from "@semaphore/seed";
import { AIRLOCK_GLYPHS, type GlyphId } from "./glyphs.js";

/** The three levers, left to right. Ids are stable; positions are described. */
export type LeverId = "lever_a" | "lever_b" | "lever_c";

/**
 * Doc 02 section 3.1: a wrong lever vents the chamber and costs twenty
 * seconds against the chamber timer. There is no lockout here, because
 * Chamber 0 teaches the mechanic and must not be failable permanently.
 */
export const WRONG_LEVER_PENALTY_MS = 20_000;

export const LEVERS: readonly LeverId[] = ["lever_a", "lever_b", "lever_c"] as const;

/** Where each lever sits, which is all `describe_chamber` tells KEEPER. */
export const LEVER_POSITIONS: Readonly<Record<LeverId, string>> = {
  lever_a: "left",
  lever_b: "centre",
  lever_c: "right",
} as const;

/**
 * How each lever feels under KEEPER's hand.
 *
 * Keyed by **position, never by glyph**. That is a correctness requirement,
 * not flavour: if the feel varied with the glyph above it, `inspect` would leak
 * the answer down the `TACTILE` channel and the possible-worlds proof would
 * fail, which is exactly the kind of accidental back channel the proof exists
 * to catch. These strings carry precisely zero information about the puzzle.
 */
const LEVER_FEEL: Readonly<Record<LeverId, string>> = {
  lever_a: "cold brass, worn smooth, with a long throw",
  lever_b: "cold brass, worn smooth, with a long throw",
  lever_c: "cold brass, worn smooth, with a long throw",
} as const;

/** The hidden configuration a session is generated into. */
export interface AirlockParams {
  /** Which glyph is lit above which lever. The `VISUAL` fact PILOT reads. */
  readonly glyphByLever: Readonly<Record<LeverId, GlyphId>>;
}

/** Everything about this chamber that can change during play. */
export interface AirlockState {
  readonly params: AirlockParams;
  /** Every lever pulled so far, in order. */
  readonly pulled: readonly LeverId[];
}

/**
 * The glyph the manual names. Pulling the lever beneath it equalises pressure;
 * pulling any other vents the chamber and costs time.
 */
export const TARGET_GLYPH: GlyphId = "spiral";

/**
 * Lay a glyph ordering onto the lever bank, left to right.
 *
 * Shared by generation and by world enumeration so both build the same shape,
 * and so the length agreement between the glyph pool and the lever bank is
 * checked once rather than assumed at two call sites.
 */
function assign(order: readonly GlyphId[]): Record<LeverId, GlyphId> {
  if (order.length !== LEVERS.length) {
    throw new RangeError(`Airlock needs ${LEVERS.length} glyphs, received ${order.length}`);
  }
  const glyphByLever = {} as Record<LeverId, GlyphId>;
  LEVERS.forEach((lever, i) => {
    const glyph = order[i];
    if (!glyph) throw new RangeError(`Missing glyph at position ${i}`);
    glyphByLever[lever] = glyph;
  });
  return glyphByLever;
}

/** Assign the three glyphs to the three levers. Seeded, so replayable. */
export function generate(rng: Rng): AirlockParams {
  return { glyphByLever: assign(rng.shuffle(AIRLOCK_GLYPHS)) };
}

/** Fresh state for a generated configuration. */
export function initial(params: AirlockParams): AirlockState {
  return { params, pulled: [] };
}

/** The lever bearing the target glyph. Never leaves the Durable Object. */
export function correctLever(params: AirlockParams): LeverId {
  const found = LEVERS.find((lever) => params.glyphByLever[lever] === TARGET_GLYPH);
  if (!found) throw new Error("Airlock generated without the target glyph");
  return found;
}

/** Whether the door has been opened, derived rather than stored. */
export function isSolved(state: AirlockState): boolean {
  return state.pulled.includes(correctLever(state.params));
}

/** Pulls that vented the chamber. Drives the flooding and the time penalty. */
export function wrongPulls(state: AirlockState): number {
  const correct = correctLever(state.params);
  return state.pulled.filter((lever) => lever !== correct).length;
}

/**
 * Pull a lever.
 *
 * A pull after the door is open is a no-op rather than an error: the chamber
 * is over, and punishing a late duplicate call would penalise a network retry
 * rather than a mistake.
 */
export function pull(state: AirlockState, lever: LeverId): AirlockState {
  if (isSolved(state)) return state;
  return { ...state, pulled: [...state.pulled, lever] };
}

/**
 * The action that solves the chamber from here, or `null` once it is solved.
 *
 * This is what clause (b) of the possible-worlds proof compares across
 * consistent worlds. It is not enough that KEEPER's view is compatible with
 * several worlds: those worlds have to disagree about what KEEPER should do.
 */
export function correctAction(state: AirlockState): string | null {
  return isSolved(state) ? null : correctLever(state.params);
}

/** The sound the last pull made, heard by both parties through the wall. */
function lastSound(state: AirlockState): string | null {
  const last = state.pulled.at(-1);
  if (!last) return null;
  return last === correctLever(state.params)
    ? "a deep clunk, then bolts running back"
    : "a hard hiss of venting air";
}

/**
 * The chamber's facts, each tagged with who may perceive it.
 *
 * Every projection and the whole proof derive from this one function, so the
 * channel tags here are the entire security argument for this chamber.
 */
export function facts(state: AirlockState) {
  return {
    /** PILOT reads the lit glyphs. This is the information the pair must move. */
    glyphByLever: visual(state.params.glyphByLever),
    /** KEEPER feels the levers. Identical by construction, so it leaks nothing. */
    leverFeel: tactile(LEVER_FEEL),
    /** Where the levers are. KEEPER needs this to name one. */
    leverPositions: tactile(LEVER_POSITIONS),
    /** Both hear the last pull: a hiss, or the bolts running back. */
    lastSound: audible(lastSound(state)),
    /** Both know what has been tried. */
    pulled: shared(state.pulled),
    /** Both see the door. */
    doorOpen: shared(isSolved(state)),
    /** The answer, perceivable by neither. */
    correctLever: hidden(correctLever(state.params)),
  } satisfies Record<string, Tagged<unknown>>;
}

/**
 * Every configuration this chamber could be in, holding play history fixed.
 *
 * All six glyph permutations, not the three spiral positions. Enumerating the
 * full space is more honest: it lets the proof discover for itself that only
 * the spiral's position is decision-relevant, rather than being told so by a
 * scoping choice we made in advance. The published figure of three worlds and
 * 1.58 bits is the count of *distinct correct actions*, which is the quantity
 * PILOT actually has to supply.
 */
export function candidates(state: AirlockState): AirlockState[] {
  return permutationsOf(AIRLOCK_GLYPHS).map((order) => ({
    params: { glyphByLever: assign(order) },
    pulled: state.pulled,
  }));
}

/** All orderings of a small set. Written out rather than pulled in as a dependency. */
function permutationsOf(items: readonly GlyphId[]): GlyphId[][] {
  if (items.length <= 1) return [[...items]];
  const out: GlyphId[][] = [];
  for (let i = 0; i < items.length; i++) {
    const head = items[i] as GlyphId;
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutationsOf(rest)) out.push([head, ...tail]);
  }
  return out;
}
