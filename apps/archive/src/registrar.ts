/**
 * This origin's entire contact with the WebMCP specification, and the thing
 * that keeps its registry equal to whatever the game last asked for.
 *
 * The repo rule is one adapter module per app (repo CLAUDE.md section 5), for
 * a draft that has moved four times in six months. This is that module for
 * `apps/archive`, and it is small because this origin does exactly one thing:
 * register up to two read-only document tools, exposed to one origin.
 *
 * **One controller per tool, not one per apply.** The two document tools have
 * different lifetimes - `read_manual` lasts the whole shift, and
 * `read_station_log` exists only during the Archive beat - so re-registering
 * the whole set on every change would abort and re-add `read_manual` each
 * time. That would fire `toolchange` on the parent for a tool that never went
 * anywhere, and for a moment the registry would be telling an agent that its
 * manual had been taken away. Diffing costs a Map and tells the truth.
 */

import { DOCUMENT_TOOLS, type ToolSpec } from "@semaphore/protocol";

/** What a tool's `execute` resolves to. Text only: no images, no streaming. */
export interface ToolResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
}

/** A tool as the registry wants it, with `execute` bound. */
export interface RegisteredTool extends ToolSpec {
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * The slice of the registry this app uses.
 *
 * `exposedTo` is the half of cross-origin delegation this side owns: the
 * embed's `allow="tools"` lets registration happen at all, and this narrows
 * who can see the result back to the one origin that embedded us. The
 * consumer still has to ask via `getTools({ fromOrigins })`; all three gates
 * were verified together on Chrome 151 (doc 11 section 4).
 */
export interface Registry {
  registerTool(
    tool: RegisteredTool,
    options: { signal: AbortSignal; exposedTo: readonly string[] },
  ): Promise<unknown>;
}

/** The live registry, or null when this browser has no WebMCP. Never throws. */
export function getRegistry(): Registry | null {
  const host = document as unknown as { modelContext?: unknown };
  const alias = navigator as unknown as { modelContext?: unknown };
  const candidate = host.modelContext ?? alias.modelContext;
  if (!candidate || typeof candidate !== "object") return null;
  const registry = candidate as Partial<Registry>;
  return typeof registry.registerTool === "function" ? (candidate as Registry) : null;
}

/** How each document tool is fulfilled, keyed by tool name. */
export type Runners = Readonly<Record<string, (input: Record<string, unknown>) => Promise<string>>>;

/** Keeps this origin's registry equal to the set the game last asked for. */
export class Registrar {
  readonly #live = new Map<string, AbortController>();

  constructor(
    private readonly registry: Registry | null,
    private readonly exposedTo: string,
    private readonly runners: Runners,
  ) {}

  /** The tool names currently registered here, for the page's status line and the tests. */
  get registered(): readonly string[] {
    return [...this.#live.keys()];
  }

  /**
   * Make the registry hold exactly `names`, adding and removing the
   * difference. Idempotent: applying the same set twice registers nothing.
   *
   * A name with no runner is dropped rather than registered with a stub. The
   * message shape is already checked against `DOCUMENT_TOOL_NAMES` at the
   * boundary, so reaching here with one would be our own defect, and a tool
   * that answers nothing is worse than a tool that is honestly absent.
   */
  async apply(names: readonly string[]): Promise<void> {
    const wanted = new Set(names.filter((name) => name in this.runners));

    for (const [name, controller] of this.#live) {
      if (wanted.has(name)) continue;
      controller.abort();
      this.#live.delete(name);
    }

    for (const spec of DOCUMENT_TOOLS) {
      if (!wanted.has(spec.name) || this.#live.has(spec.name)) continue;
      const controller = new AbortController();
      // Recorded before the await, so two applies landing together cannot
      // both decide the tool is missing and register it twice.
      this.#live.set(spec.name, controller);
      await this.#register(spec, controller.signal);
    }
  }

  async #register(spec: ToolSpec, signal: AbortSignal): Promise<void> {
    if (!this.registry) return;
    const run = this.runners[spec.name];
    if (!run) return;
    await this.registry.registerTool(
      {
        ...spec,
        // Chrome 151 calls `execute` with one argument and no `AbortSignal`
        // (doc 11 section 2, D-024), so there is nothing to thread through.
        execute: async (input) => ({ content: [{ type: "text", text: await run(input ?? {}) }] }),
      },
      { signal, exposedTo: [this.exposedTo] },
    );
  }
}
