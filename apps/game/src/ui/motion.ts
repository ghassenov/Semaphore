/**
 * The landing screen's two cursor-driven micro-interactions: a light that
 * leans toward the pointer, and a tilt on the cards the pointer is over.
 *
 * Both are pure DOM-and-CSS-variable plumbing with no visual opinion of their
 * own - what the light looks like and how far a card tilts are entirely
 * `style.css`'s decision, made from the custom properties these write. That
 * split is deliberate: it is the same reason `wireReveals` only ever adds one
 * class. A function that decided colours or degrees as well as coordinates
 * would be a second place those numbers could drift from the design.
 *
 * Both are inert under `prefers-reduced-motion` and on a coarse (touch)
 * pointer, where there is no hover state to track and a value computed from
 * the last touch point would leave a light or a tilt stuck wherever a finger
 * last was.
 */

/** True when there is no cursor to react to, or the reader asked for none of this. */
function inert(): boolean {
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const coarse = globalThis.matchMedia?.("(pointer: coarse)").matches === true;
  return reduced || coarse;
}

/**
 * A soft light that follows the pointer, confined to whatever element it is
 * mounted in.
 *
 * The station's own information architecture is light: a channel is a lamp,
 * not a fill (D-043, doc 06 section 1). This is the same idea carried onto the
 * page - a warm glow that leans toward wherever the reader is looking, at an
 * opacity so low it reads as atmosphere rather than as a cursor effect.
 *
 * It writes two custom properties rather than moving a positioned element,
 * so the CSS decides what the light actually looks like (radius, colour,
 * blend mode) while this stays only a source of coordinates.
 */
export function wirePointerLight(host: HTMLElement): () => void {
  if (inert()) return () => {};

  let raf = 0;
  const onMove = (event: PointerEvent): void => {
    if (raf !== 0) return;
    raf = globalThis.requestAnimationFrame(() => {
      raf = 0;
      const box = host.getBoundingClientRect();
      // As a fraction of the host's own box, not of the viewport, so the
      // light is correct however the host is scrolled or sized.
      host.style.setProperty(
        "--light-x",
        `${String(((event.clientX - box.left) / box.width) * 100)}%`,
      );
      host.style.setProperty(
        "--light-y",
        `${String(((event.clientY - box.top) / box.height) * 100)}%`,
      );
    });
  };
  const onEnter = (): void => host.classList.add("has-light");
  const onLeave = (): void => host.classList.remove("has-light");

  host.addEventListener("pointermove", onMove, { passive: true });
  host.addEventListener("pointerenter", onEnter);
  host.addEventListener("pointerleave", onLeave);
  return () => {
    globalThis.cancelAnimationFrame(raf);
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerenter", onEnter);
    host.removeEventListener("pointerleave", onLeave);
  };
}

/** How far a tilted card may rotate, in degrees. Small: a lean, not a flip. */
const TILT_MAX_DEG = 5;

/**
 * A bounded tilt toward the pointer, on every `[data-tilt]` element under
 * `root`.
 *
 * One listener on `root` rather than one pair per card - the set of cards
 * this page has is fixed at construction, so a single delegated `pointermove`
 * costs less and needs no per-card cleanup accounting.
 */
export function wireTilt(root: HTMLElement): () => void {
  if (inert()) return () => {};

  let current: HTMLElement | null = null;
  const onMove = (event: PointerEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-tilt]");
    if (!target) {
      if (current) reset(current);
      current = null;
      return;
    }
    current = target;
    const box = target.getBoundingClientRect();
    // -1..1 on each axis, from the card's own centre.
    const nx = ((event.clientX - box.left) / box.width) * 2 - 1;
    const ny = ((event.clientY - box.top) / box.height) * 2 - 1;
    target.style.setProperty("--tilt-x", `${String(-ny * TILT_MAX_DEG)}deg`);
    target.style.setProperty("--tilt-y", `${String(nx * TILT_MAX_DEG)}deg`);
  };
  const onLeave = (event: PointerEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-tilt]");
    if (target) reset(target);
  };
  function reset(target: HTMLElement): void {
    target.style.setProperty("--tilt-x", "0deg");
    target.style.setProperty("--tilt-y", "0deg");
  }

  root.addEventListener("pointermove", onMove, { passive: true });
  root.addEventListener("pointerleave", onLeave, { passive: true, capture: true });
  return () => {
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerleave", onLeave, true);
  };
}
