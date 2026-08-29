# NEXT STEPS

**The handoff file.** Whoever stops working updates this before they stop. Whoever starts working reads this first and nothing else.

It answers three questions and only three: where the repo is right now, what to pick up next, and what will bite you if nobody warns you. It is not a changelog ([docs/decision-log.md](docs/decision-log.md) is), not a journal ([docs/lessons-learned.md](docs/lessons-learned.md) is), and not a plan ([docs/design/08-implementation-plan.md](docs/design/08-implementation-plan.md) is).

---

## Status

| | |
|---|---|
| **Last updated** | 2026-08-29, Ahmed Saad |
| **Spike** | **Run** against Chrome 151, 2026-08-28. Doc 11 filled. Three findings, D-024. ChatGPT's in-app browser still untested. |
| **Branch** | `feat/ui-redesign`, off `main` at `f443a0f`, **not pushed** |
| **Pipeline** | Green: 600 tests, typecheck, lint, format, both `vite build`s plus the bundle budget and the new art check, real `wrangler deploy --dry-run` |
| **Played** | A full session, end to end, in Chrome 151 against a live `wrangler dev`: all four chambers, the Archive, the finale. The registry ends genuinely empty. |
| **Interface** | **Rebuilt** (D-034 to D-038). Vendored art pack, a three-bay DOM console, and the station drawn as **one connected floor plan**: five rooms and the corridors between them, autotiled in a single pass, each room walled in its own channel colour (D-037, D-038). A camera frames the room the pair is in at 1x, holds the whole building for the walk between chambers, and pulls back whenever PILOT holds **M**. Driven in Chrome 151 against a live worker: the Airlock and the Signal Room framed and lit, the floor plan on M, and the walk between them. **The Blind Panel, the Archive and the Concord Lock have not been reached in a live run** - only rendered from their real `roomPlan` output as stills. |
| **Delegation** | **Working and proved.** `apps/archive` serves `read_manual` and `read_station_log` from a second origin. `tests/cross-origin-delegation.ts`: 17 checks, run twice (frame embedded, and fallback), both green on Chrome 151, 2026-08-29. `ARCHIVE_ORIGIN` stays `same` (D-033). |
| **Verify with** | `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` |
| **Run it** | `cd apps/worker && npx wrangler dev` in one shell, `cd apps/game && pnpm dev` in another. Vite proxies `/session` to `127.0.0.1:8787`, WebSocket included. For the cross-origin path, see `apps/archive/CLAUDE.md`. |
| **Bundle** | Entry **16.7KB** gzipped of a 400KB budget; the archive origin is **2.2KB**. Phaser is a separate 358KB chunk, fetched only when a shift starts (D-026). The art pack is **17KB** of static files, fetched by the scenes and not by the entry. |
| **Cloudflare** | Logged in. D1 database `semaphore-sessions` provisioned and migrated, local and remote. |

### What exists

