/**
 * The colour language, and the one place a channel becomes a colour.
 *
 * This is "Low Tide", the palette written for the 3D interface (D-043). It
 * replaces the fourteen flat colours doc 06 section 2 locked for pixel art.
 * The law it serves has not changed and does not bend:
 *
 * > One party's colour means only that party perceives the thing.
 *
 * What changed is how a colour reaches the screen. In a pixel renderer a
 * colour is a fill, so fourteen of them is a complete vocabulary. In a lit 3D
 * scene a colour is a **material under a light**, and the same brass plate is
 * six values between its shadow and its highlight before anybody chooses
 * anything. So the palette is now two locked sets with different jobs:
 *
 * - **Channel colours** (`lamp`, `tide`, `pearl`, each with a deep and a bright
 *   variant) carry information. They are the only chroma the station is allowed
 *   to emit, and nothing that is not a channel-coded fact may wear one.
 * - **Ground and material colours** carry no information at all. They are the
 *   cold near-neutral the building is made of, and they exist so the two
 *   channel hues are the only saturated things in any frame.
 *
 * That split is the whole aesthetic idea. Desaturate everything that is not a
 * fact, and the facts light up on their own without being shouted.
 *
 * **Why these two hues.** Lamplight sits at roughly 33 degrees and tidewater at
 * roughly 220, which is very nearly complementary and, more importantly, is the
 * blue-yellow axis. Protanopia and deuteranopia both preserve blue-yellow
 * separation, so the pair survives the two common deficiencies. Tritanopia does
 * not, which is why every channel-coded element still carries its shape marker
 * (`CHANNEL_MARKER`) and why colour is never the only cue.
 *
 * **There is still deliberately no green.** Success is a pearl-white flash and a
 * shape change. Red/green signalling is not available to be got wrong, and
 * `alarm` is the one warm red in the set, reserved for penalties and never used
 * to carry information.
 *
 * Values are numbers because that is what Three.js takes; `style.css` restates
 * the same numbers as custom properties, and `palette.test.ts` holds the two
 * copies to each other so a colour cannot be changed in one and not the other.
 */

/**
 * The ground the station is made of: cold, near-neutral, deliberately dull.
 *
 * Seven steps rather than the pixel palette's four, because a lit surface
 * interpolates between them and four steps band visibly across a wall. None of
 * these may ever carry a fact.
 */
const GROUND = {
  /** Beyond the building. The clear colour, and the deepest shadow there is. */
  abyss: 0x03040a,
  /** The page, and the sea outside the windows. */
  ink: 0x080b14,
  /** Stone in shadow. */
  slate: 0x0f1420,
  /** Stone, unlit. The station's base note. */
  stone: 0x18202f,
  /** Stone catching light. */
  ash: 0x28334a,
  /** Structural metal: frames, rails, the grate. */
  iron: 0x55637d,
  /** Distant haze, and the console's quietest text. */
  mist: 0xa3b1c7,
} as const;

/**
 * What the station is built and furnished from. Never a fact, never a state.
 *
 * `brass` is close to `lamp` in hue and that is a deliberate risk: brass is the
 * material a mechanism is made of and lamplight is the channel a fact belongs
 * to, and they meet constantly. They are separated by chroma and by value
 * rather than by hue - brass is darker and duller, and it is never emissive -
 * so a lit fact reads against a brass mechanism the way a filament reads
 * against its housing.
 */
const MATERIAL = {
  brass: 0xc9954a,
  copper: 0x9a6242,
  rust: 0x6b4230,
  /** A dead screen, and the water when nothing is lighting it. */
  glass: 0x0d1a24,
} as const;

/**
 * PILOT's channel: lamplight.
 *
 * A warm sodium gold, softer and less saturated than the amber it replaces.
 * The softness is not timidity: every one of these surfaces is emissive under a
 * filmic tone curve, so the source blows out toward white and it is the halo
 * around it that carries the hue. A high-chroma base only makes the halo
 * orange.
 */
const LAMP = {
  lampDeep: 0x7a3a06,
  lamp: 0xff9d2e,
  lampBright: 0xffd9a3,
} as const;

