/**
 * The perception model: which party may perceive which fact.
 *
 * This is the generic core of the rule Semaphore is built on. A fact carries a
 * **channel**; a party perceives a set of channels; a projection is a fact
 * record reduced to what one party may perceive. Nothing here knows what a
 * channel means, so an application supplies its own vocabulary and its own
 * model and gets the projector, the leak collector and (through `worlds.ts`)
 * the proof for free.
 *
 * The rule the whole kit exists to make checkable is not "no value leaked". It
 * is **"the agent's view does not determine the answer"**, which is an
 * information-theoretic claim rather than a string-matching one. Absence of a
 * literal value is not absence of information, so a substring test over a
 * serialised view is a smoke check and never a proof. `worlds.ts` is the proof.
 */

/** A fact, carrying the channel that decides who may perceive it. */
export interface Tagged<T, C extends string = string> {
  readonly value: T;
  readonly channel: C;
}

/** A flat record of tagged facts, which is the shape a projectable state takes. */
export type TaggedRecord<C extends string = string> = Readonly<Record<string, Tagged<unknown, C>>>;

/** The same record with the `Tagged` wrapper stripped from every field. */
export type Unwrapped<T extends TaggedRecord> = {
  [K in keyof T]: T[K] extends Tagged<infer V, string> ? V : never;
};

/**
 * Who perceives what: one entry per party, listing the channels it receives.
 *
 * A channel named by no party is perceivable by nobody, which is how a value
 * that is genuinely nobody's to see (a puzzle's solution, a secret key) is
 * expressed. Leaving it out of every list is stronger than tagging it and
 * remembering not to read it.
 */
export type PerceptionModel<P extends string = string, C extends string = string> = Readonly<
  Record<P, readonly C[]>
>;

/** Whether `party` may perceive a fact carried on `channel`. */
export function perceives<P extends string, C extends string>(
  model: PerceptionModel<P, C>,
  party: P,
  channel: C,
): boolean {
  return (model[party] ?? []).includes(channel);
}

/**
 * Reduce a record of tagged facts to what one party may perceive.
 *
 * Fields on channels the party cannot perceive are **absent from the result**
 * rather than nulled, so a consumer that forgets to check cannot silently read
 * a placeholder and treat it as data. The return type is `Partial<...>`, which
 * makes that absence a compile-time obligation at every call site.
 *
 * This is the only sanctioned way to derive a view. A hand-written projection
 * that reads `.value` directly is how a leak gets introduced by somebody in a
 * hurry, so applications compose this rather than reimplementing it.
 */
export function project<T extends TaggedRecord<C>, P extends string, C extends string>(
  facts: T,
  model: PerceptionModel<P, C>,
  party: P,
): Partial<Unwrapped<T>> {
  const out: Record<string, unknown> = {};
  for (const [key, fact] of Object.entries(facts)) {
    if (perceives(model, party, fact.channel)) out[key] = fact.value;
  }
  return out as Partial<Unwrapped<T>>;
}

/**
 * Collect the values a party may **not** perceive, with the field names that
 * carried them.
 *
 * For the cheap smoke check: no concealed value should appear verbatim in the
 * party's projection. It is fragile in both directions - `String(3)` matches a
 * timestamp - so it runs with an allow-list and it is explicitly not the
 * headline claim.
 */
export function concealedFrom<T extends TaggedRecord<C>, P extends string, C extends string>(
  facts: T,
  model: PerceptionModel<P, C>,
  party: P,
): ReadonlyArray<readonly [string, unknown]> {
  return Object.entries(facts)
    .filter(([, fact]) => !perceives(model, party, fact.channel))
    .map(([key, fact]) => [key, fact.value] as const);
}

/**
 * Swap the two parties of a two-party model.
 *
 * The inverse of a perception model is a real question and not a curiosity: an
 * application that claims its asymmetry is architecture rather than convention
 * should be able to run its own proof with the roles exchanged and still pass.
 * If it cannot, the asymmetry is load-bearing in one direction only, which is
 * worth knowing.
 *
 * Two parties exactly, because "invert" has no meaning for three: with a third
 * party there is no single exchange to perform, and a kit that silently picked
 * one would be guessing at the application's intent.
 */
export function invert<P extends string, C extends string>(
  model: PerceptionModel<P, C>,
): PerceptionModel<P, C> {
  const parties = Object.keys(model) as P[];
  if (parties.length !== 2) {
    throw new RangeError(
      `invert() needs exactly two parties, received ${parties.length}: ${parties.join(", ")}`,
    );
  }
  const [a, b] = parties as [P, P];
  return { [a]: model[b], [b]: model[a] } as PerceptionModel<P, C>;
}
