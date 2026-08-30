/**
 * The audio graph: context, buses, reverb, ducking and the mix.
 *
 * **The only file in the client that creates an `AudioContext`**, for the same
 * reason `stage.ts` is the only file that creates a renderer and `kit.ts` the
 * only one that creates a material. A second context is a second output device
 * as far as the browser is concerned: two masters, two mutes, and a mute
 * control that silences half the station.
 *
 * Everything is synthesised. There is not an audio file in the repository and
 * there must not be one: D-044 took the last asset out of the bundle and the
 * client now fetches no images, no fonts and no media at all. A reverb tail is
 * noise with an envelope on it, which is cheaper to generate than to download.
 */

/** How loud each bus sits, and whether anything is heard at all. */
export interface Mix {
  /** Everything, 0 to 1. */
  readonly master: number;
  /** The bed and the tension layers, 0 to 1. */
  readonly music: number;
  /** Mechanisms: cues, detents, tool calls. 0 to 1. */
  readonly sfx: number;
  readonly muted: boolean;
}

export const DEFAULT_MIX: Mix = { master: 0.7, music: 0.55, sfx: 0.9, muted: false };

/** How far the music drops under a cue, in linear gain. Doc 06 asks for 6dB. */
const DUCK = 0.5;

/** How long the concrete tower rings for, in seconds. */
const REVERB_SECONDS = 2.4;

/**
 * The graph, and the handful of things the rest of the audio layer does to it.
 *
 * `sfx` and `music` are the two buses everything connects to; `send` is the
 * reverb, which every voice feeds in whatever proportion suits it. A voice
 * that wants to sound like it is behind a wall sends a lot and connects dry
 * hardly at all.
 */
export interface Engine {
  readonly ctx: AudioContext;
  /** Mechanisms. Never ducked: it is the thing everything else ducks for. */
  readonly sfx: GainNode;
  /** The bed and the tension layers. Ducked under every cue. */
  readonly music: GainNode;
  /** The reverb send. Wet only; voices connect dry separately. */
  readonly send: GainNode;
  /** A shared buffer of white noise, so no voice generates its own. */
  readonly noise: AudioBuffer;
  /** Drop the music for `seconds`, then bring it back. */
  duck(seconds: number): void;
  /** How loud the bed sits under the tension layers, 0 to 1. */
  setBed(level: number): void;
  /** The bed's gain node, which the ambience connects to rather than `music`. */
  readonly bed: GainNode;
  readonly mix: Mix;
  setMix(next: Partial<Mix>): void;
  /** Bring the context back after a tab switch or an autoplay block. */
  resume(): Promise<void>;
  close(): void;
}

/**
 * An impulse response for a large concrete room, generated rather than loaded.
 *
 * Exponentially decaying noise is the standard cheap convolution reverb and it
 * is exactly right for what doc 06 asks for: square waves inside a tower. The
 * two channels are decorrelated so the tail is wide rather than a point.
 */
function concreteTower(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * REVERB_SECONDS);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      // A slow front and a long tail: the early part of the curve is what
      // makes a room sound large rather than merely reverberant.
      const decay = (1 - i / length) ** 2.6;
      samples[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return buffer;
}

/** Two seconds of white noise, shared by every voice that needs a texture. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Bring the graph up. Must be called from a user gesture.
 *
 * Every browser blocks an `AudioContext` that was not started by a click, and
 * blocks it silently. The station's gesture is the launch card: a player picks
 * a session length and that click is what opens the context, which is also the
 * moment the sound has something to say.
 */
export function createEngine(mix: Mix = DEFAULT_MIX): Engine {
  const ctx = new AudioContext();

  const master = ctx.createGain();
  master.connect(ctx.destination);

  const sfx = ctx.createGain();
  const music = ctx.createGain();
  sfx.connect(master);
  music.connect(master);

  // The bed hangs off the music bus rather than beside it, so muting the music
  // takes the ambience with it and the heartbeat duck is one node deep.
  const bed = ctx.createGain();
  bed.connect(music);

  const reverb = ctx.createConvolver();
  reverb.buffer = concreteTower(ctx);
  reverb.connect(master);
  const send = ctx.createGain();
  send.gain.value = 0.9;
  send.connect(reverb);

  const noise = noiseBuffer(ctx);

  let current: Mix = mix;
  /** What the music bus sits at when nothing is ducking it. */
  let musicLevel = 0;
  let duckUntil = 0;

  function applyMix(): void {
    const gate = current.muted ? 0 : current.master;
    master.gain.setTargetAtTime(gate, ctx.currentTime, 0.02);
    sfx.gain.setTargetAtTime(current.sfx, ctx.currentTime, 0.02);
    musicLevel = current.music;
    // Never stamp over a duck that is still running: a mix change during a
    // cue would otherwise snap the music back up in the middle of it.
    const target = ctx.currentTime < duckUntil ? musicLevel * DUCK : musicLevel;
    music.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
  }
  applyMix();

  return {
    ctx,
    sfx,
    music,
    send,
    bed,
    noise,
    get mix() {
      return current;
    },
    setMix(next) {
      current = { ...current, ...next };
      applyMix();
    },
    duck(seconds) {
      const now = ctx.currentTime;
      duckUntil = Math.max(duckUntil, now + seconds);
      music.gain.cancelScheduledValues(now);
      music.gain.setTargetAtTime(musicLevel * DUCK, now, 0.01);
      // Released from the *latest* duck rather than this one, so overlapping
      // cues do not each schedule their own release and pump the bed.
      music.gain.setTargetAtTime(musicLevel, duckUntil, 0.12);
    },
    setBed(level) {
      bed.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
    },
    async resume() {
      if (ctx.state === "suspended") await ctx.resume();
    },
    close() {
      void ctx.close();
    },
  };
}
