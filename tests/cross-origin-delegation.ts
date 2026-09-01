/**
 * The browser proof: cross-origin tool delegation, and the registry's whole
 * lifecycle, against a real Chrome and a real worker.
 *
 * This is what `tests/CLAUDE.md` means by "Playwright covers what unit tests
 * cannot observe". It is not Playwright: the DevTools Protocol is enough and
 * arrives with the browser, so this file has no dependencies at all. What it
 * observes is the half of the design that no fake registry can honestly
 * stand in for.
 *
 *   - the archive origin registers `read_manual` and `read_station_log` from
 *     inside a cross-origin frame, which needs `allow="tools"` to be granted
 *     and `exposedTo` to name this origin;
 *   - those tools are invisible to a default `getTools()` on the game origin
 *     and visible to `getTools({ fromOrigins })`, which is the "visible to the
 *     game origin and only to it" claim;
 *   - a host invocation of one of them crosses two origin boundaries and a
 *     CORS preflight and comes back with the station's own words;
 *   - `read_station_log`, called across that boundary, actually moves the
 *     session, which is the only reason the Archive's door opens;
 *   - and the registry still drains to exactly one tool at the finale and to
 *     nothing at the end, counting both origins together. That is the game's
 *     last beat, and delegation must not have quietly kept a tool alive
 *     somewhere the ending cannot reach.
 *
 * **It runs twice.** With `ARCHIVE` set it proves the cross-origin path; with
 * `ARCHIVE=""` it proves the single-origin fallback, which has to ship green
 * for as long as `ARCHIVE_ORIGIN` is `same`. The two runs assert the same
 * lifecycle and differ only in where the two document tools live.
 *
 * Node plays the session over HTTP and the view socket, as PILOT would, and
 * the page follows it over its own socket. That split is deliberate: it means
 * every registry assertion is read out of the browser after a state change
 * the browser did not cause, which is the case D-021 is really about.
 *
 * Running it, from the repository root:
 *
 *   cd apps/worker && npx wrangler dev --port 8790
 *   cd apps/archive && npx vite --port 5175 --strictPort
 *   cd apps/game && VITE_ARCHIVE_ORIGIN=http://localhost:5175 \
 *     VITE_WORKER_ORIGIN=http://127.0.0.1:8790 npx vite --port 5173 --strictPort
 *   google-chrome --headless=new --remote-debugging-port=9223 \
 *     --user-data-dir=$(mktemp -d) \
 *     --enable-features=WebMCPTesting,DevToolsWebMCPSupport about:blank
 *   node --experimental-strip-types tests/cross-origin-delegation.ts
 *
 * `apps/worker/.dev.vars` needs `ALLOWED_ORIGINS` naming both dev origins, or
 * the archive frame's fetches are refused and every cross-origin check fails.
 * Ports are arguments rather than constants: on localhost a second origin is
 * a second port, and in production it is a second hostname.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { GLYPHS, PRIME_STROKE_GLYPHS, type GlyphId } from "@semaphore/worker/chambers/glyphs";

/**
 * The Node globals this script uses, declared rather than pulled in.
 *
 * Only `process` needs declaring: everything else this file touches (`fetch`,
 * `WebSocket`, `console`) is a web API that Node implements and that this
 * package's `tsconfig.json` pulls in from the DOM library. `@types/node` for
 * four environment variables and an exit code would be a dependency the rest
 * of the repository does not need.
 */
declare const process: {
  readonly env: Readonly<Record<string, string | undefined>>;
  exit(code: number): never;
};

const WORKER = process.env.WORKER ?? "http://127.0.0.1:8790";
const CDP = process.env.CDP ?? "http://127.0.0.1:9223";
const GAME = process.env.GAME ?? "http://localhost:5173";
/**
 * The archive origin, or empty to check the single-origin fallback instead.
 *
 * Both paths must ship green until cross-origin delegation is verified in
 * ChatGPT's in-app browser as well as in Chrome, so this file runs twice: once
 * with `VITE_ARCHIVE_ORIGIN` set on the game's dev server, and once without.
 */
