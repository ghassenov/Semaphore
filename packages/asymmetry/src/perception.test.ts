/**
 * The projector, and the property the whole kit rests on: a party's view holds
 * what its channels carry and *nothing else*, by absence rather than by null.
 */

import { describe, expect, it } from "vitest";
import { concealedFrom, invert, perceives, project, type PerceptionModel } from "./perception.ts";

type Channel = "SCREEN" | "TOOL" | "BOTH" | "INTERNAL";

const MODEL: PerceptionModel<"HUMAN" | "AGENT", Channel> = {
  HUMAN: ["SCREEN", "BOTH"],
  AGENT: ["TOOL", "BOTH"],
};

const facts = {
  ref: { value: "T-1", channel: "BOTH" as const },
  street: { value: "Carrick Lane", channel: "SCREEN" as const },
  city: { value: "Ravensmoor", channel: "TOOL" as const },
  answer: { value: 42, channel: "INTERNAL" as const },
};

describe("perceives", () => {
  it("answers from the model and nothing else", () => {
    expect(perceives(MODEL, "AGENT", "TOOL")).toBe(true);
    expect(perceives(MODEL, "AGENT", "SCREEN")).toBe(false);
  });

  it("says no for a channel no party names", () => {
    expect(perceives(MODEL, "HUMAN", "INTERNAL")).toBe(false);
    expect(perceives(MODEL, "AGENT", "INTERNAL")).toBe(false);
  });
});

describe("project", () => {
  it("omits a concealed field rather than nulling it", () => {
    const view = project(facts, MODEL, "AGENT");
    expect(view).toEqual({ ref: "T-1", city: "Ravensmoor" });
    // The distinction that matters: a consumer that forgets to check cannot
    // read a placeholder and treat it as data.
    expect("street" in view).toBe(false);
  });

  it("reaches a channel no party perceives from neither side", () => {
    expect(project(facts, MODEL, "HUMAN")).not.toHaveProperty("answer");
    expect(project(facts, MODEL, "AGENT")).not.toHaveProperty("answer");
  });
});

describe("concealedFrom", () => {
  it("names the fields a party may not perceive, with their values", () => {
    expect(concealedFrom(facts, MODEL, "AGENT")).toEqual([
      ["street", "Carrick Lane"],
      ["answer", 42],
    ]);
  });
});

describe("invert", () => {
  it("exchanges the two parties", () => {
    const flipped = invert(MODEL);
    expect(flipped.HUMAN).toEqual(MODEL.AGENT);
    expect(flipped.AGENT).toEqual(MODEL.HUMAN);
  });

  it("leaves an unperceived channel unperceived", () => {
    // The property that makes a role-inversion beat safe to ship: an exchange
    // of two lists cannot invent a channel neither list names.
    const flipped = invert(MODEL);
    expect(perceives(flipped, "HUMAN", "INTERNAL")).toBe(false);
    expect(perceives(flipped, "AGENT", "INTERNAL")).toBe(false);
  });

  it("refuses a model that is not two parties", () => {
    expect(() => invert({ A: ["x"], B: ["y"], C: ["z"] })).toThrow(RangeError);
    expect(() => invert({ A: ["x"] })).toThrow(RangeError);
  });
});
