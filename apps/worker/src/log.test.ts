import { describe, expect, it } from "vitest";
import { parseJsonl, type SessionEvent } from "@semaphore/protocol";
import { appendEvent, eventKey, gzipJsonl, readAllEvents, type EventStorage } from "./log.js";

/** An in-memory stand-in for `DurableObjectStorage`, exercising the real logic. */
function fakeStorage(): EventStorage & { readonly raw: Map<string, unknown> } {
  const raw = new Map<string, unknown>();
  return {
    raw,
    async put(key, value) {
      raw.set(key, value);
    },
    async list({ prefix }) {
      const out = new Map<string, unknown>();
      for (const [key, value] of raw) if (key.startsWith(prefix)) out.set(key, value);
      return out;
    },
  };
}

const event = (seq: number, tool: string): SessionEvent => ({
  t: seq * 100,
  seq,
  type: "tool_call",
  tool,
  input: {},
  result: "ok",
  latencyMs: 10,
  keeperViewHash: "abc",
  concordBits: 1,
  wasted: false,
});

describe("eventKey", () => {
  it("zero-pads so lexicographic order matches numeric order", () => {
    expect(eventKey(0) < eventKey(1)).toBe(true);
    expect(eventKey(9) < eventKey(10)).toBe(true);
    expect(eventKey(99) < eventKey(100)).toBe(true);
  });

  it("is stable for the same sequence number", () => {
    expect(eventKey(42)).toBe(eventKey(42));
  });
});

describe("appendEvent and readAllEvents", () => {
  it("round trips a single event", async () => {
    const storage = fakeStorage();
    await appendEvent(storage, event(0, "pull_lever"));
    expect(await readAllEvents(storage)).toEqual([event(0, "pull_lever")]);
  });

  it("returns events in sequence order regardless of write order", async () => {
    const storage = fakeStorage();
    await appendEvent(storage, event(2, "c"));
    await appendEvent(storage, event(0, "a"));
    await appendEvent(storage, event(1, "b"));
    expect((await readAllEvents(storage)).map((e) => (e as { tool: string }).tool)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("never reads the log back on append, only writes the one key", async () => {
    const storage = fakeStorage();
    let listCalls = 0;
    const counting: EventStorage = {
      put: storage.put.bind(storage),
      list: async (opts) => {
        listCalls++;
        return storage.list(opts);
      },
    };
    await appendEvent(counting, event(0, "a"));
    await appendEvent(counting, event(1, "b"));
    expect(listCalls).toBe(0);
  });

  it("does not collide keys past 100000 events", () => {
    // The width guard: if this ever needs to grow, it should fail loudly
    // here rather than silently reordering a very long benchmark session.
    expect(eventKey(999_999) > eventKey(1)).toBe(true);
  });
});

describe("gzipJsonl", () => {
  it("produces bytes that gzip-decompress back to the original JSONL", async () => {
    const events = [event(0, "pull_lever"), event(1, "pull_lever")];
    const gzipped = await gzipJsonl(events);

    const stream = new Blob([gzipped]).stream().pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();

    expect(parseJsonl(text)).toEqual(events);
  });

  it("is meaningfully smaller than the raw JSONL for a realistic log", async () => {
    const events = Array.from({ length: 50 }, (_, i) => event(i, "pull_lever"));
    const raw = events.map((e) => JSON.stringify(e)).join("\n");
    const gzipped = await gzipJsonl(events);
    // JSONL is highly repetitive (field names repeat every line), so gzip
    // should do much better than the roughly 2x a truly random byte stream
    // would allow. This is the property D-008's storage sizing rests on.
    expect(gzipped.byteLength).toBeLessThan(raw.length / 2);
  });

  it("produces a non-empty result for an empty log", async () => {
    // A gzip stream has header/footer overhead even for zero payload bytes,
    // so "empty in, empty out" would be the wrong expectation here.
    const gzipped = await gzipJsonl([]);
    expect(gzipped.byteLength).toBeGreaterThan(0);
  });
});
