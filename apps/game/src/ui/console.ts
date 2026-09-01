/**
 * The station console: the room, and every readout around it.
 *
 * This is the surface a session is played on. The screens that come *before* a
 * session live in `landing.ts`, and the parts both of them are assembled from
 * live in `parts.ts`.
 *
 * ## The layout is the thesis
 *
 * The console used to be three bays of roughly equal weight around a square
 * canvas, which read as a dashboard with a game in it. It is now **two surfaces
 * with the room between them** (D-045): everything the human perceives on the
 * left, everything the agent can do on the right. That arrangement is the
 * game's own argument - an agent's tool surface and a human's UI surface do not
 * have to be the same surface - stated as furniture, where a judge who reads
 * nothing else still sees it.
 *
 * ## What may be a text node
 *
 * **The rule that governs what may live out here has not changed.**
 * Puzzle-critical visuals render to the canvas, never to DOM, because a DOM text
 * node holding a glyph is a text node an agent with page access can scrape.
 * Everything on the console passes that test for one of three reasons, and each
 * was checked individually:
 *
 * - **Public copy**: the legend, the room's name, the clock, which floors this
 *   session has, and the phase captions over the viewport.
 * - **KEEPER's own**: the manifest is the registry KEEPER can enumerate for
 *   itself; a log line is a call KEEPER just made, with its arguments already
 *   stripped.
 * - **`SHARED` or `AUDIBLE` by construction**: the notepad, which is the one
 *   surface both parties write to, and the sound, which both parties perceive
 *   and which is therefore the one thing PILOT never has to describe.
 *
 * Everything `VISUAL` stays in the scene: the glyphs on the levers, the gauge
 * readings, the cipher offset, the state of the manual page. Those are label
 * sprites inside the WebGL canvas (`render/kit.ts`). If a change ever wants one
 * of them out here, the change is wrong.
 */

import { type PilotView } from "@semaphore/protocol";
import type { Fader, StationAudio } from "../audio/index.js";
import type { SessionClient } from "../net/sessionClient.js";
import { replayUrl } from "../replay.js";
import type { StationModel } from "../render/station.js";
import {
  MANIFEST_LINES,
  TIMER_URGENT_FRACTION,
  formatTimer,
  isTypingTarget,
  meterFill,
} from "../render/hud.js";
import { roomPlan, roomTitle } from "../render/chamber.js";
import { FLOOR_NAMES, activeFloor, stationFloors, type FloorId } from "../render/floors.js";
import { CHANNEL_MARKER } from "../render/palette.js";
import { describeRoom } from "../render/mirror.js";
import { createTour, type TourHandle } from "../tutorial/tour.js";
import { ENDING, OPENING, playStory, type StoryHandle } from "../story.js";
import { gradeShift, type Replay } from "../report.js";
import {
  copyResultButton,
  el,
  fill,
  legendRow,
  panel,
  promptCard,
  lampMark,
  reportCard,
} from "./parts.js";
import { renderLanding } from "./landing.js";

/** How many segments the ambiguity gauge in the rail is divided into. */
const GAUGE_SEGMENTS = 12;

/** Everything the console needs to drive PILOT's half of the session. */
export interface ShellDeps {
  readonly client: SessionClient;
  /**
   * The station's sound.
   *
   * Driven from here rather than from `main.ts` because the console is where
   * the launch click lands (an `AudioContext` needs a gesture) and where the
   * subtitle is written. Firing the cue on the same line that writes the text
   * is what keeps doc 06 section 11's promise that every cue has a text
   * equivalent: they cannot drift if they are one statement apart.
   */
  readonly audio: StationAudio;
  /** Called after PILOT acts, so the caller can put the answer in the log. */
  readonly onNote: (line: string) => void;
}

/** What `main.ts` gets back: where to mount things, and how to feed the console. */
export interface ShellHandle {
  /** The element the renderer creates its canvas inside. */
  readonly stage: HTMLElement;
  /**
   * Where the director puts the notepad form.
   *
   * A mount point rather than the form itself, because the form is a
   * declaratively registered tool and its element *is* its registration
   * (D-024). Only the thing that owns tool lifetimes may create or destroy it,
   * and that is the director, not this file.
   */
  readonly notepadHost: HTMLElement;
  /**
   * Where the archive origin's hidden frame is mounted, when there is one.
   *
   * A mount point for the same reason the notepad has one: the frame is a tool
   * registration on another origin, so whoever owns tool lifetimes owns the
   * element. It holds no content and nothing about it is visible.
   */
  readonly archiveHost: HTMLElement;
  /** Repaint the readouts from the model. Called by `station.ts` on change. */
  update(model: StationModel): void;
  dispose(): void;
}

/**
 * The things only PILOT can do, and when each of them is worth offering.
 *
 * This list is the asymmetry from the other side. None of them is a tool,
 * however convenient a `retry_chamber` tool would be: an agent cannot grip a bar
 * it has no body for, and it cannot restart a chamber it cannot see.
 *
 * **Each one appears only where it does something.** All four used to be on
 * screen for the whole session, which meant three of them were an error message
 * waiting to happen at any given moment, and a player learning the game could
 * not tell the one that mattered from the three that did not. `when` is read
 * against the phase and the chamber, both of which are `SHARED` by construction,
 * so hiding an inapplicable control tells nobody anything they did not have.
 */
