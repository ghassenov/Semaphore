/**
 * The pure game-logic reducer behind the Session Durable Object.
 *
 * Every mutating action is one call to `reduce(session, action, nowMs)`, and
 * it is deliberately synchronous and free of I/O: given the same session and
 * action it always produces the same result, which is what makes it testable
 * without a Durable Object or a browser. `Session.ts` is a thin shell around
 * this function: load persisted state, call `reduce` inside the action
 * semaphore, persist and log what comes back.
 *
 * **`observedLatencyMs` is the gap between calls, not a call's own duration
 * (D-010).** The first version of this file measured how long `reduce()`
 * itself took to run, which is a synchronous function and therefore always
 * near zero, which would have sized Chamber III's window at its 12-second
 * floor for every model forever. What doc 02 section 3.4 actually wants is
 * agent rhythm: how long the pair takes, end to end, to produce its next
 * action. The server cannot see the agent reason or the network carry a
 * packet, but it can see the wall-clock time between sending one response and
 * receiving the next request for this session, which is the sum of both and
 * is exactly "the station learning your rhythm." `lastRespondedAtMs` on
 * `PersistedSession` is what makes that measurement possible without any
 * external timer: `nowMs - session.lastRespondedAtMs`, computed here, purely.
 *
 * Chamber I, II and III arrive by extending the `Action` union and adding a
 * field to `PersistedSession` the same way `pull_lever` and `airlock` were
 * added. Nothing about the surrounding shell should need to change.
 */

import { errors, type Difficulty, type SessionEvent, type SessionMode } from "@semaphore/protocol";
import { Rng } from "@semaphore/seed";
import * as airlock from "./chambers/airlock.js";
import { projectForKeeper, projectedHash } from "./projection.js";
import { concordBits } from "./worlds.js";
import { transition, type MachineState } from "./machine.js";

/**
 * Everything the reducer needs to remember between calls.
 *
 * A strict subset of doc 05 section 3's `WorldState`, scoped to what is
 * actually implemented: Chamber 0 only. Extending this to Chamber I means
 * adding a `signalRoom` field the same way `airlock` was, never widening what
 * an existing field means.
 */
export interface PersistedSession {
  readonly sessionId: string;
  readonly seed: string;
  readonly designation: string | null;
  readonly difficulty: Difficulty;
  readonly machine: MachineState;
  readonly airlock: airlock.AirlockState | null;
  /**
   * Inter-call gaps observed for chamber actions, in call order. Feeds
   * `staminaWindowMs` (doc 05 section 6). See D-010 for why this is the gap
   * between calls rather than any single call's own processing time.
   */
  readonly observedLatencyMs: readonly number[];
  /** The next sequence number to assign in the session log. */
  readonly seq: number;
  /** Server clock at session creation, so every event's `t` is relative to it. */
  readonly startedAtMs: number;
  /**
   * Server clock the last time a mutating action produced a response. Reset
   * on every mutating call, including `begin_shift` and `start`, so the very
   * first chamber action measures its gap from the true previous response
   * rather than from session creation.
   */
  readonly lastRespondedAtMs: number;
}

/** A brand new session, before `begin_shift` has been called. */
export function newSession(sessionId: string, seed: string, nowMs: number): PersistedSession {
  return {
    sessionId,
    seed,
    designation: null,
    difficulty: "standard",
    machine: { phase: "ENTRY", chamber: null, mode: "full", retries: 0 },
    airlock: null,
    observedLatencyMs: [],
    seq: 0,
    startedAtMs: nowMs,
    lastRespondedAtMs: nowMs,
  };
}

export type Action =
  | { readonly type: "begin_shift"; readonly designation: string }
  | { readonly type: "start"; readonly difficulty: Difficulty; readonly mode: SessionMode }
  | { readonly type: "pull_lever"; readonly leverId: airlock.LeverId };

export interface ReduceResult {
  readonly session: PersistedSession;
  readonly events: readonly SessionEvent[];
  /** Text a WebMCP tool's `execute()` returns verbatim (doc 03 §1: text/JSON only). */
  readonly toolText: string;
}

