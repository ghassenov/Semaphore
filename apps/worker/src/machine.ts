/**
 * The session state machine (doc 05 section 4).
 *
 * One explicit machine, no implicit state anywhere. `transition` is pure: it
 * takes a state and an event and either returns the next state or throws,
 * never mutating its argument and never consulting a clock or storage. That
 * is what makes it exhaustively testable without a Durable Object.
 *
 *         ENTRY --BEGIN_SHIFT--> LOBBY --START--> IN_CHAMBER
 *    IN_CHAMBER --INVALID_ACTION--> PENALISED --PENALTY_RESOLVED--> IN_CHAMBER
 *    IN_CHAMBER --CHAMBER_SOLVED--> ARCHIVE (only after blind_panel) or TRANSITIONING
 *       ARCHIVE --ARCHIVE_COMPLETE--> TRANSITIONING
 * TRANSITIONING --TRANSITION_COMPLETE--> IN_CHAMBER (next chamber) or FINALE (last one)
 *        FINALE --DOOR_OPENED--> ESCAPED
 *    IN_CHAMBER, PENALISED --TIMER_EXPIRED--> DEADLOCK
 *      DEADLOCK --RETRY--> IN_CHAMBER
 */

import { MODE_CHAMBERS, type ChamberId, type Phase, type SessionMode } from "@semaphore/protocol";

/** The chamber whose solve triggers the diegetic Archive beat (doc 02 section 4). */
const ARCHIVE_TRIGGER: ChamberId = "blind_panel";

export interface MachineState {
  readonly phase: Phase;
  /** `null` before a chamber has started, and again once the run is over. */
  readonly chamber: ChamberId | null;
  readonly mode: SessionMode;
  /**
   * How many times the *current* chamber has been retried after DEADLOCK.
   *
   * Doc 02 section 7: the first retry preserves the seed, because Chamber II's
   * dial mapping is hard-won empirical knowledge and re-rolling it would be
   * pure punishment. A second retry re-randomises. This counter is what a
   * reducer checks to decide which behaviour applies; the machine itself does
   * not touch the seed.
   */
  readonly retries: number;
}

export type MachineEvent =
  | { readonly type: "BEGIN_SHIFT" }
  | { readonly type: "START"; readonly mode: SessionMode }
  | { readonly type: "INVALID_ACTION" }
  | { readonly type: "PENALTY_RESOLVED" }
  | { readonly type: "CHAMBER_SOLVED" }
  | { readonly type: "ARCHIVE_COMPLETE" }
  | { readonly type: "TRANSITION_COMPLETE" }
  | { readonly type: "DOOR_OPENED" }
  | { readonly type: "TIMER_EXPIRED" }
  | { readonly type: "RETRY" };

/** Thrown when an event has no legal handling from the current phase. */
export class IllegalTransitionError extends Error {
  constructor(
    readonly phase: Phase,
    readonly event: MachineEvent["type"],
  ) {
    super(`Cannot handle ${event} while in ${phase}`);
    this.name = "IllegalTransitionError";
  }
}

/** The state of a session that has not yet called `begin_shift`. */
export const INITIAL_STATE: MachineState = {
  phase: "ENTRY",
  chamber: null,
  mode: "full",
  retries: 0,
};

/** Apply one event. Returns the next state, or throws `IllegalTransitionError`. */
export function transition(state: MachineState, event: MachineEvent): MachineState {
  switch (state.phase) {
    case "ENTRY":
      if (event.type === "BEGIN_SHIFT") return { ...state, phase: "LOBBY" };
      break;

    case "LOBBY":
      if (event.type === "START") {
        const chambers = MODE_CHAMBERS[event.mode];
        const first = chambers[0];
        if (!first) throw new Error(`Session mode "${event.mode}" has no chambers`);
        return { phase: "IN_CHAMBER", chamber: first, mode: event.mode, retries: 0 };
      }
      break;

    case "IN_CHAMBER":
      if (event.type === "INVALID_ACTION") return { ...state, phase: "PENALISED" };
      if (event.type === "TIMER_EXPIRED") return { ...state, phase: "DEADLOCK" };
      if (event.type === "CHAMBER_SOLVED") {
        return { ...state, phase: state.chamber === ARCHIVE_TRIGGER ? "ARCHIVE" : "TRANSITIONING" };
      }
      break;

    case "PENALISED":
      if (event.type === "PENALTY_RESOLVED") return { ...state, phase: "IN_CHAMBER" };
      if (event.type === "TIMER_EXPIRED") return { ...state, phase: "DEADLOCK" };
      break;

    case "ARCHIVE":
      if (event.type === "ARCHIVE_COMPLETE") return { ...state, phase: "TRANSITIONING" };
      break;

    case "TRANSITIONING":
      if (event.type === "TRANSITION_COMPLETE") return transitionOut(state);
      break;

    case "FINALE":
      if (event.type === "DOOR_OPENED") {
        return { phase: "ESCAPED", chamber: null, mode: state.mode, retries: 0 };
      }
      break;

    case "DEADLOCK":
      if (event.type === "RETRY") {
        if (!state.chamber) throw new Error("Reached DEADLOCK with no chamber to retry");
        return { ...state, phase: "IN_CHAMBER", retries: state.retries + 1 };
      }
      break;

    case "ESCAPED":
      // Terminal. Every event is illegal, including a repeated DOOR_OPENED.
      break;
  }
  throw new IllegalTransitionError(state.phase, event.type);
}

/** Leaving TRANSITIONING: the next chamber in this session's mode, or FINALE. */
function transitionOut(state: MachineState): MachineState {
  if (!state.chamber) throw new Error("Reached TRANSITIONING with no chamber recorded");
  const chambers = MODE_CHAMBERS[state.mode];
  const at = chambers.indexOf(state.chamber);
  const next = chambers[at + 1];
  if (next) return { ...state, phase: "IN_CHAMBER", chamber: next, retries: 0 };
  return { phase: "FINALE", chamber: null, mode: state.mode, retries: 0 };
}

/** Whether the first `RETRY` from `DEADLOCK` for this chamber should keep the seed. */
export function preservesSeed(state: MachineState): boolean {
  return state.retries === 1;
}

/**
 * The seed a chamber is generated from on entry, and on every retry after a
 * DEADLOCK.
 *
 * Doc 02 section 7: the first retry preserves the seed, because a chamber's
 * hard-won empirical knowledge (Chamber II's dial mapping above all) would be
 * pure punishment to re-roll. A second retry re-randomises. `preservesSeed`
 * is the single definition of which retry that is; a first entry, with no
 * retries at all, trivially uses the base seed.
 *
 * Lives here rather than in the reducer because two callers now need it and
 * only one of them mutates: the reducer generates a chamber from it, and
 * `manual.ts` derives the Signal Room's vandalism flag from it so the manual
 * reads the same before the room is entered as it does inside it.
 */
export function chamberSeed(seed: string, chamber: ChamberId, state: MachineState): string {
  const preserved = state.retries === 0 || preservesSeed(state);
  return preserved ? `${seed}:${chamber}` : `${seed}:${chamber}:retry${state.retries}`;
}
