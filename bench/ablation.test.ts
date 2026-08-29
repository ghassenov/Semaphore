/**
 * The ablation's own check.
 *
 * Not a re-measurement: the numbers in `bench/results/` move whenever a
 * chamber is tuned and pinning them here would turn every balance change into
 * a red test. What is asserted is the *shape* of the result, which is the
 * thing the chart claims and the thing a regression would silently break.
 *
 *   - the cooperative condition clears the station, so the ceiling is a
 *     ceiling and not a limit of the harness;
 *   - the solo agent never gets out, and never clears a chamber whose world
 *     set does not collapse under play, because the answer is not in its
 *     projection to be found;
 *   - PILOT alone clears nothing, because there is no tool on that side.
 *
 * The first of those is what would have caught the two bugs this harness was
 * written with: a chamber whose solve leaves `machine.chamber` in place read
 * as unsolved, and a rotation plan that chased Chamber II's drift instead of
 * aiming ahead of it. Both showed up as a cooperative ceiling below four.
 */

import { describe, expect, it } from "vitest";
import { runSession } from "./session.ts";

/** A handful of the ablation's own seeds. Enough to see the shape; fast enough to run in CI. */
const SEEDS = ["ablation-1", "ablation-2", "ablation-5", "ablation-7"];

describe("the ablation", () => {
  it("clears the whole station with a partner, at an agent rhythm the game is tuned for", () => {
    for (const seed of SEEDS) {
      const run = runSession({ seed, condition: "together", gapMs: 4000 });
      expect({ seed, cleared: run.cleared, escaped: run.escaped }).toEqual({
        seed,
        cleared: 4,
        escaped: true,
      });
    }
  });

  it("never gets out with the same tools and no partner", { timeout: 30_000 }, () => {
    for (const seed of SEEDS) {
      const run = runSession({ seed, condition: "agent-alone" });
      const solved = run.chambers.filter((c) => c.outcome === "solved").map((c) => c.chamber);

      // Two chambers are *not* asserted against here, deliberately.
      //
      // The Airlock is three levers behind a twenty-second penalty and doc 02
      // section 3.1 says it is meant to be trivial, so a guesser gets through
      // it and reporting that honestly is the point of the exercise.
      //
      // The Signal Room falls to a solo agent roughly a quarter of the time,
      // which was a surprise and is a finding rather than a bug in this file:
      // the accepted prefix is a SHARED fact, so a wrong key costs a reset and
      // a penalty but never un-confirms the keys already accepted, which turns
      // 1,956 sequences into a sequential search with feedback. Doc 08 phase
      // 2.1's "resist brute force" holds against blind guessing and not against
      // this. `docs/decision-log.md` D-040 carries it.
      //
      // What must never happen is either of these two, whose world sets do not
      // collapse under any amount of play, or an escape.
      expect(solved).not.toContain("blind_panel");
      expect(solved).not.toContain("concord_lock");
      expect(run.escaped).toBe(false);
    }
  });

  it("clears nothing at all with the room and no tools", () => {
    for (const seed of SEEDS) {
      const run = runSession({ seed, condition: "human-alone" });
      expect({ seed, cleared: run.cleared, escaped: run.escaped }).toEqual({
        seed,
        cleared: 0,
        escaped: false,
      });
      // Not a stall in the harness: PILOT reached the room, the timer ran out
      // there, and the reason recorded is that there was nothing to call.
      expect(run.chambers.map((c) => c.outcome)).toContain("no_tools");
    }
  });

  it(
    "is deterministic, so a published run can be reproduced from its seed",
    { timeout: 30_000 },
    () => {
      const once = runSession({ seed: "ablation-3", condition: "agent-alone" });
      const twice = runSession({ seed: "ablation-3", condition: "agent-alone" });
      expect(once).toEqual(twice);
    },
  );
});
