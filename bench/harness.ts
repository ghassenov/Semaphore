/**
 * The Semaphore Cooperative Benchmark (doc 07 section 2, doc 08 phase 7.3).
 *
 * Runs the Standard suite - the twenty fixed seeds in `suites/standard.json`,
 * four chambers each - once per scripted PILOT partner, and publishes what the
 * pair did. Run it from the repository root, after the ablation:
 *
 *   pnpm --filter @semaphore/bench benchmark
 *
 * ## What it is measuring
 *
 * Not "can an agent solve Semaphore". **Partner-sensitivity**: how much joint
 * performance degrades as the partner degrades. `partners.ts` carries the
 * framing at length, because a scripted PILOT is the one thing in this
 * repository that can be misread as refuting the project's own thesis, and it
 * is cheaper to state the answer than to be asked.
 *
 * ## The CONCORD meter is off, by construction
 *
 * `bench/CLAUDE.md` requires the meter be disabled in the Standard suite so a
 * HUD element cannot contaminate the measurement of what the agent inferred on
 * its own. There is no flag for it here because there is nothing to switch:
 * the meter is a client surface fed by the worker's `/concord` route, and this
 * harness plays sessions in process through `reduce()` and never asks. The
 * executor's own use of `consistentWorlds` is the ground-truth enumeration the
 * meter is *derived* from, not the meter, and it is what a possible-worlds
 * ceiling is defined in terms of (D-040).
 *
 * ## Token spend
 *
 * Zero, for the same reason the ablation's is: there is no model in this. What
 * this run publishes is the harness, the suite, the partner axis and the
 * baseline the possible-worlds ceiling scores on them. The per-model numbers
 * doc 07 section 2.4 wants are a later run of this same file with a backend
 * behind the executor, and doc 11 sections 6 and 7 gate it.
 *
 * Options, all environment variables:
 *
 *   SEEDS=20          how many of the suite's seeds to run
 *   GAP_MS=6000       virtual milliseconds between an agent's calls
 *   OUT=<this directory>/results  where the raw log, the table and the CSV are written
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PARTNER_NAMES } from "./partners.ts";
import { csv, markdown, summarise } from "./report.ts";
import { runSession, type Run } from "./session.ts";
import type { Difficulty, SessionMode } from "@semaphore/protocol";

/**
 * The Node globals this program uses, declared rather than pulled in, which is
 * the pattern `ablation.ts` and `tests/cross-origin-delegation.ts` established:
 * four symbols are a smaller price to declare than `@types/node` is to install
 * and keep current.
 */
declare const process: {
  env: Record<string, string | undefined>;
  exit(code: number): never;
};

/**
 * The suite, as data rather than as code.
 *
 * Doc 07 section 2.4 publishes the suites alongside the harness and the logs,
 * and a JSON file is what lets someone reproduce a row without reading any
 * TypeScript. The seed list is the ablation's, so this file's `oracle` row and
 * that chart's `together` bar are the same measurement and cannot drift apart.
 */
interface Suite {
  readonly name: string;
  readonly difficulty: Difficulty;
  readonly mode: SessionMode;
  readonly gapMs: number;
  readonly seeds: readonly string[];
}

const suite = JSON.parse(
  readFileSync(`${import.meta.dirname}/suites/standard.json`, "utf8"),
) as Suite;

const OUT = process.env.OUT ?? `${import.meta.dirname}/results`;
const SEED_COUNT = Math.max(
  1,
  Math.min(suite.seeds.length, Number(process.env.SEEDS ?? suite.seeds.length)),
);
const GAP_MS = Number(process.env.GAP_MS ?? suite.gapMs);

const seeds = suite.seeds.slice(0, SEED_COUNT);

const runs: Run[] = [];
for (const partner of PARTNER_NAMES) {
  for (const seed of seeds) {
    runs.push({
      ...runSession({
        seed,
        condition: "together",
        partner,
        difficulty: suite.difficulty,
        mode: suite.mode,
        gapMs: GAP_MS,
      }),
    });
  }
}

const summaries = PARTNER_NAMES.map((partner) =>
  summarise(
    partner,
    runs.filter((run) => run.partner === partner),
  ),
);

const settings = [
  `Suite \`${suite.name}\`: ${SEED_COUNT} seeds, ${suite.difficulty} difficulty, ${suite.mode} mode,`,
  `${GAP_MS}ms between agent calls. The CONCORD meter is off. No model and no tokens: the agent is`,
  `the possible-worlds ceiling of D-040, so every number here is what a *perfect* agent scores with`,
  `each partner, and a real model's row goes below these rather than replacing them.`,
].join("\n");

mkdirSync(OUT, { recursive: true });
writeFileSync(
  `${OUT}/benchmark.jsonl`,
  runs.map((run) => JSON.stringify(run)).join("\n") + "\n",
  "utf8",
);
writeFileSync(`${OUT}/benchmark.csv`, csv(runs), "utf8");
const report = markdown(summaries, settings);
writeFileSync(`${OUT}/benchmark.md`, report, "utf8");

console.log(report);
console.log(`Wrote ${OUT}/benchmark.jsonl, ${OUT}/benchmark.csv and ${OUT}/benchmark.md`);
process.exit(0);
