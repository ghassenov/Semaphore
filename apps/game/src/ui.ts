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

import { CHAMBER_NAMES, type PilotView } from "@semaphore/protocol";
import type { Fader, StationAudio } from "./audio/index.js";
import { startChamberFrom, type SessionClient } from "./net/sessionClient.js";
import { replayUrl } from "./replay.js";
import type { StationModel } from "./render/station.js";
import {
  LEGEND,
  MANIFEST_LINES,
  TIMER_URGENT_FRACTION,
  formatTimer,
  isTypingTarget,
  meterFill,
} from "./render/hud.js";
import { roomPlan, roomTitle } from "./render/chamber.js";
import { FLOOR_NAMES, activeFloor, stationFloors, type FloorId } from "./render/floors.js";
import { CHANNEL, CHANNEL_MARKER, hex } from "./render/palette.js";
import { describeRoom } from "./render/mirror.js";
import { TAIL_MS } from "./render/ghost.js";
import { GLYPHS, glyphCanvas } from "./render/glyphs.js";
import { paintMonitor } from "./render/monitor.js";
import type { GhostTrack } from "@semaphore/protocol";

const STARTER_PROMPT =
  "You are KEEPER, maintenance intelligence of a derelict signal station. You cannot " +
  "see. I am PILOT and I can. Use your tools. Read your manual. Ask me what you need to " +
  "know. Don't guess when you can ask. Begin your shift.";

const CHROME_FLAG = "chrome://flags/#enable-webmcp-testing";

/**
 * What KEEPER is told about the lever PILOT is looking at, near enough.
 *
 * Lifted in shape from `views.ts`'s own `describeChamber`, not invented: the
 * landing screen's whole job is to show the split honestly, and a prettier
 * sentence than the agent really gets would be a sales pitch for a different
 * game. The one thing it may not contain is the glyph's name, for exactly the
 * reason the game may not: naming it is PILOT's half of the work.
 */
const KEEPER_SIDE = [
  "THE AIRLOCK. A cramped chamber, ankle-deep in cold water.",
  "Three levers on the far wall: lever_a down, lever_b upright, lever_c upright.",
  "Pulled so far: none.",
  "You cannot see what is lit above them. PILOT can. Ask.",
].join(" ");

/** How many segments the ambiguity gauge in the rail is divided into. */
const GAUGE_SEGMENTS = 12;

/**
 * The two halves of the game, side by side, on the screen that has to sell it.
 *
 * This is the thesis as a picture rather than as a paragraph: the *same* lever,
 * rendered the two ways the two players receive it. The left is drawn with the
 * game's own `glyphCanvas`, so it is the actual mark from the actual chamber
 * and not an illustration of one; the right is the shape of text the agent
 * actually gets.
 *
 * **The glyph is a canvas and it is never named.** Both are the same rule the
 * chambers run on: a text node holding a glyph is one an agent with page access
 * can scrape, and a lever captioned "spiral" deletes the puzzle. Here that rule
 * is also the argument - the point being made is that this shape only becomes
 * words if a person makes them.
 */
function heroSplit(): HTMLElement {
  const split = el("div", { class: "split" });

  const seen = el("figure", { class: "half half-pilot" });
  seen.append(el("figcaption", { class: "half-who" }, "WHAT YOU SEE"));
  const plate = el("div", { class: "half-plate" });
  const mark = glyphCanvas(GLYPHS.spiral ?? [], 7);
  // Tinted to PILOT's own channel, the same way `kit.glyphPlane` tints it in
  // the station. `glyphCanvas` draws white on purpose so the caller decides
  // the channel, and leaving it white here would have said "both of you can
  // see this" on the one graphic whose entire argument is that only one of
  // you can. `source-in` keeps the mark's shape and replaces its colour.
  const ink = mark.getContext("2d");
  if (ink) {
    ink.globalCompositeOperation = "source-in";
    ink.fillStyle = hex(CHANNEL.pilot.key);
    ink.fillRect(0, 0, mark.width, mark.height);
  }
  mark.className = "half-glyph";
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", "a mark on a plate, which only you can see");
  plate.append(mark);
  seen.append(
    plate,
    el("p", { class: "half-note" }, "A mark above one lever. You will have to put it into words."),
  );

  const told = el("figure", { class: "half half-keeper" });
  told.append(el("figcaption", { class: "half-who" }, "WHAT YOUR AGENT GETS"));
  told.append(
    el("div", { class: "half-tool" }, KEEPER_SIDE),
    el(
      "p",
      { class: "half-note" },
      "Every lever feels the same. It can pull them. It cannot look.",
    ),
  );

  split.append(seen, el("div", { class: "split-seam" }, "AND"), told);
  return split;
}

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
  // The confirmation is announced, not just shown. This button's whole job is
  // to be pressed once, by somebody who is about to switch to another window,
  // and a state change that only exists as a colour tells a screen reader
  // nothing about whether the thing they came for actually happened.
  button.setAttribute("aria-live", "polite");
  let restore = 0;

  /** Say what happened, then go back to being an offer. */
  function report(text: string, ok: boolean): void {
    button.textContent = text;
    button.classList.toggle("done", ok);
    globalThis.clearTimeout(restore);
    // It returns to its label rather than staying "Copied" for the rest of the
    // session: a button stuck on its own past tense stops reading as something
    // that can be pressed again, and a paste that went to the wrong window is
    // exactly when somebody needs to press it again.
    restore = globalThis.setTimeout(() => {
      button.textContent = label;
      button.classList.remove("done");
    }, 2400);
  }

  button.addEventListener("click", () => {
    void navigator.clipboard
      ?.writeText(source())
      .then(() => {
        report("Copied", true);
      })
      .catch(() => {
        // Clipboard access can be refused outright, and a button that silently
        // fails is worse than one that hands the job back. Selecting the text
        // leaves the reader one keystroke from the same result.
        const range = document.createRange();
        range.selectNodeContents(target);
        globalThis.getSelection()?.removeAllRanges();
        globalThis.getSelection()?.addRange(range);
        report("Selected - press Ctrl+C", false);
      });
  });
  return button;
}

