/**
 * The archive origin's calls into the station.
 *
 * The interesting cases are the failures. This code runs inside a hidden
 * iframe on a different origin from both the game and the worker, which means
 * every way it can fail is a way an agent gets an unhelpful answer with
 * nobody watching. So each of them is pinned to text a model can act on,
 * exactly as `apps/game`'s client does for the same reason.
 *
 * The `409` case is the one that looks like an error and is not: it is the
 * game refusing in a sentence written to be recovered from, and it has to
 * reach the agent verbatim.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { manual, stationLog, stationRefFrom } from "./station.js";

const REF = { workerOrigin: "https://worker.example", sessionId: "s_1" };

/** A tool-shaped response, as every session route answers. */
function toolBody(text: string, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve({ content: [{ type: "text", text }] }),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stationRefFrom", () => {
  it("reads the session and the worker origin the embed carries", () => {
    expect(stationRefFrom("?session=s_1&worker=https://worker.example")).toEqual(REF);
  });

  it("is null unless both are present, because either alone is unusable", () => {
    expect(stationRefFrom("?session=s_1")).toBeNull();
    expect(stationRefFrom("?worker=https://worker.example")).toBeNull();
    expect(stationRefFrom("")).toBeNull();
    expect(stationRefFrom("?session=+&worker=https://worker.example")).toBeNull();
  });
});

describe("manual", () => {
  it("reads the requested section off the session's own route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(toolBody("SECTION: GLYPH TABLE"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await manual(REF, "glyph_table")).toBe("SECTION: GLYPH TABLE");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://worker.example/session/s_1/manual?section=glyph_table");
    expect(init.method).toBe("GET");
  });

  it("escapes a session id rather than pasting it into a path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(toolBody("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await manual({ ...REF, sessionId: "a/b?c" }, "index");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://worker.example/session/a%2Fb%3Fc/manual?section=index",
    );
  });

  it("passes a 409 refusal through untouched", async () => {
    const refusal = "E_INVALID_INPUT: section must be one of index, station, airlock";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(toolBody(refusal, 409)));
    expect(await manual(REF, "nonsense")).toBe(refusal);
  });
});

describe("stationLog", () => {
  it("posts the entry, because reading one is what records it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(toolBody("Entry 1 of 9: ..."));
    vi.stubGlobal("fetch", fetchMock);

    expect(await stationLog(REF, 1)).toBe("Entry 1 of 9: ...");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://worker.example/session/s_1/read_station_log");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ entry: 1 }));
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });
});

describe("when the line to the machine deck is down", () => {
  it("answers a network failure with something an agent can retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await manual(REF, "index")).toMatch(/try the call again/i);
  });

  it("answers a server fault with the status and a retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(toolBody("", 500)));
    expect(await stationLog(REF, 1)).toMatch(/fault \(500\)/);
  });

  it("answers a 404 the same way rather than reading a routing miss as content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(toolBody("", 404)));
    expect(await manual(REF, "index")).toMatch(/fault \(404\)/);
  });

  it("answers an unreadable body without throwing at the agent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token <")),
      } as unknown as Response),
    );
    expect(await manual(REF, "index")).toMatch(/could not read/i);
  });

  it("answers an empty envelope with an empty string, not the word undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as unknown as Response),
    );
    expect(await manual(REF, "index")).toBe("");
  });
});
