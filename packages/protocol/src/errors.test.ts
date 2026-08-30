import { describe, expect, it } from "vitest";
import { ERROR_CODES, GameError, errors } from "./errors.js";

/** Every builder, called with plausible arguments, so assertions can be total. */
const built = [
  errors.busy("turning dial 2"),
  errors.unreachable("the key bank", "the grate is closed"),
  errors.notArmed(),
  errors.staleTool(),
  errors.invalidInput("dial_id", "1-4", 7),
  errors.lockedOut(22),
  errors.noSession(),
];

describe("GameError", () => {
  it("carries a code and a message", () => {
    const err = errors.busy("turning dial 2");
    expect(err.code).toBe("E_BUSY");
    expect(err.message).toBe("KEEPER is still turning dial 2. Wait for it to finish.");
  });

  it("is an Error, so it survives throw and catch", () => {
    expect(() => {
      throw errors.noSession();
    }).toThrow(Error);
  });

  it("narrows through its type guard", () => {
    expect(GameError.is(errors.notArmed())).toBe(true);
    expect(GameError.is(new Error("something else"))).toBe(false);
    expect(GameError.is(null)).toBe(false);
  });

  it("puts the code in the tool result text, since results are serialised", () => {
    const result = errors.lockedOut(22).toToolResult();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe(
      "E_LOCKED_OUT: The door is sealed for 22 more seconds after an incorrect passphrase.",
    );
  });
});

describe("the error taxonomy", () => {
  it("has a builder for every declared code", () => {
    expect(new Set(built.map((e) => e.code))).toEqual(new Set(ERROR_CODES));
  });

  it("lists every code exactly once", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  // The governing rule of doc 03 section 9. A bare rejection teaches an agent
  // nothing and produces flailing retries, which cost the pair time and
  // pollute the benchmark's wasted-call metric with noise that is our fault.
  it("returns text an agent can act on, never a bare rejection", () => {
    for (const err of built) {
      expect(err.message.length).toBeGreaterThan(20);
      expect(err.message).toMatch(/\.$/);
      expect(err.message).not.toMatch(/^(error|failed|invalid)$/i);
    }
  });

  it("names the blocker when something is unreachable", () => {
    expect(errors.unreachable("the key bank", "the grate is closed").message).toContain(
      "the grate is closed",
    );
  });

  it("reports what was received when input is rejected", () => {
    // Schema validation is advisory in WebMCP, so the message has to be good
    // enough for the model to correct itself without guessing.
    const err = errors.invalidInput("dial_id", "1-4", 7);
    expect(err.message).toContain("dial_id");
    expect(err.message).toContain("1-4");
    expect(err.message).toContain("7");
  });

  it("says a field was absent rather than printing a hole in the sentence", () => {
    // Every route coerces a missing argument to "" on the way in, so this is
    // what an agent gets for `inspect({target})` when the parameter is called
    // `object_id`: a plausible misspelling, and the most likely way to arrive
    // here. "Received ." asserts an empty value was sent, which is a different
    // and wrong repair from "you left the field out".
    for (const absent of [undefined, null, ""]) {
      const err = errors.invalidInput("object_id", "one of lever_a, lever_b", absent);
      expect(err.message).toContain("Received nothing.");
      expect(err.message).not.toContain("Received .");
    }
    // A value that really was sent is still quoted back verbatim.
    expect(errors.invalidInput("dial_id", "1-4", 0).message).toContain("Received 0.");
  });

  // Spec issue 262 argues WebMCP loses semantic context when tools disappear.
  // This message is our application-layer answer: it re-orients rather than
  // describing, because an agent that has lost the thread needs a next action.
  it("re-orients on a stale tool handle instead of merely describing", () => {
    expect(errors.staleTool().message).toContain("get_status");
  });

  it("stays inside a sensible output budget", () => {
    // Chrome recommends 1.5K per tool output. An error is only part of that.
    for (const err of built) expect(err.toToolResult().content[0].text.length).toBeLessThan(300);
  });
});
