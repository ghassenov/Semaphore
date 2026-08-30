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
      main.append(
        el("h1", {}, "Nothing to replay"),
        el("p", { class: "lede" }, body.message ?? "That session could not be read."),
      );
      return;
    }
    replay = (await response.json()) as Replay;
  } catch {
    main.append(
      el("h1", {}, "Nothing to replay"),
      el("p", { class: "lede" }, "The station could not be reached."),
    );
    return;
  }

  // ---- Who, and how it went.
  const head = el("header", { class: "replay-head" });
  head.append(
    el("p", { class: "eyebrow" }, "SEMAPHORE - SESSION REPLAY"),
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
  for (const boundary of replay.chambers) {
    if (boundary.kind !== "enter") continue;
    line("replay-boundary", `M ${String(x(boundary.t))} 0 V ${String(H)}`);
    const name = document.createElementNS("http://www.w3.org/2000/svg", "text");
    name.setAttribute("class", "replay-room");
    // A label near the end of the axis runs off it: the last chamber is
    // always the shortest band and its name is the longest, so
    // "CHAMBER III - THE CONCORD LOCK" was cut to "THE CONCORD LOC". Past
    // three quarters across, hang the name off the boundary to the left
    // instead of to the right; it still reads against the same line.
    const late = x(boundary.t) > W * 0.75;
    name.setAttribute("x", String(x(boundary.t) + (late ? -6 : 6)));
    name.setAttribute("y", "12");
    if (late) name.setAttribute("text-anchor", "end");
    name.textContent = CHAMBER_NAMES[boundary.chamber];
    svg.append(name);
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
