/**
 * Chamber II, THE BLIND PANEL (doc 02 section 3.3).
 *
 * Four dials KEEPER can reach and nobody can see, behind a grate. Four gauges
 * PILOT can see and cannot reach, each with a target reading on an engraved
 * plate. The dial-to-gauge wiring is a random permutation with an
 * independent direction inversion per linkage, generated fresh every session
 * and written down nowhere: neither party starts knowing it. It can only be
 * discovered empirically, by KEEPER rotating and PILOT reporting what moved,
 * which is the clearest system-identification problem in the game and the
 * chamber that most convincingly proves the two participants need each
 * other.
 *
 * **Drift is not modelled here.** Doc 02's gauges drift toward zero at one
 * mark per twenty seconds, which needs a server-authoritative timer tick
 * (a Durable Object alarm) to mean anything. That lands with the timer work
 * tracked in NEXT-STEPS; the permutation-discovery mechanics below do not
 * depend on it and are complete without it.
 *
 * ## How the world space narrows, and why history has to be replayed
 *
 * `gaugeValues` are `VISUAL`: KEEPER cannot see them, and no tool ever
 * returns them. What KEEPER *can* perceive is `lastClicks`, the number of
 * clicks that actually **registered** on the most recent rotation, which is
 * less than the number commanded whenever the target gauge was already near
 * a bound (0 or 8) and the linkage's direction is enough to hit it. That
 * count depends on the hidden mapping, the hidden inversion, and the gauge's
 * accumulated history, so it is genuinely informative and is exactly the
 * `AUDIBLE` field doc 05 section 3 names for this chamber.
 *
 * Because a click-registration count depends on the **whole rotation history
 * so far**, not just the most recent call, `candidates()` cannot hold
 * `gaugeValues` fixed the way `signal_room.ts` first (incorrectly) held
 * `pressedSequence` fixed (D-012). Instead, `PersistedSession` carries the
 * full `history` of rotations, and every candidate **replays that same
 * history under its own hypothesis** for the mapping and inversions. Only a
 * candidate whose replay produces the identical sequence of registered-click
 * counts observed so far survives. That is what makes an "informative
 * rotation" (doc 02 section 5) actually narrow the world set the CONCORD
 * meter renders.
 *
 * The cross-link (the late complication) is **not** part of what KEEPER
 * must deduce, and is held fixed across every candidate rather than varied.
 * Doc 02 section 3.2's published figure, 24 permutations times 16 inversion
 * combinations equals 384, only multiplies those two factors; the cross-link
 * is discovered as a surprise during play, not solved for by elimination.
 */

import { audible, hidden, shared, tactile, visual, type Tagged } from "@semaphore/protocol";
import type { Rng } from "@semaphore/seed";

export type DialId = 1 | 2 | 3 | 4;
export type GaugeId = 1 | 2 | 3 | 4;
export type Direction = "clockwise" | "counterclockwise";

export const DIALS: readonly DialId[] = [1, 2, 3, 4] as const;
export const GAUGES: readonly GaugeId[] = [1, 2, 3, 4] as const;

/** Needle bounds. A gauge cannot be pushed past either end. */
const GAUGE_MIN = 0;
const GAUGE_MAX = 8;

/** How each dial feels underhand. Identical across dials, like Chamber 0's lever feel: uninformative by construction. */
const DIAL_FEEL: Readonly<Record<DialId, string>> = {
  1: "a knurled socket, turning with steady resistance",
  2: "a knurled socket, turning with steady resistance",
  3: "a knurled socket, turning with steady resistance",
  4: "a knurled socket, turning with steady resistance",
} as const;

/** The hidden wiring a session is generated into, plus the target plate PILOT reads. */
export interface BlindPanelParams {
  /** Which gauge each dial drives. A bijection, 24 possibilities. */
  readonly dialToGauge: Readonly<Record<DialId, GaugeId>>;
  /** Whether each linkage's direction of travel is inverted. 16 combinations. */
  readonly inversions: Readonly<Record<DialId, boolean>>;
  /**
   * The late complication: rotating `dialId` also moves `gaugeId` by one
   * mark in the opposite direction, on top of whatever `dialId` normally
   * does. `gaugeId` is never the gauge `dialId` already drives. Held fixed
   * across every candidate in `candidates()` (see the module docstring).
   */
  readonly crossLink: { readonly dialId: DialId; readonly gaugeId: GaugeId };
  /** The target reading for each gauge, VISUAL, on the engraved plate. */
  readonly targets: Readonly<Record<GaugeId, number>>;
}

