/**
 * Deterministic PRNG — xorshift128+ (doc 04 §7).
 *
 * Same seed string always produces the same sequence, which is what makes
 * `?seed=` replays, fair model-vs-model benchmark comparison, and reproducing a
 * playtester's bug all possible.
 */

const MASK64 = (1n << 64n) - 1n;

/** splitmix64 — used only to expand a seed into well-mixed 128-bit state. */
function splitmix64(x: bigint): bigint {
  let z = (x + 0x9e3779b97f4a7c15n) & MASK64;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  return z ^ (z >> 31n);
}

/** FNV-1a over the seed string, so any session id is a usable seed. */
function hashSeed(seed: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < seed.length; i++) {
    h = ((h ^ BigInt(seed.charCodeAt(i))) * 0x100000001b3n) & MASK64;
  }
  return h;
}

export class Rng {
  #s0: bigint;
  #s1: bigint;

  constructor(readonly seed: string) {
    const h = hashSeed(seed);
    this.#s0 = splitmix64(h);
    this.#s1 = splitmix64(this.#s0);
    // xorshift128+ is degenerate at all-zero state; any nonzero constant fixes it.
    if (this.#s0 === 0n && this.#s1 === 0n) this.#s1 = 1n;
  }

  /** Raw 64-bit output. */
  nextU64(): bigint {
    let s1 = this.#s0;
    const s0 = this.#s1;
    this.#s0 = s0;
    s1 ^= (s1 << 23n) & MASK64;
    this.#s1 = s1 ^ s0 ^ (s1 >> 17n) ^ (s0 >> 26n);
    return (this.#s1 + s0) & MASK64;
  }

  /** Float in [0, 1). Uses the top 53 bits, the most a double holds exactly. */
  next(): number {
    return Number(this.nextU64() >> 11n) / 2 ** 53;
  }

  /** Integer in [0, maxExclusive). Rejection-sampled, so it is unbiased. */
  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
    }
    const n = BigInt(maxExclusive);
    const limit = MASK64 - (MASK64 % n); // discard the short tail
    let x = this.nextU64();
    while (x >= limit) x = this.nextU64();
    return Number(x % n);
  }

  /** Fisher-Yates. Returns a new array; the input is untouched. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}
