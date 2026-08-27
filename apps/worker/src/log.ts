/**
 * Persisting the session log inside a Durable Object, and flushing it to D1.
 *
 * Live events are written as individually keyed storage entries
 * (`evt:<zero-padded seq>`) rather than as one growing array under one key,
 * so an append never has to read back and rewrite the whole log so far. That
 * matters once a session is a few hundred events long: an array-under-one-key
 * design would make every single tool call cost a full-log read and a
 * full-log write.
 *
 * On session end the events are read back in order, serialised to JSONL, and
 * gzipped into the row D1 stores (doc 05 section 7, decision log D-008). That
 * row is the artifact three consumers eventually share: the replay viewer,
 * the benchmark corpus, and the Archive's ghosts.
 */

import { toJsonl, type SessionEvent } from "@semaphore/protocol";

const EVENT_KEY_WIDTH = 6; // headroom well past any session's real event count
const EVENT_PREFIX = "evt:";

/** The storage key one event is written under, ordered lexicographically by `seq`. */
export function eventKey(seq: number): string {
  return `${EVENT_PREFIX}${String(seq).padStart(EVENT_KEY_WIDTH, "0")}`;
}

/**
 * Minimal surface this module needs from `DurableObjectStorage`.
 *
 * Narrowed to exactly `put` and `list`, so the pure parts of this module can
 * be exercised in Vitest against a small fake rather than requiring a real
 * Durable Object, while `Session.ts` still passes the real storage object
 * (which satisfies this shape) unmodified.
 */
export interface EventStorage {
  put(key: string, value: unknown): Promise<void>;
  list(options: { prefix: string }): Promise<Map<string, unknown>>;
}

/** Append one event. Never reads the log so far; the key encodes the order. */
export async function appendEvent(storage: EventStorage, event: SessionEvent): Promise<void> {
  await storage.put(eventKey(event.seq), event);
}

/** Read every event back, in sequence order. */
export async function readAllEvents(storage: EventStorage): Promise<SessionEvent[]> {
  const entries = await storage.list({ prefix: EVENT_PREFIX });
  // Map iteration follows insertion order, not key order, and DO storage
  // documents key order for its own list() but this module's EventStorage
  // interface makes no such promise for a fake, so sort explicitly by key.
  return [...entries.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, value]) => value as SessionEvent);
}

/** Serialise a whole log to gzip-compressed bytes, ready for a D1 BLOB column. */
export async function gzipJsonl(events: readonly SessionEvent[]): Promise<Uint8Array> {
  const text = events.map(toJsonl).join("\n");
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}
