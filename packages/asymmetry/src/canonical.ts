/**
 * Canonical forms and hashes for projected views.
 *
 * Two views are the same epistemic state if and only if their canonical forms
 * are equal, so this is what "consistent with what this party can perceive"
 * means in practice.
 */

/**
 * A stable string for a value, with object keys sorted.
 *
 * The sort is not cosmetic. JavaScript preserves insertion order, so two views
 * holding identical facts in a different order would compare unequal and
 * silently inflate the consistent-worlds count - which makes a proof pass for
 * the wrong reason, the worst failure mode a proof has.
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
 * A short deterministic hash of a view, for recording alongside an agent's
 * calls.
 *
 * With a party's exact epistemic state on record at the moment of each call, an
 * audit after the fact can decide whether the call could possibly have
 * succeeded given what the caller knew. An agent that guesses until something
 * works and an agent that reasons to the answer produce identical success
 * rates and very different wasted-call counts, and that distinction is only
 * computable if the view was hashed at call time.
 *
 * FNV-1a, because this identifies a state rather than protecting one: short,
 * deterministic across runtimes, and no crypto import on a hot path.
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
