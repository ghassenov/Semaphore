/**
 * The two screens somebody meets before they are playing: the landing screen,
 * and the gate a browser without WebMCP gets instead.
 *
 * ## The landing screen is its own surface now
 *
 * It used to be a card laid over the live console, which meant a visitor who
 * had not started anything was shown a rail reading `CONNECTING`, an ambiguity
 * gauge with no session behind it, seven tab stubs and three audio faders,
 * before a single sentence about what the page was. It also inherited the
 * console's deck, which has a definite height and clips rather than scrolls -
 * so opening the ablation, which is on the never-cut list, cut the bottom off
 * the chart and the requisition slip together.
 *
 * It is a full-viewport surface of its own now, laid over everything, with its
 * own scroll and its own composition. The console keeps its measured size the
 * whole time it is underneath, which matters: the camera frames against the
 * viewport's shape (`render/camera.ts`), and a console hidden with
 * `display: none` would come back at zero by zero and frame the first room
 * against nothing.
 *
 * ## The order of the page is the argument
 *
 * Identity, then the thesis, then the proof of the thesis, then how to start.
 * A player told the controls first learns a control scheme; a player shown the
 * asymmetry first learns why there is a second player, which is the only thing
 * here that looking at the screen does not tell them.
 *
 * ## D-069: an editorial redesign, on top of the structural one
 *
 * D-066 fixed what was broken - the landing screen inheriting console chrome,
 * the start flow failing silently, the slip appearing twice. This pass is
 * about what was merely correct: a display typeface (`--display`, D-068) for
 * the headline and the running heads, scroll-driven reveals rather than
 * everything arriving at once, a light that leans toward the pointer the way
 * every lamp in the station already does, and a small bounded tilt on the
 * three things a reader is actually choosing between. `heroBlock` and
 * `whyAndKey` are shared between this screen and the gate for the same reason
 * `promptCard` is one function in `parts.ts`: two copies of a composition are
 * two copies that will drift, and this project has paid for that twice
 * already (D-062, D-066).
 */

import { CHAMBER_NAMES } from "@semaphore/protocol";
import type { StationAudio } from "../audio/index.js";
import { startChamberFrom, type SessionClient } from "../net/sessionClient.js";
import { wireReveals } from "./reveal.js";
import { wirePointerLight, wireTilt } from "./motion.js";
import {
  ATTRACT_AFTER_MS,
  CHROME_FLAG,
  STARTER_PROMPT,
  ablationChart,
  copyButton,
  el,
  ghostScreen,
  kicker,
  legendRow,
  panel,
  promptCard,
  sectionRule,
  splitProof,
  wordmark,
} from "./parts.js";

/**
 * The session lengths, as an offer rather than as three lowercase words.
 *
 * The previous build printed `full`, `brief` and `practice` as bare button
 * labels with the explanation in a `title` attribute, which is a tooltip on a
 * desktop and nothing at all on a phone. What a visitor needs before choosing
 * is how long this is going to take them, so the duration is on the button.
 */
const BEGIN_MODES: readonly {
  readonly mode: "full" | "brief";
  readonly difficulty: "standard" | "practice";
  readonly name: string;
  readonly cost: string;
  readonly blurb: string;
  /** Marks the one option the button itself recommends, rather than leaving
   * three equally weighted cards for a first-time visitor to arbitrate. */
  readonly badge?: string;
}[] = [
  {
    mode: "full",
    difficulty: "standard",
    name: "Full shift",
    cost: "about 15 minutes",
    blurb: "Four chambers, the Archive and the finale. The whole station.",
    badge: "RECOMMENDED",
  },
  {
    mode: "brief",
    difficulty: "standard",
    name: "Brief shift",
    cost: "about 10 minutes",
    blurb: "Three chambers. Chamber II is skipped; the trust puzzle and the finale are not.",
  },
  {
    mode: "full",
    difficulty: "practice",
    name: "Practice",
    cost: "untimed",
    blurb: "The full station with no clock running. The best way to look at it.",
  },
];

