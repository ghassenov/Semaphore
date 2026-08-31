/**
 * The Durable Object shell's own behaviour: the parts that cannot be reached
 * through the pure reducer.
 *
 * Only the alarm is exercised here. Everything else `Session` does is a thin
 * translation of `reduce()` to HTTP and is covered far better by
 * `reducer.test.ts`, which needs no Durable Object at all. The alarm is the
 * one piece of game behaviour that exists *because* of the runtime, so it is
 * the one piece that has to be tested against it.
 *
 * The runtime here is a small in-memory fake rather than a real workerd
 * instance, following `log.test.ts`: the logic under test is "does the alarm
 * settle and persist the session", not "does Cloudflare store bytes".
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { timerFor, type PilotView, type SessionEvent } from "@semaphore/protocol";
import { Session, type Env } from "./Session.js";
import { newSession, reduce, type PersistedSession } from "./reducer.js";
import { readAllEvents } from "./log.js";
import { correctLever } from "./chambers/airlock.js";

const SESSION_ID = "s_alarm";

/** An in-memory stand-in for `DurableObjectStorage`, with the alarm slot the DO owns. */
function fakeStorage() {
  const raw = new Map<string, unknown>();
  let alarmAt: number | null = null;
  return {
    raw,
    get alarmAt() {
      return alarmAt;
    },
    async get<T>(key: string) {
      return raw.get(key) as T | undefined;
    },
    async put(key: string, value: unknown) {
      raw.set(key, value);
    },
    async list({ prefix }: { prefix: string }) {
      const out = new Map<string, unknown>();
      for (const [key, value] of raw) if (key.startsWith(prefix)) out.set(key, value);
      return out;
    },
    async setAlarm(at: number) {
      alarmAt = at;
    },
    async deleteAlarm() {
      alarmAt = null;
    },
  };
}

type FakeStorage = ReturnType<typeof fakeStorage>;

/**
 * A socket that records what was pushed to it.
 *
 * `throws` covers the one case the broadcast has to survive: a connection that
 * died between the runtime handing it back and the send landing.
 */
class FakeSocket {
  readonly sent: string[] = [];
  constructor(readonly throws = false) {}
  send(frame: string): void {
    if (this.throws) throw new Error("socket is closed");
    this.sent.push(frame);
  }
  close(): void {}
}

/** The last frame a socket received, parsed. */
function lastFrame(socket: FakeSocket): PilotView {
  return JSON.parse(socket.sent.at(-1)!) as PilotView;
}

/**
 * A `Session` over the fake, pre-seeded with a persisted session record.
 *
 * Awaits the constructor's `blockConcurrencyWhile` load before handing the
 * object back, which is the guarantee the real runtime gives and a plain
 * `new` in a test does not: without it the object is returned with its state
 * still unloaded and every method sees a session that is not there yet.
 */
async function sessionOver(
  storage: FakeStorage,
  persisted: PersistedSession | null,
  sockets: FakeSocket[] = [],
): Promise<Session> {
  if (persisted) storage.raw.set("meta", persisted);
  let loaded: Promise<void> = Promise.resolve();
  const state = {
    storage,
    id: { name: SESSION_ID, toString: () => SESSION_ID },
    blockConcurrencyWhile: (fn: () => Promise<void>) => {
      loaded = fn();
      return loaded;
    },
    // The hibernation API, which is the only socket bookkeeping `Session`
    // has: it accepts, and later asks the runtime who is still connected.
    acceptWebSocket: (socket: FakeSocket) => sockets.push(socket),
    getWebSockets: () => sockets,
  } as unknown as DurableObjectState;
  const env = { SESSIONS_DB: null } as unknown as Env;
  const session = new Session(state, env);
  await loaded;
  return session;
}

/** A session sitting in the airlock, with a live deadline. */
function inAirlock(startedAtMs: number): PersistedSession {
  const begun = reduce(
    newSession(SESSION_ID, SESSION_ID, startedAtMs),
    { type: "begin_shift", designation: "KEEPER" },
    startedAtMs,
  ).session;
  return reduce(begun, { type: "start", difficulty: "standard", mode: "full" }, startedAtMs)
    .session;
}

