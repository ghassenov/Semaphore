/**
 * The DOM around the viewport: the gate screen, and the station console.
 *
 * Two surfaces live here. The **gate screen**, shown to a browser with no
 * WebMCP, and the **console**, which is the equipment the room sits inside: the
 * clock, the ambiguity gauge, the station's floors, the audible strip, the
 * starter prompt, the manifest, the activity log, the notepad, and PILOT's own
 * controls.
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
 * - **Public copy**: the starter prompt, the legend, the room's name, the clock,
 *   which floors this session has, and the phase captions over the viewport.
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

import type { PilotView } from "@semaphore/protocol";
import type { Fader, StationAudio } from "./audio/index.js";
import type { SessionClient } from "./net/sessionClient.js";
import type { StationModel } from "./render/station.js";
import {
  LEGEND,
  MANIFEST_LINES,
  TIMER_URGENT_FRACTION,
  formatTimer,
  meterFill,
} from "./render/hud.js";
import { roomPlan, roomTitle } from "./render/chamber.js";
import { stationFloors } from "./render/floors.js";
import { CHANNEL_MARKER } from "./render/palette.js";

const STARTER_PROMPT =
  "You are KEEPER, maintenance intelligence of a derelict signal station. You cannot " +
  "see. I am PILOT and I can. Use your tools. Read your manual. Ask me what you need to " +
  "know. Don't guess when you can ask. Begin your shift.";

const CHROME_FLAG = "chrome://flags/#enable-webmcp-testing";

/** How many segments the ambiguity gauge in the rail is divided into. */
const GAUGE_SEGMENTS = 12;

/** Build one element, with text and attributes, in one call. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

/** A framed console panel, with its heading. Returns the body to fill. */
function panel(title: string, extra = ""): { section: HTMLElement; body: HTMLElement } {
  const section = el("section", { class: `panel ${extra}`.trim() });
  section.append(el("h2", {}, title));
  const body = el("div", { class: "panel-body" });
  section.append(body);
  return { section, body };
}

/**
 * The split lamp, drawn rather than set in type.
 *
 * One light source, two beams, and they never meet. That is the game, and it is
 * why the mark is worth the twenty lines: a judge watching four seconds of the
 * video sees the geometry of the thing before anybody explains the premise.
 *
 * Inline SVG so it costs no request, scales to any size, and takes its colours
 * from the same custom properties everything else on the page does. Below about
 * twenty pixels the beams are dropped and the bisected circle carries it alone,
 * which is the size a favicon has to work at.
 */
function lampMark(size: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "lamp-mark");

  const draw = (tag: string, attrs: Record<string, string>): SVGElement => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.append(node);
    return node;
  };

  if (size >= 20) {
    // The two beams, projecting in opposite directions and never overlapping.
    // Opaque enough to actually read against the page's near-black ground: at
    // the 0.28 the first pass used they were invisible in a screenshot, which
    // reduced the mark to a two-tone circle and lost the half of it that says
    // what the game is.
    draw("path", { d: "M13 10 L1 5 L1 27 L13 22 Z", fill: "var(--lamp)", opacity: "0.5" });
    draw("path", { d: "M19 10 L31 5 L31 27 L19 22 Z", fill: "var(--tide)", opacity: "0.5" });
  }

  // The lamp: a circle bisected vertically, one channel each side.
  draw("path", { d: "M16 5 A11 11 0 0 0 16 27 Z", fill: "var(--lamp)" });
  draw("path", { d: "M16 5 A11 11 0 0 1 16 27 Z", fill: "var(--tide)" });
  // The seam. One pixel of pearl down the middle: the shared channel, holding
  // the two apart.
  draw("rect", { x: "15.4", y: "4", width: "1.2", height: "24", fill: "var(--pearl)" });
  return svg;
}

/**
 * Copy text to the clipboard, reporting on the button itself.
 *
 * The starter prompt card is the single most important element on the page
 * (doc 04 section 2), and a copy button that silently does nothing on a browser
 * without clipboard permission would break exactly the interaction it exists to
 * make effortless. So the fallback is to select the text, which always works.
 */
