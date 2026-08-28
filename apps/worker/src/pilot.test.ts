/**
 * What reaches a rendered frame, and what structurally cannot.
 *
 * `tests/possible-worlds.test.ts` proves the channel tags are right. This file
 * proves the socket's payload is built out of them: for every chamber, every
 * fact PILOT may perceive arrives, and every fact PILOT may not is absent -
 * checked against each chamber's own `facts()` rather than a hand-written
 * list, so a field added later is covered on the day it is added.
 *
 * The named assertions below it are the ones worth reading aloud. Each is one
 * chamber's information split, stated as a test: the answer travels by voice.
 */

import { describe, expect, it } from "vitest";
import { perceives, type Tagged } from "@semaphore/protocol";
import * as airlock from "./chambers/airlock.js";
import * as signalRoom from "./chambers/signal_room.js";
import * as blindPanel from "./chambers/blind_panel.js";
import * as concordLock from "./chambers/concord_lock.js";
import { newSession, reduce, settleSession, type PersistedSession } from "./reducer.js";
import { pilotView, stateSummary } from "./pilot.js";

const NOW = 1_000_000;

/** A full-mode session that has begun and entered the airlock. */
function begun(): PersistedSession {
  const s = reduce(
    newSession("s_pilot", "pilot-seed", NOW),
    { type: "begin_shift", designation: "KEEPER" },
    NOW,
  ).session;
  return reduce(s, { type: "start", difficulty: "standard", mode: "full" }, NOW).session;
}

/** Drive a session to the chamber named, solving each one on the way. */
function at(chamber: "signal_room" | "blind_panel" | "archive" | "concord_lock"): PersistedSession {
  let s = reduce(
    begun(),
    { type: "pull_lever", leverId: airlock.correctLever(begun().airlock!.params) },
    NOW,
  ).session;
  if (chamber === "signal_room") return s;

  for (const key of signalRoom.correctSequence(s.signalRoom!.params)) {
    s = reduce(s, { type: "press_key", keyId: key }, NOW).session;
  }
  if (chamber === "blind_panel") return s;

  const params = s.blindPanel!.params;
  for (const dial of blindPanel.DIALS) {
    const target = params.targets[params.dialToGauge[dial]];
    if (target === 0) continue;
    const direction = params.inversions[dial] !== target > 0 ? "clockwise" : "counterclockwise";
    s = reduce(
      s,
      { type: "rotate_dial", dialId: dial, direction, clicks: Math.abs(target) },
      NOW,
    ).session;
  }
  if (chamber === "archive") return s;

  s = reduce(s, { type: "read_station_log", entry: 1 }, NOW).session;
  return reduce(s, { type: "leave_archive" }, NOW).session;
}

/** Each chamber, paired with the raw tagged facts of the session that is in it. */
const CHAMBERS: readonly (readonly [string, PersistedSession, Record<string, Tagged<unknown>>])[] =
  (() => {
    const inAirlock = begun();
    const inSignal = at("signal_room");
    const inPanel = at("blind_panel");
    const inLock = at("concord_lock");
    return [
      ["airlock", inAirlock, airlock.facts(inAirlock.airlock!)],
      ["signal_room", inSignal, signalRoom.facts(inSignal.signalRoom!)],
      ["blind_panel", inPanel, blindPanel.facts(inPanel.blindPanel!)],
      ["concord_lock", inLock, concordLock.facts(inLock.concordLock!, NOW)],
    ] as const;
  })();

describe("pilotView carries exactly the PILOT channels", () => {
  for (const [name, session, facts] of CHAMBERS) {
    it(`${name}: every perceivable fact arrives and no other does`, () => {
      const { facts: projected } = pilotView(session, NOW);
      for (const [key, fact] of Object.entries(facts)) {
        expect(key in projected, `${key} (${fact.channel})`).toBe(perceives("PILOT", fact.channel));
      }
      // Nothing invented on the way out, either.
      expect(Object.keys(projected).sort()).toEqual(
        Object.keys(facts)
          .filter((key) => perceives("PILOT", facts[key]!.channel))
          .sort(),
      );
    });
  }
});