describe("the Session alarm", () => {
  it("deadlocks a session whose timer ran out with nobody calling", async () => {
    const started = Date.now() - timerFor("airlock", "standard")! - 1;
    const storage = fakeStorage();
    const session = await sessionOver(storage, inAirlock(started));

    await session.alarm();

    const persisted = storage.raw.get("meta") as PersistedSession;
    expect(persisted.machine.phase).toBe("DEADLOCK");
    expect(persisted.chamberDeadlineMs).toBeNull();
  });

  it("writes the failure to the log, so the replay has a stamped moment", async () => {
    const started = Date.now() - timerFor("airlock", "standard")! - 1;
    const storage = fakeStorage();
    await (await sessionOver(storage, inAirlock(started))).alarm();

    const events = await readAllEvents(storage);
    expect(events).toMatchObject([{ type: "failure", failure: "DEADLOCK", chamber: "airlock" }]);
  });

  it("clears its own alarm once there is no deadline left to watch", async () => {
    const started = Date.now() - timerFor("airlock", "standard")! - 1;
    const storage = fakeStorage();
    await storage.setAlarm(started);
    await (await sessionOver(storage, inAirlock(started))).alarm();
    expect(storage.alarmAt).toBeNull();
  });

  it("does nothing when it fires with time still on the clock", async () => {
    const storage = fakeStorage();
    const live = inAirlock(Date.now());
    await (await sessionOver(storage, live)).alarm();

    expect((storage.raw.get("meta") as PersistedSession).machine.phase).toBe("IN_CHAMBER");
    expect(await readAllEvents(storage)).toEqual([] as SessionEvent[]);
  });

  it("does nothing at all for a Durable Object with no session yet", async () => {
    const storage = fakeStorage();
    await (await sessionOver(storage, null)).alarm();
    expect(storage.raw.size).toBe(0);
  });
});

describe("the alarm the request path arms", () => {
  it("is pinned to the live chamber deadline after an action", async () => {
    const storage = fakeStorage();
    const session = await sessionOver(storage, null);

    await session.fetch(
      new Request("https://x/session/s/begin_shift", {
        method: "POST",
        body: JSON.stringify({ designation: "KEEPER" }),
      }),
    );
    await session.fetch(
      new Request("https://x/session/s/start", {
        method: "POST",
        body: JSON.stringify({ difficulty: "standard", mode: "full" }),
      }),
    );

    const persisted = storage.raw.get("meta") as PersistedSession;
    expect(persisted.chamberDeadlineMs).not.toBeNull();
    expect(storage.alarmAt).toBe(persisted.chamberDeadlineMs);
  });

  it("carries no alarm in Practice, which is untimed", async () => {
    const storage = fakeStorage();
    const session = await sessionOver(storage, null);

    await session.fetch(
      new Request("https://x/session/s/begin_shift", {
        method: "POST",
        body: JSON.stringify({ designation: "KEEPER" }),
      }),
    );
    await session.fetch(
      new Request("https://x/session/s/start", {
        method: "POST",
        body: JSON.stringify({ difficulty: "practice", mode: "full" }),
      }),
    );

    expect(storage.alarmAt).toBeNull();
  });
});

/**
 * PILOT's view feed.
 *
 * The upgrade itself is exercised against a stub `WebSocketPair`, because the
 * question here is "does `Session` accept, greet and push", not "does workerd
 * implement WebSockets". Everything below that is real: the frames asserted on
 * are the actual `pilotView` output of the actual reduced session.
 */
