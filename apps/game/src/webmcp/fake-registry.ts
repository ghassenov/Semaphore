/**
 * A stand-in for `document.modelContext`, so the tool layer can be proved in
 * Node.
 *
 * It implements the three behaviours the game rests on and nothing else:
 * `registerTool` honours the `AbortSignal`, aborting removes the tool, and
 * `toolchange` fires on both. `apps/spike` verified all three against Chrome
 * 151 on 2026-08-28 (doc 11 sections 1 and 2), so this fake is now known to
 * agree with a real browser on the behaviour it models rather than merely
 * assumed to.
 *
 * Two things it deliberately does **not** model, both found by that same run.
 *
 * A real `execute` is called with one argument. This fake passes a second
 * only when a caller hands `call()` a signal, which no browser does today;
 * that path exists to drive the director's cancellation branch directly. See
 * D-024 for why the branch is kept.
 *
 * A declaratively registered tool - one a form's `toolname` attribute created
 * - does not leave a real registry when a signal aborts, only when the form
 * leaves the DOM. There are no forms here, so nothing in this file can catch
 * a regression in that; `ToolDirector.endSession` carries the requirement in
 * its own docstring instead.
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
    // One argument unless a signal was explicitly asked for, which is what
    // Chrome 151 actually does. Passing `{}` unconditionally would make a
    // tool that reads `context.signal` look supported when it is not.
    const result = (await (signal ? tool.execute(input, { signal }) : tool.execute(input))) as {
      content?: { text?: string }[];
    };
    return result.content?.[0]?.text ?? "";
  }

  /** What the adapter feature-detects against. */
  asModelContextHost(): { modelContext: FakeRegistry } {
    return { modelContext: this };
  }
}
