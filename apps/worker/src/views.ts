/**
 * Every read-only projection a KEEPER tool returns (doc 03 section 3.2).
 *
 * `describe_chamber`, `inspect`, `read_ciphertext` and `get_lock_state` are
 * the tools that only look. They are gathered here, apart from `reducer.ts`,
 * because they share one property that the mutating actions do not: they
 * derive **exclusively** from `projectForKeeper`, they append no event, and
 * they change no state. Keeping them in one module makes that property
 * checkable by reading a single file rather than by auditing a large switch.
 *
 * The repo-wide design law applies with no exceptions here: nothing in this
 * module may read a chamber's raw state directly. Every string it returns is
 * built from the keeper projection of that chamber's `facts()`, so a fact
 * tagged `VISUAL` or `HIDDEN` is structurally unable to reach an agent even
 * if someone later writes a careless template string.
 *
 * These calls are deliberately not logged. Doc 05 section 7's `tool_call`
 * event exists to make the wasted-call metric computable, and a read can
 * never be wasted in that sense: it always tells the agent something it did
 * not know. Logging them would also mean a storage write on every look, which
 * is a real cost for a benchmark that does not exist yet (decision log
 * D-019).
 */

import { GameError, errors, type ChamberId } from "@semaphore/protocol";
import * as airlock from "./chambers/airlock.js";
import * as signalRoom from "./chambers/signal_room.js";
import * as blindPanel from "./chambers/blind_panel.js";
import * as concordLock from "./chambers/concord_lock.js";
import { projectForKeeper } from "./projection.js";
import type { PersistedSession } from "./reducer.js";

/**
 * A description of the active chamber, built from `projectForKeeper` rather
 * than hand-written prose, so it cannot say more than the projection allows.
 *
 * Each chamber's text names what KEEPER can reach and how to address it,
 * because the agent's next call has to be spelled with those identifiers.
 * None of them names a glyph, a needle, or an offset: doc 02's information
 * split for every chamber puts all of that on `VISUAL`, which is to say on
 * PILOT, which is to say on the conversation.
 */
export function describeChamber(session: PersistedSession): string {
  // The phases with no chamber behind them answer first. Each returns text
  // naming the next thing the agent can actually do, because an agent that
  // has lost the thread needs a next action rather than a diagnosis - the
  // same rule `E_STALE_TOOL`'s message follows.
  switch (session.machine.phase) {
    case "ENTRY":
    case "LOBBY":
      return "You are at the station door. Your shift has not started. Call begin_shift.";
    case "TRANSITIONING":
      return "A door is closing behind you and another is opening. Call get_status in a moment.";
    case "DEADLOCK":
      return [
        "The chamber has deadlocked. Nothing you call will move it now.",
        "PILOT can reset it from the gallery, and only PILOT can. Say so.",
      ].join(" ");
    case "FINALE":
      return [
        "THE OUTER DOOR. The Concord Lock is open and the last of the water is running out.",
        "One thing left: open_the_door. Do it together.",
      ].join(" ");
    case "ESCAPED":
      return "The shift is over. You are both outside. There is nothing left to reach.";
    case "ARCHIVE":
      return [
        "THE ARCHIVE. Not a chamber: a records room between the Blind Panel and the door.",
        "A rack of tape spools, and a monitor PILOT is watching. You cannot see it.",
        "read_station_log({ entry }) reads what the previous KEEPER called, one entry at a time.",
        "leave_archive when you are both done. PILOT decides when that is.",
      ].join(" ");
    case "IN_CHAMBER":
      break;
  }

  if (session.machine.chamber === "airlock" && session.airlock) {
    const view = projectForKeeper(airlock.facts(session.airlock));
    return [
      "THE AIRLOCK. A cramped chamber, ankle-deep in cold water.",
      `Three levers on the far wall: ${describePositions(view.leverPositions)}.`,
      `Pulled so far: ${listOrNone(view.pulled)}.`,
      "You cannot see what is lit above them. PILOT can. Ask.",
    ].join(" ");
  }

  if (session.machine.chamber === "signal_room" && session.signalRoom) {
    const view = projectForKeeper(signalRoom.facts(session.signalRoom));
    return [
      "THE SIGNAL ROOM. A tall circular chamber, a beacon turning at its centre.",
      "A ring of six positions, numbered 1 to 6 clockwise from the top, and a bank of",
      "six brass keys beneath them with the same ids.",
      `Accepted so far: ${listOrNone(view.pressedSequence)}. Strikes: ${String(view.strikes)}.`,
      "A glyph is lit above each position. You cannot see any of them. PILOT can.",
    ].join(" ");
  }

  if (session.machine.chamber === "blind_panel" && session.blindPanel) {
    const view = projectForKeeper(blindPanel.facts(session.blindPanel));
    return [
      "THE BLIND PANEL. Four dials, ids 1 to 4, behind a rusted grate at floor level.",
      "Above the grate, out of your reach, four pressure gauges and an engraved target",
      "plate. You cannot see either. Which dial drives which gauge is recorded nowhere.",
      `Rotations so far: ${String(view.rotationCount)}.`,
      `Clicks that registered on the last rotation: ${view.lastClicks ?? "none yet"}.`,
      "PILOT hears your clicks through the grate and watches the needles. Ask what moved.",
    ].join(" ");
  }

  if (session.machine.chamber === "concord_lock" && session.concordLock) {
    const view = projectForKeeper(concordLock.facts(session.concordLock, Date.now()));
    return [
      "THE CONCORD LOCK. A great circular door, an array of bolts, ids 1 to 3.",
      "Beside it a release bar only PILOT can grip, and a cipher wheel only PILOT can read.",
      `Bolts aligned: ${String(view.boltsAligned)} of ${String(concordLock.BOLT_COUNT)}.`,
      `The lock is ${view.armed ? "armed" : "not armed"}.`,
      "read_ciphertext gives you the enciphered passphrase. The offset is on the wheel.",
    ].join(" ");
  }

  // `IN_CHAMBER` with no generated state for that chamber. Unreachable while
  // every chamber in `MODE_CHAMBERS` has a `CHAMBER_ENTRY` generator, kept as
  // a backstop so a half-wired fifth chamber fails loudly rather than
  // silently describing the wrong room.
  throw errors.staleTool();
}

