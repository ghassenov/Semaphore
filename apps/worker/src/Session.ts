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

import { GameError, errors } from "@semaphore/protocol";
import { appendEvent, gzipJsonl, readAllEvents } from "./log.js";
import {
  ambiguityFor,
  newSession,
  reduce,
  settleSession,
  type Action,
  type PersistedSession,
} from "./reducer.js";
import { ActionSemaphore } from "./semaphore.js";
import { describeChamber, inspectObject, lockState, readCiphertext } from "./views.js";
import { inTheRoom, pilotView, stateSummary } from "./pilot.js";
import { MANUAL_SECTIONS, isManualSection, manualSection } from "./manual.js";
import { percentile, staminaWindowMs } from "./latency.js";
import type { LeverId } from "./chambers/airlock.js";
import type { KeyId } from "./chambers/signal_room.js";
import type { DialId, Direction } from "./chambers/blind_panel.js";
import type { BoltId } from "./chambers/concord_lock.js";

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
    case "rotate_dial":
      return "turning a dial";
    case "grip_bar":
      return "gripping the release bar";
    case "release_bar":
      return "releasing the bar";
    case "align_bolt":
      return "aligning a bolt";
    case "speak_passphrase":
      return "speaking the passphrase";
    case "read_station_log":
      return "reading the station log";
    case "leave_archive":
      return "leaving the archive";
    case "open_the_door":
      return "opening the outer door";
    case "retry_chamber":
      return "resetting the chamber";
  }
}

export class Session {
  readonly #state: DurableObjectState;
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
    this.#state = state;
    this.#storage = state.storage;
    this.#db = env.SESSIONS_DB;
    this.#sessionId = state.id.name ?? state.id.toString();
    state.blockConcurrencyWhile(async () => {
      this.#session = (await this.#storage.get<PersistedSession>("meta")) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.endsWith("/socket")) return this.#socket(request);

    if (request.method === "GET") {
      if (pathname.endsWith("/status")) return this.#status();
      if (pathname.endsWith("/concord")) return this.#concord();
      // Every other GET is a read-only tool. They share one handler because
      // they share the property that makes them safe: `views.ts` and
      // `manual.ts` are pure, so none of them can be made to mutate by a
      // routing mistake here.
      if (pathname.endsWith("/describe")) return this.#read((s) => describeChamber(s));
      if (pathname.endsWith("/ciphertext")) return this.#read((s) => readCiphertext(s));
      if (pathname.endsWith("/lock_state")) return this.#read((s) => lockState(s, Date.now()));
      if (pathname.endsWith("/inspect")) {
        const objectId = url.searchParams.get("object_id") ?? "";
        return this.#read((s) => inspectObject(s, objectId));
      }
      if (pathname.endsWith("/manual")) {
        const section = url.searchParams.get("section") ?? "index";
        if (!isManualSection(section)) {
          return Response.json(
            errors
              .invalidInput("section", `one of ${MANUAL_SECTIONS.join(", ")}`, section)
              .toToolResult(),
            { status: 409 },
          );
        }
        return this.#read((s) => manualSection(s, section));
      }
      return new Response("Not found", { status: 404 });
    }
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
    if (pathname.endsWith("/rotate_dial")) {
      const body = (await request.json()) as {
        dial_id?: unknown;
        direction?: unknown;
        clicks?: unknown;
      };
      return this.#act({
        type: "rotate_dial",
        dialId: Number(body.dial_id ?? 0) as DialId,
        direction: (body.direction as Direction | undefined) ?? "clockwise",
        clicks: Number(body.clicks ?? 0),
      });
    }