| Path | State |
|---|---|
| `docs/design/` | Numbered set 00-12, complete. Plan sections 0.4 and 1.4 ticked. |
| `docs/` | Decision log at D-038, lessons journal live. |
| `packages/seed`, `packages/protocol` | Done. |
| `apps/worker/src/chambers/*.ts` | Done. All four chambers: generation, state, facts, world enumeration. |
| `apps/worker/src/reducer.ts` | Done end to end, ENTRY through **ESCAPED**. `ambiguityFor` is now exported, for the CONCORD route. |
| `apps/worker/src/views.ts`, `pilot.ts`, `manual.ts` | Done. `pilot.ts` also exports `inTheRoom`, the one phase gate the frame and the meter share. |
| `apps/worker/src/Session.ts` | Done. Read routes, machine state on every response, `/socket` (D-025), `/concord` (D-027) and the notepad's two routes (D-028). |
| `apps/game/src/webmcp/*` | Done. Adapter (declarative API and `fromOrigins` too), three-tier director, 14 tools, and the archive frame. `tools.notepad.ts` holds both halves of the pad. |
| `apps/game/src/net/*` | Done. `sessionClient` gained `concord()`; the socket is unchanged. |
| `apps/game/src/render/palette.ts` | The 14 locked colours, and the one place a channel becomes a colour. |
| `apps/game/src/render/room.ts` | **Pure.** All four chambers as top-down tile plans, from one `PilotView`. Takes no other input, by design and by type. Holds each chamber's outline, and `tilesForCells`, which resolves any set of floor cells to floor and wall frames (D-035, D-037). |
| `apps/game/src/render/plan.ts` | **Pure.** The building: where each floor sits per mode, the corridors, and where the camera looks. Knows nothing about what is in a room (D-038). |
| `apps/game/src/render/floors.ts` | **Pure.** Which floors this session has, which one the pair is in, which are cleared. The old `cutaway.ts` with its pixels removed and its logic intact. |
| `apps/game/src/render/atlas.ts` | **Pure.** The art pack as one table: paths, frame counts, named frames, and the two autotile tables `floorFrame` and `wallFrame` read (D-037). No Phaser in it. |
| `apps/game/src/render/hud.ts` | **Pure.** Timer, meter fill, legend, log trimming. The band coordinates and the character-width estimate went with the canvas HUD (D-036). |
| `apps/game/src/render/scenes.ts` | `LandingScene` and `ChamberScene`. The only file that touches Phaser's API. Paints; decides nothing. |
| `apps/game/src/render/sprites.ts` | What is still authored in source: twelve glyphs and the two bodies, redrawn from above. The tiles are the pack's now. |
| `apps/game/public/art/` | The pack: 47 sheets, three channel directories, 17KB. **Separately licensed** - see its `CREDITS.md`. |
| `apps/game/src/render/station.ts` | The boot. Dynamic `import("phaser")`, the scene model, the CONCORD poll. |
| `apps/game/src/ui.ts` | The gate screen and the station console: three bays, every readout that used to be crammed onto the canvas, and the audit saying why each one is allowed to be a text node. |
| `tests/possible-worlds.test.ts` | Done and passing for all four chambers. The headline proof, honestly scoped. |
| `apps/spike/` | Built and **run** (Chrome 151, headless, 2026-08-28): 24 checks, 1 failing, 3 awaiting a model. |
| `apps/archive/src/*` | Done. `registrar.ts` is this origin's only spec contact; `station.ts` fetches the worker; `main.ts` is the boot and the message bridge. Holds no content of its own. |
| `apps/game/src/webmcp/archiveFrame.ts` | The game's half: the hidden `allow="tools"` frame, and the pipe the director's tool set travels down. |
| `apps/worker/src/cors.ts` | The origin allowlist, applied in the router so no route can forget it. `ALLOWED_ORIGINS` is a var; empty means same-origin only. |
| `packages/protocol/src/tools.ts` | The two document tools, declared once for the two origins that register them, plus the bridge's message shapes. |
| `tests/cross-origin-delegation.ts` | The browser proof. Node plays a session, Chrome follows, and the registry is read out of the browser at every beat. |
| `bench/` | Rules file only, no code. |

---

## Do this next

In order. Each item ends somewhere the pipeline is green and the repo is committable.

### 1. Playtest with humans [needs people]

Doc 08 section 0.1 wants six. The greybox is playable and a scripted session
now runs clean, so what is left is the half a script cannot answer: whether it
is fun, whether a cold player's description of a glyph reaches the manual's
canonical name, and whether the vandalised Signal Room page actually fools
anybody. The glyph vocabulary's `plainNames` are placeholders until this
happens; doc 07 section 7.2 wants the real corpus gathered here.

Run it with `apps/worker` and `apps/game` locally, one person on the screen and
one holding the tool descriptions.

### 2. Run the spike in ChatGPT's in-app browser, and meet a real model [needs a human]

**In ChatGPT's in-app browser**, on GPT-5.6 Sol or Terra (Luna has site tools
disabled), re-run the spike. Two rows decide things: `crossorigin.delegation`,
which flips `ARCHIVE_ORIGIN` from `same` to `cross`, and
`declarative.agentinvoked`, which the notepad's per-line authorship depends on
and which the game now genuinely uses.

**With a model, in either browser**, fill doc 11 sections 6 and 7: whether a
one-tool page gets discovered unprompted, whether `untrustedContentHint`
changes behaviour, and the latency distribution that sizes Chamber III's window.

### 3. Reach the Blind Panel, the Archive and the Concord Lock in a live run

The interface has now been driven in Chrome against a live worker as far as the
Signal Room: the station renders as one building, the camera frames and walks,
and the floor plan comes up on M. **The last three floors have not been seen in
Phaser.** They are rendered correctly from their real `roomPlan` output as
stills, which proves the geometry and proves nothing about the things only
motion shows: the frame stepper on the Concord Lock's door, the pad flourish,
the grip clock's shortening beam, and whether the Archive at ten by six is big
enough for the two lines of interlude text drawn across it.

Getting there means solving the Signal Room and the Blind Panel, which the
scripted solver only brute-forces. `tests/cross-origin-delegation.ts` already
plays a full session from Node and is the fastest way in.

