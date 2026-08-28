/**
 * The allowlist, and the two ways it could quietly become a wildcard.
 *
 * This module exists because `apps/archive` is a third origin by design and
 * has to be able to call these routes. The failure that matters is not "the
 * archive is blocked", which is loud and obvious the first time anyone runs
 * it; it is the opposite, an endpoint that answers everybody, which nothing
 * about playing the game would ever reveal. So the tests here are mostly
 * about what does *not* get a header.
 */

import { describe, expect, it } from "vitest";
import { allowedOrigins, corsHeaders, preflight, withCors } from "./cors.js";

const ALLOWED = ["https://game.example", "https://archive.example"];

describe("allowedOrigins", () => {
  it("parses a comma-separated list, trimming and dropping blanks", () => {
    expect(allowedOrigins(" https://a.example , ,https://b.example ")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("is empty when unset, which means same-origin only", () => {
    expect(allowedOrigins(undefined)).toEqual([]);
    expect(allowedOrigins("")).toEqual([]);
  });
});

describe("corsHeaders", () => {
  it("reflects an allowed origin, and only that origin", () => {
    const headers = corsHeaders("https://archive.example", ALLOWED);
    expect(headers["access-control-allow-origin"]).toBe("https://archive.example");
    expect(headers["access-control-allow-headers"]).toBe("content-type");
  });

  it("varies on Origin, so a cache cannot widen the allowlist", () => {
    expect(corsHeaders("https://game.example", ALLOWED).vary).toBe("Origin");
  });

  it("never answers with a wildcard", () => {
    for (const origin of [...ALLOWED, "https://evil.example", null]) {
      expect(Object.values(corsHeaders(origin, ALLOWED))).not.toContain("*");
    }
  });

  it("gives an unlisted origin nothing at all", () => {
    expect(corsHeaders("https://evil.example", ALLOWED)).toEqual({});
  });

  it("gives every origin nothing when the list is empty", () => {
    expect(corsHeaders("https://game.example", [])).toEqual({});
  });

  it("matches on the whole origin, not a prefix or a suffix", () => {
    // `https://game.example.evil.test` ends with nothing useful, but a naive
    // `endsWith` or `includes` check would let one of these through.
    for (const origin of [
      "https://game.example.evil.test",
      "https://evil.test/https://game.example",
      "http://game.example",
      "https://game.example:8443",
    ]) {
      expect(corsHeaders(origin, ALLOWED)).toEqual({});
    }
  });

  it("never offers credentials, because nothing here uses any", () => {
    expect(corsHeaders("https://game.example", ALLOWED)).not.toHaveProperty(
      "access-control-allow-credentials",
    );
  });
});

describe("preflight", () => {
  it("answers OPTIONS from an allowed origin with the headers", () => {
    const request = new Request("https://worker.example/session/s/manual", {
      method: "OPTIONS",
      headers: { origin: "https://archive.example" },
    });
    const response = preflight(request, ALLOWED);
    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-origin")).toBe("https://archive.example");
    expect(response?.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("answers a disallowed origin without them, which is what makes the browser refuse", () => {
    const request = new Request("https://worker.example/session/s/manual", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    });
    const response = preflight(request, ALLOWED);
    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("is not a preflight for anything but OPTIONS", () => {
    for (const method of ["GET", "POST"]) {
      const request = new Request("https://worker.example/session/s/manual", { method });
      expect(preflight(request, ALLOWED)).toBeNull();
    }
  });
});

describe("withCors", () => {
  it("adds the headers without disturbing the body or the status", async () => {
    const original = Response.json({ content: [{ type: "text", text: "hello" }] }, { status: 409 });
    const wrapped = withCors(original, corsHeaders("https://game.example", ALLOWED));
    expect(wrapped.status).toBe(409);
    expect(wrapped.headers.get("access-control-allow-origin")).toBe("https://game.example");
    expect(await wrapped.json()).toEqual({ content: [{ type: "text", text: "hello" }] });
  });

  it("returns the same response untouched when there are no headers to add", () => {
    const original = new Response("Not found", { status: 404 });
    expect(withCors(original, {})).toBe(original);
  });
});
