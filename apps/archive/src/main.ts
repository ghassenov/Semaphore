/**
 * The archive origin's boot.
 *
 * Short by design: read the two parameters the embed carries, work out who
 * embedded us, then hand tool lifetime to the parent over `postMessage` and
 * let `Registrar` do the rest.
 *
 * **The parent origin is read from `document.referrer`, never hardcoded.** On
 * localhost the second origin is a second port and in production it is a
 * second hostname, and a domain name in a source file is a bug (repo
 * CLAUDE.md section 3). It is also the value `exposedTo` is pinned to and the
 * only origin whose messages are honoured, so getting it from the embed
 * rather than from configuration means the two can never disagree.
 *
 * A page opened directly, with no referrer and no session, says so and
 * registers nothing. That is the honest outcome: there is no session to read
 * a manual out of, and a tool exposed to nobody would be a tool nobody can
 * call.
 */

import {
  ARCHIVE_CHANNEL,
  isArchiveTools,
  type ArchiveReadyMessage,
  type ArchiveRegisteredMessage,
} from "@semaphore/protocol";
import { Registrar, getRegistry } from "./registrar.js";
import { manual, stationLog, stationRefFrom } from "./station.js";

const status = document.getElementById("status");
const report = (text: string) => {
  if (status) status.textContent = text;
};

const ref = stationRefFrom(location.search);
const parentOrigin = document.referrer ? new URL(document.referrer).origin : null;
const registry = getRegistry();

if (!ref) {
  report("No session in the address. This page is embedded by the game, not opened on its own.");
} else if (!parentOrigin || window.parent === window) {
  report("Not embedded, so there is no origin to expose tools to.");
} else if (!registry) {
  report("This browser has no WebMCP registry, so the archive has nothing to offer it.");
} else {
  const registrar = new Registrar(registry, parentOrigin, {
    read_manual: (input) => manual(ref, String(input.section ?? "index")),
    read_station_log: (input) => stationLog(ref, Number(input.entry ?? 0)),
  });

  // Tool lifetime belongs to the game's director, which is the only thing
  // that knows the server's machine state (D-021). Each message carries the
  // complete set that should exist now rather than a delta, so a message lost
  // to a reload cannot leave the two registries permanently disagreeing: the
  // next one puts this origin back in step.
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== parentOrigin || !isArchiveTools(event.data)) return;
    void registrar.apply(event.data.tools).then(() => {
      // The parent's manifest plate reads the registry, and whether a
      // cross-origin registration fires `toolchange` up there is unverified
      // (doc 11 section 4). Saying what happened is cheaper than finding out.
      const registered: ArchiveRegisteredMessage = {
        channel: ARCHIVE_CHANNEL,
        registered: registrar.registered,
      };
      window.parent.postMessage(registered, parentOrigin);
      report(
        registrar.registered.length > 0
          ? `Serving ${registrar.registered.join(", ")} to ${parentOrigin}.`
          : `Idle. Nothing is registered for ${parentOrigin} right now.`,
      );
    });
  });

  const ready: ArchiveReadyMessage = { channel: ARCHIVE_CHANNEL, ready: true };
  window.parent.postMessage(ready, parentOrigin);
  report(`Listening. Tools will be exposed to ${parentOrigin} when the shift begins.`);
}
