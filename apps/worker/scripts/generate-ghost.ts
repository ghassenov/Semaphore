/**
 * Generates `fixtures/ghosts/ghost-01.jsonl` by actually playing a session
 * through the reducer, rather than hand-writing fake JSONL.
 *
 * Doc 02 section 4 promises the Archive's ghosts are "in exactly the JSONL
 * format the benchmark consumes." The only way that claim stays true as the
 * reducer evolves is to generate the fixture from the reducer itself: a
 * hand-authored file would drift the moment an event's shape changes, and
 * nobody would notice until the archive's tool response looked wrong. This
 * script is the "recorded during playtesting" doc 02 asks for, in the honest
 * form available before there are human playtesters to record.
 *
 * The scripted pair plays BRIEF mode (airlock, signal room, concord lock)
 * and the log is cut off partway through the Concord Lock, two of three
 * bolts aligned, never speaking the passphrase: "the previous pair
 * deadlocked... the log ends mid-call" (doc 02 section 4). No synthetic
 * failure event is appended; the log simply stops, which is the literal
 * reading of that line and does not require a timer implementation to exist.
 *
 * Run with `npx tsx apps/worker/scripts/generate-ghost.ts` from the repo
 * root, then `npx prettier --write apps/worker/src/archive/ghost-01.ts`
 * (this script does not format its own output). Deterministic: the same
 * seed always produces the same fixture, so regenerating after a reducer
 * change is how to notice the fixture drifted.
 */

import { writeFileSync } from "node:fs";
import { toJsonl, type SessionEvent } from "@semaphore/protocol";
import * as airlock from "../src/chambers/airlock.js";
import * as signalRoom from "../src/chambers/signal_room.js";
import { newSession, reduce, type Action, type PersistedSession } from "../src/reducer.js";

const GHOST_SESSION_ID = "ghost-01";
const GHOST_SEED = "ghost-01-seed";
const JSONL_PATH = new URL("../../../fixtures/ghosts/ghost-01.jsonl", import.meta.url);

/**
 * The Worker also gets a bundled TypeScript copy. Workers have no
 * filesystem, so `apps/worker/src/archive/ghost-01.ts` cannot read
 * `fixtures/ghosts/ghost-01.jsonl` at request time; the events have to be
 * compiled into the bundle. This is the documented, explicitly temporary
 * home for `read_station_log`'s data until `apps/archive` exists as a real
 * cross-origin static-asset origin (doc 03 section 7) and can serve the
 * JSONL file directly, which is where this content is actually specified to
 * live. Generating both from one script keeps them from drifting apart.
 */
const TS_MODULE_PATH = new URL("../src/archive/ghost-01.ts", import.meta.url);

function generate(): SessionEvent[] {
  const events: SessionEvent[] = [];
  let session: PersistedSession = newSession(GHOST_SESSION_ID, GHOST_SEED, 0);
  let now = 0;

  // Latencies are plausible round trips, not the point of the exercise; what
  // matters is that every event shape below is real reducer output.
  const step = (action: Action, latencyMs: number): void => {
    now += latencyMs;
    const result = reduce(session, action, now);
    session = result.session;
    events.push(...result.events);
  };

  step({ type: "begin_shift", designation: "WREN" }, 1200);
  step({ type: "start", difficulty: "standard", mode: "brief" }, 900);
  step({ type: "pull_lever", leverId: airlock.correctLever(session.airlock!.params) }, 4200);

  for (const key of signalRoom.correctSequence(session.signalRoom!.params)) {
    step({ type: "press_key", keyId: key }, 3100);
  }

  step({ type: "grip_bar" }, 2000);
  step({ type: "align_bolt", boltId: 1 }, 2400);
  step({ type: "align_bolt", boltId: 2 }, 2600);
  // No further call. The log ends here, mid-attempt.

  return events;
}

const events = generate();

writeFileSync(JSONL_PATH, events.map(toJsonl).join("\n") + "\n");

const tsModule = `/**
 * GENERATED FILE. Do not hand-edit.
 *
 * Produced by apps/worker/scripts/generate-ghost.ts from
 * fixtures/ghosts/ghost-01.jsonl, which is that script's real output, not
 * hand-authored fiction (see fixtures/ghosts/CLAUDE.md). Regenerate after
 * any change to SessionEvent or to the reducer's event shapes.
 *
 * Bundled here, rather than read from disk, because Workers have no
 * filesystem. This is a temporary home: doc 03 section 7 specifies
 * read_station_log as a static-asset tool on the archive origin, which
 * apps/archive does not exist to serve from yet.
 */

import type { SessionEvent } from "@semaphore/protocol";

export const GHOST_01: readonly SessionEvent[] = ${JSON.stringify(events, null, 2)};
`;
writeFileSync(TS_MODULE_PATH, tsModule);

console.log(`Wrote ${events.length} events to:`);
console.log(`  ${JSONL_PATH.pathname}`);
console.log(`  ${TS_MODULE_PATH.pathname}`);
