/**
 * The possible-worlds machinery (doc 03 section 6).
 *
 * This is the centrepiece engineering claim of the project, and it has exactly
 * one implementation with three consumers: the proof in `tests/`, the CONCORD
 * meter in the HUD, and the benchmark's bits-per-question metric. Forking it
 * would let the proof pass while the game leaks, which is why the rule against
 * doing so is written into `packages/CLAUDE.md`.
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
 */

import type { ChamberId, Party, TaggedRecord } from "@semaphore/protocol";
import { canonicalise, projectForKeeper, projectForPilot } from "./projection.js";
import { projectFacts } from "@semaphore/protocol";

/**
 * What a chamber must provide to be reasoned about.
 *
 * Every chamber module implements this, which is what lets the proof run over
 * all four without knowing anything about levers, dials or cipher wheels.
 */
export interface ChamberWorlds<TState> {
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
  /** The action that solves the chamber from here, or null once solved. */
  correctAction(state: TState): string | null;
}

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
): TState[] {
  const observed = canonicalise(projectFacts(chamber.facts(state), party));
  return chamber
    .candidates(state)
    .filter((world) => canonicalise(projectFacts(chamber.facts(world), party)) === observed);
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
  return new Set(worlds.map((world) => chamber.correctAction(world)));
}

/** What the proof measures for one state, and what the CONCORD meter renders. */
export interface Ambiguity {
  /** Worlds consistent with the party's entire perceptual surface. */
  readonly worlds: number;
  /** How many distinct next actions those worlds disagree over. */
  readonly actions: number;
  /**
   * Decision-relevant ambiguity, `log2(actions)`.
   *
   * Reported in preference to `log2(worlds)` because it is the quantity PILOT
   * actually has to supply. Worlds that differ only in ways that do not change
   * the correct action are real ambiguity that costs the pair nothing, and
   * counting them would flatter the number.
   */
  readonly bits: number;
}

/** Measure the ambiguity remaining in `state` from one party's point of view. */
export function measure<TState>(
  chamber: ChamberWorlds<TState>,
  state: TState,
  party: Party = "KEEPER",
): Ambiguity {
  const worlds = consistentWorlds(chamber, state, party);
  const actions = distinctActions(chamber, worlds);
  return {
    worlds: worlds.length,
    actions: actions.size,
    bits: actions.size > 0 ? Math.log2(actions.size) : 0,
  };
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
export function concordBits<TState>(chamber: ChamberWorlds<TState>, state: TState): number {
  return Number(measure(chamber, state, "KEEPER").bits.toFixed(2));
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
): boolean {
  const { worlds, actions } = measure(chamber, state, party);
  return worlds > 1 && actions > 1;
}

/** Both projections of one state, for tests that assert on them together. */
export function bothViews<T extends TaggedRecord>(facts: T) {
  return { pilot: projectForPilot(facts), keeper: projectForKeeper(facts) };
}