/** One rotate_dial call, exactly as commanded. */
export interface RotationEvent {
  readonly dialId: DialId;
  readonly direction: Direction;
  readonly clicks: number;
}

/** Everything about this chamber that can change during play. */
export interface BlindPanelState {
  readonly params: BlindPanelParams;
  /** Every rotation commanded so far, in order. The state IS this history; everything else is derived. */
  readonly history: readonly RotationEvent[];
}

function opposite(direction: Direction): Direction {
  return direction === "clockwise" ? "counterclockwise" : "clockwise";
}

function clamp(value: number): number {
  return Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, value));
}

/** Fresh zeroed gauges: every needle starts at rest. */
function zeroGauges(): Record<GaugeId, number> {
  const values = {} as Record<GaugeId, number>;
  for (const gauge of GAUGES) values[gauge] = 0;
  return values;
}

/**
 * Replay a rotation history against one hypothesis for the hidden wiring.
 *
 * Returns the resulting gauge values and, for every event in order, how many
 * of its commanded clicks actually registered before the driven gauge (or,
 * via the cross-link, either gauge) would have gone out of bounds. This is
 * the one function both real play and the possible-worlds proof depend on:
 * real play calls it with the session's true `params`; the proof calls it
 * once per candidate wiring to see whether that candidate could have
 * produced the same observed click counts.
 */
function replay(
  params: BlindPanelParams,
  history: readonly RotationEvent[],
): { gaugeValues: Record<GaugeId, number>; registeredPerEvent: readonly number[] } {
  const gaugeValues = zeroGauges();
  const registeredPerEvent: number[] = [];

  for (const event of history) {
    const gauge = params.dialToGauge[event.dialId];
    const inverted = params.inversions[event.dialId];
    const effective = inverted ? opposite(event.direction) : event.direction;
    const step = effective === "clockwise" ? 1 : -1;
    const crosses = params.crossLink.dialId === event.dialId;

    let registered = 0;
    for (let i = 0; i < event.clicks; i++) {
      const next = gaugeValues[gauge] + step;
      if (next < GAUGE_MIN || next > GAUGE_MAX) break; // the linkage is at its bound; no more register
      gaugeValues[gauge] = next;
      registered++;
      if (crosses) {
        // The cross-link is a silent side effect on the second gauge: it
        // never affects how many clicks register on the primary one, and it
        // is never announced through any channel KEEPER can perceive.
        gaugeValues[params.crossLink.gaugeId] = clamp(gaugeValues[params.crossLink.gaugeId] - step);
      }
    }
    registeredPerEvent.push(registered);
  }

  return { gaugeValues, registeredPerEvent };
}

/** Draw a random wiring: a permutation, independent inversions, a cross-link, and targets. Seeded, replayable. */
export function generate(rng: Rng): BlindPanelParams {
  const gaugeOrder = rng.shuffle(GAUGES);
  const dialToGauge = {} as Record<DialId, GaugeId>;
  DIALS.forEach((dial, i) => {
    dialToGauge[dial] = gaugeOrder[i] as GaugeId;
  });

  const inversions = {} as Record<DialId, boolean>;
  for (const dial of DIALS) inversions[dial] = rng.next() < 0.5;

  const crossDial = DIALS[rng.int(DIALS.length)] as DialId;
  const ownGauge = dialToGauge[crossDial];
  const otherGauges = GAUGES.filter((g) => g !== ownGauge);
  const crossGauge = otherGauges[rng.int(otherGauges.length)] as GaugeId;

  const targets = {} as Record<GaugeId, number>;
  for (const gauge of GAUGES) targets[gauge] = rng.int(GAUGE_MAX + 1);

  return {
    dialToGauge,
    inversions,
    crossLink: { dialId: crossDial, gaugeId: crossGauge },
    targets,
  };
}

/** Fresh state for a generated configuration: no rotations yet, every gauge at rest. */
export function initial(params: BlindPanelParams): BlindPanelState {
  return { params, history: [] };
}

/** Current gauge readings, derived by replaying the whole history. */
export function gaugeValues(state: BlindPanelState): Readonly<Record<GaugeId, number>> {
  return replay(state.params, state.history).gaugeValues;
}

/** How many clicks registered on the most recent rotation, or null before any. */
export function lastRegisteredClicks(state: BlindPanelState): number | null {
  const { registeredPerEvent } = replay(state.params, state.history);
  return registeredPerEvent.at(-1) ?? null;
}

/** All four gauges reading their targets simultaneously. */
export function isSolved(state: BlindPanelState): boolean {
  const values = gaugeValues(state);
  return GAUGES.every((gauge) => values[gauge] === state.params.targets[gauge]);
}

