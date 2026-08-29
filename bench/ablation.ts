/**
 * The ablation (doc 08 phase 7.1), and the first thing in this directory that
 * runs. Agent alone, human alone, together, over a fixed seed list.
 *
 * The claim the whole project rests on is that an agent's tool surface and a
 * human's UI surface are different surfaces and the gap between them is the
 * game. That claim is cheap to assert and this is where it is paid for: three
 * bars, two of them on the floor, over puzzles whose information is provably
 * split rather than merely described as split.
 *
 * Run it from the repository root:
 *
 *   pnpm --filter @semaphore/bench ablation
 *
 * which is `npx tsx bench/ablation.ts`. `tsx` rather than Node's own
 * `--experimental-strip-types`, and via `npx` rather than as a tracked
 * dependency, for the reason `apps/worker/scripts/generate-ghost.ts` already
 * does the same: the workspace's sources import each other with `.js`
 * specifiers that resolve to `.ts` files, which Node's type stripping does not
 * rewrite and every TypeScript-aware loader does.
 *
 * Options, all environment variables:
 *
 *   SEEDS=20          how many seeds, from the fixed list below
 *   GAP_MS=6000       virtual milliseconds between an agent's calls
 *   OUT=bench/results where the raw log and the chart are written
 *
 * It writes three things and prints the fourth:
 *
 *   ablation.jsonl - one line per run, every field, nothing aggregated. This
 *                    is the raw log `bench/CLAUDE.md` requires be published so
 *                    a reader can check the headline rather than trust it.
 *   ablation.svg   - the three-bar chart, for the landing page, the gate
 *                    screen, the README, Devpost and the video.
 *   ablation.md    - the same table this prints, for pasting.
 *
 * **Token spend for a run of this harness is zero,** because there is no model
 * in it. `session.ts` explains at length why the agent-alone condition is a
 * possible-worlds upper bound rather than a sampled model, and why that makes
 * the reported gap a lower bound on the real one. The per-model numbers
 * `bench/CLAUDE.md` budgets for belong to the Cooperative Benchmark (doc 08
 * phase 7.3), which is a different measurement and not this one.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { CHAMBER_NAMES, MODE_CHAMBERS, type ChamberId } from "@semaphore/protocol";
import { CONDITIONS, runSession, type Condition, type Run } from "./session.ts";

/**
 * The Node globals this program uses, declared rather than pulled in, which is
 * the pattern `tests/cross-origin-delegation.ts` established for the same
 * reason: four symbols are a smaller price to declare than `@types/node` is to
 * install and keep current.
 */
declare const process: {
  env: Record<string, string | undefined>;
  exit(code: number): never;
};

/**
 * The fixed seed list. Every condition faces identical puzzles, replayed by
 * id: `bench/CLAUDE.md`'s rule that a benchmark which re-randomises per run
 * measures noise. Twenty is doc 08 phase 2.5's figure for the solvability
 * sweep, reused here so the two agree about what "a seed" is.
 */
const SEEDS: readonly string[] = Array.from({ length: 20 }, (_, i) => `ablation-${i + 1}`);

const OUT = process.env.OUT ?? "bench/results";
const SEED_COUNT = Math.max(1, Math.min(SEEDS.length, Number(process.env.SEEDS ?? SEEDS.length)));
const GAP_MS = Number(process.env.GAP_MS ?? 6000);

const CHAMBERS = MODE_CHAMBERS.full;

/**
 * Agent rhythms the cooperative ceiling is re-measured at.
 *
 * The pacing is the one free parameter in this harness and doc 11 sections 6
 * and 7, which are supposed to fix it from measured round trips across three
 * backends, are still empty. Reporting a single number at an invented pace
 * would hide the sensitivity rather than state it, so the ceiling is measured
 * across a plausible range and the range is printed. Only the cooperative
 * condition is swept: the other two fail for reasons that have nothing to do
 * with how fast anyone is (no information, and no tools at all), and both are
 * flat across the range.
 */
const PACES_MS: readonly number[] = [2000, 4000, 6000, 9000];

/** What one condition did across every seed. */
interface Summary {
  readonly condition: Condition;
  readonly runs: number;
  /** Mean chambers cleared out of four. The bar's height. */
  readonly cleared: number;
  /** Share of runs that reached ESCAPED. */
  readonly escaped: number;
  /** Per chamber, the share of runs that solved it. */
  readonly byChamber: Readonly<Record<ChamberId, number>>;
  /** Share of mutating calls the server marked as teaching the caller nothing. */
  readonly wastedShare: number;
  /** Runs that got as far as the Concord Lock at all. */
  readonly reachedLock: number;
  /** Of those, how many stalled because the chamber needed a hand nobody had. */
  readonly noBody: number;
}

