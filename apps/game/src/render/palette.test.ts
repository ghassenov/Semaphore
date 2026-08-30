/**
 * The colour language, held to the rules it exists to enforce.
 *
 * Colour is this game's information architecture, so a change here is a change
 * to what the player is being told. Three properties are worth a test rather
 * than a convention:
 *
 * - **The set is locked.** A colour arrives through the decision log or it does
 *   not arrive. Without a count, "just one more grey" is a one-line diff that
 *   nobody reviews and the station slowly stops having a palette.
 * - **There is no green.** Red/green signalling is the most common
 *   accessibility failure in puzzle games and the cheapest defence is not
 *   owning the colour.
 * - **The two channels separate.** Amber and cyan were replaced with lamplight
 *   and tidewater (D-043), and the pair has to keep the property the old one
 *   was chosen for: separation on the blue-yellow axis, which is what survives
 *   the two common colour deficiencies.
 *
 * A fourth property - that `style.css` restates every one of these values as a
 * custom property - is checked by `scripts/check-palette.mjs` on every build
 * rather than here. Reading a sibling file needs `node:fs`, the client's
 * tsconfig deliberately carries no Node types, and Vitest stubs CSS imports to
 * an empty string so `?raw` cannot see it either. That is the same arrangement
 * `check-bundle.mjs` is in, for the same reason.
 */

import { describe, expect, it } from "vitest";
import { CHANNEL, CHANNEL_MARKER, PALETTE, hex, mix, type RenderChannel } from "./palette.js";

/** How many colours the palette is locked at. */
const LOCKED = 20;

