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
import * as blindPanel from "@semaphore/worker/chambers/blind_panel";
import * as concordLock from "@semaphore/worker/chambers/concord_lock";
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

// ---------------------------------------------------------------------------
// CHAMBER II -- THE BLIND PANEL
// ---------------------------------------------------------------------------

const BLIND_PANEL: ChamberWorlds<blindPanel.BlindPanelState> = {
  id: "blind_panel",
  facts: blindPanel.facts,
  candidates: blindPanel.candidates,
  correctAction: blindPanel.correctAction,
};

describe("the possible-worlds proof: Chamber II", () => {
  it("holds both clauses at entry, for every seed", () => {
    // Unlike Chambers 0 and I, there is no natural "cooperative path" to walk
    // generically here: which rotations are informative depends on the
    // hidden wiring itself, and a rotation that saturates one seed's dial
    // might partially register on another's because of the cross-link
    // (module docstring). Entry is seed-independent and always fully
    // ambiguous, so it is asserted across the whole corpus; a worked example
    // of narrowing through play follows below for one specific seed.
    for (const seed of SEEDS) {
      const start = blindPanel.initial(blindPanel.generate(new Rng(seed)));
      expect(isUnderdetermined(BLIND_PANEL, start, "KEEPER")).toBe(true);
    }
  });

  it("always contains a witness whose wiring matches the true wiring", () => {
    for (const seed of SEEDS) {
      const start = blindPanel.initial(blindPanel.generate(new Rng(seed)));
      const worlds = consistentWorlds(BLIND_PANEL, start, "KEEPER");
      const truth = blindPanel.correctAction(start);
      expect(worlds.map((w) => blindPanel.correctAction(w))).toContain(truth);
    }
  });
});

describe("what the proof measures, in bits: Chamber II", () => {
  it("reports 384 consistent wirings and 8.58 bits at entry", () => {
    // 24 permutations times 16 inversion combinations, doc 02 section 3.2.
    for (const seed of SEEDS) {
      const start = blindPanel.initial(blindPanel.generate(new Rng(seed)));
      const { worlds, actions, bits } = measure(BLIND_PANEL, start, "KEEPER");
      expect(worlds).toBe(384);
      expect(actions).toBe(384);
      expect(bits).toBeCloseTo(8.58, 2);
    }
  });

  it("narrows by exactly half on a rotation that fully saturates a fresh dial", () => {
    // A worked example on one fixed seed, not a universal law: whether a
    // dial saturates cleanly to 0 or 8 clicks registered depends on the
    // cross-link possibly having nudged its gauge earlier (module
    // docstring), so this specific "rotate each dial cw x8 once" sequence
    // is verified for this seed rather than asserted for all twenty.
    // Querying each of the four dials in turn identifies that dial's
    // inversion bit exactly (registered 8 means not inverted, registered 0
    // means inverted, from a gauge starting at rest), halving the
    // consistent set every time: 384 -> 192 -> 96 -> 48 -> 24.
    const seed = "proof-seed-0";
    let state = blindPanel.initial(blindPanel.generate(new Rng(seed)));
    const expectedWorlds = [192, 96, 48, 24];
    for (const [i, dial] of blindPanel.DIALS.entries()) {
      state = blindPanel.rotate(state, dial, "clockwise", 8);
      const registered = blindPanel.lastRegisteredClicks(state);
      expect(registered === 0 || registered === 8).toBe(true);
      expect(measure(BLIND_PANEL, state, "KEEPER").worlds).toBe(expectedWorlds[i]);
    }
    // Down to 24: every inversion is now known; only the permutation is not.
    expect(measure(BLIND_PANEL, state, "KEEPER").bits).toBeCloseTo(Math.log2(24), 6);
  });

  it("does not move the bar on an uninformative repeat", () => {
    // Doc 02 section 5: "a pull that eliminates nothing must not move it."
    // Re-querying an already-saturated dial teaches nothing new.
    const seed = "proof-seed-0";
    let state = blindPanel.initial(blindPanel.generate(new Rng(seed)));
    for (const dial of blindPanel.DIALS) state = blindPanel.rotate(state, dial, "clockwise", 8);
    const before = measure(BLIND_PANEL, state, "KEEPER");

    state = blindPanel.rotate(state, 1, "clockwise", 8); // dial 1 is already saturated
    const registered = blindPanel.lastRegisteredClicks(state);
    const after = measure(BLIND_PANEL, state, "KEEPER");

    expect(registered).toBe(0); // no further clicks can register past the bound
    expect(after.worlds).toBe(before.worlds);
    expect(after.bits).toBeCloseTo(before.bits, 6);
  });

  it("never lets the consistent set grow as history accumulates", () => {
    // Structurally guaranteed by candidates() replaying the full history
    // under every hypothesis (D-012's fix, applied here from the start): a
    // longer history is a strictly harder match, so this holds for any
    // rotation sequence, not just a hand-picked one.
    const seed = "monotone-blind-panel";
    let state = blindPanel.initial(blindPanel.generate(new Rng(seed)));
    let lastBits = measure(BLIND_PANEL, state, "KEEPER").bits;
    const script: readonly [blindPanel.DialId, blindPanel.Direction, number][] = [
      [1, "clockwise", 3],
      [2, "counterclockwise", 5],
      [3, "clockwise", 8],
      [4, "counterclockwise", 2],
      [1, "clockwise", 4],
      [2, "clockwise", 1],
    ];
    for (const [dial, direction, clicks] of script) {
      state = blindPanel.rotate(state, dial, direction, clicks);
      const bits = measure(BLIND_PANEL, state, "KEEPER").bits;
      expect(bits).toBeLessThanOrEqual(lastBits);
      lastBits = bits;
    }
  });
});

