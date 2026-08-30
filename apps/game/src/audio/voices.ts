/**
 * Every sound the station makes, built out of oscillators and noise.
 *
 * Two kinds live here and they are shaped differently. A **cue** is a one-shot:
 * it schedules its own nodes, plays, and is collected. A **layer** runs until
 * it is stopped and hands back a handle, because the tension layers crossfade
 * against a clock rather than firing at a moment.
 *
 * Nothing here decides anything. What to play is `plan.ts`; when to play it is
 * `index.ts`. This file only knows how a bolt sounds.
 */

import type { Cue } from "@semaphore/protocol";
import type { Engine } from "./engine.js";

/** A running continuous voice. */
export interface Voice {
  /** Fade to `level` over `seconds`. Zero is silence, not a stop. */
  set(level: number, seconds?: number): void;
  stop(): void;
}

/** One scheduled step of a rhythmic layer. */
export type Step = (at: number, step: number) => void;

/**
 * A short envelope, which is what makes a raw oscillator a sound.
 *
 * Every voice in the file goes through this. A gain that jumps from 0 to 1
 * produces a click on the front of the note, which in a game whose puzzle is a
 * countable click is an actively confusing artefact.
 */
function envelope(
  ctx: AudioContext,
  at: number,
  attack: number,
  decay: number,
  peak = 1,
): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return gain;
}

/** An oscillator through an envelope, connected dry and wet. */
function tone(
  engine: Engine,
  options: {
    at: number;
    type: OscillatorType;
    from: number;
    to?: number;
    attack: number;
    decay: number;
    peak?: number;
    /** How much of it goes to the tower. */
    wet?: number;
    bus?: GainNode;
  },
): void {
  const { ctx } = engine;
  const osc = ctx.createOscillator();
  osc.type = options.type;
  osc.frequency.setValueAtTime(options.from, options.at);
  if (options.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, options.to),
      options.at + options.attack + options.decay,
    );
  }
  const gain = envelope(ctx, options.at, options.attack, options.decay, options.peak ?? 0.5);
  osc.connect(gain);
  gain.connect(options.bus ?? engine.sfx);
  if (options.wet) {
    const wet = ctx.createGain();
    wet.gain.value = options.wet;
    gain.connect(wet);
    wet.connect(engine.send);
  }
  osc.start(options.at);
  osc.stop(options.at + options.attack + options.decay + 0.05);
}

/** Filtered noise through an envelope. Hiss, breath, transients, wind. */
function noise(
  engine: Engine,
  options: {
    at: number;
    attack: number;
    decay: number;
    type: BiquadFilterType;
    from: number;
    to?: number;
    q?: number;
    peak?: number;
    wet?: number;
    bus?: GainNode;
  },
): void {
  const { ctx } = engine;
  const source = ctx.createBufferSource();
  source.buffer = engine.noise;
  // A random offset into the shared buffer, so repeated cues are not the
  // identical waveform every time. Twelve bolts in a row gave that away.
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = options.type;
  filter.frequency.setValueAtTime(options.from, options.at);
  if (options.to !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(20, options.to),
      options.at + options.attack + options.decay,
    );
  }
  filter.Q.value = options.q ?? 1;
  const gain = envelope(ctx, options.at, options.attack, options.decay, options.peak ?? 0.4);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(options.bus ?? engine.sfx);
  if (options.wet) {
    const wet = ctx.createGain();
    wet.gain.value = options.wet;
    gain.connect(wet);
    wet.connect(engine.send);
  }
  source.start(options.at, Math.random() * 1.5);
  source.stop(options.at + options.attack + options.decay + 0.05);
}

/** One heavy metal knock: a bolt, a lever seating, a door. */
function knock(engine: Engine, at: number, pitch: number, peak = 0.55): void {
  tone(engine, {
    at,
    type: "triangle",
    from: pitch,
    to: pitch * 0.4,
    attack: 0.002,
    decay: 0.22,
    peak,
    wet: 0.35,
  });
  noise(engine, {
    at,
    attack: 0.001,
    decay: 0.05,
    type: "lowpass",
    from: 1800,
    q: 0.7,
    peak: peak * 0.5,
  });
}