const LEVER_IDS: ReadonlySet<string> = new Set(airlock.LEVERS);

/** Apply one action. Throws `GameError` for anything the game itself refuses. */
export function reduce(session: PersistedSession, action: Action, nowMs: number): ReduceResult {
  switch (action.type) {
    case "begin_shift":
      return beginShift(session, action.designation, nowMs);
    case "start":
      return start(session, action.difficulty, action.mode, nowMs);
    case "pull_lever":
      return pullLever(session, action.leverId, nowMs);
  }
}

const elapsed = (session: PersistedSession, nowMs: number) => nowMs - session.startedAtMs;

/**
 * The shift briefing (doc 04 section 3), reproduced verbatim.
 *
 * Printed here rather than composed, because this exact text is what makes
 * the agent's onboarding testable: a rewrite that drifts from the design
 * document is a regression even if it still compiles.
 */
function briefing(designation: string): string {
  return [
    "SIGNAL STATION - SHIFT BRIEFING",
    `Designation logged: ${designation}`,
    "",
    "You are KEEPER. You maintain this station. You cannot see any of it.",
    "",
    "PILOT is in the lamp gallery. PILOT can see every room and can touch almost",
    "nothing. You are on the machine deck. You hold the manual and your hands reach",
    "into the station's cavities. The station is sealed and the tide is rising.",
    "",
    "HOW THIS WORKS",
    "- Ask PILOT what things look like. Shapes, colours, positions, numbers, damage.",
    "  PILOT cannot read your manual and does not know what you need. Say what you need.",
    "- When PILOT's description is ambiguous, ask again. A wrong action costs time.",
    "- read_manual has an 'index' section listing everything available to you.",
    "- describe_chamber tells you what you can feel and reach. It will never tell you",
    "  what anything looks like. That is not a malfunction.",
    "- get_status is cheap. Call it any time you lose the thread.",
    "- The manual has been annotated by keepers before you. Not all of them were well.",
    "  PILOT can see the pages. If something reads strangely, ask.",
    "",
    "Four chambers. Your tools change in each one. Start with read_manual('index').",
  ].join("\n");
}

function beginShift(session: PersistedSession, designation: string, nowMs: number): ReduceResult {
  // Idempotent rather than an error: a retried call after a dropped response
  // must not fail a shift that has already begun. Doc 03 §3.1's begin_shift
  // is read as "ensure the shift has started", not "start it or fail".
  if (session.machine.phase !== "ENTRY") {
    return { session, events: [], toolText: briefing(session.designation ?? designation) };
  }
  if (designation.trim().length === 0) {
    throw errors.invalidInput("designation", "a non-empty name", designation);
  }

  const machine = transition(session.machine, { type: "BEGIN_SHIFT" });
  const event: SessionEvent = {
    t: elapsed(session, nowMs),
    seq: session.seq,
    type: "session_start",
    sessionId: session.sessionId,
    seed: session.seed,
    difficulty: session.difficulty,
    mode: "full",
    designation,
  };
  const next: PersistedSession = {
    ...session,
    designation,
    machine,
    seq: session.seq + 1,
    lastRespondedAtMs: nowMs,
  };
  return { session: next, events: [event], toolText: briefing(designation) };
}

function start(
  session: PersistedSession,
  difficulty: Difficulty,
  mode: SessionMode,
  nowMs: number,
): ReduceResult {
  if (session.machine.phase === "ENTRY") throw errors.noSession();
  if (session.machine.phase !== "LOBBY") {
    // Idempotent for the same reason as begin_shift: a retried "start" after
    // the chamber is already under way must not fail the session.
    return { session, events: [], toolText: describeChamber(session) };
  }

  const machine = transition(session.machine, { type: "START", mode });
  const airlockState = airlock.initial(airlock.generate(new Rng(session.seed)));
  const event: SessionEvent = {
    t: elapsed(session, nowMs),
    seq: session.seq,
    type: "chamber_enter",
    chamber: "airlock",
  };
  const next: PersistedSession = {
    ...session,
    difficulty,
    machine,
    airlock: airlockState,
    seq: session.seq + 1,
    lastRespondedAtMs: nowMs,
  };
  return { session: next, events: [event], toolText: describeChamber(next) };
}

