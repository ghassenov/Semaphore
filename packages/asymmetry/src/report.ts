/**
 * The audit: run the proof over a set of states and say what it found.
 *
 * This is what the CLI prints and what an application's own test can assert
 * on, so the published numbers and the gate cannot drift apart. It reports
 * three kinds of finding, in descending order of how much they should worry
 * you:
 *
 *   determined  a party's view pins the answer down. The asymmetry does not
 *               hold at that state, which is the finding this kit exists for.
 *   unspanned   `candidates(s)` did not contain `s`. The space does not span
 *               what it claims to, so every number computed from it is
 *               unreliable - a defect in the space, not a fact about a party.
 *   verbatim    a concealed value appears literally inside the party's
 *               projection. The cheap smoke check: fragile in both directions
 *               and never the headline, but free.
 */

import { canonicalise } from "./canonical.ts";
import { concealedFrom, project, type PerceptionModel, type TaggedRecord } from "./perception.ts";
import { consistentWorlds, measure, type Space } from "./worlds.ts";

/** One thing the audit wants you to look at. */
export interface Finding {
  readonly kind: "determined" | "unspanned" | "verbatim";
  readonly space: string;
  readonly party: string;
  /** What to go and read. One line, written to be actionable on its own. */
  readonly detail: string;
}

/** One row of the bits table: a space as seen by one party. */
export interface AuditRow {
  readonly space: string;
  readonly party: string;
  /** How many states were examined. */
  readonly states: number;
  /** The fewest consistent worlds any examined state had. */
  readonly minWorlds: number;
  /** The fewest distinct actions those worlds disagreed over. */
  readonly minActions: number;
  /** Decision-relevant ambiguity at the state where it was lowest, in bits. */
  readonly minBits: number;
  /** The same, at the state where it was highest. The headline number. */
  readonly maxBits: number;
}

/**
 * One space bundled with the states to examine in it.
 *
 * A function rather than a plain object because it closes over the state type,
 * which is what lets a subject carry spaces over different state shapes in one
 * array without the caller reaching for `any`.
 */
export interface Check<C extends string = string> {
  readonly id: string;
  run<P extends string>(
    model: PerceptionModel<P, C>,
    party: P,
    allow: ReadonlySet<string>,
  ): { readonly row: AuditRow; readonly findings: readonly Finding[] };
}

/** Bundle a space with the states to examine in it. */
export function check<TState, C extends string>(
  space: Space<TState, C>,
  states: readonly TState[],
): Check<C> {
  return {
    id: space.id,
    run(model, party, allow) {
      return auditStates(space, states, model, party, allow);
    },
  };
}

/** Everything the CLI needs to audit an application. */
export interface Subject<C extends string = string, P extends string = string> {
  /** What to call this application in the report. */
  readonly name: string;
  /** Who perceives which channels. */
  readonly model: PerceptionModel<P, C>;
  /** The spaces to examine, each with its states. */
  readonly checks: readonly Check<C>[];
  /**
   * Which parties to audit. Defaults to every party in the model, which is
   * usually what you want: an asymmetry that only holds in one direction is a
   * thing to find out about deliberately rather than by omission.
   */
  readonly parties?: readonly P[];
  /**
   * Field names whose values are allowed to appear verbatim in a projection.
   *
   * The smoke check matches strings, so a small integer or an identifier that
   * legitimately appears on both sides will trip it. Name those here rather
   * than deleting the check.
   */
  readonly allowVerbatim?: readonly string[];
}

/** The whole result: one row per space per party, plus everything found. */
export interface Audit {
  readonly name: string;
  readonly rows: readonly AuditRow[];
  readonly findings: readonly Finding[];
}

/** Run every check for every party. */
export function audit<C extends string, P extends string>(subject: Subject<C, P>): Audit {
  const parties = subject.parties ?? (Object.keys(subject.model) as P[]);
  const allow = new Set(subject.allowVerbatim ?? []);
  const rows: AuditRow[] = [];
  const findings: Finding[] = [];
  for (const one of subject.checks) {
    for (const party of parties) {
      const result = one.run(subject.model, party, allow);
      rows.push(result.row);
      findings.push(...result.findings);
    }
  }
  return { name: subject.name, rows, findings };
}

