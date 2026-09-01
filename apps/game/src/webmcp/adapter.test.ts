/**
 * The adapter's one hard requirement: on a browser with no WebMCP, nothing
 * here throws.
 *
 * Graceful degradation is not a nicety. For some judges the gate screen is the
 * entire submission (doc 07 section 6), and a page that throws during feature
 * detection has no gate screen to show them. Every export returns a null, a
 * false, or an empty list instead.
 *
 * The positive cases are covered by `director.test.ts`, which drives the whole
 * registry through a session; what is tested here is only the absence path and
 * the feature detection that decides between them.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  getModelContext,
  isSupported,
  listToolNames,
  onToolChange,
  registerTool,
} from "./adapter.js";
import { installFakeRegistry, type FakeRegistry } from "./fake-registry.js";

let installed: FakeRegistry | null = null;

/** Put a host object in place with whatever `modelContext` this test wants. */
function withHost(document: unknown, navigator: unknown = {}): () => void {
  const restore = [define("document", document), define("navigator", navigator)];
  return () => restore.reverse().forEach((undo) => undo());
}

function define(key: string, value: unknown): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return () => {
    if (previous) Object.defineProperty(globalThis, key, previous);
    else delete (globalThis as unknown as Record<string, unknown>)[key];
  };
}

afterEach(() => {
  installed?.uninstall();
  installed = null;
});

describe("feature detection", () => {
  it("finds the registry on document first", () => {
    installed = installFakeRegistry();
    expect(isSupported()).toBe(true);
    expect(getModelContext()).not.toBeNull();
  });

  it("falls back to navigator, the deprecated alias", () => {
    const registry = installFakeRegistry();
    installed = registry;
    const restore = withHost({}, { modelContext: registry });
    expect(isSupported()).toBe(true);
    restore();
  });

  it("rejects a host that has the property but not the methods", () => {
    const restore = withHost({ modelContext: { registerTool: "not a function" } });
    expect(isSupported()).toBe(false);
    restore();
    // A half-implemented host would otherwise take the gate screen away from
    // exactly the browser that needs it.
  });

  it("reports unsupported when there is no property at all", () => {
    const restore = withHost({});
    expect(isSupported()).toBe(false);
    restore();
  });
});

describe("degradation", () => {
  it("never throws with no registry present", async () => {
    const restore = withHost({});
    const tool = {
      name: "spike_noop",
      title: "No-op",
      description: "Registers nothing.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => Promise.resolve({ content: [{ type: "text" as const, text: "" }] }),
    };

    await expect(registerTool(tool, new AbortController().signal)).resolves.toBe(false);
    await expect(listToolNames()).resolves.toEqual([]);
    // The unsubscribe an absent registry hands back is still callable.
    expect(() => onToolChange(() => {})()).not.toThrow();
    restore();
  });

  it("survives a registry that is not an EventTarget", () => {
    // The live site met exactly this host: both methods present, no listener
    // pair, and `onToolChange` threw during startup and took the station with
    // it (D-085). The page must still count as supported and still come up.
    const restore = withHost({
      modelContext: {
        registerTool: () => Promise.resolve(),
        getTools: () => Promise.resolve([]),
      },
    });
    expect(isSupported()).toBe(true);
    expect(() => onToolChange(() => {})()).not.toThrow();
    restore();
  });
});