/** The colour law, as a compact key rather than a panel. */
/**
 * The starter prompt, as a station requisition slip.
 *
 * **This is the single most important UI element in the project** (doc 02
 * section 12, doc 04 section 2, doc 07 section 4): it is the thing that makes
 * an agent engage at all, and it is on the never-cut list in the repo
 * `CLAUDE.md`. Doc 04 asks for it "styled as a station requisition slip, with a
 * copy button", carrying the prompt and a one-line fallback for the case where
 * the agent still does not bite.
 *
 * ## One builder, two places
 *
 * It appears on the gate screen and in the console's YOUR AGENT drawer. Those
 * were two hand-assembled copies, and they had already drifted: the gate's had
 * no fallback line at all, which is the half of the card that rescues the
 * interaction the other half failed to start. Building both from here is what
 * stops the most important element in the project being the one nobody
 * notices is wrong in one of its two homes.
 *
 * ## Why a slip rather than a quote block
 *
 * The prompt is a thing the station issues, not a thing the page says. Drawn as
 * a form it reads that way: a torn top edge, a form number, a ruled ISSUE TO
 * field naming KEEPER, the prompt typed into the body, and the split lamp
 * stamped across the foot. All of it is CSS and the mark's existing SVG, so it
 * costs no asset file (D-044) and no colour outside the locked set - the paper
 * is pearl mixed down into the ink, which is what a form looks like under a
 * sodium lamp rather than what it looks like in daylight.
 *
 * The prompt itself stays in the UI sans rather than the monospace the rest of
 * the form furniture uses. Doc 06 reserves the monospace for identifiers and
 * figures, and this is neither: it is the most-read paragraph in the project,
 * and legibility beats the typewriter conceit.
 */
function promptCard(): HTMLElement {
  const slip = el("section", { class: "slip" });

  const head = el("div", { class: "slip-head" });
  head.append(
    el("span", { class: "slip-title" }, "STATION REQUISITION"),
    el("span", { class: "slip-form" }, "FORM 14-B"),
  );

  // The field that says what is being requisitioned. In fiction the station is
  // asking for an operator; in fact it is telling the human what to paste.
  const field = el("div", { class: "slip-field" });
  field.append(
    el("span", { class: "slip-label" }, "ISSUE TO"),
    el("span", { class: "slip-value" }, "KEEPER"),
  );

  const heading = el("p", { class: "slip-heading" }, "Paste this to your KEEPER");
  const prompt = el("blockquote", { class: "prompt" }, STARTER_PROMPT);

  const foot = el("div", { class: "slip-foot" });
  // The stamp. Decorative, and marked so: a screen reader reading "authorised"
  // out of a rubber stamp adds nothing a player can act on.
  const stamp = el("span", { class: "slip-stamp", "aria-hidden": "true" });
  stamp.append(lampMark(22), el("span", {}, "AUTHORISED"));
  foot.append(
    copyButton("Copy prompt", () => STARTER_PROMPT, prompt),
    stamp,
  );

  slip.append(
    head,
    field,
    heading,
    prompt,
    foot,
    // Doc 04 section 2 asks for this line by name, and it belongs on both
    // copies: it is the recovery path for the failure the card exists to
    // prevent, and an agent that does not bite is the commonest one.
    el(
      "p",
      { class: "note slip-note" },
      "If your agent does not respond, ask it: what tools does this page give you?",
    ),
  );
  return slip;
}

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
 * A recorded session, playing on a canvas: SPECTATE, and attract mode.
 *
 * Doc 08 phase 4 asks for two things that turn out to be one thing. A judge
 * who never types anything should still be shown the game (SPECTATE), and a
 * landing screen nobody has touched for twenty seconds should start showing it
 * by itself (attract mode). Both are a recording of a session, and the station
 * already has a surface that plays one: the Archive's monitor. `monitor.ts` is
 * that surface's drawing routine, lifted out so this can be the same picture
 * rather than a second drawing of it.
 *
 * **It costs the gate screen nothing.** The painter reaches `ghost.ts`,
 * `plan.ts` and the palette, and none of those import Three.js, so a browser
 * that cannot play the game still does not fetch the 143KB engine to be shown
 * it. `scripts/check-bundle.mjs` is what keeps that true.
 *
 * The recording loops with its own tail on the end, because the tail is the
 * beat: the ghost is holding a bar that they could not hold, and cutting
 * straight back to the start reads as a loop rather than as an ending.
 */
