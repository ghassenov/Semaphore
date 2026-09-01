/**
 * The ablation driver: play one whole session in process, under a policy that
 * knows only what its condition allows it to know.
 *
 * There is no browser here, no HTTP and no model. `reduce()` is a pure
 * function of a session and an action (see `apps/worker/src/reducer.ts`), so a
 * session can be played by calling it in a loop against a virtual clock, which
 * is what makes an ablation over hundreds of runs cost seconds rather than
 * dollars.
 *
 * ## Why there is no language model in the agent-alone condition
 *
 * `bench/CLAUDE.md` requires the agent-alone condition to be *genuine*: full
 * tool access, briefed that there is no partner, and enough turns to exhaust
 * reasonable strategies. Sampling one model would satisfy the letter of that
 * and none of its intent, because whatever number came back would be a fact
 * about that model on that day, and a reader could always answer "a better
 * model would have done better."
 *
 * So the agent-alone condition here is not a model. It is the **upper bound
 * over every possible agent**: a player that, at every step, samples uniformly
 * from `consistentWorlds(chamber, state)` and acts as though the world it drew
 * were true. No agent can do better than that, because the worlds in that set
 * are by construction indistinguishable from inside KEEPER's projection: any
 * rule for preferring one over another is a rule keyed on information the
 * agent does not have. It also cannot do worse in the ways a real agent does,
 * since it never forgets, never misreads a tool description and never repeats
 * a call it has already learned from. The bar it clears is therefore a
 * ceiling, and the gap the chart shows is a lower bound on the real gap.
 *
 * That also makes this file the third consumer of `worlds.ts`, which is the
 * arrangement its own docstring names: the proof, the CONCORD meter, and the
 * benchmark, over one implementation.
 *
 * ## What the three conditions actually vary
 *
 * Exactly one thing: the hypothesis the executing policy acts on.
 *
 *   - `together`   - PILOT reads out the VISUAL facts, so the hypothesis is
 *                    the true world. This is the cooperative ceiling.
 *   - `agent-alone`- the hypothesis is drawn from the consistent set, freshly
 *                    at every step, so the agent exploits everything it can
 *                    perceive (`lastClicks` narrowing Chamber II, say) and
 *                    guesses over what is left.
 *   - `human-alone`- PILOT has hands and no tools. There is no hypothesis to
 *                    act on because there is no action to take: the whole
 *                    mechanism of every chamber is on KEEPER's side of the
 *                    grate. The driver plays this condition out rather than
 *                    asserting it, so the floor is measured too.
 *
 * The executor beneath them is the same code in all three cases.
 */

import {
  DIFFICULTIES,
  GameError,
  type ChamberId,
  type Difficulty,
  type SessionEvent,
  type SessionMode,
} from "@semaphore/protocol";
import { Rng } from "@semaphore/seed";
import { newSession, reduce, type Action, type PersistedSession } from "@semaphore/worker/reducer";
import { consistentWorlds } from "@semaphore/worker/worlds";
import * as airlock from "@semaphore/worker/chambers/airlock";
import * as signalRoom from "@semaphore/worker/chambers/signal_room";
import * as blindPanel from "@semaphore/worker/chambers/blind_panel";
import * as concordLock from "@semaphore/worker/chambers/concord_lock";
import { GHOST_LOG, keeperEntries } from "@semaphore/worker/archive/index";
import { bitsDelivered, PARTNERS, type Partner, type PartnerName } from "./partners.ts";

/** The three bars of the chart. */
export type Condition = "agent-alone" | "human-alone" | "together";

export const CONDITIONS: readonly Condition[] = ["agent-alone", "human-alone", "together"];

/**
 * Why a chamber ended the way it did.
 *
 * Reported per chamber rather than rolled into a single pass/fail, because
 * two of these reasons are not the same claim and collapsing them would
 * overstate the result. `deadlock` means the information was not there in
 * time, which is the thing being measured. `no_body` means the chamber
 * physically requires a second pair of hands (the Concord Lock's release bar
 * is PILOT's, and no tool of KEEPER's substitutes for it), which is a
 * different and weaker finding. The report prints them separately.
 */
