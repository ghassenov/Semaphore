/**
 * The `Session` Durable Object: one session's authoritative truth (doc 05
 * section 2).
 *
 * This class is deliberately thin. Every decision about what a call means is
 * made by the pure `reduce()` function in `reducer.ts`; this file's job is
 * only to load persisted state, run one action through the action semaphore,
 * persist and log what came back, and translate the result to HTTP. That
 * split is what makes the game logic testable without a Durable Object and
 * keeps this file small enough to audit by reading it once.
 *
 * Storage layout while a session is being played:
 *   "meta"        -> PersistedSession
 *   "evt:NNNNNN"  -> one SessionEvent each, via log.ts
 *
 * On reaching ESCAPED, the whole log is read back, gzipped, and written as
 * one row to D1 (decision log D-006, amended by D-008). Nothing here ever
 * touches R2: that product's free tier requires a linked payment method,
 * which this project does not use anywhere.
 */

import { GameError, errors, type ChamberId } from "@semaphore/protocol";
import { appendEvent, gzipJsonl, readAllEvents } from "./log.js";
import { newSession, reduce, type Action, type PersistedSession } from "./reducer.js";
import { ActionSemaphore } from "./semaphore.js";
import { percentile, staminaWindowMs } from "./latency.js";
import type { LeverId } from "./chambers/airlock.js";
import type { KeyId } from "./chambers/signal_room.js";

export interface Env {
  SESSIONS: DurableObjectNamespace;
  SESSIONS_DB: D1Database;
}

/** A label for the `E_BUSY` message a concurrent caller would see. */
function labelFor(action: Action): string {
  switch (action.type) {
    case "begin_shift":
      return "beginning the shift";
    case "start":
      return "entering the chamber";
    case "pull_lever":
      return "pulling a lever";
    case "press_key":
      return "pressing a key";
    case "reset_sequence":
      return "resetting the sequence";
  }
}

export class Session {
  readonly #storage: DurableObjectStorage;
  readonly #db: D1Database;
  readonly #semaphore = new ActionSemaphore();
  /**
   * The name this Durable Object was created with via `idFromName` in
   * `index.ts`, which is also the seed (doc 05 section 9). A Durable Object
   * does not otherwise know the string it was addressed by from inside
   * `fetch()`, only its opaque id; `state.id.name` is what recovers it.
   */
  readonly #sessionId: string;
  #session: PersistedSession | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.#storage = state.storage;
    this.#db = env.SESSIONS_DB;
    this.#sessionId = state.id.name ?? state.id.toString();
    state.blockConcurrencyWhile(async () => {
      this.#session = (await this.#storage.get<PersistedSession>("meta")) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname.endsWith("/status")) return this.#status();
    if (request.method !== "POST") return new Response("Not found", { status: 404 });

    if (pathname.endsWith("/begin_shift")) {
      const body = (await request.json()) as { designation?: unknown };
      return this.#act({ type: "begin_shift", designation: String(body.designation ?? "") });
    }
    if (pathname.endsWith("/start")) {
      const body = (await request.json()) as { difficulty?: unknown; mode?: unknown };
      return this.#act({
        type: "start",
        difficulty: (body.difficulty as PersistedSession["difficulty"] | undefined) ?? "standard",
        mode: (body.mode as "full" | "brief" | undefined) ?? "full",
      });
    }
    if (pathname.endsWith("/pull_lever")) {
      const body = (await request.json()) as { lever_id?: unknown };
      return this.#act({ type: "pull_lever", leverId: String(body.lever_id ?? "") as LeverId });
    }
    if (pathname.endsWith("/press_key")) {
      const body = (await request.json()) as { key_id?: unknown };
      return this.#act({ type: "press_key", keyId: Number(body.key_id ?? 0) as KeyId });
    }
    if (pathname.endsWith("/reset_sequence")) {
      return this.#act({ type: "reset_sequence" });
    }

    return new Response("Not found", { status: 404 });
  }

  /**
   * Ensure a session record exists. Idempotent: once `#session` is loaded
   * (from storage in the constructor, or created here), later calls in the
   * same lifetime return it unchanged. Kept out of the constructor because a
   * Durable Object constructor must not perform I/O outside
   * `blockConcurrencyWhile`, and creating a record is a decision `#act` needs
   * to make per request, not per instance.
   */
  async #ensureSession(): Promise<PersistedSession> {
    if (this.#session) return this.#session;
    const created = newSession(this.#sessionId, this.#sessionId, Date.now());
    this.#session = created;
    await this.#storage.put("meta", created);
    return created;
  }

  /**
   * Run one mutating action end to end: load, reduce under the semaphore,
   * persist, log, and respond. Every branch that can fail as part of the
   * game itself (a `GameError`) maps to a `409` with text the agent can act
   * on; anything else is a real bug and is allowed to propagate.
   */
  async #act(action: Action): Promise<Response> {
    try {
      const before = await this.#ensureSession();
      const result = await this.#semaphore.act(labelFor(action), async () =>
        reduce(before, action, Date.now()),
      );

      for (const event of result.events) await appendEvent(this.#storage, event);
      this.#session = result.session;
      await this.#storage.put("meta", result.session);

      if (result.session.machine.phase === "ESCAPED") await this.#flushToD1(result.session);

      return Response.json({ content: [{ type: "text", text: result.toolText }] });
    } catch (err) {
      if (GameError.is(err)) return Response.json(err.toToolResult(), { status: 409 });
      throw err;
    }
  }

  async #status(): Promise<Response> {
    const session = this.#session;
    if (!session) return Response.json(errors.noSession().toToolResult(), { status: 409 });
    const chamber: ChamberId | null = session.machine.chamber;
    return Response.json({
      phase: session.machine.phase,
      chamber,
      designation: session.designation,
      staminaWindowMs: staminaWindowMs(session.observedLatencyMs),
    });
  }

  /**
   * Write the finished session to D1 as one gzipped row (decision log D-006,
   * amended by D-008). Runs once, when the machine reaches `ESCAPED`.
   *
   * A write failure here must not surface as a broken ending for the player
   * who just finished. Doc 07 section 3.1 asks for exactly this asymmetry:
   * the game keeps working even when the instrument recording it briefly does
   * not, and the failure is logged for investigation rather than thrown.
   */
  async #flushToD1(session: PersistedSession): Promise<void> {
    const events = await readAllEvents(this.#storage);
    const gzipped = await gzipJsonl(events);
    const chambersCleared = events.filter((e) => e.type === "chamber_solved").length;

    try {
      await this.#db
        .prepare(
          `INSERT INTO sessions
             (session_id, seed, designation, difficulty, mode, outcome,
              chambers_cleared, started_at_ms, ended_at_ms, median_latency_ms,
              stamina_window_ms, log_gzip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          session.sessionId,
          session.seed,
          session.designation ?? "",
          session.difficulty,
          session.machine.mode,
          "escaped",
          chambersCleared,
          session.startedAtMs,
          Date.now(),
          percentile(session.observedLatencyMs, 50),
          staminaWindowMs(session.observedLatencyMs),
          gzipped,
        )
        .run();
    } catch (err) {
      console.error("Failed to flush session to D1", err);
    }
  }
}
