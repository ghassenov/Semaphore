/**
 * Chamber III, THE CONCORD LOCK (doc 02 section 3.4).
 *
 * The finale, and the only chamber where both parties act at the same time.
 * PILOT grips a release bar, which arms the lock and starts a stamina window
 * draining; while it is armed, KEEPER must land three bolt alignments and
 * then speak the passphrase. Losing the grip resets the bolts, so the pair
 * has to talk about how much time is left ("I can hold maybe six more
 * seconds") rather than racing a single instant.
 *
 * ## The passphrase is uniform random letters, and that is a correctness fix
 *
 * Doc 02 section 3.4's worked example is `"XLI XMHI XYVRW"`, which
 * deciphers at offset 4 to `THE TIDE TURNS`. That example, taken literally,
 * **destroys the chamber's own asymmetry claim**: of the 26 possible
 * decryptions exactly one is English, so any agent that knows English (or
 * can run frequency analysis) recovers the passphrase with no help from
 * PILOT at all. The published figure of 26 consistent worlds and 4.70 bits
 * would be false: the real figure for an English plaintext is one world and
 * zero bits, in the last chamber a judge sees.
 *
 * So the passphrase is generated as **uniform random letters**, in groups,
 * which makes every one of the 26 decryptions equally meaningless. No offset
 * is distinguishable from any other by any amount of language modelling,
 * because there is no language in it. The offset genuinely has to come from
 * PILOT reading the cipher wheel, which is what doc 02 intended and what the
 * bits figure claims. Recorded as D-014.
 *
 * ## What narrows the world set
 *
 * KEEPER perceives the ciphertext (`TACTILE`) and the list of phrases
 * already attempted (`SHARED`). Every offset produces a different candidate
 * passphrase from the same ciphertext, so all 26 stay live until one is
 * tried and rejected. A wrong attempt eliminates exactly one, which is real
 * narrowing, and it costs a 30-second lockout **and re-enciphers at a new
 * offset**, which is what stops enumeration being a strategy: the mapping
 * from offset to candidate changes, though the eliminated passphrases stay
 * eliminated, so the agent grinds down 26 candidates at 30 seconds each
 * against a 6-minute timer.
 */

import { audible, hidden, shared, tactile, visual, type Tagged } from "@semaphore/protocol";
import type { Rng } from "@semaphore/seed";

/** How many bolts must be aligned, in order, before the passphrase is spoken. */
export const BOLT_COUNT = 3;
export type BoltId = 1 | 2 | 3;
export const BOLTS: readonly BoltId[] = [1, 2, 3];

/** Groups and letters per group in a station passphrase. */
const PASSPHRASE_GROUPS = 2;
const PASSPHRASE_GROUP_LENGTH = 4;

/** Doc 02 section 3.4: a wrong passphrase seals the door for 30 seconds. */
export const LOCKOUT_MS = 30_000;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The one thing that never changes across a session: the passphrase itself. */
export interface ConcordLockParams {
  /** Uniform random letters, in groups. HIDDEN: nobody's to see. */
  readonly passphrase: string;
}

export interface ConcordLockState {
  readonly params: ConcordLockParams;
  /**
   * The Caesar offset shown on the cipher wheel. `VISUAL`: only PILOT can
   * read it, and only while standing at the wheel. Changes on every lockout.
   */
  readonly cipherOffset: number;
  /** Bolts aligned so far, 0 to BOLT_COUNT. Reset to 0 whenever the grip is lost. */
  readonly boltsAligned: number;
  /** Server clock when PILOT gripped the bar, or null when not armed. */
  readonly armedAtMs: number | null;
  /**
   * How long a grip lasts, derived at runtime from the agent's observed
   * rhythm (doc 05 section 6, `latency.ts`) rather than hardcoded, so the
   * finale works for a fast model and a slow one alike.
   */
  readonly staminaWindowMs: number;
  /** Server clock until which the door is sealed after a wrong passphrase. */
  readonly lockedOutUntilMs: number | null;
  /** Every phrase already spoken and rejected. SHARED: both parties know. */
  readonly attemptedPhrases: readonly string[];
  readonly solved: boolean;
}

/** Shift one letter forward through the alphabet, wrapping. Non-letters pass through. */
function shiftLetter(letter: string, by: number): string {
  const index = ALPHABET.indexOf(letter);
  if (index < 0) return letter;
  return ALPHABET[(index + by + ALPHABET.length * 2) % ALPHABET.length] as string;
}

/** Encipher plaintext at an offset. */
export function encipher(plaintext: string, offset: number): string {
  return [...plaintext].map((c) => shiftLetter(c, offset)).join("");
}

/** Decipher ciphertext at an offset. The exact inverse of `encipher`. */
export function decipher(ciphertext: string, offset: number): string {
  return [...ciphertext].map((c) => shiftLetter(c, -offset)).join("");
}

/**
 * Generate a passphrase and an initial offset.
 *
 * Letters are drawn uniformly, deliberately (see the module docstring): a
 * pronounceable or English passphrase would let an agent pick the "real"
 * decryption out of the 26 and skip PILOT entirely.
 */
