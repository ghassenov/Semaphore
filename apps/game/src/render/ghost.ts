/**
 * What the Archive's monitor is showing, decided without a canvas.
 *
 * The Archive is the asymmetry mechanic turned on the archive itself (doc 02
 * section 4). KEEPER calls `read_station_log` and reads what the previous
 * KEEPER called. PILOT watches this: where the previous PILOT stood, and what
 * their hands did. Neither half says what the pair was attempting at the
 * Concord Lock, and putting the two together is how the release-bar mechanic
 * gets taught without a tutorial card.
 *
 * **This module never sees a tool call.** The server's `pilotTrack` has
 * already dropped them, and that is where the boundary is enforced; what this
 * file adds is the reason the boundary is survivable, which is that the
 * remaining beats are enough to animate. They are, but only just: PILOT's
 * position is client-local and was never logged, so the walk between two beats
 * is **interpolated here, not recorded**. The log knows the ghost gripped the
 * release bar. It does not know the path they took to it, and neither does
 * this. Every position between two beats is this module's invention, and it is
 * an honest one only because the beats themselves are real.
 *
 * Pure, like `room.ts` and `plan.ts` beside it, and for the same reason: a
 * replay that drifts is wrong in a way that looks like a rendering glitch.
 */

import type { ChamberId, GhostTrack } from "@semaphore/protocol";
import { shapeOf } from "./plan.js";

/**
 * How long the monitor holds the last frame before looping.
 *
 * The recording ends mid-attempt, so the last thing on screen is a ghost
 * holding a bar and nothing happening. That silence is the point of the beat
 * and it needs a moment to land; cutting straight back to the start would read
 * as a loop rather than as an ending.
 */
export const TAIL_MS = 5000;

/**
 * Where a target sits across its room, as a fraction of the interior.
 *
 * The log names what the ghost touched, not where it was, so a target has to
 * resolve to a position. These are the anchors the four chambers actually put
 * those things at: the release bar is central, a door is off to one side, and
 * the notepad is at the wall the pair works against. Anything unrecognised
 * lands mid-room, which is wrong by at most half a room and never off it.
 */
const ANCHORS: Readonly<Record<string, number>> = {
  release_bar: 0.5,
  concord_lock_door: 0.85,
};

/** Where a body stands on arriving in a room: just inside the door. */
const ARRIVAL = 0.12;

/** Where a body stands when the room's mechanism resolves. */
const AT_THE_MECHANISM = 0.5;

/** Anything the anchor table does not name. */
const UNKNOWN_TARGET = 0.5;

/** One instant of the recording, ready to be painted. */
export interface GhostFrame {
  /** The room the ghost is standing in, or null before the first one. */
  readonly chamber: ChamberId | null;
  /** That room's interior in tiles, so the monitor can draw its outline. */
  readonly cols: number;
  readonly rows: number;
  /** Where the ghost stands, as a fraction across the room. */
  readonly walk: number;
  /** Holding the release bar. The one posture worth drawing differently. */
  readonly gripping: boolean;
  /** One line, in the present tense, saying what is happening. */
  readonly caption: string;
  /** How far through the recording, 0 to 1. Drives the scrub bar. */
  readonly progress: number;
  /** Past the last beat: the recording has run out. */
  readonly ended: boolean;
}

/** What a beat looks like on the caption line. */
function captionFor(
  kind: "enter" | "solved" | "action",
  chamber: ChamberId | null,
  action: string | undefined,
  target: string | undefined,
): string {
  if (kind === "enter") return `ENTERS THE ${roomWord(chamber)}`;
  if (kind === "solved") return "THE DOOR AHEAD OPENS";
  switch (action) {
    case "grip":
      return "GRIPS THE RELEASE BAR";
    case "release":
      return "LETS GO OF THE BAR";
    case "write_note":
      return "WRITES ON THE PAD";
    case "inspect":
      return `LOOKS AT THE ${(target ?? "ROOM").replace(/_/g, " ").toUpperCase()}`;
    case "move":
      return "WALKS TO THE DOOR";
    default:
      return "MOVES";
  }
}

/** A chamber id as a word a caption can end on. */
function roomWord(chamber: ChamberId | null): string {
  return chamber === null ? "STATION" : chamber.replace(/_/g, " ").toUpperCase();
}

/** Where a beat puts the ghost, as a fraction across the room. */
function anchorFor(kind: "enter" | "solved" | "action", target: string | undefined): number {
  if (kind === "enter") return ARRIVAL;
  if (kind === "solved") return AT_THE_MECHANISM;
  return ANCHORS[target ?? ""] ?? UNKNOWN_TARGET;
}

/**
 * The recording at one instant, looping.
 *
 * `elapsedMs` is time since the pair walked into the Archive, not since the
 * ghost's session started: the monitor has been running since before they
 * arrived in the fiction, but a replay that started part-way through would
 * mean the first pair through the door and the second see different recordings
 * of the same log.
 *
 * Played at 1:1. The ghost's log is half a minute long and slowing it down
 * would only make the pair wait for a beat they have already read.
 */
export function ghostFrame(track: GhostTrack, elapsedMs: number): GhostFrame {
  const cycle = Math.max(track.durationMs + TAIL_MS, 1);
  const now = ((elapsedMs % cycle) + cycle) % cycle;

  let chamber: ChamberId | null = null;
  let gripping = false;
  let caption = "THE RECORDING BEGINS";
  // The anchor the ghost is walking from and the one they are walking to, with
  // the times of each, so the position between two beats is an interpolation
  // rather than a jump. A body that teleported between the door and the bar
  // would be the one thing on this screen that is obviously not a recording.
  let fromT = 0;
  let from = ARRIVAL;
  let toT = 0;
  let to = ARRIVAL;

  for (const beat of track.beats) {
    if (beat.t > now) {
      toT = beat.t;
      to = anchorFor(beat.kind, beat.target);
      break;
    }
    if (beat.kind === "enter") chamber = beat.chamber;
    // A grip stands until the ghost lets go or leaves the room. The fixture's
    // last beat is a grip with no release, which is the whole point of it.
    if (beat.action === "grip") gripping = true;
    if (beat.action === "release" || beat.kind === "enter") gripping = false;
    caption = captionFor(beat.kind, chamber, beat.action, beat.target);
    fromT = beat.t;
    from = anchorFor(beat.kind, beat.target);
    toT = beat.t;
    to = from;
  }

  const span = toT - fromT;
  const walk = span <= 0 ? to : from + (to - from) * Math.min(1, (now - fromT) / span);

  const shape = chamber === null ? shapeOf("archive") : shapeOf(chamber);
  const ended = now >= track.durationMs;
  return {
    chamber,
    cols: shape.cols,
    rows: shape.rows,
    walk,
    gripping,
    // The log stops mid-attempt (doc 02 section 4). Saying so is what turns
    // the last frame from a stalled animation into the thing that happened.
    caption: ended ? endingFor(track.outcome) : caption,
    progress: Math.min(1, now / Math.max(track.durationMs, 1)),
    ended,
  };
}

/** The last line of the recording, from how its log ends. */
function endingFor(outcome: GhostTrack["outcome"]): string {
  switch (outcome) {
    case "escaped":
      return "THEY GOT OUT";
    case "deadlocked":
      return "THE SHIFT RAN OUT";
    case "abandoned":
      return "THEY STOPPED HERE";
    case "cut":
      // A literal absence of a final line, reported as one.
      return "THE RECORDING STOPS HERE";
  }
}
