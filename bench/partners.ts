/**
 * The scripted PILOT partners (doc 07 section 2.3), and the axis the
 * Cooperative Benchmark varies.
 *
 * ## The framing, stated before anyone finds the apparent contradiction
 *
 * A scripted partner looks, at first glance, like a refutation of this
 * project's own thesis: if a script can play PILOT, the human was never
 * load-bearing. It is not, and `bench/CLAUDE.md` requires the reason be said
 * out loud rather than discovered.
 *
 * These partners do not replace the human. They hold the human's information
 * **content** fixed - every one of them is looking at the same room and could
 * in principle say the same thing - and vary its **quality**. What the suite
 * reports is therefore not "can an agent solve Semaphore" but
 * **partner-sensitivity**: how much joint performance degrades as the partner
 * degrades. The interesting number is `vague` divided by `oracle`, never
 * `oracle` on its own.
 *
 * ## How a partner is modelled
 *
 * A partner is not a chat transcript. It is the effect a description has on
 * what the agent is left believing, which is the only part of a description
 * this harness can measure: PILOT looks at the room, says something, and the
 * agent goes from "any of these worlds" to "one of these". So a partner is a
 * function from the consistent world set to the subset the agent still holds,
 * plus whatever delay the answer cost.
 *
 * That is a narrower model of a partner than a real one, and deliberately so.
 * It cannot represent a partner who volunteers something unprompted, or one
 * who answers a question the agent did not think to ask, because there is no
 * model here to ask questions. What it does represent exactly is the residual
 * ambiguity a description leaves behind, which is the quantity the CONCORD
 * meter measures and the one the bits-per-description metric is computed from.
 */

import type { Rng } from "@semaphore/seed";
import { distinctActions, type ChamberWorlds } from "@semaphore/worker/worlds";

export type PartnerName = "oracle" | "vague" | "slow" | "wrong";

export const PARTNER_NAMES: readonly PartnerName[] = ["oracle", "vague", "slow", "wrong"];

export interface Partner {
  readonly name: PartnerName;
  /** One line, printed beside the partner's numbers so a table explains itself. */
  readonly describes: string;
  /**
   * Milliseconds this partner adds to the agent's rhythm.
   *
   * A partner who takes a while to answer does not change what the agent
   * eventually knows; it changes when the agent can act on it, which is the
   * same axis `gapMs` already moves. Chamber II's drift and Chamber III's
   * stamina window are both functions of that pace, so this is the whole of
   * what `slow` is.
   */
  readonly extraGapMs: number;
  /**
   * The worlds the agent still holds after this partner has described the room.
   *
   * `truth` is the real state. It is passed separately rather than located in
   * `worlds`, because `candidates()` rebuilds its members and the true world is
   * present there by value and not by identity.
   */
  narrow<TState>(
    chamber: ChamberWorlds<TState>,
    worlds: readonly TState[],
    truth: TState,
    rng: Rng,
  ): readonly TState[];
}

/**
 * How many alternative plans a vague description leaves standing.
 *
 * "The squiggly one" does not leave four hundred worlds open; it leaves a
 * handful that a second sentence would settle. Two alternatives beside the
 * truth is the smallest number that makes the agent's draw a real gamble
 * (one in three) while staying recoverable within a chamber's timer, which is
 * what separates `vague` from `wrong`.
 */
const VAGUE_ALTERNATIVES = 2;

/**
 * How often `wrong` mis-describes.
 *
 * One description in four, which is high for a person and is the point: the
 * metric being read off this partner is recovery, and a rate low enough to be
 * realistic would put most seeds in the "never tested" column rather than the
 * "recovered" one.
 */
const WRONG_RATE = 0.25;

/**
 * Worlds that disagree with `truth` about what to do next.
 *
 * Keyed on `correctAction` rather than on world equality, because worlds that
 * differ in ways that do not change the plan are not a mis-description of
 * anything: an agent acting on one of them behaves identically. This is the
 * same distinction `worlds.ts` draws when it reports `log2(actions)` rather
 * than `log2(worlds)`.
 */
