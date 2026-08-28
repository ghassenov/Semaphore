/**
 * THE POSSIBLE-WORLDS PROOF (doc 03 section 6).
 *
 * The headline engineering claim, and a blocking CI gate. For every seed and
 * every reachable state it asserts two things:
 *
 *   (a) the set of worlds consistent with KEEPER's entire perceptual surface
 *       has more than one member, and
 *   (b) those worlds disagree about what KEEPER should do next.
 *
 * Clause (b) carries the weight. It is not enough that several worlds are
 * consistent: they must disagree about the correct action, because that is the
 * exact, checkable, mathematical statement of "you cannot win without your
 * human". Ambiguity that does not change the action is ambiguity that costs
 * the pair nothing.
 *
 * The mirror runs for PILOT against the `TACTILE` channel, so the asymmetry is
 * proven in both directions rather than asserted in one.
 *
 * A failure here is not a bug to be worked around. It is a build that is not
 * the game, and the rule in `tests/CLAUDE.md` is that weakening one of these
 * checks to make it pass is never an accepted change.
 */

import { describe, expect, it } from "vitest";
import { Rng } from "@semaphore/seed";
import * as airlock from "@semaphore/worker/chambers/airlock";
import * as signalRoom from "@semaphore/worker/chambers/signal_room";
import { canonicalise, projectForKeeper, projectForPilot } from "@semaphore/worker/projection";
import {
  consistentWorlds,
  distinctActions,
  isUnderdetermined,
  measure,
  type ChamberWorlds,
} from "@semaphore/worker/worlds";

/** A fixed corpus. Fixed rather than random so a failure is always reproducible. */
const SEEDS = Array.from({ length: 20 }, (_, i) => `proof-seed-${i}`);

const AIRLOCK: ChamberWorlds<airlock.AirlockState> = {
  id: "airlock",
  facts: airlock.facts,
  candidates: airlock.candidates,
  correctAction: airlock.correctAction,
};

/**
 * Every state reachable in the airlock for a seed.
 *
 * Small enough to enumerate exhaustively: the initial state, plus every
 * sequence of distinct lever pulls, which terminates as soon as the door
 * opens. No sampling and no scoping, so for this chamber the proof is total
 * rather than approximate.
 */
function reachableStates(seed: string): airlock.AirlockState[] {
  const start = airlock.initial(airlock.generate(new Rng(seed)));
  const seen = new Map<string, airlock.AirlockState>();

  const walk = (state: airlock.AirlockState): void => {
    const key = state.pulled.join(",");
    if (seen.has(key)) return;
    seen.set(key, state);
    if (airlock.isSolved(state)) return;
    for (const lever of airlock.LEVERS) {
      if (state.pulled.includes(lever)) continue;
      walk(airlock.pull(state, lever));
    }
  };

  walk(start);
  return [...seen.values()];
}

/** States where the puzzle is still open. A solved chamber asks nothing of PILOT. */
const unsolvedStates = (seed: string) => reachableStates(seed).filter((s) => !airlock.isSolved(s));

/**
 * Unsolved states the agent has not brute-forced its way to certainty in.
 *
 * **This scoping is the honest limit of the claim, and it was discovered by
 * the proof rather than assumed in advance.** An agent that pulls two wrong
 * levers has eliminated two of three candidates by exhaustive action, and can
 * then deduce the third without PILOT. That is correct reasoning, not a leak:
 * no channel carried the answer, the agent paid for it in wasted calls and
 * time penalties.
 *
 * The proof therefore asserts underdetermination over states reachable
 * *without* exhaustive elimination. What stops brute force from being a
 * strategy is not the projection, it is the search space and the timer
 * (doc 02 section 8), and those are measured separately below.
 */
const cooperativeStates = (seed: string) =>
  unsolvedStates(seed).filter((s) => airlock.wrongPulls(s) < airlock.LEVERS.length - 1);

