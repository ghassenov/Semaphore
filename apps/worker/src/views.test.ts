/**
 * The read-only tools' one job: say enough to act on, and never say what the
 * projection forbids.
 *
 * Every test here is one of those two claims. The leak tests are the ones
 * that matter: `tests/possible-worlds.test.ts` proves the *channel tags* are
 * right, and these prove the prose built on top of them did not reach around
 * the tags with a template string.
 */

import { describe, expect, it } from "vitest";
import { GameError } from "@semaphore/protocol";
import * as airlock from "./chambers/airlock.js";
import * as signalRoom from "./chambers/signal_room.js";
import * as blindPanel from "./chambers/blind_panel.js";
import * as concordLock from "./chambers/concord_lock.js";
import { GLYPHS } from "./chambers/glyphs.js";
import { newSession, reduce, type PersistedSession } from "./reducer.js";
import { describeChamber, inspectObject, lockState, readCiphertext } from "./views.js";

const NOW = 1_000_000;

function begun(mode: "full" | "brief" = "full"): PersistedSession {
  const s = reduce(
    newSession("s_views", "views-seed", NOW),
    {
      type: "begin_shift",
      designation: "KEEPER",
    },
    NOW,
  ).session;
  return reduce(s, { type: "start", difficulty: "standard", mode }, NOW).session;
}

/** Drive a full-mode session to the chamber named, solving each one on the way. */
function at(chamber: "signal_room" | "blind_panel" | "archive" | "concord_lock"): PersistedSession {
  let s = begun();
  s = reduce(
    s,
    { type: "pull_lever", leverId: airlock.correctLever(s.airlock!.params) },
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

describe("describeChamber", () => {
  it("names the levers and their positions, and no glyph at all", () => {
    const s = begun();
    const text = describeChamber(s);
    expect(text).toContain("THE AIRLOCK");
    for (const lever of airlock.LEVERS) expect(text).toContain(lever);
    // The whole chamber, in one assertion: the answer travels by voice.
    for (const glyph of Object.values(GLYPHS)) {
      expect(text.toLowerCase()).not.toContain(glyph.canonicalName.toLowerCase());
    }
  });

  it("gives the Signal Room its ids and never a glyph", () => {
    const s = at("signal_room");
    const text = describeChamber(s);
    expect(text).toContain("THE SIGNAL ROOM");
    for (const glyph of Object.values(GLYPHS)) {
      expect(text.toLowerCase()).not.toContain(glyph.canonicalName.toLowerCase());
    }
  });

  it("gives the Blind Panel its dials and never a gauge reading or a mapping", () => {
    const s = at("blind_panel");
    const text = describeChamber(s);
    expect(text).toContain("THE BLIND PANEL");
    expect(text).toContain("dials");
    expect(text).not.toContain(JSON.stringify(s.blindPanel!.params.dialToGauge));
    expect(text).not.toContain(JSON.stringify(s.blindPanel!.params.targets));
  });

  it("gives the Concord Lock its bolts and never the offset or the passphrase", () => {
    const s = at("concord_lock");
    const text = describeChamber(s);
    expect(text).toContain("THE CONCORD LOCK");
    expect(text).not.toContain(s.concordLock!.params.passphrase);
  });

  it("answers every phase with a next action rather than an error", () => {
    // ENTRY, and the two phases with no chamber behind them. An agent that
    // has lost the thread needs somewhere to go, not a refusal.
    expect(describeChamber(newSession("s", "seed", NOW))).toContain("begin_shift");
    expect(describeChamber(at("archive"))).toContain("read_station_log");
  });
});

describe("inspectObject", () => {
  it("returns identical feel for every lever, so it carries no bits", () => {
    const s = begun();
    const feels = airlock.LEVERS.map((lever) => inspectObject(s, lever));
    // Positions differ, feel does not. Stripping the position leaves one string.
    const stripped = feels.map((text) => text.slice(text.indexOf("lever:")));
    expect(new Set(stripped).size).toBe(1);
  });

  it("accepts the ways an agent actually spells an id", () => {
    const s = at("blind_panel");
    expect(inspectObject(s, "dial_2")).toBe(inspectObject(s, "2"));
    expect(inspectObject(s, "dial_2")).toBe(inspectObject(s, "DIAL-2"));
  });

  it("answers an unknown id with the vocabulary that would have worked", () => {
    const s = begun();
    try {
      inspectObject(s, "lever_q");
      expect.unreachable("expected an E_INVALID_INPUT");
    } catch (err) {
      expect(GameError.is(err)).toBe(true);
      expect((err as GameError).code).toBe("E_INVALID_INPUT");
      expect((err as GameError).message).toContain("lever_a");
    }
  });

  it("never leaks the dial to gauge mapping through tactile detail", () => {
    const s = at("blind_panel");
    const feels = blindPanel.DIALS.map((d) => inspectObject(s, `dial_${String(d)}`));
    const stripped = feels.map((text) => text.slice(text.indexOf(":")));
    expect(new Set(stripped).size).toBe(1);
  });
});

describe("readCiphertext and lockState", () => {
  it("returns the enciphered plate and never the plaintext or the offset", () => {
    const s = at("concord_lock");
    const text = readCiphertext(s);
    expect(text).toContain(concordLock.ciphertext(s.concordLock!));
    expect(text).not.toContain(concordLock.normalise(s.concordLock!.params.passphrase));
    expect(text).not.toMatch(
      new RegExp(`offset[^a-z]*${String(s.concordLock!.cipherOffset)}`, "i"),
    );
  });

  it("reports armed, bolts and grip, and refuses outside the chamber", () => {
    const s = at("concord_lock");
    expect(lockState(s, NOW)).toContain("armed: false");
    const gripped = reduce(s, { type: "grip_bar" }, NOW).session;
    expect(lockState(gripped, NOW)).toContain("armed: true");
    expect(() => readCiphertext(begun())).toThrow(GameError);
    expect(() => lockState(begun(), NOW)).toThrow(GameError);
  });
});
