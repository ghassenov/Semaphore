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

import { isSupported } from "./webmcp/adapter.js";
import { SessionClient, sessionIdFrom } from "./net/sessionClient.js";
import { SessionSocket } from "./net/socket.js";
import { ToolDirector } from "./webmcp/director.js";
import { renderGate, renderStation } from "./ui.js";
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

  let station: StationHandle | null = null;
  const shell = renderStation(root, {
    client,
    onNote: (line) => station?.note(line),
  });

  // The shell is built before the director because the director needs
  // somewhere to put the notepad form the moment the session tier mounts, and
  // that can happen on the very first response.
  const director = new ToolDirector(client, {
    onState: (state) => station?.setState(state),
    onCallStart: (tool) => station?.callStarted(tool),
    onCall: (call) => station?.recordCall(call),
    notepadHost: shell.notepadHost,
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
  station = await startStation(shell.stage, client);
  socket.watch((view) => station?.setView(view));

  await director.mountEntry();
}