function copyButton(label: string, source: () => string, target: HTMLElement): HTMLButtonElement {
  const button = el("button", { type: "button", class: "copy" }, label);
  button.addEventListener("click", () => {
    void navigator.clipboard
      .writeText(source())
      .then(() => {
        button.textContent = "Copied";
      })
      .catch(() => {
        const range = document.createRange();
        range.selectNodeContents(target);
        globalThis.getSelection()?.removeAllRanges();
        globalThis.getSelection()?.addRange(range);
        button.textContent = "Select and copy";
      });
  });
  return button;
}

/** The colour law, as a compact key rather than a panel. */
function legendRow(): HTMLElement {
  const list = el("ul", { class: "legend-row" });
  for (const row of LEGEND) {
    const item = el("li", { class: `chan-${row.channel}` });
    item.append(el("span", { class: "marker" }, row.marker), el("span", {}, row.text));
    list.append(item);
  }
  return list;
}

/**
 * The ablation, as three bars.
 *
 * Two of them are on the floor, and that is the entire thesis understood in one
 * second (doc 07 section 1). Numbers from `bench/results/ablation.md`: twenty
 * seeds, Standard difficulty, six seconds between agent calls.
 *
 * They are restated here rather than fetched, because this screen has to work
 * in a browser that cannot reach the worker and, for some judges, is the whole
 * submission. The report they come from is committed beside them and is
 * regenerated by one command, so the two can be checked against each other by
 * anybody who doubts them.
 */
const ABLATION: readonly {
  readonly who: string;
  readonly cleared: number;
  readonly note: string;
}[] = [
  { who: "Agent alone", cleared: 1.25, note: "0% escaped" },
  { who: "Human alone", cleared: 0, note: "0% escaped" },
  { who: "Together", cleared: 3.8, note: "90% escaped" },
];

function ablationChart(): HTMLElement {
  const { section, body } = panel("We ran it three ways");
  const chart = el("div", { class: "ablation" });
  for (const row of ABLATION) {
    const line = el("div", {
      class: `ablation-row ${row.who === "Together" ? "together" : ""}`.trim(),
    });
    const track = el("div", { class: "track" });
    const fill = el("i", {});
    fill.style.width = `${String((row.cleared / 4) * 100)}%`;
    track.append(fill);
    line.append(
      el("span", { class: "who" }, row.who),
      track,
      el("span", { class: "value" }, `${row.cleared.toFixed(2)} / 4`),
    );
    chart.append(line);
  }
  body.append(chart);
  body.append(
    el(
      "p",
      { class: "note" },
      "Chambers cleared of four, over twenty fixed seeds. The agent-alone row is a " +
        "ceiling rather than a sample: it plays a uniform draw from the worlds its own " +
        "view cannot tell apart, so no real model does better.",
    ),
  );
  return section;
}

/**
 * The screen a browser without WebMCP gets.
 *
 * For some judges this is the entire submission, so it carries the pitch, the
 * mark, the ablation, and the exact way in for both browsers that implement the
 * draft. It never appears as a consequence of a thrown error: `adapter.ts`
 * degrades to nulls so that reaching this screen is a decision rather than a
 * crash.
 */
