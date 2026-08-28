/**
 * PILOT's live view: one WebSocket to the session's Durable Object, and the
 * last frame it delivered (doc 05 section 1).
 *
 * The tool surface is request/response, because an action wants an
 * authoritative answer. PILOT's view is not: it has to move when KEEPER acts,
 * when the timer ticks, when gauges drift, and when the alarm deadlocks a
 * chamber nobody is calling. That is push, and this file is the whole of it.
 *
 * It holds the latest `PilotView` because that is all a store here would do.
 * The view is small and arrives whole, so there is nothing to merge and no
 * version to track: a subscriber is handed the most recent frame and the
 * renderer draws it. Read-only by construction - the setter is private and
 * every frame comes off the wire.
 *
 * Nothing is ever sent. The client is a view, never an authority; the worker
 * has no `webSocketMessage` handler for the same reason.
 */

import type { PilotView } from "@semaphore/protocol";

/** How long to wait before the nth reconnect attempt, capped. */
const BACKOFF_MS = [250, 500, 1000, 2000, 4000, 8000] as const;

/** Injected in tests. The browser's own `WebSocket` everywhere else. */
export type SocketFactory = (url: string) => WebSocket;

export interface SessionSocketOptions {
  /** Same-origin in production, Vite's proxy in development. */
  readonly workerOrigin?: string;
  readonly factory?: SocketFactory;
  /** Sleep, so a test can drive the backoff without waiting for it. */
  readonly delay?: (ms: number) => Promise<void>;
}

/**
 * One session's view feed.
 *
 * Reconnects on its own, with exponential backoff, until `close()` is called.
 * A dropped connection is normal rather than exceptional here: a Durable
 * Object may be evicted, a laptop lid closes, a phone changes network. None of
 * those should end a session that the server still considers live, and the
 * server sends the current view on every connect, so a reconnect resynchronises
 * without any catch-up protocol.
 */
export class SessionSocket {
  readonly #url: string;
  readonly #factory: SocketFactory;
  readonly #delay: (ms: number) => Promise<void>;
  readonly #watchers = new Set<(view: PilotView) => void>();
  #socket: WebSocket | null = null;
  #latest: PilotView | null = null;
  #attempt = 0;
  #closed = false;

  constructor(sessionId: string, options: SessionSocketOptions = {}) {
    // `ws:`/`wss:` is derived from the page, not written down, so the same
    // build works on localhost and on the production domain. An explicit
    // origin (Vite's `VITE_WORKER_ORIGIN`) wins when there is one.
    const origin = options.workerOrigin ?? "";
    const base = origin || globalThis.location.origin;
    const url = new URL(`/session/${encodeURIComponent(sessionId)}/socket`, base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    this.#url = url.toString();

    this.#factory = options.factory ?? ((target) => new WebSocket(target));
    this.#delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** The most recent frame, or null before the first one arrives. */
  get view(): PilotView | null {
    return this.#latest;
  }

  /**
   * Watch the view.
   *
   * A subscriber that arrives after the first frame is given it immediately,
   * so a scene created mid-session does not render an empty room while it
   * waits for the next push.
   */
  watch(watcher: (view: PilotView) => void): () => void {
    this.#watchers.add(watcher);
    if (this.#latest) watcher(this.#latest);
    return () => this.#watchers.delete(watcher);
  }

  /** Open the connection and keep it open. Safe to call once. */
  open(): void {
    if (this.#closed || this.#socket) return;
    const socket = this.#factory(this.#url);
    this.#socket = socket;

    socket.onopen = () => {
      this.#attempt = 0;
    };
    socket.onmessage = (event: MessageEvent) => {
      this.#receive(event.data);
    };
    // `onerror` deliberately has no handler of its own: a socket that errors
    // also closes, so handling both would schedule two reconnects for one
    // failure. An unhandled `error` event on a WebSocket does not throw.
    socket.onclose = () => {
      this.#socket = null;
      void this.#reconnect();
    };
  }

  /** Stop reconnecting and drop the connection. Idempotent. */
  close(): void {
    this.#closed = true;
    this.#watchers.clear();
    const socket = this.#socket;
    this.#socket = null;
    socket?.close();
  }

  /**
   * A frame off the wire.
   *
   * Malformed input is dropped rather than thrown. Nothing else is listening
   * for the exception, and a single bad frame must not take down a feed that
   * the next push would have corrected anyway.
   */
  #receive(data: unknown): void {
    if (typeof data !== "string") return;
    let view: PilotView;
    try {
      view = JSON.parse(data) as PilotView;
    } catch {
      return;
    }
    this.#latest = view;
    for (const watcher of this.#watchers) watcher(view);
  }

  async #reconnect(): Promise<void> {
    if (this.#closed) return;
    const wait = BACKOFF_MS[Math.min(this.#attempt, BACKOFF_MS.length - 1)] as number;
    this.#attempt += 1;
    await this.#delay(wait);
    this.open();
  }
}