/** What the landing screen needs in order to start a shift. */
export interface LandingDeps {
  readonly client: SessionClient;
  /**
   * The station's sound.
   *
   * Started here because this is where the first click lands, and every
   * browser refuses an `AudioContext` that was not opened by a gesture, and
   * refuses it silently.
   */
  readonly audio: StationAudio;
  /** Called after the page acts, so the console can put the answer in its log. */
  readonly onNote: (line: string) => void;
  /** Ask for the guided shift once there is a room to run it in. */
  readonly onTeach: () => void;
}

/** What the console holds so it can drive the landing screen from the session. */
export interface LandingHandle {
  readonly element: HTMLElement;
  /**
   * Follow the session.
   *
   * The one input is the phase, because the phase is the only thing that
   * decides whether this screen should be on the page at all. It is `SHARED`
   * by construction, so reading it here hands nobody anything.
   */
  update(phase: string | null): void;
  dispose(): void;
}

/**
 * Identity, then the thesis, then the lede: the block every entry surface
 * opens with.
 *
 * A shared builder rather than two copies for the reason every shared builder
 * in this directory exists (D-062, D-066): the landing screen and the gate
 * describe the same game, and a paragraph that only one of them remembers to
 * update is a paragraph that starts describing a different one.
 *
 * The thesis carries one italic clause in the display face - "the same room"
 * - which is the actual asymmetry the sentence turns on. Setting the whole
 * sentence in one weight buries the word that matters in nine others that
 * don't; the emphasis is typographic, not decorative, because it is doing the
 * job a spoken sentence does with stress and this one cannot rely on being
 * read aloud.
 */
function heroBlock(): HTMLElement {
  const head = el("header", { class: "landing-head" });
  head.append(wordmark("large"), kicker("", "A COOPERATIVE ESCAPE GAME, BUILT ON WEBMCP"));
  const thesis = el("h1", { class: "landing-thesis" });
  thesis.append(
    "An escape room for a human and an agent who cannot see ",
    el("em", { class: "thesis-em" }, "the same room."),
  );
  head.append(
    thesis,
    el(
      "p",
      { class: "landing-lede" },
      "You see the station and can touch almost none of it. Your agent holds the manual, " +
        "can reach every mechanism behind the walls, and cannot see. Neither of you gets " +
        "out alone.",
    ),
  );
  return head;
}

/**
 * The ablation, folded, and the colour key: the two things every entry
 * surface closes on.
 *
 * `open` is the one difference between the two callers. The landing screen
 * folds it, because a visitor who has already decided to play should not
 * have to get past the argument for playing; the gate opens it, because for
 * some judges this screen is the entire submission and the never-cut chart
 * should not cost them a click to see (doc 07 section 6).
 */
function whyAndKey(open: boolean): { why: HTMLElement; key: HTMLElement } {
  const why = el("details", { class: "why", "data-reveal": "" });
  if (open) why.setAttribute("open", "");
  why.append(
    el("summary", {}, "Why does this need two of you? We measured it."),
    ablationChart(true),
  );

  const key = el("footer", { class: "landing-key", "data-reveal": "" });
  key.append(
    el("p", { class: "landing-key-title" }, "WHO PERCEIVES WHAT"),
    legendRow(),
    el("p", { class: "note" }, "Every marked thing carries its shape as well as its colour."),
  );
  return { why, key };
}

/**
 * The landing screen.
 *
 * Returns a handle rather than mounting itself, so the console owns where it
 * sits in the document and there is exactly one thing on the page reading the
 * model.
 */
