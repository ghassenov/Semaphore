/**
 * The two projections (doc 03 section 5).
 *
 * `projectForKeeper` is the single most important function in the repository:
 * it computes the agent's entire perceptual surface, on the server, in a place
 * the browser cannot reach around. Every tool response derives exclusively
 * from it. Every rendered frame derives exclusively from `projectForPilot`.
 * Neither is permitted to reach around the other, and `HIDDEN` appears in
 * neither.
 *
 * Both are thin wrappers over `projectFacts` from the protocol package rather
 * than hand-written field lists. That is deliberate: a hand-written projection
 * is one forgotten field away from a leak, and the wrapper means the perception
 * rule has exactly one implementation shared with the proof and the smoke test.
 *
 * **Both take a perception model.** It defaults to the design law and the
 * Blackout passes `INVERTED_PERCEPTION` (doc 02, the Archive beat), which is
 * how the roles trade halves for one window without any function here learning
 * to invert itself and without either surface reaching around the other. The
 * names stay `ForPilot` and `ForKeeper` because they name **whose surface is
 * being fed**, which does not change; what changes is what that party
 * perceives.
 *
 * `canonicalise` and `viewHash` come from `@semaphore/asymmetry`, the
 * extracted kit, and are re-exported here so every call site in the worker
 * keeps one import for "the projection machinery".
 */

import {
  projectFacts,
  PERCEIVED_BY,
  type Channel,
  type Party,
  type TaggedRecord,
  type Unwrapped,
} from "@semaphore/protocol";
import type { PerceptionModel } from "@semaphore/asymmetry";

export { canonicalise, viewHash } from "@semaphore/asymmetry";
import { viewHash } from "@semaphore/asymmetry";

/** What PILOT may perceive: sight, sound, and shared state, unless inverted. */
export function projectForPilot<T extends TaggedRecord>(
  facts: T,
  model: PerceptionModel<Party, Channel> = PERCEIVED_BY,
): Partial<Unwrapped<T>> {
  return projectFacts(facts, "PILOT", model);
}

/** What KEEPER may perceive: touch, document, sound, and shared state, unless inverted. */
export function projectForKeeper<T extends TaggedRecord>(
  facts: T,
  model: PerceptionModel<Party, Channel> = PERCEIVED_BY,
): Partial<Unwrapped<T>> {
  return projectFacts(facts, "KEEPER", model);
}

/**
 * The hash recorded against every tool call in the session log.
 *
 * It is what makes the wasted-call metric computable after the fact: with the
 * agent's exact epistemic state at call time on record, the benchmark can
 * replay what it knew and decide whether a call could possibly have succeeded.
 * A model that presses keys until one works and a model that reasons to the
 * answer produce identical completion rates and very different wasted-call
 * counts, and that distinction is the whole point.
 */
export function projectedHash<T extends TaggedRecord>(
  facts: T,
  party: Party,
  model: PerceptionModel<Party, Channel> = PERCEIVED_BY,
): string {
  return viewHash(projectFacts(facts, party, model));
}
