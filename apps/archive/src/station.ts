/**
 * The archive origin's one connection to the station.
 *
 * This origin holds no state of its own, by its own rules: the manual's
 * vandalised page is drawn from the session seed and the station log's
 * read-gating is reducer state, and both live in the Durable Object. So the
 * two tools registered here are fulfilled by calling the worker, and the
 * separateness this app is for is separateness of *origin and document*,
 * which is what `allow="tools"` and `exposedTo` actually operate on.
 *
 * One consequence is worth stating plainly, because it looks like a gap and
 * is not. `read_station_log` mutates the session (it is what makes the
 * Archive beat completable), and the game page never sees that response. It
 * does not need to: the Durable Object broadcasts PILOT's view after every
 * action, and the game applies machine state from every frame, so the
 * registry and the HUD move on the socket exactly as they would have.
 *
 * Every failure comes back as text an agent can act on, in the station's
 * voice, for the same reason `apps/game`'s client does it: a bare rejection
 * teaches a model nothing and produces flailing retries.
 */

/** Where the session lives, and which session it is. */
export interface StationRef {
  readonly workerOrigin: string;
  readonly sessionId: string;
}

/** Read the two parameters this page is embedded with. Both are required. */
export function stationRefFrom(search: string): StationRef | null {
  const params = new URLSearchParams(search);
  const sessionId = params.get("session")?.trim() ?? "";
  const workerOrigin = params.get("worker")?.trim() ?? "";
  if (!sessionId || !workerOrigin) return null;
  return { sessionId, workerOrigin };
}

/** The tool-shaped body every session route answers with, success or refusal. */
interface ToolShapedBody {
  content?: { text?: unknown }[];
}

/**
 * Fetch one session route and return its text.
 *
 * A `409` is the game refusing in a sentence written for the agent to recover
 * from, so it is read exactly like a success. Anything else is the station
 * itself failing and gets an answer in the same register.
 */
async function read(url: string, init: RequestInit): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return "The station did not answer. The line to the machine deck is down; try the call again.";
  }
  if (response.status >= 500 || response.status === 404) {
    return `The station answered with a fault (${String(response.status)}). Try the call again.`;
  }
  try {
    const body = (await response.json()) as ToolShapedBody;
    return String(body.content?.[0]?.text ?? "");
  } catch {
    return "The archive could not read the station's answer. Try the call again.";
  }
}

const base = (ref: StationRef) =>
  `${ref.workerOrigin}/session/${encodeURIComponent(ref.sessionId)}`;

/** `read_manual`'s fulfilment: a section of the manual, as this session renders it. */
export async function manual(ref: StationRef, section: string): Promise<string> {
  const query = new URLSearchParams({ section }).toString();
  return read(`${base(ref)}/manual?${query}`, { method: "GET" });
}

/** `read_station_log`'s fulfilment. A `POST`, because reading an entry records it. */
export async function stationLog(ref: StationRef, entry: number): Promise<string> {
  return read(`${base(ref)}/read_station_log`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entry }),
  });
}