const ARCHIVE = process.env.ARCHIVE ?? "http://localhost:5175";
/**
 * Where to write a screenshot at each beat, or empty to write none.
 *
 * The tour, and the reason it is bolted to this file rather than to one of its
 * own: getting to the Archive means solving the Blind Panel, and the solvers
 * that do it are already here. Four rendering bugs in one pass were invisible
 * to six hundred unit tests and obvious in a frame, and three of them needed
 * two chambers of history to appear at all, so the only honest way to look at
 * a room is to play the session that reaches it.
 */
const SHOTS = process.env.SHOTS ?? "";
const DELEGATED = ARCHIVE.length > 0;
const SEED = `e2e-${String(Date.now())}`;

const results: { ok: boolean; name: string; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ ok, name, detail });
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the station

const base = `${WORKER}/session/${SEED}`;
async function post(action: string, body: Record<string, unknown> = {}): Promise<string> {
  const res = await fetch(`${base}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { content?: { text?: string }[] };
  return json.content?.[0]?.text ?? "";
}
async function get(view: string, params: Record<string, string> = {}): Promise<string> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${base}/${view}${query ? `?${query}` : ""}`);
  const json = (await res.json()) as { content?: { text?: string }[] };
  return json.content?.[0]?.text ?? "";
}

interface View {
  phase: string;
  chamber: string | null;
  facts: Record<string, unknown>;
}
let view: View = { phase: "ENTRY", chamber: null, facts: {} };
const socket = new WebSocket(`${base.replace("http", "ws")}/socket`);
socket.addEventListener("message", (event) => {
  view = JSON.parse(String(event.data)) as View;
});

