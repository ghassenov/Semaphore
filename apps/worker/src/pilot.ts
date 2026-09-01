/**
 * The PILOT half of the projection boundary: what the client is allowed to
 * render, and nothing else.
 *
 * This module is the mirror of `views.ts`. Where that one builds every string
 * a KEEPER tool returns out of `projectForKeeper`, this one builds the single
 * structure every rendered frame derives from out of `projectForPilot`. The
 * two are kept in separate files for the same reason each is small: the design
 * law says a rendered frame may never reach around the agent's projection, and
 * that claim should be checkable by reading one file rather than by auditing a
 * large switch shared with the tool surface.
 *
 * Nothing here reads a chamber's raw state. Every fact reaches the wire only
 * through the chamber's own `facts()` and the PILOT projection of it, so a
 * field tagged `TACTILE` or `HIDDEN` cannot be rendered even by a careless
 * template later. `pilot.test.ts` asserts that for all four chambers.
 */

import type { GhostTrack, Phase, PilotView, Progress } from "@semaphore/protocol";
import { GHOST_LOG, pilotTrack } from "./archive/index.js";
import * as airlock from "./chambers/airlock.js";
import * as signalRoom from "./chambers/signal_room.js";
import * as blindPanel from "./chambers/blind_panel.js";
import * as concordLock from "./chambers/concord_lock.js";
import { objectiveFor, progressIn } from "./objective.js";
import { blackoutOpen, perceptionFor } from "./blackout.js";
import { projectForPilot } from "./projection.js";
import type { PersistedSession } from "./reducer.js";

/**
 * The machine fields both the tool responses and the socket carry.
 *
 * Phase, chamber and the clock are `SHARED` by construction, which is what
 * makes it safe for one function to feed both surfaces. Kept here rather than
 * inside `Session` so the two cannot drift into disagreeing about how much
 * time is left.
 */
export function stateSummary(
  session: PersistedSession,
  nowMs: number,
): Pick<PilotView, "phase" | "chamber" | "mode" | "designation" | "remainingMs" | "blackout"> {
  return {
    phase: session.machine.phase,
    chamber: session.machine.chamber,
    mode: session.machine.mode,
    designation: session.designation,
    // On the summary as well as on the frame, because the summary is what
    // every *tool response* carries and the tool director reads its registry
    // from it (D-021). Without it here the agent would keep a `rotate_dial` the
    // server has already started refusing, which is precisely the drift
    // between the registry and the server the rule exists to prevent.
    blackout: blackoutOpen(session),
    remainingMs:
      session.chamberDeadlineMs === null ? null : Math.max(0, session.chamberDeadlineMs - nowMs),
  };
}

/**
 * The phases in which PILOT is actually standing in the chamber.
 *
 * `machine.chamber` is not enough on its own: it stays set through `ARCHIVE`,
 * `TRANSITIONING` and `DEADLOCK` so the machine knows which room was last
 * entered, and rendering the Blind Panel behind the Archive's monitor because
 * of that would draw a room the pair is not in. `DEADLOCK` is included because
 * PILOT has to see the chamber to decide to reset it, which is a thing only
 * PILOT can do.
 */
const IN_THE_ROOM: readonly Phase[] = ["IN_CHAMBER", "PENALISED", "DEADLOCK"] as const;

/**
 * Whether the pair is standing in the chamber `machine.chamber` names.
 *
 * Exported because the CONCORD meter needs exactly the same gate the frame
 * does. A meter that keeps reporting the Blind Panel's ambiguity while the
 * pair is reading a ghost log in the Archive is reporting a room nobody is in,
 * and the fix for that is one predicate rather than two lists that drift.
 */
export function inTheRoom(phase: Phase): boolean {
  return IN_THE_ROOM.includes(phase);
}

/**
 * The active chamber's facts as PILOT perceives them.
 *
 * Empty in every phase with no room to draw: the lobby, the transitions, the
 * Archive, the finale, the end. An empty object is the honest answer there and
 * it keeps the caller free of a null check on the one field it always reads.
 */
function chamberFacts(session: PersistedSession, nowMs: number): Record<string, unknown> {
  const { chamber, phase } = session.machine;
  if (!inTheRoom(phase)) return {};
  if (chamber === "airlock" && session.airlock) {
    return projectForPilot(airlock.facts(session.airlock), perceptionFor(session));
  }
  if (chamber === "signal_room" && session.signalRoom) {
    return projectForPilot(signalRoom.facts(session.signalRoom), perceptionFor(session));
  }
  if (chamber === "blind_panel" && session.blindPanel) {
    return projectForPilot(blindPanel.facts(session.blindPanel), perceptionFor(session));
  }
  if (chamber === "concord_lock" && session.concordLock) {
    return projectForPilot(concordLock.facts(session.concordLock, nowMs), perceptionFor(session));
  }
  return {};
}

/**
 * What the room is asking for, and how far in the pair is, for PILOT.
 *
 * Both are computed from `facts` **after** it has been through
 * `projectForPilot`, never from the chamber's raw state. That is the whole
 * safety argument and it is one line long: `progressIn` cannot report a fact
 * that is not in the object it was handed, and the object it is handed is the
 * same one the frame is drawn from.
 */
function objectiveOf(
  session: PersistedSession,
  facts: Readonly<Record<string, unknown>>,
): Pick<PilotView, "objective" | "progress"> {
  const { chamber, phase } = session.machine;
  if (!chamber || !inTheRoom(phase)) return { objective: null, progress: null };
  const progress: Progress | null = progressIn(chamber, facts);
  return { objective: objectiveFor(chamber), progress };
}

/** Everything the client may render, for one session at one instant. */
export function pilotView(session: PersistedSession, nowMs: number): PilotView {
  const facts = chamberFacts(session, nowMs);
  return {
    ...stateSummary(session, nowMs),
    retries: session.machine.retries,
    facts,
    ...objectiveOf(session, facts),
    // Beside the facts, not inside them. A note is `SHARED` by construction -
    // one of the two parties wrote it for the other to read - so there is no
    // channel for `projectForPilot` to strip and nothing it could hide.
    notes: session.notes,
    // The intercom, beside the notepad and for the same reason: authored
    // `SHARED` text that KEEPER asked for and both parties were told. An
    // assist that reached only the agent would hand one party the other's
    // half of the room.
    assist: session.assist,
    // The lamps. On the frame rather than derived by the client, because three
    // separate things key on it and a client that worked it out for itself
    // would be a fourth definition of when the roles have traded.
    blackout: blackoutOpen(session),
    ghost: ghostFor(session.machine.phase),
    // The event counter, so the client can tell one rotation from the next
    // when both produce the same facts. See `PilotView.seq`.
    seq: session.seq,
  };
}

/**
 * The ghost the Archive's monitor is playing, and null in every other phase.
 *
 * Computed per call rather than cached. The track is a filter over a fixed
 * fifteen-line fixture, so the arithmetic is free, and a module-level cache
 * would be a second copy of the answer that a change to `GHOST_LOG` could
 * leave stale. Null outside the Archive because the monitor is only in that
 * one room: shipping the track on every frame of every chamber would put a
 * prior session's movements on the wire for fifteen minutes to be drawn for
 * three of them.
 */
function ghostFor(phase: Phase): GhostTrack | null {
  return phase === "ARCHIVE" ? pilotTrack(GHOST_LOG) : null;
}