/**
 * Tactile and audible detail on one object KEEPER can reach.
 *
 * Doc 02 section 3.3 is explicit about what this tool is for and what it must
 * never become: *"genuinely useful, and never the mapping."* The feel strings
 * it returns are identical across every object of a kind by construction (see
 * `LEVER_FEEL` and `DIAL_FEEL`), so this tool carries exactly zero bits about
 * any chamber's secret. That is enforced in the chamber modules and proved by
 * `tests/possible-worlds.test.ts`; this function only projects.
 *
 * An unknown id is an `E_INVALID_INPUT` that lists what is actually reachable,
 * because an agent that guessed a name needs the real vocabulary, not a no.
 */
export function inspectObject(session: PersistedSession, objectId: string): string {
  const id = objectId.trim().toLowerCase();

  if (session.machine.chamber === "airlock" && session.airlock) {
    const view = projectForKeeper(airlock.facts(session.airlock));
    const feel = view.leverFeel?.[id as airlock.LeverId];
    const position = view.leverPositions?.[id as airlock.LeverId];
    if (!feel || !position) throw unknownObject(id, airlock.LEVERS);
    const pulled = view.pulled?.includes(id as airlock.LeverId)
      ? "already pulled"
      : "not yet pulled";
    return `${id}, the ${position} lever: ${feel}. It is ${pulled}. Nothing about it tells you what is lit above it.`;
  }

  if (session.machine.chamber === "signal_room" && session.signalRoom) {
    const view = projectForKeeper(signalRoom.facts(session.signalRoom));
    const key = keyIdFrom(id);
    if (key === null)
      throw unknownObject(
        id,
        signalRoom.KEYS.map((k) => `key_${String(k)}`),
      );
    const pressed = view.pressedSequence?.includes(key) ? "It has been accepted already." : "";
    return `key_${String(key)}: cold brass, a short travel and a definite stop. Every key in the bank feels the same. ${pressed}`.trim();
  }

  if (session.machine.chamber === "blind_panel" && session.blindPanel) {
    const view = projectForKeeper(blindPanel.facts(session.blindPanel));
    const dial = dialIdFrom(id);
    if (dial === null)
      throw unknownObject(
        id,
        blindPanel.DIALS.map((d) => `dial_${String(d)}`),
      );
    const feel = view.dialFeel?.[dial];
    return `dial_${String(dial)}: ${feel}. Which gauge it drives is not something you can feel, and it is written down nowhere.`;
  }

  if (session.machine.chamber === "concord_lock" && session.concordLock) {
    const view = projectForKeeper(concordLock.facts(session.concordLock, Date.now()));
    const bolt = boltIdFrom(id);
    if (bolt === null)
      throw unknownObject(
        id,
        concordLock.BOLTS.map((b) => `bolt_${String(b)}`),
      );
    const seated = bolt <= (view.boltsAligned ?? 0) ? "seated" : "still standing proud";
    return `bolt_${String(bolt)}: heavy steel, greased, ${seated}. The array only moves while PILOT holds the release bar.`;
  }

  // Every phase that has no reachable mechanism at all: the lobby, the
  // Archive, the transitions, the finale, the end. Re-orients rather than
  // refuses, so an agent that inspected out of habit learns where it is.
  throw errors.unreachable(
    "anything to inspect",
    "you are not in a chamber right now; call describe_chamber to see where you are",
  );
}

/**
 * Chamber III's `read_ciphertext`. `TACTILE`: KEEPER reads the enciphered
 * passphrase off the plate by touch. The offset that decodes it is on the
 * cipher wheel, which is `VISUAL`, which is PILOT's half of the finale.
 */