describe("the view socket", () => {
  /**
   * Run the upgrade under a stub `WebSocketPair`, which workerd provides as a
   * global constructor and Node does not.
   *
   * The `101` response itself is swallowed: `new Response(null, { status: 101 })`
   * is the required workerd idiom and Node's `Response` rejects the status
   * outright. That is a limitation of the harness, not of the code, and it is
   * not what any of these tests assert on - the greeting is sent before the
   * response is built, so every assertion below is still against real
   * behaviour. The status is covered by `wrangler deploy --dry-run` and by
   * opening the page.
   */
  async function connect(session: Session): Promise<void> {
    const pair = [new FakeSocket(), new FakeSocket()];
    const previous = (globalThis as Record<string, unknown>).WebSocketPair;
    (globalThis as Record<string, unknown>).WebSocketPair = function () {
      return pair;
    };
    try {
      await session.fetch(
        new Request("https://x/session/s/socket", { headers: { upgrade: "websocket" } }),
      );
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
    } finally {
      (globalThis as Record<string, unknown>).WebSocketPair = previous;
    }
  }

  it("refuses a plain request to the socket route", async () => {
    const session = await sessionOver(fakeStorage(), inAirlock(Date.now()));
    const response = await session.fetch(new Request("https://x/session/s/socket"));
    expect(response.status).toBe(426);
  });

  it("greets a new connection with the current view, so a late joiner renders", async () => {
    const sockets: FakeSocket[] = [];
    const session = await sessionOver(fakeStorage(), inAirlock(Date.now()), sockets);

    await connect(session);

    expect(sockets).toHaveLength(1);
    const view = lastFrame(sockets[0]!);
    expect(view.phase).toBe("IN_CHAMBER");
    expect(view.chamber).toBe("airlock");
    expect(view.facts).toHaveProperty("glyphByLever");
  });

  it("never puts a KEEPER-only fact on the wire", async () => {
    const sockets: FakeSocket[] = [];
    const session = await sessionOver(fakeStorage(), inAirlock(Date.now()), sockets);
    await connect(session);

    const frame = sockets[0]!.sent.at(-1)!;
    expect(frame).not.toContain("leverFeel");
    expect(frame).not.toContain("correctLever");
  });

  it("pushes the new view after an action, without the client asking", async () => {
    const sockets: FakeSocket[] = [];
    const storage = fakeStorage();
    const session = await sessionOver(storage, inAirlock(Date.now()), sockets);
    await connect(session);
    const before = sockets[0]!.sent.length;

    const state = storage.raw.get("meta") as PersistedSession;
    await session.fetch(
      new Request("https://x/session/s/pull_lever", {
        method: "POST",
        body: JSON.stringify({ lever_id: correctLever(state.airlock!.params) }),
      }),
    );

    // Solving the airlock auto-advances into the Signal Room inside one
    // `reduce()`, so the pushed frame is the next room rather than the solved
    // one. That is the point of pushing whole views: the client cannot infer
    // where it is from what it just did.
    expect(sockets[0]!.sent.length).toBe(before + 1);
    const view = lastFrame(sockets[0]!);
    expect(view.chamber).toBe("signal_room");
    expect(view.facts).toHaveProperty("glyphByKey");
  });

  it("pushes the deadlock the alarm found, which is the frame nobody asked for", async () => {
    const sockets: FakeSocket[] = [];
    const started = Date.now() - timerFor("airlock", "standard")! - 1;
    const session = await sessionOver(fakeStorage(), inAirlock(started), sockets);
    await connect(session);

    await session.alarm();

    expect(lastFrame(sockets[0]!).phase).toBe("DEADLOCK");
  });

  it("reaches every connected client", async () => {
    const sockets: FakeSocket[] = [new FakeSocket(), new FakeSocket()];
    const storage = fakeStorage();
    const session = await sessionOver(storage, inAirlock(Date.now()), sockets);

    const state = storage.raw.get("meta") as PersistedSession;
    await session.fetch(
      new Request("https://x/session/s/pull_lever", {
        method: "POST",
        body: JSON.stringify({ lever_id: correctLever(state.airlock!.params) }),
      }),
    );

    for (const socket of sockets) expect(socket.sent).toHaveLength(1);
  });

  it("does not let a dead socket break the call that triggered the push", async () => {
    const alive = new FakeSocket();
    const storage = fakeStorage();
    const session = await sessionOver(storage, inAirlock(Date.now()), [
      new FakeSocket(true),
      alive,
    ]);

    const state = storage.raw.get("meta") as PersistedSession;
    const response = await session.fetch(
      new Request("https://x/session/s/pull_lever", {
        method: "POST",
        body: JSON.stringify({ lever_id: correctLever(state.airlock!.params) }),
      }),
    );

    expect(response.status).toBe(200);
    expect(alive.sent).toHaveLength(1);
  });
});

