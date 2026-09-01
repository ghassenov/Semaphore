/**
 * The possible-worlds proof, generically.
 *
 * The claim worth making about a divided interface is not "nothing leaked". It
 * is **"this party's view does not determine the answer"**. For a state `s`,
 * the consistent set is
 *
 *     W(s) = { w in candidates(s) : project(facts(w), party) === project(facts(s), party) }
 *
 * and the assertion is that `|W(s)| > 1` **and** that the members of `W(s)`
 * disagree about what should be done next. The second clause carries the
 * weight: worlds that agree on the action are ambiguity that costs nobody
 * anything, and counting them would flatter the number.
 *
 * There is one implementation here and it is meant to have several consumers -
 * a test that gates the build, a live meter, an offline audit. Forking it lets
 * the proof pass while the application leaks.
 */

import { canonicalise } from "./canonical.ts";
import { project, type PerceptionModel, type TaggedRecord } from "./perception.ts";

/**
 * What a piece of an application must provide to be reasoned about.
 *
 * Three functions and a name. Implement them for your own state and every
 * measurement in this module applies to it.
 */
export interface Space<TState, C extends string = string> {
  /** A name for reports. Whatever your application calls this surface. */
  readonly id: string;
  /** Channel-tagged facts for a state. The only source of any view. */
  facts(state: TState): TaggedRecord<C>;
  /**
   * Every configuration this state could be in, holding history fixed.
   *
   * Where the full state space is too large to enumerate, enumerate the
   * **defining parameters** instead - and say so, in the implementation's own
   * docstring. A silently scoped proof is a decoration.
   */
  candidates(state: TState): TState[];
  /**
   * The correct action from here, or null when there is nothing to do.
   *
   * **For a state whose answer is a multi-step plan this must return the whole
   * remaining plan, not just the next step.** Returning one step caps the
   * action space at the number of distinct first moves and understates, often
   * by a wide margin, how much the party actually has to be told.
   */
  correctAction(state: TState): string | null;
}

/**
 * Every world consistent with what `party` can perceive in `state`.
 *
 * The observed state is always a member, since a state is trivially consistent
 * with its own projection. A result that does not contain it means
 * `candidates` does not span the space it claims to, which `auditState`
 * reports as a defect in the space rather than a finding about the party.
 */
export function consistentWorlds<TState, P extends string, C extends string>(
  space: Space<TState, C>,
  state: TState,
  model: PerceptionModel<P, C>,
  party: P,
): TState[] {
  const observed = canonicalise(project(space.facts(state), model, party));
  return space
    .candidates(state)
    .filter((world) => canonicalise(project(space.facts(world), model, party)) === observed);
}

/**
 * The distinct correct actions across a set of worlds.
 *
 * `null`, meaning "there is nothing left to do", is a distinct outcome and is
 * preserved rather than dropped: a view that cannot distinguish "do this" from
 * "you are finished" is genuinely ambiguous about what to do.
 */
export function distinctActions<TState, C extends string>(
  space: Space<TState, C>,
  worlds: readonly TState[],
): Set<string | null> {
  return new Set(worlds.map((world) => space.correctAction(world)));
}

/** What the proof measures for one state. */
export interface Ambiguity {
  /** Worlds consistent with the party's entire perceptual surface. */
  readonly worlds: number;
  /** How many distinct next actions those worlds disagree over. */
  readonly actions: number;
  /**
   * Decision-relevant ambiguity, `log2(actions)`.
   *
   * Reported in preference to `log2(worlds)` because it is the quantity the
   * other party actually has to supply.
   */
  readonly bits: number;
}

/** Measure the ambiguity remaining in `state` from one party's point of view. */
export function measure<TState, P extends string, C extends string>(
  space: Space<TState, C>,
  state: TState,
  model: PerceptionModel<P, C>,
  party: P,
): Ambiguity {
  const worlds = consistentWorlds(space, state, model, party);
  const actions = distinctActions(space, worlds);
  return {
    worlds: worlds.length,
    actions: actions.size,
    bits: actions.size > 0 ? Math.log2(actions.size) : 0,
  };
}

/**
 * Whether a state satisfies the proof's two clauses for one party.
 *
 * Kept beside `measure` rather than in a test file so a live meter and a build
 * gate cannot disagree about what "underdetermined" means.
 */
export function isUnderdetermined<TState, P extends string, C extends string>(
  space: Space<TState, C>,
  state: TState,
  model: PerceptionModel<P, C>,
  party: P,
): boolean {
  const { worlds, actions } = measure(space, state, model, party);
  return worlds > 1 && actions > 1;
}
