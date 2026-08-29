# NEXT STEPS

**The handoff file.** Whoever stops working updates this before they stop. Whoever starts working reads this first and nothing else.

It answers three questions and only three: where the repo is right now, what to pick up next, and what will bite you if nobody warns you. It is not a changelog ([docs/decision-log.md](docs/decision-log.md) is), not a journal ([docs/lessons-learned.md](docs/lessons-learned.md) is), and not a plan ([docs/design/08-implementation-plan.md](docs/design/08-implementation-plan.md) is).

---

## Status

| | |
|---|---|
| **Last updated** | 2026-08-29, Ahmed Saad |
| **Branch** | `feat/three-d-interface`, off `main` at `5e5635f` |
| **Pipeline** | Green: 623 tests, typecheck, lint, format, both `vite build`s plus the bundle budget and the palette check, real `wrangler deploy --dry-run` |
| **Interface** | **Rebuilt in real-time 3D** (D-042 to D-045). Phaser and the tile renderer are gone. The station is a lit cutaway model: rooms open at the top and on their south face, camera always to the south, four lights and no post-processing. New colour language (D-043), procedural assets and **no asset files at all** (D-044), and a console laid out as two surfaces with the room between them (D-045). |
| **Licence** | **MIT throughout again.** The vendored art pack went with the tile renderer, so `LICENSE` has no carve-out (D-044). |
| **Played** | A full session end to end in Chrome 152 against a live `wrangler dev`: all four chambers, the Archive, the finale, the ending. 17/17 browser checks green on the single-origin path. Every frame of the tour was looked at; the five defects it found are fixed and written up in the journal. |
| **Bundle** | Entry **16.9KB** gzipped of a 400KB budget. Three.js is a **143KB** chunk fetched only when a shift starts, against Phaser's 358KB. No images, no fonts, no asset requests at all. |
| **Archive** | Both halves still built (D-039). KEEPER calls `read_station_log`; PILOT watches the same log on a CRT drawn to a canvas. The exclusion is asserted in both directions, on the projection and again on the wire. |
| **Delegation** | Working and proved. `ARCHIVE_ORIGIN` stays `same` (D-033). `tests/cross-origin-delegation.ts` is also the screenshot tour: `SHOTS=<dir>` writes a frame at every beat and is a no-op without it. |
| **Ablation / Benchmark** | Unchanged and still published (D-040, D-041). Nothing in this rework touched `bench/`, `apps/worker/`, `packages/` or the possible-worlds proof. |
| **Verify with** | `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` |
| **Run it** | `cd apps/worker && npx wrangler dev` in one shell, `cd apps/game && pnpm dev` in another. Vite proxies `/session` to `127.0.0.1:8787`, WebSocket included. |
| **Cloudflare** | Logged in. D1 database `semaphore-sessions` provisioned and migrated, local and remote. |

### What exists

| Path | State |
|---|---|
| `docs/design/` | Numbered set 00-12. **Doc 06 rewritten for 3D**; the rest unchanged. |
| `docs/` | Decision log at D-045, lessons journal live. |
| `packages/seed`, `packages/protocol` | Done. Untouched by the rework. |
| `apps/worker/**` | Done and untouched. Four chambers, the reducer, the Archive beat, the timer, the read-only tool surface, the manual, PILOT's view socket, CONCORD, the notepad. |
| `apps/game/src/webmcp/*` | Done and untouched. Adapter, three-tier director, 14 tools, the archive frame. |
| `apps/game/src/net/*` | Done and untouched. |
| `apps/game/src/render/palette.ts` | **New.** "Low Tide": 20 colours in two locked sets. Channel colours carry information; ground and material colours carry none. |
| `apps/game/src/render/glyphs.ts` | **New.** The twelve glyphs, pixel maps carried over unchanged from `sprites.ts`. Still the one thing with hard edges. |
| `apps/game/src/render/chamber.ts` | **Pure. New.** What is in a room, as fixtures in metres. Replaces `room.ts`'s tile plans. |
| `apps/game/src/render/plan.ts` | **Pure. Rewritten** in world units. Also owns `stationCells`, the one-metre rasterisation the walls resolve from. |
| `apps/game/src/render/camera.ts` | **Pure. New.** Where the camera stands. `fitBox` frames a room corner by corner rather than by bounding sphere. |
| `apps/game/src/render/floors.ts`, `hud.ts`, `ghost.ts` | Unchanged in substance. `ghost.ts` reports a footprint in metres rather than tiles. |
| `apps/game/src/render/kit.ts` | Materials, generated textures, labels, halos. **The only place a material is created.** |
| `apps/game/src/render/fixtures.ts` | One geometry builder per fixture kind, and the converge-toward-the-server stepper. |
| `apps/game/src/render/keeper.ts` | **KEEPER's body as the registry**, and PILOT. The never-cut beat. |
| `apps/game/src/render/stage.ts` | The scene, the lights, the camera and the loop. The only file that owns a renderer. |
| `apps/game/src/ui.ts`, `style.css` | The console and the gate screen, rebuilt (D-045). The gate screen now carries the ablation and the split-lamp mark. |
| `apps/game/scripts/check-palette.mjs` | **New.** Holds `style.css` and `palette.ts` to the same values, both directions, on every build. Replaces `check-art.mjs`. |
| `tests/possible-worlds.test.ts` | Done and passing for all four chambers. Untouched. |
| `tests/cross-origin-delegation.ts` | The browser proof and the screenshot tour. Its wait is now stated against the camera's own constants. |
| `bench/` | Ablation and Cooperative Benchmark, both run and published. Untouched. |