describe("the CONCORD route", () => {
  /** A GET against a session, returning the parsed body. */
  async function read(session: Session, path: string): Promise<Record<string, unknown>> {
    const response = await session.fetch(
      new Request(`https://station.example/session/${SESSION_ID}/${path}`),
    );
    return (await response.json()) as Record<string, unknown>;
  }

  it("measures the ambiguity KEEPER is actually left with", async () => {
    const storage = fakeStorage();
    const session = await sessionOver(storage, inAirlock(1_000));
    const body = await read(session, "concord");

    // Chamber 0 opens with three levers and three courses of action, which is
    // log2(3) bits. The failure card quotes courses of action, not worlds.
    expect(body).toMatchObject({ chamber: "airlock", worlds: 6, actions: 3 });
    expect(body.bits).toBeCloseTo(Math.log2(3), 2);
  });

  it("drops to certainty once the room is solved", async () => {
    const storage = fakeStorage();
    const start = inAirlock(1_000);
    const solved = reduce(
      start,
      { type: "pull_lever", leverId: correctLever(start.airlock!.params) },
      2_000,
    ).session;
    const session = await sessionOver(storage, solved);

    // Solving the airlock auto-advances into the next room, so what this
    // asserts is that the meter followed the machine rather than staying
    // pinned to the room that was just left.
    const body = await read(session, "concord");
    expect(body.chamber).toBe("signal_room");
    expect(body.bits).not.toBeNull();
  });

  it("reports nothing at all outside a chamber", async () => {
    // `machine.chamber` outlives the room (D-025). A meter that read it alone
    // would keep reporting the Blind Panel while the pair is in the Archive.
    const storage = fakeStorage();
    const start = inAirlock(1_000);
    const parked: PersistedSession = {
      ...start,
      machine: { ...start.machine, phase: "ARCHIVE" },
    };
    const session = await sessionOver(storage, parked);

    expect(await read(session, "concord")).toEqual({
      chamber: "airlock",
      bits: null,
      worlds: null,
      actions: null,
    });
  });

  it("refuses before there is a session, with text an agent can act on", async () => {
    const storage = fakeStorage();
    const session = await sessionOver(storage, null);
    const response = await session.fetch(
      new Request(`https://station.example/session/${SESSION_ID}/concord`),
    );
    expect(response.status).toBe(409);
  });

  it("changes nothing, so the HUD can poll it as often as it likes", async () => {
    // A read that takes the semaphore or moves the deadline would make the
    // meter itself a source of E_BUSY, punishing the pair for looking at it.
    const storage = fakeStorage();
    const before = inAirlock(1_000);
    const session = await sessionOver(storage, before);
    for (let i = 0; i < 5; i += 1) await read(session, "concord");
    expect(storage.raw.get("meta")).toEqual(before);
    expect(storage.alarmAt).toBeNull();
  });
});

