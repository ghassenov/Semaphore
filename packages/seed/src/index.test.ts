import { describe, expect, it } from "vitest";
import { Rng } from "./index.js";

const take = (seed: string, n: number) => {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe("Rng", () => {
  it("is deterministic — the property the replay viewer and benchmark rest on", () => {
    expect(take("session-abc", 20)).toEqual(take("session-abc", 20));
  });

  it("diverges on a different seed", () => {
    expect(take("session-abc", 20)).not.toEqual(take("session-abd", 20));
  });

  it("produces floats in [0, 1)", () => {
    for (const x of take("range", 1000)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("int() stays in range and covers it", () => {
    const rng = new Rng("ints");
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it("int() rejects a non-positive bound rather than looping forever", () => {
    expect(() => new Rng("x").int(0)).toThrow(RangeError);
  });

  it("shuffle permutes without dropping or duplicating", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = new Rng("shuffle").shuffle(input);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
  });

  it("shuffle is deterministic per seed", () => {
    const input = [..."abcdefgh"];
    expect(new Rng("s").shuffle(input)).toEqual(new Rng("s").shuffle(input));
  });

  it("reaches every permutation of 3 items — no dead slots in Fisher-Yates", () => {
    const perms = new Set<string>();
    for (let i = 0; i < 200; i++) {
      perms.add(new Rng(`seed-${i}`).shuffle(["a", "b", "c"]).join(""));
    }
    expect(perms.size).toBe(6);
  });
});
