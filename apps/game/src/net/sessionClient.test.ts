/**
 * The client's contract with the worker, and the one rule that matters most:
 * a tool call never hands an agent a bare exception.
 *
 * A `409` is the worker refusing in a sentence written to be recovered from,
 * and it arrives in the same envelope a success does. A dead network is the
 * station failing, and it gets an answer in the same register. Only an abort
 * is allowed through as a rejection, because a host cancelling a call in
 * flight is not a failure to describe.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionClient, sessionIdFrom } from "./sessionClient.js";

function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const toolBody = (text: string, state?: unknown) => ({ content: [{ type: "text", text }], state });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("responses", () => {
  it("returns the worker's text and machine state on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      reply(
        200,
        toolBody("The door is shut.", {
          phase: "IN_CHAMBER",
          chamber: "airlock",
          designation: "KEEPER",
          remainingMs: 12_000,
        }),
      ),
    );
    const response = await new SessionClient("s").post("pull_lever", { lever_id: "lever_a" });
    expect(response.ok).toBe(true);
    expect(response.text).toBe("The door is shut.");
    expect(response.state?.chamber).toBe("airlock");
  });

  it("passes a game refusal through untouched, with its code intact", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      reply(409, toolBody("E_BUSY: KEEPER is still turning dial 2. Wait for it to finish.")),
    );
    const response = await new SessionClient("s").post("rotate_dial");
    expect(response.ok).toBe(false);
    expect(response.text).toContain("E_BUSY");
    // A refusal settled nothing, so it carries no state to act on.
    expect(response.state).toBeNull();
  });

  it("answers a dead network with text rather than a rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("failed to fetch"));
    const response = await new SessionClient("s").post("pull_lever");
    expect(response.ok).toBe(false);
    expect(response.text).toContain("try the call again");
  });

  it("answers a server fault with text rather than a rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(503, {}));
    const response = await new SessionClient("s").get("describe");
    expect(response.ok).toBe(false);
    expect(response.text).toContain("503");
  });

  it("re-throws an abort, and only an abort", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(new SessionClient("s").post("pull_lever")).rejects.toThrow(DOMException);
  });
});

describe("state watchers", () => {
  it("announces the state every response carries, to every watcher", async () => {
    const state = {
      phase: "ARCHIVE",
      chamber: "blind_panel",
      designation: "KEEPER",
      remainingMs: null,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(200, toolBody("read", state)));

    const client = new SessionClient("s");
    const seen: string[] = [];
    const stop = client.watchState((next) => seen.push(next.phase));
    await client.post("read_station_log", { entry: 1 });
    expect(seen).toEqual(["ARCHIVE"]);

    stop();
    await client.post("read_station_log", { entry: 2 });
    expect(seen).toEqual(["ARCHIVE"]);
  });

  it("announces nothing when the call was refused", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(409, toolBody("E_NO_SESSION: ...")));
    const client = new SessionClient("s");
    const seen: string[] = [];
    client.watchState((next) => seen.push(next.phase));
    await client.post("pull_lever");
    expect(seen).toEqual([]);
  });
});

describe("the session id", () => {
  it("uses ?seed= when given, so a session is reproducible", () => {
    expect(sessionIdFrom("?seed=known-seed")).toBe("known-seed");
    expect(sessionIdFrom("?seed=%20padded%20")).toBe("padded");
  });

  it("generates an opaque id otherwise, carrying nothing personal", () => {
    const id = sessionIdFrom("");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sessionIdFrom("?seed=")).not.toBe(id);
  });

  it("encodes the id into the path, so an odd seed cannot break the route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(200, toolBody("ok")));
    await new SessionClient("a/b c").get("describe");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/session/a%2Fb%20c/describe");
  });
});
