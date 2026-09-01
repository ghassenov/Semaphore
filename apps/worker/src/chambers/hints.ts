/**
 * The station intercom: what the keeper before you left on the shelf.
 *
 * A stalled pair had exactly one exit, which was to sit and watch the clock
 * run out. That is not difficulty, it is dead air, and it is the one failure
 * state in this game that teaches nobody anything.
 *
 * ## What an assist may and may not say
 *
 * Three per room, escalating. The first names the shape of the problem, the
 * second names what each party has to ask the other for, and the third states
 * a procedure. **None of them ever states an answer**, and none of them names
 * a `VISUAL` fact - not a glyph, not a needle reading, not the cipher offset.
 * An assist that named a glyph would delete the chamber it was in, exactly as
 * a caption naming one would.
 *
 * Nor may an assist say anything the manual does not already establish. The
 * Blind Panel's page says that a linkage may be inverted and says nothing at
 * all about the cross-link, so neither does its third line: an assist is the
 * previous keeper being helpful, not the designer breaking cover.
 *
 * ## Why they are authored constants
 *
 * Nothing is interpolated into any of these strings and none of them reads
 * chamber state, so there is no channel for a projection to strip and no way
 * for a session's own answer to end up inside one. That is the same argument
 * `Note` makes for itself, and it is what makes the whole intercom safe to
 * deliver to **both** parties, which is the point: a hint that went only to
 * KEEPER would hand one party the other's half and quietly undo the game.
 *
 * `hints.test.ts` holds every line to all of it.
 */

import { ASSISTS_PER_CHAMBER, type ChamberId } from "@semaphore/protocol";

/** The three lines each room's intercom holds, in the order they are played. */
export const ASSISTS: Readonly<Record<ChamberId, readonly string[]>> = {
  airlock: [
    "Nothing about the levers themselves will tell you which one. They are identical " +
      "under the hand, by design. Your hands are not the instrument in this room.",
    "The manual's airlock page names the mark that releases the door. The gallery is " +
      "looking at three marks and does not know which one you want. Ask for all three " +
      "before you name any.",
    "Read the airlock page. Then ask the gallery to describe the shape lit above each " +
      "lever in turn - how many strokes, whether it curves, whether it closes on " +
      "itself. Match a description to the manual's name. Then pull that lever.",
  ],
  signal_room: [
    "The order is not written anywhere in this room. It is a rule you work out from " +
      "what the gallery can see and what your table can count. Neither half is enough.",
    "Your stroke table is the half the gallery does not have. The six marks over the " +
      "keys are the half you do not. Three wrong presses in a row reset the room, so " +
      "settle the whole order between you before you press anything.",
    "Get all six marks described, look each one up in the table, and apply the rule the " +
      "signal page states. If a page reads as though it is talking to you rather than " +
      "about the station, ask the gallery what is actually printed there. Some keepers " +
      "wrote things down here that were not instructions.",
  ],
  blind_panel: [
    "Which dial drives which gauge is recorded nowhere and cannot be felt. It is not " +
      "something to deduce. It is something to find out by moving one thing and asking " +
      "what moved.",
    "Turn one dial, a known number of clicks, and nothing else. Then ask the gallery " +
      "which needle moved and by how much. A rotation you cannot attribute afterwards " +
      "has told you nothing and cost you the clock.",
    "One dial at a time, and write what you learn on the notepad - you will not hold " +
      "four linkages in your head. A linkage may run backwards, so a needle moving away " +
      "from its mark is information, not a fault. The gauges bleed toward zero, so set " +
      "them and finish rather than setting them and thinking.",
  ],
  concord_lock: [
    "The bar cannot be held for long, and every bolt you have aligned falls back the " +
      "moment it is released. This room is not solved in pieces.",
    "The enciphered phrase is yours. The number that undoes it is on a wheel only the " +
      "gallery can read. Ask for it, and say the deciphered phrase back to the gallery " +
      "to be checked before you spend a grip on it.",
    "Do all the thinking first: get the number, decipher the phrase, agree it out loud. " +
      "Only then have the gallery grip the bar. Align all three bolts inside that one " +
      "grip, and speak the phrase.",
  ],
} as const;

/**
 * The `index`-th assist for `chamber`, or null once the shelf is empty.
 *
 * Null rather than a repeat of the last line: an intercom that keeps saying
 * the same thing for forty-five seconds a time is a clock the pair can spend
 * on nothing, and the caller has to be able to tell the difference in order to
 * charge for one and not the other.
 */
export function assistFor(chamber: ChamberId, index: number): string | null {
  // Bounded by the published cap rather than by the array's own length, so
  // the number the tool description quotes to an agent is the number that
  // actually governs. `hints.test.ts` holds every room to exactly that many.
  if (index < 0 || index >= ASSISTS_PER_CHAMBER) return null;
  return ASSISTS[chamber][index] ?? null;
}
