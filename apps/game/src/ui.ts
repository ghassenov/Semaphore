/**
 * The page, in plain DOM, until the Phaser client replaces it.
 *
 * Two surfaces live here: the **gate screen**, shown to a browser with no
 * WebMCP, and the **operator console**, which is PILOT's side of the game
 * plus an honest readout of the tool registry.
 *
 * **Nothing here renders a puzzle fact, and nothing here may start to.**
 * The client-side rule (see this app's CLAUDE.md) is that puzzle-critical
 * visuals go to canvas, never to DOM, because a DOM text node holding a glyph
 * is a text node an agent with page access can scrape. Everything this file
 * prints is machine state (phase, chamber, timer) or registry state (tool
 * names), both of which are `SHARED` by construction and neither of which
 * tells anyone which lever carries the spiral. When the chambers get their
 * real rendering, it goes on a canvas and not here.
 *
 * The console is scaffolding with a job, not a placeholder: PILOT genuinely
 * does act in this game (gripping the release bar arms the Concord Lock,
 * resetting a deadlocked chamber, leaving the Archive), and none of those are
 * tools, so without these controls a session cannot finish. Phase 1.4 moves
 * them into the room; the calls they make do not change.
 */

import type { PilotView } from "@semaphore/protocol";
import type { SessionClient, StateSummary } from "./net/sessionClient.js";
import { listToolNames, onToolChange } from "./webmcp/adapter.js";
import type { CallRecord } from "./webmcp/director.js";

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

/** Everything the console needs to drive PILOT's half of the session. */
export interface ConsoleDeps {
  readonly client: SessionClient;
  /** Called after PILOT acts, so the caller can decide what to do with failures. */
  readonly onNote: (line: string) => void;
}

/**
 * PILOT's controls and the registry readout.
 *
 * The manifest list is rendered from a real `toolchange` listener reading an
 * actual `getTools()` call, never from a parallel record of what was just
 * registered (doc 03 section 4.2). That is the whole point: if a registration
 * silently fails, this list shows the truth and the bug gets found.
 */
export function renderConsole(root: HTMLElement, deps: ConsoleDeps): ConsoleHandle {
  root.replaceChildren();
  const main = el("main", { class: "console" });

  const status = el("dl", { class: "status" });
  const pilotFacts = el("pre", { class: "facts" }, "waiting for the view feed");
  let frames = 0;
  const manifest = el("ul", { class: "manifest" });
  const log = el("ol", { class: "log" });

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

  main.append(
    el("p", { class: "eyebrow" }, "SEMAPHORE / OPERATOR CONSOLE"),
    card,
    el("h2", {}, "Session"),
    status,
    el("h2", {}, "PILOT's view feed"),
    pilotFacts,
    el("h2", {}, "KEEPER's manifest"),
    manifest,
    begin,
    controls,
    el("h2", {}, "Activity"),
    log,
  );
  root.append(main);

  const stopWatching = onToolChange(() => {
    void refreshManifest();
  });
  void refreshManifest();

  async function refreshManifest(): Promise<void> {
    const names = await listToolNames();
    manifest.replaceChildren(
      ...(names.length > 0
        ? names.map((name) => el("li", {}, name))
        : [el("li", { class: "empty" }, "empty")]),
    );
  }

  return {
    setState(state: StateSummary) {
      status.replaceChildren(
        el("dt", {}, "phase"),
        el("dd", {}, state.phase),
        el("dt", {}, "chamber"),
        el("dd", {}, state.chamber ?? "none"),
        el("dt", {}, "designation"),
        el("dd", {}, state.designation ?? "not yet given"),
        el("dt", {}, "time left"),
        el(
          "dd",
          {},
          state.remainingMs === null
            ? "untimed"
            : `${String(Math.ceil(state.remainingMs / 1000))}s`,
        ),
      );
    },
    setView(view: PilotView) {
      // Field *names* only, never values. A glyph, a needle reading or a
      // cipher offset in a text node would put puzzle-critical information in
      // the DOM, which this app's rules forbid outright: an agent that can
      // read the page would then be able to read PILOT's half of the split
      // and the whole game would collapse. The values are drawn on the canvas
      // by `ChamberScene`. This line exists to show the feed is alive.
      frames += 1;
      const names = Object.keys(view.facts);
      pilotFacts.textContent =
        `frame ${String(frames)}: ` +
        (names.length > 0
          ? `${String(names.length)} facts (${names.join(", ")})`
          : "no room to draw");
    },
    note(line: string) {
      log.prepend(el("li", {}, line));
      while (log.childElementCount > 40) log.lastElementChild?.remove();
    },
    recordCall(call: CallRecord) {
      this.note(`${call.tool} ${call.outcome} in ${String(Math.round(call.durationMs))}ms`);
    },
    dispose: stopWatching,
  };
}

/** The console's handle: what `main.ts` pushes into it as the session moves. */
export interface ConsoleHandle {
  setState(state: StateSummary): void;
  /** The latest frame off the view socket. PILOT's half of the split. */
  setView(view: PilotView): void;
  note(line: string): void;
  recordCall(call: CallRecord): void;
  dispose(): void;
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
