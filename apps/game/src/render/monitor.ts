/**
 * The station's monitor picture, drawn to a 2D canvas.
 *
 * One routine, three surfaces. It began inside `stage.ts` as the thing the
 * Archive's CRT shows, and it is now also what the gate screen's SPECTATE
 * panel plays and what the landing screen falls into when nobody has touched
 * it for a while. The three had to be the same picture rather than three
 * drawings of it: a judge who never gets past the gate sees this and should be
 * looking at the same station a player does.
 *
 * **It draws with a canvas context and nothing else.** That is what makes it
 * shareable. `stage.ts` hands it the texture-backed canvas the CRT is mapped
 * to and flags the texture afterwards; the gate hands it a plain `<canvas>` in
 * the document. Neither Three.js nor the 143KB chunk it lives in is reachable
 * from here, which is the whole reason a browser that cannot play the game can
 * still be shown one (`main.ts` never awaits the engine on that branch).
 *
 * Pure in the sense that matters: given the same track and the same elapsed
 * milliseconds it paints the same frame, so what the Archive shows and what
 * SPECTATE shows cannot drift apart.
 */

import type { GhostTrack } from "@semaphore/protocol";
import { ghostFrame } from "./ghost.js";
import { PALETTE, hex } from "./palette.js";

/**
 * Paint one frame of a recorded session onto a canvas.
 *
 * `elapsedMs` is time since the playback started, not since the session did.
 * A caller that wants the recording to loop passes a value that wraps; the
 * Archive's does not, because the tail is the beat (`ghost.ts`, `TAIL_MS`).
 *
 * A `null` track is drawn rather than skipped. A dead monitor is a rendering
 * bug and a monitor that says NO TAPE is a prop, and the pair have to be able
 * to tell those apart from across the room.
 */
export function paintMonitor(
  canvas: HTMLCanvasElement,
  track: GhostTrack | null,
  elapsedMs: number,
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;

  context.fillStyle = hex(PALETTE.abyss);
  context.fillRect(0, 0, width, height);

  if (track === null) {
    context.fillStyle = hex(PALETTE.lampDeep);
    context.font = "600 22px ui-monospace, Menlo, monospace";
    context.textAlign = "center";
    context.fillText("NO TAPE", width / 2, height / 2);
    return;
  }

  const frame = ghostFrame(track, elapsedMs);

  // The designation. A session log carries no other name, and it is the
  // reason the beat lands at all: the pair are watching somebody.
  context.fillStyle = hex(PALETTE.lampDeep);
  context.font = "600 17px ui-monospace, Menlo, monospace";
  context.textAlign = "left";
  context.fillText(track.designation, 14, 26);

  // The room the ghost was in, as a plan at its true proportion.
  const bandTop = 40;
  const bandHeight = height - 96;
  const scale = Math.min((width - 60) / frame.width, bandHeight / frame.depth);
  const planWidth = frame.width * scale;
  const planDepth = frame.depth * scale;
  const planX = (width - planWidth) / 2;
  const planY = bandTop + (bandHeight - planDepth) / 2;

  context.strokeStyle = hex(frame.ended ? PALETTE.lampDeep : PALETTE.lamp);
  context.lineWidth = 2;
  context.strokeRect(planX, planY, planWidth, planDepth);

  // The ghost, walking. Every position between two beats is `ghost.ts`'s
  // invention: PILOT's position is client-local and no session log has ever
  // carried it. The beats themselves are real, which is what makes the
  // interpolation honest rather than a fiction.
  const bodySize = Math.max(6, scale * 0.9);
  const bodyX = planX + frame.walk * (planWidth - bodySize);
  const bodyY = planY + planDepth - bodySize - 4;
  context.fillStyle = hex(frame.ended ? PALETTE.lampDeep : PALETTE.lamp);
  context.fillRect(bodyX, bodyY, bodySize, bodySize);
  // Gripping is the one posture worth drawing: the ghost is holding the bar,
  // and the reason the recording stops is that they could not hold it.
  if (frame.gripping) context.fillRect(bodyX, bodyY - bodySize - 2, bodySize, bodySize);

  // One line, centred, saying what is happening.
  context.fillStyle = hex(frame.ended ? PALETTE.pearl : PALETTE.lamp);
  context.font = "600 16px ui-monospace, Menlo, monospace";
  context.textAlign = "center";
  context.fillText(frame.caption, width / 2, height - 34);

  // The scrub bar, so a pair arriving part way through can see there is a
  // beginning to wait for.
  context.fillStyle = hex(PALETTE.lampDeep);
  context.fillRect(14, height - 18, width - 28, 3);
  context.fillStyle = hex(PALETTE.lamp);
  context.fillRect(14, height - 18, (width - 28) * frame.progress, 3);

  // Scanlines, last, over everything. A monitor in a station this old is not
  // a clean surface, and the lines are what stop the schematic reading as a
  // modern overlay pasted onto a 3D scene.
  context.fillStyle = "rgba(5,7,10,0.28)";
  for (let y = 0; y < height; y += 3) context.fillRect(0, y, width, 1);
}

/**
 * One thing the ghost's agent did, as the gate's KEEPER panel draws it.
 *
 * A trimmed `tool_call`: the whole event carries a view hash and a bits
 * reading, which mean nothing on a monitor. `ghostForGate` on the worker does
 * the trimming, so this shape and that one are the same three fields.
 */
