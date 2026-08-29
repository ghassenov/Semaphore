/**
 * The DOM around the canvas: the gate screen, and the station console.
 *
 * Two surfaces live here. The **gate screen**, shown to a browser with no
 * WebMCP, and the **console**, which is the frame the canvas sits in: the
 * clock, the station's floor list, the ambiguity meter, the audible strip, the
 * activity log, the notepad, the manifest plate, the legend, and PILOT's
 * controls.
 *
 * Most of that used to be drawn on the canvas, in six panels packed into the
 * seventy pixels above and below the room, at an estimated 4.8 pixels per
 * character (D-036). It is DOM now for three reasons: the room got the whole
 * canvas back, a browser measures its own text better than a constant can, and
 * every one of those panels is now selectable and reachable by a screen reader,
 * which none of them was as pixels.
 *
 * **The rule that governs what may move here has not changed.** Puzzle-critical
 * visuals render to canvas, never to DOM, because a DOM text node holding a
 * glyph is a text node an agent with page access can scrape. Everything on the
 * console passes that test for one of three reasons, and each was checked
 * individually:
 *
 * - **Public copy**: the starter prompt, the legend, the room's name, the
 *   clock, which floors this session has.
 * - **KEEPER's own**: the manifest is the registry KEEPER can enumerate for
 *   itself; a log line is a call KEEPER just made, with its arguments already
 *   stripped.
 * - **`SHARED` or `AUDIBLE` by construction**: the notepad, which is the one
 *   surface both parties write to, and the sound, which both parties perceive
 *   and which is therefore the one thing PILOT never has to describe.
 *
 * What stays on the canvas is everything `VISUAL`: the glyphs on the levers,
 * the needle values, the cipher offset, the state of the manual page. If a
 * change ever wants one of those out here, the change is wrong.
 */

import type { PilotView } from "@semaphore/protocol";
import type { SessionClient } from "./net/sessionClient.js";
import type { StationModel } from "./render/station.js";
import {
  LEGEND,
  MANIFEST_LINES,
  TIMER_URGENT_FRACTION,
  formatTimer,
  meterFill,
} from "./render/hud.js";
import { roomPlan, roomTitle } from "./render/room.js";
import { stationFloors } from "./render/floors.js";

const STARTER_PROMPT =
  "You are KEEPER, maintenance intelligence of a derelict signal station. You cannot " +
  "see. I am PILOT and I can. Use your tools. Read your manual. Ask me what you need to " +
  "know. Don't guess when you can ask. Begin your shift.";

const CHROME_FLAG = "chrome://flags/#enable-webmcp-testing";

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
 * Copy text to the clipboard, reporting on the button itself.
 *
 * The starter prompt card is the single most important element on the page
 * (doc 04 section 2), and a copy button that silently does nothing on a
 * browser without clipboard permission would break exactly the interaction it
 * exists to make effortless. So the fallback is to select the text, which
 * always works.
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

/**
 * The screen a browser without WebMCP gets.
 *
 * For some judges this is the entire submission, so it carries the pitch and
 * the exact way to get in, for both browsers that support the draft. It never
 * appears as a consequence of a thrown error: `adapter.ts` degrades to nulls
 * so that reaching this screen is a decision rather than a crash.
 */
