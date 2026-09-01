/**
 * The channel model: who may perceive which fact, and the machinery that
 * enforces it (doc 02 section 6, doc 03 section 5).
 *
 * This module is the repository's design law expressed as code. The generative
 * rule behind every decision about perception is one sentence:
 *
 *   PILOT perceives by sight. KEEPER perceives by touch and by document.
 *   Both hear.
 *
 * **The mechanism now lives in `@semaphore/asymmetry`** and this file is the
 * game's binding of it: our channel vocabulary, our two parties, our model.
 * The kit is the extracted, application-agnostic core - the projector, the
 * leak collector and the possible-worlds proof - published so the design
 * principle behind Semaphore is something another team can run against their
 * own app rather than a claim they have to take on trust (doc 01 section 4,
 * tier 1). Everything here still has exactly one implementation; it is one
 * directory further down.
 */

import {
  concealedFrom as concealedFromModel,
  invert,
  perceives as perceivesIn,
  project,
  type PerceptionModel,
  type Tagged as KitTagged,
  type TaggedRecord as KitTaggedRecord,
  type Unwrapped as KitUnwrapped,
} from "@semaphore/asymmetry";

/**
 * Which party may perceive a fact.
 *
 * `AUDIBLE` is not a convenience category. It is the one sense the two
 * characters share, and it is rendered differently to each: as sound to PILOT
 * through the grate, as text to KEEPER under their hand. In Chamber II it
 * carries real puzzle information, because counting detents heard against
 * needles seen is a fact neither party could obtain alone.
 *
 * `HIDDEN` is explicit rather than an implicit "untagged" category. The
 * solution is nobody's to see, and saying so in the type system is better than
 * saying it in a comment.
 */
export type Channel = "VISUAL" | "TACTILE" | "AUDIBLE" | "SHARED" | "HIDDEN";

/** Every channel, in the order they are documented. Useful for exhaustive tests. */
export const CHANNELS: readonly Channel[] = [
  "VISUAL",
  "TACTILE",
  "AUDIBLE",
  "SHARED",
  "HIDDEN",
] as const;

/** A fact in world state, carrying the channel that decides who may see it. */
export type Tagged<T> = KitTagged<T, Channel>;

/**
 * The two parties a projection can be computed for.
 *
 * PILOT is the human in the lamp gallery. KEEPER is the agent on the machine
 * deck. There is deliberately no third party and no "debug" party: a view that
 * sees everything would be a back channel, and the design law forbids one.
 */
export type Party = "PILOT" | "KEEPER";

/**
 * Which channels each party perceives.
 *
 * `HIDDEN` appears in neither set, which is what makes the solution genuinely
 * unobtainable rather than merely undisplayed. This constant is the single
 * definition consumed by the worker's projections, the possible-worlds proof
 * and the asymmetry smoke test, so those three can never drift apart.
 */
export const PERCEIVED_BY: PerceptionModel<Party, Channel> = {
  PILOT: ["VISUAL", "AUDIBLE", "SHARED"],
  KEEPER: ["TACTILE", "AUDIBLE", "SHARED"],
} as const;

/**
 * The same model with the two parties exchanged: PILOT reads by touch and by
 * document, KEEPER sees.
 *
 * The Blackout (doc 02, the Archive beat) runs the station under this map for
 * one window, and the possible-worlds proof runs a whole pass under it. Both
 * uses want the same object, and neither may build its own: an inversion
 * computed in two places is two things that can disagree about what the
 * inverse of the design law is.
 *
 * `HIDDEN` is unreachable under this map too, because inverting a model
 * exchanges the two lists and cannot invent a channel neither list names. That
 * is the property that makes the beat safe to ship: the pair trade halves,
 * and the solution stays nobody's.
 */
export const INVERTED_PERCEPTION: PerceptionModel<Party, Channel> = invert(PERCEIVED_BY);

/** Whether `party` may perceive a fact carried on `channel`. */
export function perceives(party: Party, channel: Channel): boolean {
  return perceivesIn(PERCEIVED_BY, party, channel);
}

/** The party a given party is playing against. */
export function otherParty(party: Party): Party {
  return party === "PILOT" ? "KEEPER" : "PILOT";
}

// Tagged constructors. Named for the channel rather than for the fact, because
// at every call site the question being answered is "who may perceive this?".

/** Tag a fact as perceivable by sight, so PILOT only. */
export const visual = <T>(value: T): Tagged<T> => ({ value, channel: "VISUAL" });

/** Tag a fact as perceivable by touch or by document, so KEEPER only. */
export const tactile = <T>(value: T): Tagged<T> => ({ value, channel: "TACTILE" });

/** Tag a fact as heard by both parties, rendered differently to each. */
export const audible = <T>(value: T): Tagged<T> => ({ value, channel: "AUDIBLE" });

/** Tag a fact as perceived identically by both parties. */
export const shared = <T>(value: T): Tagged<T> => ({ value, channel: "SHARED" });

/** Tag a fact as perceivable by neither party. The solution lives here. */
export const hidden = <T>(value: T): Tagged<T> => ({ value, channel: "HIDDEN" });

/** A flat record of tagged facts, which is the shape every chamber's state takes. */
export type TaggedRecord = KitTaggedRecord<Channel>;

/** The same record with the `Tagged` wrapper stripped from every field. */
export type Unwrapped<T extends TaggedRecord> = KitUnwrapped<T>;

/**
 * Reduce a record of tagged facts to what one party may perceive.
 *
 * Fields on channels the party cannot perceive are **absent from the result**
 * rather than nulled, so a consumer that forgets to check cannot silently read
 * a placeholder and treat it as data. The return type is `Partial<...>`, which
 * makes that absence a compile-time obligation at every call site.
 *
 * This is the only sanctioned way to derive a view. Hand-written projections
 * that read `.value` directly are how a leak gets introduced by someone in a
 * hurry, so the worker composes this function rather than reimplementing it.
 *
 * `model` defaults to the design law. The Blackout passes
 * `INVERTED_PERCEPTION` instead, and that argument is the entire mechanism of
 * the beat: no function here learns to invert itself, and nothing anywhere
 * reaches around a projection to fetch the other party's half.
 */
export function projectFacts<T extends TaggedRecord>(
  facts: T,
  party: Party,
  model: PerceptionModel<Party, Channel> = PERCEIVED_BY,
): Partial<Unwrapped<T>> {
  return project(facts, model, party);
}

/**
 * Collect the values a party may **not** perceive, with the field names that
 * carried them.
 *
 * This exists for the asymmetry smoke test (doc 03 section 5), which checks
 * that no forbidden value appears verbatim in the other party's projection.
 * That test is a cheap check and explicitly not the headline proof, because
 * absence of a literal value is not absence of information. The real claim is
 * the possible-worlds proof.
 */
export function concealedFrom<T extends TaggedRecord>(
  facts: T,
  party: Party,
  model: PerceptionModel<Party, Channel> = PERCEIVED_BY,
): ReadonlyArray<readonly [string, unknown]> {
  return concealedFromModel(facts, model, party);
}
