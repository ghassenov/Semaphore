/**
 * A stand-in for `document.modelContext`, so the tool layer can be proved in
 * Node.
 *
 * It implements the three behaviours the game rests on and nothing else:
 * `registerTool` honours the `AbortSignal`, aborting removes the tool, and
 * `toolchange` fires on both. Those are exactly the behaviours `apps/spike`
 * exists to verify in a real browser, and this file is what lets the *logic*
 * built on top of them be tested without one. If the spike finds the browser
 * disagrees with any of the three, this file is wrong and the tests around it
 * are measuring the wrong thing - which is the honest place for that risk to
 * sit, and it is written down here rather than assumed.
 *
 * Shipped in `src/` rather than beside one test because both the director's
 * tests and the budget tests install it, and because a fake that drifts from
 * the adapter's expectations is a fake that hides a defect.
 */

export interface FakeTool {
  readonly name: string;
  execute(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<unknown>;
}

/**
 * Install a fake registry on `globalThis.document` and return a handle to it.
 *
 * Returns a teardown function; call it in `afterEach` so one test's registry
 * cannot be another test's starting state.
 */
export function installFakeRegistry(): FakeRegistry {
  const registry = new FakeRegistry();
  // `defineProperty` rather than assignment: Node defines `globalThis.navigator`
  // as a getter with no setter, so a plain write throws.
  const restoreDocument = define("document", registry.asModelContextHost());
  const restoreNavigator = define("navigator", {});
  registry.uninstall = () => {
    restoreNavigator();
    restoreDocument();
  };
  return registry;
}

/** Replace one global, returning the function that puts it back. */
function define(key: string, value: unknown): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return () => {
    if (previous) Object.defineProperty(globalThis, key, previous);
    else delete (globalThis as unknown as Record<string, unknown>)[key];
  };
}

export class FakeRegistry extends EventTarget {
  readonly #tools = new Map<string, FakeTool>();
  /** Every registration this registry ever saw, so a test can assert re-registration. */
  readonly registrations: string[] = [];
  uninstall: () => void = () => {};

  registerTool(tool: FakeTool, options?: { signal?: AbortSignal }): Promise<void> {
    // An already-aborted signal registers nothing, which is what a real
    // registry does and what makes a stale controller harmless.
    if (options?.signal?.aborted) return Promise.resolve();
    this.#tools.set(tool.name, tool);
    this.registrations.push(tool.name);
    options?.signal?.addEventListener("abort", () => {
      this.#tools.delete(tool.name);
      this.dispatchEvent(new Event("toolchange"));
    });
    this.dispatchEvent(new Event("toolchange"));
    return Promise.resolve();
  }

  getTools(): Promise<readonly { name: string }[]> {
    return Promise.resolve([...this.#tools.keys()].map((name) => ({ name })));
  }

  /** The tool names currently registered, in registration order. */
  names(): string[] {
    return [...this.#tools.keys()];
  }

  /** Call one registered tool the way a host would. */
  async call(
    name: string,
    input: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<string> {
    const tool = this.#tools.get(name);
    if (!tool) throw new Error(`No tool named ${name} is registered`);
    const result = (await tool.execute(input, signal ? { signal } : {})) as {
      content?: { text?: string }[];
    };
    return result.content?.[0]?.text ?? "";
  }

  /** What the adapter feature-detects against. */
  asModelContextHost(): { modelContext: FakeRegistry } {
    return { modelContext: this };
  }
}
