/**
 * The renderer's boot, and the one object every scene reads from.
 *
 * Two things make this file worth its own module.
 *
 * **Phaser is loaded on demand, never at startup.** The engine is 365KB
 * gzipped against a 400KB budget (doc 07 section 6), and a browser without
 * WebMCP never reaches a canvas at all: it gets the gate screen, which is the
 * whole submission for some judges. Downloading a game engine to tell someone
 * they cannot play would be 365KB spent on nothing. The dynamic import in
 * `start()` keeps the initial bundle at roughly 10KB and pays for the engine
 * exactly once, when a session actually begins. It also happens to be the only
 * way to import Phaser at all in a module this file's tests can load, because
 * Phaser touches `window` at import time.
 *
 * **The scenes read a model rather than receiving events.** One mutable object
 * holds the latest frame, the latest machine state, the log and the registry;
 * scenes read it in `update()`. Push plumbing would mean a subscription per
 * scene per field, each of which is a listener to leak across a transition,
 * which doc 07 section 6 names as this project's likely frame-time bug. A
 * field read costs nothing at 60fps and cannot leak.
 */

import type { PilotView } from "@semaphore/protocol";
import type { ConcordReport, SessionClient, StateSummary } from "../net/sessionClient.js";
import type { CallRecord } from "../webmcp/director.js";
import { listToolNames, onToolChange } from "../webmcp/adapter.js";
import { CANVAS } from "./cutaway.js";
import { formatCall, pushLine } from "./hud.js";

/** How long KEEPER's visor stays lit after a call returns, in milliseconds. */
const VISOR_HOLD_MS = 220;

/** How often the HUD asks the server for the CONCORD measurement. */
const CONCORD_POLL_MS = 2500;

/**
 * Everything the scenes may read.
 *
 * Mutable by design and written only by `Station`. Nothing here is a puzzle
 * fact the server did not send: `view` is `projectForPilot` output verbatim,
 * `tools` is the registry's own answer, and the rest is machine state.
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
   * observed is the total to within a network hop, and it costs no new field
   * on a wire whose whole point is that it carries as little as possible.
   */
  chamberTimerMs: number;
}

/** What `main.ts` holds once the station is up. Mirrors the console's handle. */
export interface StationHandle {
  setState(state: StateSummary): void;
  setView(view: PilotView): void;
  note(line: string): void;
  callStarted(tool: string): void;
  recordCall(call: CallRecord): void;
  /**
   * Re-read the registry into the manifest plate.
   *
   * Needed because one source of registry change happens on another origin:
   * the archive frame registers `read_manual` and `read_station_log`, and
   * whether that fires `toolchange` here is unverified (doc 11 section 4). The
   * frame reports what it holds, and `main.ts` calls this. It reads
   * `getTools()` like every other refresh, so the plate still shows the
   * registry rather than what anybody intended.
   */
  refreshTools(): void;
  dispose(): void;
}

/**
 * Bring the station up inside `parent`.
 *
 * Resolves once Phaser has been fetched and the game created. The caller is
 * free to keep using the returned handle before the first frame arrives; the
 * model simply holds nulls and the scenes draw the waiting state.
 */
export async function startStation(
  parent: HTMLElement,
  client: SessionClient,
  /**
   * Origins whose delegated tools also belong on the manifest. Empty in the
   * single-origin fallback, one entry when the archive origin is embedded.
   */
  toolOrigins: readonly string[] = [],
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

  // The engine and the scenes together, in one chunk, off the critical path.
  const [Phaser, scenes] = await Promise.all([import("phaser"), import("./scenes.js")]);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CANVAS,
    height: CANVAS,
    backgroundColor: "#0d0f14",
    // Nearest-neighbour, no sub-pixel positions. Fractional scaling produces
    // half-pixel shimmer that reads as carelessness (doc 06 section 3).
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      // Snapping to whole multiples of the native size is what makes the
      // scaling integer: FIT alone would happily land on x3.4.
      snap: { width: CANVAS, height: CANVAS },
      autoRound: true,
    },
    scene: [new scenes.LandingScene(model), new scenes.ChamberScene(model)],
  });
  game.scene.start(scenes.SCENE_LANDING);
  let showing: string = scenes.SCENE_LANDING;

  /**
   * The registry, read from the page rather than remembered.
   *
   * `toolchange` fires on every registration and every abort, so this is the
   * only thing that has to keep the manifest plate and KEEPER's limb count
   * honest. Reading `getTools()` inside the listener is the point: a plate
   * drawn from a parallel record of intended registrations would show a tool
   * that failed to register, which is exactly the bug the plate exists to
   * expose.
   */
  const refreshTools = (): void => {
    void listToolNames(toolOrigins).then((names) => {
      model.tools = names;
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
    });
  }, CONCORD_POLL_MS);

  /** Swap to the interior once there is a session, and never swap back. */
  function showChamber(): void {
    if (showing === scenes.SCENE_CHAMBER) return;
    showing = scenes.SCENE_CHAMBER;
    game.scene.stop(scenes.SCENE_LANDING);
    game.scene.start(scenes.SCENE_CHAMBER);
  }

  return {
    setState(state: StateSummary) {
      model.state = state;
      if (state.phase !== "LOBBY") showChamber();
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
      if (view.phase !== "LOBBY") showChamber();
    },
    note(line: string) {
      model.log = pushLine(model.log, line);
    },
    callStarted(_tool: string) {
      // Held rather than set true and cleared, so a call that returns in four
      // milliseconds still produces a visible pulse. The human's only cue that
      // their partner is doing something must not depend on the call being slow.
      model.busyUntilMs = performance.now() + VISOR_HOLD_MS;
    },
    recordCall(call: CallRecord) {
      model.busyUntilMs = performance.now() + VISOR_HOLD_MS;
      model.log = pushLine(model.log, formatCall(call.tool, call.outcome, call.durationMs));
    },
    refreshTools,
    dispose() {
      clearInterval(concordTimer);
      stopWatchingTools();
      game.destroy(true);
    },
  };
}
