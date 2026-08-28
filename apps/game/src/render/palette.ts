/**
 * The locked palette, and the one place a channel becomes a colour.
 *
 * Fourteen colours, fixed before any sprite work (doc 06 section 2). Adding a
 * fifteenth is a decision-log entry, not a judgement call, which is why they
 * live in one frozen table rather than as literals scattered through scenes.
 *
 * There is deliberately no green. Success is a bone-white flash and a shape
 * change, so red/green signalling is not available to be got wrong.
 *
 * Values are numbers rather than strings because that is what Phaser's
 * geometry and tint APIs take; a `#` string would be converted at every call
 * site instead of once here.
 */

/** Every colour the client may draw with. */
export const PALETTE = {
  void: 0x0d0f14,
  hull: 0x1a1f2b,
  hullLight: 0x2e3646,
  rust: 0x4a3b32,
  amberDeep: 0x8c5a1b,
  amber: 0xf0a830,
  amberBright: 0xffd98e,
  cyanDeep: 0x14606e,
  cyan: 0x3bc9db,
  cyanBright: 0xa5f3fc,
  bone: 0xf2efe6,
  boneDim: 0xa8a296,
  alarm: 0xe5484d,
  brass: 0xc9a227,
} as const;

/** A colour name, so a scene cannot name one that is not in the table. */
export type PaletteColour = keyof typeof PALETTE;

/**
 * Who perceives a drawn thing.
 *
 * This is the render-side echo of `Channel`, not a copy of it. The client only
 * ever receives `projectForPilot` output, so `TACTILE` and `HIDDEN` cannot
 * reach a frame and have no colour here. `AUDIBLE` is drawn bone-white with a
 * double ring, so it is a `shared` colour plus a marker rather than a colour
 * of its own.
 */
export type RenderChannel = "pilot" | "keeper" | "shared";

/**
 * The channel-to-colour law (doc 06 section 2, and this app's CLAUDE.md).
 *
 * Amber: only PILOT perceives this. Cyan: only KEEPER perceives this.
 * Bone-white: both. It never bends for a nice frame, which is why it is a
 * table and not a decision made per scene.
 */
export const CHANNEL_COLOUR: Readonly<Record<RenderChannel, PaletteColour>> = {
  pilot: "amber",
  keeper: "cyan",
  shared: "bone",
} as const;

/** The dim variant of a channel, for something present but inactive. */
export const CHANNEL_DIM: Readonly<Record<RenderChannel, PaletteColour>> = {
  pilot: "amberDeep",
  keeper: "cyanDeep",
  shared: "boneDim",
} as const;

/**
 * The shape marker that rides alongside every channel-coded element.
 *
 * Colour alone must never carry information: roughly one player in twelve
 * cannot separate the amber from the bone reliably, and a puzzle that is
 * unplayable for them is a puzzle we got wrong. Every element the legend
 * covers draws its marker too.
 */
export const CHANNEL_MARKER: Readonly<Record<RenderChannel, string>> = {
  pilot: "◆",
  keeper: "●",
  shared: "■",
} as const;