const PILOT_ACTIONS: readonly {
  readonly label: string;
  readonly action: string;
  readonly when: (view: PilotView | null) => boolean;
}[] = [
  {
    label: "grip the release bar",
    action: "grip_bar",
    when: (view) => view?.chamber === "concord_lock" && view.phase === "IN_CHAMBER",
  },
  {
    label: "let go of the bar",
    action: "release_bar",
    when: (view) => view?.chamber === "concord_lock" && view.phase === "IN_CHAMBER",
  },
  {
    label: "leave the archive",
    action: "leave_archive",
    when: (view) => view?.phase === "ARCHIVE",
  },
  {
    label: "reset the chamber",
    action: "retry_chamber",
    when: (view) => view?.phase === "DEADLOCK",
  },
];

/**
 * PILOT's keyboard, as a list.
 *
 * `E` is the one worth putting first. Until the lamp resolved detail by
 * proximity, walking moved a token and nothing else, and the honest complaint
 * about it was that position did not mean anything. It does now: this list is
 * where a player finds that out.
 */
const PILOT_KEYS: readonly (readonly [string, string])[] = [
  ["W A S D", "walk the room, in any direction"],
  ["E", "lean in and study what you are standing at"],
  ["Q", "at an open door, go through it"],
  ["M", "step back and see the whole station"],
  ["F", "fullscreen"],
] as const;

/**
 * The three faders, and the split doc 06 section 11 asks for.
 *
 * Mechanisms are separate from music for a reason that is not preference: the
 * `AUDIBLE` channel carries puzzle information, so a player has to be able to
 * turn the score down without turning the answer down with it.
 */
const MIX_SLIDERS: readonly (readonly [Fader, string, string])[] = [
  ["master", "ALL", "Master volume"],
  ["music", "SCORE", "Music volume"],
  ["sfx", "MECH", "Mechanism volume"],
] as const;

/** How narrow and how wide a drawer may be dragged, in pixels. */
const DRAWER_MIN = 220;
const DRAWER_MAX = 560;

/** How much one arrow key moves a drawer's edge, in pixels. */
const DRAWER_STEP = 24;

/**
 * One edge of the deck: a rail of tabs, and a drawer that slides over the room.
 *
 * **The drawer overlays the viewport rather than pushing it, and that is a
 * constraint rather than a preference.** The camera frames against the
 * viewport's measured shape (`render/camera.ts`), so a panel that squeezed the
 * viewport would re-frame the shot every time somebody opened one, and the
 * room would jump. Overlaying costs a little of the room and re-frames nothing.
 *
 * One panel open per edge at a time. The old console showed six at once around
 * a small room, which is the thing being fixed: a player who has to find the
 * spiral is looking at a room, and everything else is a thing they ask for.
 */
function edge(side: "left" | "right"): {
  readonly tabs: HTMLElement;
  readonly drawer: HTMLElement;
  add(label: string, section: HTMLElement): void;
  close(): void;
  open(label: string): void;
  showing(): string | null;
} {
  const tabs = el("nav", { class: `tabs tabs-${side}` });
  const drawer = el("aside", { class: `drawer drawer-${side}` });
  drawer.hidden = true;
  const body = el("div", { class: "drawer-body" });

  /**
   * The resize handle, as a `separator` rather than a decorative div.
   *
   * It carries arrow keys as well as a pointer because a control that only
   * answers to dragging is a control a keyboard cannot reach, and this repo
   * treats that as a defect rather than a nicety.
   */
  const grip = el("div", {
    class: "grip",
    role: "separator",
    tabindex: "0",
    "aria-orientation": "vertical",
    "aria-label": "Resize panel",
    title: "Drag, or use the arrow keys",
  });
  drawer.append(body, grip);

  const panels = new Map<string, HTMLElement>();
  const buttons = new Map<string, HTMLButtonElement>();
  let open: string | null = null;

  /** How wide the drawer is allowed to get on this window. */
  const ceiling = (): number => Math.min(DRAWER_MAX, globalThis.innerWidth * 0.62);

  function resize(to: number): void {
    drawer.style.width = `${String(Math.max(DRAWER_MIN, Math.min(ceiling(), to)))}px`;
  }

  function show(name: string | null): void {
    // Where focus was, before anything is hidden underneath it.
    //
    // A drawer that closes while the keyboard is inside it leaves focus on an
    // element that is no longer rendered, and the browser's answer to that is
    // to drop the user at the top of the document - so Escape, which exists to
    // get back to the room, instead costs a keyboard player their place
    // entirely. Returning focus to the tab that opened the panel is where they
    // were before they opened it, and it is the control that reopens it.
    const wasInside = drawer.contains(document.activeElement);
    const previous = open;

    open = name;
    for (const [id, section] of panels) section.hidden = id !== name;
    for (const [id, button] of buttons) {
      const on = id === name;
      button.classList.toggle("on", on);
      button.setAttribute("aria-expanded", String(on));
    }
    drawer.hidden = name === null;

    if (name === null && wasInside && previous !== null) buttons.get(previous)?.focus();
  }

  grip.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    grip.setPointerCapture(event.pointerId);
    const from = event.clientX;
    const was = drawer.getBoundingClientRect().width;
    const move = (moved: PointerEvent): void => {
      // A left drawer grows as the pointer moves right and a right drawer
      // grows as it moves left, because both are measured from their own edge.
      resize(was + (side === "left" ? moved.clientX - from : from - moved.clientX));
    };
    const done = (): void => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", done);
      grip.removeEventListener("pointercancel", done);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", done);
    grip.addEventListener("pointercancel", done);
  });

  grip.addEventListener("keydown", (event) => {
    const nudge = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (nudge === 0) return;
    event.preventDefault();
    resize(drawer.getBoundingClientRect().width + nudge * DRAWER_STEP * (side === "left" ? 1 : -1));
  });

  return {
    tabs,
    drawer,
    close: () => {
      show(null);
    },
    /** Open one panel by name, for a caller that knows which should be first. */
    open: (label: string) => {
      show(label);
    },
    /** Which panel is open, or null. Lets a caller tell "still mine" from "moved on". */
    showing: () => open,
    add(label, section) {
      section.hidden = true;
      panels.set(label, section);
      body.append(section);

      const button = el("button", { type: "button", class: "tab" }, label);
      // A stable handle for anything that needs to point at this tab from
      // outside the console. The guided shift spotlights two of them, and a
      // class name would be a promise that a styling change is free to break.
      button.dataset.tab = label
        .toLowerCase()
        .replace(/[^a-z]+/g, "-")
        .replace(/^your-/, "");
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => {
        // Clicking the open tab closes it, so the room can always be got back
        // to with the same control that covered it.
        show(open === label ? null : label);
      });
      buttons.set(label, button);
      tabs.append(button);
    },
  };
}

