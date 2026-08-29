/**
 * The renderer's boot, and the one object every frame reads from.
 *
 * Two things make this file worth its own module, and both survived the engine
 * being replaced (D-042).
 *
 * **The engine is loaded on demand, never at startup.** A browser without
 * WebMCP never reaches a viewport at all: it gets the gate screen, which is the
 * whole submission for some judges (doc 07 section 6). Downloading a 3D engine
 * in order to tell somebody they cannot play would be a few hundred kilobytes
 * spent on nothing. The dynamic `import()` in `startStation` keeps the eager
 * entry small and pays for the engine exactly once, when a session begins.
 * `scripts/check-bundle.mjs` fails the build if a static import ever undoes
 * this, because nothing about the resulting page would look wrong.
 *
 * **The stage reads a model rather than receiving events.** One mutable object
 * holds the latest frame, the latest machine state, the log and the registry,
 * and the render loop reads it. Push plumbing would mean a subscription per
 * consumer per field, each of which is a listener to leak across a session,
 * which doc 07 section 4.3 names as this project's likely frame-time bug. A
 * field read costs nothing at 60fps and cannot leak.
 */

import type { PilotView } from "@semaphore/protocol";
import type { ConcordReport, SessionClient, StateSummary } from "../net/sessionClient.js";
import type { CallRecord } from "../webmcp/director.js";
import { listToolNames, onToolChange } from "../webmcp/adapter.js";
import { formatCall, pushLine } from "./hud.js";

/** How long KEEPER's visor stays lit after a call returns, in milliseconds. */
const VISOR_HOLD_MS = 260;

/** How often the console asks the server for the CONCORD measurement. */
const CONCORD_POLL_MS = 2500;

/**
 * Everything the stage and the console may read.
 *
 * Mutable by design and written only by `startStation`. Nothing here is a
 * puzzle fact the server did not send: `view` is `projectForPilot` output
 * verbatim, `tools` is the registry's own answer, and the rest is machine
 * state.
 */
export interface StationModel {
  /** The latest frame off the view socket, or null before the first arrives. */
  view: PilotView | null;
  /** The latest machine state off a tool response. Moves independently. */
  state: StateSummary | null;
  concord: ConcordReport | null;
  /** Newest first, capped at what the panel can show. */
  log: readonly string[];
  /** `getTools()` as the page reports it, never a guess. */
  tools: readonly string[];
  /** `performance.now()` value until which KEEPER's visor stays lit. */
  busyUntilMs: number;
  /**
   * The largest `remainingMs` seen in this chamber, which is its full clock.
   *
   * Derived rather than fetched: the chamber's base timer is scaled by the
   * difficulty preset, and the client is not told which preset was chosen. The
   * first frame of a room carries very nearly the full clock, so the maximum
   * observed is the total to within a network hop, and it costs no new field on
   * a wire whose whole point is that it carries as little as possible.
   */
  chamberTimerMs: number;
}

/** What `main.ts` holds once the station is up. */
export interface StationHandle {
  setState(state: StateSummary): void;
  setView(view: PilotView): void;
  note(line: string): void;
  callStarted(tool: string): void;
  recordCall(call: CallRecord): void;
  /**
   * Re-read the registry into the manifest plate and KEEPER's body.
   *
   * Needed because one source of registry change happens on another origin: the
   * archive frame registers `read_manual` and `read_station_log`, and whether
   * that fires `toolchange` here is unverified (doc 11 section 4). The frame
   * reports what it holds, and `main.ts` calls this. It reads `getTools()` like
   * every other refresh, so the plate and the body still show the registry
   * rather than what anybody intended.
   */
  refreshTools(): void;
  dispose(): void;
}

/**
 * Bring the station up inside `parent`.
 *
 * Resolves once the engine has been fetched and the scene created. The caller
 * is free to use the returned handle before the first frame arrives; the model
 * simply holds nulls and the stage draws the waiting state.
 */
export async function startStation(
  parent: HTMLElement,
  client: SessionClient,
  /**
   * Origins whose delegated tools also belong on the manifest. Empty in the
   * single-origin fallback, one entry when the archive origin is embedded.
   */
  toolOrigins: readonly string[] = [],
  /**
   * Called after every change to the model, so the DOM console can repaint.
   *
   * A callback rather than the console polling, because the model changes a few
   * times a minute and a repaint per animation frame would be several hundred
   * pointless DOM writes a second. The stage still reads the model every frame;
   * it is drawing, where that is what drawing is.
   */
  onChange: (model: StationModel) => void = () => {},
): Promise<StationHandle> {
  const model: StationModel = {
    view: null,
    state: null,
    concord: null,
    log: [],
    tools: [],
    busyUntilMs: 0,
    chamberTimerMs: 0,
  };

  // The engine and the scene together, in one chunk, off the critical path.
  const { createStage } = await import("./stage.js");
  const stage = createStage(parent, model);

  // The viewport is a flexible box in a responsive console, so its size is not
  // a constant anybody can be told once. A `ResizeObserver` is the only thing
  // that catches every cause: a window resize, the console reflowing at a
  // breakpoint, and a panel above it growing by one line.
  const resizer = new ResizeObserver(() => {
    stage.resize();
  });
  resizer.observe(parent);

  /**
   * The registry, read from the page rather than remembered.
   *
   * `toolchange` fires on every registration and every abort, so this is the
   * only thing that has to keep the manifest plate and KEEPER's body honest.
   * Reading `getTools()` inside the listener is the point: a body drawn from a
   * parallel record of intended registrations would grow a limb for a tool that
   * failed to register, which is exactly the bug the manifest exists to expose.
   */
  const refreshTools = (): void => {
    void listToolNames(toolOrigins).then((names) => {
      model.tools = names;
      onChange(model);
    });
  };
  const stopWatchingTools = onToolChange(refreshTools);
  refreshTools();

  // The meter's own clock, independent of both the socket and the tool calls,
  // because ambiguity changes when the world does and the world can change
  // without either.
  const concordTimer = setInterval(() => {
    if (model.state === null && model.view === null) return;
    void client.concord().then((report) => {
      model.concord = report;
      onChange(model);
    });
  }, CONCORD_POLL_MS);

  return {
    setState(state: StateSummary) {
      model.state = state;
      onChange(model);
    },
    setView(view: PilotView) {
      // A new room resets the derived clock, so a long chamber following a
      // short one does not inherit the short one's scale and read as urgent
      // from its first second.
      if (view.chamber !== model.view?.chamber) model.chamberTimerMs = 0;
      if (view.remainingMs !== null) {
        model.chamberTimerMs = Math.max(model.chamberTimerMs, view.remainingMs);
      }
      model.view = view;
      onChange(model);
    },
    note(line: string) {
      model.log = pushLine(model.log, line);
      onChange(model);
    },
    callStarted(_tool: string) {
      // Held rather than set true and cleared, so a call that returns in four
      // milliseconds still produces a visible pulse. The human's only cue that
      // their partner is doing something must not depend on the call being
      // slow.
      model.busyUntilMs = performance.now() + VISOR_HOLD_MS;
    },
    recordCall(call: CallRecord) {
      model.busyUntilMs = performance.now() + VISOR_HOLD_MS;
      model.log = pushLine(model.log, formatCall(call.tool, call.outcome, call.durationMs));
      onChange(model);
    },
    refreshTools,
    dispose() {
      clearInterval(concordTimer);
      stopWatchingTools();
      resizer.disconnect();
      stage.dispose();
    },
  };
}
