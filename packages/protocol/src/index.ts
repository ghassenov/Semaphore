/**
 * Shared wire vocabulary for client, worker and benchmark.
 * One definition of the channel tags and error codes — see doc 04 §6.
 */

/**
 * Which party may perceive a fact.
 *
 * Doc 04 §3 names three channels and describes a fourth, unnamed category:
 * "server-only fields, tagged with neither channel, which no projection ever
 * emits". It is spelled out here as SERVER_ONLY so the asymmetry invariant test
 * (doc 07 §1.2) can assert on a tag rather than on a code comment.
 */
export type Channel = "VISUAL" | "TOOL" | "SHARED" | "SERVER_ONLY";

export interface Tagged<T> {
  value: T;
  channel: Channel;
}

export const visual = <T>(value: T): Tagged<T> => ({ value, channel: "VISUAL" });
export const tool = <T>(value: T): Tagged<T> => ({ value, channel: "TOOL" });
export const shared = <T>(value: T): Tagged<T> => ({ value, channel: "SHARED" });
export const serverOnly = <T>(value: T): Tagged<T> => ({ value, channel: "SERVER_ONLY" });

export type ChamberId = "airlock" | "signal_room" | "blind_panel" | "concord_lock";

export type Difficulty = "practice" | "relaxed" | "standard" | "deadline";

export type Phase = "LOBBY" | "IN_CHAMBER" | "TRANSITIONING" | "PENALISED" | "ESCAPED" | "DEADLOCK";

/**
 * Error codes returned to KEEPER's tools (doc 03 §6).
 *
 * Every one must carry text an agent can actually act on — a bare rejection
 * teaches an agent nothing and produces flailing retries.
 */
export type ErrorCode =
  | "E_BUSY"
  | "E_UNREACHABLE"
  | "E_NOT_ARMED"
  | "E_WRONG_CHAMBER"
  | "E_INVALID_INPUT"
  | "E_LOCKED_OUT";

export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }
}
