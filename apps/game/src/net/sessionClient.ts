/**
 * The client's only route to the Durable Object (doc 05 section 2).
 *
 * Two rules shape this file.
 *
 * **The client is a view, never an authority.** Nothing here decides anything.
 * It sends what KEEPER called or what PILOT pressed, and it returns the
 * server's own words. There is no local copy of puzzle state to drift, and no
 * derivation to disagree with the server about.
 *
 * **Every failure is text an agent can act on** (doc 03 section 9). A game
 * failure comes back as `409` carrying a `CODE: message` string the worker
 * wrote, and this file passes it through untouched. A transport failure gets
 * the same treatment in the station's voice, because from the agent's side
 * "the worker is down" and "the door is stuck" need the same shape of answer:
 * something it can read and retry. Nothing here rejects, so no tool call ever
 * hands an agent a bare exception.
 */

import type { ChamberId, Phase } from "@semaphore/protocol";

/**
 * The machine state every response carries: enough for the tool director to
 * know which controller to tear down, and nothing else.
 *
 * This is not a view. Phase and chamber are `SHARED` by construction (both
 * parties always know which room they are in) and no chamber fact reaches it.
 * Rendering derives from `projectForPilot` over the socket, which is a
 * separate channel and a later phase.
 */
export interface StateSummary {
  readonly phase: Phase;
  readonly chamber: ChamberId | null;
  readonly designation: string | null;
  /** Milliseconds left on this chamber's deadline, or null when untimed. */
  readonly remainingMs: number | null;
}

/** What every call returns: the text to hand back, and the state to act on. */
export interface SessionResponse {
  readonly text: string;
  /** Absent when the call failed, because a failed call settles nothing. */
  readonly state: StateSummary | null;
  readonly ok: boolean;
}

interface ToolShapedBody {
  content?: { text?: unknown }[];
  state?: StateSummary;
}

/**
 * One session's connection to its Durable Object.
 *
 * The session id doubles as the seed (doc 05 section 9), which is what makes
 * `?seed=` replay work: two sessions started with the same id generate the
 * same four chambers. It carries no personal data by construction - it is a
 * random opaque string and nothing else - which is the property that makes
 * post-submission ARCHIVE mode safe (doc 03 section 10).
 */
export class SessionClient {
  readonly #base: string;
  readonly #watchers = new Set<(state: StateSummary) => void>();

  constructor(
    readonly sessionId: string,
    workerOrigin = "",
  ) {
    // Empty origin means same origin, which is how production runs: the
    // Pages project and the worker sit behind one hostname. In development
    // Vite proxies `/session` to a local `wrangler dev`. Either way no origin
    // is written into a source file.
    this.#base = `${workerOrigin}/session/${encodeURIComponent(sessionId)}`;
  }

  /**
   * Watch the machine state, which every response already carries.
   *
   * This is how the tool director learns that a chamber was solved without a
   * second round trip, and how it learns about the things PILOT does alone -
   * gripping the release bar, resetting a deadlocked chamber, leaving the
   * Archive - which move the session with no tool call involved at all.
   * Because the notification happens here, at the one place every response
   * passes through, no caller has to remember to report.
   */
  watchState(watcher: (state: StateSummary) => void): () => void {
    this.#watchers.add(watcher);
    return () => this.#watchers.delete(watcher);
  }

  #announce(state: StateSummary | null | undefined): void {
    if (!state) return;
    for (const watcher of this.#watchers) watcher(state);
  }

  /** A mutating action. Everything KEEPER calls that moves the station. */
  async post(
    action: string,
    body: Readonly<Record<string, unknown>> = {},
    signal?: AbortSignal,
  ): Promise<SessionResponse> {
    return this.#send(`${this.#base}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  }

  /** A read. Nothing on the server changes, including the chamber deadline. */
  async get(
    view: string,
    params: Readonly<Record<string, string>> = {},
    signal?: AbortSignal,
  ): Promise<SessionResponse> {
    const query = new URLSearchParams(params).toString();
    return this.#send(`${this.#base}/${view}${query ? `?${query}` : ""}`, {
      method: "GET",
      ...(signal ? { signal } : {}),
    });
  }

  /**
   * Send and normalise.
   *
   * `409` is not an exception here: it is the worker saying the game refused,
   * in a sentence written for the agent to recover from, and it arrives in the
   * same envelope a success does. Anything else is the station itself failing,
   * and it gets a message in the same register rather than a stack trace.
   *
   * An abort is re-thrown, and only an abort. Swallowing a cancellation into
   * an "ok" response would tell the agent something happened when whoever
   * cancelled had already decided it should not. Note that no signal reaches
   * a tool in Chrome 151 (doc 11 section 2, D-024), so today this path is
   * reached only by a caller that passes its own signal.
   */
  async #send(url: string, init: RequestInit): Promise<SessionResponse> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      return {
        ok: false,
        state: null,
        text: "The station did not answer. The line to the machine deck is down; try the call again.",
      };
    }

    if (response.status >= 500 || response.status === 404) {
      return {
        ok: false,
        state: null,
        text: `The station answered with a fault (${String(response.status)}). Try the call again.`,
      };
    }

    const body = (await response.json()) as ToolShapedBody;
    const text = String(body.content?.[0]?.text ?? "");
    const state = response.ok ? (body.state ?? null) : null;
    this.#announce(state);
    return { ok: response.ok, state, text };
  }

  /**
   * `get_status`'s backing call. Shaped differently from the others because
   * the worker's `/status` returns the summary itself rather than tool text:
   * it exists for the page as much as for the agent.
   */
  async status(signal?: AbortSignal): Promise<StatusReport | null> {
    try {
      const response = await fetch(`${this.#base}/status`, signal ? { signal } : {});
      if (!response.ok) return null;
      const report = (await response.json()) as StatusReport;
      this.#announce(report);
      return report;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      return null;
    }
  }
}

/** `/status`, which carries the summary plus the numbers a re-orienting agent wants. */
export interface StatusReport extends StateSummary {
  /** Chamber III's grip window, derived at runtime from observed latency. */
  readonly staminaWindowMs: number;
  /** How many times this chamber has been reset after a deadlock. */
  readonly retries: number;
  readonly archiveEntriesRead: number;
}

/**
 * A fresh session id, which is also the seed.
 *
 * `?seed=` wins when present, because a fixed seed is how a bug is reproduced,
 * how a demo is rehearsed, and how two models are compared on the same four
 * chambers (doc 05 section 9).
 */
export function sessionIdFrom(search: string): string {
  const seed = new URLSearchParams(search).get("seed");
  return seed && seed.trim().length > 0 ? seed.trim() : crypto.randomUUID();
}