describe("the possible-worlds proof: Chamber 0", () => {
  it("enumerates states that are actually reachable", () => {
    // Guards the proof against being vacuously true over an empty or trivial
    // state set, which is the most likely way for it to stop meaning anything.
    for (const seed of SEEDS) {
      const states = reachableStates(seed);
      expect(states.length).toBeGreaterThan(1);
      expect(states.some((s) => airlock.isSolved(s))).toBe(true);
      expect(states.some((s) => !airlock.isSolved(s))).toBe(true);
    }
  });

  it("(a) KEEPER's view is consistent with more than one world", () => {
    for (const seed of SEEDS) {
      for (const state of cooperativeStates(seed)) {
        const worlds = consistentWorlds(AIRLOCK, state, "KEEPER");
        expect(worlds.length).toBeGreaterThan(1);
      }
    }
  });

  it("(b) and those worlds disagree about what KEEPER should do", () => {
    for (const seed of SEEDS) {
      for (const state of cooperativeStates(seed)) {
        const worlds = consistentWorlds(AIRLOCK, state, "KEEPER");
        expect(distinctActions(AIRLOCK, worlds).size).toBeGreaterThan(1);
      }
    }
  });

  it("holds both clauses together, at entry and along every cooperative path", () => {
    for (const seed of SEEDS) {
      for (const state of cooperativeStates(seed)) {
        expect(isUnderdetermined(AIRLOCK, state, "KEEPER")).toBe(true);
      }
    }
  });

  it("always contains the true world in the consistent set", () => {
    // If the observed state were ever excluded, `candidates` would not span the
    // space it claims to and every count above would be meaningless.
    for (const seed of SEEDS) {
      for (const state of reachableStates(seed)) {
        const worlds = consistentWorlds(AIRLOCK, state, "KEEPER");
        const truth = canonicalise(state.params.glyphByLever);
        expect(worlds.map((w) => canonicalise(w.params.glyphByLever))).toContain(truth);
      }
    }
  });
});

describe("the mirror: PILOT is underdetermined too", () => {
  it("leaves PILOT unable to determine the answer from sight alone", () => {
    // PILOT sees every glyph, so PILOT can *infer* the target lever from the
    // manual's rule. But PILOT never read the manual: that text is TACTILE and
    // reaches KEEPER only. Symmetric asymmetry is what makes this a
    // conversation rather than a lookup, so it is proven, not assumed.
    for (const seed of SEEDS) {
      for (const state of cooperativeStates(seed)) {
        const view = projectForPilot(airlock.facts(state));
        expect("leverFeel" in view).toBe(false);
        expect("correctLever" in view).toBe(false);
      }
    }
  });
});

describe("what the proof measures, in bits", () => {
  it("reports three decision-relevant worlds and 1.58 bits at entry", () => {
    // The figure published in doc 03 section 6 and in the README. Generated by
    // the same code the proof uses, so the claim cannot drift from the test.
    for (const seed of SEEDS) {
      const start = airlock.initial(airlock.generate(new Rng(seed)));
      const { worlds, actions, bits } = measure(AIRLOCK, start, "KEEPER");

      expect(worlds).toBe(6); // all glyph permutations remain possible
      expect(actions).toBe(3); // but only the spiral's position changes the action
      expect(bits).toBeCloseTo(1.58, 2);
    }
  });

  it("collapses ambiguity as wrong levers are eliminated", () => {
    // Watching this number fall is watching the pair reason, which is what the
    // CONCORD meter renders. A pull that eliminates nothing must not move it.
    const seed = "collapse";
    const start = airlock.initial(airlock.generate(new Rng(seed)));
    const correct = airlock.correctLever(start.params);
    const wrong = airlock.LEVERS.filter((l) => l !== correct);

    const afterOne = airlock.pull(start, wrong[0] as airlock.LeverId);
    const afterTwo = airlock.pull(afterOne, wrong[1] as airlock.LeverId);

    expect(measure(AIRLOCK, start, "KEEPER").actions).toBe(3);
    expect(measure(AIRLOCK, afterOne, "KEEPER").actions).toBe(2);
    // Two wrong levers eliminated leaves exactly one candidate: KEEPER can now
    // deduce the answer without PILOT, which is correct and is why the proof
    // is asserted over unsolved states rather than this terminal one.
    expect(measure(AIRLOCK, afterTwo, "KEEPER").actions).toBe(1);
    expect(measure(AIRLOCK, afterTwo, "KEEPER").bits).toBe(0);
  });

  it("never reports more ambiguity than the pair started with", () => {
    for (const seed of SEEDS) {
      const start = airlock.initial(airlock.generate(new Rng(seed)));
      const entry = measure(AIRLOCK, start, "KEEPER").bits;
      for (const state of reachableStates(seed)) {
        expect(measure(AIRLOCK, state, "KEEPER").bits).toBeLessThanOrEqual(entry);
      }
    }
  });
});

