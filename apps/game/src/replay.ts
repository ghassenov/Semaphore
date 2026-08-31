/**
 * The replay viewer: one finished session, on two tracks, scrubbable.
 *
 * Doc 08 phase 7.2, and the other end of the link the ending offers (phase
 * 3.2). It is served under `/replay/:id` on the same Pages project as the game
 * (repo CLAUDE.md section 3), which is why `main.ts` branches on the path
 * rather than this being a second bundle.
 *
 * ## What it draws, and why those three rows
 *
 * The game's whole claim is that two parties held different halves of the same
 * room and had to talk. A replay that showed one merged list of events would
 * be a log viewer and would say nothing about that. So the timeline is two
 * tracks that share an axis - amber for what PILOT did and heard, cyan for
 * what KEEPER called - and underneath them the CONCORD trace, which is the
 * quantity the other two rows were spending. Where the amber row goes quiet
 * and the trace stops falling, the pair had stopped telling each other
 * anything, and that is visible at a glance rather than by reading.
 *
 * ## The room is the station's own monitor
 *
 * Not a second renderer, and not the 143KB engine. `render/monitor.ts` is what
 * the Archive's CRT plays and what SPECTATE plays, and the server hands this
 * page the same `pilotTrack` projection those use, so "the same monitor the
 * ghosts were on" is true of the code. Scrubbing moves the monitor and the
 * playhead together because they read the same millisecond.
 *
 * ## Nothing here can leak the session it replays
 *
 * The payload arrives already projected: `apps/worker/src/replay.ts` drops
 * every `state_delta`, which is where the `HIDDEN` fields are. This page never
 * asks for anything else, and could not display it if it did.
 */

import { CHAMBER_NAMES, type ChamberId } from "@semaphore/protocol";
import { paintMonitor } from "./render/monitor.js";
import { wordmark } from "./ui/parts.js";

/** The projection the worker's `/replay/:id` route returns. */
interface Replay {
  readonly sessionId: string;
  readonly designation: string;
  readonly difficulty: string;
  readonly mode: string;
  readonly outcome: string;
  readonly chambersCleared: number;
  readonly durationMs: number;
  readonly staminaWindowMs: number;
  readonly medianLatencyMs: number;
  readonly calls: readonly {
    readonly t: number;
    readonly tool: string;
    readonly result: "ok" | "error";
    readonly latencyMs: number;
    readonly wasted: boolean;
    readonly concordBits: number;
  }[];
  readonly beats: readonly {
    readonly t: number;
    readonly kind: "action" | "audible";
    readonly what: string;
    readonly count?: number;
  }[];
  readonly chambers: readonly {
    readonly t: number;
    readonly kind: string;
    readonly chamber: ChamberId;
  }[];
  readonly track: Parameters<typeof paintMonitor>[1];
}

/**
 * The session a replay URL names, or null if this is not a replay URL.
 *
 * **`/replay?id=...` only, and doc 08 phase 7.2's `/replay/:sessionId` is
 * deliberately not accepted.** The path form failed twice, independently, and
 * neither failure shows up in development by accident:
 *
 *   - The build sets `base: "./"` so one bundle works from a Pages project
 *     root and from a preview deployment's sub-path. Relative asset references
 *     resolve against the current URL's *directory*, so at `/replay/abc-123`
 *     the browser asks for `/replay/assets/index-*.js` and gets a 404. The
 *     page is blank in production and perfect in development, where Vite
 *     serves an absolute `/src/main.ts` instead. Verified against a real
 *     build.
 *   - The worker's own `/replay/:id` API answers on that same path with a
 *     `cache-control` header, so once the page has fetched its data, a later
 *     navigation to the same URL is served the cached JSON instead of the app.
 *     Observed in Chrome: one request, 200, and no modules loaded at all.
 *
 * A query parameter fixes both at once. `/replay` has directory `/` and loads
 * the same assets the game does, and the page and the API stop sharing a URL.
 */
export function replayIdFrom(pathname: string, search = ""): string | null {
  if (!/^\/replay\/?$/.test(pathname)) return null;
  const asked = new URLSearchParams(search).get("id")?.trim() ?? "";
  return asked.length > 0 ? asked : null;
}

