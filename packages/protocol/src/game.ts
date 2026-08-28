/**
 * Session vocabulary: chambers, phases, difficulty and the failure states
 * (doc 02 sections 3 and 7, doc 05 section 4).
 *
 * Failure states are named after concurrency bugs, which is not a joke that
 * wore off: the server genuinely runs a single-permit semaphore, and naming
 * the timer expiry DEADLOCK is the same pun the project is named for.
 */

/** The four chambers, in the order they are played. */
export type ChamberId = "airlock" | "signal_room" | "blind_panel" | "concord_lock";

/**
 * Chamber order. The Archive sits between `blind_panel` and `concord_lock` but
 * is not a chamber, because it has no win condition and cannot be failed. It
 * is a phase instead.
 */
export const CHAMBER_ORDER: readonly ChamberId[] = [
  "airlock",
  "signal_room",
  "blind_panel",
  "concord_lock",
] as const;

/** Display names, used in the HUD, in `get_status` and in the session log. */
export const CHAMBER_NAMES: Readonly<Record<ChamberId, string>> = {
  airlock: "CHAMBER 0 - THE AIRLOCK",
  signal_room: "CHAMBER I - THE SIGNAL ROOM",
  blind_panel: "CHAMBER II - THE BLIND PANEL",
  concord_lock: "CHAMBER III - THE CONCORD LOCK",
} as const;

/** The chamber after `id`, or null when `id` is the last one. */
export function nextChamber(id: ChamberId): ChamberId | null {
  const at = CHAMBER_ORDER.indexOf(id);
  return CHAMBER_ORDER[at + 1] ?? null;
}

/**
 * The session state machine (doc 05 section 4).
 *
 * `ENTRY` is the landing page, where the registry holds exactly one tool. The
 * separation from `LOBBY` matters: it is what makes the front door a real
 * state rather than a rendering detail, and `begin_shift` is the only edge
 * between them.
 */
export type Phase =
  | "ENTRY"
  | "LOBBY"
  | "IN_CHAMBER"
  | "PENALISED"
  | "TRANSITIONING"
  | "ARCHIVE"
  | "FINALE"
  | "ESCAPED"
  | "DEADLOCK";

/** Every phase, for exhaustiveness tests over the state machine. */
export const PHASES: readonly Phase[] = [
  "ENTRY",
  "LOBBY",
  "IN_CHAMBER",
  "PENALISED",
  "TRANSITIONING",
  "ARCHIVE",
  "FINALE",
  "ESCAPED",
  "DEADLOCK",
] as const;

/** Phases from which no further transition is possible. */
export const TERMINAL_PHASES: readonly Phase[] = ["ESCAPED"] as const;

/**
 * The failure states, named after concurrency bugs (doc 02 section 7).
 *
 * None of them ever loses the whole run. Failure always rewinds to the start
 * of the current chamber, because punishing a fifteen-minute investment with a
 * full restart would be hostile and would make benchmark runs far more
 * expensive than they need to be.
 */
export type FailureState = "DEADLOCK" | "RACE_CONDITION" | "LOCKOUT";

/** Difficulty presets (doc 02 section 7). */
export type Difficulty = "practice" | "relaxed" | "standard" | "deadline";

/**
 * How each preset scales the pressure.
 *
 * `standard` is the benchmark configuration and every multiplier is 1, so a
 * reported number always means the same thing. `practice` disables the timer
 * entirely, which serves learning, accessibility, and the benchmark's
 * reasoning-isolation runs at once.
 */
export interface DifficultySettings {
  /** Multiplier on every chamber timer. `null` means no timer at all. */
  readonly timerScale: number | null;
  /** Multiplier on Chamber II's gauge drift toward zero. */
  readonly driftScale: number;
  /** Multiplier on time penalties for invalid actions. */
  readonly penaltyScale: number;
}

export const DIFFICULTIES: Readonly<Record<Difficulty, DifficultySettings>> = {
  practice: { timerScale: null, driftScale: 0, penaltyScale: 0 },
  relaxed: { timerScale: 1.5, driftScale: 0.5, penaltyScale: 0.5 },
  standard: { timerScale: 1, driftScale: 1, penaltyScale: 1 },
  deadline: { timerScale: 0.7, driftScale: 1.5, penaltyScale: 1 },
} as const;

