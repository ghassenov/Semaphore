/**
 * The game's half of cross-origin tool delegation (doc 03 section 7).
 *
 * The archive is a different document on a different origin, embedded here in
 * a hidden iframe carrying `allow="tools"`. That Permissions Policy is what
 * lets the frame register into the registry at all; the frame's own
 * `exposedTo` narrows the result back to this origin; and `getTools({
 * fromOrigins })` is how this page reads them. All three gates were exercised
 * on Chrome 151 (doc 11 section 4).
 *
 * What this module does *not* do is decide when those tools exist. That stays
 * with `ToolDirector`, because the registry follows the server's machine
 * state and nothing else (D-021). This is a pipe: it puts the frame in the
 * page, waits for it to say it is listening, and forwards the director's tool
 * set across the boundary, holding the most recent set so a frame that
 * finishes loading late still gets it.
 *
 * The whole thing is optional. With no archive origin configured the game
 * registers the two document tools itself and no frame is created, which is
 * the `ARCHIVE_ORIGIN=same` fallback that must ship green until cross-origin
 * delegation is verified in ChatGPT's in-app browser as well as in Chrome.
 */

import {
  ARCHIVE_CHANNEL,
  isArchiveReady,
  isArchiveRegistered,
  type ArchiveToolsMessage,
} from "@semaphore/protocol";

/** What the frame needs to reach the session it is serving documents for. */
export interface ArchiveFrameOptions {
  /** The archive origin, e.g. `https://archive.example`. Never a path. */
  readonly origin: string;
  readonly sessionId: string;
  /**
   * The worker's absolute origin. The frame cannot use a relative path: the
   * game's dev proxy is on the game's origin, not on the archive's.
   */
  readonly workerOrigin: string;
  /**
   * Called whenever the frame reports what it now holds.
   *
   * The manifest plate refreshes from here rather than from the delegation
   * call, because the registration happens on the other side of a
   * `postMessage` and there is no moment on this side at which it is known to
   * have finished.
   */
  readonly onRegistered?: (tools: readonly string[]) => void;
}

/** A live frame, and the one thing the director asks of it. */
export interface ArchiveFrame {
  /** Ask the archive origin to hold exactly these tools. */
  delegate(tools: readonly string[]): void;
  /** Remove the frame, which also takes its tools with it. */
  close(): void;
}

/**
 * Mount the archive frame into `host` and return the delegation handle.
 *
 * `hidden` plus zero size rather than `display: none`: a frame that is not
 * rendered at all is a frame some engines never load, and this one has work
 * to do. It carries no puzzle content and nothing about it is visible, so
 * nothing about the DOM rule (nothing puzzle-critical in the DOM) is in
 * tension here - the frame is a different document and its content is the
 * agent's, not the page's.
 */
export function mountArchiveFrame(host: HTMLElement, options: ArchiveFrameOptions): ArchiveFrame {
  const frame = document.createElement("iframe");
  frame.setAttribute("allow", "tools");
  frame.setAttribute("hidden", "");
  frame.setAttribute("title", "Station archive");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.style.cssText = "position:absolute;width:0;height:0;border:0";

  const query = new URLSearchParams({
    session: options.sessionId,
    worker: options.workerOrigin,
  }).toString();
  frame.src = `${options.origin.replace(/\/$/, "")}/?${query}`;

  let ready = false;
  // The last set asked for, replayed the moment the frame announces itself.
  // Without this, a `begin_shift` that lands before the frame finishes
  // loading would leave `read_manual` unregistered for the whole session.
  let latest: readonly string[] = [];

  const send = (tools: readonly string[]): void => {
    const message: ArchiveToolsMessage = { channel: ARCHIVE_CHANNEL, tools };
    frame.contentWindow?.postMessage(message, options.origin);
  };

  const onMessage = (event: MessageEvent): void => {
    // Both halves matter: the origin check is what stops any other frame or
    // opener talking to us, and the shape check is what stops an unrelated
    // message from another library being read as a tool set.
    if (event.origin !== options.origin) return;
    if (isArchiveReady(event.data)) {
      ready = true;
      send(latest);
      return;
    }
    if (isArchiveRegistered(event.data)) options.onRegistered?.(event.data.registered);
  };

  globalThis.addEventListener("message", onMessage);
  host.append(frame);

  return {
    delegate(tools) {
      latest = tools;
      if (ready) send(tools);
    },
    close() {
      globalThis.removeEventListener("message", onMessage);
      frame.remove();
    },
  };
}
