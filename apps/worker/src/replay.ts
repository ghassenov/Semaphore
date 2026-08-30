/**
 * What a finished session looks like to the replay viewer.
 *
 * Doc 08 phase 7.2. A session log is the artifact three consumers share (doc
 * 05 section 7), and this is the third one: the replay viewer reads the same
 * gzipped JSONL row in D1 that the benchmark queries and that the Archive's
 * ghosts are cut from.
 *
 * ## It is a projection, and that is not optional
 *
 * The session is over, which is exactly the argument that would justify
 * shipping the raw log, and it is wrong. `state_delta` events carry raw
 * `WorldState` paths, and those include `HIDDEN` fields: the Blind Panel's
 * dial-to-gauge permutation, the Signal Room's answer, the Concord Lock's
 * passphrase. `apps/worker/CLAUDE.md` says nothing outside the server boundary
 * may hold a `HIDDEN` field and puts no expiry on it, and `archive/index.ts`
 * already made the same call for the same events, noting that they are the
 * replay viewer's business *behind a projection*. This is that projection.
 *
 * The practical reason is stronger than the principled one anyway: a replay
 * URL is meant to be shareable (doc 08 phase 7.2), and a seed is reproducible
 * by construction (doc 05 section 9). A raw replay of seed `s` is a solution
 * key for every future session on seed `s`.
 *
 * ## What survives
 *
 * Both tracks and the trace between them, which is the whole of what the
 * viewer draws: what KEEPER called, what PILOT did and heard, where the
 * chamber boundaries fell, and the CONCORD reading at every call. None of it
 * is derived here - every field is copied off an event the reducer already
 * wrote - so a replay cannot disagree with the session it replays.
 */

import type { ChamberId, GhostTrack, SessionEvent } from "@semaphore/protocol";
import { pilotTrack } from "./archive/index.js";

/** One thing KEEPER did, on the cyan track. */
export interface ReplayCall {
  readonly t: number;
  readonly tool: string;
  readonly result: "ok" | "error";
  readonly errorCode?: string;
  readonly latencyMs: number;
  /** Whether the call told KEEPER nothing it did not already know. */
  readonly wasted: boolean;
  /** The ambiguity remaining after this call, in bits. The CONCORD trace. */
  readonly concordBits: number;
}

/** One thing PILOT did or heard, on the amber track. */
export interface ReplayBeat {
  readonly t: number;
  readonly kind: "action" | "audible";
  /** The action's target, or the cue's name. */
  readonly what: string;
  /** Detents, for a cue that carries a count. */
  readonly count?: number;
}

/** A chamber boundary, which is what divides the timeline into rooms. */
export interface ReplayChamber {
  readonly t: number;
  readonly kind: "enter" | "solved";
  readonly chamber: ChamberId;
}

/** A finished session, as much of it as may leave the server. */
export interface Replay {
  readonly sessionId: string;
  readonly designation: string;
  readonly difficulty: string;
  readonly mode: string;
  readonly outcome: string;
  readonly chambersCleared: number;
  /** How long the session ran, in milliseconds of session time. */
  readonly durationMs: number;
  readonly staminaWindowMs: number;
  readonly medianLatencyMs: number;
  readonly calls: readonly ReplayCall[];
  readonly beats: readonly ReplayBeat[];
  readonly chambers: readonly ReplayChamber[];
  /** What the pair wrote to each other, which is the only record of that. */
  readonly notes: readonly { readonly t: number; readonly text: string }[];
  /**
   * The room, as the station's own monitor draws it.
   *
   * The same `pilotTrack` the Archive's CRT plays, from the same function, so
   * "link to `/replay/:id` - the same monitor the ghosts were on" (doc 08
   * phase 3.2) is true of the code and not only of the copy. It is also
   * already a projection that drops KEEPER's calls, so nothing here widens
   * what leaves the server.
   */
  readonly track: GhostTrack | null;
}

/**
 * Project a finished session's log for the viewer.
 *
 * `state_delta` and `tool_cancel` are the two event types that do not appear.
 * The first carries `HIDDEN` state, as above. The second is dropped because an
 * aborted call is not a thing either party did: the registry took the tool
 * away underneath it, which the chamber boundary on the timeline already
 * shows, and drawing it as a KEEPER action would blame an agent for a
 * transition.
 */
export function projectReplay(log: readonly SessionEvent[]): Replay | null {
  const start = log.find((event) => event.type === "session_start");
  if (start === undefined) return null;

  const calls: ReplayCall[] = [];
  const beats: ReplayBeat[] = [];
  const chambers: ReplayChamber[] = [];
  const notes: { t: number; text: string }[] = [];
  let end: Extract<SessionEvent, { type: "session_end" }> | null = null;
  let last = start.t;

  for (const event of log) {
    last = Math.max(last, event.t);
    switch (event.type) {
      case "tool_call":
        calls.push({
          t: event.t,
          tool: event.tool,
          result: event.result,
          ...(event.errorCode ? { errorCode: event.errorCode } : {}),
          latencyMs: event.latencyMs,
          wasted: event.wasted,
          concordBits: event.concordBits,
        });
        break;
      case "pilot_action":
        beats.push({ t: event.t, kind: "action", what: event.target });
        // A note's text is the pair talking to each other, and it is the most
        // valuable thing in the log (`reducer.ts`, on why the pad is
        // server-side). The event carries the target rather than the line, so
        // the pad itself is what the viewer would need; until it carries one,
        // the beat says a note was written and not what it said.
        break;
      case "audible":
        beats.push({
          t: event.t,
          kind: "audible",
          what: event.cue,
          ...(event.count === undefined ? {} : { count: event.count }),
        });
        break;
      case "chamber_enter":
      case "chamber_solved":
        chambers.push({
          t: event.t,
          kind: event.type === "chamber_enter" ? "enter" : "solved",
          chamber: event.chamber,
        });
        break;
      case "session_end":
        end = event;
        break;
      default:
        // `state_delta` and `tool_cancel`. Deliberately nothing.
        break;
    }
  }

  return {
    sessionId: start.sessionId,
    designation: start.designation,
    difficulty: start.difficulty,
    mode: start.mode,
    outcome: end?.outcome ?? "abandoned",
    chambersCleared: end?.chambersCleared ?? chambers.filter((c) => c.kind === "solved").length,
    durationMs: Math.max(0, last - start.t),
    staminaWindowMs: end?.staminaWindowMs ?? 0,
    medianLatencyMs: end?.medianLatencyMs ?? 0,
    calls,
    beats,
    chambers,
    notes,
    track: pilotTrack(log),
  };
}
