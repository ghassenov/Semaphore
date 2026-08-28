/**
 * The client's entry point: feature-detect, then either open the gate screen
 * or bring the station up.
 *
 * Deliberately short. Everything it does is decide which of two things the
 * page is, wire the director to the console, and register the front door.
 */

import { isSupported } from "./webmcp/adapter.js";
import { SessionClient, sessionIdFrom } from "./net/sessionClient.js";
import { SessionSocket } from "./net/socket.js";
import { ToolDirector } from "./webmcp/director.js";
import { renderConsole, renderGate, type ConsoleHandle } from "./ui.js";

const root = document.getElementById("app");
if (!root) throw new Error("The page is missing its #app root");

if (!isSupported()) {
  // Never a throw, and never a broken canvas. For some judges this screen is
  // the whole submission (doc 07 section 6).
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

  let console_: ConsoleHandle | null = null;
  const director = new ToolDirector(client, {
    onState: (state) => console_?.setState(state),
    onCall: (call) => console_?.recordCall(call),
  });

  console_ = renderConsole(root, {
    client,
    onNote: (line) => console_?.note(line),
  });
  // PILOT's view arrives on its own channel, pushed. Opened before the front
  // door is registered so the first frame is already in hand by the time an
  // agent has read the manifest.
  const socket = new SessionSocket(client.sessionId, {
    workerOrigin: import.meta.env.VITE_WORKER_ORIGIN ?? "",
  });
  socket.watch((view) => console_?.setView(view));
  socket.open();

  console_.note(`Session ${client.sessionId}. Waiting for KEEPER to call begin_shift.`);

  await director.mountEntry();
}