/** Wait until the pushed view satisfies `done`, or give up. */
async function until(done: (v: View) => boolean, label: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (done(view)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}; phase=${view.phase} chamber=${view.chamber}`);
}

// ------------------------------------------------------------------- the page

const targets = (await (await fetch(`${CDP}/json/list`)).json()) as {
  type: string;
  webSocketDebuggerUrl: string;
}[];

const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target; is Chrome running with --remote-debugging-port?");

const cdp = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => cdp.addEventListener("open", r, { once: true }));

/** One DevTools Protocol message, in the shape this file reads. */
interface CdpMessage {
  id?: number;
  method?: string;
  result?: Record<string, unknown>;
  error?: unknown;
  params?: Record<string, unknown>;
}

let id = 0;
const pending = new Map<number, (msg: CdpMessage) => void>();
const consoleLines: string[] = [];
/** Tool invocations that have completed, by invocation id. */
interface Invocation {
  status: string;
  output?: unknown;
  errorText?: string;
}
const invocations = new Map<string, Invocation>();
cdp.addEventListener("message", (event) => {
  const msg = JSON.parse(String(event.data)) as CdpMessage;
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  }
  if (msg.method === "WebMCP.toolResponded") {
    const params = msg.params as unknown as Invocation & { invocationId: string };
    invocations.set(params.invocationId, params);
  }
  if (msg.method === "Runtime.consoleAPICalled" || msg.method === "Log.entryAdded") {
    const params = msg.params as {
      entry?: { text?: string };
      args?: { value?: unknown; description?: string }[];
    };
    const text =
      params.entry?.text ??
      (params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" ");
    if (String(text).length > 0) consoleLines.push(String(text));
  }
});
function send(method: string, params: Record<string, unknown> = {}): Promise<CdpMessage> {
  const msgId = ++id;
  cdp.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((resolve) => pending.set(msgId, resolve));
}
async function evaluate<T>(expression: string): Promise<T> {
  const res = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const result = res.result as
    | { exceptionDetails?: { exception?: { description?: string } }; result?: { value?: unknown } }
    | undefined;
  if (result?.exceptionDetails) {
    throw new Error(String(result.exceptionDetails.exception?.description ?? "eval failed"));
  }
  return result?.result?.value as T;
}

/**
 * Wait until the camera has stopped travelling.
 *
 * The stage publishes `data-settled` on its canvas once the walk hold and the
 * shot's easing are both over. Polling it replaced a hand-copied
 * `WALK_MS + SHOT_MS` sleep, which is a number that cannot hear the camera
 * change underneath it: this tour shipped an Archive frame taken at 2000ms
 * against a 2400ms arrival, and got the whole station seen from four hundred
 * metres up, in a run whose 21 assertions were all green. A frame grabbed early
 * is the previous room wearing the next room's name, and it has happened once
 * per renderer.
 *
 * The timeout is generous and deliberately not fatal. A frame is evidence, not
 * an assertion, and a tour that dies rather than photographing a stuck camera
 * has destroyed the one artefact that would say why.
 */
async function settled(timeoutMs = 8000): Promise<void> {
  // The grace is not politeness. Node reaches this line the moment its own
  // socket saw the state change, and the browser has its own socket: until the
  // page has had that frame and the loop has had a tick, `settled` still
  // describes the *previous* shot and reads true. Waiting out one round trip
  // and a few frames first is what stops this from photographing the room the
  // pair just left, which is the exact failure the flag exists to end.
  await sleep(300);
  // And it has to stay settled. A shot that resolves while the walk hold is
  // still running would otherwise satisfy a single poll.
  const HELD_MS = 250;
  const until = Date.now() + timeoutMs;
  let since: number | null = null;
  while (Date.now() < until) {
    const flag = await evaluate<string>(
      `document.querySelector(".viewport-canvas")?.dataset.settled ?? "absent"`,
    );
    if (flag === "true") {
      since ??= Date.now();
      if (Date.now() - since >= HELD_MS) return;
    } else {
      since = null;
    }
    await sleep(80);
  }
  console.log("[warn] camera never settled; taking the frame anyway");
}

/**
 * A screenshot of the page as it is, named for the beat it was taken at.
 *
 * A no-op unless `SHOTS` names a directory, so the assertion run is unchanged
 * and costs nothing, the wait included.
 *
 * It waits for the camera first and only then for `waitMs`, so the argument
 * means "and then let this much of the room's own clock pass" rather than
 * "hope the camera is done by now". That is what the Archive needs: its
 * contents change on a clock of their own and there is nothing to wait for but
 * time. Every other beat passes zero and is photographed the moment the shot
 * has resolved.
 */
let shotIndex = 0;
async function shot(name: string, waitMs = 0): Promise<void> {
  if (SHOTS.length === 0) return;
  await settled();
  if (waitMs > 0) await sleep(waitMs);
  const res = await send("Page.captureScreenshot", { format: "png" });
  const data = (res.result as { data?: string } | undefined)?.data ?? "";
  const file = `${SHOTS}/${String(++shotIndex).padStart(2, "0")}-${name}.png`;
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(file, data, "base64");
  console.log(`[shot] ${file}`);
}

/**
 * Hold a key down, take a frame, let it go.
 *
 * The lean-in (`E`) is the one camera move the human drives, and it had no
 * frame in this tour at all: it was verified by arithmetic, which is exactly
 * the kind of proof this file exists to replace. Held through a real
 * `rawKeyDown` rather than a synthetic event, because the stage listens on
 * `globalThis` and a dispatched `KeyboardEvent` would not prove the browser
 * path works.
 */
async function keyEvent(type: "rawKeyDown" | "keyUp", key: string): Promise<void> {
  await send("Input.dispatchKeyEvent", {
    type,
    key,
    code: `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
  });
}

async function shotHolding(key: string, name: string, waitMs = 0): Promise<void> {
  if (SHOTS.length === 0) return;
  await keyEvent("rawKeyDown", key);
  await shot(name, waitMs);
  await keyEvent("keyUp", key);
  await sleep(600);
}