/** Split a packed colour into its three channels. */
function rgb(value: number): readonly [number, number, number] {
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * How blue-yellow a colour is, roughly.
 *
 * The b-axis of a Lab-like opponent space, without the ceremony: warm colours
 * score positive, cool ones negative. It is the axis protanopia and
 * deuteranopia both preserve, which is the whole reason the two channels are
 * placed on it.
 */
function warmth(value: number): number {
  const [r, g, b] = rgb(value);
  return (r + g) / 2 - b;
}

describe("the locked palette", () => {
  it("holds exactly the locked number of colours", () => {
    // Adding one is a decision-log entry, not a judgement call. The count went
    // from fourteen to twenty in D-043 because a lit surface interpolates
    // between its neighbours and four steps of grey band visibly across a wall;
    // the lock itself did not move.
    expect(Object.keys(PALETTE)).toHaveLength(LOCKED);
  });

  it("has no green in it, so success cannot be signalled with one", () => {
    for (const [name, value] of Object.entries(PALETTE)) {
      const [r, g, b] = rgb(value);
      const dominantlyGreen = g > r + 24 && g > b + 24;
      expect(dominantlyGreen, `${name} (${hex(value)}) is green`).toBe(false);
    }
  });

  it("keeps every colour a real six-digit value", () => {
    for (const [name, value] of Object.entries(PALETTE)) {
      expect(value, `${name} is out of range`).toBeGreaterThanOrEqual(0);
      expect(value, `${name} is out of range`).toBeLessThanOrEqual(0xffffff);
      expect(hex(value)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("has no two entries that are the same colour", () => {
    // Two names for one value is a palette that is smaller than it says it is,
    // and it hides the fact that one of the two is doing no work.
    const values = Object.values(PALETTE);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("the channel law", () => {
  it("gives each channel three distinct tones", () => {
    for (const channel of ["pilot", "keeper", "shared"] as RenderChannel[]) {
      const tones = CHANNEL[channel];
      expect(new Set([tones.deep, tones.key, tones.bright]).size, channel).toBeGreaterThan(1);
    }
  });

  it("puts PILOT warm and KEEPER cool, on the axis that survives colourblindness", () => {
    // Lamplight against tidewater. Protanopia and deuteranopia both preserve
    // blue-yellow separation, so a warm key against a cool one stays two
    // colours for the roughly one player in twelve who cannot rely on hue.
    expect(warmth(CHANNEL.pilot.key)).toBeGreaterThan(40);
    expect(warmth(CHANNEL.keeper.key)).toBeLessThan(-20);
    // Shared sits between them rather than beside either, which is the right
    // place for a fact both parties hold.
    const between = warmth(CHANNEL.shared.key);
    expect(between).toBeLessThan(warmth(CHANNEL.pilot.key));
    expect(between).toBeGreaterThan(warmth(CHANNEL.keeper.key));
  });

  /**
   * Dichromat simulation, Vienot, Brettel and Mollon (1999).
   *
   * sRGB into the LMS cone space, collapse the missing cone onto the other
   * two, and back. The classic formulation of this operates on the
   * gamma-encoded values, which is what the published matrices below are for.
   */
  const RGB_TO_LMS = [
    [17.8824, 43.5161, 4.11935],
    [3.45565, 27.1554, 3.86714],
    [0.0299566, 0.184309, 1.46709],
  ];
  const LMS_TO_RGB = [
    [0.080944, -0.130504, 0.116721],
    [-0.0102485, 0.0540194, -0.113615],
    [-0.000365294, -0.00412163, 0.693513],
  ];
  const DICHROMAT = {
    // No long-wavelength cone: the red end collapses.
    protanopia: [
      [0, 2.02344, -2.52581],
      [0, 1, 0],
      [0, 0, 1],
    ],
    // No medium-wavelength cone. The most common deficiency.
    deuteranopia: [
      [1, 0, 0],
      [0.494207, 0, 1.24827],
      [0, 0, 1],
    ],
    // No short-wavelength cone, which is the one that costs blue-yellow - the
    // exact axis this palette's two channels are separated on, and the reason
    // doc 08 phase 6 names it specifically rather than stopping at the two
    // common ones.
    tritanopia: [
      [1, 0, 0],
      [0, 1, 0],
      [-0.395913, 0.801109, 0],
    ],
  };

  function apply(matrix: number[][], v: number[]): number[] {
    return matrix.map((row) => row[0]! * v[0]! + row[1]! * v[1]! + row[2]! * v[2]!);
  }
  function channels(colour: number): number[] {
    return [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255];
  }
  function simulate(colour: number, kind: keyof typeof DICHROMAT): number[] {
    const lms = apply(RGB_TO_LMS, channels(colour));
    return apply(LMS_TO_RGB, apply(DICHROMAT[kind], lms)).map((v) => Math.max(0, Math.min(255, v)));
  }
  const apart = (a: number[], b: number[]): number =>
    Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

  it("keeps the two channels apart under all three dichromacies", () => {
    // Measured, not assumed. The tightest pair is the two bright tones under
    // protanopia at 59.3; tritanopia, which destroys the blue-yellow axis the
    // channels were chosen for, in fact separates them further (265.0 for the
    // key tones) because the collapse sends them in opposite directions.
    //
    // The floor sits well under every measured value and far above
    // indistinguishable, so this catches a palette change that quietly makes
    // one channel unreadable without failing on a small retune. Raising a
    // channel's contrast is allowed; converging the two is not.
    const FLOOR = 40;
    const pairs: readonly (readonly [string, number, number])[] = [
      ["key", PALETTE.lamp, PALETTE.tide],
      ["deep", PALETTE.lampDeep, PALETTE.tideDeep],
      ["bright", PALETTE.lampBright, PALETTE.tideBright],
    ];
    for (const kind of Object.keys(DICHROMAT) as (keyof typeof DICHROMAT)[]) {
      for (const [tone, warm, cool] of pairs) {
        const gap = apart(simulate(warm, kind), simulate(cool, kind));
        expect(gap, `${kind}: the ${tone} tones collapsed to ${gap.toFixed(1)}`).toBeGreaterThan(
          FLOOR,
        );
      }
    }
  });

  it("keeps each channel apart from the shared tone under all three", () => {
    // `shared` is pearl, and a fact both parties perceive must not be mistaken
    // for one only PILOT does. This is the pair a red-green test would never
    // have thought to check.
    for (const kind of Object.keys(DICHROMAT) as (keyof typeof DICHROMAT)[]) {
      expect(
        apart(simulate(PALETTE.lamp, kind), simulate(PALETTE.pearl, kind)),
        kind,
      ).toBeGreaterThan(40);
      expect(
        apart(simulate(PALETTE.tide, kind), simulate(PALETTE.pearl, kind)),
        kind,
      ).toBeGreaterThan(40);
    }
  });

  it("gives every channel a shape marker, because colour alone must not carry it", () => {
    const markers = Object.values(CHANNEL_MARKER);
    expect(markers).toHaveLength(3);
    expect(new Set(markers).size).toBe(3);
    for (const marker of markers) expect(marker.length).toBeGreaterThan(0);
  });
});

describe("mixing", () => {
  it("returns the ends unchanged and clamps beyond them", () => {
    expect(mix(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mix(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mix(0x000000, 0xffffff, -3)).toBe(0x000000);
    expect(mix(0x000000, 0xffffff, 9)).toBe(0xffffff);
  });

  it("mixes each channel independently", () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mix(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });
});