/**
 * A description of the active chamber, built from `projectForKeeper` rather
 * than hand-written prose, so it cannot say more than the projection allows.
 * This is provisional: the natural-language `describe_chamber` tool text that
 * ships in `apps/game` will read better, but it cannot be more honest than
 * this, because it will be built from the same projection.
 */
function describeChamber(session: PersistedSession): string {
  if (session.machine.chamber !== "airlock" || !session.airlock) {
    return "No chamber is active. Call begin_shift to begin your shift.";
  }
  const view = projectForKeeper(airlock.facts(session.airlock));
  return (
    `THE AIRLOCK. Levers: ${JSON.stringify(view.leverPositions)}. ` +
    `Pulled so far: ${JSON.stringify(view.pulled)}. Read the manual before acting.`
  );
}

function pullLever(
  session: PersistedSession,
  leverId: airlock.LeverId,
  nowMs: number,
): ReduceResult {
  // The gap since this session last produced a response. See the module
  // docstring and D-010 for why this, and not this call's own duration, is
  // the measurement Chamber III's window is sized from.
  const latencyMs = nowMs - session.lastRespondedAtMs;

  if (session.machine.phase === "ENTRY" || session.machine.phase === "LOBBY") {
    throw errors.noSession();
  }
  if (session.machine.chamber !== "airlock" || !session.airlock) {
    throw errors.staleTool();
  }
  if (!LEVER_IDS.has(leverId)) {
    throw errors.invalidInput("lever_id", "one of lever_a, lever_b, lever_c", leverId);
  }

  const before = session.airlock;
  if (airlock.isSolved(before)) {
    // The door is already open. Free rather than an error: this can only
    // happen on a retried call after a dropped response, not a mistake.
    return { session, events: [], toolText: "The door is already open." };
  }

  // Wasted per doc 07 §2.2: computable exactly from what KEEPER's own view
  // already told it. The SHARED "pulled" history means a repeat of a lever
  // already tried could not possibly succeed and was known not to before the
  // call. A first pull of either untried lever is never wasted: from KEEPER's
  // zero-VISUAL-information view, both are equally plausible.
  const wasted = before.pulled.includes(leverId);

  const keeperViewHash = projectedHash(airlock.facts(before), "KEEPER");
  const after = airlock.pull(before, leverId);
  const solved = airlock.isSolved(after);
  const correct = leverId === airlock.correctLever(before.params);

  let machine = session.machine;
  if (solved) machine = transition(machine, { type: "CHAMBER_SOLVED" });

  const chamber = {
    id: "airlock" as const,
    facts: airlock.facts,
    candidates: airlock.candidates,
    correctAction: airlock.correctAction,
  };

  const events: SessionEvent[] = [
    {
      t: elapsed(session, nowMs),
      seq: session.seq,
      type: "tool_call",
      tool: "pull_lever",
      input: { lever_id: leverId },
      result: "ok",
      latencyMs,
      keeperViewHash,
      concordBits: concordBits(chamber, after),
      wasted,
    },
  ];
  if (solved) {
    events.push({
      t: elapsed(session, nowMs),
      seq: session.seq + 1,
      type: "chamber_solved",
      chamber: "airlock",
    });
  }

  const next: PersistedSession = {
    ...session,
    airlock: after,
    machine,
    observedLatencyMs: [...session.observedLatencyMs, latencyMs],
    seq: session.seq + events.length,
    lastRespondedAtMs: nowMs,
  };

  const toolText = correct
    ? "The lever clunks home. Bolts run back. The door to the Signal Room is open."
    : "The chamber vents with a hiss. That was not the correct lever. Ask PILOT again.";

  return { session: next, events, toolText };
}
