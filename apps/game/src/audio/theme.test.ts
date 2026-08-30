/**
 * The theme's note content, which is the one thing about it a machine can
 * check.
 *
 * Everything else about how it sounds needs an ear, and nothing in this
 * pipeline has one: the screenshot tour runs in a headless browser with no
 * audio device. What a test *can* hold is that every pitch is in the mode the
 * theme is written in. A mistyped frequency is a wrong note, a wrong note is
 * the whole difference between mysterious and broken, and it would ship
 * silently past every other check in the repository.
 */

import { describe, expect, it } from "vitest";
import { THEME_CHORDS, THEME_PHRASES } from "./voices.js";

/**
 * A natural minor, as pitch classes in semitones above A.
 *
 * A(0) B(2) C(3) D(5) E(7) F(8) G(10). The melody deliberately omits B, but
 * the harmony uses it as the ninth of the A chord, so the scale is the right
 * boundary for both and the omission is checked separately.
 */
const A_NATURAL_MINOR = new Set([0, 2, 3, 5, 7, 8, 10]);

/** Semitones above A0 (27.5Hz), rounded. Equal temperament. */
function semitonesAboveA(hz: number): number {
  return Math.round(12 * Math.log2(hz / 27.5));
}

function pitchClass(hz: number): number {
  return ((semitonesAboveA(hz) % 12) + 12) % 12;
}

describe("the theme is in key", () => {
  it("names a real equal-tempered pitch, not a number near one", () => {
    // A frequency a few hertz out is in tune with nothing and beats against
    // the drone. This catches a typed digit, which is how it would happen.
    for (const hz of [...THEME_CHORDS.flat(), ...THEME_PHRASES.flat().map(([, note]) => note)]) {
      const exact = 27.5 * 2 ** (semitonesAboveA(hz) / 12);
      expect(Math.abs(hz - exact) / exact, `${String(hz)}Hz is between two notes`).toBeLessThan(
        0.004,
      );
    }
  });

  it("keeps every chord tone in A natural minor", () => {
    for (const chord of THEME_CHORDS) {
      for (const hz of chord) {
        expect(A_NATURAL_MINOR, `${String(hz)}Hz is outside the mode`).toContain(pitchClass(hz));
      }
    }
  });

  it("keeps every melody note in the mode, and leaves the second out", () => {
    // The gap is the point: A C D E F G is what stops a phrase sounding like a
    // tune with an answer. B belongs to the harmony as a ninth and nowhere in
    // the melody.
    for (const phrase of THEME_PHRASES) {
      for (const [, hz] of phrase) {
        expect(A_NATURAL_MINOR, `${String(hz)}Hz is outside the mode`).toContain(pitchClass(hz));
        expect(pitchClass(hz), `${String(hz)}Hz is the second, which is left out`).not.toBe(2);
      }
    }
  });

  it("never resolves: no chord in the cycle is a dominant", () => {
    // A progression sounds like it is going somewhere when it contains the
    // major third above the fifth degree - G sharp over an E chord, here. The
    // mode has no G sharp at all, so this holds by construction; it is
    // asserted because "mysterious" is exactly what stops holding the moment
    // somebody adds a leading note to make a chord sound nicer in isolation.
    for (const chord of THEME_CHORDS) {
      expect(chord.map(pitchClass), "a leading note crept in").not.toContain(11);
    }
  });

  it("puts no two phrase notes on the same step", () => {
    for (const phrase of THEME_PHRASES) {
      const steps = phrase.map(([step]) => step);
      expect(new Set(steps).size, "two notes land together").toBe(steps.length);
    }
  });
});