/** Hold a key for a while and let it go. Walking, rather than looking. */
async function hold(key: string, ms: number): Promise<void> {
  await keyEvent("rawKeyDown", key);
  await sleep(ms);
  await keyEvent("keyUp", key);
  await sleep(200);
}

/** One press and release, for the keys that are edge-triggered. */
async function tap(key: string): Promise<void> {
  await keyEvent("rawKeyDown", key);
  await sleep(80);
  await keyEvent("keyUp", key);
}

/** What the console's header calls the room the viewport is showing. */
async function headerRoom(): Promise<string> {
  return await evaluate<string>(
    `document.querySelector(".room")?.textContent?.trim() ?? "(no header)"`,
  );
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("WebMCP.enable");
await send("Page.navigate", { url: `${GAME}/?seed=${SEED}` });
/*
 * Tell the page the guided shift has already been seen.
 *
 * It runs on a first visit and freezes PILOT's controls while it speaks, which
 * is exactly what it is for and exactly what this file cannot have: the proof
 * drives those controls, and the run where the tutorial arrived unannounced
 * failed the two assertions about walking back through a door. This is not a
 * first visit, and saying so is more honest than lengthening a sleep until the
 * tour happens to be over.
 *
 * The tour has its own tests. What this file proves is the game underneath it.
 */
await evaluate(`localStorage.setItem("semaphore:tour-seen", "1")`);
await send("Page.navigate", { url: `${GAME}/?seed=${SEED}` });
await sleep(3500);

/** The names on the game's own origin. */
const own = () => evaluate<string[]>(`document.modelContext.getTools().then(t=>t.map(x=>x.name))`);
/** The names the game can see, its own plus the archive origin's. */
const all = () =>
  DELEGATED
    ? evaluate<string[]>(
        `document.modelContext.getTools({fromOrigins:["${ARCHIVE}"]}).then(t=>t.map(x=>x.name))`,
      )
    : own();

/** The archive frame's CDP frame id, which is how a host targets its tools. */
interface FrameNode {
  frame: { id: string; url: string };
  childFrames?: FrameNode[];
}
async function frameTree(): Promise<FrameNode> {
  const res = await send("Page.getFrameTree");
  return (res.result as { frameTree: FrameNode }).frameTree;
}
async function archiveFrameId(): Promise<string> {
  const child = ((await frameTree()).childFrames ?? []).find((node) =>
    node.frame.url.startsWith(ARCHIVE),
  );
  return child?.frame.id ?? "";
}
const mainFrameId = (await frameTree()).frame.id;

/** Invoke a tool the way a host does: by frame, by name, with an input object. */
async function invoke(frameId: string, toolName: string, input: Record<string, unknown>) {
  const res = await send("WebMCP.invokeTool", { frameId, toolName, input });
  if (res.error) return `ERROR ${JSON.stringify(res.error)}`;
  // The command only starts the invocation; the answer arrives as an event,
  // which is how a host receives it too.
  const invocationId = (res.result as { invocationId: string }).invocationId;
  for (let i = 0; i < 100; i++) {
    const done = invocations.get(invocationId);
    if (done) return JSON.stringify(done.output ?? done.errorText ?? done.status);
    await sleep(100);
  }
  return `ERROR no response for ${toolName}`;
}

// ------------------------------------------------------------------ the proof

check(
  "the page has a WebMCP registry",
  (await evaluate<boolean>(`!!document.modelContext`)) === true,
);

const frameSrc = await evaluate<string | null>(
  `(()=>{const f=document.querySelector('iframe[allow="tools"]');return f?f.src:null})()`,
);
check(
  DELEGATED
    ? "the archive frame is embedded on a second origin with allow=tools"
    : "no archive frame is embedded in the single-origin fallback",
  DELEGATED ? !!frameSrc && frameSrc.startsWith(ARCHIVE) : frameSrc === null,
  frameSrc ?? "absent",
);
const archiveFrame = DELEGATED ? await archiveFrameId() : mainFrameId;
check(
  DELEGATED
    ? "the archive frame is a real cross-origin frame"
    : "every tool is served by the page itself",
  DELEGATED
    ? archiveFrame.length > 0 && archiveFrame !== mainFrameId
    : archiveFrame === mainFrameId,
);

check(
  "only the front door is registered before the shift",
  (await all()).join(",") === "begin_shift",
  (await all()).join(","),
);

// The starter prompt card, which is on the never-cut list (repo CLAUDE.md) and
// is the element doc 04 section 2 calls the thing that makes an agent engage at
// all. It is built once and rendered in two places, and the gate's copy had
// already silently lost its fallback line while the console's kept it - so what
// is asserted is that the card is whole and on screen before the shift, not
// that some element with that class exists.
{
  const slip = await evaluate<string>(
    `(()=>{const e=document.querySelector(".slip");
      if(!e || e.getBoundingClientRect().width < 100) return "";
      return e.textContent ?? "";})()`,
  );
  check(
    "the requisition slip is on screen before the shift",
    slip.includes("STATION REQUISITION") && slip.includes("Paste this to your KEEPER"),
    slip.slice(0, 60) || "(not visible)",
  );
  check(
    "it carries the prompt and the fallback line",
    slip.includes("You are KEEPER") && slip.includes("what tools does this page give you"),
  );
}

// The shift begins. PILOT drives it from here; the page's director follows.
await post("begin_shift", { designation: "KEEPER" });
await post("start", { difficulty: "practice", mode: "full" });
await until((v) => v.chamber === "airlock", "the airlock");
/*
 * The landing screen hands the room over.
 *
 * It leaves on a transition and removes itself when that transition is done,
 * so this waits for the element to be gone rather than sleeping for however
 * long the animation currently runs. A hand-typed duration living in a
 * different package from the animation is the same mistake the camera wait
 * used to make: a number copied out of another module cannot hear it change.
 *
 * What is asserted is unchanged and just as strict - once the landing has
 * gone, the only requisition slip left on the page is the one stowed in the
 * closed YOUR AGENT drawer, and it must be measurably off screen.
 */
for (let i = 0; i < 60; i++) {
  if (await evaluate<boolean>(`document.querySelector(".landing") === null`)) break;
  await sleep(50);
}
check(
  "and it hands the room over once the shift starts",
  (await evaluate<number>(`document.querySelector(".slip")?.getBoundingClientRect().width ?? 0`)) <
    100,
);

await shot("airlock");
await sleep(600);

/*
 * ---- Walking does not throw the camera out of the building (D-067).
 *
 * A room shot leans toward PILOT, so its eye moves every frame somebody is
 * walking. The transition used to be keyed on that eye, so every one of those
 * frames read as a brand new shot: the ease restarted sixty times a second,
 * never completed, and each restart took its starting point from
 * `camera.position` - which already had that frame's idle drift added to it.
 * The drift compounded instead of oscillating and the camera left the station
 * in about a second. Holding a movement key was enough to do it.
 *
 * `data-settled` is the assertion because it is the exact thing that was
 * false: a camera whose transition restarts every frame never settles. It is
 * checked *while the key is still down*, because continuous tracking is not a
 * transition and must not read as one.
 */
{
  await keyEvent("rawKeyDown", "d");
  await sleep(1600);
  const settledWhileWalking = await evaluate<string>(
    `document.querySelector(".viewport-canvas")?.dataset.settled ?? "absent"`,
  );
  await keyEvent("keyUp", "d");
  await sleep(400);
  check(
    "the camera settles while PILOT is still walking",
    settledWhileWalking === "true",
    settledWhileWalking,
  );
  /*
   * And walking did not leave the room.
   *
   * Deliberately labelled for what it measures. It was written as "still
   * framing the same room", which it cannot see: it reads the rail, and the
   * rail passed happily through a run where the camera was four hundred metres
   * outside the building. A check that does not separate the thing it names is
   * not evidence for it. What it does prove is worth keeping - a held movement
   * key must not trip the edge-triggered door transit.
   */
  check(
    "and holding a movement key did not walk PILOT out of the room",
    (await evaluate<string>(`document.querySelector(".room")?.textContent?.trim() ?? ""`)).includes(
      "AIRLOCK",
    ),
  );
}

check(
  DELEGATED
    ? "read_manual is not registered on the game origin"
    : "read_manual is registered by the page itself",
  (await own()).includes("read_manual") !== DELEGATED,
  (await own()).join(","),
);
check(
  DELEGATED ? "read_manual is visible through fromOrigins" : "read_manual is visible",
  (await all()).includes("read_manual"),
  (await all()).join(","),
);

const manualText = await invoke(archiveFrame, "read_manual", { section: "index" });
check(
  DELEGATED
    ? "read_manual crosses both origins and returns the station's own manual"
    : "read_manual returns the station's own manual",
  manualText.includes("SIGNAL STATION MAINTENANCE MANUAL"),
  manualText.slice(0, 90),
);

check(
  "read_station_log does not exist outside the Archive",
  !(await all()).includes("read_station_log"),
  (await all()).join(","),
);

// ---- Chamber 0: pull the lever bearing the spiral.
const glyphByLever = view.facts.glyphByLever as Record<string, GlyphId>;
const spiralLever = Object.keys(glyphByLever).find((lever) => glyphByLever[lever] === "spiral");
await post("pull_lever", { lever_id: spiralLever });
await until((v) => v.chamber === "signal_room", "the signal room");
await shot("signal-room");
await shotHolding("e", "signal-room-leaning");
await sleep(400);

/*
 * ---- Walking back through a door already opened (D-054).
 *
 * The one beat in this file that is purely PILOT's, and it is here rather than
 * in a unit test because every part of it that can be wrong is wiring: a key
 * the browser has to deliver, a floor the stage decides on its own, a cached
 * plan for a room the server is no longer sending facts for, and a console
 * that repaints on model events rather than per frame. `doorways.test.ts`
 * proves which door leads where. Only this proves that pressing the key in a
 * browser puts the room on screen.
 *
 * The session stays in the Signal Room throughout, and that is the assertion
 * as much as the room name is: walking back is a camera move, so the chamber,
 * the clock and the tool surface may not notice it happened.
 */
{
  const before = view.chamber;
  // West, to the doorway the pair came in through.
  await hold("a", 2200);
  await tap("q");
  await sleep(1200);
  const back = await headerRoom();
  await shot("airlock-revisited");
  check("Q at an open door walks back to the room behind", back.includes("AIRLOCK"), back);
  check("and the console says it is a room being revisited", back.includes("REVISITED"), back);
  check(
    "while the session stays in the chamber it was in",
    view.chamber === before && (await all()).includes("inspect"),
    `${String(view.chamber)} / ${(await all()).join(",")}`,
  );
  // And forward again, through the door the pair originally left by.
  await tap("q");
  await sleep(1400);
  const forward = await headerRoom();
  check(
    "and Q at the door on the far side comes forward again",
    forward.includes("SIGNAL ROOM") && !forward.includes("REVISITED"),
    forward,
  );
}

// ---- Chamber I: ascending stroke count, primes omitted.
const glyphByKey = view.facts.glyphByKey as Record<string, GlyphId>;
const keys = Object.keys(glyphByKey)
  .filter((key) => !(PRIME_STROKE_GLYPHS as readonly string[]).includes(glyphByKey[key] as string))
  .sort(
    (a, b) => GLYPHS[glyphByKey[a] as GlyphId].strokes - GLYPHS[glyphByKey[b] as GlyphId].strokes,
  );
for (const key of keys) await post("press_key", { key_id: Number(key) });
await until((v) => v.chamber === "blind_panel", "the blind panel");
await shot("blind-panel");
await sleep(400);

// ---- Chamber II: the dial-to-gauge mapping is HIDDEN, so probe it. One
// click on each dial says which gauge it drives and which way. A gauge
// already at a bound registers nothing, so a dead probe is retried the other
// way round; and the one cross-linked dial moves two gauges at once, so its
// own gauge is the one left over once the other three have claimed theirs.
type Gauges = Record<string, number>;
const gauges = (): Gauges => ({ ...((view.facts.gaugeValues ?? {}) as Gauges) });
// The plate is engraved: the targets never move, so they are read once rather
// than off whichever frame happens to be latest.
const TARGETS = { ...(view.facts.targets as Gauges) };

async function probe(dial: string, direction: "clockwise" | "counterclockwise") {
  const before = gauges();
  await post("rotate_dial", { dial_id: Number(dial), direction, clicks: 1 });
  await sleep(120);
  const after = gauges();
  const moved: Record<string, number> = {};
  for (const gauge of Object.keys(after)) {
    const delta = (after[gauge] as number) - (before[gauge] as number);
    // Clockwise is the reference direction, so a counterclockwise probe is
    // reported with its sign flipped.
    if (delta !== 0) moved[gauge] = direction === "clockwise" ? delta : -delta;
  }
  return moved;
}

const probes: Record<string, Record<string, number>> = {};
for (const dial of ["1", "2", "3", "4"]) {
  let moved = await probe(dial, "clockwise");
  if (Object.keys(moved).length === 0) moved = await probe(dial, "counterclockwise");
  probes[dial] = moved;
}

interface Linkage {
  gauge: string;
  step: number;
}
const linkage: Record<string, Linkage> = {};
const claimed = new Set<string>();
for (const [dial, moved] of Object.entries(probes)) {
  const names = Object.keys(moved);
  if (names.length !== 1) continue;
  const gauge = names[0] as string;
  linkage[dial] = { gauge, step: moved[gauge] as number };
  claimed.add(gauge);
}
let crossDial: string | null = null;
for (const [dial, moved] of Object.entries(probes)) {
  const names = Object.keys(moved);
  if (names.length < 2) continue;
  const gauge = names.find((name) => !claimed.has(name)) as string;
  linkage[dial] = { gauge, step: moved[gauge] as number };
  crossDial = dial;
}

/** Drive one gauge to its target through its own dial. */
async function driveGauge(gauge: string): Promise<void> {
  const dial = Object.keys(linkage).find((d) => linkage[d]?.gauge === gauge);
  if (!dial) return;
  const { step } = linkage[dial] as Linkage;
  const current = gauges()[gauge];
  if (current === undefined) return;
  const delta = (TARGETS[gauge] as number) - current;
  if (delta === 0) return;
  const direction = Math.sign(delta) === Math.sign(step) ? "clockwise" : "counterclockwise";
  await post("rotate_dial", { dial_id: Number(dial), direction, clicks: Math.abs(delta) });
  await sleep(120);
}

// The cross-linked dial disturbs a gauge it does not drive, so it goes first
// and everything else is corrected after it.
const crossGauge = crossDial
  ? Object.keys(probes[crossDial] ?? {}).find((g) => g !== linkage[crossDial]?.gauge)
  : null;
for (let round = 0; round < 10 && view.facts.solved !== true; round++) {
  if (crossDial) await driveGauge((linkage[crossDial] as Linkage).gauge);
  for (const gauge of ["1", "2", "3", "4"]) {
    if (gauge !== crossGauge) await driveGauge(gauge);
  }
  if (crossGauge) await driveGauge(crossGauge);
}

console.log(
  "linkage",
  JSON.stringify(linkage),
  "gauges",
  JSON.stringify(gauges()),
  "targets",
  JSON.stringify(view.facts.targets),
  "solved",
  view.facts.solved,
);
await until((v) => v.phase === "ARCHIVE", "the archive beat");
// Three, spread across the recording, because the Archive is the one room
// whose contents change while nobody touches anything: the ghost walks, grips
// the bar, and the tape runs out.
await shot("archive-early");
await shot("archive-middle", 10_000);
await shot("archive-late", 11_000);
await sleep(700);

check(
  DELEGATED
    ? "read_station_log appears for the Archive beat, on the other origin"
    : "read_station_log appears for the Archive beat",
  (await all()).includes("read_station_log"),
  (await all()).join(","),
);
check(
  DELEGATED ? "and it is still not on the game origin" : "and the page serves it itself",
  (await own()).includes("read_station_log") !== DELEGATED,
  (await own()).join(","),
);

const logText = await invoke(archiveFrame, "read_station_log", { entry: 1 });
check(
  DELEGATED
    ? "read_station_log crosses both origins and returns a ghost entry"
    : "read_station_log returns a ghost entry",
  logText.includes("Entry 1 of") && logText.includes("previous KEEPER called"),
  logText.slice(0, 110),
);

// The cross-origin call has to have moved the session, or the door will not open.
const beforeLeaving = await get("status");
await post("leave_archive");
await until((v) => v.chamber === "concord_lock", "the concord lock");
await shot("concord-lock");
check(
  DELEGATED
    ? "the cross-origin call recorded itself, so the Archive could be left"
    : "the call recorded itself, so the Archive could be left",
  view.chamber === "concord_lock",
  `status before leaving: ${beforeLeaving.slice(0, 60)}`,
);
await sleep(500);
check(
  "read_station_log is taken away again after the Archive",
  !(await all()).includes("read_station_log"),
  (await all()).join(","),
);
check(
  "read_manual survived every transition",
  (await all()).includes("read_manual"),
  (await all()).join(","),
);

// ---- Chamber III: decipher, align, speak, all inside one grip.
const offset = view.facts.cipherOffset as number;
// The plate is rendered as an indented line of its own inside the tool's
// prose, and the passphrase is more than one word, so the whole line is taken
// rather than the first run of capitals.
const plate =
  (await get("ciphertext"))
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^[A-Z][A-Z ]+$/.test(line) && line.includes(" ")) ?? "";
const phrase = [...plate]
  .map((c) =>
    c === " " ? c : String.fromCharCode(((c.charCodeAt(0) - 65 - offset + 52) % 26) + 65),
  )
  .join("");