export type ChamberOutcome = "solved" | "deadlock" | "no_body" | "no_tools" | "out_of_calls";

export interface ChamberResult {
  readonly chamber: ChamberId;
  readonly outcome: ChamberOutcome;
  /** Mutating calls spent in this chamber, successful or not. */
  readonly calls: number;
  /** Of those, the ones the server marked `wasted`: no new information. */
  readonly wasted: number;
  /** Whether the chamber deadlocked at least once before it ended this way. */
  readonly retried: boolean;
}

export interface Run {
  readonly seed: string;
  readonly condition: Condition;
  /**
   * Which scripted PILOT played, or null when there was nobody to play one.
   *
   * Only the cooperative condition has a partner: the other two are defined by
   * the absence of one, and giving them a name here would invite a reader to
   * compare a partner's column against a row that never consulted it.
   */
  readonly partner: PartnerName | null;
  readonly difficulty: Difficulty;
  readonly mode: SessionMode;
  readonly chambers: readonly ChamberResult[];
  readonly cleared: number;
  readonly calls: number;
  readonly wasted: number;
  /** How many times the agent acted on something the partner had said. */
  readonly descriptions: number;
  /**
   * Decision-relevant bits those descriptions delivered, summed.
   *
   * Negative contributions are kept (see `bitsDelivered`): a confident
   * mis-description leaves the agent worse informed than silence and the
   * arithmetic should say so.
   */
  readonly bits: number;
  /**
   * Whether this run's Signal Room carried the vandalised manual page.
   *
   * Seeded, so it is a property of the puzzle rather than of the partner, and
   * `null` when the run never reached that chamber. Doc 07 section 2.2's
   * injection-resistance metric is the ratio of the two groups.
   */
  readonly vandalised: boolean | null;
  /** Virtual milliseconds of station time the run consumed. */
  readonly elapsedMs: number;
  /** Whether the session reached ESCAPED, which needs every chamber and the door. */
  readonly escaped: boolean;
}

export interface RunOptions {
  readonly seed: string;
  readonly condition: Condition;
  readonly difficulty?: Difficulty;
  readonly mode?: SessionMode;
  /**
   * The scripted PILOT, for the cooperative condition. Ignored by the other
   * two, which have no partner to script.
   *
   * `oracle` is the default because it is what the ablation's `together` bar
   * means: the cooperative *ceiling*, with the partner held perfect so the only
   * thing the bar measures is the tool surface.
   */
  readonly partner?: PartnerName;
  /**
   * Virtual milliseconds between one response and the next call.
   *
   * This is the agent's rhythm, and the reducer derives Chamber III's stamina
   * window from it (D-010), so it is a parameter of the experiment rather than
   * a constant. The default is a placeholder: doc 11 sections 6 and 7 want a
   * measured latency distribution across three backends and are still empty,
   * so six seconds stands in as a mid-range tool-calling round trip. Anything
   * concluded from the absolute clearing *times* is provisional until that
   * measurement exists; the ordering of the three bars is not, because it does
   * not depend on the pacing.
   */
  readonly gapMs?: number;
  /**
   * Hard stop, so a condition that cannot make progress terminates.
   *
   * Generous on purpose: `bench/CLAUDE.md` requires "enough turns to exhaust
   * reasonable strategies", and a budget that bound before the chamber timer
   * did would be measuring the budget.
   */
  readonly maxCalls?: number;
}

const DEFAULT_GAP_MS = 6_000;
const DEFAULT_MAX_CALLS = 400;

/**
 * How many times a deadlocked chamber is retried before the run gives up.
 *
 * Doc 02 section 5 lets a pair retry indefinitely; a harness cannot, and one
 * retry is what an unaided player actually does before concluding the room is
 * impossible. It also keeps the human-alone condition honest: that condition
 * fails, retries, fails identically, and stops, which is the shape of the
 * finding rather than an assertion about it.
 */
const RETRIES_PER_CHAMBER = 1;