    if (pathname.endsWith("/grip_bar")) return this.#act({ type: "grip_bar" });
    if (pathname.endsWith("/release_bar")) return this.#act({ type: "release_bar" });
    if (pathname.endsWith("/align_bolt")) {
      const body = (await request.json()) as { bolt_id?: unknown };
      return this.#act({ type: "align_bolt", boltId: Number(body.bolt_id ?? 0) as BoltId });
    }
    if (pathname.endsWith("/speak_passphrase")) {
      const body = (await request.json()) as { phrase?: unknown };
      return this.#act({ type: "speak_passphrase", phrase: String(body.phrase ?? "") });
    }
    if (pathname.endsWith("/read_station_log")) {
      const body = (await request.json()) as { entry?: unknown };
      return this.#act({ type: "read_station_log", entry: Number(body.entry ?? 0) });
    }
    if (pathname.endsWith("/leave_archive")) {
      return this.#act({ type: "leave_archive" });
    }
    if (pathname.endsWith("/open_the_door")) {
      return this.#act({ type: "open_the_door" });
    }
    if (pathname.endsWith("/retry_chamber")) {
      return this.#act({ type: "retry_chamber" });
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
   * Run one read-only tool: project, and respond.
   *
   * Deliberately not routed through the action semaphore. The semaphore
   * exists to serialise *mutation* (doc 05 section 5), and making a look
   * block behind a turning dial would produce an `E_BUSY` for a call that
   * cannot conflict with anything - which would teach an agent to stop
   * calling `get_status` under pressure, exactly when it needs it most.
   *
   * Nothing here persists, so a read is also the one call that cannot settle
   * an expired chamber deadline. That is what the alarm is for (D-018).
   */
  async #read(project: (session: PersistedSession) => string): Promise<Response> {
    const session = this.#session;
    if (!session) return Response.json(errors.noSession().toToolResult(), { status: 409 });
    try {
      return Response.json({
        content: [{ type: "text", text: project(session) }],
        state: this.#stateSummary(session),
      });
    } catch (err) {
      if (GameError.is(err)) return Response.json(err.toToolResult(), { status: 409 });
      throw err;
    }
  }

