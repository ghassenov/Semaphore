/**
 * The only module in this app that touches the WebMCP specification.
 *
 * The draft has moved four times in six months (doc 03 section 1), so every
 * call into `document.modelContext` is funnelled through here. When the spec
 * changes, the cost is this file rather than fifty call sites. Nothing else in
 * `apps/game` may reference `modelContext`, and a grep for it that returns
 * more than this file is a defect.
 *
 * Three behaviours everything downstream assumes were exercised live by
 * `apps/spike` on 2026-08-28 against Chrome 151 (doc 11 sections 1 and 2).
 * Two hold: `AbortSignal` teardown really removes a tool, and `toolchange`
 * really fires when the registry drains to zero. The third does not.
 * `execute` receives **one** argument, an input object, and no
 * `ToolExecuteCallbackOptions` and therefore no `AbortSignal`, which reverses
 * what D-007 read out of the IDL. See D-024.
 *
 * One caveat that shapes the ending: a tool registered **declaratively**, by
 * a form's `toolname` attribute, is not removed by aborting a signal. Its
 * lifetime is the element's, so it leaves the registry when the form leaves
 * the DOM. Anything that needs the registry genuinely empty has to do both.
 *
 * **No function here throws when WebMCP is absent.** Graceful degradation is a
 * hard requirement, not a nicety: for some judges the gate screen is the whole
 * submission, and a page that throws on load has no gate screen. Every export
 * returns a null, a false, or an empty list instead.
 */

/** What a tool's `execute` resolves to. Text or JSON only: no images, no streaming. */
export interface ToolResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
}

/**
 * The second argument to `execute`, per the draft IDL's
 * `ToolExecuteCallbackOptions`.
 *
 * **Chrome 151 does not pass it** (doc 11 section 2, verified twice: through
 * the page-side `executeTool` helper and through a real host invocation).
 * Every field is therefore optional and every consumer must treat the whole
 * argument as absent. It is declared rather than deleted because the IDL
 * specifies it, ChatGPT's in-app browser is a second target and has not been
 * tested, and an optional parameter nobody passes costs nothing (D-024).
 */
export interface ExecuteContext {
  readonly signal?: AbortSignal;
}

/**
 * A tool as the registry wants it.
 *
 * `annotations` is the pair the spec defines and the pair this game means:
 * `readOnlyHint` is false for anything that moves the station, and
 * `untrustedContentHint` marks the three genuinely adversarial channels
 * (the vandalised manual, the ghost logs, PILOT's notepad) rather than being
 * applied as hygiene.
 */
export interface RegisteredTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /**
   * A JSON Schema object. Typed as `object` rather than a schema model
   * because this file's job is to hand the registry what the spec asks for,
   * not to re-declare JSON Schema; `tool.ts` holds our narrower `InputSchema`
   * and every authored tool is written against that.
   */
  readonly inputSchema: object;
  readonly annotations?: {
    readonly readOnlyHint?: boolean;
    readonly untrustedContentHint?: boolean;
  };
  /**
   * Called with the input object when an agent invokes the tool. Input
   * arrives as a plain object on the host path, which is the only path the
   * game uses; the page-side `executeTool` testing helper instead requires a
   * JSON string (doc 11 section 2). Anything driving tools directly, such as
   * the benchmark harness, has to serialise.
   */
  execute(input: Record<string, unknown>, context?: ExecuteContext): Promise<ToolResult>;
}

/**
 * The slice of the registry this app uses. Deliberately not the whole surface.
 *
 * The listener pair is **optional**, and that is not defensive typing: the
 * deployed site met a host exposing `registerTool` and `getTools` on a plain
 * object that is not an `EventTarget`, and assuming otherwise threw during
 * startup and cost the page its whole station (D-085).
 */
interface ModelContext {
  registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }): Promise<unknown>;
  getTools(options?: {
    fromOrigins?: readonly string[];
  }): Promise<readonly { readonly name: string }[]>;
  addEventListener?: EventTarget["addEventListener"];
  removeEventListener?: EventTarget["removeEventListener"];
}

