/**
 * What the guided first shift teaches, in order, as data.
 *
 * Pure, and separate from the thing that drives it, for the same reason
 * `chamber.ts` is separate from `stage.ts`: what a tutorial *says* is a design
 * decision that can be wrong in a way nobody notices by looking, and it is the
 * half worth testing. `tour.ts` knows how to move a camera and cut a hole in a
 * dimming layer, and chooses nothing.
 *
 * ## The order is the argument
 *
 * A player who is told the controls first learns a control scheme. A player who
 * is shown the split first learns *why there is another player*, which is the
 * only thing about this game that is not obvious from looking at it. So the
 * asymmetry comes before the keys, and the keys come before the console.
 *
 * ## It may not name a glyph
 *
 * The same law the chambers run on (`apps/game/CLAUDE.md`). A tutorial that
 * says "the spiral lever" has done PILOT's job for them and deleted the
 * chamber it was explaining. It points at the mark and says that describing it
 * is the work.
 */

import { GLYPH_IDS } from "../render/glyphs.js";

/** Where a step wants the camera, resolved by the stage against the live room. */
export type Focus =
  | { readonly kind: "fixture"; readonly id: string }
  | { readonly kind: "pilot" }
  | { readonly kind: "wide" }
  | null;

/** One beat of the guided shift. */
export interface Step {
  readonly id: string;
  /** The beat's name, so a step reads as a moment rather than a paragraph. */
  readonly title: string;
  /** What it says. One or two sentences, addressed to the player. */
  readonly say: string;
  /** Where the camera goes while it is said. */
  readonly focus: Focus;
  /**
   * A console element to cut out of the dimming layer, as a CSS selector.
   *
   * Null for the steps that are about the room, which is most of them: the
   * room is already the thing being looked at and dimming it to point at it
   * would be pointing at nothing.
   */
  readonly mark: string | null;
}

/**
 * The guided shift.
 *
 * Eight beats, and it ends on the sentence the whole game is an argument for
 * rather than on a control.
 */
export const TOUR: readonly Step[] = [
  {
    id: "who",
    title: "You are PILOT",
    // On the body rather than on the building. The wide shot is the dimmest
    // frame this renderer draws and it opens on a dark model of somewhere the
    // player has not been yet; the first beat should be "here you are", and
    // the building is the subject of its own beat further down.
    say: "You are standing in the Airlock of a derelict signal station. You can see everything in this room, and you can reach almost none of it.",
    focus: { kind: "pilot" },
    mark: null,
  },
  {
    id: "keeper",
    title: "Your agent is KEEPER",
    say: "Your agent is behind the walls, reaching into every cavity in the station. It holds the maintenance manual and it has hands. It cannot see.",
    focus: { kind: "pilot" },
    mark: '[data-tab="faculties"]',
  },
  {
    id: "split",
    title: "You do not share a room",
    say: "A mark is lit above one of these levers. Your agent is told there are three levers and that they feel identical. Only you can tell it which is which.",
    focus: { kind: "fixture", id: "lever_b" },
    mark: null,
  },
  {
    id: "words",
    title: "Describing it is the game",
    say: "There is no button that names this shape. You have to put it into words your agent can act on, and it has to decide whether it believes you.",
    focus: { kind: "fixture", id: "lever_b" },
    mark: null,
  },
  {
    id: "walk",
    title: "Walk with W A S D",
    say: "Your lamp is the only thing that resolves detail. Walk to a mechanism to read it; you cannot be in two places at once, and that is on purpose.",
    focus: { kind: "pilot" },
    mark: null,
  },
  {
    id: "lean",
    title: "Hold E to lean in",
    say: "Standing at something and holding E brings you close enough to describe it. It is the one camera move you drive.",
    focus: { kind: "fixture", id: "lever_a" },
    mark: null,
  },
  {
    id: "step-back",
    title: "Press M for the whole station",
    say: "Step back and see every room at once. Your agent has no tool that does this: the building is yours to look at.",
    focus: { kind: "wide" },
    mark: null,
  },
  {
    id: "together",
    title: "Neither of you gets out alone",
    say: "Its tools change as you move through the station. Tell it what you see, ask it what it is holding, and open the outer door together.",
    focus: { kind: "wide" },
    mark: '[data-tab="agent"]',
  },
];

/**
 * Whether any of the tour's copy names one of the twelve glyphs.
 *
 * Exported so the test reads as the rule rather than as a regular expression,
 * and so the rule has one definition if anything else ever needs to ask.
 */
export function namesAGlyph(text: string): string | null {
  const words = new Set(text.toLowerCase().split(/[^a-z]+/));
  return GLYPH_IDS.find((glyph) => words.has(glyph.toLowerCase())) ?? null;
}
