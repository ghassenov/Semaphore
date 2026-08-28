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
 * leaves the DOM. This fake **does** model that, because the game's ending
 * depends on it: `getTools()` unions the imperatively registered tools with
 * every `form[toolname]` currently in the document, and a `MutationObserver`
 * fires `toolchange` when one is added or removed. Aborting a signal cannot
 * remove a form here any more than it can in Chrome, which is the point.
 *
 * Modelling it needs a document, so the tests that exercise the notepad
 * declare `@vitest-environment happy-dom`. Everything else still runs in bare
 * Node against the replaced-global path below.
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

  // In a DOM environment the document is real and has to stay real: the
  // notepad is an element in it. Attach `modelContext` to the document that is
  // already there rather than replacing it with a stand-in, and let the
  // registry watch that document for declaratively registered forms.
  const existing = (globalThis as { document?: Document }).document;
  if (existing && typeof existing.createElement === "function") {
    const host = existing as Document & { modelContext?: unknown };
    const had = "modelContext" in host;
    host.modelContext = registry;
    registry.watchDocument(existing);
    registry.uninstall = () => {
      registry.stopWatching();
      if (!had) delete host.modelContext;
    };
    return registry;
  }

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
  #doc: Document | null = null;
  #observer: MutationObserver | null = null;

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

  /**
   * Watch a document for declaratively registered forms.
   *
   * A `form[toolname]` in the document *is* a registered tool, so the registry
   * has to reflect the DOM rather than a list it keeps. The observer is what
   * turns adding or removing one into a `toolchange`, which is exactly what
   * the real browser does and what the game's last beat listens for.
   */
  watchDocument(doc: Document): void {
    this.#doc = doc;
    this.#observer = new MutationObserver(() => {
      this.dispatchEvent(new Event("toolchange"));
    });
    this.#observer.observe(doc.body ?? doc, { childList: true, subtree: true });
  }

  stopWatching(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#doc = null;
  }

  /** Names of every form in the watched document that declares a tool. */
  #formToolNames(): string[] {
    if (!this.#doc) return [];
    return [...this.#doc.querySelectorAll("form[toolname]")]
      .map((form) => form.getAttribute("toolname") ?? "")
      .filter((name) => name.length > 0);
  }

  getTools(): Promise<readonly { name: string }[]> {
    return Promise.resolve(this.names().map((name) => ({ name })));
  }

  /**
   * The tool names currently registered, imperative first.
   *
   * The union is the whole point: the two APIs land in one registry and are
   * indistinguishable in `getTools()` apart from their annotations (doc 11
   * section 8). A caller cannot tell which half a name came from, and should
   * not be able to.
   */
  names(): string[] {
    return [...this.#tools.keys(), ...this.#formToolNames()];
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
