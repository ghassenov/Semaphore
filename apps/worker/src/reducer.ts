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

import {
  errors,
  MODE_CHAMBERS,
  type ChamberId,
  type Difficulty,
  type SessionEvent,
  type SessionMode,
} from "@semaphore/protocol";
import { Rng } from "@semaphore/seed";
import * as airlock from "./chambers/airlock.js";
import * as signalRoom from "./chambers/signal_room.js";
import { projectForKeeper, projectedHash } from "./projection.js";
import { concordBits } from "./worlds.js";
import { transition, type MachineState } from "./machine.js";

/**
 * Everything the reducer needs to remember between calls.
 *
 * A strict subset of doc 05 section 3's `WorldState`, scoped to what is
 * actually implemented: Chambers 0 and I. Extending this to Chamber II means
 * adding a `blindPanel` field the same way `signalRoom` was, never widening
 * what an existing field means.
 */
export interface PersistedSession {
  readonly sessionId: string;
  readonly seed: string;
  readonly designation: string | null;
  readonly difficulty: Difficulty;
  readonly machine: MachineState;
  readonly airlock: airlock.AirlockState | null;
  readonly signalRoom: signalRoom.SignalRoomState | null;
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
    signalRoom: null,
    observedLatencyMs: [],
    seq: 0,
    startedAtMs: nowMs,
    lastRespondedAtMs: nowMs,
  };
}

export type Action =
  | { readonly type: "begin_shift"; readonly designation: string }
  | { readonly type: "start"; readonly difficulty: Difficulty; readonly mode: SessionMode }
  | { readonly type: "pull_lever"; readonly leverId: airlock.LeverId }
  | { readonly type: "press_key"; readonly keyId: signalRoom.KeyId }
  | { readonly type: "reset_sequence" };

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
    case "press_key":
      return pressKey(session, action.keyId, nowMs);
    case "reset_sequence":
      return resetSequence(session, nowMs);
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

/**
 * Chamber id to the fresh per-chamber state a newly entered chamber needs.
 *
 * Only chambers with implemented mechanics appear here. Entering any other
 * chamber id is an honest boundary, not a bug: `settleTransition` leaves the
 * machine parked at `TRANSITIONING` rather than fabricating state for a
 * chamber that does not exist yet. Each generator derives its own seed by
 * suffixing the session seed with the chamber id, so chambers draw from
 * independent random streams rather than correlated prefixes of the same one.
 */
const CHAMBER_ENTRY: Partial<
  Record<ChamberId, (session: PersistedSession) => Partial<PersistedSession>>
> = {
  airlock: (session) => ({
    airlock: airlock.initial(airlock.generate(new Rng(`${session.seed}:airlock`))),
  }),
  signal_room: (session) => ({
    signalRoom: signalRoom.initial(signalRoom.generate(new Rng(`${session.seed}:signal_room`))),
  }),
};

/**
 * After a chamber is solved and the machine reaches `TRANSITIONING`, advance
 * it the rest of the way if the next chamber's mechanics are implemented.
 * `TRANSITIONING` is a near-instantaneous machine state representing the
 * tool-swap moment (doc 05 section 4), not a state that waits for a separate
 * call, so this runs inside the same `reduce()` invocation that caused the
 * solve rather than requiring the caller to make a second request.
 */
