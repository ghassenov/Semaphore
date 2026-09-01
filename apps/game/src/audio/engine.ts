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
  /**
   * A bus that arrives from a place in the room, for a voice to connect to
   * instead of `sfx`.
   *
   * One method rather than a change to every voice: `tone` and `noise` already
   * take an optional `bus`, so the whole of spatialisation is "hand them a
   * different node". Coordinates are normalised room coordinates (`plan.ts`):
   * `x` west to east, `z` from the open south face to the far wall.
   */
  placed(x: number, z: number): GainNode;
  /** Move PILOT's ears. Called every frame by the stage, in the same units. */
  listen(x: number, z: number): void;
  /** Rebuild the reverb for the room the pair is standing in. Idempotent. */
  setRoom(seconds: number, decay: number): void;
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
 * An impulse response for a concrete room, generated rather than loaded, and
 * **built from the room it is for**.
 *
 * Exponentially decaying noise is the standard cheap convolution reverb and it
 * is exactly right for what doc 06 asks for: square waves inside a tower. The
 * two channels are decorrelated so the tail is wide rather than a point.
 *
 * The two parameters are the two things a listener actually hears the
 * difference between, and `plan.ts` decides them per room (`ACOUSTICS`). One
 * fixed response for all five rooms made the station one room: the Concord Lock
 * is the tall one and should ring like the inside of a tower, and the Blind
 * Panel is low and half-full of machinery and should be the driest place in the
 * station - which matters mechanically as well as atmospherically, because it
 * is the one room where a count has to be picked out of the reverb.
 */
function roomResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      // A slow front and a long tail: the early part of the curve is what
      // makes a room sound large rather than merely reverberant.
      const envelope = (1 - i / length) ** decay;
      samples[i] = (Math.random() * 2 - 1) * envelope;
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
  /** The room the convolver is currently built for, so a repeat is free. */
  let roomSeconds = 2.4;
  let roomDecay = 2.6;
  reverb.buffer = roomResponse(ctx, roomSeconds, roomDecay);
  reverb.connect(master);
  const send = ctx.createGain();
  send.gain.value = 0.9;
  send.connect(reverb);

  const noise = noiseBuffer(ctx);

  /*
   * How far apart the ears are, in the units `placed` and `listen` use.
   *
   * A room is two units across by construction, so a listener at the centre is
   * one unit from each wall. The panner's reference distance is set to a
   * comfortable fraction of that: large enough that walking a metre is audible,
   * small enough that a sound at the far wall does not vanish. These are the
   * numbers to reach for if the station ever sounds too wide or too flat, and
   * they are here rather than in `plan.ts` because they are properties of the
   * node graph rather than decisions about the game.
   */
  const REFERENCE_DISTANCE = 0.7;
  const ROLLOFF = 0.9;

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
    placed(x, z) {
      const panner = ctx.createPanner();
      /*
       * Equal-power rather than HRTF, and that is a decision rather than a
       * default.
       *
       * HRTF colours what it pans - it is a pair of measured filters, which is
       * the point of it - and this game has a sound whose *transient* is a
       * puzzle mechanism. Chamber II has PILOT counting detents through a
       * grate, 180ms apart, and doc 02 section 3.3 makes that count the answer.
       * A panning model that softens the front of a click to place it better is
       * trading the thing the sound is for against the thing it is decoration
       * for. Equal power is also markedly cheaper per source, which matters
       * where the renderer's own budget is already the open question: the
       * ChatGPT in-app browser on a phone.
       */
      panner.panningModel = "equalpower";
      panner.distanceModel = "inverse";
      panner.refDistance = REFERENCE_DISTANCE;
      panner.rolloffFactor = ROLLOFF;
      panner.positionX.value = x;
      panner.positionY.value = 0;
      panner.positionZ.value = z;
      const gain = ctx.createGain();
      gain.connect(panner);
      panner.connect(sfx);
      return gain;
    },
    listen(x, z) {
      const { listener } = ctx;
      // `setPosition` is deprecated and still the only path on some engines, so
      // the AudioParam form is used where it exists and the old call is the
      // fallback rather than the other way round.
      if (listener.positionX) {
        listener.positionX.value = x;
        listener.positionY.value = 0;
        listener.positionZ.value = z;
      } else {
        listener.setPosition(x, 0, z);
      }
    },
    setRoom(seconds, decay) {
      if (seconds === roomSeconds && decay === roomDecay) return;
      roomSeconds = seconds;
      roomDecay = decay;
      // Swapping the buffer on a live convolver truncates whatever tail is
      // still ringing. That is correct here and it is also the *point*: the
      // rooms are separated by a walk and a camera move, so the cut lands under
      // the transition rather than under anything anybody is listening to.
      reverb.buffer = roomResponse(ctx, seconds, decay);
    },
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