function ghostScreen(): { element: HTMLElement; play: () => void; stop: () => void } {
  const canvas = el("canvas", { class: "ghost-screen" });
  canvas.width = 384;
  canvas.height = 252;
  // A recording is not the page's content, and a screen reader reading a
  // scrub bar frame by frame is noise. The caption below it carries the fact.
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "A recording of a previous shift, playing.");

  let track: GhostTrack | null = null;
  let raf = 0;
  let startedAt = 0;

  // One fetch per page. The track is a projection of a constant fixture, and
  // both callers here are on the same page.
  loadGhost()
    .then((loaded) => {
      track = loaded;
    })
    .catch(() => {
      // A gate screen that cannot reach the worker still has a gate screen.
      // NO TAPE is what `paintMonitor` draws for a null track, and it is a
      // prop rather than an error, which is the right thing to show here.
      track = null;
    });

  function tick(now: number): void {
    startedAt ||= now;
    const span = (track?.durationMs ?? 0) + TAIL_MS;
    paintMonitor(canvas, track, span > 0 ? (now - startedAt) % span : 0);
    raf = globalThis.requestAnimationFrame(tick);
  }

  return {
    element: canvas,
    play: () => {
      if (raf !== 0) return;
      startedAt = 0;
      raf = globalThis.requestAnimationFrame(tick);
    },
    stop: () => {
      if (raf === 0) return;
      globalThis.cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

/**
 * The recorded session both attract mode and SPECTATE play.
 *
 * `/ghost` is the worker's one route with no session behind it, because the
 * gate screen has no session and cannot start one. The origin comes from the
 * environment like every other origin in this client (repo CLAUDE.md section
 * 3); empty means same-origin, which in development is the Vite proxy.
 */
async function loadGhost(): Promise<GhostTrack | null> {
  const origin = import.meta.env.VITE_WORKER_ORIGIN ?? "";
  const response = await fetch(`${origin}/ghost`);
  if (!response.ok) return null;
  return (await response.json()) as GhostTrack | null;
}

/**
 * How long the landing screen waits before it starts playing by itself.
 *
 * Doc 08 phase 4's number. Long enough that it never interrupts somebody
 * reading the start card, short enough that a judge who walked away from the
 * tab comes back to the game rather than to a menu.
 */
const ATTRACT_AFTER_MS = 20_000;

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

  // The slip carries its own heading, so it is not wrapped in a panel: two
  // headings over one card is the "BACK TO AIRLOCK printed across PAGE MARKED"
  // shape (D-054), one level up.
  const card = promptCard();

  const key = panel("Who perceives what");
  key.body.append(legendRow());
  key.body.append(
    el("p", { class: "note" }, "Every marked thing carries its shape as well as its colour."),
  );

  // SPECTATE. For some judges this screen is the whole submission, and until
  // now it described a game without ever showing one.
  //
  // Behind a button rather than autoplaying: this screen is read, not watched,
  // and a canvas that starts moving under a paragraph somebody is reading is
  // the thing attract mode is allowed to do on the landing screen and this is
  // not that screen.
  const watch = panel("Watch a shift instead");
  const screen = ghostScreen();
  screen.element.hidden = true;
  const spectate = el("button", { type: "button", class: "spectate" }, "SPECTATE");
  spectate.addEventListener("click", () => {
    const playing = !screen.element.hidden;
    screen.element.hidden = playing;
    spectate.textContent = playing ? "SPECTATE" : "STOP";
    if (playing) screen.stop();
    else screen.play();
  });
  watch.body.append(
    el(
      "p",
      {},
      "A recording of a previous pair, from the station's own log. It is the same " +
        "picture the Archive's monitor plays inside the game.",
    ),
    spectate,
    screen.element,
  );

  main.append(routes, card, watch.section, ablationChart(), key.section);
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

/** The session lengths, and what each one is, for the button's tooltip. */
const BEGIN_MODES: readonly (readonly [string, string])[] = [
  ["full", "Four chambers and the Archive. The whole shift."],
  ["brief", "Three chambers. Chamber II is skipped."],
  ["practice", "The full station, untimed."],
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

  // The start card, over the room, until there is a session.
  const launch = el("div", { class: "launch" });
  const sheet = el("div", { class: "launch-card" });
  launch.append(sheet);

  // The identity, then the thesis, then the proof of the thesis. In that order
  // because somebody who has just arrived does not yet know what this is, and
  // the old card opened with three unlabelled buttons in an empty room.
  const badge = el("div", { class: "launch-badge" });
  badge.append(lampMark(34), el("p", { class: "launch-name" }, "SEMAPHORE"));
  sheet.append(
    badge,
    el(
      "h3",
      { class: "launch-thesis" },
      "An escape room for a human and an agent who cannot see the same room.",
    ),
    heroSplit(),
    el("p", { class: "launch-claim" }, "Neither of you gets out alone. That is measurable."),
  );
  // A `?chamber=` deep link, read once. The card says so rather than opening
  // three chambers in without explaining why: a judge who lands here from a
  // link should know they are being shown the middle of a session, and a
  // player who arrives by accident should know why the airlock is missing.
  const deepLink = startChamberFrom(globalThis.location.search);
  if (deepLink) {
    sheet.append(
      el(
        "p",
        { class: "note deep-link" },
        `This link opens at ${CHAMBER_NAMES[deepLink]}. Everything before it is already done.`,
      ),
    );
  }
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
      const body = {
        ...(mode === "practice"
          ? { difficulty: "practice", mode: "full" }
          : { difficulty: "standard", mode }),
        // `?chamber=N`, if the URL carried one. The server drops a name it
        // does not know, so a mistyped parameter starts a normal session.
        ...(deepLink ? { chamber: deepLink } : {}),
      };
      void deps.client.post("start", body).then((response) => {
        deps.onNote(`start ${mode}: ${response.text}`);
      });
    });
    modes.append(button);
  }
  sheet.append(
    el("p", { class: "launch-go" }, "START THE SHIFT"),
    modes,
    el(
      "p",
      { class: "note" },
      "Your agent opens the door. Paste it the prompt from YOUR AGENT first.",
    ),
  );

  // The ablation, on the landing screen and folded away (doc 08 phase 4).
  //
  // A `<details>` rather than a scroll position, because the console is a deck
  // that fills the viewport and has no fold to be under. It is the argument
  // for why the game needs two players at all, so it belongs where somebody
  // deciding whether to start one will meet it, and closed, because somebody
  // who has already decided should not have to scroll past it.
  const why = el("details", { class: "why" });
  why.append(el("summary", {}, "Why does this need two of you?"), ablationChart());
  sheet.append(why);

  // Attract mode: after twenty seconds of nothing, the start card starts
  // playing a shift (doc 08 phase 4).
  //
  // The same recording SPECTATE plays on the gate screen and the same painter
  // the Archive's monitor uses. It never survives a keystroke, a click or a
  // pointer move, and it never starts under `prefers-reduced-motion`, where a
  // page that begins animating on its own is precisely the thing being asked
  // about.
  const attract = ghostScreen();
  attract.element.hidden = true;
  launch.append(attract.element);
  const stillness = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  let idleTimer = 0;
  function stopAttract(): void {
    if (!attract.element.hidden) {
      attract.element.hidden = true;
      attract.stop();
    }
  }
  function restartIdle(): void {
    stopAttract();
    globalThis.clearTimeout(idleTimer);
    if (stillness || launch.hidden) return;
    idleTimer = globalThis.setTimeout(() => {
      // Only over the start card. Once a shift is running the room is the
      // thing to look at and a recording over it would be a second station.
      if (launch.hidden) return;
      attract.element.hidden = false;
      attract.play();
    }, ATTRACT_AFTER_MS);
  }
  for (const event of ["keydown", "pointerdown", "pointermove"] as const) {
    globalThis.addEventListener(event, restartIdle, { passive: true });
  }
  restartIdle();

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
  ending.append(
    el(
      "p",
      { class: "note" },
      "The whole shift is on the station's log: what you did, what your agent " +
        "called, and the ambiguity between you.",
    ),
    replayLink,
  );
  viewport.append(ending);

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
  east.open("Your agent");
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

  return {
    stage: viewport,
    notepadHost,
    archiveHost,

    update(model: StationModel) {
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

      // The start card is the only thing worth touching before a session
      // exists, and three buttons that can no longer do anything afterwards.
      launch.hidden = phase !== null && phase !== "ENTRY" && phase !== "LOBBY";
      // A recording playing over a room the pair is standing in would be a
      // second station. The card going away takes it with it.
      if (launch.hidden) stopAttract();

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
      if (launch.hidden && !handedOver) {
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
