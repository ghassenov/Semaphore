/**
 * The view feed's two jobs: hand every subscriber the latest frame, and stay
 * connected without anybody managing it.
 *
 * Driven against a fake `WebSocket` and a fake clock, so the backoff is
 * asserted rather than waited for. There is no jsdom here and none is needed:
 * the class touches one global, `location`, and only to build a URL.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PilotView } from "@semaphore/protocol";
import { SessionSocket } from "./socket.js";

const VIEW: PilotView = {
  phase: "IN_CHAMBER",
  chamber: "airlock",
  designation: "KEEPER",
  remainingMs: 60_000,
  retries: 0,
  facts: { glyphByLever: { lever_a: "spiral" }, doorOpen: false },
  ghost: null,
  objective: null,
  progress: null,
  seq: 0,
  notes: [],
  mode: "full",
};

/** A `WebSocket` the test drives by hand. */
class FakeWebSocket {
  static opened: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeWebSocket.opened.push(this);
  }
  close(): void {
    this.closed = true;
  }
  /** Deliver a frame as the browser would: a `MessageEvent` carrying a string. */
  deliver(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }
  deliverRaw(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
  drop(): void {
    this.onclose?.();
  }
}

/** A socket over the fake transport, with every backoff wait recorded. */
function socketUnderTest(): { socket: SessionSocket; waits: number[] } {
  const waits: number[] = [];
  const socket = new SessionSocket("s_view", {
    workerOrigin: "https://worker.example",
    factory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    delay: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });
  return { socket, waits };
}

beforeEach(() => {
  FakeWebSocket.opened = [];
});

describe("the URL it connects to", () => {
  it("upgrades the scheme rather than hardcoding one, so one build works everywhere", () => {
    socketUnderTest().socket.open();
    expect(FakeWebSocket.opened[0]!.url).toBe("wss://worker.example/session/s_view/socket");
  });

  it("escapes the session id, which is arbitrary text from ?seed=", () => {
    new SessionSocket("a b/c", {
      workerOrigin: "http://localhost:5173",
      factory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    }).open();
    expect(FakeWebSocket.opened[0]!.url).toBe("ws://localhost:5173/session/a%20b%2Fc/socket");
  });
});

describe("frames", () => {
  it("hands every watcher the view and keeps the latest", () => {
    const { socket } = socketUnderTest();
    const seen: PilotView[] = [];
    socket.watch((view) => seen.push(view));
    socket.open();

    FakeWebSocket.opened[0]!.deliver(VIEW);

    expect(seen).toEqual([VIEW]);
    expect(socket.view).toEqual(VIEW);
  });

  it("gives a late watcher the frame it missed, so a new scene is not blank", () => {
    const { socket } = socketUnderTest();
    socket.open();
    FakeWebSocket.opened[0]!.deliver(VIEW);

    const seen: PilotView[] = [];
    socket.watch((view) => seen.push(view));
    expect(seen).toEqual([VIEW]);
  });

  it("stops delivering once unwatched", () => {
    const { socket } = socketUnderTest();
    const seen: PilotView[] = [];
    const stop = socket.watch((view) => seen.push(view));
    socket.open();
    stop();

    FakeWebSocket.opened[0]!.deliver(VIEW);
    expect(seen).toEqual([]);
  });

  it("drops a malformed frame instead of taking the feed down with it", () => {
    const { socket } = socketUnderTest();
    socket.open();
    socket.watch(() => {
      throw new Error("should not be called");
    });

    expect(() => FakeWebSocket.opened[0]!.deliverRaw("{not json")).not.toThrow();
    expect(() => FakeWebSocket.opened[0]!.deliverRaw(new ArrayBuffer(4))).not.toThrow();
    expect(socket.view).toBeNull();
  });
});

describe("reconnection", () => {
  it("reopens after a drop", async () => {
    const { socket } = socketUnderTest();
    socket.open();

    FakeWebSocket.opened[0]!.drop();
    await vi.waitFor(() => expect(FakeWebSocket.opened).toHaveLength(2));
  });

  it("backs off, then caps rather than growing without bound", async () => {
    const { socket, waits } = socketUnderTest();
    socket.open();

    for (let i = 0; i < 8; i++) {
      FakeWebSocket.opened.at(-1)!.drop();
      await vi.waitFor(() => expect(waits).toHaveLength(i + 1));
    }

    expect(waits.slice(0, 6)).toEqual([250, 500, 1000, 2000, 4000, 8000]);
    expect(waits.slice(6)).toEqual([8000, 8000]);
  });

  it("resets the backoff once a connection actually opens", async () => {
    const { socket, waits } = socketUnderTest();
    socket.open();

    FakeWebSocket.opened[0]!.drop();
    await vi.waitFor(() => expect(FakeWebSocket.opened).toHaveLength(2));
    FakeWebSocket.opened[1]!.onopen?.();
    FakeWebSocket.opened[1]!.drop();
    await vi.waitFor(() => expect(waits).toHaveLength(2));

    expect(waits).toEqual([250, 250]);
  });

  it("stops for good once closed, which is what ends a session", async () => {
    const { socket } = socketUnderTest();
    socket.open();
    const first = FakeWebSocket.opened[0]!;

    socket.close();
    first.drop();
    await Promise.resolve();

    expect(first.closed).toBe(true);
    expect(FakeWebSocket.opened).toHaveLength(1);
  });
});