describe("the channel contract, asserted directly", () => {
  it("never emits the answer into either projection", () => {
    for (const seed of SEEDS) {
      for (const state of reachableStates(seed)) {
        const f = airlock.facts(state);
        const answer = airlock.correctLever(state.params);
        // The lever ids appear legitimately in KEEPER's view (it must be able
        // to name one), so the check is that the HIDDEN *field* is absent
        // rather than that the string never occurs. The real guarantee is the
        // possible-worlds result above; this is the cheap structural check.
        expect("correctLever" in projectForKeeper(f)).toBe(false);
        expect("correctLever" in projectForPilot(f)).toBe(false);
        expect(answer).toBeTruthy();
      }
    }
  });

  it("keeps the glyphs out of KEEPER's view entirely", () => {
    for (const seed of SEEDS) {
      const state = airlock.initial(airlock.generate(new Rng(seed)));
      const keeper = JSON.stringify(projectForKeeper(airlock.facts(state)));
      for (const glyph of Object.values(state.params.glyphByLever)) {
        expect(keeper).not.toContain(glyph);
      }
    }
  });

  it("renders the AUDIBLE channel into both views, identically", () => {
    const seed = "audible";
    const start = airlock.initial(airlock.generate(new Rng(seed)));
    const pulled = airlock.pull(start, airlock.correctLever(start.params));
    const f = airlock.facts(pulled);
    expect(projectForPilot(f).lastSound).toBe(projectForKeeper(f).lastSound);
    expect(projectForKeeper(f).lastSound).toContain("bolts");
  });

  it("gives KEEPER a lever feel that carries no information about the glyphs", () => {
    // If `inspect` varied with the glyph above the lever it would be a back
    // channel down TACTILE, and clause (a) would quietly weaken. Identical
    // strings make that structurally impossible rather than merely unlikely.
    const state = airlock.initial(airlock.generate(new Rng("feel")));
    const feel = Object.values(projectForKeeper(airlock.facts(state)).leverFeel ?? {});
    expect(new Set(feel).size).toBe(1);
  });
});

