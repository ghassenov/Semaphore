import { describe, expect, it } from "vitest";
import { TOUR, namesAGlyph } from "./plan.js";

describe("the guided shift", () => {
  it("never names a glyph", () => {
    /*
     * The same law the chambers run on. A tutorial that says "pull the spiral
     * lever" has done PILOT's half of the work and deleted the chamber it was
     * in the middle of explaining - and it would be a very easy sentence to
     * write, because it is the clearest way to say it.
     */
    for (const step of TOUR) {
      const leaked = namesAGlyph(`${step.title} ${step.say}`);
      expect(leaked, `${step.id} names the glyph ${String(leaked)}`).toBeNull();
    }
  });

  it("teaches the split before it teaches a key", () => {
    // A player told the controls first learns a control scheme. A player shown
    // the asymmetry first learns why there is a second player at all, which is
    // the only thing here that looking at the screen does not tell them.
    const order = TOUR.map((step) => step.id);
    expect(order.indexOf("split")).toBeLessThan(order.indexOf("walk"));
    expect(order.indexOf("split")).toBeLessThan(order.indexOf("lean"));
  });

  it("says something in every step, and says it to the player", () => {
    for (const step of TOUR) {
      expect(step.title.length, `${step.id} has no title`).toBeGreaterThan(0);
      expect(step.say.length, `${step.id} says nothing`).toBeGreaterThan(40);
      // Second person throughout: this is a briefing, not documentation.
      expect(step.say.toLowerCase(), `${step.id} is not addressed to anybody`).toMatch(
        /\byou\b|\byour\b/,
      );
    }
  });

  it("gives every step a distinct id", () => {
    expect(new Set(TOUR.map((step) => step.id)).size).toBe(TOUR.length);
  });

  it("ends on the argument rather than on a control", () => {
    const last = TOUR.at(-1);
    expect(last?.id).toBe("together");
    expect(last?.say).toMatch(/together/i);
  });

  it("only marks console elements that name themselves", () => {
    // A selector is a promise about markup that lives in another file. Keeping
    // them to a `data-*` attribute means the promise is one attribute rather
    // than a class name that a styling change is free to rename. `data-tab`
    // marks a drawer tab; `data-tour` marks anything else stable enough to be
    // pointed at - the ambiguity gauge is the first of those, because it is a
    // HUD readout with no fixture the camera could focus on instead.
    for (const step of TOUR) {
      if (step.mark === null) continue;
      expect(step.mark, `${step.id} marks by something other than data-tab/data-tour`).toMatch(
        /^\[data-(tab|tour)="[a-z-]+"\]$/,
      );
    }
  });
});