/**
 * KEEPER's channel: tidewater.
 *
 * A cold moonlight blue with a violet lean, chosen over the cyan it replaces
 * for two reasons. Cyan at this saturation is the default colour of every
 * science-fiction interface ever shipped and reads as a preset rather than as a
 * decision. And a blue this cold is further from lamplight on the hue circle
 * than cyan is, so the two channels separate harder in exactly the frames where
 * they meet.
 */
const TIDE = {
  tideDeep: 0x0a3f5e,
  tide: 0x3fd0e8,
  tideBright: 0xa8f0ff,
} as const;

/**
 * The shared channel: pearl.
 *
 * A warm off-white, sitting between the two channels rather than beside them,
 * which is the right place for a fact both parties hold. It is the only
 * near-white in the set, so a shared fact is legible as "not either of ours"
 * before its shape marker is read.
 */
const PEARL = {
  pearl: 0xf2efe9,
  pearlDim: 0x97a0ab,
} as const;

/** Penalties, and nothing else. Never used to carry information. */
const SIGNAL = {
  alarm: 0xe05a4f,
} as const;

/**
 * Every colour the client may draw with.
 *
 * Locked, exactly as the fourteen were. Adding one is a decision-log entry
 * rather than a judgement call, and the lock is what stops a scene reaching for
 * "just a slightly different grey" until the station has no palette at all.
 */
export const PALETTE = {
  ...GROUND,
  ...MATERIAL,
  ...LAMP,
  ...TIDE,
  ...PEARL,
  ...SIGNAL,
} as const;

/** A colour name, so a scene cannot name one that is not in the table. */
export type PaletteColour = keyof typeof PALETTE;

/**
 * Who perceives a drawn thing.
 *
 * The render-side echo of `Channel`, not a copy of it. The client only ever
 * receives `projectForPilot` output, so `TACTILE` and `HIDDEN` cannot reach a
 * frame and have no colour here. `AUDIBLE` is drawn as pearl with a double
 * ring, so it is the shared colour plus a marker rather than a colour of its
 * own.
 */
export type RenderChannel = "pilot" | "keeper" | "shared";

/** The three tones a channel is drawn with: shadow, body and emission. */
export interface ChannelTones {
  /** The unlit material. What the thing is made of when nothing lights it. */
  readonly deep: number;
  /** The channel's own colour. The light it casts and the halo it wears. */
  readonly key: number;
  /** Where the emission saturates. The filament, not the glow. */
  readonly bright: number;
}

/**
 * The channel-to-colour law (doc 06, and this app's CLAUDE.md).
 *
 * Lamplight: only PILOT perceives this. Tidewater: only KEEPER. Pearl: both.
 * It never bends for a nice frame, which is why it is a table rather than a
 * decision made per scene.
 */
export const CHANNEL: Readonly<Record<RenderChannel, ChannelTones>> = {
  pilot: { deep: PALETTE.lampDeep, key: PALETTE.lamp, bright: PALETTE.lampBright },
  keeper: { deep: PALETTE.tideDeep, key: PALETTE.tide, bright: PALETTE.tideBright },
  shared: { deep: PALETTE.iron, key: PALETTE.pearl, bright: PALETTE.pearl },
} as const;

/**
 * The shape marker that rides alongside every channel-coded element.
 *
 * Colour alone must never carry information: roughly one player in twelve
 * cannot separate the two channels reliably, and a puzzle that is unplayable
 * for them is a puzzle we got wrong. Every element the legend covers draws its
 * marker too.
 */
export const CHANNEL_MARKER: Readonly<Record<RenderChannel, string>> = {
  pilot: "◆",
  keeper: "●",
  shared: "■",
} as const;

/** A palette entry as a CSS hex string, for the console and for text objects. */
export function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

/**
 * Mix two palette colours in linear-ish sRGB space.
 *
 * Used for the few places a value between two locked colours is genuinely the
 * right answer - a wall fading into fog, a limb part-way through detaching -
 * rather than letting those call sites invent a fifteenth colour each. The
 * inputs are still locked; only the interpolation is free.
 */
export function mix(from: number, to: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const lerp = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * k) & 0xff;
  };
  return (lerp(16) << 16) | (lerp(8) << 8) | lerp(0);
}