function disagreeing<TState>(
  chamber: ChamberWorlds<TState>,
  worlds: readonly TState[],
  truth: TState,
): readonly TState[] {
  const answer = chamber.correctAction(truth);
  return worlds.filter((world) => chamber.correctAction(world) !== answer);
}

/** Sample without replacement, in a way that depends only on the seed. */
function sample<TState>(worlds: readonly TState[], count: number, rng: Rng): TState[] {
  const pool = [...worlds];
  const drawn: TState[] = [];
  while (drawn.length < count && pool.length > 0) {
    drawn.push(...pool.splice(rng.int(pool.length), 1));
  }
  return drawn;
}

/** Describes the room accurately and instantly. The cooperative ceiling. */
const oracle: Partner = {
  name: "oracle",
  describes: "accurate and immediate: the agent knows which world it is in",
  extraGapMs: 0,
  narrow: (_chamber, _worlds, truth) => [truth],
};

/**
 * Imprecise. Narrows the field without settling it, so the agent has to act
 * under residual ambiguity, be wrong, and come back.
 */
const vague: Partner = {
  name: "vague",
  describes: `imprecise: leaves ${VAGUE_ALTERNATIVES} other plans standing beside the true one`,
  extraGapMs: 0,
  narrow: (chamber, worlds, truth, rng) => [
    truth,
    ...sample(disagreeing(chamber, worlds, truth), VAGUE_ALTERNATIVES, rng),
  ],
};

/**
 * Accurate but late. Same content as `oracle`, six seconds further behind it,
 * which doubles a mid-range agent rhythm.
 */
const slow: Partner = {
  name: "slow",
  describes: "accurate but six seconds late on every description",
  extraGapMs: 6_000,
  narrow: oracle.narrow,
};

/** Occasionally confident and mistaken, which is the only way to measure recovery. */
const wrong: Partner = {
  name: "wrong",
  describes: `mis-describes ${Math.round(WRONG_RATE * 100)}% of the time, confidently`,
  extraGapMs: 0,
  narrow: (chamber, worlds, truth, rng) => {
    if (rng.next() >= WRONG_RATE) return [truth];
    const mistaken = sample(disagreeing(chamber, worlds, truth), 1, rng);
    // A chamber whose remaining worlds all agree on the plan cannot be
    // mis-described into a different action, so there is nothing to get wrong
    // and the truth is what gets said.
    return mistaken.length > 0 ? mistaken : [truth];
  },
};

export const PARTNERS: Readonly<Record<PartnerName, Partner>> = { oracle, vague, slow, wrong };

/**
 * The decision-relevant information one description delivered, in bits.
 *
 * `log2` of the plans the agent was choosing between before, minus `log2` of
 * the plans it is choosing between after. An oracle collapses the set to one
 * and so delivers all of it; a vague description delivers less and needs to be
 * followed by another. This is doc 07 section 2.2's bits-per-question, and it
 * is computable here for the reason that section gives: the ground-truth world
 * enumeration already exists, for the proof and for the CONCORD meter, so the
 * ambiguity a sentence removed is a subtraction rather than an estimate.
 *
 * A mis-description delivers a **negative** number of bits: the agent goes
 * from a set that contains the answer to one that does not, losing everything
 * the room had left to give it. That is reported rather than clamped to zero,
 * because "this partner's sentences leave the agent worse informed than
 * silence" is the finding `wrong` exists to produce.
 */
export function bitsDelivered<TState>(
  chamber: ChamberWorlds<TState>,
  before: readonly TState[],
  after: readonly TState[],
  truth: TState,
): number {
  const plans = (worlds: readonly TState[]) => distinctActions(chamber, worlds);
  const bits = (count: number) => (count > 0 ? Math.log2(count) : 0);
  const had = bits(plans(before).size);
  return plans(after).has(chamber.correctAction(truth)) ? had - bits(plans(after).size) : -had;
}
