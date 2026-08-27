/**
 * Round-trip latency observation and the Chamber III adaptive stamina window
 * (doc 05 section 6).
 *
 * The station "learns your rhythm": the reducer in `reducer.ts` records the
 * wall-clock gap between one chamber action's response and the next request
 * arriving, across Chambers 0-II, and Chamber III's release-bar window is
 * sized from the median of those gaps rather than fixed, so the finale works
 * for a fast model and a slow one alike (doc 02 section 3.4, R4).
 *
 * That sample is *not* the same thing as `ActionSemaphore.latencies` in
 * `semaphore.ts`, which measures server processing time and is always small.
 * `staminaWindowMs` below must only ever be called on
 * `PersistedSession.observedLatencyMs`. See D-010.
 */

/**
 * Nearest-rank percentile over `values`. Does not mutate its input.
 *
 * Nearest-rank rather than interpolated, because the values here are whole
 * milliseconds from a small sample and interpolating between two of them
 * would imply a precision the measurement does not have. An empty sample
 * reports 0 rather than throwing, since "no calls observed yet" is an
 * expected state early in a session, not an error.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (p <= 0) return sorted[0] as number;
  if (p >= 100) return sorted[sorted.length - 1] as number;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)] as number;
}

/** Bounds doc 02 section 3.4 sets on the derived window, in milliseconds. */
export const STAMINA_WINDOW_MIN_MS = 12_000;
export const STAMINA_WINDOW_MAX_MS = 35_000;

/**
 * Used only when no latency has been observed at all, which should not
 * happen in a normal full-length session but can in BRIEF mode or a
 * malformed sequence. A plausible mid-range agent latency, so such a session
 * gets a playable window rather than silently landing on whichever clamp
 * bound an empty sample would produce.
 */
const FALLBACK_MEDIAN_MS = 3_000;

/**
 * `6 * median observed latency`, clamped to doc 02 section 3.4's bounds.
 *
 * The derived value is logged (doc 05 section 6) so the benchmark can control
 * for it when comparing models, and shown on the ending's stats card: "your
 * rhythm: 3.2s. The station gave you 19 seconds."
 */
export function staminaWindowMs(observedLatencyMs: readonly number[]): number {
  const median =
    observedLatencyMs.length > 0 ? percentile(observedLatencyMs, 50) : FALLBACK_MEDIAN_MS;
  return Math.min(STAMINA_WINDOW_MAX_MS, Math.max(STAMINA_WINDOW_MIN_MS, 6 * median));
}
