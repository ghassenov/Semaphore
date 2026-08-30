/**
 * The one piece of the replay viewer that can be wrong without a browser.
 *
 * `renderReplay` builds DOM against a fetched payload and is checked by the
 * browser proof, where it can actually be looked at. This is the route match,
 * which decides whether the page is a replay at all and is the thing that
 * would silently turn the whole game into a viewer if it were too greedy.
 */

import { describe, expect, it } from "vitest";
import { replayIdFrom } from "./replay.js";

describe("replayIdFrom", () => {
  it("reads the canonical /replay?id= form", () => {
    // The form every link hands out, because it is the one that loads under
    // `base: "./"` from a sub-path as well as from an origin root.
    expect(replayIdFrom("/replay", "?id=abc-123")).toBe("abc-123");
    expect(replayIdFrom("/replay/", "?id=abc-123")).toBe("abc-123");
    expect(replayIdFrom("/replay", "?id=seed%20with%20spaces")).toBe("seed with spaces");
  });

  it("refuses the /replay/:id path form, which cannot work in production", () => {
    // Two independent failures, both invisible in development: relative asset
    // paths resolve against `/replay/` and 404, and the worker's API answers
    // on the same URL with a cache-control header, so a navigation gets the
    // cached JSON instead of the app. Accepting it would half-support a shape
    // that comes up blank for anybody who shares it.
    expect(replayIdFrom("/replay/abc-123")).toBeNull();
    expect(replayIdFrom("/replay/abc-123/")).toBeNull();
  });

  it("does not claim any other path", () => {
    // If this ever matched "/", the game would become a replay viewer that
    // could not load a replay, on every visit.
    for (const path of ["/", "/index.html", "/replay/a/b", "/replays/x"]) {
      expect(replayIdFrom(path)).toBeNull();
    }
    // `/replay` with no id is not a replay either: there is nothing to fetch.
    expect(replayIdFrom("/replay")).toBeNull();
    expect(replayIdFrom("/replay/", "?id=")).toBeNull();
    // A seed on the game's own URL must never turn the game into a viewer.
    expect(replayIdFrom("/", "?id=abc-123")).toBeNull();
  });
});