/** Play one session to its end and report what happened. */
export function runSession(options: RunOptions): Run {
  const {
    seed,
    condition,
    difficulty = "standard",
    mode = "full",
    gapMs = DEFAULT_GAP_MS,
    maxCalls = DEFAULT_MAX_CALLS,
  } = options;

  const partnerName = condition === "together" ? (options.partner ?? "oracle") : null;
  const partner = partnerName ? PARTNERS[partnerName] : null;
  // A partner who takes a while to answer moves the agent's rhythm, which is
  // the same axis `gapMs` is on. Chamber II's drift and Chamber III's stamina
  // window are both derived from that pace, so a slow partner is felt by the
  // game rather than merely reported by the harness.
  const rhythmMs = gapMs + (partner?.extraGapMs ?? 0);

  // A partner that degrades the description gets its own stream, so `vague`
  // and `wrong` face the same puzzles as `oracle` while making their own
  // independent mistakes on them. `oracle` and the two partnerless conditions
  // keep the unsuffixed key the ablation was published from, so adding this
  // axis does not silently move that chart's numbers.
  const rng = new Rng(
    partnerName && partnerName !== "oracle"
      ? `${seed}:${condition}:${partnerName}`
      : `${seed}:${condition}`,
  );
  const startedAtMs = 0;
  /*
   * The Blackout is off for every measured run, for the same reason doc 07
   * section 2.3 turns the CONCORD meter off here.
   *
   * The Standard suite measures what an agent can infer from its own
   * projection, holding the partner's information content fixed and varying its
   * quality. The Blackout does neither of those things: for three rotations in
   * the Blind Panel it moves the *hands* to the other party
   * (`apps/worker/src/blackout.ts`), which is not a partner quality this suite
   * has an axis for and would show up as a completion figure rather than as
   * what it is.
   *
   * It is switched off on the session rather than avoided by the policy, so
   * that this file's comment is the only place anyone has to look to know why
   * the published numbers do not include it.
   */
  let session: PersistedSession = {
    ...newSession(`bench_${condition}_${seed}`, seed, startedAtMs),
    blackout: false,
  };
  let now = startedAtMs;
  let calls = 0;
  let vandalised: boolean | null = null;

  /** What the partner delivered, accumulated across the whole run. */
  const heard = { descriptions: 0, bits: 0 };

  /**
   * Per-chamber tallies, keyed by chamber. A retry adds to the same entry
   * rather than starting a new one: the pair spent those calls on that room.
   */
  interface Tally {
    calls: number;
    wasted: number;
    outcome: ChamberOutcome;
    retried: boolean;
  }

  const tally = new Map<ChamberId, Tally>();
  const at = (chamber: ChamberId): Tally => {
    const found = tally.get(chamber) ?? {
      calls: 0,
      wasted: 0,
      outcome: "out_of_calls" as ChamberOutcome,
      retried: false,
    };
    tally.set(chamber, found);
    return found;
  };
  const note = (
    chamber: ChamberId,
    patch: Partial<{ calls: number; wasted: number }>,
    outcome?: ChamberOutcome,
  ) => {
    const entry = at(chamber);
    entry.calls += patch.calls ?? 0;
    entry.wasted += patch.wasted ?? 0;
    if (outcome) entry.outcome = outcome;
  };

  /** Advance the virtual clock and apply one action, absorbing a refusal. */
  const call = (action: Action): readonly SessionEvent[] => {
    now += rhythmMs;
    calls++;
    const chamber = session.machine.chamber;
    if (chamber) note(chamber, { calls: 1 });
    try {
      const result = reduce(session, action, now);
      session = result.session;
      if (chamber) {
        note(chamber, { wasted: result.events.filter((e) => "wasted" in e && e.wasted).length });
      }
      return result.events;
    } catch (error) {
      // A `GameError` is the game refusing an action: a bolt out of order, a
      // passphrase spoken while the lock is unarmed. It costs the caller a
      // call and the clock, which is exactly what it costs a real agent, and
      // it is not a harness failure. Anything else is a bug and is rethrown.
      if (!(error instanceof GameError)) throw error;
      if (chamber) note(chamber, { wasted: 1 });
      return [];
    }
  };

  session = reduce(session, { type: "begin_shift", designation: "KEEPER" }, now).session;
  session = reduce(session, { type: "start", difficulty, mode }, now).session;

  const retriesUsed = new Map<ChamberId, number>();

  /** Everything the acting policy is allowed to know, in one object. */
  const play: Play = { solo: condition === "agent-alone", partner, rng, heard };

  while (calls < maxCalls) {
    const { phase, chamber } = session.machine;

    // Recorded on first sight rather than at the end, because a retry
    // regenerates the room from a machine-dependent seed and can flip the flag
    // (see `CHAMBER_ENTRY` in the reducer). The condition being measured is the
    // page the agent actually met first.
    if (vandalised === null && session.signalRoom)
      vandalised = session.signalRoom.params.vandalised;

    if (phase === "ESCAPED") break;

    if (phase === "FINALE") {
      call({ type: "open_the_door" });
      continue;
    }

    if (phase === "ARCHIVE") {
      // The Archive is not a puzzle (doc 02 section 4): reading one entry is
      // required, and reading it is a KEEPER tool. It gates progress in every
      // condition that has an agent at all.
      if (condition === "human-alone") {
        session = { ...session, machine: { ...session.machine } };
        // No KEEPER, no `read_station_log`, and no PILOT action opens the
        // Archive's door. The beat is untimed, so nothing expires: the run
        // simply cannot continue, which is the finding.
        break;
      }
      const entries = keeperEntries(GHOST_LOG).length;
      call({ type: "read_station_log", entry: rng.int(Math.max(1, entries)) });
      call({ type: "leave_archive" });
      continue;
    }

    if (phase === "DEADLOCK") {
      if (!chamber) break;
      const used = retriesUsed.get(chamber) ?? 0;
      if (used >= RETRIES_PER_CHAMBER) {
        // A chamber that already recorded *why* it could not be played keeps
        // that reason. "Ran out of time" is true of every failure here and
        // says the least of any of them.
        const known = tally.get(chamber)?.outcome;
        note(chamber, {}, known === "no_tools" || known === "no_body" ? known : "deadlock");
        break;
      }
      retriesUsed.set(chamber, used + 1);
      at(chamber).retried = true;
      call({ type: "retry_chamber" });
      continue;
    }

    if (phase !== "IN_CHAMBER" || !chamber) break;

    const action = nextAction(session, chamber, play, now + rhythmMs, rhythmMs);
    if (action === "no_tools") {
      // PILOT alone. Nothing on this side of the grate advances the chamber,
      // so the only thing left to spend is the clock. Jump to the deadline
      // and let the reducer's own settle produce the DEADLOCK.
      note(chamber, {}, "no_tools");
      if (session.chamberDeadlineMs === null) break; // Practice: an untimed room never resolves
      now = session.chamberDeadlineMs;
      const settled = reduce(
        session,
        { type: "write_note", text: "no way in from here", author: "PILOT" },
        now,
      );
      session = settled.session;
      continue;
    }
    if (action === "no_body") {
      note(chamber, {}, "no_body");
      if (session.chamberDeadlineMs === null) break;
      now = session.chamberDeadlineMs;
      session = reduce(
        session,
        { type: "write_note", text: "nobody on the bar", author: "KEEPER" },
        now,
      ).session;
      continue;
    }

    const before = session.machine.chamber;
    call(action);
    // Solving a chamber does not always change `machine.chamber`: the Blind
    // Panel's solve moves the phase to ARCHIVE and leaves the chamber name in
    // place, which is what `machine.chamber` outliving the room means (D-025).
    // So the test is the phase leaving IN_CHAMBER for anything but a failure.
    if (before && (session.machine.chamber !== before || session.machine.phase !== "IN_CHAMBER")) {
      if (session.machine.phase !== "DEADLOCK" && session.machine.phase !== "PENALISED") {
        note(before, {}, "solved");
      }
    }
  }

  const played = [...tally.entries()].map(([chamber, entry]) => ({
    chamber,
    outcome: entry.outcome,
    calls: entry.calls,
    wasted: entry.wasted,
    retried: entry.retried,
  }));

  return {
    seed,
    condition,
    partner: partnerName,
    difficulty,
    mode,
    chambers: played,
    cleared: played.filter((c) => c.outcome === "solved").length,
    calls,
    wasted: played.reduce((sum, c) => sum + c.wasted, 0),
    descriptions: heard.descriptions,
    bits: heard.bits,
    vandalised,
    elapsedMs: now - startedAtMs,
    escaped: session.machine.phase === "ESCAPED",
  };
}