/**
 * The eight cues, each keyed by the vocabulary the worker emits.
 *
 * A table rather than a switch so the exhaustiveness is the type system's job:
 * adding a `Cue` in the protocol and forgetting to give it a sound is a
 * compile error here rather than a silence in the one chamber that needed it.
 */
const CUE_VOICES: Readonly<Record<Cue, (engine: Engine, at: number) => number>> = {
  /** A lever seating, then bolts running back. The Airlock opening. */
  clunk(engine, at) {
    knock(engine, at, 90, 0.7);
    for (let i = 0; i < 3; i += 1) knock(engine, at + 0.18 + i * 0.11, 150 + i * 20, 0.35);
    return 0.8;
  },

  /** Air venting hard. The Airlock's wrong lever, and the room floods a little. */
  hiss(engine, at) {
    noise(engine, {
      at,
      attack: 0.01,
      decay: 0.9,
      type: "bandpass",
      from: 3200,
      to: 700,
      q: 0.8,
      peak: 0.45,
      wet: 0.25,
    });
    return 0.95;
  },

  /** One brass key accepted. Bright, short, and unmistakably a yes. */
  chime(engine, at) {
    tone(engine, {
      at,
      type: "triangle",
      from: 1174.7,
      attack: 0.004,
      decay: 0.5,
      peak: 0.32,
      wet: 0.6,
    });
    tone(engine, {
      at,
      type: "triangle",
      from: 1760,
      attack: 0.004,
      decay: 0.34,
      peak: 0.16,
      wet: 0.6,
    });
    return 0.55;
  },

  /** A ring settling. The long resolution of a chamber coming open. */
  resolve(engine, at) {
    for (const [i, hz] of [146.8, 220, 293.7, 440].entries()) {
      tone(engine, {
        at: at + i * 0.06,
        type: "triangle",
        from: hz,
        attack: 0.01,
        decay: 2.4,
        peak: 0.26,
        wet: 0.9,
      });
    }
    return 2.6;
  },

  /** An alarm. A wrong key, or the Concord Lock throwing itself out. */
  klaxon(engine, at) {
    for (let i = 0; i < 2; i += 1) {
      const when = at + i * 0.34;
      tone(engine, {
        at: when,
        type: "square",
        from: 440,
        to: 330,
        attack: 0.01,
        decay: 0.28,
        peak: 0.2,
        wet: 0.4,
      });
      tone(engine, {
        at: when,
        type: "square",
        from: 221,
        to: 166,
        attack: 0.01,
        decay: 0.28,
        peak: 0.14,
      });
    }
    return 0.7;
  },

  /**
   * One click of a dial, through a grate.
   *
   * The most important sound in the game and the one with the least in it.
   * It has to survive being counted: short enough that eight of them at 180ms
   * do not smear, bright enough to cut the bed, and identical every time so a
   * player counts events rather than wondering whether two of them were one.
   */
  detent(engine, at) {
    noise(engine, {
      at,
      attack: 0.0005,
      decay: 0.035,
      type: "bandpass",
      from: 2600,
      q: 6,
      peak: 0.5,
    });
    tone(engine, {
      at,
      type: "square",
      from: 320,
      to: 190,
      attack: 0.001,
      decay: 0.03,
      peak: 0.14,
    });
    return 0.06;
  },

  /** Twelve bolts running back in sequence. The outer door, and the ending. */
  bolts(engine, at) {
    for (let i = 0; i < 12; i += 1) {
      // Accelerating, so it reads as a mechanism completing rather than a
      // metronome. The last four run almost together.
      knock(engine, at + (i / 12) ** 1.6 * 2, 70 + i * 9, 0.5);
    }
    tone(engine, {
      at: at + 2,
      type: "triangle",
      from: 110,
      attack: 0.02,
      decay: 2.2,
      peak: 0.3,
      wet: 0.9,
    });
    return 4;
  },

  /** A lock holding under tension. A swell, not a hit. */
  hum(engine, at) {
    tone(engine, { at, type: "sawtooth", from: 64, attack: 0.5, decay: 1.6, peak: 0.16, wet: 0.5 });
    tone(engine, { at, type: "sine", from: 96.5, attack: 0.6, decay: 1.5, peak: 0.1 });
    return 2.1;
  },
};