export function generate(rng: Rng): { params: ConcordLockParams; cipherOffset: number } {
  const groups: string[] = [];
  for (let g = 0; g < PASSPHRASE_GROUPS; g++) {
    let group = "";
    for (let i = 0; i < PASSPHRASE_GROUP_LENGTH; i++) {
      group += ALPHABET[rng.int(ALPHABET.length)] as string;
    }
    groups.push(group);
  }
  // The full 0-25 range, matching doc 02 section 3.4's 26 worlds and 4.70
  // bits. Offset 0 (ciphertext equal to plaintext) is included deliberately:
  // with a uniform-random passphrase it is indistinguishable from any other
  // offset, since the plaintext is no more meaningful than any shift of it.
  // Excluding it to avoid "looking like a bug" would only be necessary for an
  // English passphrase, which is exactly what D-014 removed.
  return { params: { passphrase: groups.join(" ") }, cipherOffset: rng.int(ALPHABET.length) };
}

/** Fresh state. `staminaWindowMs` comes from the session's observed latency. */
export function initial(
  params: ConcordLockParams,
  cipherOffset: number,
  staminaWindowMs: number,
): ConcordLockState {
  return {
    params,
    cipherOffset,
    boltsAligned: 0,
    armedAtMs: null,
    staminaWindowMs,
    lockedOutUntilMs: null,
    attemptedPhrases: [],
    solved: false,
  };
}

/** What KEEPER reads through `read_ciphertext`. */
export function ciphertext(state: ConcordLockState): string {
  return encipher(state.params.passphrase, state.cipherOffset);
}

/** Milliseconds of grip remaining, or null when not armed. */
export function staminaRemainingMs(state: ConcordLockState, nowMs: number): number | null {
  if (state.armedAtMs === null) return null;
  return Math.max(0, state.staminaWindowMs - (nowMs - state.armedAtMs));
}

/** Whether the lock is armed *right now*: gripped, and stamina not yet exhausted. */
export function isArmed(state: ConcordLockState, nowMs: number): boolean {
  const remaining = staminaRemainingMs(state, nowMs);
  return remaining !== null && remaining > 0;
}

/** Whether the door is currently sealed after a wrong passphrase. */
export function isLockedOut(state: ConcordLockState, nowMs: number): boolean {
  return state.lockedOutUntilMs !== null && nowMs < state.lockedOutUntilMs;
}

/**
 * Apply the time-based effects that happen without anyone calling anything:
 * a grip that has run out of stamina drops (resetting the bolts), and an
 * expired lockout clears.
 *
 * Every action calls this first, so state is always evaluated as of `nowMs`
 * rather than as of whenever the last call happened. Keeping these effects
 * derived from timestamps rather than driven by a timer tick is what lets
 * the whole chamber stay pure and testable without a Durable Object alarm.
 */
export function settle(state: ConcordLockState, nowMs: number): ConcordLockState {
  let next = state;
  if (next.armedAtMs !== null && !isArmed(next, nowMs)) {
    // Stamina ran out: the grip slips, and the bolts fall back (doc 02 §3.4).
    next = { ...next, armedAtMs: null, boltsAligned: 0 };
  }
  if (next.lockedOutUntilMs !== null && nowMs >= next.lockedOutUntilMs) {
    next = { ...next, lockedOutUntilMs: null };
  }
  return next;
}

/** PILOT grips the release bar, arming the lock. */
export function grip(state: ConcordLockState, nowMs: number): ConcordLockState {
  const settled = settle(state, nowMs);
  if (settled.solved || isLockedOut(settled, nowMs) || isArmed(settled, nowMs)) return settled;
  return { ...settled, armedAtMs: nowMs, boltsAligned: 0 };
}

/** PILOT lets go. The bolts fall back, exactly as running out of stamina does. */
export function release(state: ConcordLockState, nowMs: number): ConcordLockState {
  const settled = settle(state, nowMs);
  if (settled.armedAtMs === null) return settled;
  return { ...settled, armedAtMs: null, boltsAligned: 0 };
}

/** The bolt that would advance the array next, or null when all are aligned. */
export function nextBolt(state: ConcordLockState): BoltId | null {
  return state.boltsAligned >= BOLT_COUNT ? null : ((state.boltsAligned + 1) as BoltId);
}

/**
 * KEEPER aligns a bolt. Only advances while armed and in order; anything
 * else leaves the array untouched, which the reducer reports as an error
 * rather than a silent no-op.
 */
export function alignBolt(
  state: ConcordLockState,
  boltId: BoltId,
  nowMs: number,
): ConcordLockState {
  const settled = settle(state, nowMs);
  if (!isArmed(settled, nowMs) || boltId !== nextBolt(settled)) return settled;
  return { ...settled, boltsAligned: settled.boltsAligned + 1 };
}