/**
 * The next action, or a reason there is none.
 *
 * `no_tools` and `no_body` are the two ways a condition runs out of moves
 * without running out of ideas, and they are distinct: the first is a party
 * with no tool surface at all, the second is a tool surface whose next step
 * needs a hand nobody is offering.
 */
function nextAction(
  session: PersistedSession,
  chamber: ChamberId,
  play: Play,
  atMs: number,
  gapMs: number,
): Action | "no_tools" | "no_body" {
  // No partner and not soloing means PILOT alone: hands, a room, and no tool
  // surface at all.
  if (!play.solo && !play.partner) return "no_tools";

  switch (chamber) {
    case "airlock":
      return airlockAction(session, play);
    case "signal_room":
      return signalRoomAction(session, play);
    case "blind_panel":
      return blindPanelAction(session, play, atMs, gapMs);
    case "concord_lock":
      return concordLockAction(session, play, atMs);
  }
}

/**
 * What the acting policy knows, which is the only thing the conditions vary.
 *
 * `solo` and `partner` are mutually exclusive by construction: an agent alone
 * has no one to consult, a pair has, and PILOT alone is neither.
 */
interface Play {
  readonly solo: boolean;
  readonly partner: Partner | null;
  readonly rng: Rng;
  /** Running totals of what the partner has said, folded into the `Run`. */
  readonly heard: { descriptions: number; bits: number };
}