/** The canonical, always-loadable URL for a replay. */
export function replayUrl(sessionId: string): string {
  const url = new URL(globalThis.location.href);
  url.pathname = "/replay";
  url.search = `?id=${encodeURIComponent(sessionId)}`;
  url.hash = "";
  return url.toString();
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

/** Whole seconds as `m:ss`, which is how a session's length reads. */
function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * What a replay URL shows when there is nothing behind it.
 *
 * This is the state a *shared* link most often lands in - a session that was
 * abandoned, or one whose row has gone - so it is the version of this page
 * most likely to be somebody's first sight of the project. It used to be a
 * headline in the top-left corner and a sentence in the top-right with ninety
 * percent of the page empty and no way onward at all.
 *
 * It says what happened, and then it offers the thing the visitor actually
 * came for.
 */
function deadEnd(why: string): HTMLElement {
  const dead = el("section", { class: "replay-dead" });
  dead.append(
    wordmark("large"),
    el("h1", {}, "There is no shift on this tape"),
    // The worker's own message, which already explains that a session is
    // written only when it escapes. Restating it underneath was the same
    // sentence twice.
    el("p", { class: "lede" }, why),
  );
  const back = el("a", { class: "spectate", href: "./" }, "PLAY A SHIFT INSTEAD");
  dead.append(back);
  return dead;
}

/** Mount the viewer for one session id. */
export async function renderReplay(root: HTMLElement, sessionId: string): Promise<void> {
  root.replaceChildren();
  const main = el("main", { class: "replay" });
  root.append(main);

  const origin = import.meta.env.VITE_WORKER_ORIGIN ?? "";
  let replay: Replay;
  try {
    const response = await fetch(`${origin}/replay/${encodeURIComponent(sessionId)}`);
    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      main.append(deadEnd(body.message ?? "That session could not be read."));
      return;
    }
    replay = (await response.json()) as Replay;
  } catch {
    main.append(deadEnd("The station could not be reached from this page."));
    return;
  }

  // ---- Who, and how it went.
  const head = el("header", { class: "replay-head" });
  // The mark, because a shared replay link is often somebody's first sight of
  // the project and an unlabelled chart says nothing about what it is from.
  head.append(
    wordmark("large"),
    el("p", { class: "eyebrow" }, "SESSION REPLAY"),
    el("h1", {}, replay.designation || "UNNAMED"),
    el(
      "p",
      { class: "lede" },
      `${replay.outcome}, ${String(replay.chambersCleared)} of four chambers, ` +
        `${clock(replay.durationMs)} on the clock. ${replay.difficulty}, ${replay.mode} mode.`,
    ),
  );
  main.append(head);

  // ---- The room, on the station's own monitor.
  const screen = el("canvas", { class: "ghost-screen replay-screen", role: "img" });
  screen.width = 384;
  screen.height = 252;
  screen.setAttribute(
    "aria-label",
    `The room ${replay.designation} was in, at the scrubbed moment.`,
  );
  main.append(screen);

  // ---- The two tracks and the trace, as one SVG that scales.
  const W = 1000;
  const H = 190;
  const span = Math.max(1, replay.durationMs);
  const x = (t: number) => (t / span) * W;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${String(W)} ${String(H)}`);
  svg.setAttribute("class", "replay-tracks");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `Two tracks over ${clock(replay.durationMs)}: ${String(replay.beats.length)} things PILOT ` +
      `did or heard, ${String(replay.calls.length)} calls by KEEPER, and the ambiguity between them.`,
  );

  function line(cls: string, d: string): void {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", cls);
    path.setAttribute("d", d);
    svg.append(path);
  }

  // Chamber boundaries first, underneath everything, because they are the
  // frame the two tracks are read against rather than a thing that happened.
  const entered = replay.chambers.filter((boundary) => boundary.kind === "enter");
  const labels: { name: SVGTextElement; room: number; short: string }[] = [];
  for (const [index, boundary] of entered.entries()) {
    const at = x(boundary.t);
    line("replay-boundary", `M ${String(at)} 0 V ${String(H)}`);
    const name = document.createElementNS("http://www.w3.org/2000/svg", "text");
    name.setAttribute("class", "replay-room");
    // A label near the end of the axis runs off it: the last chamber is
    // always the shortest band and its name is the longest, so
    // "CHAMBER III - THE CONCORD LOCK" was cut to "THE CONCORD LOC". Past
    // three quarters across, hang the name off the boundary to the left
    // instead of to the right; it still reads against the same line.
    const late = at > W * 0.75;
    name.setAttribute("x", String(at + (late ? -6 : 6)));
    name.setAttribute("y", "12");
    if (late) name.setAttribute("text-anchor", "end");
    name.textContent = CHAMBER_NAMES[boundary.chamber];
    svg.append(name);

    // How much room this name has before it reaches its neighbour's. Measured
    // and applied once the SVG is in the document, below.
    const neighbour = late ? entered[index - 1] : entered[index + 1];
    const edge = neighbour ? x(neighbour.t) : late ? 0 : W;
    labels.push({
      name,
      room: Math.abs(edge - at) - 10,
      short: (CHAMBER_NAMES[boundary.chamber].split(" - ")[0] ?? "").trim(),
    });
  }

  // PILOT, amber, on top. Only this party ever sees the room.
  for (const beat of replay.beats) {
    const mark = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    mark.setAttribute("class", `replay-pilot ${beat.kind}`);
    mark.setAttribute("x", String(x(beat.t) - 1.5));
    mark.setAttribute("y", "28");
    mark.setAttribute("width", "3");
    mark.setAttribute("height", "26");
    svg.append(mark);
  }

  // KEEPER, cyan, beneath. A wasted call is drawn hollow: it is the one thing
  // in this row that cost the pair time and bought nothing, and the benchmark
  // counts it (doc 07 section 2.2).
  for (const call of replay.calls) {
    const mark = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    mark.setAttribute(
      "class",
      `replay-keeper${call.wasted ? " wasted" : ""}${call.result === "error" ? " failed" : ""}`,
    );
    mark.setAttribute("x", String(x(call.t) - 1.5));
    mark.setAttribute("y", "68");
    mark.setAttribute("width", "3");
    mark.setAttribute("height", "26");
    svg.append(mark);
  }

  // The CONCORD trace underneath, which is what the two rows above were
  // spending. Ambiguity falls as the pair narrows the world down; a flat
  // stretch under a busy cyan row is an agent working without a partner.
  const bits = replay.calls.map((call) => call.concordBits);
  const ceiling = Math.max(1, ...bits);
  const floorY = H - 12;
  const topY = 112;
  if (replay.calls.length > 0) {
    const points = replay.calls
      .map(
        (call, index) =>
          `${index === 0 ? "M" : "L"} ${String(x(call.t))} ` +
          `${String(floorY - (call.concordBits / ceiling) * (floorY - topY))}`,
      )
      .join(" ");
    line("replay-concord", points);
  }
  main.append(svg);

  /*
   * Make every chamber name fit the band it was written in, by **measuring**.
   *
   * The right-hand overflow handled above was only half the problem. A chamber
   * cleared quickly is a narrow band, and its name simply ran into the name of
   * the chamber after it: the Airlock and the Signal Room printed on top of
   * each other as "CHAMBER 0HAMBERE IAI-RLOHEK SIGNAL ROOM", which is the same
   * text-over-text defect this project has now produced in four places.
   *
   * `getComputedTextLength` rather than a character count, because this app's
   * own rule is that a caption is measured and never estimated. **After
   * `main.append(svg)`, not before**: the measurement is a layout question, and
   * an SVG text node that is not yet in the document answers it with zero -
   * which is silently "it fits", and was how the first attempt at this fix
   * changed nothing at all.
   *
   * A name that will not fit falls back to its number, and one that still will
   * not fit is dropped. The boundary line stays either way, so a band is never
   * lost, only its caption.
   */
  for (const { name, room, short } of labels) {
    if (name.getComputedTextLength() <= room) continue;
    name.textContent = short;
    if (name.getComputedTextLength() > room) name.remove();
  }

  // ---- The scrubber. A native range input, deliberately.
  //
  // It is keyboard-driven, arrow keys and Home and End included, announced by
  // a screen reader with its own value, and draggable, none of which is code
  // here. A hand-built scrub bar would have to earn all four back.
  const scrub = el("input", {
    type: "range",
    class: "replay-scrub",
    min: "0",
    max: String(span),
    step: "100",
    value: "0",
    "aria-label": "Scrub through the session",
  });
  const readout = el("p", { class: "replay-readout", "aria-live": "off" });
  main.append(scrub, readout);

  /*
   * The transcript, which is what makes this a replay rather than a chart.
   *
   * The two tracks and the ambiguity trace say *when* and *how much*; they
   * cannot say what happened, and a viewer looking at a row of tick marks has
   * no way to find out. This is the session as a list of things that were
   * done, in order, in the two colours the whole game is coded in: cyan for
   * what KEEPER called, amber for what PILOT did and heard.
   *
   * It follows the scrubber and the scrubber follows it. Clicking a line seeks
   * to it, which is the reason to have both: the chart is how you find an
   * interesting moment and the list is how you read one.
   */
  const transcript = el("ol", { class: "replay-log" });
  type Entry = { t: number; row: HTMLElement };
  const entries: Entry[] = [];

  /** Every event on one axis, oldest first, whichever track it came from. */
  const events = [
    ...replay.calls.map((call) => ({
      t: call.t,
      side: "keeper" as const,
      what: call.tool,
      // The code is on the worker's row and not on the client's, so this says
      // that the call failed rather than inventing a reason it did not receive.
      note:
        call.result === "error"
          ? "refused"
          : call.wasted
            ? "told it nothing new"
            : `${call.concordBits.toFixed(2)} bits left`,
      bad: call.result === "error",
    })),
    ...replay.beats.map((beat) => ({
      t: beat.t,
      side: "pilot" as const,
      what: beat.kind === "audible" ? beat.what : `${beat.what}`,
      note: beat.count === undefined ? beat.kind : `${String(beat.count)} detents`,
      bad: false,
    })),
  ].sort((a, b) => a.t - b.t);

  for (const event of events) {
    const row = el("li", { class: `replay-entry ${event.side}${event.bad ? " bad" : ""}` });
    row.append(
      el("span", { class: "replay-when" }, clock(event.t)),
      el("span", { class: "replay-what" }, event.what),
      el("span", { class: "replay-note" }, event.note),
    );
    row.addEventListener("click", () => {
      scrub.value = String(event.t);
      scrub.dispatchEvent(new Event("input"));
    });
    transcript.append(row);
    entries.push({ t: event.t, row });
  }
  main.append(transcript);

  /** The entry the playhead is on, so it is only scrolled to when it changes. */
  let showing: HTMLElement | null = null;

  /** What was happening at `t`, in words, for the readout and the screen. */
  function at(t: number): void {
    paintMonitor(screen, replay.track, t);
    const room = [...replay.chambers].filter((c) => c.kind === "enter" && c.t <= t).pop();
    const lastCall = [...replay.calls].filter((call) => call.t <= t).pop();
    const parts = [clock(t)];
    if (room) parts.push(CHAMBER_NAMES[room.chamber]);
    if (lastCall) {
      parts.push(`KEEPER: ${lastCall.tool}`, `${lastCall.concordBits.toFixed(2)} bits`);
    }
    readout.textContent = parts.join("   ");
    const head = svg.querySelector(".replay-playhead");
    head?.setAttribute("d", `M ${String(x(t))} 0 V ${String(H)}`);

    // Everything up to the playhead is in the past; the newest of those is
    // where the reader is. Scrolled into view only when it changes, so
    // dragging the scrubber does not fight the list for the scroll position.
    let live: HTMLElement | null = null;
    for (const entry of entries) {
      const past = entry.t <= t;
      entry.row.classList.toggle("past", past);
      if (past) live = entry.row;
    }
    for (const entry of entries) entry.row.classList.toggle("now", entry.row === live);
    if (live !== null && live !== showing) {
      showing = live;
      live.scrollIntoView({ block: "nearest" });
    }
  }

  line("replay-playhead", "M 0 0 V 0");
  scrub.addEventListener("input", () => {
    at(Number(scrub.value));
  });
  at(0);

  // ---- The shareable link, which is the whole point of the route.
  const share = el("p", { class: "replay-share" });
  // The canonical form, not `location.href`: somebody who arrived by the path
  // form should still be handed the link that loads everywhere.
  const shareable = replayUrl(replay.sessionId);
  const link = el("code", {}, shareable);
  const copy = el("button", { type: "button", class: "spectate" }, "Copy link");
  copy.addEventListener("click", () => {
    void navigator.clipboard?.writeText(shareable).then(
      () => {
        copy.textContent = "Copied";
      },
      () => {
        // Clipboard access can be refused, and a button that silently does
        // nothing is worse than one that says so. The link is on screen and
        // selectable either way.
        copy.textContent = "Copy failed";
      },
    );
  });
  share.append(link, copy);
  main.append(share);
}