/**
 * The console: the room, and every readout around it.
 *
 * Laid out as a station terminal rather than as a document. The room and what
 * the human perceives on the left, what the agent can do on the right, and the
 * shared notepad at the seam between them.
 */
export function renderStation(root: HTMLElement, deps: ShellDeps): ShellHandle {
  root.replaceChildren();
  const console_ = el("div", { class: "console" });

  // ---- The rail: who we are, where we are, how much is unknown, how long. --
  const rail = el("header", { class: "rail" });
  const mark = el("span", { class: "mark" });
  mark.append(lampMark(18), el("span", {}, "SEMAPHORE"));
  const room = el(
    "span",
    {
      class: "room",
      title: 'Which room the session is in. "REVISITED" means you have walked back through a door.',
    },
    "CONNECTING",
  );
  const resets = el("span", {
    class: "resets",
    title: "How many times this chamber has been reset after an invalid action.",
  });

  /*
   * The ambiguity gauge, beside the clock because it is a headline number.
   *
   * Segmented rather than continuous: information arrives in discrete quanta
   * and doc 06 section 7 asks for a meter that ratchets rather than slides.
   *
   * It is a real number - `log2(|consistent worlds|)`, doc 03 section 6 - and
   * that is worth keeping rather than hiding: it is this project's actual
   * measured claim, not a decorative stat. What it lacked was a plain-language
   * way in. It never had one on first contact - "AMBIGUITY 1.58 bits" reads as
   * instrumentation to somebody who has not read the design docs, with no cue
   * for which direction is good or that it is a live consequence of how well
   * PILOT is describing the room. `title` gives the on-demand explanation;
   * `data-tour="gauge"` is what the guided shift spotlights the one time it
   * actually walks somebody through what they are looking at.
   */
  const gauge = el("div", {
    class: "gauge",
    "data-tour": "gauge",
    title:
      "How much your agent still does not know about this room, in bits. It only falls " +
      "when what you tell it actually narrows things down.",
  });
  const gaugeTrack = el("div", { class: "gauge-track" });
  const segments = Array.from({ length: GAUGE_SEGMENTS }, () => el("i", {}));
  gaugeTrack.append(...segments);
  const bits = el("span", { class: "gauge-bits" }, "-");
  gauge.append(el("span", { class: "gauge-label" }, "AMBIGUITY"), gaugeTrack, bits);

  const clock = el(
    "span",
    { class: "clock", title: "Time left in this chamber. UNTIMED in practice mode." },
    "--:--",
  );
  rail.append(mark, room, resets, gauge, clock);

  // ---- The deck: the room, with everything else folded into its two edges. -
  const deck = el("main", { class: "deck" });
  const west = edge("left");
  const east = edge("right");

  // The renderer appends its canvas and its caption layer straight into this
  // element, so the mount point *is* the viewport rather than a wrapper inside
  // it. The camera frames against this element's measured shape
  // (`render/camera.ts`), and a wrapper that sized itself to its own content
  // would re-frame the shot every time a panel below it grew by a line.
  const viewport = el("div", { class: "viewport" });

  /*
   * Fullscreen.
   *
   * Worth a control of its own rather than leaving it to the browser's own
   * chrome, for a reason specific to this game: the room is where every
   * `VISUAL` fact lives, and PILOT's whole job is reading detail off it and
   * getting it across in words. A bigger viewport is not comfort, it is the
   * human's half of the puzzle getting easier to do.
   *
   * The button sits on the viewport rather than in a panel because that is what
   * it acts on, and it reports its own state: a control that says "full screen"
   * while you are already in it is a control nobody trusts.
   */
  const fullscreen = el(
    "button",
    { type: "button", class: "fullscreen", title: "Fullscreen (F)" },
    "Fullscreen",
  );
  const toggleFullscreen = (): void => {
    if (document.fullscreenElement === viewport) {
      void document.exitFullscreen().catch(() => {
        /* Denied or already out. The button's label is corrected below. */
      });
      return;
    }
    void viewport.requestFullscreen().catch(() => {
      /* Some browsers refuse outside a user gesture; nothing to recover. */
    });
  };
  fullscreen.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    const inside = document.fullscreenElement === viewport;
    fullscreen.textContent = inside ? "Exit fullscreen" : "Fullscreen";
    viewport.classList.toggle("is-fullscreen", inside);
  });
  // F as well as the button. PILOT's hands are already on the keyboard for
  // walking, and reaching for a mouse to make the room bigger is a reach away
  // from the thing being looked at.
  const onKey = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() !== "f") return;
    // Never while typing on the shared notepad. Same predicate the stage uses
    // for PILOT's body, from the same module, so the two cannot drift apart
    // again.
    if (isTypingTarget(event.target)) return;
    toggleFullscreen();
  };
  globalThis.addEventListener("keydown", onKey);
  viewport.append(fullscreen);

  /*
   * The landing screen, and the guided shift it can ask for.
   *
   * The landing screen is its own surface (`landing.ts`) laid over this whole
   * console rather than a card inside the deck. That is what stops a visitor
   * who has started nothing from being shown a rail reading `CONNECTING`, an
   * ambiguity gauge with no session behind it, seven tab stubs and three audio
   * faders - and it gives that screen its own scroll, which the deck cannot
   * have because the deck has a definite height and clips.
   *
   * The console stays laid out underneath it the whole time. Hiding it with
   * `display: none` would take the viewport to zero by zero, and the camera
   * frames against the viewport's measured shape.
   *
   * `teach` is bound once the tour exists, further down. A control that does
   * nothing for one frame is better than reordering the shell around a
   * tutorial.
   */
  let teach: (() => void) | null = null;
  /**
   * Whether the landing screen asked for the tour before there was a room.
   *
   * The tour's beats are about the Airlock's levers, so running it on the
   * landing screen played a lesson over an empty page: the copy arrived, the
   * camera had nothing to fly to, and the game the tutorial was describing was
   * not on screen at all. "Look around without an agent" *starts* a practice
   * shift and the tour opens when the room does.
   */
  let teachOnArrival = false;

  const landing = renderLanding({
    client: deps.client,
    audio: deps.audio,
    onNote: deps.onNote,
    onTeach: () => {
      teachOnArrival = true;
    },
  });

  // The ending's other half (doc 08 phase 3.2): the link to the replay, on the
  // same monitor the ghosts were on.
  //
  // It lives over the room like the start card does and appears only at
  // ESCAPED, which is the one phase where the pair has stopped playing and has
  // something to take away. The session's own id is the replay's id, so there
  // is nothing to look up.
  //
  // It is *not* a `.launch` veil. The first build reused that class and put a
  // dimmed full-bleed card over the last shot of the game, printing "The door
  // is open" a second time across the caption band that was already saying it.
  // Doc 08 phase 3.2 asks for the opposite: hold the balcony, let it breathe,
  // and only then offer the stats. So this is a strip along the foot of the
  // room that takes a little of the frame and covers none of the middle.
  const ending = el("div", { class: "ending" });
  ending.hidden = true;
  const replayHref = replayUrl(deps.client.sessionId);
  const replayLink = el("a", { class: "spectate", href: replayHref }, "WATCH THE REPLAY");
  const endingNote = el(
    "p",
    { class: "note" },
    "The whole shift is on the station's log: what you did, what your agent " +
      "called, and the ambiguity between you.",
  );
  ending.append(endingNote, replayLink);
  viewport.append(ending);

  /**
   * Fetch this session's own replay and put the shift report in the strip.
   *
   * The row is written to D1 inside the Durable Object on the way into
   * ESCAPED and awaited before the acting agent gets its answer, so by the
   * time the socket has pushed the phase it is almost always there. Almost:
   * the write swallows its own failure on purpose (doc 07 section 3.1 - the
   * game keeps working when the instrument recording it does not), so it can
   * legitimately never arrive.
   *
   * Which is why this is additive and never destructive. On success the card
   * goes in above the sentence that was already there; on failure, or on a
   * row that never lands, the strip stays exactly what it was before this
   * existed. **The ending must not be able to get worse than it is.**
   */
  async function loadReport(): Promise<void> {
    const origin = import.meta.env.VITE_WORKER_ORIGIN ?? "";
    const url = `${origin}/replay/${encodeURIComponent(deps.client.sessionId)}`;
    for (const waitMs of [0, 600, 1500]) {
      if (waitMs > 0) await new Promise((done) => globalThis.setTimeout(done, waitMs));
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const report = gradeShift((await response.json()) as Replay);
        const card = reportCard(report);
        card.actions.append(copyResultButton(report, replayHref), replayLink);
        // The sentence explained what the link was for. The card says it
        // better and in more detail, so the sentence goes rather than sitting
        // above a table repeating itself.
        endingNote.remove();
        ending.prepend(card.section);
        return;
      } catch {
        // A network fault on the way to a nicety. Try again, then stop.
      }
    }
  }

  const audible = el("p", { class: "audible", "aria-live": "polite" });

  /**
   * The mix: mute, master, music and mechanisms.
   *
   * Beside the audible strip rather than in a settings menu, because this is
   * the one strip on the page that is already about sound, and because the
   * detents in Chamber II are a puzzle mechanism rather than a flourish: a
   * player who cannot hear them needs the mechanisms louder, and needs to find
   * that control without leaving the room they are counting in.
   */
  const mixer = el("div", { class: "mixer" });
  const mute = el("button", { type: "button", class: "mute" }, "Mute");
  mute.setAttribute("aria-pressed", "false");
  mute.addEventListener("click", () => {
    const muted = !deps.audio.mix.muted;
    deps.audio.setMix({ muted });
    mute.textContent = muted ? "Unmute" : "Mute";
    mute.setAttribute("aria-pressed", String(muted));
  });
  mixer.append(mute);
  for (const [key, short, label] of MIX_SLIDERS) {
    const slider = el("input", {
      type: "range",
      min: "0",
      max: "100",
      value: String(Math.round(deps.audio.mix[key] * 100)),
      class: `mix mix-${key}`,
      "aria-label": label,
      title: label,
    });
    slider.addEventListener("input", () => {
      deps.audio.setMix({ [key]: Number(slider.value) / 100 });
    });
    // Named in the frame, not only in the tooltip. Three identical sliders is
    // one control repeated three times as far as anybody looking at it is
    // concerned, and the one that has to be findable is MECH: the detents in
    // Chamber II are a puzzle mechanism, so a player who cannot hear them
    // needs to turn the score down off the answer without hunting.
    const named = el("label", { class: "fader" });
    named.append(el("span", { class: "fader-name" }, short), slider);
    mixer.append(named);
  }

  const station = panel("The station");
  const floorList = el("ol", { class: "floors", "data-empty": "OUTSIDE THE STATION" });
  station.body.append(floorList, legendRow());
  // A durable answer to "what does AMBIGUITY mean", for anybody who skipped
  // the guided shift or wants to check the definition again mid-session. The
  // rail's own tooltip and the tour's spotlight are the two other ways in;
  // this is the one that is always sitting somewhere to be found.
  station.body.append(
    el(
      "p",
      { class: "note" },
      "The AMBIGUITY gauge, top of screen, is how much your agent still does not know " +
        "about the room you are both in. It falls when your words actually narrow things " +
        "down for it, not just when you talk.",
    ),
  );

  const controls = panel("Your hands", "controls");
  const actionButtons = PILOT_ACTIONS.map((entry) => {
    const button = el("button", { type: "button" }, entry.label);
    button.addEventListener("click", () => {
      void deps.client.post(entry.action).then((response) => {
        deps.onNote(`${entry.label}: ${response.text}`);
      });
    });
    controls.body.append(button);
    return { entry, button };
  });
  // The two things PILOT does with the keyboard rather than with a button. Both
  // belong in this panel for the same reason the buttons do: they are the
  // human's body, and no tool in the manifest reaches them.
  // What the human's hands actually are. Spelled out as a list rather than a
  // sentence, because the first build buried four controls in one line of prose
  // and the most important of them - that walking changes what you can read -
  // was not mentioned at all.
  const keys = el("ul", { class: "keys" });
  for (const [key, what] of PILOT_KEYS) {
    const row = el("li", {});
    row.append(el("kbd", {}, key), el("span", {}, what));
    keys.append(row);
  }
  controls.body.append(keys);
  controls.body.append(
    el(
      "p",
      { class: "note" },
      "None of these is a tool your agent can call. Your lamp is the only thing that " +
        "resolves detail: walk to a mechanism to read it.",
    ),
  );
  /*
   * The guided shift, asked for from inside the session.
   *
   * It used to be reachable only from a button on the landing card, so a
   * player who skipped it in the first ten seconds - or who was started by
   * their agent rather than by the card - had no way back to it for the rest
   * of the shift. It is a control PILOT has and KEEPER does not, which is
   * exactly what this panel is for.
   */
  const replay = el("button", { type: "button", class: "teach" }, "Show me how it works");
  replay.addEventListener("click", () => {
    teach?.();
  });
  controls.body.append(replay);

  // ---- KEEPER's surface, and the one surface they share. ------------------

  const card = promptCard();

  const manifestPanel = panel("Faculties");
  const manifestCount = el("span", { class: "count" }, "0");
  manifestPanel.section.querySelector("h2")?.append(manifestCount);
  const manifest = el("ol", { class: "manifest", "data-empty": "NO TOOLS REGISTERED" });
  manifestPanel.body.append(manifest);
  // The plate exists to prove KEEPER's body is not a lie: both are drawn from
  // the page's own `getTools()`, never from a record of what was meant to be
  // registered.
  manifestPanel.body.append(
    el("p", { class: "note" }, "What your agent can do right now. It changes as you move."),
  );

  const logPanel = panel("Activity");
  const log = el("ol", { class: "log", "data-empty": "NOTHING YET" });
  logPanel.body.append(log);

  const padPanel = panel("Notepad");
  const notes = el("ol", { class: "notes", "data-empty": "BLANK" });
  const notepadHost = el("div", { class: "notepad-host" });
  padPanel.body.append(notes, notepadHost);
  padPanel.body.append(
    el(
      "p",
      { class: "note" },
      "The one control you and KEEPER share. It writes the same tool your agent calls.",
    ),
  );

  /*
   * Which panel sits on which edge, and the order they are stacked in.
   *
   * PILOT's own two on the west edge and KEEPER's four on the east, which is
   * the same thesis the old three-bay layout stated and the same one the room
   * itself states: what the human perceives on one side, what the agent can do
   * on the other. The difference is that now neither side is in the way until
   * it is asked for.
   */
  /**
   * Access: the mirror, contrast and motion (doc 08 phase 6).
   *
   * On PILOT's edge because every switch here belongs to the person looking at
   * the room. All three are off by default and all three are remembered for
   * the session only: a setting that survived a reload would be a setting
   * somebody turned on once and then could not explain.
   */
  const access = panel("Access");

  /**
   * The room in words, in an `aria-live` region.
   *
   * **This is the one sanctioned exception to the no-puzzle-values-in-DOM
   * rule, and it is a trade-off rather than a loophole** (`CLAUDE.md`, and
   * `render/mirror.ts` at length). A text node holding a fixture is one an
   * agent with page access can scrape, and KEEPER not being able to see is the
   * whole game. What keeps it honest is that it is off until the person it is
   * for turns it on, and that the describer never names a glyph: the mark is
   * still PILOT's to describe.
   */
  const mirrorToggle = el(
    "button",
    { type: "button", class: "access-toggle" },
    "Describe the room",
  );
  mirrorToggle.setAttribute("aria-pressed", "false");
  const mirrorBody = el("div", { class: "mirror", role: "region", "aria-live": "polite" });
  mirrorBody.hidden = true;
  mirrorToggle.addEventListener("click", () => {
    mirrorBody.hidden = !mirrorBody.hidden;
    mirrorToggle.setAttribute("aria-pressed", String(!mirrorBody.hidden));
    paintMirror();
  });

  /** Repaint the mirror, but only when somebody is reading it. */
  let mirrorView: PilotView | null = null;
  function paintMirror(): void {
    if (mirrorBody.hidden) return;
    const lines = describeRoom(mirrorView);
    mirrorBody.replaceChildren(...lines.map((line) => el("p", {}, line)));
  }

  /**
   * Contrast and motion, as switches rather than only as media queries.
   *
   * `prefers-reduced-motion` is already honoured, and it is not enough on its
   * own: it is a system setting, and somebody who wants the station still for
   * this session should not have to change their whole desktop to get it. The
   * same argument applies to contrast. Both set an attribute on the root and
   * the stylesheet does the rest.
   */
  function rootSwitch(label: string, attribute: string): HTMLButtonElement {
    const button = el("button", { type: "button", class: "access-toggle" }, label);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      const on = document.documentElement.hasAttribute(attribute);
      if (on) document.documentElement.removeAttribute(attribute);
      else document.documentElement.setAttribute(attribute, "");
      button.setAttribute("aria-pressed", String(!on));
    });
    return button;
  }

  access.body.append(
    mirrorToggle,
    mirrorBody,
    rootSwitch("High contrast", "data-contrast"),
    rootSwitch("Reduce motion", "data-still"),
    el(
      "p",
      { class: "note" },
      "Describing the room puts what you can see into the page as text. Your agent " +
        "can read the page, so this hands it part of your half. It is off unless you " +
        "ask for it.",
    ),
  );

  west.add("Station", station.section);
  west.add("Your hands", controls.section);
  west.add("Access", access.section);
  east.add("Your agent", card);
  east.add("Faculties", manifestPanel.section);
  east.add("Activity", logPanel.section);
  east.add("Notepad", padPanel.section);

  // The requisition slip is open when the page loads, and only then.
  //
  // Doc 02 section 12 and doc 04 section 2 both call it the single most
  // important element on this screen, and D-052 put every panel behind a tab -
  // which left it behind a *closed* one, so the thing that makes an agent
  // engage at all was one click away from a player who did not know it existed.
  // The start card tells them to paste the prompt on the right; the right had
  // nothing visible on it.
  //
  // Once, though. It is opened here and never reopened, so a player who closes
  // it has closed it: the room is the page (D-052), and a panel that kept
  // coming back would be the console arguing with them.
  /*
   * The prompt drawer no longer opens itself.
   *
   * It used to, on the grounds that it was the most important element on the
   * landing screen - true when that screen was a small card in an empty room.
   * The landing is now the split itself, and a panel standing over its right
   * third talks over the argument the page is making. The prompt has moved
   * into the cold half instead, which is where it belongs: the starter prompt
   * *is* what the agent gets.
   */
  /** Whether the opening slip has already given the room back. */
  let handedOver = false;

  deck.append(west.tabs, viewport, east.tabs, west.drawer, east.drawer);

  // The audible strip and the mix, under the room. Both are about sound and
  // neither belongs behind a tab: the strip is the deaf-accessible half of the
  // `AUDIBLE` channel and has to be visible while a chamber is being played.
  const foot = el("div", { class: "foot" });
  foot.append(audible, mixer);

  // Out of the flow entirely: an empty container for the archive frame, which
  // is hidden and zero-sized when it exists at all.
  const archiveHost = el("div", { class: "archive-host", "aria-hidden": "true" });

  console_.append(rail, deck, foot, archiveHost);
  /*
   * The landing screen goes *first*, and that is not a paint decision.
   *
   * It is a fixed overlay with its own stacking context, so it draws on top
   * wherever it sits. What DOM order decides is what "the first one" means to
   * anything that looks an element up by class - and there are two requisition
   * slips on this page: the visible one on the landing screen, and the one
   * stowed in the closed YOUR AGENT drawer. Appended last, the landing's copy
   * came *second*, so `querySelector(".slip")` found the hidden one and the
   * browser proof correctly reported the never-cut card as not on screen.
   *
   * First is also the right order for a surface that covers everything else:
   * it is what a screen reader reaches first, which is what somebody arriving
   * at this page should meet.
   */
  console_.prepend(landing.element);
  root.append(console_);

  // Escape closes whatever is covering the room. The room is the thing the
  // player is trying to look at, so getting back to it should not need aim.
  globalThis.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || isTypingTarget(event.target)) return;
    west.close();
    east.close();
  });

  /**
   * The most ambiguity seen in the current room, for the gauge's scale.
   *
   * Held here rather than on the model because it is a property of the display:
   * the absolute bit count is not comparable across chambers - the Airlock
   * opens at log2(3) and the Signal Room at nearly eleven bits - so the gauge
   * reads against the room's own high-water mark. On a fixed scale the Airlock
   * would sit permanently near-empty and teach the player nothing.
   */
  let peakBits = 0;
  let peakChamber: string | null = null;

  /** The manifest as it was last painted, so a surviving tool does not re-animate. */
  let shownTools: readonly string[] = [];

  /*
   * The guided shift, mounted over the deck.
   *
   * It is created eagerly and drawn lazily: nothing is on screen until it
   * starts, so a session that never asks for it pays one detached element. The
   * model is handed over rather than a callback, because the one thing it needs
   * to do to the world outside itself is move the camera, and the camera is
   * read off the model every frame like everything else.
   */
  let tour: TourHandle | null = null;
  let offered = false;
  /*
   * The two sequences that bracket a shift, each played once.
   *
   * Keyed on the phase arriving rather than on a timer, so the opening lands
   * when the pair actually reach a room and the ending lands when the door is
   * actually open. `told` is what keeps a re-render from replaying either.
   */
  let story: StoryHandle | null = null;
  const told = new Set<string>();
  // The landing card's own way in, bound once the tour exists.
  teach = () => tour?.start();

  return {
    stage: viewport,
    notepadHost,
    archiveHost,

    update(model: StationModel) {
      tour ??= createTour(deck, model);
      /*
       * Offer it once, when the pair first reach a room.
       *
       * Not on the landing screen: the tour's third beat is about a mark above
       * one of the Airlock's levers, and a tour that describes a room nobody is
       * standing in is a slideshow. Not on every visit either - autoplaying
       * anything is a cost imposed on somebody who did not ask for it, so it
       * runs on a first visit and then only when asked.
       */
      const nowPhase = model.view?.phase ?? null;
      if (nowPhase === "IN_CHAMBER" && !told.has("opening")) {
        told.add("opening");
        story = playStory(deck, OPENING);
      }
      if (nowPhase === "ESCAPED" && !told.has("ending")) {
        told.add("ending");
        story = playStory(deck, ENDING);
        // Started with the three closing beats rather than after them: the
        // fetch and the story take about the same few seconds, so the card is
        // ready as the last line clears instead of arriving after a pause.
        void loadReport();
      }
      // The tour waits for the opening to have had its say, so the two are
      // never on screen together telling the player two different things.
      if (teachOnArrival && nowPhase === "IN_CHAMBER") {
        teachOnArrival = false;
        offered = true;
        const asked = tour;
        globalThis.setTimeout(() => {
          story?.stop();
          asked.start();
        }, 900);
      }
      if (!offered && nowPhase === "IN_CHAMBER") {
        offered = true;
        if (!tour.seen()) {
          globalThis.setTimeout(() => {
            story?.stop();
            tour?.start();
          }, 8600);
        }
      }
      const view = model.view;
      const remaining = view?.remainingMs ?? model.state?.remainingMs ?? null;
      const phase = view?.phase ?? model.state?.phase ?? null;

      // The room the viewport is showing, which is the room the session is in
      // unless PILOT has walked back through a door they already opened.
      // Naming the chamber the pair is working on over a picture of a room two
      // chambers back reads as a bug in whichever of the two you trust less.
      const away =
        view !== null && model.standing !== null && model.standing !== activeFloor(view)
          ? model.standing
          : null;
      room.textContent = away
        ? `${FLOOR_NAMES[away]} - REVISITED`
        : view
          ? roomTitle(view)
          : (phase ?? "CONNECTING");
      clock.textContent = formatTimer(remaining);
      const total = model.chamberTimerMs;
      clock.classList.toggle(
        "urgent",
        total > 0 && remaining !== null && remaining / total < TIMER_URGENT_FRACTION,
      );
      resets.textContent = view && view.retries > 0 ? `RESETS ${String(view.retries)}` : "";

      // The landing screen follows the phase, and takes attract mode with it.
      // It is the only thing on the page that decides whether it is on the
      // page, which is why it is handed the phase rather than a boolean:
      // "should I be here" is its question to answer, not the console's.
      landing.update(phase);
      const playing = phase !== null && phase !== "ENTRY" && phase !== "LOBBY";

      // The slip hands the room over when the shift starts.
      //
      // It is opened on load because it is the most important element on the
      // landing screen, and it has to get out of the way the moment there is a
      // room, because the room is the page (D-052) and a panel overlaying its
      // right third is the console talking over the game.
      //
      // Once, and only if it is still the panel this opened. A player who has
      // moved to Faculties or Notepad by then is reading something they chose,
      // and closing it would be the console overruling them.
      if (playing && !handedOver) {
        handedOver = true;
        if (east.showing() === "Your agent") east.close();
      }
      // And the replay link, at the one phase where the pair has finished.
      ending.hidden = phase !== "ESCAPED";

      mirrorView = view ?? null;
      paintMirror();
      paintFloors(floorList, view, model.standing);
      paintGauge();
      // The subtitle and the sound, one line apart, from one frame. Doc 06
      // section 11 requires every cue to have a text equivalent; keeping them
      // adjacent is what stops that being a promise somebody has to remember.
      audible.textContent = view ? (roomPlan(view)?.sound ?? "") : "";
      deps.audio.update(view, model.chamberTimerMs);

      for (const { entry, button } of actionButtons) button.hidden = !entry.when(view ?? null);

      manifestCount.textContent = String(model.tools.length);
      paintManifest(model.tools);
      fill(log, model.log, (line) => el("li", {}, line));
      fill(notes, [...(view?.notes ?? [])].reverse(), (note) => {
        const item = el("li", {
          class: note.author === "KEEPER" ? "chan-keeper" : "chan-pilot",
        });
        item.append(
          el("span", { class: "who" }, note.author === "KEEPER" ? "K" : "P"),
          el("span", {}, note.text),
        );
        return item;
      });

      /**
       * Repaint the manifest, leaving the tools that survived alone.
       *
       * Rebuilding the whole list would restart the arrival animation on every
       * row at every `toolchange`, which would say that the entire registry had
       * just been replaced. The point of the two-tier lifecycle is that most of
       * it did not.
       */
      function paintManifest(tools: readonly string[]): void {
        const wanted = tools.slice(0, MANIFEST_LINES);
        if (wanted.length === shownTools.length && wanted.every((t, i) => t === shownTools[i])) {
          return;
        }
        shownTools = wanted;
        fill(manifest, wanted, (tool) => {
          const item = el("li", { class: "tool" });
          item.append(el("span", { class: "marker" }, CHANNEL_MARKER.keeper), el("span", {}, tool));
          return item;
        });
      }

      function paintGauge(): void {
        const chamber = view?.chamber ?? null;
        if (chamber !== peakChamber) {
          peakChamber = chamber;
          peakBits = 0;
        }
        // A reading from a room the pair has already left is not stale, it is
        // wrong, so it is discarded rather than drawn.
        const current = model.concord?.chamber === chamber ? model.concord : null;
        if (current?.bits != null) peakBits = Math.max(peakBits, current.bits);
        const lit = Math.round(meterFill(current?.bits ?? null, peakBits) * GAUGE_SEGMENTS);
        segments.forEach((segment, index) => {
          segment.classList.toggle("lit", index < lit);
        });
        bits.textContent = current?.bits == null ? "-" : `${current.bits.toFixed(2)} bits`;
      }
    },

    dispose() {
      globalThis.removeEventListener("keydown", onKey);
      root.replaceChildren();
    },
  };
}

/**
 * The station's floors, as the only progress display the console has.
 *
 * Every floor is listed from the first minute, including the ones not reached
 * yet, because knowing the station has a Concord Lock in it is part of knowing
 * what you are in for.
 */
function paintFloors(list: HTMLElement, view: PilotView | null, standing: FloorId | null): void {
  if (!view) {
    list.replaceChildren();
    return;
  }
  fill(list, stationFloors(view), (floor) => {
    const classes = ["floor"];
    if (floor.active) classes.push("here");
    if (floor.cleared) classes.push("cleared");
    const item = el("li", { class: classes.join(" ") });
    // `>` is where the body is and `*` is where the session is. They are the
    // same room until PILOT walks back through a door (D-054), and while they
    // differ the rail is the only thing on the page that says both.
    const pip = floor.id === standing ? ">" : floor.active ? "*" : floor.cleared ? "+" : "-";
    item.append(el("span", { class: "pip" }, pip), el("span", {}, floor.name));
    return item;
  });
}
