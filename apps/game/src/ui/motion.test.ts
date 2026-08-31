// @vitest-environment happy-dom
/**
 * What a unit test can prove about a pointer effect without a real pointer:
 * that it wires and unwires the right listeners, and - the part that actually
 * matters for anybody who has turned motion off - that it does neither when
 * there is no cursor to react to or none was asked for.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { wirePointerLight, wireTilt } from "./motion.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubPointer(reduced: boolean, coarse: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduced-motion") ? reduced : coarse,
  }));
}

describe("wirePointerLight", () => {
  it("does nothing under prefers-reduced-motion", () => {
    stubPointer(true, false);
    const host = document.createElement("div");
    const add = vi.spyOn(host, "addEventListener");
    wirePointerLight(host);
    expect(add).not.toHaveBeenCalled();
  });

  it("does nothing on a coarse (touch) pointer, which has no cursor to lean toward", () => {
    stubPointer(false, true);
    const host = document.createElement("div");
    const add = vi.spyOn(host, "addEventListener");
    wirePointerLight(host);
    expect(add).not.toHaveBeenCalled();
  });

  it("otherwise wires pointer listeners and the disposer removes them again", () => {
    stubPointer(false, false);
    const host = document.createElement("div");
    const add = vi.spyOn(host, "addEventListener");
    const remove = vi.spyOn(host, "removeEventListener");
    const dispose = wirePointerLight(host);
    expect(add).toHaveBeenCalledWith("pointermove", expect.any(Function), { passive: true });
    expect(add).toHaveBeenCalledWith("pointerenter", expect.any(Function));
    expect(add).toHaveBeenCalledWith("pointerleave", expect.any(Function));
    dispose();
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it("toggles has-light on enter and leave", () => {
    stubPointer(false, false);
    const host = document.createElement("div");
    document.body.append(host);
    wirePointerLight(host);
    host.dispatchEvent(new Event("pointerenter"));
    expect(host.classList.contains("has-light")).toBe(true);
    host.dispatchEvent(new Event("pointerleave"));
    expect(host.classList.contains("has-light")).toBe(false);
    host.remove();
  });
});

describe("wireTilt", () => {
  it("does nothing under prefers-reduced-motion or on a coarse pointer", () => {
    stubPointer(true, false);
    const root = document.createElement("div");
    const add = vi.spyOn(root, "addEventListener");
    wireTilt(root);
    expect(add).not.toHaveBeenCalled();
  });

  it("resets a tilted card's custom properties when the pointer leaves it", () => {
    stubPointer(false, false);
    const root = document.createElement("div");
    const card = document.createElement("button");
    card.setAttribute("data-tilt", "");
    root.append(card);
    document.body.append(root);

    wireTilt(root);
    // `pointerleave` does not bubble, so `wireTilt` listens in the capture
    // phase on `root` - this is exactly the path that would silently do
    // nothing if that phase were ever dropped.
    card.dispatchEvent(new Event("pointerleave", { bubbles: false }));
    expect(card.style.getPropertyValue("--tilt-x")).toBe("0deg");
    expect(card.style.getPropertyValue("--tilt-y")).toBe("0deg");
    root.remove();
  });

  it("disposing removes both listeners it added", () => {
    stubPointer(false, false);
    const root = document.createElement("div");
    const remove = vi.spyOn(root, "removeEventListener");
    const dispose = wireTilt(root);
    dispose();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
