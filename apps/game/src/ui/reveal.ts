/**
 * Scroll-driven reveals, as one observer rather than one listener per element.
 *
 * Every element carrying `data-reveal` gets `.is-revealed` the first time it
 * crosses into the viewport, and never loses it again: a reveal is an
 * entrance, and a section that faded back out every time somebody scrolled
 * past it twice would be a page fighting its own reader.
 *
 * `prefers-reduced-motion` short-circuits the whole thing rather than being
 * handled per element. An observer that adds a class is not itself motion,
 * but every rule the class switches on is a transform and an opacity fade,
 * and a page that animates thirty things in under "reduced motion" because
 * the trigger was technically a class toggle has not honoured the request.
 * `revealNow` marks everything visible at once, synchronously, which is a
 * complete and correct implementation of "no motion": the content is simply
 * there.
 */

/** Mark every `data-reveal` element in `root` visible immediately, no observer. */
function revealNow(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-reveal]")) {
    el.classList.add("is-revealed");
  }
}

/**
 * Wire scroll reveals for every `[data-reveal]` element under `root`.
 *
 * Returns a disposer. The observer is intentionally never re-scanned after
 * construction - this page does not grow new revealable sections at runtime,
 * and a MutationObserver watching for ones that might is a cost with nothing
 * to pay for.
 */
export function wireReveals(root: ParentNode): () => void {
  const targets = [...root.querySelectorAll<HTMLElement>("[data-reveal]")];
  if (targets.length === 0) return () => {};

  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  if (reduced || typeof IntersectionObserver === "undefined") {
    revealNow(root);
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        // Once. A second crossing (scrolling back up and back down) should
        // not replay an entrance the reader has already seen.
        observer.unobserve(entry.target);
      }
    },
    // A little before the element's true edge, so the fade finishes closer to
    // when the element is actually readable rather than starting exactly as
    // its top pixel appears under the fold.
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  for (const el of targets) observer.observe(el);
  return () => observer.disconnect();
}