export function renderGate(root: HTMLElement): void {
  root.replaceChildren();
  const main = el("main", { class: "gate" });

  const hero = el("section", { class: "hero" });
  const mark = el("div", { class: "hero-mark" });
  mark.append(lampMark(40));
  const words = el("div", {});
  words.append(
    el("p", { class: "eyebrow" }, "SEMAPHORE"),
    el("p", { class: "tagline" }, "TWO PROCESSES. ONE LOCK. DON'T DEADLOCK."),
  );
  mark.append(words);
  hero.append(
    mark,
    el("h1", {}, "This browser cannot reach the station."),
    el(
      "p",
      { class: "lede" },
      "Semaphore is a cooperative escape game for a human and their agent. You see the " +
        "rooms and can touch almost nothing. Your agent holds the manual, can reach every " +
        "mechanism, and cannot see. Neither of you gets out alone.",
    ),
    el(
      "p",
      {},
      "It is built on WebMCP: the agent plays through tools this page registers, and the " +
        "tools change as you move through the station. That needs a browser that implements " +
        "the draft. Two do.",
    ),
  );
  main.append(hero);

  const routes = el("div", { class: "routes" });

  const chrome = panel("Chrome 149 or newer");
  chrome.body.append(
    el("p", {}, "Open the flag below, enable WebMCP testing, relaunch, and return here."),
  );
  const flag = el("code", { class: "flag" }, CHROME_FLAG);
  chrome.body.append(
    flag,
    copyButton("Copy flag URL", () => CHROME_FLAG, flag),
  );

  const chatgpt = panel("The ChatGPT app");
  chatgpt.body.append(
    el(
      "p",
      {},
      "Open this page in the ChatGPT desktop app's in-app browser, on GPT-5.6 Sol or Terra. " +
        "Luna has site tools disabled and will land you back here.",
    ),
  );
  routes.append(chrome.section, chatgpt.section);

  const card = panel("Paste this to your agent once you are in");
  const prompt = el("blockquote", { class: "prompt" }, STARTER_PROMPT);
  card.body.append(
    prompt,
    copyButton("Copy prompt", () => STARTER_PROMPT, prompt),
  );

  const key = panel("Who perceives what");
  key.body.append(legendRow());
  key.body.append(
    el("p", { class: "note" }, "Every marked thing carries its shape as well as its colour."),
  );

  main.append(routes, card.section, ablationChart(), key.section);
  root.append(main);
}

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
const MIX_SLIDERS: readonly (readonly [Fader, string])[] = [
  ["master", "Master volume"],
  ["music", "Music volume"],
  ["sfx", "Mechanism volume"],
] as const;