/** Rotate a dial. Free: doc 02 section 3.3 has no per-action penalty here, exploration is the intended solution. */
export function rotate(
  state: BlindPanelState,
  dialId: DialId,
  direction: Direction,
  clicks: number,
): BlindPanelState {
  if (isSolved(state)) return state;
  return { ...state, history: [...state.history, { dialId, direction, clicks }] };
}

/**
 * The remaining plan: the hidden wiring itself, as one stable string, or
 * null once solved.
 *
 * Per D-011, this has to be the whole configuration KEEPER needs, not one
 * fact about it, or the possible-worlds bits figure would understate what
 * PILOT actually has to help supply. Once the wiring is known with certainty
 * (one candidate remains), turning the dials to the targets is mechanical,
 * not ambiguous, which is why this returns the wiring rather than "the next
 * click to make."
 */
export function correctAction(state: BlindPanelState): string | null {
  if (isSolved(state)) return null;
  const p = state.params;
  const mapping = DIALS.map((d) => `${d}>${p.dialToGauge[d]}${p.inversions[d] ? "i" : ""}`).join(
    ",",
  );
  return mapping;
}

/**
 * The chamber's facts, each tagged with who may perceive it. `lastClicks` is
 * the one field in both projections at once: PILOT hears it as a sound
 * correlated with sight, KEEPER perceives it directly as a registered click
 * count through the dial itself, and both readings are the same number.
 */
export function facts(state: BlindPanelState) {
  const { gaugeValues: values, registeredPerEvent } = replay(state.params, state.history);
  return {
    /** PILOT reads the needles. */
    gaugeValues: visual(values),
    /** PILOT reads the engraved plate. */
    targets: visual(state.params.targets),
    /** KEEPER feels the dials. Identical by construction: no mapping information here. */
    dialFeel: tactile(DIAL_FEEL),
    /** Both perceive the last rotation's registered click count, differently rendered. */
    lastClicks: audible(registeredPerEvent.at(-1) ?? null),
    /** Both know how many rotations have been attempted. */
    rotationCount: shared(state.history.length),
    /** Both see whether the panel is solved. */
    solved: shared(isSolved(state)),
    /** The wiring, perceivable by neither. */
    dialToGauge: hidden(state.params.dialToGauge),
    inversions: hidden(state.params.inversions),
    crossLink: hidden(state.params.crossLink),
  } satisfies Record<string, Tagged<unknown>>;
}

/**
 * Every wiring this chamber could have, holding the cross-link, the targets
 * and the rotation history fixed, and **replaying that history under each
 * candidate wiring** to check it could have produced what has actually been
 * observed so far (see the module docstring; this is the fix D-012 records
 * for Chamber I, applied here from the start rather than discovered again).
 *
 * All 24 permutations times 16 inversion combinations: 384 candidates,
 * matching doc 02 section 3.2's published figure exactly, because the
 * cross-link is deliberately not part of what this enumerates.
 */
export function candidates(state: BlindPanelState): BlindPanelState[] {
  const truth = replay(state.params, state.history).registeredPerEvent;
  const out: BlindPanelState[] = [];

  for (const permutation of everyPermutation(GAUGES)) {
    const dialToGauge = {} as Record<DialId, GaugeId>;
    DIALS.forEach((dial, i) => {
      dialToGauge[dial] = permutation[i] as GaugeId;
    });

    for (const inversionBits of everyBooleanCombination(DIALS.length)) {
      const inversions = {} as Record<DialId, boolean>;
      DIALS.forEach((dial, i) => {
        inversions[dial] = inversionBits[i] as boolean;
      });

      const candidateParams: BlindPanelParams = {
        dialToGauge,
        inversions,
        crossLink: state.params.crossLink,
        targets: state.params.targets,
      };
      const { registeredPerEvent } = replay(candidateParams, state.history);
      if (!arraysEqual(registeredPerEvent, truth)) continue;

      out.push({ params: candidateParams, history: state.history });
    }
  }

  return out;
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** Every permutation of a small array. */
function everyPermutation<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const head = items[i] as T;
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of everyPermutation(rest)) out.push([head, ...tail]);
  }
  return out;
}

/** Every combination of `n` independent booleans, as `2^n` arrays. */
function everyBooleanCombination(n: number): boolean[][] {
  const out: boolean[][] = [];
  for (let mask = 0; mask < 2 ** n; mask++) {
    const bits: boolean[] = [];
    for (let i = 0; i < n; i++) bits.push(((mask >> i) & 1) === 1);
    out.push(bits);
  }
  return out;
}