The interface rewrite was checked by driving a live session and looking at it,
which found three bugs no test had (D-035). Three of the four chambers were
reached that way; **the Concord Lock was not**, because getting there means
solving the Blind Panel and the scripted solver only brute-forces the linkage.
Reach it and look at it: the grip clock is now a laser beam that shortens, the
bolts are lamps, and the door changes sprite at the end of the session. None of
that has been seen with real state behind it.

Then playtest the console with somebody who has not seen it. The specific
question is whether the three bays read as one instrument or as three lists:
the layout is making a claim about the game (what the human perceives and what
the agent can do are two surfaces, with the room between them) and a claim like
that either lands in a second or does not land.

### 4. Deploy the archive origin as its own Pages project

The code is done and proved locally; what is not done is the second Cloudflare
Pages project and the preview-deploy wiring for it. Until that exists the
cross-origin path cannot be tested on a URL, which is what a playtester and
ChatGPT's in-app browser both need. `VITE_ARCHIVE_ORIGIN` and the worker's
`ALLOWED_ORIGINS` are the only two settings involved.

## Things that will bite you

- **A default `getTools()` does not include a cross-origin frame's tools**, even when `allow="tools"` and `exposedTo` are both satisfied. The consumer has to pass `fromOrigins` (doc 11 section 4). The manifest plate is what notices, and it notices by silently showing four tools where there are five.
- **The archive frame's fetches need `ALLOWED_ORIGINS` in `apps/worker/.dev.vars`,** which is git-ignored, so every checkout writes its own. Without it the manual silently does not exist and the console says CORS, not "the game is broken".
- **One `AbortController` per delegated tool, never one per message** (D-033). Rebuilding the set on each change would abort and re-register `read_manual` at every door, which is the registry telling an agent its manual was taken away and given back.
- **A declarative tool leaves the registry only when its element leaves the DOM** (D-024, fixed in D-028). Aborting a signal will not do it. `endSession` and `#enterFinale` both remove the notepad form, and anything that adds a second declarative tool has to do both too. `fake-registry.ts` models this now, so a regression fails a test rather than a demo.
- **A scripted playthrough is the fastest way to find a rendering or registry bug.** `tests/cross-origin-delegation.ts` plays a full session against live servers in about twenty seconds; three of the greybox phase's five defects were invisible to unit tests and obvious in a frame.
- **Never import Phaser statically outside `render/station.ts`** (D-026). One top-level import moves 358KB into the entry chunk, and nothing about the page looks wrong. `apps/game/scripts/check-bundle.mjs` fails the build, which is the only thing that will tell you.
- **Captions are wider than their tiles.** A caption is centred under its device and routinely overhangs it, so it is the caption that runs through the wall, not the sprite. Six separate layout bugs across two phases have now been this one thing. `scenes.ts` clamps every caption to the room from the text object's *measured* width; do not fix a collision by moving the device to a safer column.
- **Phaser sizes its canvas from the parent's *border* box.** A border or a nine-slice frame on the element it mounts into is a border it cannot see: it scales to the full outer width, overflows the frame, and lands on a fractional scale that reads as a styling choice rather than as the shimmer D-031 forbids. The frame and the mount point are two elements (`.stage-frame` and `.stage`); keep them that way. A flex item's automatic minimum size will also fight Phaser's centring margin - `min-height: 0` is what stops that loop.
- **A notch may only be cut from a corner of a room's box** (D-037). `walls-out` is a nine-slice of *convex* corners and the pack ships no concave one, so a notch in the middle of an edge turns the wall in and back out with two convex corners butted together: the border draws twice and reads as a crack in the building. Two rows are also never cut - the bottom row, which PILOT walks along, and whichever row holds the door. `room.test.ts` asserts the corner rule over every chamber and demonstrates the doubled border, so a new chamber fails a test rather than shipping the artifact.
- **Devices step toward the server's frame; they never play an animation** (D-037). A played sequence has to be cancelled when the state changes underneath it, and a door caught halfway by a second update either finishes opening a door the server has shut or stalls on a frame nobody chose. If you add motion, add it to `#stepFrame` in `scenes.ts` rather than reaching for `this.anims`.
- **The art pack is not MIT.** `apps/game/public/art/` is used under LorisC's terms, which permit use in the game and modification and withhold redistribution. Touching that directory means updating its `CREDITS.md`. Do not assume the repository's licence covers it, and do not let a reader assume it either.
- **A wrong frame count in `atlas.ts` does not throw.** Phaser slices the sheet on whatever numbers it is given and hands out a frame that is half of two tiles; the room renders looking merely a bit off. `apps/game/scripts/check-art.mjs` runs first in the build and is the only thing that will tell you.
- **The console may hold no `VISUAL` fact.** Glyphs, needle values, the cipher offset and the manual page's state stay on the canvas, because a text node is scrapeable by an agent with page access. `ui.ts`'s header carries the audit that let the other panels out; extend it rather than reasoning afresh.
- **`execute` takes one argument and no `AbortSignal`** in Chrome 151, reversing D-007. The plumbing is kept, typed optional and documented as unimplemented (D-024).
- **A host invocation delivers input as an object; the page-side `executeTool` helper wants a JSON string** (D-024). The game is only ever host-invoked. The benchmark harness will have to serialise. Driving one over CDP, `WebMCP.invokeTool` also takes a `frameId` and returns only an `invocationId`: the output arrives later on `WebMCP.toolResponded`, and a driver that reads the command's own return value concludes the tool is broken.
- **`machine.chamber` outlives the room** (D-025). `pilot.inTheRoom` is the shared gate; use it rather than writing a second phase list. The renderer additionally treats an empty `facts` as "no room here", which is the same answer arrived at from the frame.
- **A read-only route must not take the semaphore** (D-019, and now D-027). The CONCORD meter is polled every 2.5 seconds; if it took a permit it would return `E_BUSY` for looking.
- **`describe_chamber` must answer every phase, not just the chambers.** An agent that has lost the thread needs a next action, not a diagnosis.
- **Read-only calls are not in the session log.** Deliberate (D-019), and it means "did the agent read the manual before acting" is not yet measurable.
- **Node's `Response` rejects status `101`, workerd requires it** (D-025). The socket upgrade cannot be unit-tested end to end.
- **The registry follows the server, never a guess** (D-021). Chambers auto-advance inside one `reduce()` call and PILOT moves the session without any tool call at all.
- **A log event cannot honestly carry a field that is not yet chosen at the point it fires** (D-016).
- **Generate fixtures from the real code path, not by hand.** `apps/worker/scripts/generate-ghost.ts` is the pattern to reuse.
- **Check a chamber's secret against what an adversary would actually try** (D-014), not just against its own rules.
- **A narrowing signal that depends on history must replay the whole history under each hypothesis** (D-013, generalising D-012).
- **`correctAction` must be the whole remaining plan, not the next single step** (D-011).
- **Latency is the gap between calls, not a call's own duration** (D-010).
- **The possible-worlds proof is scoped, deliberately** (D-009). If a chamber fails it, the chamber is wrong, not the test.
- **`PERCEIVED_BY` must never be forked.** One definition, three consumers.
- **A `GameError` thrown out of `reduce()` discards everything that call settled.**
- **A Durable Object alarm must never be the only place a rule lives** (D-018).
- **Nothing in `apps/game` outside `adapter.ts` may touch `modelContext`.** A grep that returns a second file is a defect.
- **Nothing puzzle-critical goes into the DOM.** The console holds public copy, things KEEPER can obtain for itself, and `SHARED`/`AUDIBLE` facts. Nothing else.
- **`tests/` is a workspace package** (`@semaphore/tests`); import `@semaphore/worker/chambers/airlock`, not a relative path.
- **`pnpm-workspace.yaml` needs `allowBuilds`** for `esbuild` and `workerd`.
- **D1 migrations are not automatic.** Run both the local and `--remote` `wrangler d1 execute` from `apps/worker/`.
- Never weaken an asymmetry check to go green. It is the one class of change that is never accepted.