await post("grip_bar");
for (const bolt of [1, 2, 3]) await post("align_bolt", { bolt_id: bolt });
await post("speak_passphrase", { phrase });
await until((v) => v.phase === "FINALE", "the finale");
await shot("finale");
await sleep(600);

check(
  DELEGATED ? "the finale leaves one tool across both origins" : "the finale leaves one tool",
  (await all()).join(",") === "open_the_door",
  (await all()).join(","),
);

await invoke(mainFrameId, "open_the_door", {});
await until((v) => v.phase === "ESCAPED", "the ending");
await shot("ending");
await sleep(600);

// The ending's other half (doc 08 phase 3.2). A link the pair can take away is
// the only part of the finale that outlives the session and it is the entry
// point to the replay viewer, so it is worth a browser assertion rather than a
// unit test over a phase name.
{
  const href = await evaluate<string>(
    `(()=>{const card=document.querySelector(".ending");
      return card && !card.hidden ? (card.querySelector("a")?.getAttribute("href") ?? "") : "";})()`,
  );
  check(
    "the ending offers a replay link for this session",
    href.includes("/replay") && href.includes(SEED),
    href || "(no card)",
  );
}

const ending = await all();
check(
  DELEGATED ? "the registry drains to empty, on both origins" : "the registry drains to empty",
  ending.length === 0,
  ending.join(","),
);

const errors = consoleLines.filter((line) => /CORS|blocked|refused|Permissions Policy/i.test(line));
check(
  "no CORS or permissions-policy refusals in the console",
  errors.length === 0,
  errors.slice(0, 2).join(" | "),
);

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (results.some((r) => !r.ok)) console.log(consoleLines.slice(-15).join("\n"));
process.exit(results.every((r) => r.ok) ? 0 : 1);