---

## Do this next

In order. Each item ends somewhere the pipeline is green and the repo is committable.

### 1. Playtest with humans [needs people]

Unchanged and now the most valuable thing on the list, because the interface it
would be tested against is finally the one we intend to ship. Doc 08 section 0.1
wants six. What a script cannot answer: whether it is fun, whether a cold
player's description of a glyph reaches the manual's canonical name, and whether
the vandalised Signal Room page actually fools anybody. The glyph vocabulary's
`plainNames` are placeholders until this happens.

**Three questions the rework specifically added.** Does the cutaway model read
as a building you are inside, or as a diorama you are outside? Does anybody find
**M**? And does KEEPER's body land - do people notice the arms changing at a
chamber boundary without being told to look?

### 2. Run the spike in ChatGPT's in-app browser, and meet a real model [needs a human]

Unchanged, and the rework adds one thing to check: **WebGL performance in the
in-app browser on a phone.** The renderer is deliberately cheap - four lights,
no post-processing, one 1024px shadow map, device-pixel ratio capped - but none
of that has been measured anywhere except desktop Chrome. If it is slow there,
the first things to drop are shadows and the dust cloud, in that order.

Two spike rows still decide things: `crossorigin.delegation`, which flips
`ARCHIVE_ORIGIN`, and `declarative.agentinvoked`, which the notepad's per-line
authorship depends on.

### 3. Sound, which is the largest hole in the art direction now

Doc 06 section 11 is unbuilt and it is the half of the `AUDIBLE` channel that
does not exist. The visible half does: the console's audible strip carries the
string, and Chamber II's click count is in it. What is missing is the sound
itself, and doc 02 section 3.3 makes it puzzle-critical - PILOT counts the
detents. Phase 5.2 in doc 08.

The visual rework makes this the obvious next thing rather than a phase to get
to: the station now looks like a place and sounds like nothing.

### 4. Decide what to do about the two things the ablation found

Numbers and reasoning in D-040. Neither is a bug, which is why both are a
decision rather than a task. **Chamber II falls off a cliff at a slow agent
rhythm** (4.00 of four at 4s, 3.80 at 6s, 2.00 at 9s), and **the Signal Room's
1,956 figure holds against blind guessing only.** Do not tune the drift rate
until doc 11 sections 6 and 7 carry measured round trips; then re-run both the
ablation and the benchmark.

### 5. Deploy the archive origin as its own Pages project

The code is done and proved locally; the second Cloudflare Pages project and its
preview-deploy wiring are not. `VITE_ARCHIVE_ORIGIN` and the worker's
`ALLOWED_ORIGINS` are the only two settings involved.

### 6. Point a model at the benchmark [blocked on step 2]

The harness, the suite, the partner axis and the report all exist and run in
seconds with zero tokens. Budget the tokens before running, not after.

## Things that will bite you

### The renderer

- **Run the tour and look at the frames before calling a rendering change done.** `SHOTS=/tmp/tour ARCHIVE="" GAME=http://localhost:5173 node --experimental-strip-types tests/cross-origin-delegation.ts` plays a whole session against live servers in about a minute. Three renderers in a row have shipped green and produced defects in their first tour that six hundred unit tests could not see. Servers and flags are in the header of that file.
- **The tour's wait must stay longer than `WALK_MS + SHOT_MS`** in `render/camera.ts`. A frame grabbed early is the previous room with the next room's name over it, or the whole building from four hundred metres up. Both have happened.
- **Fog is squared in distance, so it is a wide-shot setting.** A density that is imperceptible in a room erases the building when the camera pulls back. If the wide shot looks broken, check the fog before the lights.
- **Additive blending has no upper bound.** A translucent double-sided cone over a dark room accumulates front face over back face into a solid grey shape. "Subtle" is an opacity times the number of surfaces the ray crosses, not an opacity.
- **A door may never be placed on a room's south wall.** Every room is open on that face so the camera can see in; a door there hangs in the opening rather than reading as a way out.
- **Two positions measured from different origins will disagree the first time either moves.** The Archive's screen was hung from the room's back wall and its housing from its own centre, which put the picture inside the casing. Both come from `MONITOR_DEPTH` now.
- **Every material comes from `kit.ts`.** A `new MeshStandardMaterial` anywhere else is a fifteenth colour arriving where nothing will notice, and it also leaks GPU memory across a session because nothing else disposes it.
- **`scripts/check-palette.mjs` is the only thing that notices a colour changed in `style.css` and not in `palette.ts`.** The drift does not throw; the console just quietly stops matching the room.
- **Never import Three.js from a module the entry chunk reaches.** `render/station.ts`'s dynamic `import("./stage.js")` is the boundary. `scripts/check-bundle.mjs` fails the build when it is crossed, which is the only thing that will tell you.
- **A sentinel guard is only as good as the number of ways a value can arrive.** The camera's "do not hold the building on the first room" guard tested `wasOn !== undefined`, and the lobby frame set it to `null` first, so every room shot in the first tour was the wide shot.

