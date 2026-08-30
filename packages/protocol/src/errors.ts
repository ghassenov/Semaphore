/**
 * The error taxonomy returned to KEEPER's tools (doc 03 section 9).
 *
 * The governing rule: every failure returns text an agent can act on. A bare
 * rejection teaches an agent nothing and produces flailing retries, which cost
 * the pair time against a timer and pollute the benchmark's wasted-call metric
 * with noise that is our fault rather than the model's.
 *
 * Messages are written in the station's voice and always name both the
 * obstacle and the way past it.
 */

/**
 * Every way a tool call can fail.
 *
 * `E_STALE_TOOL` should in principle be unreachable, since a tool whose signal
 * has been aborted is no longer in the registry. It exists as a defensive
 * backstop for an agent holding a cached tool handle across a chamber
 * transition, and its message actively re-orients rather than merely
 * describing. Spec issue 262 argues that WebMCP loses semantic context when
 * tools disappear; this code is our application-layer answer to that.
 */
export type ErrorCode =
  | "E_BUSY"
  | "E_UNREACHABLE"
  | "E_NOT_ARMED"
  | "E_STALE_TOOL"
  | "E_INVALID_INPUT"
  | "E_LOCKED_OUT"
  | "E_NO_SESSION";

/** Every error code, for exhaustiveness tests. */
export const ERROR_CODES: readonly ErrorCode[] = [
  "E_BUSY",
  "E_UNREACHABLE",
  "E_NOT_ARMED",
  "E_STALE_TOOL",
  "E_INVALID_INPUT",
  "E_LOCKED_OUT",
  "E_NO_SESSION",
] as const;

/**
 * A failure that is part of the game rather than a defect.
 *
 * Carries a machine-readable code for the log and the benchmark, and a
 * human-readable message written for the agent to read and recover from.
 */
export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }

  /** Narrowing helper, since instanceof crosses realm boundaries badly. */
  static is(value: unknown): value is GameError {
    return value instanceof GameError;
  }

  /**
   * The shape a tool returns on failure.
   *
   * The code is included in the text rather than only in a field, because the
   * spec serialises tool results to a JSON string and we cannot rely on a
   * caller surfacing structure. The agent sees the code either way.
   */
  toToolResult(): { readonly content: readonly [{ type: "text"; text: string }] } {
    return { content: [{ type: "text", text: `${this.code}: ${this.message}` }] };
  }
}

/**
 * Canonical message builders.
 *
 * Centralised so the phrasing is consistent everywhere the same failure can
 * occur, and so the recoverable-message rule is checkable in one place rather
 * than trusted at every throw site.
 */
export const errors = {
  /** The action semaphore already holds its single permit (doc 05 section 5). */
  busy: (what: string): GameError =>
    new GameError("E_BUSY", `KEEPER is still ${what}. Wait for it to finish.`),

  /** A real state precondition, named with its blocker so the agent can clear it. */
  unreachable: (target: string, blocker: string): GameError =>
    new GameError("E_UNREACHABLE", `KEEPER cannot reach ${target}: ${blocker}.`),

  /** Chamber III: bolts and the passphrase only move while PILOT holds the bar. */
  notArmed: (): GameError =>
    new GameError("E_NOT_ARMED", "The lock is not armed. PILOT must be holding the release bar."),

  /**
   * A cached handle to a tool that has since been torn down. The message
   * re-orients instead of describing, because an agent that has lost the thread
   * needs a next action rather than a diagnosis.
   */
  staleTool: (): GameError =>
    new GameError(
      "E_STALE_TOOL",
      "That mechanism is behind you now. Call get_status to see where you are.",
    ),

  /**
   * Schema validation is advisory, so the real check is here (doc 03 section 3).
   *
   * An absent value is reported as the word `nothing` rather than as its own
   * rendering. Every route reads its arguments off a query string or a JSON
   * body and coerces a missing one to `""` on the way in, so an agent that
   * misspelled a parameter name - which is the common way to get here, because
   * `inspect({target})` and `inspect({object_id})` are equally plausible
   * guesses - was told `Received .`, a sentence with a hole in it that asserts
   * an empty value was sent when in fact none was. `undefined` and `null` get
   * the same treatment for the same reason: the agent needs to know the field
   * did not arrive, which is a different repair from sending a wrong one.
   */
  invalidInput: (field: string, expected: string, received: unknown): GameError => {
    const shown =
      received === undefined || received === null || received === "" ? "nothing" : String(received);
    return new GameError("E_INVALID_INPUT", `${field} must be ${expected}. Received ${shown}.`);
  },

  /** Chamber III: the penalty for speaking a wrong passphrase while armed. */
  lockedOut: (secondsRemaining: number): GameError =>
    new GameError(
      "E_LOCKED_OUT",
      `The door is sealed for ${secondsRemaining} more seconds after an incorrect passphrase.`,
    ),

  /** A tool called before begin_shift, which is the only entry point. */
  noSession: (): GameError =>
    new GameError("E_NO_SESSION", "Your shift has not started. Call begin_shift first."),
} as const;
