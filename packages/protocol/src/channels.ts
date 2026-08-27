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
 * Everything here exists so that rule is enforced by the type system and by a
 * single tested projector, rather than by reviewers remembering it.
 */

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
export interface Tagged<T> {
  readonly value: T;
  readonly channel: Channel;
}

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
export const PERCEIVED_BY: Readonly<Record<Party, readonly Channel[]>> = {
  PILOT: ["VISUAL", "AUDIBLE", "SHARED"],
  KEEPER: ["TACTILE", "AUDIBLE", "SHARED"],
} as const;

/** Whether `party` may perceive a fact carried on `channel`. */
export function perceives(party: Party, channel: Channel): boolean {
  return PERCEIVED_BY[party].includes(channel);
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
export type TaggedRecord = Readonly<Record<string, Tagged<unknown>>>;

/** The same record with the `Tagged` wrapper stripped from every field. */
export type Unwrapped<T extends TaggedRecord> = {
  [K in keyof T]: T[K] extends Tagged<infer V> ? V : never;
};

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
 */
export function projectFacts<T extends TaggedRecord>(
  facts: T,
  party: Party,
): Partial<Unwrapped<T>> {
  const out: Record<string, unknown> = {};
  for (const [key, fact] of Object.entries(facts)) {
    if (perceives(party, fact.channel)) out[key] = fact.value;
  }
  return out as Partial<Unwrapped<T>>;
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
): ReadonlyArray<readonly [string, unknown]> {
  return Object.entries(facts)
    .filter(([, fact]) => !perceives(party, fact.channel))
    .map(([key, fact]) => [key, fact.value] as const);
}
