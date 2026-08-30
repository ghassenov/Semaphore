/**
 * The client's entry point: feature-detect, then either open the gate screen
 * or bring the station up.
 *
 * Deliberately short. Everything it does is decide which of two things the
 * page is, wire the director and the view feed to the renderer, and register
 * the front door.
 *
 * Note the order. The DOM shell and the view socket exist before the renderer
 * is awaited, because `startStation` fetches a game engine over the network
 * and the session should not be waiting on that to begin. Frames that arrive
 * during the fetch are held by the socket and handed to the renderer the
 * moment it can take them.
 */

import { DOCUMENT_TOOL_NAMES } from "@semaphore/protocol";
import { isSupported } from "./webmcp/adapter.js";
import { mountArchiveFrame, type ArchiveFrame } from "./webmcp/archiveFrame.js";
import { SessionClient, sessionIdFrom } from "./net/sessionClient.js";
import { SessionSocket } from "./net/socket.js";
import { ToolDirector } from "./webmcp/director.js";
import { renderGate, renderStation } from "./ui.js";
import { createStationAudio } from "./audio/index.js";
import { startStation, type StationHandle } from "./render/station.js";

const root = document.getElementById("app");
if (!root) throw new Error("The page is missing its #app root");

if (!isSupported()) {
  // Never a throw, and never a broken canvas. For some judges this screen is
  // the whole submission (doc 07 section 6), and it must not cost them a
  // 365KB game engine to be told they cannot play: the renderer is behind a
  // dynamic import that this branch never reaches.
  renderGate(root);
} else {
  void start(root);
}

async function start(root: HTMLElement): Promise<void> {
  // The session id is the seed (doc 05 section 9), so `?seed=` reproduces a
  // session exactly: the same four chambers, the same vandalised page, the
  // same cipher offset. It is a random opaque string and carries nothing else.
  const client = new SessionClient(
    sessionIdFrom(globalThis.location.search),
    import.meta.env.VITE_WORKER_ORIGIN ?? "",
  );

  // Silent and inert until the launch card is clicked. Every browser refuses
  // an AudioContext opened outside a user gesture, and refuses it silently, so
  // the handle exists from here and the graph does not.
  const audio = createStationAudio();

  let station: StationHandle | null = null;
  const shell = renderStation(root, {
    client,
    audio,
    onNote: (line) => station?.note(line),
  });

  // The archive origin, when there is one (doc 03 section 7).
  //
  // `VITE_ARCHIVE_ORIGIN` is the `ARCHIVE_ORIGIN=same|cross` flag: unset is
  // `same`, and the game registers `read_manual` and `read_station_log`
  // itself; an origin is `cross`, and a hidden frame on that origin registers
  // them instead, exposed back here. Both paths ship green, and the default is
  // `same` until cross-origin delegation is verified in ChatGPT's in-app
  // browser as well as in Chrome (`apps/archive/CLAUDE.md`).
  //
  // The frame is given the worker's absolute origin rather than the empty
  // string the game uses: a relative path on the archive origin would reach
  // the archive's own server, not the station.
  const archiveOrigin = (import.meta.env.VITE_ARCHIVE_ORIGIN ?? "").trim();
  const archive: ArchiveFrame | null = archiveOrigin
    ? mountArchiveFrame(shell.archiveHost, {
        origin: archiveOrigin,
        sessionId: client.sessionId,
        workerOrigin: import.meta.env.VITE_WORKER_ORIGIN || globalThis.location.origin,
        onRegistered: () => station?.refreshTools(),
      })
    : null;

  // The shell is built before the director because the director needs
  // somewhere to put the notepad form the moment the session tier mounts, and
  // that can happen on the very first response.
  const director = new ToolDirector(client, {
    onState: (state) => station?.setState(state),
    onCallStart: (tool) => {
      station?.callStarted(tool);
      // The `AUDIBLE` channel's other half (doc 06 section 11): PILOT cannot
      // see what KEEPER is doing but always hears that it is doing something,
      // muffled and through the deck. It is what makes a rotation that
      // registers no detents distinguishable from KEEPER sitting still.
      audio.toolCall(tool);
    },
    onCall: (call) => station?.recordCall(call),
    notepadHost: shell.notepadHost,
    // Which tools this page registers, and which it asks the other origin
    // for. The director still decides *when* each one exists; delegation only
    // changes where the registration happens (D-021 is unaffected).
    ...(archive ? { delegated: DOCUMENT_TOOL_NAMES, onDelegate: archive.delegate } : {}),
  });

  // PILOT's view arrives on its own channel, pushed. Opened before the front
  // door is registered so the first frame is already in hand by the time an
  // agent has read the manifest.
  const socket = new SessionSocket(client.sessionId, {
    workerOrigin: import.meta.env.VITE_WORKER_ORIGIN ?? "",
  });
  socket.watch((view) => station?.setView(view));
  // The frame also moves the registry, and it is the only thing that can in
  // one case: a chamber whose timer runs out with nobody calling is deadlocked
  // by the Durable Object's alarm (D-018), which produces a pushed frame and
  // no response at all. Without this, `press_key` stays registered on a room
  // that cannot answer, which is the registry telling an agent a lie.
  //
  // `PilotView` is a structural superset of `StateSummary`, so this is the
  // same machine state by the same route, arriving on the other channel.
  // `applyState` is idempotent by tier, so a frame that changes nothing costs
  // one comparison.
  socket.watch((view) => void director.applyState(view));
  socket.open();

  // The engine, on demand. `watch` replays the latest frame to a subscriber
  // that arrives late, so re-registering here costs one call and closes the
  // window in which frames would otherwise have been dropped on the floor.
  station = await startStation(
    shell.stage,
    client,
    archiveOrigin ? [archiveOrigin] : [],
    // The console paints from the same model the scenes read, so the readouts
    // beside the canvas and the room on it can never disagree about the frame.
    (model) => shell.update(model),
  );
  socket.watch((view) => station?.setView(view));

  await director.mountEntry();
}
