// @vitest-environment happy-dom
/**
 * happy-dom does define `IntersectionObserver`, as a constructor that never
 * actually fires - there is no real layout or viewport underneath it. So
 * "does a crossing reveal the element" is not a fact a unit test can produce;
 * it is exactly the class of thing this repo pushes to the browser tour
 * (`CLAUDE.md`'s "the game is the test"). What a unit test *can* prove is the
 * two paths that do not depend on a real intersection ever firing: the
 * reduced-motion short-circuit, and the case where no observer exists at all.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { wireReveals } from "./reveal.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scroll reveals", () => {
  it("does nothing to an element nobody opted in with data-reveal", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>plain</p>";
    wireReveals(root);
    expect(root.querySelector("p")?.classList.contains("is-revealed")).toBe(false);
  });

  it("reveals everything immediately under prefers-reduced-motion, without an observer", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const root = document.createElement("div");
    root.innerHTML = "<p data-reveal>one</p><p data-reveal>two</p>";
    wireReveals(root);
    expect(root.querySelectorAll(".is-revealed").length).toBe(2);
  });

  it("also reveals immediately when the browser has no IntersectionObserver at all", () => {
    // The one case this game is actually shipped against: WebMCP is a
    // brand-new draft and the browsers that implement it are recent, but
    // there is no reason this page should hard-fail on an older one.
    vi.stubGlobal("IntersectionObserver", undefined);
    const root = document.createElement("div");
    root.innerHTML = "<p data-reveal>one</p>";
    wireReveals(root);
    expect(root.querySelector("p")?.classList.contains("is-revealed")).toBe(true);
  });

  it("otherwise hands every data-reveal element to a real observer, and disposes it", () => {
    const observed: Element[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe(el: Element): void {
          observed.push(el);
        }
        unobserve(): void {}
        disconnect = disconnect;
      },
    );
    const root = document.createElement("div");
    root.innerHTML = "<p data-reveal>one</p><span>skipped</span><p data-reveal>two</p>";
    const dispose = wireReveals(root);
    expect(observed.length).toBe(2);
    dispose();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("returns a callable disposer even when there was nothing to wire", () => {
    const dispose = wireReveals(document.createElement("div"));
    expect(() => {
      dispose();
    }).not.toThrow();
  });
});
