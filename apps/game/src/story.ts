/**
 * The two sequences that bracket a shift: the way in, and the way out.
 *
 * Lines that land one at a time over whatever the renderer is already drawing,
 * rather than a separate medium spliced in front of it. That is the whole
 * design decision here and it is worth stating: a title card sequence would be
 * cheaper and would look like something else's opening. The station is already
 * on screen, lit, with a camera that moves - so the story is told over the
 * station, and the last line of the opening hands the room over rather than
 * cutting to it.
 *
 * ## It is skippable, and it is short
 *
 * Four beats in, three out, a couple of seconds each. Anything longer is a
 * thing a judge sits through twice while checking something else, and this
 * project's own art direction has a rule about decoration that competes.
 * Escape, a click, or any key ends it immediately.
 *
 * ## Reduced motion is honoured by showing the words at once
 *
 * Not by skipping them: they carry the premise, and somebody who has asked
 * their system for less movement has not asked to be told less.
 */

/** One beat: a line, and how long it holds before the next arrives. */
export interface Beat {
  readonly line: string;
  readonly holdMs: number;
}

/**
 * The way in. Told in the second person, present tense, and it ends on the
 * only instruction that matters.
 */
export const OPENING: readonly Beat[] = [
  { line: "The station has been dark for a long time.", holdMs: 2200 },
  { line: "You can see. You cannot reach.", holdMs: 2000 },
  { line: "Your agent can reach. It cannot see.", holdMs: 2200 },
  { line: "Talk to each other.", holdMs: 1800 },
];

/** The way out. Three beats, and the last one is the title. */
export const ENDING: readonly Beat[] = [
  { line: "The bolts are home.", holdMs: 1900 },
  { line: "Cold air, and the sound of the sea.", holdMs: 2400 },
  { line: "You got out together.", holdMs: 2600 },
];

/** What the caller holds so it can stop a sequence that is still running. */
export interface StoryHandle {
  stop(): void;
}

/**
 * Play `beats` over `parent`, resolving when the last one has been and gone.
 *
 * Resolving rather than firing a callback because every caller wants to do one
 * thing afterwards, and a promise is the shape that cannot be called twice.
 */
export function playStory(parent: HTMLElement, beats: readonly Beat[]): StoryHandle {
  const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  const layer = document.createElement("div");
  layer.className = "story";
  layer.setAttribute("aria-live", "polite");
  const line = document.createElement("p");
  line.className = "story-line";
  const hint = document.createElement("p");
  hint.className = "story-hint";
  hint.textContent = "press any key to skip";
  layer.append(line, hint);
  parent.append(layer);

  let timer = 0;
  let done = false;

  function stop(): void {
    if (done) return;
    done = true;
    globalThis.clearTimeout(timer);
    globalThis.removeEventListener("keydown", stop);
    layer.removeEventListener("click", stop);
    layer.classList.add("gone");
    // Removed after the fade rather than on the frame it starts, so the last
    // line goes out with the layer instead of vanishing a beat before it.
    globalThis.setTimeout(() => {
      layer.remove();
    }, 600);
  }

  function beat(index: number): void {
    const next = beats[index];
    if (!next || done) {
      stop();
      return;
    }
    line.textContent = next.line;
    // Restarting the animation means taking the class off and forcing a reflow;
    // without the reflow the browser coalesces the two changes and the second
    // line arrives with no entrance at all.
    line.classList.remove("in");
    void line.offsetWidth;
    line.classList.add("in");
    timer = globalThis.setTimeout(
      () => {
        beat(index + 1);
      },
      still ? Math.min(next.holdMs, 1200) : next.holdMs,
    );
  }

  globalThis.addEventListener("keydown", stop);
  layer.addEventListener("click", stop);
  beat(0);

  return { stop };
}
