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
 * The station's audible vocabulary: what a mechanism sounds like when it moves.
 *
 * Defined here, in the package both parties share, for the same reason the
 * channel tags are: the server decides what happened and the client decides
 * what it sounds like, and a vocabulary held separately at each end is a
 * vocabulary that drifts. The chambers emit one of these on the `AUDIBLE`
 * channel beside the prose subtitle, from the same branch, so the sound PILOT
 * hears and the line PILOT reads can never describe different events.
 *
 * `detent` is the one that carries a count, and it is the only one that is
 * puzzle-critical: doc 02 section 3.3 has PILOT counting clicks through the
 * grate to learn what KEEPER's rotation actually registered. The count travels
 * as the Blind Panel's own `lastClicks` fact rather than beside the cue,
 * because that fact already exists and already means exactly this.
 */
export type Cue =
  /** A lever seating, and bolts running back. The Airlock opening. */
  | "clunk"
  /** Air venting hard through a valve. The Airlock's wrong lever. */
  | "hiss"
  /** One brass key accepted. */
  | "chime"
  /** A ring settling: the long, low resolution of a solved chamber. */
  | "resolve"
  /** An alarm. A wrong key, or the Concord Lock throwing itself out. */
  | "klaxon"
  /** One click of a dial, felt through a grate. Counted. */
  | "detent"
  /** Twelve bolts running back in sequence. The outer door. */
  | "bolts"
  /** A lock holding under tension. Continuous, not a one-shot. */
  | "hum";

/** Every cue, for exhaustiveness checks and for the client's synth table. */
export const CUES: readonly Cue[] = [
  "clunk",
  "hiss",
  "chime",
  "resolve",
  "klaxon",
  "detent",
  "bolts",
  "hum",
] as const;

/** Whether `value` is one of the station's cues. */
export function isCue(value: unknown): value is Cue {
  return typeof value === "string" && (CUES as readonly string[]).includes(value);
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

/**
 * One moment of a ghost session, as PILOT perceives it (doc 02 section 4).
 *
 * The Archive is the asymmetry mechanic applied to the archive itself: KEEPER
 * reads what the ghost KEEPER called, PILOT watches where the ghost PILOT
 * walked, and neither half is sufficient. This type is PILOT's half, and its
 * whole design constraint is what it may **not** carry. A `tool_call` event is
 * `TACTILE`: it belongs to `read_station_log` and reaches the monitor through
 * no field here, not even as a count. What is left is what a person standing
 * in the ghost's room would have seen: which room they were in, and what their
 * hands did.
 *
 * `move` beats are the doors between rooms rather than footsteps. PILOT's
 * position is client-local and never logged, so the walk between two beats is
 * interpolated by the replay rather than recorded: the log knows the ghost
 * gripped the release bar, not the path they took to it.
 */
export interface GhostBeat {
  /** Milliseconds since the ghost's session started. The replay's clock. */
  readonly t: number;
  /** Entering a room, getting out of one, or doing something with your hands. */
  readonly kind: "enter" | "solved" | "action";
  /** The room, for `enter` and `solved`. Null on an action. */
  readonly chamber: ChamberId | null;
  /** What the hands did, for `action`. Absent otherwise. */
  readonly action?: "move" | "inspect" | "grip" | "release" | "write_note";
  /** What they did it to. A device, a door, or the author of a note. */
  readonly target?: string;
}

/**
 * A whole ghost session, reduced to what the Archive's monitor may show.
 *
 * Built by `pilotTrack` on the server, from the same JSONL the benchmark
 * consumes, so the monitor and `read_station_log` are two projections of one
 * log rather than two authored assets that can disagree.
 */
export interface GhostTrack {
  /** The name the ghost's agent gave itself. Recorded, so it has a name. */
  readonly designation: string;
  /** When the last beat lands, so the replay knows how long it runs. */
  readonly durationMs: number;
  readonly beats: readonly GhostBeat[];
  /**
   * How the ghost's log ends.
   *
   * `cut` is the one that matters: the log stops mid-attempt with no
   * `session_end` line at all (doc 02 section 4, "the log ends mid-call"). It
   * is a literal absence, so it is reported as one rather than dressed up as a
   * failure the log never recorded.
   */
  readonly outcome: "escaped" | "abandoned" | "deadlocked" | "cut";
}

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
  /**
   * The ghost playing on the Archive's monitor, or null everywhere else.
   *
   * On the view rather than fetched by the client, so it travels the same
   * socket every other rendered fact does and passes the same projection
   * boundary. A client that fetched the ghost log for itself would be reaching
   * around `projectForPilot` to get it, which is the one thing the design law
   * forbids however convenient it looks.
   */
  readonly ghost: GhostTrack | null;
  /**
   * How many events this session has logged so far.
   *
   * Strictly increasing across every mutating action, because every one of
   * them writes at least a `tool_call` event before anything else happens.
   *
   * It is on the view so the client can tell a repeated **fact** from a
   * repeated **event**, which nothing else here can do. The `AUDIBLE` channel
   * is the reason: KEEPER rotating a dial twice and registering three clicks
   * each time produces two frames whose facts are identical in every field,
   * and PILOT has to hear six detents, not three. Doc 02 section 3.3 makes
   * that count puzzle-critical, so "sound it only when something changed" is
   * not an option here.
   *
   * It carries no channel of its own and leaks nothing: KEEPER already knows
   * how many calls it has made, and a count of events says nothing about what
   * any of them touched.
   */
  readonly seq: number;
}