export function renderLanding(deps: LandingDeps): LandingHandle {
  const landing = el("div", { class: "landing" });
  const scroll = el("div", { class: "landing-scroll" });
  const sheet = el("main", { class: "landing-sheet" });

  // ---- Identity, thesis, proof. ------------------------------------------
  const head = heroBlock();
  sheet.append(head, splitProof(), sectionRule());

  // A `?chamber=` deep link, read once. The page says so rather than opening
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

  // ---- How to start, as two steps that are actually numbered. ------------
  //
  // The previous build put the prompt on one side of the page, three unlabelled
  // buttons at the bottom of the other, and a sentence between them explaining
  // that the two were related. They are one procedure and they are drawn as
  // one now.
  const start = el("section", { class: "start", "data-reveal": "" });
  start.append(
    kicker("", "HOW TO BEGIN"),
    el("h2", { class: "start-title" }, "Two things, and you are in."),
  );

  const stepOne = step(1, "Give your agent the prompt");
  // The slip, and this is the only call to `promptCard` on this screen. It used
  // to appear here *and* inside the proof graphic, so the single most important
  // element in the project was on the page twice.
  const slip = promptCard();
  // The bounded pointer tilt (`wireTilt`, below) reads this attribute; it is
  // inert without the listener, so marking it here costs nothing on the copy
  // of this card that lives in the console's drawer instead.
  slip.setAttribute("data-tilt", "");
  stepOne.body.append(slip);

  const stepTwo = step(2, "Pick a length");
  const modes = el("div", { class: "modes" });
  const chooser = el("div", { class: "chooser" });
  const waiting = el("div", { class: "waiting" });
  waiting.hidden = true;
  chooser.append(modes);
  stepTwo.body.append(chooser, waiting);

  start.append(stepOne.section, stepTwo.section);
  sheet.append(start);

  /*
   * What happens when a length is chosen.
   *
   * `start` refuses until the agent has called `begin_shift` - it answers
   * `E_NO_SESSION: Your shift has not started` - and the previous build sent
   * that refusal to the activity log, which lives in a *closed drawer*. So a
   * visitor clicked one of the three buttons, nothing whatsoever moved, and
   * the only honest conclusion available to them was that the page was broken.
   *
   * The choice is remembered instead, and the step says what it is waiting for.
   * When the agent opens the door the phase becomes `LOBBY`, `update` sees it,
   * and the shift the visitor already asked for begins by itself.
   */
  let pending: (typeof BEGIN_MODES)[number] | null = null;
  /** Whether a `start` is already in flight, so `update` cannot send a second. */
  let starting = false;

  function beginChosen(): void {
    if (pending === null || starting) return;
    starting = true;
    const choice = pending;
    void deps.client
      .post("start", {
        difficulty: choice.difficulty,
        mode: choice.mode,
        // `?chamber=N`, if the URL carried one. The server drops a name it
        // does not know, so a mistyped parameter starts a normal session.
        ...(deepLink ? { chamber: deepLink } : {}),
      })
      .then((response) => {
        deps.onNote(`start ${choice.name}: ${response.text}`);
      })
      .finally(() => {
        starting = false;
      });
  }

  for (const choice of BEGIN_MODES) {
    const button = el("button", { type: "button", class: "mode", "data-tilt": "" });
    const top = el("span", { class: "mode-top" });
    top.append(el("span", { class: "mode-name" }, choice.name));
    if (choice.badge) top.append(el("span", { class: "mode-badge" }, choice.badge));
    button.append(
      top,
      el("span", { class: "mode-cost" }, choice.cost),
      el("span", { class: "mode-blurb" }, choice.blurb),
    );
    button.addEventListener("click", () => {
      // The gesture that brings the station's sound up. It is guaranteed to
      // happen before there is anything to hear.
      deps.audio.start();
      pending = choice;
      chooser.hidden = true;
      waiting.hidden = false;
      showWaiting();
      // If the agent is already on the deck, there is nothing to wait for.
      beginChosen();
    });
    modes.append(button);
  }

  /**
   * The other way in, for somebody who has no agent pointed at this page.
   *
   * A judge under review load, and anybody who wants to look at the station
   * before deciding whether to wire an agent to it. It opens its own door -
   * the page calls `begin_shift` itself - which is normally the agent's move,
   * and it says so on the button rather than pretending otherwise.
   */
  const solo = el("button", { type: "button", class: "solo", "data-tilt": "" });
  solo.append(
    el("span", { class: "solo-name" }, "Look around without an agent"),
    el(
      "span",
      { class: "solo-blurb" },
      "Opens a practice shift and walks you through it. Nothing is timed and no agent is " +
        "needed, so half the game is missing on purpose.",
    ),
  );
  solo.addEventListener("click", () => {
    deps.audio.start();
    chooser.hidden = true;
    waiting.hidden = false;
    showWaiting("solo");
    /*
     * `begin_shift` first, then `start`.
     *
     * Beginning the shift is normally the agent's move and `start` refuses
     * without it. A demonstration may open its own door: it is a practice run
     * whose whole purpose is to show somebody the game before they have an
     * agent pointed at it, and the button says exactly that.
     */
    void deps.client
      .post("begin_shift", { designation: "KEEPER" })
      .then(() => deps.client.post("start", { difficulty: "practice", mode: "full" }))
      .then((response) => {
        deps.onNote(`look around: ${response.text}`);
        deps.onTeach();
      });
  });
  chooser.append(el("p", { class: "chooser-or" }, "or"), solo);

  /** Paint the waiting state, which is the only state this screen animates. */
  function showWaiting(kind: "agent" | "solo" = "agent"): void {
    waiting.replaceChildren();
    waiting.classList.toggle("is-live", kind === "solo");
    if (kind === "solo") {
      waiting.append(
        el("p", { class: "waiting-what" }, "Opening the airlock"),
        el("p", { class: "note" }, "No agent needed. The station is coming up."),
      );
      return;
    }
    waiting.append(
      el("p", { class: "waiting-what" }, "Waiting for KEEPER"),
      el(
        "p",
        { class: "waiting-why" },
        "Your agent opens the door, not this page. Paste the prompt from step one into it " +
          "and the shift starts here by itself.",
      ),
    );
    const again = copyButton("Copy the prompt again", () => STARTER_PROMPT, waiting);
    const change = el(
      "button",
      { type: "button", class: "waiting-change" },
      "Pick a different length",
    );
    change.addEventListener("click", () => {
      pending = null;
      waiting.hidden = true;
      waiting.classList.remove("is-live");
      chooser.hidden = false;
    });
    waiting.append(el("div", { class: "waiting-acts" }));
    waiting.querySelector(".waiting-acts")?.append(again, change);
  }

  // ---- Why two of you, and the key. ---------------------------------------
  const { why, key } = whyAndKey(false);
  sheet.append(sectionRule(), why, key);

  scroll.append(sheet);
  landing.append(scroll);

  // ---- The two cursor-driven touches: a light on the hero, a tilt on the
  //      three cards a reader is actually choosing between. -----------------
  // Wired on `landing` itself, not the hero: the light used to be scoped to
  // the header box only, which read back as "the cursor is stuck in a
  // little box" - correct, since nowhere else on the page had anything to
  // react to a cursor at all. It now follows the reader down the whole page.
  const disposeLight = wirePointerLight(landing);
  const disposeTilt = wireTilt(start);
  const disposeReveals = wireReveals(landing);

  // ---- Attract mode, over the whole screen. ------------------------------
  //
  // Doc 08 phase 4: a landing screen nobody has touched for twenty seconds
  // starts playing a shift by itself. It plays over the whole surface rather
  // than in a box in a corner, because a recording the size of a thumbnail is
  // a decoration and a recording the size of the screen is the game.
  //
  // It never survives a keystroke, a click or a pointer move, and it never
  // starts under `prefers-reduced-motion`, where a page that begins animating
  // on its own is precisely the thing being asked about.
  const attract = el("div", { class: "attract" });
  attract.hidden = true;
  const tape = ghostScreen();
  attract.append(
    tape.element,
    el(
      "p",
      { class: "attract-note" },
      "A previous pair, from the station's own log. Move to return.",
    ),
  );
  landing.append(attract);

  const stillness = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  let idleTimer = 0;
  let dismissed = false;

  function stopAttract(): void {
    if (attract.hidden) return;
    attract.hidden = true;
    tape.stop();
  }

  function restartIdle(): void {
    stopAttract();
    globalThis.clearTimeout(idleTimer);
    if (stillness || dismissed) return;
    idleTimer = globalThis.setTimeout(() => {
      if (dismissed) return;
      attract.hidden = false;
      tape.play();
    }, ATTRACT_AFTER_MS);
  }

  for (const event of ["keydown", "pointerdown", "pointermove"] as const) {
    globalThis.addEventListener(event, restartIdle, { passive: true });
  }
  restartIdle();

  return {
    element: landing,

    update(phase: string | null): void {
      // Before the agent has begun there is no session; `LOBBY` is the agent
      // on the deck with no chamber started. Both are this screen's business,
      // and everything after them is the game's.
      const mine = phase === null || phase === "ENTRY" || phase === "LOBBY";
      if (!mine) {
        if (!dismissed) {
          dismissed = true;
          landing.classList.add("is-leaving");
          stopAttract();
          globalThis.clearTimeout(idleTimer);
          // Removed rather than hidden, so nothing on it can take focus or be
          // read out from underneath the room.
          globalThis.setTimeout(() => {
            landing.remove();
          }, 420);
        }
        return;
      }
      // The agent has opened the door. If a length was already chosen, the
      // visitor asked for this shift some time ago and it starts now.
      if (phase === "LOBBY" && pending !== null) {
        const live = waiting.querySelector(".waiting-what");
        if (live) live.textContent = "KEEPER is on the deck";
        waiting.classList.add("is-live");
        beginChosen();
      }
    },

    dispose(): void {
      globalThis.clearTimeout(idleTimer);
      stopAttract();
      disposeLight();
      disposeTilt();
      disposeReveals();
      for (const event of ["keydown", "pointerdown", "pointermove"] as const) {
        globalThis.removeEventListener(event, restartIdle);
      }
    },
  };
}