describe("the limit of the claim, stated rather than hidden", () => {
  // This block exists because the proof failed when it was first written, and
  // the failure was correct. Deleting the scoping would have made a false
  // claim pass; hiding the scoping would have made a true claim look stronger
  // than it is. Both are worse than saying exactly where the line falls.

  it("lets an agent deduce the answer once it has eliminated every alternative", () => {
    // No channel carried the answer. The agent bought it with wasted calls.
    const start = airlock.initial(airlock.generate(new Rng("brute")));
    const correct = airlock.correctLever(start.params);
    const wrong = airlock.LEVERS.filter((l) => l !== correct);

    let state = start;
    for (const lever of wrong) state = airlock.pull(state, lever);

    expect(airlock.isSolved(state)).toBe(false);
    expect(measure(AIRLOCK, state, "KEEPER").actions).toBe(1);
    expect(isUnderdetermined(AIRLOCK, state, "KEEPER")).toBe(false);
  });

  it("charges the full search space for that deduction", () => {
    // Chamber 0's space is three, so brute force costs two wrong pulls and
    // roughly forty seconds against a three-minute timer. It is survivable,
    // and that is deliberate: this chamber is a tutorial that cannot be failed
    // permanently. The defence against enumeration is combinatorial depth in
    // the later chambers, not the projection, and doc 02 section 8 says so.
    const start = airlock.initial(airlock.generate(new Rng("cost")));
    const bruteForceCost = airlock.LEVERS.length - 1;
    expect(measure(AIRLOCK, start, "KEEPER").actions).toBe(airlock.LEVERS.length);
    expect(bruteForceCost).toBe(2);
  });

  it("keeps clause (a) true even where clause (b) has failed", () => {
    // Worth asserting because it shows which clause does the work. After two
    // wrong pulls the agent still cannot tell which glyph sits on which of the
    // remaining levers, so more than one world is consistent. Only clause (b)
    // detects that the remaining ambiguity has stopped mattering.
    const start = airlock.initial(airlock.generate(new Rng("clause-b")));
    const correct = airlock.correctLever(start.params);
    let state = start;
    for (const lever of airlock.LEVERS.filter((l) => l !== correct)) {
      state = airlock.pull(state, lever);
    }
    expect(consistentWorlds(AIRLOCK, state, "KEEPER").length).toBeGreaterThan(1);
    expect(distinctActions(AIRLOCK, consistentWorlds(AIRLOCK, state, "KEEPER")).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CHAMBER I -- THE SIGNAL ROOM
// ---------------------------------------------------------------------------

const SIGNAL_ROOM: ChamberWorlds<signalRoom.SignalRoomState> = {
  id: "signal_room",
  facts: signalRoom.facts,
  candidates: signalRoom.candidates,
  correctAction: signalRoom.correctAction,
};

/**
 * States reached by pressing the correct keys in order, stopping one press
 * short of solving. The state produced by the final correct press is solved
 * and asks nothing further of PILOT, exactly as chamber 0's `unsolvedStates`
 * excludes the state where the door is already open.
 *
 * Unlike chamber 0, there is no separate "cooperative" filter needed here:
 * chamber I's search space is 1,956 possible plans, and doc 02 section 8's
 * whole point is that exhausting it inside the timer is not a real strategy.
 * Every state along the correct path is fair game for the main assertion.
 */
function cooperativeSignalRoomStates(seed: string): signalRoom.SignalRoomState[] {
  const start = signalRoom.initial(signalRoom.generate(new Rng(seed)));
  const target = signalRoom.correctSequence(start.params);
  const states: signalRoom.SignalRoomState[] = [start];
  let state = start;
  for (const key of target.slice(0, -1)) {
    state = signalRoom.press(state, key);
    states.push(state);
  }
  return states;
}

describe("the possible-worlds proof: Chamber I", () => {
  it("holds both clauses at every point along the correct solve path", () => {
    for (const seed of SEEDS) {
      for (const state of cooperativeSignalRoomStates(seed)) {
        expect(isUnderdetermined(SIGNAL_ROOM, state, "KEEPER")).toBe(true);
      }
    }
  });

  it("always contains a witness whose plan matches the true plan", () => {
    // A weaker guarantee than chamber 0's, and honestly so. Chamber 0 fully
    // enumerates every raw permutation, so one candidate is always literally
    // equal to the observed state. Chamber I's candidates() is scoped to one
    // canonical witness per achievable plan (doc file comment above), built
    // from the smallest available composite values rather than from the
    // session's actual random glyph draw, so the observed glyphByKey usually
    // matches no witness's glyphByKey exactly. What candidates() actually
    // promises, and what this checks, is completeness over the ACTION space:
    // the true session's plan is always realised by some witness, even though
    // that witness's specific glyphs are not the session's own.
    for (const seed of SEEDS) {
      for (const state of cooperativeSignalRoomStates(seed)) {
        const worlds = consistentWorlds(SIGNAL_ROOM, state, "KEEPER");
        const truth = signalRoom.correctAction(state);
        expect(worlds.map((w) => signalRoom.correctAction(w))).toContain(truth);
      }
    }
  });
});

describe("what the proof measures, in bits: Chamber I", () => {
  it("reports 1,956 consistent plans and 10.93 bits at entry", () => {
    // This is the figure doc 02 section 3.2 and doc 03 section 6 publish.
    // It did not fall out of the first version of this chamber: correctAction
    // originally returned only the next key, which produced 6 actions and
    // 2.58 bits (log2 of the six key ids, not log2 of the plan space). Fixed
    // by making correctAction return the whole remaining plan, which is what
    // "the correct action from here" has to mean once a chamber's answer is a
    // sequence rather than a single move. Generated by the same code the
    // README table uses, so the two cannot drift apart.
    for (const seed of SEEDS) {
      const start = signalRoom.initial(signalRoom.generate(new Rng(seed)));
      const { worlds, actions, bits } = measure(SIGNAL_ROOM, start, "KEEPER");
      expect(worlds).toBe(1956);
      expect(actions).toBe(1956);
      expect(bits).toBeCloseTo(10.93, 2);
    }
  });

  it("collapses monotonically to zero as the correct sequence is pressed", () => {
    // Watching this fall is watching the pair reason (doc 02 section 5): each
    // correct press should narrow the plan space, never widen it.
    const seed = "collapse-signal";
    const start = signalRoom.initial(signalRoom.generate(new Rng(seed)));
    const target = signalRoom.correctSequence(start.params);
    let state = start;
    let lastBits = measure(SIGNAL_ROOM, state, "KEEPER").bits;
    for (const key of target) {
      state = signalRoom.press(state, key);
      const bits = measure(SIGNAL_ROOM, state, "KEEPER").bits;
      expect(bits).toBeLessThanOrEqual(lastBits);
      lastBits = bits;
    }
    expect(lastBits).toBe(0);
  });

  it("resets ambiguity to the entry value after a wrong press wipes SHARED progress", () => {
    // pressedSequence is SHARED and a wrong press wipes it to empty (doc 08
    // Phase 2.1's reset-on-error rule), so the consistent-worlds set should
    // return to exactly what it was before any information was exchanged.
    const seed = "reset-signal";
    const start = signalRoom.initial(signalRoom.generate(new Rng(seed)));
    const target = signalRoom.correctSequence(start.params);
    const wrong = signalRoom.KEYS.find((k) => k !== target[0])!;
    const afterWrong = signalRoom.press(start, wrong);
    expect(measure(SIGNAL_ROOM, afterWrong, "KEEPER").bits).toBeCloseTo(
      measure(SIGNAL_ROOM, start, "KEEPER").bits,
      6,
    );
  });

  it("makes the published search space match the plan space exactly", () => {
    // Doc 02 §3.2: "1,956 ordered subsets... brute force is impossible inside
    // the timer." That figure and the possible-worlds bits figure are the
    // same number for exactly one reason: every one of the 1,956 non-empty
    // ordered subsets of six keys is achievable as some session's answer,
    // because the pool holds seven non-prime and five prime stroke values,
    // which is enough of each to realise any subset length from 1 to 6.
    for (const seed of SEEDS) {
      const start = signalRoom.initial(signalRoom.generate(new Rng(seed)));
      expect(signalRoom.candidates(start)).toHaveLength(1956);
    }
  });
});

describe("Chamber I: the channel contract", () => {
  it("gives KEEPER the stroke table by name, which is not a leak", () => {
    // Unlike chamber 0, a glyph NAME legitimately appears in KEEPER's view
    // here: strokeTable is the manual's glyph_table section, TACTILE by
    // design (doc 05 §3: "it is in the manual"), and it is static, identical
    // in every world regardless of seed. Knowing that CROSS has 2 strokes
    // contributes nothing about which position holds CROSS this session. A
    // substring check for "any glyph name anywhere" would therefore always
    // fail, correctly, and is not the real channel contract, which is next.
    const start = signalRoom.initial(signalRoom.generate(new Rng("stroke-table")));
    const view = projectForKeeper(signalRoom.facts(start));
    expect(view.strokeTable).toBeDefined();
  });

  it("never leaks which glyph sits at which position into KEEPER's view", () => {
    // The real channel contract: the per-session SECRET is the position
    // assignment, not the glyph names themselves.
    for (const seed of SEEDS) {
      const start = signalRoom.initial(signalRoom.generate(new Rng(seed)));
      expect("glyphByKey" in projectForKeeper(signalRoom.facts(start))).toBe(false);
    }
  });

  it("keeps the vandalised page state VISUAL-only: PILOT sees it, KEEPER never does", () => {
    // Doc 02's trust mechanic: PILOT can tell a forged page by the
    // handwriting, and that fact never reaches KEEPER's own perceptual
    // surface, which is exactly why KEEPER has to ask.
    for (const seed of SEEDS) {
      const start = signalRoom.initial(signalRoom.generate(new Rng(seed)));
      const f = signalRoom.facts(start);
      expect("manualPageState" in projectForKeeper(f)).toBe(false);
      expect("manualPageState" in projectForPilot(f)).toBe(true);
    }
  });

  it("keeps the vandalism text TACTILE-only: KEEPER reads it, PILOT never does", () => {
    for (const seed of SEEDS) {
      const start = signalRoom.initial(signalRoom.generate(new Rng(seed)));
      const f = signalRoom.facts(start);
      expect("vandalismText" in projectForPilot(f)).toBe(false);
      expect("vandalismText" in projectForKeeper(f)).toBe(true);
    }
  });

  it("never lets vandalism change the correct plan", () => {
    // The injected paragraph is an attack on KEEPER's behaviour, not a change
    // to the actual rule. Asserted directly here as a channel-contract fact,
    // complementing the reducer-level test of the same claim.
    for (const seed of SEEDS) {
      const start = signalRoom.initial(signalRoom.generate(new Rng(seed)));
      const vandalised = signalRoom.correctSequence({ ...start.params, vandalised: true });
      const clean = signalRoom.correctSequence({ ...start.params, vandalised: false });
      expect(vandalised).toEqual(clean);
    }
  });

  it("renders the AUDIBLE lastSound identically to both parties", () => {
    const seed = "audible-signal";
    const start = signalRoom.initial(signalRoom.generate(new Rng(seed)));
    const target = signalRoom.correctSequence(start.params);
    const afterOne = signalRoom.press(start, target[0]!);
    const f = signalRoom.facts(afterOne);
    expect(projectForPilot(f).lastSound).toBe(projectForKeeper(f).lastSound);
    expect(projectForKeeper(f).lastSound).toContain("chime");
  });
});