/** Hosts that expose the registry in either of the two documented places. */
interface WebMcpHost {
  modelContext?: unknown;
}

/**
 * The live registry, or null when this browser has no WebMCP.
 *
 * `document.modelContext` first, `navigator.modelContext` second: the latter
 * is a deprecated alias kept only as a feature-detection fallback (doc 03
 * section 1). The `registerTool` check is not ceremony - a host that exposes
 * the property without the method exists in the wild, and treating it as
 * present would take the gate screen away from the browsers that need it.
 */
export function getModelContext(): ModelContext | null {
  const candidate =
    (document as unknown as WebMcpHost).modelContext ??
    (navigator as unknown as WebMcpHost).modelContext;
  if (!candidate || typeof candidate !== "object") return null;
  const mc = candidate as Partial<ModelContext>;
  return typeof mc.registerTool === "function" && typeof mc.getTools === "function"
    ? (candidate as ModelContext)
    : null;
}

/** Whether this browser can play at all. The gate screen's only question. */
export function isSupported(): boolean {
  return getModelContext() !== null;
}

/**
 * Register one tool for the lifetime of `signal`.
 *
 * There is no `unregisterTool`: aborting the signal is the only removal path
 * the spec offers, which is the constraint the entire game is built on. The
 * caller therefore owns the controller, and this function never keeps one.
 *
 * Resolves false rather than throwing when there is no registry, so a caller
 * can register a whole tier without guarding every line.
 */
export async function registerTool(tool: RegisteredTool, signal: AbortSignal): Promise<boolean> {
  const mc = getModelContext();
  if (!mc) return false;
  await mc.registerTool(tool, { signal });
  return true;
}

/**
 * The names currently in the registry, read from the registry itself.
 *
 * The manifest panel and KEEPER's body both render from this call rather than
 * from a parallel record of what was just registered (doc 03 section 4.2).
 * That is the whole point of the panel: if a registration silently fails, the
 * panel shows the truth and we find the bug, instead of the panel confidently
 * showing what we intended.
 *
 * `fromOrigins` is what makes that still true once the archive origin is
 * embedded. The spike found that a default `getTools()` does **not** include a
 * cross-origin frame's tools even when both `allow="tools"` and `exposedTo`
 * are satisfied: the consumer has to ask (doc 11 section 4, Chrome 151). A
 * panel that did not ask would quietly under-report KEEPER's own faculties,
 * which is the one failure this panel exists to make impossible.
 *
 * Passed only when there is an origin to ask about, because a `getTools`
 * implementation that does not know the option should be handed nothing
 * rather than an empty array to interpret.
 */
export async function listToolNames(
  fromOrigins: readonly string[] = [],
): Promise<readonly string[]> {
  const mc = getModelContext();
  if (!mc) return [];
  try {
    const tools = await (fromOrigins.length > 0 ? mc.getTools({ fromOrigins }) : mc.getTools());
    return tools.map((tool) => tool.name);
  } catch {
    // A host that rejects the option is a host with no cross-origin tools to
    // report, and the panel should still show this page's own.
    return (await mc.getTools()).map((tool) => tool.name);
  }
}

/**
 * Subscribe to registry changes. Returns the unsubscribe function.
 *
 * One listener, two renderings: the brass manifest plate that proves the
 * change and KEEPER's body that makes it felt. Both read `listToolNames`
 * inside the callback for the reason above.
 */
export function onToolChange(listener: () => void): () => void {
  const mc = getModelContext();
  // A host can implement the registry without being an EventTarget, and one
  // in production does. It still plays; it just cannot announce a change, so
  // the callers that need a live manifest refresh on state instead.
  if (typeof mc?.addEventListener !== "function") return () => {};
  mc.addEventListener("toolchange", listener);
  return () => {
    mc.removeEventListener?.("toolchange", listener);
  };
}