export interface GhostCall {
  readonly t: number;
  readonly tool: string;
  readonly wasted: boolean;
}

/**
 * The same recording, as KEEPER perceived it. **The gaps are the point.**
 *
 * Beside `paintMonitor` on one clock this is the whole thesis in one picture,
 * for a reader who has not typed anything and may never: on the left a room at
 * its true proportion with a person walking in it, on the right the calls that
 * person's partner was making at that second and a hole where the room would
 * be. Doc 07 section 6 is explicit that for some judges the gate screen *is*
 * the submission, and until now that screen showed the game working without
 * once showing the thing the game is about.
 *
 * It draws only what a session log records on KEEPER's side. There is no
 * position here because no tool has ever returned one, and no room outline
 * because KEEPER has never seen a room - the dashed void is not a stylisation,
 * it is the shape of the projection.
 *
 * `paintMonitor`'s twin in every other respect: a 2D context and nothing else,
 * so the gate screen still never fetches the 143KB engine, and the same
 * scanlines over the top so the two panels read as one monitor.
 */
export function paintKeeperMonitor(
  canvas: HTMLCanvasElement,
  designation: string | null,
  calls: readonly GhostCall[],
  elapsedMs: number,
  /**
   * The recording's own length, so both scrub bars measure against the same
   * thing.
   *
   * Not optional and not derived from the last call. The first version divided
   * by the timestamp of the final tool call, which is a *different* denominator
   * from `ghostFrame`'s `track.durationMs`, and the two bars sat visibly apart
   * on screen - the picture quietly saying these are not the same moment,
   * which is the one thing it exists to say they are.
   */
  durationMs: number,
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;

  context.fillStyle = hex(PALETTE.abyss);
  context.fillRect(0, 0, width, height);

  if (designation === null) {
    context.fillStyle = hex(PALETTE.tideDeep);
    context.font = "600 22px ui-monospace, Menlo, monospace";
    context.textAlign = "center";
    context.fillText("NO TAPE", width / 2, height / 2);
    return;
  }

  // The designation, in KEEPER's own colour. It is `SHARED` - the agent named
  // itself out loud on its first call - so it is the one thing on both panels.
  context.fillStyle = hex(PALETTE.tideDeep);
  context.font = "600 17px ui-monospace, Menlo, monospace";
  context.textAlign = "left";
  context.fillText(designation, 14, 26);

  // The hole where the room is on the other panel, at the same place and the
  // same size, because the alignment is the argument.
  const bandTop = 40;
  const bandHeight = height - 96;
  const voidWidth = width - 60;
  const voidX = 30;
  const voidY = bandTop + bandHeight * 0.08;
  const voidHeight = bandHeight * 0.5;
  context.strokeStyle = hex(PALETTE.tideDeep);
  context.lineWidth = 2;
  context.setLineDash([6, 6]);
  context.strokeRect(voidX, voidY, voidWidth, voidHeight);
  context.setLineDash([]);
  context.fillStyle = hex(PALETTE.tideDeep);
  context.font = "600 13px ui-monospace, Menlo, monospace";
  context.textAlign = "center";
  context.fillText("NO VISUAL CHANNEL", width / 2, voidY + voidHeight / 2 + 5);

  // The calls that have landed by now, newest last, oldest fading out of the
  // top. Three lines: enough to see a rhythm, few enough that the panel is a
  // readout rather than a transcript.
  const landed = calls.filter((call) => call.t <= elapsedMs);
  const recent = landed.slice(-3);
  context.textAlign = "left";
  context.font = "600 14px ui-monospace, Menlo, monospace";
  recent.forEach((call, index) => {
    const age = recent.length - 1 - index;
    context.fillStyle = hex(age === 0 ? PALETTE.tide : PALETTE.tideDeep);
    // A wasted call is one that could not have taught KEEPER anything given
    // what it held at the time. Marked rather than hidden: watching an agent
    // guess is a large part of what this recording is worth looking at.
    const mark = call.wasted ? " -" : " +";
    context.fillText(`${call.tool}${mark}`, voidX, voidY + voidHeight + 26 + index * 20);
  });
  if (landed.length === 0) {
    context.fillStyle = hex(PALETTE.tideDeep);
    context.fillText("waiting for the shift to start", voidX, voidY + voidHeight + 26);
  }

  // The count, where the other panel puts its caption, so the two lines sit on
  // one baseline and the pair reads as one picture rather than two.
  context.fillStyle = hex(PALETTE.tide);
  context.font = "600 16px ui-monospace, Menlo, monospace";
  context.textAlign = "center";
  context.fillText(`${String(landed.length)} tool calls`, width / 2, height - 34);

  context.fillStyle = hex(PALETTE.tideDeep);
  context.fillRect(14, height - 18, width - 28, 3);
  context.fillStyle = hex(PALETTE.tide);
  const progress = Math.min(1, elapsedMs / Math.max(durationMs, 1));
  context.fillRect(14, height - 18, (width - 28) * progress, 3);

  context.fillStyle = "rgba(5,7,10,0.28)";
  for (let y = 0; y < height; y += 3) context.fillRect(0, y, width, 1);
}
