/**
 * The archive origin's registry, and the reason it diffs rather than
 * rebuilds.
 *
 * `read_manual` lasts the whole shift and `read_station_log` exists only
 * during the Archive beat, so the set this origin holds changes twice with
 * one of the two tools unchanged. Aborting and re-registering the pair each
 * time would work, in the sense that the right tools would end up registered;
 * it would also mean that every time the pair reached the Archive, KEEPER's
 * manual briefly ceased to exist. The registry is the game's own UI, and a
 * flicker in it is a lie about what KEEPER can do.
 *
 * `exposedTo` is checked on every registration because it is one of the three
 * gates cross-origin delegation needs and the only one this side owns.
 */

import { describe, expect, it, vi } from "vitest";
import { DOCUMENT_TOOL_NAMES } from "@semaphore/protocol";
import { Registrar, type RegisteredTool, type Registry } from "./registrar.js";

const PARENT = "https://game.example";

/** A registry that records what it was given and honours the abort signal. */
function fakeRegistry() {
  const live = new Map<string, RegisteredTool>();
  const calls: { name: string; exposedTo: readonly string[] }[] = [];
  const registry: Registry = {
    registerTool(tool, options) {
      live.set(tool.name, tool);
      calls.push({ name: tool.name, exposedTo: options.exposedTo });
      options.signal.addEventListener("abort", () => live.delete(tool.name));
      return Promise.resolve(undefined);
    },
  };
  return { registry, live, calls, names: () => [...live.keys()] };
}

const runners = {
  read_manual: vi.fn(async (input: Record<string, unknown>) => `manual:${String(input.section)}`),
  read_station_log: vi.fn(async (input: Record<string, unknown>) => `log:${String(input.entry)}`),
};

describe("Registrar", () => {
  it("registers exactly the set it is asked for", async () => {
    const fake = fakeRegistry();
    const registrar = new Registrar(fake.registry, PARENT, runners);

    await registrar.apply(["read_manual"]);
    expect(fake.names()).toEqual(["read_manual"]);
    expect(registrar.registered).toEqual(["read_manual"]);
  });

  it("pins exposedTo to the one origin that embedded it", async () => {
    const fake = fakeRegistry();
    await new Registrar(fake.registry, PARENT, runners).apply(DOCUMENT_TOOL_NAMES);
    for (const call of fake.calls) expect(call.exposedTo).toEqual([PARENT]);
  });

  it("adds the second tool without disturbing the first", async () => {
    const fake = fakeRegistry();
    const registrar = new Registrar(fake.registry, PARENT, runners);

    await registrar.apply(["read_manual"]);
    const before = fake.live.get("read_manual");
    await registrar.apply(["read_manual", "read_station_log"]);

    expect(fake.names()).toEqual(["read_manual", "read_station_log"]);
    // The same object, never re-registered: one controller per tool is the
    // whole point, and this is the assertion that would fail without it.
    expect(fake.live.get("read_manual")).toBe(before);
    expect(fake.calls.filter((call) => call.name === "read_manual")).toHaveLength(1);
  });

  it("removes what is no longer wanted, and keeps what is", async () => {
    const fake = fakeRegistry();
    const registrar = new Registrar(fake.registry, PARENT, runners);

    await registrar.apply(DOCUMENT_TOOL_NAMES);
    await registrar.apply(["read_manual"]);

    expect(fake.names()).toEqual(["read_manual"]);
    expect(registrar.registered).toEqual(["read_manual"]);
  });

  it("drains to empty, which is what the ending needs", async () => {
    const fake = fakeRegistry();
    const registrar = new Registrar(fake.registry, PARENT, runners);

    await registrar.apply(DOCUMENT_TOOL_NAMES);
    await registrar.apply([]);

    expect(fake.names()).toEqual([]);
    expect(registrar.registered).toEqual([]);
  });

  it("is idempotent, so a repeated message registers nothing", async () => {
    const fake = fakeRegistry();
    const registrar = new Registrar(fake.registry, PARENT, runners);

    await registrar.apply(["read_manual"]);
    await registrar.apply(["read_manual"]);
    await registrar.apply(["read_manual"]);

    expect(fake.calls).toHaveLength(1);
  });

  it("drops a name it has no runner for rather than registering a stub", async () => {
    const fake = fakeRegistry();
    const registrar = new Registrar(fake.registry, PARENT, { read_manual: runners.read_manual });

    await registrar.apply(DOCUMENT_TOOL_NAMES);

    expect(fake.names()).toEqual(["read_manual"]);
  });

  it("wraps the runner's text in the spec's result envelope", async () => {
    const fake = fakeRegistry();
    await new Registrar(fake.registry, PARENT, runners).apply(["read_station_log"]);

    const tool = fake.live.get("read_station_log");
    expect(await tool?.execute({ entry: 3 })).toEqual({
      content: [{ type: "text", text: "log:3" }],
    });
  });

  it("carries the shared spec's copy and annotations, not a local copy", async () => {
    const fake = fakeRegistry();
    await new Registrar(fake.registry, PARENT, runners).apply(["read_manual"]);

    const tool = fake.live.get("read_manual");
    expect(tool?.description).toContain("not all annotations are trustworthy");
    expect(tool?.annotations.untrustedContentHint).toBe(true);
  });

  it("is a no-op on a browser with no registry, and still reports honestly", async () => {
    const registrar = new Registrar(null, PARENT, runners);
    await expect(registrar.apply(DOCUMENT_TOOL_NAMES)).resolves.toBeUndefined();
    // The names are tracked either way: nothing downstream should have to
    // branch on whether this browser can play.
    expect(registrar.registered).toEqual(DOCUMENT_TOOL_NAMES);
  });
});