/** Whether a spoken phrase would open the door: correct, armed, and all bolts aligned. */
export function wouldOpen(state: ConcordLockState, phrase: string, nowMs: number): boolean {
  return (
    isArmed(state, nowMs) &&
    state.boltsAligned >= BOLT_COUNT &&
    normalise(phrase) === normalise(state.params.passphrase)
  );
}

/** Compare phrases on letters alone, so spacing and case never decide the finale. */
export function normalise(phrase: string): string {
  return phrase.toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * KEEPER speaks a phrase: the game's one irreversible action.
 *
 * A correct phrase with the bolts aligned opens the door. A wrong one seals
 * it for 30 seconds and re-enciphers at a new offset, so beat 1 must be
 * redone. `rng` supplies the new offset, keeping re-encipherment seeded and
 * therefore replayable.
 */
export function speakPassphrase(
  state: ConcordLockState,
  phrase: string,
  nowMs: number,
  rng: Rng,
): ConcordLockState {
  const settled = settle(state, nowMs);
  if (wouldOpen(settled, phrase, nowMs)) {
    return { ...settled, solved: true, armedAtMs: null };
  }

  // Wrong, or spoken before the bolts were ready: either way it is spent.
  // Re-encipher at a different offset, never the same one, so PILOT always
  // has something new to read off the wheel.
  const offsets = Array.from({ length: ALPHABET.length }, (_, i) => i).filter(
    (o) => o !== settled.cipherOffset,
  );
  const nextOffset = offsets[rng.int(offsets.length)] as number;

  const attempted = normalise(phrase);
  return {
    ...settled,
    cipherOffset: nextOffset,
    lockedOutUntilMs: nowMs + LOCKOUT_MS,
    armedAtMs: null,
    boltsAligned: 0,
    attemptedPhrases: attempted
      ? [...new Set([...settled.attemptedPhrases, attempted])]
      : settled.attemptedPhrases,
  };
}

export function isSolved(state: ConcordLockState): boolean {
  return state.solved;
}

/**
 * The remaining answer: the passphrase itself, per D-011's whole-plan rule.
 * Once KEEPER knows it, the bolts and the bar are mechanical.
 */
export function correctAction(state: ConcordLockState): string | null {
  return state.solved ? null : normalise(state.params.passphrase);
}

/** The sound of the last thing that happened, heard by both through the door. */
function lastSound(state: ConcordLockState, nowMs: number): string | null {
  if (state.solved) return "twelve bolts running back in sequence";
  if (isLockedOut(state, nowMs)) return "a klaxon, and the wheel spinning to a new setting";
  if (isArmed(state, nowMs)) return "the lock humming under tension";
  return null;
}

/**
 * The chamber's facts. This is the first chamber where a `VISUAL` fact
 * (`cipherOffset`) and a `TACTILE` one (`ciphertext`) have to be combined
 * across the gap to produce a single answer, which is why doc 06 calls it
 * the moment amber and cyan finally meet at one object.
 */
export function facts(state: ConcordLockState, nowMs: number) {
  return {
    /** PILOT reads the wheel. The offset the whole chamber turns on. */
    cipherOffset: visual(state.cipherOffset),
    /** KEEPER reads the enciphered passphrase. */
    ciphertext: tactile(ciphertext(state)),
    /** Both see the bolt array. */
    boltsAligned: shared(state.boltsAligned),
    /** Both know whether the lock is under tension. */
    armed: shared(isArmed(state, nowMs)),
    /** Both watch the same countdown; it is what they talk about. */
    staminaRemainingMs: shared(staminaRemainingMs(state, nowMs)),
    /** Both know how long a grip lasts this session. */
    staminaWindowMs: shared(state.staminaWindowMs),
    /** Both know the door is sealed, and for how long. */
    lockedOutUntilMs: shared(state.lockedOutUntilMs),
    /** Both know what has already been tried and rejected. */
    attemptedPhrases: shared(state.attemptedPhrases),
    /** Both hear the lock. */
    lastSound: audible(lastSound(state, nowMs)),
    /** The answer, perceivable by neither. */
    passphrase: hidden(state.params.passphrase),
  } satisfies Record<string, Tagged<unknown>>;
}

/**
 * Every world consistent with the ciphertext KEEPER can read.
 *
 * One candidate per offset: each implies a different passphrase, all of
 * which encipher to the *same* observed ciphertext, so KEEPER cannot tell
 * them apart. Offsets whose implied passphrase has already been tried and
 * rejected are excluded, which is the narrowing a wrong guess buys.
 *
 * Play state (bolts, grip, lockout) is carried across unchanged: it is
 * entirely `SHARED`, so it is identical in every candidate by construction
 * and cannot distinguish between them.
 */
export function candidates(state: ConcordLockState): ConcordLockState[] {
  const observed = ciphertext(state);
  const rejected = new Set(state.attemptedPhrases);
  const out: ConcordLockState[] = [];

  for (let offset = 0; offset < ALPHABET.length; offset++) {
    const passphrase = decipher(observed, offset);
    if (rejected.has(normalise(passphrase))) continue;
    out.push({ ...state, params: { passphrase }, cipherOffset: offset });
  }
  return out;
}
