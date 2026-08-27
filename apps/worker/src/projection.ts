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
 */

import { projectFacts, type Party, type TaggedRecord, type Unwrapped } from "@semaphore/protocol";

/** What PILOT may perceive: sight, sound, and shared state. */
export function projectForPilot<T extends TaggedRecord>(facts: T): Partial<Unwrapped<T>> {
  return projectFacts(facts, "PILOT");
}

/** What KEEPER may perceive: touch, document, sound, and shared state. */
export function projectForKeeper<T extends TaggedRecord>(facts: T): Partial<Unwrapped<T>> {
  return projectFacts(facts, "KEEPER");
}

/**
 * A canonical string for a projected view.
 *
 * Two views are the same epistemic state if and only if their canonical forms
 * are equal, so this is what "consistent with what the agent can perceive"
 * means in practice. Object keys are sorted, because JavaScript's insertion
 * order would otherwise make two identical views compare unequal and silently
 * inflate the consistent-worlds count, which would make the proof pass for the
 * wrong reason.
 */
export function canonicalise(view: unknown): string {
  return JSON.stringify(sortKeys(view));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
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
 *
 * FNV-1a, because this identifies a state rather than protecting one. It is
 * short, deterministic across runtimes, and needs no crypto import in a
 * hot path.
 */
export function viewHash(view: unknown): string {
  const text = canonicalise(view);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Convenience for the log and the benchmark: hash a party's view of some facts. */
export function projectedHash<T extends TaggedRecord>(facts: T, party: Party): string {
  return viewHash(projectFacts(facts, party));
}
