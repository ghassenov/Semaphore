/**
 * The session event log (doc 05 section 7).
 *
 * One append-only JSONL stream per session, one line per event. **The log is
 * the session**: the same file is the replay source, the benchmark corpus and
 * the Archive's ghosts. That is not a coincidence to be pleased about, it is
 * the reason the Archive was cheap to build, and it is why this schema is a
 * published contract rather than an internal detail. Renaming a field here
 * breaks three consumers at once.
 *
 * Every event is JSON-serialisable and free of personal data by construction.
 * A session is an opaque server-generated id plus a designation the agent
 * chose for itself, which is what makes future ARCHIVE mode (real player
 * sessions as ghosts) safe to ship.
 */

import type { ChamberId, Difficulty, FailureState, SessionMode } from "./game.js";
import type { ErrorCode } from "./errors.js";

/** Fields carried by every event, whatever its type. */
interface EventBase {
  /** Milliseconds since the session started. Server time, so it is trustworthy. */
  readonly t: number;
  /** Monotonic sequence number, so ordering survives out-of-order writes. */
  readonly seq: number;
}

/**
 * The first line of every log. Records everything needed to reproduce the
 * session exactly, which is what `?seed=` replay and fair model-versus-model
 * comparison both depend on.
 */
export interface SessionStartEvent extends EventBase {
  readonly type: "session_start";
  readonly sessionId: string;
  readonly seed: string;
  readonly difficulty: Difficulty;
  readonly mode: SessionMode;
  /** The name the agent gave itself in its first `begin_shift` call. */
  readonly designation: string;
}

/**
 * One tool call by KEEPER, with everything needed to judge it after the fact.
 *
 * `keeperViewHash` is what makes the wasted-call metric computable: it records
 * the agent's exact epistemic state at call time, so we can replay what it
 * knew and decide whether the call could possibly have succeeded. A model that
 * presses keys until one works and a model that reasons to the answer produce
 * identical completion rates and wildly different wasted-call counts, and that
 * distinction is the point of the benchmark.
 */
export interface ToolCallEvent extends EventBase {
  readonly type: "tool_call";
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly result: "ok" | "error";
  /** Present when `result` is `"error"`. */
  readonly errorCode?: ErrorCode;
  /** Round trip measured inside the action semaphore. Sizes the Chamber III window. */
  readonly latencyMs: number;
  /** Hash of `projectForKeeper(state)` at call time. */
  readonly keeperViewHash: string;
  /** Ambiguity remaining after this call, in bits. Reconstructs the CONCORD meter. */
  readonly concordBits: number;
  /** Whether the agent could have known this call would fail. */
  readonly wasted: boolean;
}

/**
 * A tool execution cancelled mid-flight through the `AbortSignal` the spec
 * hands to `execute`. We did not plan for this capability (it turned up when
 * the spec baseline was corrected, D-007), and recording cancellations is one
 * more honest thing to report about how models behave under time pressure.
 */
export interface ToolCancelEvent extends EventBase {
  readonly type: "tool_cancel";
  readonly tool: string;
  readonly elapsedMs: number;
}

/** Something PILOT did in the room. The amber track of the replay timeline. */
export interface PilotActionEvent extends EventBase {
  readonly type: "pilot_action";
  readonly action: "move" | "inspect" | "grip" | "release" | "write_note";
  readonly target: string;
  /**
   * Present only when `action` is `"write_note"`: the line itself.
   *
   * A note is `SHARED` channel by construction (`game.ts`'s `Note`, written by
   * either party and read by both), so it carries none of `state_delta`'s risk
   * of leaking a `HIDDEN` field into a shareable replay URL. Without it the
   * replay viewer's transcript could say a note was written and never what it
   * said, which was the whole reason the pad exists.
   */
  readonly text?: string;
}

/** An authoritative state change, as a path and a before and after. */
export interface StateDeltaEvent extends EventBase {
  readonly type: "state_delta";
  /** Dotted path into `WorldState`, for example `blindPanel.gaugeValues`. */
  readonly path: string;
  readonly from: unknown;
  readonly to: unknown;
}

/**
 * An `AUDIBLE`-channel event: heard by both parties, rendered differently to
 * each. Logged because it is the subtitle track for deaf players, and the
 * replay viewer and the accessibility mirror share this one implementation.
 */
export interface AudibleEvent extends EventBase {
  readonly type: "audible";
  readonly cue: string;
  /** Detent count, where the cue is countable. Puzzle-critical in Chamber II. */
  readonly count?: number;
}

/** Entering or leaving a chamber. */
export interface ChamberEvent extends EventBase {
  readonly type: "chamber_enter" | "chamber_solved";
  readonly chamber: ChamberId;
}

/** A failure, named after the concurrency bug it is named for. */
export interface FailureEvent extends EventBase {
  readonly type: "failure";
  readonly failure: FailureState;
  readonly chamber: ChamberId;
  /** Ambiguity still unresolved when the run failed, in bits. */
  readonly concordBits: number;
}

/**
 * The last line. `staminaWindowMs` is recorded because Chamber III's window is
 * derived at runtime from observed agent latency, so the benchmark has to be
 * able to control for it when comparing models.
 */
export interface SessionEndEvent extends EventBase {
  readonly type: "session_end";
  readonly outcome: "escaped" | "abandoned" | "deadlocked";
  readonly chambersCleared: number;
  readonly medianLatencyMs: number;
  readonly staminaWindowMs: number;
}

/** Any line in a session log. */
export type SessionEvent =
  | SessionStartEvent
  | ToolCallEvent
  | ToolCancelEvent
  | PilotActionEvent
  | StateDeltaEvent
  | AudibleEvent
  | ChamberEvent
  | FailureEvent
  | SessionEndEvent;

/** Serialise one event to a JSONL line, without its trailing newline. */
export function toJsonl(event: SessionEvent): string {
  return JSON.stringify(event);
}

/**
 * Parse a whole JSONL log.
 *
 * Blank lines are skipped so a trailing newline is not an error. A malformed
 * line throws with its line number rather than being silently dropped: a
 * corrupted benchmark corpus that reads as merely short is far worse than one
 * that refuses to load.
 */
export function parseJsonl(text: string): SessionEvent[] {
  const events: SessionEvent[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as SessionEvent);
    } catch (cause) {
      throw new Error(`Malformed session log at line ${i + 1}`, { cause });
    }
  }
  return events;
}
