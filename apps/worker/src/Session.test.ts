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

import { describe, expect, it } from "vitest";
import { timerFor, type SessionEvent } from "@semaphore/protocol";
import { Session, type Env } from "./Session.js";
import { newSession, reduce, type PersistedSession } from "./reducer.js";
import { readAllEvents } from "./log.js";

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
