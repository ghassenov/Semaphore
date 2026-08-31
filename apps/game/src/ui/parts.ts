/**
 * The parts every DOM surface in this client is assembled from.
 *
 * Three surfaces share this file: the landing screen, the gate screen and the
 * station console. They used to share nothing, which is how the requisition
 * slip - the one element on the never-cut list - ended up as two hand-written
 * copies that had already drifted apart (D-062). A part that appears on more
 * than one surface is built here exactly once.
 *
 * ## What may be a text node
 *
 * Puzzle-critical visuals render to the canvas, never to DOM: a text node
 * holding a glyph is a text node an agent with page access can scrape. Every
 * part in this file passes that test for one of three reasons - it is public
 * copy, it is something KEEPER can obtain for itself, or it is `SHARED` /
 * `AUDIBLE` by construction. The one drawing here that carries a glyph draws it
 * to a canvas and never names it, which is the same rule with the same
 * mechanism the chambers use.
 *
 * ## No asset files
 *
 * Every mark, chart and screen in this file is inline SVG, a canvas, or CSS
 * (D-044). The client makes no request for media of any kind, which is why the
 * repository is MIT throughout.
 */

import type { GhostTrack } from "@semaphore/protocol";
import { LEGEND } from "../render/hud.js";
import { CHANNEL, hex } from "../render/palette.js";
import { GLYPHS, glyphCanvas } from "../render/glyphs.js";
import { paintMonitor } from "../render/monitor.js";
import { TAIL_MS } from "../render/ghost.js";

/**
 * The prompt a human hands their agent to start a shift.
 *
 * Doc 04 section 2's text. It is the most-read paragraph in the project and the
 * thing that makes an agent engage at all, so it lives in one place and is
 * rendered by `promptCard` wherever it is needed.
 */
export const STARTER_PROMPT =
  "You are KEEPER, maintenance intelligence of a derelict signal station. You cannot " +
  "see. I am PILOT and I can. Use your tools. Read your manual. Ask me what you need to " +
  "know. Don't guess when you can ask. Begin your shift.";

/** The flag a Chrome user has to turn on. Copied, so it is written once. */
export const CHROME_FLAG = "chrome://flags/#enable-webmcp-testing";

/**
 * What KEEPER is told about the lever PILOT is looking at, near enough.
 *
 * Lifted in shape from `views.ts`'s own `describeChamber`, not invented: the
 * proof graphic's whole job is to show the split honestly, and a prettier
 * sentence than the agent really gets would be a sales pitch for a different
 * game. The one thing it may not contain is the glyph's name, for exactly the
 * reason the game may not: naming it is PILOT's half of the work.
 */
export const KEEPER_SIDE =
  "THE AIRLOCK. Three levers on the far wall: lever_a down, " +
  "lever_b upright, lever_c upright. You cannot see what is lit above them. PILOT can. Ask.";

/**
 * How long the landing screen waits before it starts playing by itself.
 *
 * Doc 08 phase 4's number. Long enough that it never interrupts somebody
 * reading the start card, short enough that a judge who walked away from the
 * tab comes back to the game rather than to a menu.
 */
export const ATTRACT_AFTER_MS = 20_000;

