// @vitest-environment happy-dom
/**
 * The game's half of the boundary.
 *
 * Three things are worth proving and one of them is a security property.
 *
 * The frame is created with `allow="tools"`, because without that Permissions
 * Policy the archive origin cannot register anything at all and the manual
 * silently does not exist.
 *
 * A tool set asked for before the frame has finished loading is not lost. The
 * shift can begin on the first response, and a frame fetched over the network
 * will routinely still be loading then; without the replay, `read_manual`
 * would be absent for the entire session and nothing would say so.
 *
 * And messages from anywhere but the archive origin are ignored. A hidden
 * iframe is reachable by anything with a handle to this window, and the
 * `ready` message is what triggers the parent to hand over its tool set.
 *
 * What the child does with a message is proved on the child's own side, in
 * `apps/archive/src/registrar.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ARCHIVE_CHANNEL } from "@semaphore/protocol";
import { mountArchiveFrame } from "./archiveFrame.js";

const ORIGIN = "https://archive.example";

const OPTIONS = {
  origin: ORIGIN,
  sessionId: "s_1",
  workerOrigin: "https://worker.example",
};

/**
 * Mount into a fresh host, with the frame's `contentWindow` replaced by a
 * recorder. happy-dom does not load the frame's document, and what is under
 * test here is what the parent sends, not what the child does with it.
 */
function mount(options: Partial<Parameters<typeof mountArchiveFrame>[1]> = {}) {
  // Detached on purpose: connecting the frame would make happy-dom try to
  // navigate it, and the message wiring under test listens on the window
  // rather than on the element.
  const host = document.createElement("div");
  const frame = mountArchiveFrame(host, { ...OPTIONS, ...options });
  const element = host.querySelector("iframe") as HTMLIFrameElement;
  const posted: { message: unknown; targetOrigin: string }[] = [];
  Object.defineProperty(element, "contentWindow", {
    configurable: true,
    value: {
      postMessage: (message: unknown, targetOrigin: string) => {
        posted.push({ message, targetOrigin });
      },
    },
  });
  return { frame, element, posted, host };
}

/** Deliver a message event as the browser would, with an origin on it. */
function deliver(data: unknown, origin = ORIGIN): void {
  globalThis.dispatchEvent(new MessageEvent("message", { data, origin }));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("the frame element", () => {
  it("carries allow=tools, which is what permits registration at all", () => {
    const { element } = mount();
    expect(element.getAttribute("allow")).toBe("tools");
  });

  it("is hidden from sight and from the accessibility tree", () => {
    const { element } = mount();
    expect(element.hasAttribute("hidden")).toBe(true);
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.getAttribute("tabindex")).toBe("-1");
  });

  it("addresses the archive origin with the session and an absolute worker origin", () => {
    const { element } = mount();
    const url = new URL(element.src);
    expect(url.origin).toBe(ORIGIN);
    expect(url.searchParams.get("session")).toBe("s_1");
    // Relative would resolve against the archive origin, not the station.
    expect(url.searchParams.get("worker")).toBe("https://worker.example");
  });

  it("does not double the slash when the configured origin has a trailing one", () => {
    const { element } = mount({ origin: `${ORIGIN}/` });
    expect(element.src.startsWith(`${ORIGIN}/?`)).toBe(true);
  });
});

describe("delegation", () => {
  it("sends nothing until the frame says it is listening", () => {
    const { frame, posted } = mount();
    frame.delegate(["read_manual"]);
    expect(posted).toEqual([]);
  });

  it("replays the most recent set the moment the frame is ready", () => {
    const { frame, posted } = mount();
    frame.delegate(["read_manual"]);
    frame.delegate(["read_manual", "read_station_log"]);
    deliver({ channel: ARCHIVE_CHANNEL, ready: true });

    expect(posted).toHaveLength(1);
    expect(posted[0]?.message).toEqual({
      channel: ARCHIVE_CHANNEL,
      tools: ["read_manual", "read_station_log"],
    });
  });

  it("targets the archive origin explicitly, never a wildcard", () => {
    const { frame, posted } = mount();
    deliver({ channel: ARCHIVE_CHANNEL, ready: true });
    frame.delegate(["read_manual"]);
    for (const post of posted) expect(post.targetOrigin).toBe(ORIGIN);
  });

  it("sends every later set straight through", () => {
    const { frame, posted } = mount();
    deliver({ channel: ARCHIVE_CHANNEL, ready: true });
    frame.delegate(["read_manual"]);
    frame.delegate([]);
    expect(posted.map((post) => (post.message as { tools: string[] }).tools)).toEqual([
      [],
      ["read_manual"],
      [],
    ]);
  });
});

describe("what it refuses to listen to", () => {
  it("ignores a ready message from any other origin", () => {
    const { frame, posted } = mount();
    frame.delegate(["read_manual"]);
    deliver({ channel: ARCHIVE_CHANNEL, ready: true }, "https://evil.example");
    expect(posted).toEqual([]);
  });

  it("ignores a message on the right origin that is not ours", () => {
    const { frame, posted } = mount();
    frame.delegate(["read_manual"]);
    deliver({ type: "webpackHot" });
    deliver("ready");
    expect(posted).toEqual([]);
  });

  it("ignores a registration report from any other origin", () => {
    const onRegistered = vi.fn();
    mount({ onRegistered });
    deliver({ channel: ARCHIVE_CHANNEL, registered: ["read_manual"] }, "https://evil.example");
    expect(onRegistered).not.toHaveBeenCalled();
  });
});

describe("the registration report", () => {
  it("reaches the caller, which is what refreshes the manifest plate", () => {
    const onRegistered = vi.fn();
    mount({ onRegistered });
    deliver({ channel: ARCHIVE_CHANNEL, registered: ["read_manual"] });
    expect(onRegistered).toHaveBeenCalledWith(["read_manual"]);
  });
});

describe("close", () => {
  it("removes the frame and stops listening", () => {
    const onRegistered = vi.fn();
    const { frame, host } = mount({ onRegistered });
    frame.close();
    expect(host.querySelector("iframe")).toBeNull();
    deliver({ channel: ARCHIVE_CHANNEL, registered: ["read_manual"] });
    expect(onRegistered).not.toHaveBeenCalled();
  });
});
