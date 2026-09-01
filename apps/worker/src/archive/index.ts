/**
 * The Archive beat (doc 02 section 4): the transition between Chambers II
 * and III, where a prior pair's session log is read.
 *
 * **Not a chamber.** There is no `HIDDEN` secret here and no possible-worlds
 * proof: doc 02 is explicit that reading the log "is not itself a puzzle."
 * What it is instead is the asymmetry mechanic applied to the archive:
 * KEEPER reads what the ghost KEEPER called (`TACTILE`, `keeperEntries`);
 * PILOT watches where the ghost PILOT walked (`VISUAL`, `pilotTrack`).
 * Neither half is sufficient on its own, which is the point, and the two
 * halves are two filters over one log rather than two authored assets.
 *
 * **Temporary placement, documented as such.** Doc 03 section 7 specifies
 * `read_station_log` as a tool on the cross-origin archive origin, reading a
 * static asset with no Durable Object involved at all. `apps/archive` does
 * not exist yet, so this module and the reducer action built on it live here
 * for now, so the Archive beat is real and testable before that origin is
 * built. When `apps/archive` lands, this logic moves there and the
 * reducer's role shrinks to just recognising that the beat is complete.
 */

import type { GhostBeat, GhostTrack, SessionEvent, ToolCallEvent } from "@semaphore/protocol";
import { GHOST_01 } from "./ghost-01.js";

/** The one ghost session shipped for the submission (doc 08's cut order). */
export const GHOST_LOG: readonly SessionEvent[] = GHOST_01;

/**
 * What KEEPER's half of the archive reads: every tool call the ghost KEEPER
 * made, in order. Doc 02 section 4: "KEEPER reads what the ghost KEEPER
 * called." Filtered from the full log, which also carries the ghost
 * PILOT's `pilot_action` events, those belong to the replay renderer's
 * `VISUAL` half, not to this tool.
 */
export function keeperEntries(log: readonly SessionEvent[]): readonly ToolCallEvent[] {
  return log.filter((event): event is ToolCallEvent => event.type === "tool_call");
}

/**
 * The ghost as the gate screen draws it: both halves of one log, side by side.
 *
 * **The one place in the repository that hands out both projections at once**,
 * and it is safe for a reason that has to be stated rather than assumed:
 * nobody is playing. There is no session behind `/ghost`, no pair for either
 * half to be leaked to, and the fixture's own seed was spent when it was
 * authored. In a live session this would be the single worst change anybody
 * could make - `pilotTrack` and `keeperEntries` are a matched pair, and
 * widening either hands one party the other's half.
 *
 * What it buys is the thesis as one picture. A judge who never types anything
 * sees a room with a person walking in it beside a list of tool calls with a
 * hole where the room would be, on one clock, and does not need the paragraph
 * underneath. Doc 07 section 6: for some judges the gate screen *is* the
 * submission.
 *
 * The KEEPER half is trimmed to the fields the picture uses. A tool's whole
 * event carries `keeperViewHash` and `concordBits`, which mean nothing on a
 * monitor and would triple the payload of a route that is fetched by every
 * visitor before anything else loads.
 */
export function ghostForGate(): {
  track: GhostTrack | null;
  keeper: readonly { t: number; tool: string; wasted: boolean }[];
} {
  return {
    track: pilotTrack(GHOST_LOG),
    keeper: keeperEntries(GHOST_LOG).map((call) => ({
      t: call.t,
      tool: call.tool,
      wasted: call.wasted,
    })),
  };
}

/** One entry, formatted as text a tool response can return, or a range hint if out of bounds. */
export function describeEntry(log: readonly SessionEvent[], entry: number): string {
  const entries = keeperEntries(log);
  if (entry < 1 || entry > entries.length) {
    return `There are ${entries.length} entries in this log. Call again with entry 1 to ${entries.length}.`;
  }
  const call = entries[entry - 1] as ToolCallEvent;
  const outcome = call.wasted ? "wasted" : "landed";
  return (
    `Entry ${entry} of ${entries.length}: the previous KEEPER called ${call.tool}` +
    `(${JSON.stringify(call.input)}). It ${outcome}. ${entry === entries.length ? "The log ends here, mid-attempt." : ""}`
  ).trim();
}

/**
 * What PILOT's half of the archive watches: the ghost session as a person
 * standing in the ghost's room would have perceived it.
 *
 * The mirror of `keeperEntries`, and the mirror is the whole design. That
 * function keeps `tool_call` and drops everything else; this one drops
 * `tool_call` and keeps what a body in the room produced. **The exclusion is
 * the mechanic, not an optimisation**: a monitor that showed the ghost's tool
 * calls would hand PILOT KEEPER's half and there would be nothing left for the
 * pair to reconstruct together.
 *
 * `state_delta` is dropped too, and less obviously. Those events carry raw
 * `WorldState` paths, which include `HIDDEN` fields like the Blind Panel's
 * mapping; they are the replay viewer's business, behind a projection, and
 * they have no business on a screen PILOT reads directly.
 */
export function pilotTrack(log: readonly SessionEvent[]): GhostTrack | null {
  const start = log.find((event) => event.type === "session_start");
  if (start === undefined) return null;

  const beats: GhostBeat[] = [];
  for (const event of log) {
    if (event.type === "chamber_enter" || event.type === "chamber_solved") {
      beats.push({
        t: event.t,
        kind: event.type === "chamber_enter" ? "enter" : "solved",
        chamber: event.chamber,
      });
    } else if (event.type === "pilot_action") {
      beats.push({
        t: event.t,
        kind: "action",
        chamber: null,
        action: event.action,
        target: event.target,
      });
    }
  }

  const end = log.find((event) => event.type === "session_end");
  return {
    designation: start.designation,
    // The last event of the whole log, not the last beat. A ghost whose final
    // minute was all KEEPER's calls still spent that minute in the room, and a
    // replay that stopped at PILOT's last movement would cut off exactly the
    // stretch the pair is meant to notice: the ghost holding the bar while
    // nothing else happens.
    durationMs: log.at(-1)?.t ?? 0,
    beats,
    // No `session_end` line means the log stops mid-attempt, which is what
    // doc 02 section 4 specifies and what the fixture actually contains.
    outcome: end?.outcome ?? "cut",
  };
}