function settleTransition(
  session: PersistedSession,
  nowMs: number,
): { session: PersistedSession; events: readonly SessionEvent[] } {
  if (session.machine.phase !== "TRANSITIONING" || !session.machine.chamber) {
    return { session, events: [] };
  }

  const chambers = MODE_CHAMBERS[session.machine.mode];
  const at = chambers.indexOf(session.machine.chamber);
  const next = chambers[at + 1];
  if (next && !CHAMBER_ENTRY[next]) return { session, events: [] }; // next chamber not built yet

  const machine = transition(session.machine, { type: "TRANSITION_COMPLETE" });
  const entry = machine.chamber ? CHAMBER_ENTRY[machine.chamber] : undefined;
  const fields = entry ? entry(session) : {};
  const advanced: PersistedSession = { ...session, ...fields, machine, seq: session.seq + 1 };

  const events: SessionEvent[] = machine.chamber
    ? [
        {
          t: elapsed(session, nowMs),
          seq: session.seq,
          type: "chamber_enter",
          chamber: machine.chamber,
        },
      ]
    : [];

  return { session: advanced, events };
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
  if (!machine.chamber) throw new Error("START produced a machine with no chamber");

  const withDifficulty = { ...session, difficulty };
  const fields = CHAMBER_ENTRY[machine.chamber]?.(withDifficulty) ?? {};
  const event: SessionEvent = {
    t: elapsed(session, nowMs),
    seq: session.seq,
    type: "chamber_enter",
    chamber: machine.chamber,
  };
  const next: PersistedSession = {
    ...withDifficulty,
    ...fields,
    machine,
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
  if (session.machine.chamber === "airlock" && session.airlock) {
    const view = projectForKeeper(airlock.facts(session.airlock));
    return (
      `THE AIRLOCK. Levers: ${JSON.stringify(view.leverPositions)}. ` +
      `Pulled so far: ${JSON.stringify(view.pulled)}. Read the manual before acting.`
    );
  }
  if (session.machine.chamber === "signal_room" && session.signalRoom) {
    const view = projectForKeeper(signalRoom.facts(session.signalRoom));
    return (
      `THE SIGNAL ROOM. Six keys, ids 1-6. Pressed so far: ${JSON.stringify(view.pressedSequence)}. ` +
      `Strikes: ${view.strikes}. Read the manual before acting.`
    );
  }
  return "No chamber is active. Call begin_shift to begin your shift.";
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

  // No "already solved" branch here: once the correct lever lands, the
  // chamber-mismatch check above already refuses any further pull_lever call
  // (settleTransition moves the machine to signal_room in the same request
  // that solves the airlock, so a call reaching this line has never seen the
  // door open). That branch existed until Chamber I's implementation made it
  // unreachable, and dead code is removed rather than kept "just in case".
  const before = session.airlock;

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

  const withUpdate: PersistedSession = {
    ...session,
    airlock: after,
    machine,
    observedLatencyMs: [...session.observedLatencyMs, latencyMs],
    seq: session.seq + events.length,
    lastRespondedAtMs: nowMs,
  };

  const settled = settleTransition(withUpdate, nowMs);
  const enteredNewChamber = settled.session.machine.chamber !== withUpdate.machine.chamber;
  const baseText = correct
    ? "The lever clunks home. Bolts run back. The door to the Signal Room is open."
    : "The chamber vents with a hiss. That was not the correct lever. Ask PILOT again.";
  const toolText = enteredNewChamber ? `${baseText} ${describeChamber(settled.session)}` : baseText;

  return { session: settled.session, events: [...events, ...settled.events], toolText };
}

function pressKey(session: PersistedSession, keyId: signalRoom.KeyId, nowMs: number): ReduceResult {
  const latencyMs = nowMs - session.lastRespondedAtMs;

  if (session.machine.phase === "ENTRY" || session.machine.phase === "LOBBY") {
    throw errors.noSession();
  }
  if (session.machine.chamber !== "signal_room" || !session.signalRoom) {
    throw errors.staleTool();
  }
  if (!signalRoom.KEYS.includes(keyId)) {
    throw errors.invalidInput("key_id", "one of 1, 2, 3, 4, 5, 6", keyId);
  }

  const before = session.signalRoom;
  if (signalRoom.isSolved(before)) {
    return {
      session,
      events: [],
      toolText: "The ring has already settled. This chamber is solved.",
    };
  }

  const target = signalRoom.correctSequence(before.params);
  const correct = keyId === target[before.pressedSequence.length];
  const wasted = signalRoom.isWasted(before, keyId);
  const raceCondition = signalRoom.isRaceCondition(before, keyId);

  const keeperViewHash = projectedHash(signalRoom.facts(before), "KEEPER");
  const after = signalRoom.press(before, keyId);
  const solved = signalRoom.isSolved(after);

  let machine = session.machine;
  if (solved) machine = transition(machine, { type: "CHAMBER_SOLVED" });

  const chamber = {
    id: "signal_room" as const,
    facts: signalRoom.facts,
    candidates: signalRoom.candidates,
    correctAction: signalRoom.correctAction,
  };

  const events: SessionEvent[] = [
    {
      t: elapsed(session, nowMs),
      seq: session.seq,
      type: "tool_call",
      tool: "press_key",
      input: { key_id: keyId },
      result: "ok",
      latencyMs,
      keeperViewHash,
      concordBits: concordBits(chamber, after),
      wasted,
    },
  ];
  // Doc 02 §3.2: three wrong presses in a row is a RACE CONDITION, logged
  // separately from the ordinary tool_call so the benchmark can count it.
  if (raceCondition) {
    events.push({
      t: elapsed(session, nowMs),
      seq: session.seq + events.length,
      type: "failure",
      failure: "RACE_CONDITION",
      chamber: "signal_room",
      concordBits: concordBits(chamber, after),
    });
  }
  if (solved) {
    events.push({
      t: elapsed(session, nowMs),
      seq: session.seq + events.length,
      type: "chamber_solved",
      chamber: "signal_room",
    });
  }

  const withUpdate: PersistedSession = {
    ...session,
    signalRoom: after,
    machine,
    observedLatencyMs: [...session.observedLatencyMs, latencyMs],
    seq: session.seq + events.length,
    lastRespondedAtMs: nowMs,
  };

  const settled = settleTransition(withUpdate, nowMs);
  const enteredNewChamber = settled.session.machine.chamber !== withUpdate.machine.chamber;
  const baseText = solved
    ? "The ring settles with a deep chime. The sequence is complete."
    : raceCondition
      ? "Three wrong presses in a row. RACE CONDITION: the sequence resets, with a heavier penalty."
      : correct
        ? "The key seats with a chime. The sequence advances."
        : "Wrong key. The ring flashes alarm-red and the sequence resets.";
  const toolText = enteredNewChamber ? `${baseText} ${describeChamber(settled.session)}` : baseText;

  return { session: settled.session, events: [...events, ...settled.events], toolText };
}

function resetSequence(session: PersistedSession, nowMs: number): ReduceResult {
  const latencyMs = nowMs - session.lastRespondedAtMs;

  if (session.machine.phase === "ENTRY" || session.machine.phase === "LOBBY") {
    throw errors.noSession();
  }
  if (session.machine.chamber !== "signal_room" || !session.signalRoom) {
    throw errors.staleTool();
  }

  const before = session.signalRoom;
  if (before.pressedSequence.length === 0 && before.strikes === 0) {
    // Free and inert, matching pull_lever's already-open precedent: nothing
    // to clear is not a mistake, just a redundant call.
    return { session, events: [], toolText: "Nothing to reset. The sequence is already empty." };
  }

  const after = signalRoom.reset(before);
  const chamber = {
    id: "signal_room" as const,
    facts: signalRoom.facts,
    candidates: signalRoom.candidates,
    correctAction: signalRoom.correctAction,
  };
  const event: SessionEvent = {
    t: elapsed(session, nowMs),
    seq: session.seq,
    type: "tool_call",
    tool: "reset_sequence",
    input: {},
    result: "ok",
    latencyMs,
    keeperViewHash: projectedHash(signalRoom.facts(before), "KEEPER"),
    concordBits: concordBits(chamber, after),
    // A deliberate reset always succeeds at what it does; "wasted" describes
    // a call that could not have succeeded, which does not apply here.
    wasted: false,
  };
  const next: PersistedSession = {
    ...session,
    signalRoom: after,
    observedLatencyMs: [...session.observedLatencyMs, latencyMs],
    seq: session.seq + 1,
    lastRespondedAtMs: nowMs,
  };
  return { session: next, events: [event], toolText: "Sequence cleared. Ready to begin again." };
}