describe("the information split, chamber by chamber", () => {
  it("the airlock gives PILOT the glyphs and never the answer or the feel", () => {
    const { facts } = pilotView(begun(), NOW);
    expect(facts).toHaveProperty("glyphByLever");
    expect(facts).toHaveProperty("doorOpen");
    expect(facts).not.toHaveProperty("leverFeel");
    expect(facts).not.toHaveProperty("correctLever");
  });

  it("the signal room gives PILOT the glyphs and the page's condition, never the table", () => {
    const { facts } = pilotView(at("signal_room"), NOW);
    expect(facts).toHaveProperty("glyphByKey");
    expect(facts).toHaveProperty("manualPageState");
    expect(facts).not.toHaveProperty("strokeTable");
    expect(facts).not.toHaveProperty("vandalismText");
    expect(facts).not.toHaveProperty("correctSequence");
  });

  it("the blind panel gives PILOT the needles and the plate, never the wiring", () => {
    const { facts } = pilotView(at("blind_panel"), NOW);
    expect(facts).toHaveProperty("gaugeValues");
    expect(facts).toHaveProperty("targets");
    expect(facts).not.toHaveProperty("dialFeel");
    expect(facts).not.toHaveProperty("dialToGauge");
    expect(facts).not.toHaveProperty("inversions");
    expect(facts).not.toHaveProperty("crossLink");
  });

  it("the concord lock gives PILOT the wheel, never the ciphertext or the passphrase", () => {
    const { facts } = pilotView(at("concord_lock"), NOW);
    expect(facts).toHaveProperty("cipherOffset");
    expect(facts).not.toHaveProperty("ciphertext");
    expect(facts).not.toHaveProperty("passphrase");
  });

  it("gives both parties the click count, which is the one fact on both sides", () => {
    const session = at("blind_panel");
    const rotated = reduce(
      session,
      { type: "rotate_dial", dialId: 1, direction: "clockwise", clicks: 2 },
      NOW,
    ).session;
    expect(pilotView(rotated, NOW).facts).toHaveProperty("lastClicks");
  });
});

describe("the machine fields beside the facts", () => {
  it("is empty of facts in every phase with no room to draw", () => {
    expect(pilotView(newSession("s_empty", "empty-seed", NOW), NOW).facts).toEqual({});
    // The Archive still records `blind_panel` as the last chamber entered, so
    // this is the assertion that stops the socket drawing a room the pair
    // walked out of.
    expect(at("archive").machine.chamber).toBe("blind_panel");
    expect(pilotView(at("archive"), NOW).facts).toEqual({});
  });

  it("still draws the room after a deadlock, because only PILOT can reset it", () => {
    const session = begun();
    const dead = settleSession(session, session.chamberDeadlineMs! + 1).session;
    expect(dead.machine.phase).toBe("DEADLOCK");
    expect(pilotView(dead, NOW).facts).toHaveProperty("glyphByLever");
  });

  it("counts down rather than publishing a deadline the client could skew", () => {
    const session = begun();
    const deadline = session.chamberDeadlineMs!;
    expect(pilotView(session, deadline - 5_000).remainingMs).toBe(5_000);
    // Never negative: a client that renders a clock must never render a
    // negative one, and the server settles the deadlock separately.
    expect(pilotView(session, deadline + 60_000).remainingMs).toBe(0);
  });

  it("reports no clock at all when nothing is being timed", () => {
    expect(pilotView(newSession("s_untimed", "untimed-seed", NOW), NOW).remainingMs).toBeNull();
  });

  it("shares its machine fields with the tool responses, so the two cannot drift", () => {
    const session = begun();
    expect(pilotView(session, NOW)).toMatchObject(stateSummary(session, NOW));
  });
});
