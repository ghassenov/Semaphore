/**
 * Running the guided shift: the overlay, the spotlight, and the camera.
 *
 * The impure half of `plan.ts`, and it decides nothing. It walks the steps, sets
 * `model.focus` so the stage can fly the camera, cuts a hole in a dimming layer
 * over whichever console element the step names, and draws the copy.
 *
 * ## Both layers, because they teach different things
 *
 * The camera teaches the room: it is the only way to show a mark at the size
 * PILOT actually has to describe it. The dimming layer teaches the console: a
 * panel is a rectangle in a corner and no camera move can point at one. A tour
 * with only the first never mentions the agent's faculties; a tour with only the
 * second is a product walkthrough of a game about looking at things.
 *
 * ## It is skippable at every moment and it never runs twice
 *
 * Autoplaying anything is a cost imposed on somebody who did not ask. It runs on
 * a first visit only, remembers that it has run, and Escape ends it from any
 * step. `Show me how` on the landing screen starts it again deliberately.
 */

import { TOUR, type Step } from "./plan.js";
import type { StationModel } from "../render/station.js";

/** Where the fact that this has already run is kept. */
const SEEN = "semaphore:tour-seen";

/** How long the camera is given to arrive before the copy fades in. */
const SETTLE_MS = 700;

/**
 * Whether a key event came from somebody typing rather than from the tour.
 *
 * The shared notepad is a real text field on the same page, and both this and
 * the story listen on `globalThis`: without this, typing a space into a note
 * advanced the tutorial a step, and typing anything at all skipped the opening.
 */
function typing(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  );
}

/** What the caller holds so it can start, stop or ask about the tour. */
export interface TourHandle {
  /** Play from the first step. Safe to call while one is already running. */
  start(): void;
  stop(): void;
  /** Whether this browser has been shown the tour before. */
  seen(): boolean;
}

/** Whether storage is readable at all. Private windows refuse it outright. */
function remembers(): Storage | null {
  try {
    const store = globalThis.localStorage;
    store.getItem(SEEN);
    return store;
  } catch {
    return null;
  }
}

/**
 * Mount the guided shift over `parent`, driving `model`'s camera as it goes.
 *
 * Nothing is drawn until `start`, so the cost of this on a session that never
 * asks for it is one detached element.
 */
export function createTour(parent: HTMLElement, model: StationModel): TourHandle {
  const layer = document.createElement("div");
  layer.className = "tour";
  layer.hidden = true;
  // A live region: the copy changes without the focus moving, and a screen
  // reader has no other way to be told that the lesson advanced.
  layer.setAttribute("aria-live", "polite");

  const spot = document.createElement("div");
  spot.className = "tour-spot";
  const card = document.createElement("div");
  card.className = "tour-card";
  const beat = document.createElement("p");
  beat.className = "tour-beat";
  const title = document.createElement("h2");
  const say = document.createElement("p");
  say.className = "tour-say";
  const controls = document.createElement("div");
  controls.className = "tour-controls";
  const dots = document.createElement("div");
  dots.className = "tour-dots";
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "tour-skip";
  skip.textContent = "Skip";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next";
  controls.append(dots, skip, next);
  card.append(beat, title, say, controls);
  layer.append(spot, card);
  parent.append(layer);

  let at = -1;
  let timer = 0;

  /** The element the current step points at, so the box can follow it. */
  let marked: HTMLElement | null = null;

  /** Put the lit box over `marked`, wherever it is now. */
  function placeSpot(): void {
    if (marked === null) {
      spot.hidden = true;
      return;
    }
    const box = marked.getBoundingClientRect();
    const host = parent.getBoundingClientRect();
    spot.hidden = false;
    spot.style.left = `${String(box.left - host.left - 6)}px`;
    spot.style.top = `${String(box.top - host.top - 6)}px`;
    spot.style.width = `${String(box.width + 12)}px`;
    spot.style.height = `${String(box.height + 12)}px`;
  }

  function markUp(step: Step): void {
    // The spotlight is a box drawn over the element the step names, rather than
    // a mask cut out of the dimming layer: a box can be animated between two
    // positions, and moving light is what makes the eye follow rather than
    // search. Nothing to name means nothing to draw.
    if (step.mark === null) {
      marked = null;
      placeSpot();
      return;
    }
    const target = document.querySelector(step.mark);
    if (!(target instanceof HTMLElement)) {
      marked = null;
      placeSpot();
      return;
    }
    marked = target;
    /*
     * Open the drawer the step is about, if it is closed.
     *
     * Pointing a spotlight at a shut tab teaches the player where a word is.
     * The beat about the agent's faculties is about *what is in that drawer*,
     * so the drawer has to be open for the sentence to be true.
     */
    if (target.getAttribute("aria-expanded") === "false") target.click();
    placeSpot();
  }

  function show(index: number): void {
    const step = TOUR[index];
    if (!step) {
      stop();
      return;
    }
    at = index;
    model.focus = step.focus;
    // PILOT's controls are the tour's for the duration. Set every step rather
    // than once at the start, so a `stop` that raced a pending step cannot
    // leave the player frozen out of their own game.
    model.locked = true;
    beat.textContent = `${String(index + 1)} of ${String(TOUR.length)}`;
    title.textContent = step.title;
    say.textContent = step.say;
    next.textContent = index === TOUR.length - 1 ? "Begin" : "Next";
    dots.replaceChildren(
      ...TOUR.map((_unused, i) => {
        const dot = document.createElement("span");
        dot.className = i === index ? "tour-dot on" : "tour-dot";
        return dot;
      }),
    );
    // The copy waits for the camera. Arriving together reads as one movement;
    // arriving first reads as a caption that has lost its picture.
    card.classList.remove("shown");
    globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(() => {
      card.classList.add("shown");
      markUp(step);
    }, SETTLE_MS);
  }

  function stop(): void {
    globalThis.clearTimeout(timer);
    layer.hidden = true;
    marked = null;
    spot.hidden = true;
    card.classList.remove("shown");
    at = -1;
    // The camera goes back to its own mind, and the player gets their keys
    // back. That handover is the thing that makes the tour feel like it gave
    // the room over rather than merely stopped talking.
    model.focus = null;
    model.locked = false;
    remembers()?.setItem(SEEN, "1");
  }

  function start(): void {
    layer.hidden = false;
    show(0);
  }

  next.addEventListener("click", () => {
    show(at + 1);
  });
  skip.addEventListener("click", stop);
  const onKey = (event: KeyboardEvent): void => {
    if (layer.hidden || typing(event)) return;
    if (event.key === "Escape") {
      stop();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      // Or the page scrolls, and the key that advances the lesson also moves
      // the thing the lesson is pointing at.
      event.preventDefault();
      show(at + 1);
    }
  };
  globalThis.addEventListener("keydown", onKey);
  // The box follows its target rather than being measured once: a drawer
  // opening, or the window changing shape, moved the tab out from under it.
  const onResize = (): void => {
    placeSpot();
  };
  globalThis.addEventListener("resize", onResize);

  return {
    start,
    stop,
    seen: () => remembers()?.getItem(SEEN) === "1",
  };
}