/**
 * Sound one cue, returning how long it occupies the room in seconds.
 *
 * The duration is what the engine ducks the music for, which is why it is
 * returned rather than tabulated somewhere else: a cue that got longer and a
 * duck that did not would leave the tail of it fighting the bed.
 */
export function playCue(engine: Engine, cue: Cue, at: number): number {
  return CUE_VOICES[cue](engine, at);
}

/**
 * The muffled thump of a KEEPER tool call, heard through the deck.
 *
 * Doc 06 section 11: PILOT cannot see what KEEPER is doing but can always hear
 * that it is doing something. Distinct per tool, because "KEEPER did *a*
 * thing" is much less useful than "KEEPER did the thing it does in this room",
 * and the pitch is derived from the name so a new tool gets its own note
 * without anybody maintaining a table.
 *
 * Heavily low-passed. It is behind a wall, and a crisp one would compete with
 * the detents it is often heard beside.
 */
export function playToolCall(engine: Engine, tool: string, at: number): number {
  let hash = 0;
  for (const char of tool) hash = (hash * 31 + char.charCodeAt(0)) % 2039;
  const pitch = 58 + (hash % 11) * 7;
  tone(engine, {
    at,
    type: "sine",
    from: pitch,
    to: pitch * 0.75,
    attack: 0.012,
    decay: 0.3,
    peak: 0.3,
    wet: 0.5,
  });
  noise(engine, {
    at,
    attack: 0.004,
    decay: 0.16,
    type: "lowpass",
    from: 420,
    q: 0.5,
    peak: 0.16,
    wet: 0.3,
  });
  return 0.35;
}

/** A gain node that fades, which is what every continuous voice hands back. */
function fader(engine: Engine, into: AudioNode): { node: GainNode; voice: Omit<Voice, "stop"> } {
  const node = engine.ctx.createGain();
  node.gain.value = 0;
  node.connect(into);
  return {
    node,
    voice: {
      set(level, seconds = 1.5) {
        node.gain.setTargetAtTime(level, engine.ctx.currentTime, Math.max(0.01, seconds / 3));
      },
    },
  };
}

/**
 * The ambience bed: drip, distant tide, wind through the lamp housing, and the
 * beacon motor.
 *
 * Continuous and seamless, so it is built from looping sources and filters
 * rather than scheduled events, with the one exception of the drips: a drip on
 * a loop is a rhythm, and a rhythm in an ambience bed is a machine. Those are
 * scheduled by `index.ts` on the same grid the tension layers use.
 */
