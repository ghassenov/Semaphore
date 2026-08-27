/**
 * The glyph vocabulary (doc 02 sections 3.1 and 3.2).
 *
 * Glyphs are the game's central `VISUAL` fact: PILOT sees a shape, KEEPER
 * holds a table that maps a shape's *name* to a stroke count, and the whole
 * Signal Room turns on the human getting a description across the gap
 * accurately enough for the agent to look it up.
 *
 * Two properties matter and neither is decorative:
 *
 * 1. **`plainNames` is a corpus, not a synonym list.** Doc 07 section 7.2
 *    requires the manual's canonical name to be reachable from at least three
 *    phrasings a cold player would actually use. These entries are the
 *    starting set, to be replaced wholesale by the real corpus gathered in
 *    paper prototyping. That is the difference between productive ambiguity
 *    and a chamber that stalls.
 * 2. **`confusableWith` is deliberate.** Chamber I includes two shapes that
 *    read alike at a glance, so a good agent asks a clarifying question and a
 *    bad one guesses. The benchmark measures exactly that difference, so the
 *    confusion is a designed feature and is recorded here rather than left to
 *    emerge from whoever draws the sprites.
 */

/** Every glyph in the pool. Chamber 0 uses three; Chamber I draws six of twelve. */
export type GlyphId =
  | "spiral"
  | "cross"
  | "wave"
  | "arch"
  | "knot"
  | "triangle"
  | "eye"
  | "comb"
  | "hook"
  | "star"
  | "gate"
  | "coil";

export interface Glyph {
  readonly id: GlyphId;
  /** The name the manual uses. What PILOT's description has to reach. */
  readonly canonicalName: string;
  /**
   * Stroke count, which is the quantity Chamber I's rule operates on. Primes
   * are omitted by that rule, so the spread of primes to composites here
   * decides how many keys a typical seed asks for.
   */
  readonly strokes: number;
  /** Phrasings a cold player might use. Replaced by the playtest corpus. */
  readonly plainNames: readonly string[];
  /** Glyphs this one is meant to be mistaken for at a glance. */
  readonly confusableWith?: GlyphId;
}

export const GLYPHS: Readonly<Record<GlyphId, Glyph>> = {
  spiral: {
    id: "spiral",
    canonicalName: "SPIRAL",
    strokes: 1,
    plainNames: ["spiral", "swirl", "the swirly one", "curl", "whirlpool"],
  },
  cross: {
    id: "cross",
    canonicalName: "CROSS",
    strokes: 2,
    plainNames: ["cross", "plus", "the plus sign", "x", "crossed lines"],
  },
  wave: {
    id: "wave",
    canonicalName: "BROKEN WAVE",
    strokes: 4,
    plainNames: ["wave", "squiggle", "the wavy one", "zigzag", "ripple"],
    confusableWith: "knot",
  },
  knot: {
    id: "knot",
    canonicalName: "KNOTTED LOOP",
    strokes: 6,
    plainNames: ["knot", "loop", "the tangled one", "pretzel", "twisted loop"],
    confusableWith: "wave",
  },
  arch: {
    id: "arch",
    canonicalName: "HORNED ARCH",
    strokes: 3,
    plainNames: ["arch", "horns", "the pointy arch", "bridge", "doorway"],
  },
  triangle: {
    id: "triangle",
    canonicalName: "STACKED TRIANGLE",
    strokes: 6,
    plainNames: ["triangle", "the pointy one", "stacked triangles", "pyramid", "arrow"],
  },
  eye: {
    id: "eye",
    canonicalName: "OPEN EYE",
    strokes: 4,
    plainNames: ["eye", "the eye", "lens", "oval with a dot", "almond"],
  },
  comb: {
    id: "comb",
    canonicalName: "SIX-TOOTH COMB",
    strokes: 7,
    plainNames: ["comb", "rake", "the one with teeth", "fork", "prongs"],
  },
  hook: {
    id: "hook",
    canonicalName: "BENT HOOK",
    strokes: 2,
    plainNames: ["hook", "the curved one", "j shape", "cane", "crook"],
  },
  star: {
    id: "star",
    canonicalName: "FIVE-POINT STAR",
    strokes: 5,
    plainNames: ["star", "the star", "asterisk", "five points", "sparkle"],
  },
  gate: {
    id: "gate",
    canonicalName: "BARRED GATE",
    strokes: 8,
    plainNames: ["gate", "grid", "the barred one", "fence", "ladder"],
  },
  coil: {
    id: "coil",
    canonicalName: "TIGHT COIL",
    strokes: 9,
    plainNames: ["coil", "spring", "the coiled one", "helix", "slinky"],
  },
} as const;

/** Every glyph id, in declaration order. */
export const GLYPH_IDS: readonly GlyphId[] = Object.keys(GLYPHS) as GlyphId[];

/** The three glyphs Chamber 0 uses. Simple, distinct, impossible to confuse. */
export const AIRLOCK_GLYPHS: readonly GlyphId[] = ["spiral", "cross", "wave"] as const;

/**
 * Whether a plain-language phrase plausibly refers to a glyph.
 *
 * Used by the benchmark's scripted partners so a `vague` PILOT can say "the
 * swirly one" and the harness can still score whether the agent resolved it.
 * Never used in game logic: resolving a human's words is the agent's job, and
 * doing it for them would remove the thing the whole game is about.
 */
export function matchesGlyph(phrase: string, id: GlyphId): boolean {
  const needle = phrase.trim().toLowerCase();
  const glyph = GLYPHS[id];
  return (
    needle === glyph.canonicalName.toLowerCase() ||
    glyph.plainNames.some((name) => name === needle || needle.includes(name))
  );
}
