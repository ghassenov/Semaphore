/**
 * The DOM around the canvas: the gate screen, and the station's page shell.
 *
 * Two surfaces live here: the **gate screen**, shown to a browser with no
 * WebMCP, and the **station shell**, which is the element the Phaser canvas
 * mounts into plus the handful of controls a canvas is the wrong surface for.
 *
 * **Nothing here renders a puzzle fact, and nothing here may start to.**
 * The client-side rule (see this app's CLAUDE.md) is that puzzle-critical
 * visuals go to canvas, never to DOM, because a DOM text node holding a glyph
 * is a text node an agent with page access can scrape. What remains in the DOM
 * is the starter prompt (public copy), and buttons whose labels name actions
 * rather than facts. The view feed, the manifest and the activity log are all
 * drawn by `ChamberScene`.
 */

import type { SessionClient } from "./net/sessionClient.js";

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

/**
 * Copy text to the clipboard, reporting on the button itself.
 *
 * The starter prompt card is the single most important element on the landing
 * page (doc 04 section 2), and a copy button that silently does nothing on a
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

  main.append(
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

  const chrome = el("section", { class: "route" });
  chrome.append(
    el("h2", {}, "Chrome 149 or newer"),
    el("p", {}, "Open the flag below, enable WebMCP testing, relaunch, and return here."),
  );
  const flag = el("code", { class: "flag" }, CHROME_FLAG);
  chrome.append(
    flag,
    copyButton("Copy flag URL", () => CHROME_FLAG, flag),
  );

  const chatgpt = el("section", { class: "route" });
  chatgpt.append(
    el("h2", {}, "The ChatGPT app"),
    el(
      "p",
      {},
      "Open this page in the ChatGPT desktop app's in-app browser, on GPT-5.6 Sol or Terra. " +
        "Luna has site tools disabled and will land you back here.",
    ),
  );

  const card = el("section", { class: "card" });
  card.append(el("h2", {}, "Paste this to your agent once you are in"));
  const prompt = el("blockquote", { class: "prompt" }, STARTER_PROMPT);
  card.append(
    prompt,
    copyButton("Copy prompt", () => STARTER_PROMPT, prompt),
  );

  main.append(chrome, chatgpt, card);
  root.append(main);
}

/** Everything the DOM shell needs to drive PILOT's half of the session. */
export interface ShellDeps {
  readonly client: SessionClient;
  /** Called after PILOT acts, so the caller can put the answer on the canvas. */
  readonly onNote: (line: string) => void;
}

/** What `main.ts` gets back: where to mount the canvas, and how to tear down. */
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
   * A mount point for the same reason the notepad has one: the frame is a
   * tool registration on another origin, so whoever owns tool lifetimes owns
   * the element. It holds no content of its own and nothing about it is
   * visible.
   */
  readonly archiveHost: HTMLElement;
  dispose(): void;
}

/**
 * The page around the canvas: the prompt card, the stage, and PILOT's controls.
 *
 * Everything that was greybox scaffolding here has moved to the canvas, which
 * is where the client's own rules require it: the view feed, the manifest and
 * the activity log are all drawn by `ChamberScene` now. What is left in the
 * DOM is the two things a canvas is genuinely the wrong surface for.
 *
 * The **starter prompt card** has to be selectable and copyable, and a canvas
 * is neither. It is safe in the DOM because it is public copy that holds no
 * puzzle fact: an agent scraping it learns the same sentence the player was
 * told to paste.
 *
 * **PILOT's controls** are real buttons because they are the things only the
 * human can do (doc 03 section 5): gripping the release bar, resetting a
 * deadlocked chamber, leaving the Archive. None is a tool, however convenient
 * a `retry_chamber` tool would be, and that is the asymmetry seen from the
 * human's side. They stay in the DOM for the accessibility they get free
 * there, and they carry no information: a button label names an action, never
 * a fact.
 */
export function renderStation(root: HTMLElement, deps: ShellDeps): ShellHandle {
  root.replaceChildren();
  const main = el("main", { class: "station" });
  const stage = el("div", { class: "stage" });

  const card = el("section", { class: "card" });
  card.append(el("h2", {}, "Paste this to your agent"));
  const prompt = el("blockquote", { class: "prompt" }, STARTER_PROMPT);
  card.append(
    prompt,
    copyButton("Copy prompt", () => STARTER_PROMPT, prompt),
    el(
      "p",
      { class: "fallback" },
      "If your agent doesn't respond, ask it: what tools does this page give you?",
    ),
  );

  const begin = el("section", { class: "controls" });
  begin.append(el("h2", {}, "Start the shift"));
  for (const mode of ["full", "brief", "practice"] as const) {
    const button = el("button", { type: "button" }, mode);
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
    begin.append(button);
  }

  const controls = el("section", { class: "controls" });
  controls.append(el("h2", {}, "PILOT"));
  for (const [label, action] of PILOT_ACTIONS) {
    const button = el("button", { type: "button" }, label);
    button.addEventListener("click", () => {
      void deps.client.post(action).then((response) => {
        deps.onNote(`${label}: ${response.text}`);
      });
    });
    controls.append(button);
  }

  // The pad is a real form because a real form is the point (doc 03 section 8),
  // and a form needs the DOM: a canvas cannot hold a focusable, typable,
  // screen-reader-navigable control. The canvas draws the pad on the wall with
  // every line on it; this is the part PILOT types into.
  const notepadHost = el("section", { class: "controls notepad-host" });
  notepadHost.append(
    el("h2", {}, "Notepad"),
    el(
      "p",
      { class: "fallback" },
      "The one control you and KEEPER share. It writes the same tool your agent calls, " +
        "and the pad on the wall shows who wrote each line.",
    ),
  );

  // Out of the flow entirely: an empty container for the archive frame, which
  // is hidden and zero-sized when it exists at all.
  const archiveHost = el("div", { class: "archive-host", "aria-hidden": "true" });

  main.append(
    el("p", { class: "eyebrow" }, "SEMAPHORE"),
    stage,
    card,
    begin,
    notepadHost,
    controls,
    archiveHost,
  );
  root.append(main);

  return {
    stage,
    notepadHost,
    archiveHost,
    dispose() {
      root.replaceChildren();
    },
  };
}

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
