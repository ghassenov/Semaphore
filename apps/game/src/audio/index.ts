/**
 * The station's sound, as one object the rest of the client drives.
 *
 * Three things reach it and nothing else should: the launch card starts it,
 * every pushed frame updates it, and every KEEPER tool call is announced to
 * it. Everything between those and an oscillator is in here, `engine.ts` and
 * `voices.ts`.
 *
 * **It is silent and inert until `start()` is called from a click.** Every
 * browser refuses an `AudioContext` opened outside a user gesture, and refuses
 * it silently, so the handle exists from page load and the graph does not.
 */

import type { PilotView } from "@semaphore/protocol";
import { createEngine, DEFAULT_MIX, type Engine, type Mix } from "./engine.js";

export type { Mix } from "./engine.js";

/** The three faders, which is every field of the mix that is not the mute. */
export type Fader = "master" | "music" | "sfx";
import { DETENT_MS, scoreFor, soundingFor, type Layer } from "./plan.js";
import {
  playArpeggio,
  playCue,
  playDrip,
  playHeartbeat,
  playPulse,
  playTheme,
  playToolCall,
  startBed,
  startDrone,
  type Voice,
} from "./voices.js";

/** How often the scheduler wakes, in milliseconds. */
const TICK_MS = 100;

/** How far ahead of the clock events are scheduled, in seconds. */
const LOOKAHEAD = 0.4;

/** One step of the grid, in seconds. An eighth note at 96bpm. */
const STEP = 0.3125;

/** How fast a scheduled layer fades in or out, per tick. */
const CROSSFADE = 0.06;

/** How many steps between drips, at the low and high end. */
const DRIP_STEPS = [10, 30] as const;

export interface StationAudio {
  /** Open the graph. Must be called from a user gesture. Idempotent. */
  start(): void;
  /** A new frame. Sounds whatever it brought, and sets the tension layers. */
  update(view: PilotView | null, chamberTimerMs: number): void;
  /** KEEPER called a tool. The muffled thump PILOT always hears. */
  toolCall(tool: string): void;
  readonly mix: Mix;
  setMix(next: Partial<Mix>): void;
  stop(): void;
}

/** The layers that are scheduled onto the grid rather than held open. */
const SCHEDULED: readonly Layer[] = ["theme", "pulse", "arpeggio", "heartbeat"];

export function createStationAudio(): StationAudio {
  let engine: Engine | null = null;
  let bed: Voice | null = null;
  let drone: Voice | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  /** The last frame sounded, so a repeated frame is not sounded twice. */
  let previous: PilotView | null = null;
  let mix: Mix = DEFAULT_MIX;

  /** Where each scheduled layer currently sits, 0 to 1, eased toward `wanted`. */
  const level: Record<string, number> = { theme: 0, pulse: 0, arpeggio: 0, heartbeat: 0 };
  let wanted: ReadonlySet<Layer> = new Set();

  /** The next grid step to schedule, in context time, and its index. */
  let nextAt = 0;
  let step = 0;
  let nextDrip = 0;

  /**
   * Schedule everything that falls inside the lookahead window.
   *
   * The standard Web Audio pattern, and the reason for it is that `setInterval`
   * is not a musical clock: it drifts, it is throttled in a background tab, and
   * it fires late under load. The audio clock does none of those things, so the
   * timer's only job is to wake up often enough to stay ahead of it.
   */
  function schedule(): void {
    if (!engine) return;
    const { ctx } = engine;

    for (const layer of SCHEDULED) {
      const target = wanted.has(layer) ? 1 : 0;
      const at = level[layer] ?? 0;
      level[layer] = at + Math.sign(target - at) * Math.min(CROSSFADE, Math.abs(target - at));
    }

    while (nextAt < ctx.currentTime + LOOKAHEAD) {
      // A step in the past is a step the audio clock has already run past,
      // which happens whenever the tab was hidden. Catch up rather than
      // scheduling a burst of everything that was missed.
      if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05;

      // The theme first, because it is the bed the rest sits on and it is the
      // only scheduled layer that is on from the first bar to the last.
      playTheme(engine, nextAt, step, level["theme"] ?? 0);

      const beat = step % 2 === 0;
      if (beat && (level["pulse"] ?? 0) > 0.01) playPulse(engine, nextAt, level["pulse"] ?? 0);
      if ((level["arpeggio"] ?? 0) > 0.01)
        playArpeggio(engine, nextAt, step, level["arpeggio"] ?? 0);
      if (step % 4 === 0 && (level["heartbeat"] ?? 0) > 0.01) {
        playHeartbeat(engine, nextAt, level["heartbeat"] ?? 0);
      }
      if (step >= nextDrip) {
        playDrip(engine, nextAt);
        const [low, high] = DRIP_STEPS;
        nextDrip = step + low + Math.floor(Math.random() * (high - low));
      }

      nextAt += STEP;
      step += 1;
    }
  }

  return {
    start() {
      if (engine) return;
      // A machine with no audio device throws here, and a headless browser is
      // one: the screenshot tour clicks this same launch card. Sound is the
      // one subsystem in the client that is allowed to be absent, so it fails
      // to silence rather than taking the session down with it. Everything
      // below is already a no-op while `engine` is null.
      try {
        engine = createEngine(mix);
        bed = startBed(engine);
        drone = startDrone(engine);
        drone.set(0.6, 6);
        nextAt = engine.ctx.currentTime + 0.1;
        timer = setInterval(schedule, TICK_MS);
      } catch {
        engine = null;
        bed = null;
        drone = null;
      }
    },

    update(view, chamberTimerMs) {
      if (!engine || !view) return;
      void engine.resume();

      const score = scoreFor(view.remainingMs, chamberTimerMs);
      wanted = new Set(score.layers);
      engine.setBed(score.bed);
      drone?.set(score.layers.includes("drone") ? 0.6 : 0, 3);

      // Sound whatever this frame brought, once. `soundingFor` keys on the
      // event counter rather than on the facts, which is what makes two
      // identical rotations two sounds instead of one (see `plan.ts`).
      const sounding = soundingFor(previous, view);
      previous = view;
      if (!sounding) return;

      const now = engine.ctx.currentTime + 0.02;
      if (sounding.cue === "detent") {
        // Evenly spaced and never overlapped, because the count is the answer.
        for (let i = 0; i < sounding.count; i += 1) {
          playCue(engine, "detent", now + (i * DETENT_MS) / 1000);
        }
        engine.duck((sounding.count * DETENT_MS) / 1000 + 0.2);
        return;
      }
      engine.duck(playCue(engine, sounding.cue, now));
    },

    toolCall(tool) {
      if (!engine) return;
      engine.duck(playToolCall(engine, tool, engine.ctx.currentTime + 0.02));
    },

    get mix() {
      return engine?.mix ?? mix;
    },

    setMix(next) {
      mix = { ...mix, ...next };
      engine?.setMix(next);
    },

    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      bed?.stop();
      drone?.stop();
      engine?.close();
      engine = null;
      bed = null;
      drone = null;
      previous = null;
    },
  };
}