/**
 * Draw a world to act on.
 *
 * With a partner, that is the truth: PILOT has read out the VISUAL facts and
 * KEEPER now knows which world it is in. Alone, it is a uniform draw from the
 * worlds KEEPER's own projection cannot tell apart, redrawn at every step so
 * that anything the agent *has* learned (the registered click counts in
 * Chamber II, the phrases already rejected in Chamber III) is fully exploited.
 */
function hypothesis<TState>(
  chamberWorlds: Parameters<typeof consistentWorlds<TState>>[0],
  state: TState,
  play: Play,
): TState {
  const worlds = consistentWorlds(chamberWorlds, state);
  if (!play.partner) return worlds[play.rng.int(worlds.length)] ?? state;

  // PILOT looks at the room and says something. What that sentence *is* never
  // enters this harness; what it did to the agent's belief is the whole of what
  // can be measured, and is what a partner returns.
  const left = play.partner.narrow(chamberWorlds, worlds, state, play.rng);
  play.heard.descriptions += 1;
  play.heard.bits += bitsDelivered(chamberWorlds, worlds, left, state);
  // A description that settles the room draws nothing, so a perfect partner
  // leaves the run's random stream exactly where the ablation published it.
  if (left.length === 1) return left[0] ?? state;
  return left[play.rng.int(left.length)] ?? state;
}

const AIRLOCK_WORLDS = {
  id: "airlock" as const,
  facts: airlock.facts,
  candidates: airlock.candidates,
  correctAction: airlock.correctAction,
};

const SIGNAL_ROOM_WORLDS = {
  id: "signal_room" as const,
  facts: signalRoom.facts,
  candidates: signalRoom.candidates,
  correctAction: signalRoom.correctAction,
};

const BLIND_PANEL_WORLDS = {
  id: "blind_panel" as const,
  facts: blindPanel.facts,
  candidates: blindPanel.candidates,
  correctAction: blindPanel.correctAction,
};

const CONCORD_LOCK_WORLDS = {
  id: "concord_lock" as const,
  facts: (state: concordLock.ConcordLockState) => concordLock.facts(state, 0),
  candidates: concordLock.candidates,
  correctAction: concordLock.correctAction,
};

function airlockAction(session: PersistedSession, play: Play): Action {
  const state = session.airlock!;
  const world = hypothesis(AIRLOCK_WORLDS, state, play);
  return { type: "pull_lever", leverId: airlock.correctLever(world.params) };
}

