import { describe, expect, it } from "vitest";
import {
  STAMINA_WINDOW_MAX_MS,
  STAMINA_WINDOW_MIN_MS,
  percentile,
  staminaWindowMs,
} from "./latency.js";

describe("percentile", () => {
  it("reports 0 for an empty sample rather than throwing", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("returns the sole value for a single-element sample", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });

  it("returns the minimum and maximum at the extremes", () => {
    const values = [5, 1, 9, 3];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 100)).toBe(9);
  });

  it("computes the median by nearest rank on an odd-length sample", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it("computes the median by nearest rank on an even-length sample", () => {
    // Nearest-rank, not interpolated: doc 05 §6 measures whole milliseconds
    // from a small sample, so implying sub-sample precision would be false.
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
  });

  it("does not mutate the array it is given", () => {
    const values = [5, 1, 9, 3];
    percentile(values, 50);
    expect(values).toEqual([5, 1, 9, 3]);
  });

  it("is order-independent", () => {
    expect(percentile([9, 1, 5, 3], 50)).toBe(percentile([1, 3, 5, 9], 50));
  });
});

describe("staminaWindowMs", () => {
  it("falls back to a plausible window when nothing has been observed", () => {
    // 6 * the 3s fallback median = 18s, comfortably inside the clamp, so an
    // empty sample does not silently land on a bound.
    expect(staminaWindowMs([])).toBe(18_000);
  });

  it("clamps a fast agent's window to the floor", () => {
    // median 1000ms * 6 = 6000ms, below the 12s floor.
    expect(staminaWindowMs([900, 1000, 1100])).toBe(STAMINA_WINDOW_MIN_MS);
  });

  it("clamps a slow agent's window to the ceiling", () => {
    // median 8000ms * 6 = 48000ms, above the 35s ceiling.
    expect(staminaWindowMs([7000, 8000, 9000])).toBe(STAMINA_WINDOW_MAX_MS);
  });

  it("scales linearly with the median inside the clamp", () => {
    // median 3000ms * 6 = 18000ms, inside both bounds.
    expect(staminaWindowMs([2000, 3000, 4000])).toBe(18_000);
  });

  it("always returns a value inside the documented bounds", () => {
    const samples = [[], [1], [100_000], [1, 100_000], [3000, 3100, 2900, 3050]];
    for (const sample of samples) {
      const window = staminaWindowMs(sample);
      expect(window).toBeGreaterThanOrEqual(STAMINA_WINDOW_MIN_MS);
      expect(window).toBeLessThanOrEqual(STAMINA_WINDOW_MAX_MS);
    }
  });
});