export function renderGate(root: HTMLElement): void {
  root.replaceChildren();
  const main = el("main", { class: "gate" });

  const hero = el("section", { class: "hero" });
  hero.append(
    el("p", { class: "eyebrow" }, "SEMAPHORE"),
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

  const chrome = panel("Chrome 149 or newer", "route");
  chrome.body.append(
    el("p", {}, "Open the flag below, enable WebMCP testing, relaunch, and return here."),
  );
  const flag = el("code", { class: "flag" }, CHROME_FLAG);
  chrome.body.append(
    flag,
    copyButton("Copy flag URL", () => CHROME_FLAG, flag),
  );

  const chatgpt = panel("The ChatGPT app", "route");
  chatgpt.body.append(
    el(
      "p",
      {},
      "Open this page in the ChatGPT desktop app's in-app browser, on GPT-5.6 Sol or Terra. " +
        "Luna has site tools disabled and will land you back here.",
    ),
  );
  routes.append(chrome.section, chatgpt.section);

  const card = panel("Paste this to your agent once you are in", "card");
  const prompt = el("blockquote", { class: "prompt" }, STARTER_PROMPT);
  card.body.append(
    prompt,
    copyButton("Copy prompt", () => STARTER_PROMPT, prompt),
  );

  main.append(routes, card.section, legendPanel());
  root.append(main);
}

/** The colour law, permanently on screen, as teaching material. */
function legendPanel(): HTMLElement {
  const { section, body } = panel("Who perceives what", "legend");
  const list = el("ul", {});
  for (const row of LEGEND) {
    const item = el("li", { class: `chan-${row.channel}` });
    item.append(el("span", { class: "marker" }, row.marker), el("span", {}, row.text));
    list.append(item);
  }
  body.append(list);
  // The marker is not decoration. Roughly one player in twelve cannot separate
  // the amber from the bone reliably, and a puzzle that is unplayable for them
  // is a puzzle we got wrong.
  body.append(
    el("p", { class: "note" }, "Every marked thing carries its shape as well as its colour."),
  );
  return section;
}

/** Everything the console needs to drive PILOT's half of the session. */
export interface ShellDeps {
  readonly client: SessionClient;
  /** Called after PILOT acts, so the caller can put the answer in the log. */
  readonly onNote: (line: string) => void;
}

/** What `main.ts` gets back: where to mount things, and how to feed the console. */
export interface ShellHandle {
  /** The element the Phaser canvas is created inside. */
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
 * The console: the canvas, and every readout around it.
 *
 * Laid out as a station terminal rather than as a document. Three bays: the
 * station's own state on the left, the room in the middle, KEEPER's on the
 * right. That arrangement is the game's thesis as furniture - what the human
 * perceives and what the agent can do are two different surfaces, side by side,
 * with the room between them.
 */
export function renderStation(root: HTMLElement, deps: ShellDeps): ShellHandle {
  root.replaceChildren();
  const console_ = el("div", { class: "console" });

  // ---- The top rail: who we are, where we are, how long we have. ----------
  const rail = el("header", { class: "rail" });
  const room = el("span", { class: "room" }, "CONNECTING");
  const clock = el("span", { class: "clock" }, "--:--");
  const resets = el("span", { class: "resets" });
  rail.append(el("span", { class: "mark" }, "SEMAPHORE"), room, resets, clock);

  // ---- Left bay: the station, and how much is still unknown. --------------
  const left = el("aside", { class: "bay bay-left" });
  const station = panel("Station");
  const floorList = el("ol", { class: "floors", "data-empty": "OUTSIDE THE STATION" });
  station.body.append(floorList);

  const meterPanel = panel("Remaining ambiguity");
  const meterTrack = el("div", { class: "meter" });
  const meterFillEl = el("i", {});
  meterTrack.append(meterFillEl);
  const bits = el("p", { class: "bits" }, "-");
  meterPanel.body.append(meterTrack, bits);
  // The server cannot hear the pair talk, so the meter does not move when
  // PILOT merely explains something (doc 02 section 5). Saying so on the panel
  // is cheaper than letting a playtester conclude the meter is broken.
  meterPanel.body.append(
    el("p", { class: "note" }, "Moves when the world does, not when you talk."),
  );

  left.append(station.section, meterPanel.section, legendPanel());

  // ---- Middle bay: the room, what it sounds like, and what PILOT can do. ---
  const middle = el("main", { class: "bay bay-stage" });
  // The frame and the mount point are two elements, deliberately. Phaser sizes
  // its canvas from the parent's *border* box, so a border on the element it
  // mounts into is invisible to it: it scales to the full 672, overflows the
  // frame, and lands on a fractional 2.1x. The frame therefore goes on a
  // wrapper and the mount point is left as an unadorned square.
  const stageFrame = el("div", { class: "stage-frame" });
  const stage = el("div", { class: "stage" });
  stageFrame.append(stage);
  const audible = el("p", { class: "audible", "aria-live": "polite" });

  const begin = panel("Start the shift", "controls");
  for (const [mode, blurb] of BEGIN_MODES) {
    const button = el("button", { type: "button" }, mode);
    button.title = blurb;
    button.addEventListener("click", () => {
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
    begin.body.append(button);
  }

  const controls = panel("Your hands", "controls");
  // The asymmetry from the human's side. None of these is a tool, however
  // convenient a `retry_chamber` tool would be: an agent cannot grip a bar it
  // has no body for, and it cannot restart a chamber it cannot see.
  controls.body.append(
    el(
      "p",
      { class: "note" },
      "Only you can do these. None of them is a tool your agent can call.",
    ),
  );
  for (const [label, action] of PILOT_ACTIONS) {
    const button = el("button", { type: "button" }, label);
    button.addEventListener("click", () => {
      void deps.client.post(action).then((response) => {
        deps.onNote(`${label}: ${response.text}`);
      });
    });
    controls.body.append(button);
  }
  // The two things PILOT does with the keyboard rather than with a button.
  // Both belong in this panel for the same reason the buttons do: they are
  // the human's body, and no tool in the manifest reaches them.
  controls.body.append(
    el(
      "p",
      { class: "note" },
      "A and D walk you across the room. Hold M to step back and see the whole station.",
    ),
  );
  middle.append(stageFrame, audible, begin.section, controls.section);

  // ---- Right bay: KEEPER's surface, and the one surface they share. -------
  const right = el("aside", { class: "bay bay-right" });

  const card = panel("Paste this to your agent", "card");
  const prompt = el("blockquote", { class: "prompt" }, STARTER_PROMPT);
  card.body.append(
    prompt,
    copyButton("Copy prompt", () => STARTER_PROMPT, prompt),
    el("p", { class: "note" }, "No response? Ask it: what tools does this page give you?"),
  );

  const manifestPanel = panel("Manifest");
  const manifestCount = el("span", { class: "count" }, "0");
  manifestPanel.section.querySelector("h2")?.append(manifestCount);
  const manifest = el("ol", { class: "manifest", "data-empty": "NO TOOLS REGISTERED" });
  manifestPanel.body.append(manifest);
  // The plate exists to prove the toolchange animation is not a lie: it is
  // drawn from the page's own `getTools()`, never from a record of what was
  // meant to be registered.
  manifestPanel.body.append(
    el("p", { class: "note" }, "What your agent can do right now. It changes as you move."),
  );

  const logPanel = panel("Activity");
  const log = el("ol", { class: "log", "data-empty": "NOTHING YET" });
  logPanel.body.append(log);

  const padPanel = panel("Notepad", "notepad");
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

  console_.append(rail, left, middle, right, archiveHost);
  root.append(console_);

  /**
   * The most ambiguity seen in the current room, for the meter's scale.
   *
   * Held here rather than on the model because it is a property of the
   * display: the absolute bit count is not comparable across chambers, so the
   * meter reads against the room's own high-water mark.
   */
  let peakBits = 0;
  let peakChamber: string | null = null;

  return {
    stage,
    notepadHost,
    archiveHost,

    update(model: StationModel) {
      const view = model.view;
      const remaining = view?.remainingMs ?? model.state?.remainingMs ?? null;

      room.textContent = view ? roomTitle(view) : (model.state?.phase ?? "CONNECTING");
      clock.textContent = formatTimer(remaining);
      const total = model.chamberTimerMs;
      clock.classList.toggle(
        "urgent",
        total > 0 && remaining !== null && remaining / total < TIMER_URGENT_FRACTION,
      );
      resets.textContent = view && view.retries > 0 ? `RESETS ${String(view.retries)}` : "";

      paintFloors(floorList, view);
      paintMeter();
      audible.textContent = view ? (roomPlan(view)?.sound?.toUpperCase() ?? "") : "";

      manifestCount.textContent = String(model.tools.length);
      fill(manifest, model.tools.slice(0, MANIFEST_LINES), (tool) =>
        el("li", { class: "tool" }, tool),
      );
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

      function paintMeter(): void {
        const chamber = view?.chamber ?? null;
        if (chamber !== peakChamber) {
          peakChamber = chamber;
          peakBits = 0;
        }
        // A reading from a room the pair has already left is not stale, it is
        // wrong, so it is discarded rather than drawn.
        const current = model.concord?.chamber === chamber ? model.concord : null;
        if (current?.bits != null) peakBits = Math.max(peakBits, current.bits);
        meterFillEl.style.width = `${String(meterFill(current?.bits ?? null, peakBits) * 100)}%`;
        bits.textContent =
          current?.bits == null ? "NOT MEASURED" : `${current.bits.toFixed(2)} BITS`;
      }
    },

    dispose() {
      root.replaceChildren();
    },
  };
}

/**
 * Replace a list's contents.
 *
 * Rebuilding rather than diffing. These lists are at most a dozen short rows
 * and are repainted only when the model actually changes, which is a few times
 * a minute; a keyed diff would be more code than the thing it optimises.
 */
function fill<T>(list: HTMLElement, items: readonly T[], make: (item: T) => HTMLElement): void {
  list.replaceChildren(...items.map(make));
}

/**
 * The station's floors, as the only progress display the game has.
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

/** The session lengths, and what each one is, for the button's tooltip. */
const BEGIN_MODES: readonly (readonly [string, string])[] = [
  ["full", "Four chambers and the Archive. The whole shift."],
  ["brief", "Three chambers. Chamber II is skipped."],
  ["practice", "The full station, untimed."],
] as const;

/**
 * The things only PILOT can do, none of which is a tool.
 *
 * This list is the asymmetry from the other side. An agent cannot grip a bar
 * it has no body for, and it cannot restart a chamber it cannot see, so these
 * stay off the registry however convenient a `retry_chamber` tool would be.
 */
const PILOT_ACTIONS: readonly (readonly [string, string])[] = [
  ["grip the release bar", "grip_bar"],
  ["let go of the bar", "release_bar"],
  ["leave the archive", "leave_archive"],
  ["reset the chamber", "retry_chamber"],
] as const;