/**
 * Session length. BRIEF drops Chamber II and abridges the Archive, landing
 * around ten minutes instead of sixteen. It exists because fifteen minutes is
 * a lot to ask of a judge under review load, and the short path still contains
 * the trust puzzle and the finale.
 */
export type SessionMode = "full" | "brief";

/** Chambers played in each mode. */
export const MODE_CHAMBERS: Readonly<Record<SessionMode, readonly ChamberId[]>> = {
  full: CHAMBER_ORDER,
  brief: ["airlock", "signal_room", "concord_lock"],
} as const;

/**
 * Base chamber timers in milliseconds, before the difficulty multiplier.
 * Targets and rationale are in doc 02 section 3.
 */
export const CHAMBER_TIMER_MS: Readonly<Record<ChamberId, number>> = {
  airlock: 180_000,
  signal_room: 300_000,
  blind_panel: 360_000,
  concord_lock: 360_000,
} as const;

/** Resolve a chamber's timer under a preset. `null` means untimed. */
export function timerFor(chamber: ChamberId, difficulty: Difficulty): number | null {
  const scale = DIFFICULTIES[difficulty].timerScale;
  return scale === null ? null : Math.round(CHAMBER_TIMER_MS[chamber] * scale);
}

/**
 * Everything the client is allowed to render, as pushed over the session
 * socket (doc 05 section 1).
 *
 * This is the PILOT half of the design law. `facts` is the output of
 * `projectForPilot` over the active chamber and nothing else, so a fact tagged
 * `TACTILE` or `HIDDEN` is structurally unable to reach a frame. The machine
 * fields beside it are `SHARED` by construction: both parties always know
 * which room they are in and how long is left.
 *
 * `remainingMs` rather than the deadline, for the same reason the tool
 * responses carry it that way: a client with a skewed clock must not be able
 * to turn its own skew into the game's problem.
 */
/**
 * Who wrote a line on the shared notepad.
 *
 * The distinction comes from `SubmitEvent.agentInvoked`, which is how the
 * declarative API tells a form submitted by an agent from one submitted by a
 * hand (doc 03 section 8). It is what lets the pad show each line in its
 * writer's channel colour, and it is the only place in the game where the two
 * parties write into the same object.
 */
export type NoteAuthor = "PILOT" | "KEEPER";

/**
 * One line on the shared notepad.
 *
 * Notes are `SHARED` by construction rather than by projection: each one was
 * written by one of the two parties for the other to read, so there is no
 * channel to enforce and nothing for `projectForPilot` to strip. That is why
 * they sit beside `designation` on the view rather than inside `facts`.
 */
export interface Note {
  readonly text: string;
  readonly author: NoteAuthor;
  /** Milliseconds since session start, matching the log's own clock. */
  readonly atMs: number;
}

/** The longest line the pad accepts. Doc 03 section 8: one or two sentences. */
export const NOTE_MAX_LENGTH = 240;

/**
 * How many lines the pad holds before the oldest scrolls off.
 *
 * A cap rather than unbounded growth, because every note rides on `PilotView`
 * and `PilotView` is pushed on every state change. An uncapped pad would make
 * a chatty session's frames grow without limit for the whole of it.
 */
export const NOTE_CAPACITY = 20;

export interface PilotView {
  readonly phase: Phase;
  readonly chamber: ChamberId | null;
  /**
   * Which chambers this session is playing, so the cutaway knows how many
   * floors the station has.
   *
   * `SHARED` by construction: both parties are told the session length when it
   * starts, and BRIEF drops Chamber II. Without it the client would have to
   * guess, and a station drawn with a floor nobody will ever enter is a
   * station promising a room that does not exist.
   */
  readonly mode: SessionMode;
  readonly designation: string | null;
  /** Milliseconds left on this chamber's deadline, or null when untimed. */
  readonly remainingMs: number | null;
  /** How many times the current chamber has been reset after a deadlock. */
  readonly retries: number;
  /** `projectForPilot` of the active chamber's facts. Empty outside a chamber. */
  readonly facts: Readonly<Record<string, unknown>>;
  /** The shared notepad, oldest first. Empty until somebody writes. */
  readonly notes: readonly Note[];
}