export function startBed(engine: Engine): Voice {
  const { ctx } = engine;
  const { node, voice } = fader(engine, engine.bed);
  const stopped: { stop(when: number): void }[] = [];

  /** Distant tide: brown-ish noise under a slow filter sweep. */
  const tide = ctx.createBufferSource();
  tide.buffer = engine.noise;
  tide.loop = true;
  const tideFilter = ctx.createBiquadFilter();
  tideFilter.type = "lowpass";
  tideFilter.frequency.value = 220;
  const tideGain = ctx.createGain();
  tideGain.gain.value = 0.5;
  tide.connect(tideFilter);
  tideFilter.connect(tideGain);
  tideGain.connect(node);
  // The swell. Twenty-two seconds, so it never lines up with anything and
  // never becomes a beat.
  const swell = ctx.createOscillator();
  swell.frequency.value = 1 / 22;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 90;
  swell.connect(swellDepth);
  swellDepth.connect(tideFilter.frequency);
  tide.start();
  swell.start();
  stopped.push(tide, swell);

  /** Wind through the lamp housing: a narrow band, wandering. */
  const wind = ctx.createBufferSource();
  wind.buffer = engine.noise;
  wind.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = "bandpass";
  windFilter.frequency.value = 620;
  windFilter.Q.value = 3.5;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.22;
  wind.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(node);
  const gust = ctx.createOscillator();
  gust.frequency.value = 1 / 13;
  const gustDepth = ctx.createGain();
  gustDepth.gain.value = 260;
  gust.connect(gustDepth);
  gustDepth.connect(windFilter.frequency);
  wind.start();
  gust.start();
  stopped.push(wind, gust);

  /** The beacon motor: a low saw and the rumble of something always turning. */
  const motor = ctx.createOscillator();
  motor.type = "sawtooth";
  motor.frequency.value = 41;
  const motorFilter = ctx.createBiquadFilter();
  motorFilter.type = "lowpass";
  motorFilter.frequency.value = 160;
  const motorGain = ctx.createGain();
  motorGain.gain.value = 0.16;
  motor.connect(motorFilter);
  motorFilter.connect(motorGain);
  motorGain.connect(node);
  motor.start();
  stopped.push(motor);

  voice.set(1, 4);
  return {
    ...voice,
    stop() {
      const when = ctx.currentTime + 0.4;
      node.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
      for (const source of stopped) source.stop(when);
    },
  };
}

/** One drip, somewhere in the dark. Scheduled, never looped. */
export function playDrip(engine: Engine, at: number): void {
  const pitch = 900 + Math.random() * 900;
  tone(engine, {
    at,
    type: "sine",
    from: pitch,
    to: pitch * 0.55,
    attack: 0.002,
    decay: 0.13,
    peak: 0.12,
    wet: 1,
    bus: engine.bed,
  });
}

/**
 * The slow drone under everything from the moment a chamber starts.
 *
 * Two sawtooths a few cents apart, which is the whole trick: the beating
 * between them is what stops a held note sounding like a test tone.
 */
export function startDrone(engine: Engine): Voice {
  const { ctx } = engine;
  const { node, voice } = fader(engine, engine.music);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 340;
  filter.connect(node);

  const oscillators = [55, 55.4, 82.5].map((hz) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = hz;
    const gain = ctx.createGain();
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(filter);
    osc.start();
    return osc;
  });

  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  node.connect(wet);
  wet.connect(engine.send);

  return {
    ...voice,
    stop() {
      node.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      for (const osc of oscillators) osc.stop(ctx.currentTime + 0.8);
    },
  };
}

/** The rhythmic pulse: a soft kick on the beat, from half the clock down. */
export function playPulse(engine: Engine, at: number, level: number): void {
  tone(engine, {
    at,
    type: "sine",
    from: 132,
    to: 46,
    attack: 0.004,
    decay: 0.34,
    peak: 0.36 * level,
    wet: 0.3,
    bus: engine.music,
  });
}

/**
 * The arpeggio: four square-wave notes climbing, one per step.
 *
 * Chiptune, and deliberately so. It is the layer that says the clock has
 * become the thing to worry about.
 */
const ARPEGGIO = [329.6, 415.3, 493.9, 659.3];

export function playArpeggio(engine: Engine, at: number, step: number, level: number): void {
  const hz = ARPEGGIO[step % ARPEGGIO.length] ?? ARPEGGIO[0] ?? 440;
  tone(engine, {
    at,
    type: "square",
    from: hz,
    attack: 0.005,
    decay: 0.16,
    peak: 0.1 * level,
    wet: 0.55,
    bus: engine.music,
  });
}

/** The heartbeat: two thumps, close together, under the last tenth. */
export function playHeartbeat(engine: Engine, at: number, level: number): void {
  tone(engine, {
    at,
    type: "sine",
    from: 78,
    to: 40,
    attack: 0.006,
    decay: 0.3,
    peak: 0.5 * level,
    bus: engine.music,
  });
  tone(engine, {
    at: at + 0.19,
    type: "sine",
    from: 66,
    to: 36,
    attack: 0.006,
    decay: 0.26,
    peak: 0.34 * level,
    bus: engine.music,
  });
}
