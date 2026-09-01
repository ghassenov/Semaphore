/**
 * The possible-worlds machinery (doc 03 section 6), bound to this game.
 *
 * This is the centrepiece engineering claim of the project, and it has exactly
 * one implementation with three consumers: the proof in `tests/`, the CONCORD
 * meter in the HUD, and the benchmark's bits-per-question metric. Forking it
 * would let the proof pass while the game leaks, which is why the rule against
 * doing so is written into `packages/CLAUDE.md`.
 *
 * **The implementation now lives in `@semaphore/asymmetry`.** It was extracted
 * because nothing in it was ever about levers or dials: tag your state by
 * channel, say who perceives what, enumerate what else the world could have
 * been, and it answers in bits how much the other party still has to supply.
 * That is a check any application dividing a UI surface from a tool surface
 * needs, and shipping it as something a team can run is what turns doc 01
 * section 4's tier-1 claim from a sentence into an instrument. This file is
 * the game's binding of it, and it is still the only one.
 *
 * The claim we want to make is not "nothing leaked". It is **"the agent's view
 * does not determine the answer"**, which is an information-theoretic
 * statement and deserves an information-theoretic test. For a reachable state
 * `s`, the consistent set is
 *
 *     W(s) = { w in WorldSpace(seed) : projectForKeeper(w) === projectForKeeper(s) }
 *
 * and the assertion is that `|W(s)| > 1` **and** that the members of `W(s)`
 * disagree about what KEEPER should do next. The second clause carries the
 * weight: worlds that agree on the action would be ambiguity that does not
 * matter.
 *
 * Every function here takes a perception model, defaulting to the design law.
 * The Blackout passes `INVERTED_PERCEPTION`, and the proof runs a whole pass
 * under it: if the asymmetry only held in one direction, that pass is what
 * would say so.
 */

import {
  PERCEIVED_BY,
  type Channel,
  type ChamberId,
  type Party,
  type TaggedRecord,
} from "@semaphore/protocol";
import {
  consistentWorlds as consistentIn,
  distinctActions as distinctIn,
  isUnderdetermined as underdeterminedIn,
  measure as measureIn,
  type Ambiguity,
  type PerceptionModel,
  type Space,
} from "@semaphore/asymmetry";
import { projectForKeeper, projectForPilot } from "./projection.js";

export type { Ambiguity } from "@semaphore/asymmetry";

/**
 * What a chamber must provide to be reasoned about.
 *
 * Every chamber module implements this, which is what lets the proof run over
 * all four without knowing anything about levers, dials or cipher wheels. It
 * is the kit's `Space` with the id narrowed to a chamber, so a caller cannot
 * hand the proof a surface this game does not have.
 */
export interface ChamberWorlds<TState> extends Space<TState, Channel> {
  readonly id: ChamberId;
  /** Channel-tagged facts for a state. The only source of any view. */
  facts(state: TState): TaggedRecord;
  /**
   * Every configuration the puzzle could be in, holding play history fixed.
   *
   * Where a chamber's full state space is too large to enumerate, this
   * enumerates the **puzzle-defining parameters** instead. That scoping is a
   * real limitation and each chamber documents its own, because a silently
   * scoped proof is a decoration.
   */
  candidates(state: TState): TState[];
  /**
   * The correct action from here, or null once solved.
   *
   * **For a chamber whose answer is a multi-step plan, this must return the
   * whole remaining plan, never just the next single step.** `chambers/
   * signal_room.ts` got this wrong on its first pass: returning only the next
   * key made every state's action space at most 6-valued (one of six key
   * ids), so `measure()` reported `log2(6)` bits regardless of how large the
   * chamber's real plan space was, understating by a wide margin what PILOT
   * actually has to communicate. Returning the full remaining sequence as one
   * stable string fixed it. For a chamber whose answer genuinely is one
   * action (Chamber 0's lever), the two readings coincide and nothing changes.
   */
  correctAction(state: TState): string | null;
}

/** The design law, as the kit wants it. */
type Model = PerceptionModel<Party, Channel>;

/**
 * Every world consistent with what `party` can perceive in `state`.
 *
 * The observed state is always a member, since a state is trivially consistent
 * with its own projection. A result that failed to contain it would mean the
 * chamber's `candidates` does not span the space it claims to, and the tests
 * assert exactly that.
 */
export function consistentWorlds<TState>(
  chamber: ChamberWorlds<TState>,
  state: TState,
  party: Party = "KEEPER",
  model: Model = PERCEIVED_BY,
): TState[] {
  return consistentIn(chamber, state, model, party);
}

/**
 * The distinct correct actions across a set of worlds.
 *
 * `null`, meaning "the chamber is already solved", is a distinct outcome and
 * is preserved rather than dropped: a view that cannot distinguish "pull
 * lever_b" from "you are finished" is genuinely ambiguous about what to do.
 */
export function distinctActions<TState>(
  chamber: ChamberWorlds<TState>,
  worlds: readonly TState[],
): Set<string | null> {
  return distinctIn(chamber, worlds);
}

/** Measure the ambiguity remaining in `state` from one party's point of view. */
export function measure<TState>(
  chamber: ChamberWorlds<TState>,
  state: TState,
  party: Party = "KEEPER",
  model: Model = PERCEIVED_BY,
): Ambiguity {
  return measureIn(chamber, state, model, party);
}

/**
 * The value the CONCORD meter renders, rounded for display.
 *
 * Empty means KEEPER's information determines exactly one course of action.
 * Full means maximum ambiguity. The meter drops when the world state changes
 * in ways that eliminate possibilities, and honestly does not drop when PILOT
 * merely speaks, because the server cannot hear the chat. Doc 02 section 5
 * requires that limitation to be stated rather than papered over, and the
 * text-mode label is REMAINING AMBIGUITY for the same reason.
 */
export function concordBits<TState>(
  chamber: ChamberWorlds<TState>,
  state: TState,
  model: Model = PERCEIVED_BY,
): number {
  return Number(measure(chamber, state, "KEEPER", model).bits.toFixed(2));
}

/**
 * Whether a state satisfies the proof's two clauses for one party.
 *
 * Kept here rather than in the test file so the CONCORD meter and the proof
 * cannot disagree about what "underdetermined" means.
 */
export function isUnderdetermined<TState>(
  chamber: ChamberWorlds<TState>,
  state: TState,
  party: Party = "KEEPER",
  model: Model = PERCEIVED_BY,
): boolean {
  return underdeterminedIn(chamber, state, model, party);
}

/** Both projections of one state, for tests that assert on them together. */
export function bothViews<T extends TaggedRecord>(facts: T, model: Model = PERCEIVED_BY) {
  return { pilot: projectForPilot(facts, model), keeper: projectForKeeper(facts, model) };
}