/** The session lengths, and what each one is, for the button's tooltip. */
const BEGIN_MODES: readonly (readonly [string, string])[] = [
  ["full", "Four chambers and the Archive. The whole shift."],
  ["brief", "Three chambers. Chamber II is skipped."],
  ["practice", "The full station, untimed."],
] as const;

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
  const room = el("span", { class: "room" }, "CONNECTING");
  const resets = el("span", { class: "resets" });

  // The ambiguity gauge, beside the clock because it is a headline number.
  // Segmented rather than continuous: information arrives in discrete quanta
  // and doc 06 section 7 asks for a meter that ratchets rather than slides.
  const gauge = el("div", { class: "gauge" });
  const gaugeTrack = el("div", { class: "gauge-track" });
  const segments = Array.from({ length: GAUGE_SEGMENTS }, () => el("i", {}));
  gaugeTrack.append(...segments);
  const bits = el("span", { class: "gauge-bits" }, "-");
  gauge.append(el("span", { class: "gauge-label" }, "AMBIGUITY"), gaugeTrack, bits);

  const clock = el("span", { class: "clock" }, "--:--");
  rail.append(mark, room, resets, gauge, clock);

  // ---- Left: the room, what it sounds like, the station, and PILOT's hands.
  const left = el("main", { class: "bay bay-stage" });

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
    const target = event.target;
    // Never while typing on the shared notepad.
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return;
    toggleFullscreen();
  };
  globalThis.addEventListener("keydown", onKey);
  viewport.append(fullscreen);

  // The start card, over the room, until there is a session.
  const launch = el("div", { class: "launch" });
  launch.append(el("h3", {}, "Start the shift"));
  const modes = el("div", { class: "launch-modes" });
  for (const [mode, blurb] of BEGIN_MODES) {
    const button = el("button", { type: "button" }, mode);
    button.title = blurb;
    button.addEventListener("click", () => {
      // The gesture. Every browser refuses an AudioContext that was not opened
      // by a click, and refuses it silently, so this is where the station's
      // sound comes up: the one click that is guaranteed to happen before
      // there is anything to hear.
      deps.audio.start();
      // Practice is a difficulty, not a mode: doc 02 section 7 makes it the
      // untimed preset of a full session rather than a shorter one.
      const body =
        mode === "practice"
          ? { difficulty: "practice", mode: "full" }
          : { difficulty: "standard", mode };
      void deps.client.post("start", body).then((response) => {
        deps.onNote(`start ${mode}: ${response.text}`);
      });
    });
    modes.append(button);
  }
  launch.append(
    modes,
    el(
      "p",
      { class: "note" },
      "Your agent opens the door. Paste it the prompt on the right first.",
    ),
  );
  viewport.append(launch);

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
  for (const [key, label] of MIX_SLIDERS) {
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
    mixer.append(slider);
  }

  const underdeck = el("div", { class: "underdeck" });

  const station = panel("The station");
  const floorList = el("ol", { class: "floors", "data-empty": "OUTSIDE THE STATION" });
  station.body.append(floorList, legendRow());

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

  underdeck.append(station.section, controls.section);
  left.append(viewport, audible, mixer, underdeck);

  // ---- Right: KEEPER's surface, and the one surface they share. -----------
  const right = el("aside", { class: "bay bay-right" });

  const card = panel("Your agent");
  const prompt = el("blockquote", { class: "prompt" }, STARTER_PROMPT);
  card.body.append(
    prompt,
    copyButton("Copy prompt", () => STARTER_PROMPT, prompt),
    el("p", { class: "note" }, "No response? Ask it: what tools does this page give you?"),
  );

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

  right.append(card.section, manifestPanel.section, logPanel.section, padPanel.section);

  // Out of the flow entirely: an empty container for the archive frame, which
  // is hidden and zero-sized when it exists at all.
  const archiveHost = el("div", { class: "archive-host", "aria-hidden": "true" });

  console_.append(rail, left, right, archiveHost);
  root.append(console_);

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

  return {
    stage: viewport,
    notepadHost,
    archiveHost,

    update(model: StationModel) {
      const view = model.view;
      const remaining = view?.remainingMs ?? model.state?.remainingMs ?? null;
      const phase = view?.phase ?? model.state?.phase ?? null;

      room.textContent = view ? roomTitle(view) : (phase ?? "CONNECTING");
      clock.textContent = formatTimer(remaining);
      const total = model.chamberTimerMs;
      clock.classList.toggle(
        "urgent",
        total > 0 && remaining !== null && remaining / total < TIMER_URGENT_FRACTION,
      );
      resets.textContent = view && view.retries > 0 ? `RESETS ${String(view.retries)}` : "";

      // The start card is the only thing worth touching before a session
      // exists, and three buttons that can no longer do anything afterwards.
      launch.hidden = phase !== null && phase !== "ENTRY" && phase !== "LOBBY";

      paintFloors(floorList, view);
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
 * Replace a list's contents.
 *
 * Rebuilding rather than diffing. These lists are at most a dozen short rows and
 * are repainted only when the model actually changes, which is a few times a
 * minute; a keyed diff would be more code than the thing it optimises. The
 * manifest is the exception, and it is handled above, because it is the one list
 * whose *changing* is the thing being demonstrated.
 */
function fill<T>(list: HTMLElement, items: readonly T[], make: (item: T) => HTMLElement): void {
  list.replaceChildren(...items.map(make));
}

/**
 * The station's floors, as the only progress display the console has.
 *
 * Every floor is listed from the first minute, including the ones not reached
 * yet, because knowing the station has a Concord Lock in it is part of knowing
 * what you are in for.
 */
function paintFloors(list: HTMLElement, view: PilotView | null): void {
  if (!view) {
    list.replaceChildren();
    return;
  }
  fill(list, stationFloors(view), (floor) => {
    const classes = ["floor"];
    if (floor.active) classes.push("here");
    if (floor.cleared) classes.push("cleared");
    const item = el("li", { class: classes.join(" ") });
    item.append(
      el("span", { class: "pip" }, floor.cleared ? "+" : floor.active ? ">" : "-"),
      el("span", {}, floor.name),
    );
    return item;
  });
}