/** One numbered step of the start procedure. */
function step(n: number, title: string): { section: HTMLElement; body: HTMLElement } {
  const section = el("section", { class: "step" });
  const head = el("div", { class: "step-head" });
  head.append(
    el("span", { class: "step-n", "aria-hidden": "true" }, String(n)),
    el("h3", {}, title),
  );
  const body = el("div", { class: "step-body" });
  section.append(head, body);
  return { section, body };
}

/**
 * The screen a browser without WebMCP gets.
 *
 * For some judges this is the entire submission (doc 07 section 6), so it
 * carries the pitch, the mark, the proof, the ablation and the exact way in for
 * both browsers that implement the draft. It never appears as a consequence of
 * a thrown error: `adapter.ts` degrades to nulls so that reaching this screen is
 * a decision rather than a crash, and it does not open with the error either -
 * a submission should not lead with one.
 *
 * It is built from the same parts as the landing screen and in the same order,
 * so the two cannot drift into describing different games. What it swaps is the
 * step that cannot be taken here: "pick a length" becomes "get into a browser
 * that can run this", and SPECTATE stands in for playing.
 */
export function renderGate(root: HTMLElement): void {
  root.replaceChildren();
  const gate = el("div", { class: "landing gate" });
  const scroll = el("div", { class: "landing-scroll" });
  const sheet = el("main", { class: "landing-sheet" });

  const head = heroBlock();
  sheet.append(head, splitProof(), sectionRule());

  const start = el("section", { class: "start", "data-reveal": "" });
  start.append(
    kicker("", "HOW TO BEGIN"),
    el("h2", { class: "start-title" }, "Two things, and you are in."),
  );

  // The problem, as the first step of a procedure rather than as a headline.
  const stepOne = step(1, "Get into a browser that can reach the station");
  stepOne.body.append(
    el(
      "p",
      { class: "blocked-why" },
      "Your agent plays through tools this page registers, and that needs a browser " +
        "implementing the WebMCP draft. This one does not. Two do, and either takes a minute.",
    ),
  );
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
  stepOne.body.append(routes);

  const stepTwo = step(2, "Give your agent the prompt");
  // The only call on this screen. The previous build called it here *and*
  // embedded the proof graphic that also called it, so the never-cut element
  // appeared twice in one document.
  stepTwo.body.append(promptCard());

  start.append(stepOne.section, stepTwo.section);
  sheet.append(start, sectionRule());

  // SPECTATE. Until this existed the screen described a game without ever
  // showing one. Behind a button rather than autoplaying: this screen is read,
  // not watched, and a canvas that starts moving under a paragraph somebody is
  // reading is what attract mode is for on the screen that is watched.
  const watch = el("section", { class: "watch", "data-reveal": "" });
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
  watch.append(
    kicker("", "OR WATCH IT HAPPEN"),
    el("h2", { class: "start-title" }, "A shift, right here."),
    el(
      "p",
      { class: "landing-lede" },
      "A recording of a previous pair, from the station's own log. It is the same picture " +
        "the Archive's monitor plays inside the game.",
    ),
    spectate,
    screen.element,
  );
  sheet.append(watch);

  const { why, key } = whyAndKey(true);
  sheet.append(why, key);

  scroll.append(sheet);
  gate.append(scroll);
  root.append(gate);

  wirePointerLight(gate);
  wireTilt(start);
  // No disposer kept: the gate is the terminal state of this document, and
  // nothing ever tears it down to replace it with something else.
  wireReveals(gate);
}
