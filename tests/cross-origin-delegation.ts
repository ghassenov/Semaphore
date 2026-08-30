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
 * A screenshot of the page as it is, named for the beat it was taken at.
 *
 * A no-op unless `SHOTS` names a directory, so the assertion run is unchanged
 * and costs nothing, the wait included.
 *
 * **The default wait is the camera's, and it has to stay larger than it.** It
 * is the sum of two: the scene holds the whole building for `WALK_MS` on the
 * walk between rooms and then pans and zooms into the next one over `SHOT_MS`
 * (`apps/game/src/render/camera.ts`, 1600 and 800 at the time of writing). A
 * frame grabbed before both have finished is not a picture of the next room; it
 * is the previous room with the next room's name over it, or the whole building
 * seen from four hundred metres up. Both have been produced by this tour, once
 * per renderer. If a frame comes back looking oddly distant, check this number
 * against those two before looking at the scene. A longer wait is how the
 * Archive gets looked at, because that room's contents change on their own
 * clock and there is nothing to wait for but time.
 */
let shotIndex = 0;
async function shot(name: string, waitMs = 2800): Promise<void> {
  if (SHOTS.length === 0) return;
  await sleep(waitMs);
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
async function shotHolding(key: string, name: string, waitMs = 1400): Promise<void> {
  if (SHOTS.length === 0) return;
  const code = `Key${key.toUpperCase()}`;
  await send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key,
    code,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
  });
  await shot(name, waitMs);
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
  });
  await sleep(600);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("WebMCP.enable");
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

// The shift begins. PILOT drives it from here; the page's director follows.
await post("begin_shift", { designation: "KEEPER" });
await post("start", { difficulty: "practice", mode: "full" });
await until((v) => v.chamber === "airlock", "the airlock");
await shot("airlock");
await sleep(600);

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
await shot("archive-early", 2000);
await shot("archive-middle", 12_000);
await shot("archive-late", 13_000);
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
