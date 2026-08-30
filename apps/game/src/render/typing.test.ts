// @vitest-environment happy-dom
/**
 * The guard that keeps the shared notepad from walking PILOT.
 *
 * Its own file because `hud.test.ts` runs in bare Node, where none of the DOM
 * constructors this predicate tests against exist. The rest of the console's
 * arithmetic needs no document and should not pay for one.
 */

import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./hud.js";

describe("what counts as typing", () => {
  it("catches the shared notepad, which is the whole reason it exists", () => {
    // `write_note` is a textarea in the console and `w`, `a` and `s` are
    // PILOT's own keys, so without this, writing a note walks the body.
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
  });

  it("catches a contenteditable, which a rich notepad would be", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isTypingTarget(editable)).toBe(true);
  });

  it("lets a keystroke through everywhere else", () => {
    // Including a focused button, which is what every drawer tab is: opening a
    // panel must not cost PILOT the ability to walk.
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