export function readCiphertext(session: PersistedSession): string {
  if (session.machine.chamber !== "concord_lock" || !session.concordLock) throw errors.staleTool();
  const view = projectForKeeper(concordLock.facts(session.concordLock, Date.now()));
  return [
    "The passphrase plate, read by touch:",
    "",
    `    ${view.ciphertext ?? ""}`,
    "",
    "It is enciphered by a fixed letter offset. The cipher wheel beside the door shows",
    "that offset, and only PILOT standing at it with the lamp raised can read it.",
  ].join("\n");
}

/**
 * Chamber III's `get_lock_state`, the tool a careful agent calls before it
 * speaks. Doc 02 section 3.4: the ordering is deliberately not enforced in
 * code, so this exists to make caution *possible*, not compulsory.
 */
export function lockState(session: PersistedSession, nowMs: number): string {
  if (session.machine.chamber !== "concord_lock" || !session.concordLock) throw errors.staleTool();
  const view = projectForKeeper(concordLock.facts(session.concordLock, nowMs));
  const stamina = view.staminaRemainingMs;
  const sealedUntil = view.lockedOutUntilMs ?? null;
  const sealedFor = sealedUntil === null ? 0 : Math.max(0, sealedUntil - nowMs);

  return [
    `armed: ${String(view.armed)}`,
    `bolts aligned: ${String(view.boltsAligned)} of ${String(concordLock.BOLT_COUNT)}`,
    `grip remaining: ${stamina === null || stamina === undefined ? "not gripped" : `${seconds(stamina)}s of ${seconds(view.staminaWindowMs ?? 0)}s`}`,
    `door sealed: ${sealedFor > 0 ? `yes, for ${seconds(sealedFor)}s more` : "no"}`,
    `phrases already tried and rejected: ${listOrNone(view.attemptedPhrases)}`,
  ].join("\n");
}

/** Every chamber id whose read tools are live, for the router's own checks. */
export function hasChamberState(session: PersistedSession, chamber: ChamberId): boolean {
  switch (chamber) {
    case "airlock":
      return session.airlock !== null;
    case "signal_room":
      return session.signalRoom !== null;
    case "blind_panel":
      return session.blindPanel !== null;
    case "concord_lock":
      return session.concordLock !== null;
  }
}

/** `lever_a (left), lever_b (centre), ...` from the projected position map. */
function describePositions(positions: Readonly<Record<string, string>> | undefined): string {
  if (!positions) return "none";
  return Object.entries(positions)
    .map(([id, where]) => `${id} (${where})`)
    .join(", ");
}

/**
 * The shared notepad, as `read_note` returns it.
 *
 * The one view in this file that needs no projection. Every other function
 * here derives from `projectForKeeper` because it is reading world state that
 * carries channels; a note carries none, because it was written by one of the
 * two parties for the other to read. There is nothing to strip and nothing an
 * agent could learn here that PILOT did not choose to tell it.
 *
 * Authorship is on every line, from `SubmitEvent.agentInvoked` at the point of
 * writing. An agent re-reading the pad after a long session needs to know
 * which lines are its own conclusions and which are its partner's
 * observations, because those two have very different standing: one it can
 * re-derive and one it cannot.
 */
export function readNotes(session: PersistedSession): string {
  if (session.notes.length === 0) {
    return (
      "The notepad is blank. Write to it with write_note - it is the one surface " +
      "you and PILOT both write to, and either of you can read every line."
    );
  }
  const lines = session.notes.map(
    (note) => `[${String(Math.round(note.atMs / 1000))}s] ${note.author}: ${note.text}`,
  );
  return [`The notepad, oldest first (${String(lines.length)} lines):`, ...lines].join("\n");
}

/** A comma list, or the word an agent can act on when there is nothing yet. */
function listOrNone(items: readonly unknown[] | undefined): string {
  return items && items.length > 0 ? items.map(String).join(", ") : "nothing yet";
}

/** Whole seconds, rounded up, so "0s remaining" never appears while time is left. */
function seconds(ms: number): number {
  return Math.ceil(ms / 1000);
}

/** An unknown object id, answered with the vocabulary that would have worked. */
function unknownObject(id: string, known: readonly (string | number)[]): GameError {
  return errors.invalidInput("object_id", `one of ${known.map(String).join(", ")}`, id);
}

/** `key_3`, `key3` and `3` all name the same key. Agents spell it every way. */
function keyIdFrom(id: string): signalRoom.KeyId | null {
  const n = Number(id.replace(/^key[_-]?/, ""));
  return (signalRoom.KEYS as readonly number[]).includes(n) ? (n as signalRoom.KeyId) : null;
}

function dialIdFrom(id: string): blindPanel.DialId | null {
  const n = Number(id.replace(/^dial[_-]?/, ""));
  return (blindPanel.DIALS as readonly number[]).includes(n) ? (n as blindPanel.DialId) : null;
}

function boltIdFrom(id: string): concordLock.BoltId | null {
  const n = Number(id.replace(/^bolt[_-]?/, ""));
  return (concordLock.BOLTS as readonly number[]).includes(n) ? (n as concordLock.BoltId) : null;
}