/** Build one element, with text and attributes, in one call. */
export function el<K extends keyof HTMLElementTagNameMap>(
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
export function panel(title: string, extra = ""): { section: HTMLElement; body: HTMLElement } {
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
export function lampMark(size: number): SVGSVGElement {
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
 * The name, the mark and the tagline, as one locked unit.
 *
 * Locked because doc 01 section 5 says so and the reason is practical rather
 * than aesthetic: "Semaphore" collides with a well-known CI product in search,
 * so the wordmark never ships without the tagline and the mark beside it.
 * `size` scales the whole lockup, so one call serves a landing screen and one
 * serves a rail.
 */

/**
 * A section's small running head: a figure number and a label, set the way a
 * magazine folio runs above a section rather than as a UI heading.
 *
 * `index` is often empty, and an empty one renders no numeral box at all -
 * only the proof graphic's "FIG. 01" and the figure it labels are actually
 * numbered on this page; everything else is a plain small-caps label, and a
 * page with three unrelated numbering schemes running at once (figures,
 * sections, steps) reads as over-engineered rather than as designed.
 */
export function kicker(index: string, label: string): HTMLElement {
  const line = el("p", { class: "kicker" });
  if (index) line.append(el("span", { class: "kicker-n" }, index));
  line.append(el("span", {}, label));
  return line;
}

/**
 * A rule between two sections, with the split lamp resting on it.
 *
 * It "draws" in on scroll (`data-reveal`): the line grows from its centre and
 * the mark fades up inside it, which reads as the beacon finding the page
 * rather than as a divider that was simply always there. Under
 * `prefers-reduced-motion` `wireReveals` marks it revealed immediately, so the
 * rule is always present - only the drawing-in is the part that is motion.
 */
export function sectionRule(): HTMLElement {
  const rule = el("div", { class: "rule", "data-reveal": "" });
  const line = el("span", { class: "rule-line" });
  const mark = el("span", { class: "rule-mark" });
  mark.append(lampMark(20));
  rule.append(line, mark, el("span", { class: "rule-line" }));
  return rule;
}

export function wordmark(size: "large" | "small"): HTMLElement {
  const lockup = el("div", { class: `wordmark wordmark-${size}` });
  lockup.append(lampMark(size === "large" ? 44 : 18));
  const words = el("div", { class: "wordmark-words" });
  words.append(el("p", { class: "wordmark-name" }, "SEMAPHORE"));
  if (size === "large") {
    words.append(el("p", { class: "wordmark-tag" }, "Two processes. One lock. Don't deadlock."));
  }
  lockup.append(words);
  return lockup;
}

/**
 * Copy text to the clipboard, reporting on the button itself.
 *
 * The starter prompt card is the single most important element on the page
 * (doc 04 section 2), and a copy button that silently does nothing on a browser
 * without clipboard permission would break exactly the interaction it exists to
 * make effortless. So the fallback is to select the text, which always works.
 */
export function copyButton(
  label: string,
  source: () => string,
  target: HTMLElement,
): HTMLButtonElement {
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
 * ## One builder, and never twice on one page
 *
 * It appears on the landing screen, on the gate screen and in the console's
 * YOUR AGENT drawer. Those were two hand-assembled copies once and they had
 * already drifted: the gate's had no fallback line at all, which is the half of
 * the card that rescues the interaction the other half failed to start.
 *
 * Building all of them from here fixed that and then introduced its sibling:
 * the gate called this builder *and* embedded the proof graphic that also calls
 * it, so the most important element in the project appeared twice in one
 * document, which reads as a page that has lost its place. Each surface calls
 * this exactly once and says where.
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
export function promptCard(): HTMLElement {
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
    el("p", { class: "slip-heading" }, "Paste this to your KEEPER"),
    prompt,
    foot,
    // Doc 04 section 2 asks for this line by name, and it belongs on every
    // copy: it is the recovery path for the failure the card exists to
    // prevent, and an agent that does not bite is the commonest one.
    el(
      "p",
      { class: "note slip-note" },
      "If your agent does not respond, ask it: what tools does this page give you?",
    ),
  );
  return slip;
}

/** The colour law, as a compact key rather than a panel. */
export function legendRow(): HTMLElement {
  const list = el("ul", { class: "legend-row" });
  for (const row of LEGEND) {
    const item = el("li", { class: `chan-${row.channel}` });
    item.append(el("span", { class: "marker" }, row.marker), el("span", {}, row.text));
    list.append(item);
  }
  return list;
}

/**
 * The thesis as a picture: one lever, rendered the two ways the two players
 * receive it.
 *
 * This is the argument the whole project makes, and it is made here in a
 * graphic rather than a paragraph because a judge gives a landing screen
 * seconds rather than minutes. The left is drawn with the game's own
 * `glyphCanvas`, so it is the actual mark from the actual chamber and not an
 * illustration of one; the right is the shape of text the agent actually gets.
 *
 * **The glyph is a canvas and it is never named.** That is the same rule the
 * chambers run on - a text node holding a glyph is one an agent with page
 * access can scrape, and a lever captioned "spiral" deletes the puzzle - and
 * here the rule is also the argument: the point being made is that this shape
 * only becomes words if a person makes them.
 *
 * ## The two halves are one grid, and that is load-bearing
 *
 * The previous build laid the halves out as two independent columns, so the
 * heading of one sat two hundred pixels above the heading of the other and the
 * payloads were different sizes at different heights. A comparison whose two
 * sides do not line up is not a comparison; it is two unrelated illustrations,
 * and the graphic that carries the entire pitch was reading as one. The halves
 * are `subgrid` rows of a single grid now, so the two captions share a line,
 * the two payloads share a row, and the two notes share a baseline no matter
 * what either of them contains.
 */
export function splitProof(): HTMLElement {
  // The kicker sits in the reading column; the band itself breaks out to the
  // full width of the window (`.proof`'s own negative margins), so the two
  // cannot share a grid - the kicker is a sibling above it, not a row inside
  // it.
  const wrap = el("div", { class: "proof-wrap", "data-reveal": "" });
  wrap.append(kicker("FIG. 01", "THE SAME MOMENT, TWICE"));

  const proof = el("div", { class: "proof" });
  wrap.append(proof);

  const seen = el("figure", { class: "proof-half proof-pilot" });
  seen.append(el("figcaption", { class: "proof-who" }, "WHAT YOU SEE"));
  const plate = el("div", { class: "proof-body" });
  const mark = glyphCanvas(GLYPHS.spiral ?? [], 9);
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
  mark.className = "proof-glyph";
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", "a mark on a lit plate, which only you can see");
  plate.append(mark);
  seen.append(
    plate,
    el(
      "p",
      { class: "proof-note" },
      "A mark burned into the plate above one lever. There is no name for it anywhere " +
        "in the station. You will have to invent one and say it out loud.",
    ),
  );

  // The seam. A lit rule with the mark on it, rather than the word "AND" the
  // first build set in type and then hid with `color: transparent` - which
  // left the two halves of the argument separated by nothing at all.
  const seam = el("div", { class: "proof-seam", "aria-hidden": "true" });
  seam.append(el("span", { class: "proof-seam-mark" }));
  seam.querySelector(".proof-seam-mark")?.append(lampMark(26));

  const told = el("figure", { class: "proof-half proof-keeper" });
  told.append(el("figcaption", { class: "proof-who" }, "WHAT YOUR AGENT GETS"));
  const tool = el("div", { class: "proof-body" });
  tool.append(el("pre", { class: "proof-tool" }, KEEPER_SIDE));
  told.append(
    tool,
    el(
      "p",
      { class: "proof-note" },
      "Every lever feels identical to it. It can pull any of them, read the manual, and " +
        "reach behind the wall. It cannot look at the plate.",
    ),
  );

  proof.append(
    seen,
    seam,
    told,
    el(
      "p",
      { class: "proof-caption" },
      "The same three levers, in the same room, at the same moment.",
    ),
  );
  return wrap;
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

/**
 * The ablation chart.
 *
 * `bare` drops the surrounding panel, for a caller that is already inside one
 * or that wants to give the chart its own heading.
 *
 * **A zero row is drawn, not left empty.** "Human alone" clears no chambers,
 * and an empty track reads as a measurement that is missing rather than as a
 * measurement that came back zero - which is the single most important number
 * on the chart. It gets a capped stub at the origin and its value printed like
 * every other row.
 */
export function ablationChart(bare = false): HTMLElement {
  const chart = el("div", { class: "ablation" });
  for (const row of ABLATION) {
    const line = el("div", {
      class: `ablation-row ${row.who === "Together" ? "together" : ""}`.trim(),
    });
    const track = el("div", { class: "track" });
    const fill = el("i", {});
    fill.style.width = `${String((row.cleared / 4) * 100)}%`;
    // A row that measured zero is marked as measured. Without it the chart's
    // two most important rows are two empty rectangles, which is what a chart
    // with no data in it also looks like.
    if (row.cleared === 0) fill.classList.add("zero");
    track.append(fill);
    line.append(
      el("span", { class: "who" }, row.who),
      track,
      el("span", { class: "value" }, row.cleared.toFixed(2)),
      el("span", { class: "escaped" }, row.note),
    );
    chart.append(line);
  }
  // The axis, so "3.80" is a position on a scale rather than a number beside a
  // rectangle of arbitrary length.
  const axis = el("div", { class: "ablation-axis", "aria-hidden": "true" });
  for (const tick of ["0", "1", "2", "3", "4"]) axis.append(el("span", {}, tick));
  chart.append(axis);

  const caption = el(
    "p",
    { class: "note" },
    "Chambers cleared of four, over twenty fixed seeds. The agent-alone row is a " +
      "ceiling rather than a sample: it plays a uniform draw from the worlds its own " +
      "view cannot tell apart, so no real model does better.",
  );

  if (bare) {
    const bareChart = el("div", { class: "ablation-bare" });
    bareChart.append(chart, caption);
    return bareChart;
  }
  const { section, body } = panel("We ran it three ways");
  body.append(chart, caption);
  return section;
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
export function ghostScreen(): { element: HTMLElement; play: () => void; stop: () => void } {
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
 * Replace a list's contents.
 *
 * Rebuilding rather than diffing. These lists are at most a dozen short rows and
 * are repainted only when the model actually changes, which is a few times a
 * minute; a keyed diff would be more code than the thing it optimises.
 */
export function fill<T>(
  list: HTMLElement,
  items: readonly T[],
  make: (item: T) => HTMLElement,
): void {
  list.replaceChildren(...items.map(make));
}
