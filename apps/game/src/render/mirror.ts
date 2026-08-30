/**
 * The room in words: the accessibility mirror, and text mode.
 *
 * Doc 08 phase 6 asks for two things that are one thing. A screen-reader
 * mirror and a text mode are both "render `projectForPilot` as prose instead
 * of as pixels", so this is one describer and the console decides where to put
 * the lines.
 *
 * ## This is the one sanctioned exception to the no-DOM rule, and it is a real
 * trade-off rather than a loophole
 *
 * `apps/game/CLAUDE.md` is explicit: puzzle-critical visuals render to the
 * canvas and never to DOM, because a text node holding a glyph is a text node
 * an agent with page access can scrape - and KEEPER not being able to see is
 * the entire game. The mirror deliberately breaks that, because the
 * alternative is that a blind player cannot play at all, and a game whose
 * accessibility story is "you cannot" is not a defensible one.
 *
 * What keeps it honest is that it is **off by default and turned on by the
 * person it is for**. A pair who switch it on have decided that this session
 * is one where PILOT reads rather than looks; an agent that finds the DOM full
 * of glyph shapes did so because the human asked for it. The README carries
 * this as a stated limitation rather than a footnote.
 *
 * ## It describes shapes, never names
 *
 * The one line it may not cross is the same one the renderer may not cross. A
 * glyph is drawn, and its *name* is KEEPER's half: a lever captioned "spiral"
 * deletes Chamber I, because reading a label aloud is not describing a shape.
 * So the mirror says a plate carries a mark and gives the mark's number, and
 * leaves the describing to the player, exactly as the picture does.
 *
 * Pure, and tested, for the same reason `chamber.ts` is: this is what a player
 * who cannot see the canvas has instead of the canvas, and it may not be the
 * one surface nobody ever checks.
 */

import type { PilotView } from "@semaphore/protocol";
import { roomPlan, roomTitle, type Fixture, type RoomPlan } from "./chamber.js";

/** How a fixture's channel reads out loud. */
const CHANNEL_WORDS: Readonly<Record<string, string>> = {
  pilot: "you alone can see it",
  keeper: "only your agent can reach it",
  shared: "you both perceive it",
};

/**
 * Where something stands, in words rather than in metres.
 *
 * Thirds rather than coordinates. A number in metres is not a thing a person
 * can act on: "the lever at 3.4 metres" tells a player nothing they can walk
 * to, and the room is only ever described so it can be talked about.
 */
function across(at: number, width: number): string {
  const third = at / Math.max(1, width);
  if (third < 0.34) return "on the left";
  if (third < 0.67) return "in the middle";
  return "on the right";
}

/** One fixture, as a sentence. */
function describeFixture(fixture: Fixture, plan: RoomPlan): string {
  const parts: string[] = [];
  parts.push(fixture.label ?? fixture.kind.replace(/_/g, " "));
  parts.push(across(fixture.at.x + plan.size.width / 2, plan.size.width));

  // The mark, as a mark. Its name is the other half of the game.
  if (fixture.glyph !== undefined) parts.push("carrying a mark you would have to describe");

  if (fixture.level !== undefined && fixture.steps !== undefined) {
    const filled = Math.round(fixture.level * fixture.steps);
    parts.push(`reading ${String(filled)} of ${String(fixture.steps)}`);
    if (fixture.target !== undefined) {
      parts.push(`wanting ${String(Math.round(fixture.target * fixture.steps))}`);
    }
  } else if (fixture.on) {
    parts.push("set");
  }

  if (fixture.dim === true) parts.push("dark");
  const channel = CHANNEL_WORDS[fixture.channel];
  if (channel !== undefined) parts.push(channel);
  return `${parts.join(", ")}.`;
}

/**
 * The room PILOT is standing in, as lines a screen reader can read.
 *
 * Returns an empty list when there is no room, rather than a line saying so:
 * the caller has the phase and says it better than this can.
 */
export function describeRoom(view: PilotView | null): readonly string[] {
  if (view === null) return [];
  const plan = roomPlan(view);
  if (plan === null) return [];

  const lines: string[] = [roomTitle(view)];
  lines.push(
    `A room ${String(Math.round(plan.size.width))} metres across and ` +
      `${String(Math.round(plan.size.depth))} deep. ` +
      (plan.solved ? "Its mechanism has resolved." : "Its mechanism has not resolved."),
  );

  // Only fixtures. Dressing is what makes the room a place rather than a
  // diagram, and a list of forty pipes and crates would bury the four things
  // that matter under the things that do not.
  for (const fixture of plan.fixtures) lines.push(describeFixture(fixture, plan));

  // What was last heard, which is the `AUDIBLE` channel's text equivalent and
  // is the whole of Chamber II for a player who cannot hear it either.
  if (plan.sound !== null) lines.push(`You hear: ${plan.sound}`);
  return lines;
}