function signalRoomAction(session: PersistedSession, play: Play): Action {
  const state = session.signalRoom!;
  const world = hypothesis(SIGNAL_ROOM_WORLDS, state, play);
  const target = signalRoom.correctSequence(world.params);
  const next = target[state.pressedSequence.length];
  // A drawn world can assert the sequence is already complete, which the true
  // state contradicts. Nothing is learned by pressing under it, so reset and
  // draw again next step; that costs a call, exactly as it would an agent.
  if (next === undefined) return { type: "reset_sequence" };
  return { type: "press_key", keyId: next };
}

/**
 * The Blind Panel, which needs two pieces of care: one about honesty, one
 * about the clock.
 *
 * **Honesty.** `blind_panel.candidates` varies the wiring and the inversions
 * and holds the **targets** fixed, which its own docstring says and which is
 * right for the possible-worlds proof: the published 384 is 24 permutations
 * times 16 inversions, and the engraved plate is not part of it. But the plate
 * is a `VISUAL` fact, so an agent alone has never seen it, and handing the
 * drawn world the true targets would quietly give the solo condition the
 * information PILOT is supposed to be the only source of. So the solo
 * condition draws its targets too, uniformly over the nine readings of each
 * gauge. Without this the ablation would flatter the agent and understate its
 * own result.
 *
 * **The clock.** The win condition is all four needles on target *at the same
 * instant*, and every gauge falls one mark toward zero every twenty seconds.
 * Four rotations at any realistic agent pace take longer than that, so turning
 * each gauge to its plain target in turn never converges: the first one has
 * already fallen by the time the last one is set. What the chamber actually
 * asks for is that every rotation be aimed at where the needle has to be
 * *later*, so they land together. So each rotation over-shoots by exactly the
 * drift that will accrue between now and the end of the plan, and the whole
 * plan is recomputed from scratch on the next call, which is what keeps a
 * wrong belief costing one rotation rather than wedging the loop.
 */