describe("the notepad routes", () => {
  /**
   * A session in the airlock, already begun, with a live deadline.
   *
   * `Date.now()` rather than a fixed epoch: every mutating route settles the
   * session against the real clock first, so a session started at t=1000 has
   * been deadlocked for decades by the time the test posts to it, and the
   * write is answered with the deadlock text and a cheerful 200.
   */
  function withNotes(notes: PersistedSession["notes"]): PersistedSession {
    return { ...inAirlock(Date.now()), notes };
  }

  async function get(session: Session, path: string): Promise<string> {
    const response = await session.fetch(
      new Request(`https://station.example/session/${SESSION_ID}/${path}`),
    );
    const body = (await response.json()) as { content?: { text?: string }[] };
    return String(body.content?.[0]?.text ?? "");
  }

  async function post(session: Session, path: string, body: unknown): Promise<Response> {
    return session.fetch(
      new Request(`https://station.example/session/${SESSION_ID}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  it("reads back every line with its author and when it was written", async () => {
    const session = await sessionOver(
      fakeStorage(),
      withNotes([
        { text: "lever_b carries the spiral", author: "PILOT", atMs: 12_000 },
        { text: "Spiral is 4 strokes.", author: "KEEPER", atMs: 30_000 },
      ]),
    );
    const text = await get(session, "notes");
    expect(text).toContain("[12s] PILOT: lever_b carries the spiral");
    expect(text).toContain("[30s] KEEPER: Spiral is 4 strokes.");
  });

  it("tells an agent what to do with a blank pad rather than returning nothing", async () => {
    const session = await sessionOver(fakeStorage(), withNotes([]));
    expect(await get(session, "notes")).toContain("write_note");
  });

  it("writes a line and pushes the new pad to every viewer", async () => {
    // The pad is on the frame, so PILOT sees KEEPER's line appear without
    // asking. That is the whole reason it is server-side.
    const socket = new FakeSocket();
    const session = await sessionOver(fakeStorage(), withNotes([]), [socket]);
    const response = await post(session, "write_note", {
      text: "the page is scratched over",
      author: "PILOT",
    });

    expect(response.ok).toBe(true);
    expect(lastFrame(socket).notes).toEqual([
      { text: "the page is scratched over", author: "PILOT", atMs: expect.any(Number) },
    ]);
  });

  it("attributes an unrecognised author to PILOT", async () => {
    // The client asserts the author from `SubmitEvent.agentInvoked` and
    // nothing here can verify it. A human hand is the safer default to show:
    // the worst a forged author buys is a line in the wrong colour.
    const socket = new FakeSocket();
    const session = await sessionOver(fakeStorage(), withNotes([]), [socket]);
    await post(session, "write_note", { text: "who wrote this", author: "SOMEONE_ELSE" });
    expect(lastFrame(socket).notes[0]?.author).toBe("PILOT");
  });

  it("refuses a blank line with text an agent can act on", async () => {
    const session = await sessionOver(fakeStorage(), withNotes([]));
    const response = await post(session, "write_note", { text: "  ", author: "KEEPER" });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { content?: { text?: string }[] };
    expect(String(body.content?.[0]?.text)).toMatch(/text/i);
  });

  it("changes nothing when read", async () => {
    const storage = fakeStorage();
    const before = withNotes([{ text: "held", author: "KEEPER", atMs: 1 }]);
    const session = await sessionOver(storage, before);
    await get(session, "notes");
    expect(storage.raw.get("meta")).toEqual(before);
  });
});

/**
 * The corpus row is written by hand, so it can drift from the schema by hand.
 *
 * `deep_linked` is why this test exists. `?chamber=N` fast-forwards a fresh
 * session so a judge can be shown a later room, and `skipTo` raises the same
 * `CHAMBER_SOLVED` events a real solve does - so `chambers_cleared` counts
 * them. The reducer records `deepLinked` precisely so that, in its own words,
 * "the benchmark's corpus, the ablation and any future leaderboard" can tell a
 * demonstration from a run. It never reached D1: no column, no field on
 * `SessionStartEvent` so it was not recoverable from the log either, and no
 * gate on the insert. The flag existed and protected nothing, and every test
 * passed, because the only thing that could have noticed is the agreement
 * between two files that nothing compared.
 *
 * Comparing them is cheap and catches the whole class rather than the one case.
 */
describe("the insert that writes a finished session", () => {
  const here = import.meta.dirname;

  /** Every column of `sessions`, in schema order, across all migrations. */
  function schemaColumns(): string[] {
    const dir = join(here, "..", "migrations");
    const columns: string[] = [];
    for (const file of readdirSync(dir).sort()) {
      const sql = readFileSync(join(dir, file), "utf8").replace(/--[^\n]*/g, "");
      const created = /CREATE TABLE[^(]*sessions\s*\(([\s\S]*?)\n\s*\)/i.exec(sql);
      if (created) {
        for (const line of created[1]!.split(",")) {
          const name = line.trim().split(/\s+/)[0];
          if (name) columns.push(name);
        }
      }
      for (const added of sql.matchAll(/ALTER TABLE\s+sessions\s+ADD COLUMN\s+(\w+)/gi)) {
        columns.push(added[1]!);
      }
    }
    return columns;
  }

  /** The column list and placeholder count of the INSERT in `Session.ts`. */
  function insertShape(): { columns: string[]; placeholders: number } {
    const source = readFileSync(join(here, "Session.ts"), "utf8");
    const statement = /INSERT INTO sessions([\s\S]*?)`/i.exec(source)?.[1] ?? "";
    const columns = (/\(([\s\S]*?)\)\s*VALUES/i.exec(statement)?.[1] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const values = /VALUES\s*\(([^)]*)\)/i.exec(statement)?.[1] ?? "";
    return { columns, placeholders: values.split(",").filter((v) => v.trim() === "?").length };
  }

  it("names every column the schema has", () => {
    expect([...insertShape().columns].sort()).toEqual([...schemaColumns()].sort());
  });

  it("binds one value per column", () => {
    const { columns, placeholders } = insertShape();
    expect(placeholders).toBe(columns.length);
  });

  it("carries deep_linked, which is what says a session was not earned", () => {
    expect(schemaColumns()).toContain("deep_linked");
    expect(insertShape().columns).toContain("deep_linked");
  });
});
