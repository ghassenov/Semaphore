/**
 * The shape a Semaphore tool is authored in, and the budgets it must respect.
 *
 * Tools are declared as data plus a `run` that returns a plain string. The
 * spec's `{ content: [{ type: "text", text }] }` envelope is applied once, by
 * the director's instrumentation wrapper, so a change to the return shape
 * costs one function rather than nineteen. `adapter.ts` owns the spec surface;
 * this file owns our side of the contract.
 *
 * The budgets are Chrome's published recommendations (doc 03 section 10). They
 * live here as constants, and `budgets.test.ts` asserts every authored tool
 * against them, because a tool description is agent-facing UI copy and a
 * description that blows the budget is a description the model reads less of.
 */

/** Chrome's recommended ceilings, in characters. */
export const BUDGETS = {
  name: 30,
  description: 500,
  parameterDescription: 150,
  output: 1500,
} as const;

/** A JSON Schema object, minimal and closed, as doc 03 section 10 requires. */
export interface InputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, { type: string; description: string } & object>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

/**
 * One authored tool.
 *
 * `run` returns the text an agent reads, and is allowed to fail only by
 * returning failure text: `sessionClient` never rejects except on abort, and
 * the director turns an abort into a cancellation rather than an error.
 */
export interface GameTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: InputSchema;
  readonly annotations: {
    readonly readOnlyHint: boolean;
    readonly untrustedContentHint?: boolean;
  };
  run(input: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
}

/** An object schema with no parameters at all. Several tools take none. */
export const NO_INPUT: InputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;
