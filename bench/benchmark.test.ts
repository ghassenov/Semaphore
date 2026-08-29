/**
 * The Cooperative Benchmark's own check.
 *
 * Same discipline as `ablation.test.ts`, and for the same reason: the numbers
 * in `bench/results/` move whenever a chamber is tuned, so pinning them here
 * would turn every balance change into a red test. What is asserted is the
 * shape of the instrument - that the partner axis is actually an axis, that the
 * information metric is measuring information, and that the suite is
 * reproducible from its seeds.
 *
 * The one thing that would quietly ruin this benchmark is a partner that does
 * not differ from `oracle`, because a degraded partner that scores identically
 * reads as a robustness finding rather than as a broken harness. The first two
 * tests here are that, from two directions.
 */

import { describe, expect, it } from "vitest";
import { bitsDelivered, PARTNERS, PARTNER_NAMES } from "./partners.ts";
import { csv, summarise } from "./report.ts";
import { runSession, type Run } from "./session.ts";

/** A handful of the suite's own seeds. Enough to see the shape, fast enough for CI. */
const SEEDS = ["ablation-1", "ablation-2", "ablation-5", "ablation-7"];

const suite = (partner: (typeof PARTNER_NAMES)[number]): Run[] =>
  SEEDS.map((seed) => runSession({ seed, condition: "together", partner, gapMs: 4000 }));

describe("the cooperative benchmark", () => {
  it("clears the station with a perfect partner, so the ceiling is the game's and not the harness's", () => {
    for (const run of suite("oracle")) {
      expect({ seed: run.seed, cleared: run.cleared, escaped: run.escaped }).toEqual({
        seed: run.seed,
        cleared: 4,
        escaped: true,
      });
    }
  });

  it("makes a degraded partner cost the pair something", { timeout: 30_000 }, () => {
    const oracle = suite("oracle");
    const vague = suite("vague");

    // Not "vague clears fewer chambers": at a four-second rhythm on four seeds
    // it may well clear them all, and asserting otherwise would be pinning a
    // balance number. What must hold is that the imprecision was *paid for*,
    // in calls or in chambers, and that PILOT's sentences carried less.
    const calls = (runs: Run[]) => runs.reduce((sum, run) => sum + run.calls, 0);
    const cleared = (runs: Run[]) => runs.reduce((sum, run) => sum + run.cleared, 0);
    expect(calls(vague) > calls(oracle) || cleared(vague) < cleared(oracle)).toBe(true);

    const perDescription = (runs: Run[]) =>
      runs.reduce((sum, run) => sum + run.bits, 0) / runs.reduce((s, r) => s + r.descriptions, 0);
    expect(perDescription(vague)).toBeLessThan(perDescription(oracle));
  });

  it("charges a confident mis-description negative information", () => {
    // Directly, rather than through a session, because a run averages the
    // mistaken descriptions in with the true ones. Three worlds that disagree
    // about the plan; the partner names one that is not the answer.
    const chamber = {
      id: "airlock" as const,
      facts: () => ({}),
      candidates: () => [{ answer: "a" }, { answer: "b" }, { answer: "c" }],
      correctAction: (world: { answer: string }) => world.answer,
    };
    const worlds = chamber.candidates();
    const truth = worlds[0]!;

    expect(bitsDelivered(chamber, worlds, [truth], truth)).toBeCloseTo(Math.log2(3));
    expect(bitsDelivered(chamber, worlds, [worlds[1]!], truth)).toBeCloseTo(-Math.log2(3));
    expect(bitsDelivered(chamber, worlds, worlds, truth)).toBe(0);
  });

  it("gives every partner the same puzzles and its own mistakes", { timeout: 30_000 }, () => {
    // The seed list is fixed and shared, so a partner's row is never compared
    // against a different set of rooms. Only the partner's own stream moves.
    for (const partner of PARTNER_NAMES) {
      const options = { seed: SEEDS[0]!, condition: "together" as const, partner, gapMs: 4000 };
      expect(runSession(options)).toEqual(runSession(options));
      expect(runSession(options).seed).toBe(SEEDS[0]);
    }
  });

  it("only claims a partner where one played", () => {
    // A partnerless condition must not be labelled with one: a reader who saw
    // `partner: "oracle"` on an agent-alone row would reasonably conclude the
    // ablation's floor had a human in it.
    for (const condition of ["agent-alone", "human-alone"] as const) {
      const run = runSession({ seed: "ablation-1", condition, partner: "oracle" });
      expect(run.partner).toBeNull();
      expect(run.descriptions).toBe(0);
    }
  });

  it("reports a partner that never cleared anything as absent rather than as zero", () => {
    // `n/a` and `0.00` are different claims, and the second one is a lie about
    // a measurement that was never taken.
    const summary = summarise("oracle", [
      { ...suite("oracle")[0]!, chambers: [], cleared: 0, descriptions: 0, bits: 0 },
    ]);
    expect(summary.callsPerSolve).toBeNull();
    expect(summary.recovery).toBeNull();
    expect(summary.injectionResistance).toBeNull();
  });

  it("writes a CSV whose every row has the header's width", () => {
    const rows = csv(suite("wrong")).trim().split("\n");
    const width = rows[0]!.split(",").length;
    expect(rows).toHaveLength(SEEDS.length + 1);
    for (const row of rows) expect(row.split(",")).toHaveLength(width);
  });

  it("names every partner it ships", () => {
    for (const name of PARTNER_NAMES) {
      expect(PARTNERS[name].name).toBe(name);
      expect(PARTNERS[name].describes.length).toBeGreaterThan(0);
    }
  });
});