function summarise(condition: Condition, runs: readonly Run[]): Summary {
  const solvedIn = (chamber: ChamberId) =>
    runs.filter((run) => run.chambers.some((c) => c.chamber === chamber && c.outcome === "solved"))
      .length / runs.length;

  const byChamber = Object.fromEntries(
    CHAMBERS.map((chamber) => [chamber, solvedIn(chamber)]),
  ) as Record<ChamberId, number>;

  const calls = runs.reduce((sum, run) => sum + run.calls, 0);
  return {
    condition,
    runs: runs.length,
    cleared: runs.reduce((sum, run) => sum + run.cleared, 0) / runs.length,
    escaped: runs.filter((run) => run.escaped).length / runs.length,
    byChamber,
    wastedShare: calls === 0 ? 0 : runs.reduce((sum, run) => sum + run.wasted, 0) / calls,
    // Share of the runs that actually *reached* the Concord Lock and then
    // stalled there for want of a hand on the bar. Taken over arrivals rather
    // than over all runs, because a condition that never gets that far would
    // otherwise report a reassuring zero for the wrong reason.
    reachedLock: runs.filter((run) => run.chambers.some((c) => c.chamber === "concord_lock"))
      .length,
    noBody: runs.filter((run) => run.chambers.some((c) => c.outcome === "no_body")).length,
  };
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

/**
 * The report, as markdown.
 *
 * Leads with the gap rather than the ceiling, which is this directory's
 * standing rule: the interesting line is the distance between the bars, not
 * how high the tallest one gets.
 */
function report(summaries: readonly Summary[], paces: readonly [number, Summary][]): string {
  const together = summaries.find((s) => s.condition === "together")!;
  const solo = summaries.find((s) => s.condition === "agent-alone")!;
  const human = summaries.find((s) => s.condition === "human-alone")!;

  const lines = [
    "# The ablation",
    "",
    `${SEED_COUNT} seeds, Standard difficulty, full mode, ${GAP_MS}ms between agent calls.`,
    "",
    "| Condition | Chambers cleared (of 4) | Escaped | Wasted calls |",
    "|---|---|---|---|",
    ...summaries.map(
      (s) =>
        `| ${s.condition} | ${s.cleared.toFixed(2)} | ${pct(s.escaped)} | ${pct(s.wastedShare)} |`,
    ),
    "",
    "## Per chamber, share of runs solved",
    "",
    `| Chamber | ${summaries.map((s) => s.condition).join(" | ")} |`,
    `|---|${summaries.map(() => "---").join("|")}|`,
    ...CHAMBERS.map(
      (chamber) =>
        `| ${CHAMBER_NAMES[chamber]} | ${summaries.map((s) => pct(s.byChamber[chamber])).join(" | ")} |`,
    ),
    "",
    "## What this says",
    "",
    `Together clears ${together.cleared.toFixed(2)} chambers of four and escapes in ${pct(together.escaped)} of runs.`,
    `An agent with the same tools and no partner clears ${solo.cleared.toFixed(2)}.`,
    `A human with the same room and no agent clears ${human.cleared.toFixed(2)}: there is no tool on PILOT's side of the grate.`,
    "",
    `The agent-alone figure is a ceiling, not a sample. It plays a uniform draw from the worlds its own`,
    `projection cannot distinguish, redrawn at every step, so it exploits every observation available to it`,
    `and never forgets one. No real model does better. See \`bench/session.ts\` for why that is the honest`,
    `way to run this condition and \`bench/results/ablation.jsonl\` for every run behind these numbers.`,
    "",
    `The cooperative ceiling is sensitive to how fast the agent moves, and only in Chamber II. Every`,
    `gauge falls one mark toward zero every twenty seconds and the win condition is all four on target at`,
    `the same instant, so a plan whose rotations span more than one drift interval has to aim each needle`,
    `above where it must finish. A gauge whose target is 8 has no room to do that. The sweep below is the`,
    `same 20 seeds under the same oracle partner at four agent rhythms:`,
    "",
    "| ms between agent calls | chambers cleared | escaped |",
    "|---|---|---|",
    ...paces.map(([gap, s]) => `| ${gap} | ${s.cleared.toFixed(2)} | ${pct(s.escaped)} |`),
    "",
    `Which is a tuning finding about the game rather than about any agent: doc 08 phase 2.2 already flags`,
    `Chamber II's drift rate as the thing to tune carefully, and this says what to tune it against. Fix`,
    `the pace once doc 11 sections 6 and 7 carry measured round trips, and re-run.`,
    "",
    `The Concord Lock would be scored separately if it were reached: its release bar is PILOT's hand and`,
    `no tool of KEEPER's substitutes for it, which is a weaker claim than the other three chambers make.`,
    solo.reachedLock === 0
      ? `In this run the solo condition never got that far, stopping in Chamber II, so the claim is not`
      : `In this run ${solo.noBody} of the ${solo.reachedLock} solo arrivals stalled there for exactly that reason, and it is not`,
    `part of the headline number either way.`,
    "",
  ];
  return lines.join("\n");
}

/**
 * The three-bar chart, as an SVG string.
 *
 * Inline SVG rather than a charting library: the whole figure is three
 * rectangles and some text, it has to inline into the landing page under the
 * 400KB bundle budget (D-026), and a dependency for this would be one more
 * thing to keep alive until the judging period ends.
 *
 * Colours are named here rather than imported from `apps/game/src/render/
 * palette.ts`, because that module is the *game's* locked palette and this
 * figure also has to read on a README and a Devpost page with their own
 * backgrounds. Amber is PILOT and cyan is KEEPER throughout the project; the
 * cooperative bar is the one that gets both.
 */
function chart(summaries: readonly Summary[]): string {
  const W = 520;
  const H = 300;
  const PAD = { left: 56, right: 20, top: 44, bottom: 64 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = 4;
  const barW = Math.floor((plotW / summaries.length) * 0.5);
  const step = plotW / summaries.length;

  const fill: Record<Condition, string> = {
    "agent-alone": "#4aa8b8",
    "human-alone": "#c8922e",
    together: "#e8e0cf",
  };

  const bars = summaries.map((s, i) => {
    const h = Math.round((s.cleared / max) * plotH);
    const x = Math.round(PAD.left + step * i + (step - barW) / 2);
    const y = PAD.top + plotH - h;
    return [
      `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill[s.condition]}"/>`,
      `<text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" class="v">${s.cleared.toFixed(2)}</text>`,
      `<text x="${x + barW / 2}" y="${PAD.top + plotH + 20}" text-anchor="middle" class="l">${s.condition}</text>`,
    ].join("");
  });

  const ticks = [0, 1, 2, 3, 4].map((v) => {
    const y = PAD.top + plotH - Math.round((v / max) * plotH);
    return [
      `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" class="g"/>`,
      `<text x="${PAD.left - 10}" y="${y + 4}" text-anchor="end" class="l">${v}</text>`,
    ].join("");
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"`,
    ` aria-label="Chambers cleared: ${summaries.map((s) => `${s.condition} ${s.cleared.toFixed(2)}`).join(", ")}">`,
    `<style>`,
    `text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;fill:#e8e0cf}`,
    `.l{font-size:12px;fill:#9a9484}.v{font-size:14px}.t{font-size:15px}`,
    `.g{stroke:#3a3630;stroke-width:1}`,
    `</style>`,
    `<rect width="${W}" height="${H}" fill="#16140f"/>`,
    `<text x="${PAD.left}" y="26" class="t">SEMAPHORE - chambers cleared of 4</text>`,
    ...ticks,
    ...bars,
    `<text x="${PAD.left}" y="${H - 16}" class="l">${SEED_COUNT} seeds, Standard, full mode. Raw logs: bench/results/ablation.jsonl</text>`,
    `</svg>`,
  ].join("");
}

const runs: Run[] = [];
for (const condition of CONDITIONS) {
  for (const seed of SEEDS.slice(0, SEED_COUNT)) {
    runs.push(runSession({ seed, condition, gapMs: GAP_MS }));
  }
}

const summaries = CONDITIONS.map((condition) =>
  summarise(
    condition,
    runs.filter((run) => run.condition === condition),
  ),
);

const paces: [number, Summary][] = PACES_MS.map((gapMs) => [
  gapMs,
  summarise(
    "together",
    SEEDS.slice(0, SEED_COUNT).map((seed) => runSession({ seed, condition: "together", gapMs })),
  ),
]);

mkdirSync(OUT, { recursive: true });
writeFileSync(
  `${OUT}/ablation.jsonl`,
  runs.map((run) => JSON.stringify(run)).join("\n") + "\n",
  "utf8",
);
writeFileSync(`${OUT}/ablation.svg`, chart(summaries), "utf8");
const markdown = report(summaries, paces);
writeFileSync(`${OUT}/ablation.md`, markdown, "utf8");

console.log(markdown);
console.log(`Wrote ${OUT}/ablation.jsonl, ${OUT}/ablation.svg and ${OUT}/ablation.md`);
process.exit(0);