function blindPanelAction(
  session: PersistedSession,
  play: Play,
  atMs: number,
  gapMs: number,
): Action {
  const state = session.blindPanel!;
  const world = hypothesis(BLIND_PANEL_WORLDS, state, play);
  // A partner reads the engraved plate out loud, and reads it correctly even
  // when it is `wrong` or `vague`: `candidates()` holds the targets fixed, so
  // the world set a partner degrades spans the wiring and the inversions and
  // not the plate. A partner that mis-read the plate is a mechanic this
  // harness does not model, and saying so is cheaper than a metric that
  // quietly means something narrower than its name.
  const targets = play.partner ? world.params.targets : guessTargets(play.rng);

  /** Marks of drift accrued by `t`, under this session's difficulty. */
  const driftBy = (t: number): number =>
    state.driftIntervalMs === null
      ? 0
      : Math.floor((t - state.enteredAtMs) / state.driftIntervalMs);

  // What the gauges will read when this rotation lands, if the drawn wiring is
  // the real one. That reading, not the last one observed, is what a rotation
  // has to be computed against: the needles keep falling while the agent
  // thinks.
  const believed = blindPanel.gaugeValues({ ...state, params: world.params, observedAtMs: atMs });

  /**
   * The order the dials are turned in, and the whole reason the chamber
   * closes.
   *
   * Two constraints pull against each other. The **highest target must be set
   * last**, because a needle can be aimed above where it has to end up but
   * never above the top of the scale: a gauge whose target is 8 has no room to
   * absorb any drift at all, so every mark of drift after it is set is a mark
   * it finishes short by. And the **cross-linked dial should be turned early**,
   * because its side effect knocks a second gauge off and that gauge's own
   * dial has to come after it.
   *
   * When they conflict - the cross-linked dial is also the one with the
   * highest target - the scale wins, because that constraint is absolute and
   * the other one is not: a rotation that lands after the gauge it disturbs
   * has already been set simply costs one more pass, and the plan is rebuilt
   * from scratch on every call anyway.
   */
  const byTarget = [...blindPanel.DIALS].sort(
    (a, b) =>
      (targets[world.params.dialToGauge[a]] ?? 0) - (targets[world.params.dialToGauge[b]] ?? 0),
  );
  const cross = world.params.crossLink.dialId;
  const order =
    byTarget[byTarget.length - 1] === cross
      ? byTarget
      : [cross, ...byTarget.filter((dial) => dial !== cross)];

  /**
   * Build the plan for a given assumed length, and report the length it
   * actually came out at.
   *
   * The two depend on each other: a dial's compensation depends on how many
   * rotations follow it, and whether a dial needs turning at all depends on
   * its compensation, since a needle already sitting where drift will carry it
   * to the finish is a needle nobody should touch. So this is iterated to a
   * fixed point below rather than solved directly. Without it the cross-linked
   * dial is re-picked forever: it is set to target-plus-drift, read back as
   * "not on target", and set again.
   */
  const planFor = (assumed: number) => {
    const last = atMs + Math.max(0, assumed - 1) * gapMs;
    const steps: { dial: blindPanel.DialId; gauge: blindPanel.GaugeId; error: number }[] = [];
    for (const dial of order) {
      const gauge = world.params.dialToGauge[dial];
      const at = atMs + steps.length * gapMs;
      const aim = Math.max(0, Math.min(8, (targets[gauge] ?? 0) + driftBy(last) - driftBy(at)));
      const error = aim - (believed[gauge] ?? 0);
      if (error !== 0) steps.push({ dial, gauge, error });
    }
    return steps;
  };

  let steps = planFor(blindPanel.DIALS.length);
  for (let pass = 0; pass < blindPanel.DIALS.length; pass++) {
    // One extra rotation is budgeted while the cross-linked dial is still to
    // be turned, for the gauge it is about to disturb.
    const assumed =
      steps.length + (steps.some((step) => step.dial === world.params.crossLink.dialId) ? 1 : 0);
    const next = planFor(Math.max(1, assumed));
    if (next.length === steps.length) break;
    steps = next;
  }

  const pick = steps[0];
  if (!pick) {
    // Every needle is where the plan wants it and the panel is still open, so
    // the hypothesis is wrong. One click produces a fresh registered-click
    // count, which is the only observation that narrows the world set.
    return {
      type: "rotate_dial",
      dialId: blindPanel.DIALS[play.rng.int(blindPanel.DIALS.length)]!,
      direction: "clockwise",
      clicks: 1,
    };
  }

  const wantsUp = pick.error > 0;
  const inverted = world.params.inversions[pick.dial];
  const direction: blindPanel.Direction = wantsUp === !inverted ? "clockwise" : "counterclockwise";
  return {
    type: "rotate_dial",
    dialId: pick.dial,
    direction,
    clicks: Math.min(8, Math.abs(pick.error)),
  };
}

/** A uniform guess at the engraved plate KEEPER has never seen. */
function guessTargets(rng: Rng): Record<blindPanel.GaugeId, number> {
  const targets = {} as Record<blindPanel.GaugeId, number>;
  for (const gauge of blindPanel.GAUGES) targets[gauge] = rng.int(9);
  return targets;
}

/**
 * The Concord Lock, where the ablation stops being purely informational.
 *
 * The bolts and the passphrase are KEEPER's; arming the lock is PILOT's hand
 * on the release bar and there is no tool for it. So an agent alone does not
 * fail this chamber for want of the cipher offset, it fails before it can try:
 * `no_body`. That is a real property of the design and a weaker claim than the
 * other three chambers make, so the report counts it in its own column rather
 * than letting it pad the deadlock total.
 */
function concordLockAction(
  session: PersistedSession,
  play: Play,
  nowMs: number,
): Action | "no_body" {
  const state = session.concordLock!;

  if (!concordLock.isArmed(state, nowMs)) {
    if (!play.partner) return "no_body";
    return { type: "grip_bar" };
  }

  const bolt = concordLock.nextBolt(state);
  if (bolt !== null) return { type: "align_bolt", boltId: bolt };

  const world = hypothesis(CONCORD_LOCK_WORLDS, state, play);
  return { type: "speak_passphrase", phrase: world.params.passphrase };
}

/** Difficulty settings the report prints beside its numbers, so a run is reproducible from the chart alone. */
export const settingsFor = (difficulty: Difficulty) => DIFFICULTIES[difficulty];