---

## Waiting on

| Item | Owner | Note |
|---|---|---|
| Spike in ChatGPT's in-app browser | Human | Still the only thing keeping `ARCHIVE_ORIGIN` at `same`. Chrome passes the whole delegated path now, not just the spike. |
| A second Pages project for `apps/archive` | Human | Needs a Cloudflare project and preview-deploy wiring. Until it exists the cross-origin path only runs locally. |
| Socket behaviour through Cloudflare's edge | Human | Verified against local `workerd` only. Watch a deployed session through one full chamber before rehearsing the demo on it. |
| A real agent session | Human | Everything needed exists and has been driven in headless Chrome. Doc 11 sections 6 and 7 stay empty until a model meets the page. |
| Playtesters | Human | Doc 08 section 0.1 wants six. The greybox is now playable, so this unblocks. The only task that does not parallelise. |
| Repo made public | Human | Deliberately deferred to just before the deadline. |
| Doc 03 section 10 wording fix | Whoever writes submission copy | It claims "server-generated ID"; the real guarantee is zero PII (D-023). Say what is true. |

---

## How to leave this file

Before you stop working, rewrite **Status**, **Do this next** and **Waiting on** so they describe the repo as it is, not as you found it. Add to **Things that will bite you** only what genuinely cost you time. Keep the whole file under roughly 120 lines: a handoff nobody reads because it is long is worse than no handoff.