function auditStates<TState, P extends string, C extends string>(
  space: Space<TState, C>,
  states: readonly TState[],
  model: PerceptionModel<P, C>,
  party: P,
  allow: ReadonlySet<string>,
): { row: AuditRow; findings: Finding[] } {
  const findings: Finding[] = [];
  let minWorlds = Infinity;
  let minActions = Infinity;
  let minBits = Infinity;
  let maxBits = 0;

  states.forEach((state, index) => {
    const worlds = consistentWorlds(space, state, model, party);
    if (!worlds.some((world) => sameFacts(space, world, state))) {
      findings.push({
        kind: "unspanned",
        space: space.id,
        party,
        detail: `state ${index}: candidates() does not contain the state itself, so every number below it is unreliable`,
      });
    }
    const { actions, bits } = measure(space, state, model, party);
    if (worlds.length <= 1 || actions <= 1) {
      findings.push({
        kind: "determined",
        space: space.id,
        party,
        detail: `state ${index}: ${worlds.length} consistent world(s) over ${actions} distinct action(s) - ${party} can work out what to do unaided here`,
      });
    }
    findings.push(...verbatimLeaks(space, state, index, model, party, allow));

    minWorlds = Math.min(minWorlds, worlds.length);
    minActions = Math.min(minActions, actions);
    minBits = Math.min(minBits, bits);
    maxBits = Math.max(maxBits, bits);
  });

  return {
    row: {
      space: space.id,
      party,
      states: states.length,
      minWorlds: states.length === 0 ? 0 : minWorlds,
      minActions: states.length === 0 ? 0 : minActions,
      minBits: states.length === 0 ? 0 : minBits,
      maxBits,
    },
    findings,
  };
}

/** Whether two states project identically on every channel. Used for spanning. */
function sameFacts<TState, C extends string>(
  space: Space<TState, C>,
  a: TState,
  b: TState,
): boolean {
  return canonicalise(space.facts(a)) === canonicalise(space.facts(b));
}

function verbatimLeaks<TState, P extends string, C extends string>(
  space: Space<TState, C>,
  state: TState,
  index: number,
  model: PerceptionModel<P, C>,
  party: P,
  allow: ReadonlySet<string>,
): Finding[] {
  const facts = space.facts(state) as TaggedRecord<C>;
  const view = canonicalise(project(facts, model, party));
  return concealedFrom(facts, model, party)
    .filter(([field, value]) => !allow.has(field) && appearsIn(view, value))
    .map(([field]) => ({
      kind: "verbatim" as const,
      space: space.id,
      party,
      detail: `state ${index}: concealed field "${field}" appears verbatim in the ${party} view - allow it by name if it is a coincidence`,
    }));
}

/**
 * Whether a concealed value shows up literally in a view.
 *
 * Deliberately narrow. Short primitives collide constantly with unrelated
 * numbers and single characters, and a check that cries wolf gets deleted, so
 * anything under three characters is not looked for at all.
 */
function appearsIn(view: string, value: unknown): boolean {
  const text = typeof value === "object" && value !== null ? canonicalise(value) : String(value);
  return text.length >= 3 && view.includes(text);
}

/** The audit as a markdown report: the bits table, then whatever it found. */
export function formatAudit(result: Audit): string {
  const lines = [`# Asymmetry audit: ${result.name}`, ""];
  lines.push("| Surface | Party | States | Min worlds | Min actions | Min bits | Max bits |");
  lines.push("|---|---|---:|---:|---:|---:|---:|");
  for (const row of result.rows) {
    lines.push(
      `| ${row.space} | ${row.party} | ${row.states} | ${row.minWorlds} | ${row.minActions} | ${row.minBits.toFixed(2)} | ${row.maxBits.toFixed(2)} |`,
    );
  }
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("No findings. Every surface is underdetermined for every party audited.");
    return lines.join("\n");
  }
  lines.push(`## ${result.findings.length} finding(s)`, "");
  for (const finding of result.findings) {
    lines.push(`- **${finding.kind}** ${finding.space} / ${finding.party}: ${finding.detail}`);
  }
  return lines.join("\n");
}