/**
 * The declarative half of the specification, which is the other API.
 *
 * A form carrying `toolname`, `tooldescription` and `toolparamdescription`
 * registers a tool whose parameters are built from its own field names. No
 * JavaScript registers it and no signal removes it: the element **is** the
 * registration, verified on 2026-08-28 in Chrome 151 (doc 11 section 8).
 *
 * The rule for which API to use is doc 03 section 8's, and it is the project's
 * own contribution rather than something the spec says:
 *
 *   Declarative for tools that are a form the human can also submit, where
 *   agent and human do the same thing through the same affordance.
 *   Imperative for tools that are pure agent capability, where the agent does
 *   something the human structurally cannot.
 *
 * The notepad is the only tool in the game on the first side of that line.
 */

/** The attributes that turn a `<form>` into a tool. One place, one spelling. */
export interface FormToolSpec {
  readonly name: string;
  readonly description: string;
  /** Field name to its `toolparamdescription`. Order is the form's own. */
  readonly params: Readonly<Record<string, string>>;
  /**
   * Whether the host may submit the form without a human confirming.
   *
   * Reaches the registry as `annotations: { autosubmit: true }`. Its effect on
   * an actual agent submission is one of the rows doc 11 cannot fill without
   * a model.
   */
  readonly autoSubmit: boolean;
}

/**
 * Apply a spec to a form element, registering it as a tool.
 *
 * Returns a teardown that removes the element from the document, because that
 * is the only thing that removes a declaratively registered tool. Aborting a
 * signal will not do it, and the game's last beat is an empty registry.
 *
 * Sets attributes rather than taking pre-marked HTML so that the descriptions
 * live in a TypeScript object the budget test can measure, alongside every
 * other tool's. A description written into a template is a description nothing
 * checks.
 */
export function registerFormTool(form: HTMLFormElement, spec: FormToolSpec): () => void {
  form.setAttribute("toolname", spec.name);
  form.setAttribute("tooldescription", spec.description);
  if (spec.autoSubmit) form.setAttribute("toolautosubmit", "");
  for (const [field, description] of Object.entries(spec.params)) {
    // `elements` rather than a query, so a field named in the spec but absent
    // from the form is a silent no-op here and a visible gap in `getTools()`,
    // which is where a mismatch should show up.
    const control = form.elements.namedItem(field);
    if (control instanceof HTMLElement) control.setAttribute("toolparamdescription", description);
  }
  return () => {
    form.remove();
  };
}

/**
 * Whether a submit event came from an agent rather than a hand.
 *
 * `SubmitEvent.agentInvoked` is the whole basis of the notepad's per-line
 * authorship: it is the only signal that distinguishes the two parties using
 * the same affordance, and without it the pad would be a shared surface with
 * no idea who said what.
 *
 * Reads defensively because the property is new, is not yet in every target,
 * and is one of the rows doc 11 has not been able to fill: a synthetic submit
 * only ever proves the human branch. An absent property reads as a human
 * submission, which is the safer default - attributing a human's line to the
 * agent would put words in a partner's mouth.
 */
export function isAgentSubmission(event: SubmitEvent): boolean {
  return (event as SubmitEvent & { agentInvoked?: unknown }).agentInvoked === true;
}

/**
 * Answer an agent's submission with text, where the host offers the hook.
 *
 * `SubmitEvent.respondWith` is how a declarative tool returns something to the
 * caller; without it an agent submitting the form learns only that it
 * submitted. Guarded because it is untested against a real agent submission,
 * and a missing hook must not turn a written note into a thrown error.
 */
export function respondToSubmission(event: SubmitEvent, text: Promise<string>): boolean {
  const respondWith = (event as SubmitEvent & { respondWith?: (value: Promise<string>) => void })
    .respondWith;
  if (typeof respondWith !== "function") return false;
  respondWith.call(event, text);
  return true;
}
