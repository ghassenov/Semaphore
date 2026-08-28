/**
 * The Archive beat (doc 02 section 4): the transition between Chambers II
 * and III, where a prior pair's session log is read.
 *
 * **Not a chamber.** There is no `HIDDEN` secret here and no possible-worlds
 * proof: doc 02 is explicit that reading the log "is not itself a puzzle."
 * What it is instead is the asymmetry mechanic applied to the archive:
 * KEEPER reads what the ghost KEEPER called (`TACTILE`, this module);
 * PILOT watches where the ghost PILOT walked, rendered by the replay
 * component (`VISUAL`, not built yet, tracked in NEXT-STEPS). Neither half
 * is sufficient on its own, which is the point.
 *
 * **Temporary placement, documented as such.** Doc 03 section 7 specifies
 * `read_station_log` as a tool on the cross-origin archive origin, reading a
 * static asset with no Durable Object involved at all. `apps/archive` does
 * not exist yet, so this module and the reducer action built on it live here
 * for now, so the Archive beat is real and testable before that origin is
 * built. When `apps/archive` lands, this logic moves there and the
 * reducer's role shrinks to just recognising that the beat is complete.
 */

import type { SessionEvent, ToolCallEvent } from "@semaphore/protocol";
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
