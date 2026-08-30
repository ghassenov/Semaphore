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