  /**
   * What the page needs to drive the tool registry, and nothing more.
   *
   * The client's `ToolDirector` has to know which chamber it is in to know
   * which controller to tear down, so every response carries this. It is
   * machine state, not world state: phase and chamber are `SHARED` by
   * construction (both parties always know which room they are in), and no
   * chamber fact reaches it. Rendering still derives from `projectForPilot`
   * over the socket; this is the registry's cue, not a view.
   *
   * `remainingMs` rather than the deadline itself, so a client with a skewed
   * clock cannot turn its own skew into the game's problem.
   */
  #stateSummary(session: PersistedSession) {
    return stateSummary(session, Date.now());
  }

  /**
   * PILOT's socket (doc 05 section 1).
   *
   * Accepted through the hibernation API rather than `server.accept()`, so the
   * Durable Object may be evicted between beats without dropping the page:
   * `getWebSockets()` gives the live set back on wake-up, which also means
   * this class keeps no connection bookkeeping of its own to leak.
   *
   * The current view goes out immediately on connect. Without it a client that
   * joins mid-chamber renders nothing until the next action, which for a pair
   * mid-conversation is indistinguishable from the game being broken.
   *
   * Nothing is ever read from this socket. The client is a view, never an
   * authority (see `net/sessionClient.ts`): everything that moves the station
   * arrives as an HTTP action, so an inbound frame here would be a route into
   * the state machine that bypasses the action semaphore. There is deliberately
   * no `webSocketMessage` handler.
   */
  #socket(request: Request): Response {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.#state.acceptWebSocket(server);
    if (this.#session) server.send(JSON.stringify(pilotView(this.#session, Date.now())));

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Push the current view to every connected client.
   *
   * Called after anything that settles state: an action, and the alarm. It is
   * a whole view rather than a diff, because the view is small, a diff would
   * need a version handshake to survive a reconnect, and a client that missed
   * one frame would then be wrong rather than merely late.
   *
   * A dead socket must not break the call that triggered the push, so a failed
   * send is swallowed. The runtime removes closed sockets from
   * `getWebSockets()` on its own; a send that throws for any other reason is a
   * transport problem for one viewer and not a reason to fail the agent's tool
   * call.
   */
  #broadcast(session: PersistedSession): void {
    const frame = JSON.stringify(pilotView(session, Date.now()));
    for (const socket of this.#state.getWebSockets()) {
      try {
        socket.send(frame);
      } catch {
        // Closed or closing. Nothing to do and nothing worth logging.
      }
    }
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
      await this.#syncAlarm(result.session);

      if (result.session.machine.phase === "ESCAPED") await this.#flushToD1(result.session);
      this.#broadcast(result.session);

      return Response.json({
        content: [{ type: "text", text: result.toolText }],
        state: this.#stateSummary(result.session),
      });
    } catch (err) {
      if (GameError.is(err)) return Response.json(err.toToolResult(), { status: 409 });
      throw err;
    }
  }

  /**
   * Keep the Durable Object alarm pinned to the live chamber deadline.
   *
   * Called after every action, because a deadline moves: entering a chamber
   * sets one, a time penalty pulls it earlier, and solving a chamber or
   * reaching the Archive clears it. Setting an alarm is idempotent, so this
   * is a plain write rather than a read-compare-write.
   */
  async #syncAlarm(session: PersistedSession): Promise<void> {
    if (session.chamberDeadlineMs === null) await this.#storage.deleteAlarm();
    else await this.#storage.setAlarm(session.chamberDeadlineMs);
  }

  /**
   * The chamber timer reaching zero with nobody watching.
   *
   * This is the only reason the alarm exists. `reduce` already settles the
   * session against the clock on every call, so a pair that keeps playing
   * would find the deadlock on their next action regardless; what they would
   * *not* get is a `failure` event stamped at the moment time actually ran
   * out. The replay timeline and the benchmark both read that timestamp, so
   * it has to be true rather than merely eventual.
   *
   * Runs the same `settleSession` the request path runs, never a parallel
   * copy of the rule. If the alarm fires early (a deadline moved later, which
   * cannot currently happen, or a spurious wake-up) `settleSession` returns no
   * events and this is a no-op.
   */
  async alarm(): Promise<void> {
    const session = this.#session;
    if (!session) return;

    const settled = settleSession(session, Date.now());
    if (settled.events.length === 0) return;

    for (const event of settled.events) await appendEvent(this.#storage, event);
    this.#session = settled.session;
    await this.#storage.put("meta", settled.session);
    await this.#syncAlarm(settled.session);
    this.#broadcast(settled.session);
  }

  /**
   * The CONCORD meter's feed: KEEPER's remaining ambiguity in the active room.
   *
   * A route of its own rather than a field on the socket frame, because
   * measuring it enumerates every world consistent with what KEEPER knows and
   * replays the rotation history under each. For the Blind Panel that is 384
   * candidates, which is fine a few times a second on demand and absurd on
   * every push (D-026). The HUD polls it; the frame stays cheap.
   *
   * Null outside a chamber, gated by the same `inTheRoom` predicate the frame
   * uses, so the meter cannot report a room the pair has already left.
   */
  #concord(): Response {
    const session = this.#session;
    if (!session) return Response.json(errors.noSession().toToolResult(), { status: 409 });
    const ambiguity = inTheRoom(session.machine.phase) ? ambiguityFor(session) : null;
    return Response.json({
      chamber: session.machine.chamber,
      bits: ambiguity ? Number(ambiguity.bits.toFixed(2)) : null,
      worlds: ambiguity?.worlds ?? null,
      actions: ambiguity?.actions ?? null,
    });
  }

  async #status(): Promise<Response> {
    const session = this.#session;
    if (!session) return Response.json(errors.noSession().toToolResult(), { status: 409 });
    return Response.json({
      ...this.#stateSummary(session),
      staminaWindowMs: staminaWindowMs(session.observedLatencyMs),
      retries: session.machine.retries,
      archiveEntriesRead: session.archiveEntriesRead.length,
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