### The game

- **A chamber's solve does not always change `machine.chamber`.** The Blind Panel's solve moves the phase to `ARCHIVE` and leaves the chamber name in place (D-025). Anything watching for "a chamber was cleared" has to watch the phase. `roomPlan` and `roomTitle` both check `ARCHIVE` before the chamber for this reason, and they must stay in step.
- **`pilotTrack` and `keeperEntries` are a matched pair and must be edited as one.** They are the Archive's whole mechanic. Widening either hands one party the other's half. Asserted in both directions in `archive.test.ts` and again on the wire in `pilot.test.ts`.
- **A default `getTools()` does not include a cross-origin frame's tools**, even when `allow="tools"` and `exposedTo` are both satisfied. The consumer has to pass `fromOrigins` (doc 11 section 4).
- **The archive frame's fetches need `ALLOWED_ORIGINS` in `apps/worker/.dev.vars`,** which is git-ignored, so every checkout writes its own - **and it must name the port you are actually serving the game on.** Without it the manual silently does not exist and the console says CORS, not "the game is broken".
- **A declarative tool leaves the registry only when its element leaves the DOM** (D-024, D-028). Aborting a signal will not do it.
- **One `AbortController` per delegated tool, never one per message** (D-033).
- **A read-only route must not take the semaphore** (D-019, D-027). The CONCORD meter is polled every 2.5 seconds.
- **`describe_chamber` must answer every phase, not just the chambers.**
- **Read-only calls are not in the session log.** Deliberate (D-019).
- **Nothing puzzle-critical goes into the DOM.** The console holds public copy, things KEEPER can obtain for itself, and `SHARED`/`AUDIBLE` facts. Everything `VISUAL` is a label sprite inside the canvas.
- **Nothing in `apps/game` outside `adapter.ts` may touch `modelContext`.** A grep that returns a second file is a defect.

### Instruments and proofs

- **A metric that does not separate the thing it claims to separate is not evidence.** Two have now been built and deleted rather than reported: the benchmark's grounding latency, and the glyph test's "most confusable pair". Check that a new metric moves across its axis before it goes in a table.
- **Adding a condition to `bench/session.ts` will silently move every published ablation number** unless it leaves the run's random stream alone. Diff `ablation.md` after any change here; the tests will not tell you.
- **A test with a fabricated input can protect a bug instead of catching it.** `roomTitle` had no `ARCHIVE` guard and a hand-written view found it, but only because the same test also asserted the shape the worker really sends.
- Never weaken an asymmetry check to go green. It is the one class of change that is never accepted.
- The possible-worlds proof is scoped, deliberately (D-009). If a chamber fails it, the chamber is wrong, not the test.
- **`tests/` is a workspace package** (`@semaphore/tests`); import `@semaphore/worker/chambers/airlock`, not a relative path.
- **D1 migrations are not automatic.** Run both the local and `--remote` `wrangler d1 execute` from `apps/worker/`.

---

## Waiting on

| Item | Owner | Note |
|---|---|---|
| Playtesters | Human | Doc 08 section 0.1 wants six. The one task that does not parallelise, and the interface is now the one worth testing. |
| Spike in ChatGPT's in-app browser | Human | Still the only thing keeping `ARCHIVE_ORIGIN` at `same`. Now also the only way to know whether the 3D renderer performs there. |
| A real agent session | Human | Doc 11 sections 6 and 7 stay empty until a model meets the page. |
| Sound | Whoever holds the art | Doc 06 section 11, doc 08 phase 5.2. The largest hole in the art direction now that the visuals are done. |
| A second Pages project for `apps/archive` | Human | Needs a Cloudflare project and preview-deploy wiring. |
| Socket behaviour through Cloudflare's edge | Human | Verified against local `workerd` only. |
| Chamber II's drift rate | Whoever holds the design | Blocked on doc 11 sections 6 and 7. Re-run `ablation` and `benchmark` after any change. |
| Per-model benchmark numbers | Human | Harness done and free to run. Needs a backend behind the tool surface. |
| Repo made public | Human | Deliberately deferred to just before the deadline. |
| Doc 03 section 10 wording fix | Whoever writes submission copy | It claims "server-generated ID"; the real guarantee is zero PII (D-023). |
| Submission copy refresh | Whoever writes it | Doc 10 section 3.4 and doc 09's shot list both describe the pixel renderer and its files. The claims are unchanged; the file paths and the pictures are not. |

---

## How to leave this file

Before you stop working, rewrite **Status**, **Do this next** and **Waiting on** so they describe the repo as it is, not as you found it. Add to **Things that will bite you** only what genuinely cost you time. Keep the whole file readable in one sitting: a handoff nobody reads because it is long is worse than no handoff.