describe("Chamber II: the channel contract", () => {
  it("never lets a gauge reading reach KEEPER's view", () => {
    for (const seed of SEEDS) {
      const start = blindPanel.initial(blindPanel.generate(new Rng(seed)));
      const view = projectForKeeper(blindPanel.facts(start));
      expect("gaugeValues" in view).toBe(false);
      expect("targets" in view).toBe(false);
    }
  });

  it("never lets the wiring reach either projection", () => {
    for (const seed of SEEDS) {
      const start = blindPanel.initial(blindPanel.generate(new Rng(seed)));
      const f = blindPanel.facts(start);
      for (const field of ["dialToGauge", "inversions", "crossLink"] as const) {
        expect(field in projectForKeeper(f)).toBe(false);
        expect(field in projectForPilot(f)).toBe(false);
      }
    }
  });

  it("renders lastClicks identically to both parties, and it is null before any rotation", () => {
    const seed = "audible-blind-panel";
    const start = blindPanel.initial(blindPanel.generate(new Rng(seed)));
    expect(projectForKeeper(blindPanel.facts(start)).lastClicks).toBeNull();

    const rotated = blindPanel.rotate(start, 1, "clockwise", 4);
    const f = blindPanel.facts(rotated);
    expect(projectForPilot(f).lastClicks).toBe(projectForKeeper(f).lastClicks);
  });

  it("gives KEEPER identical, uninformative feel for every dial", () => {
    // Mirrors chamber 0's lever-feel guard: if dial feel varied with the
    // wiring it would be a TACTILE back channel, defeating clause (a).
    const start = blindPanel.initial(blindPanel.generate(new Rng("dial-feel")));
    const feel = Object.values(projectForKeeper(blindPanel.facts(start)).dialFeel ?? {});
    expect(new Set(feel).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CHAMBER III -- THE CONCORD LOCK
// ---------------------------------------------------------------------------

const CONCORD_LOCK: ChamberWorlds<concordLock.ConcordLockState> = {
  id: "concord_lock",
  // Every time-dependent fact this chamber produces is SHARED, so it is
  // identical across candidates and cannot distinguish between them. A fixed
  // instant is therefore safe, and keeps the ChamberWorlds shape uniform.
  facts: (state) => concordLock.facts(state, 0),
  candidates: concordLock.candidates,
  correctAction: concordLock.correctAction,
};

function freshLock(seed: string): concordLock.ConcordLockState {
  const rng = new Rng(seed);
  const { params, cipherOffset } = concordLock.generate(rng);
  return concordLock.initial(params, cipherOffset, 20_000);
}

describe("the possible-worlds proof: Chamber III", () => {
  it("holds both clauses at entry, for every seed", () => {
    for (const seed of SEEDS) {
      expect(isUnderdetermined(CONCORD_LOCK, freshLock(seed), "KEEPER")).toBe(true);
    }
  });

  it("always contains the true passphrase in the consistent set", () => {
    for (const seed of SEEDS) {
      const state = freshLock(seed);
      const worlds = consistentWorlds(CONCORD_LOCK, state, "KEEPER");
      expect(worlds.map((w) => concordLock.correctAction(w))).toContain(
        concordLock.correctAction(state),
      );
    }
  });

  it("makes every candidate produce the identical ciphertext KEEPER can read", () => {
    // This is what makes the 26 genuinely indistinguishable: each candidate
    // pairs a different passphrase with a different offset such that the
    // observed ciphertext is unchanged.
    for (const seed of SEEDS) {
      const state = freshLock(seed);
      const observed = concordLock.ciphertext(state);
      for (const world of concordLock.candidates(state)) {
        expect(concordLock.ciphertext(world)).toBe(observed);
      }
    }
  });
});

describe("what the proof measures, in bits: Chamber III", () => {
  it("reports 26 consistent passphrases and 4.70 bits at entry", () => {
    for (const seed of SEEDS) {
      const { worlds, actions, bits } = measure(CONCORD_LOCK, freshLock(seed), "KEEPER");
      expect(worlds).toBe(26);
      expect(actions).toBe(26);
      expect(bits).toBeCloseTo(4.7, 2);
    }
  });

  it("eliminates exactly one candidate per rejected phrase", () => {
    const state = freshLock("elimination");
    const before = measure(CONCORD_LOCK, state, "KEEPER").worlds;
    // Reject some other offset's decryption: a legitimate guess, just wrong.
    const other = concordLock
      .candidates(state)
      .map((w) => w.params.passphrase)
      .find((p) => concordLock.normalise(p) !== concordLock.normalise(state.params.passphrase))!;
    const after = concordLock.speakPassphrase(state, other, 1000, new Rng("r"));
    expect(measure(CONCORD_LOCK, after, "KEEPER").worlds).toBe(before - 1);
  });

  it("does not eliminate anything for a phrase that was never a candidate", () => {
    const state = freshLock("no-elimination");
    const before = measure(CONCORD_LOCK, state, "KEEPER").worlds;
    const after = concordLock.speakPassphrase(state, "ZZZZ ZZZZ", 1000, new Rng("r"));
    expect(measure(CONCORD_LOCK, after, "KEEPER").worlds).toBe(before);
  });
});

describe("Chamber III: the asymmetry is real, not a language puzzle", () => {
  // The correctness fix recorded as D-014. Doc 02 section 3.4's own worked
  // example ("XLI XMHI XYVRW" -> "THE TIDE TURNS") would have made this
  // chamber solvable with no help from PILOT at all: exactly one of the 26
  // decryptions is English, so any agent picks it out instantly and the
  // published 4.70 bits would really be 0. These tests pin the fix.

  it("generates a passphrase with no English structure to latch onto", () => {
    // Uniform random letters: no vowel/consonant pattern, no dictionary
    // words, nothing that distinguishes the true plaintext from 25 shifts.
    for (const seed of SEEDS) {
      const passphrase = concordLock.normalise(freshLock(seed).params.passphrase);
      expect(passphrase).toMatch(/^[A-Z]+$/);
      expect(passphrase.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("leaves every decryption structurally indistinguishable from every other", () => {
    // The property that actually matters: no candidate is more "wordlike"
    // than the rest, because all 26 are drawn from the same uniform
    // alphabet. Asserted as a shape check, since "no offset is privileged"
    // is exactly what having no linguistic structure to score buys us.
    for (const seed of SEEDS) {
      const state = freshLock(seed);
      const shapes = new Set(
        concordLock.candidates(state).map((w) => concordLock.normalise(w.params.passphrase).length),
      );
      expect(shapes.size).toBe(1);
    }
  });

  it("keeps the cipher offset out of KEEPER's view entirely", () => {
    // The whole chamber turns on this one VISUAL fact having to cross the gap.
    for (const seed of SEEDS) {
      const f = concordLock.facts(freshLock(seed), 0);
      expect("cipherOffset" in projectForKeeper(f)).toBe(false);
      expect("cipherOffset" in projectForPilot(f)).toBe(true);
    }
  });

  it("keeps the ciphertext out of PILOT's view entirely", () => {
    for (const seed of SEEDS) {
      const f = concordLock.facts(freshLock(seed), 0);
      expect("ciphertext" in projectForPilot(f)).toBe(false);
      expect("ciphertext" in projectForKeeper(f)).toBe(true);
    }
  });

  it("keeps the passphrase out of both projections", () => {
    for (const seed of SEEDS) {
      const f = concordLock.facts(freshLock(seed), 0);
      expect("passphrase" in projectForKeeper(f)).toBe(false);
      expect("passphrase" in projectForPilot(f)).toBe(false);
    }
  });

  it("shows both parties the same stamina countdown, which is what they talk about", () => {
    const state = concordLock.grip(freshLock("stamina-shared"), 1000);
    const f = concordLock.facts(state, 6000);
    expect(projectForPilot(f).staminaRemainingMs).toBe(projectForKeeper(f).staminaRemainingMs);
    expect(projectForKeeper(f).staminaRemainingMs).toBe(15_000);
  });
});
