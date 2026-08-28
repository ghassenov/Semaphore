# NEXT STEPS

**The handoff file.** Whoever stops working updates this before they stop. Whoever starts working reads this first and nothing else.

It answers three questions and only three: where the repo is right now, what to pick up next, and what will bite you if nobody warns you. It is not a changelog ([docs/decision-log.md](docs/decision-log.md) is), not a journal ([docs/lessons-learned.md](docs/lessons-learned.md) is), and not a plan ([docs/design/08-implementation-plan.md](docs/design/08-implementation-plan.md) is).

---

## Status

| | |
|---|---|
| **Last updated** | 2026-08-28, Ahmed Saad |
| **Spike** | **Run** against Chrome 151, 2026-08-28. Doc 11 filled. Three findings, D-024. ChatGPT's in-app browser still untested. |
| **Branch** | `feat/phaser-scenes`, off `main` at `3c5b940`, **not pushed** |
| **Pipeline** | Green: 451 tests, typecheck, lint, format, `vite build` plus the bundle budget, real `wrangler deploy --dry-run` |
| **Verify with** | `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` |
| **Run it** | `cd apps/worker && npx wrangler dev` in one shell, `cd apps/game && pnpm dev` in another. Vite proxies `/session` to `127.0.0.1:8787`, WebSocket included. |
| **Bundle** | Entry **10.3KB** gzipped of a 400KB budget. Phaser is a separate 358KB chunk, fetched only when a shift starts (D-026). |
| **Cloudflare** | Logged in. D1 database `semaphore-sessions` provisioned and migrated, local and remote. |

### What exists

| Path | State |
|---|---|
| `docs/design/` | Numbered set 00-12, complete. Plan sections 0.4 and 1.4 ticked. |
| `docs/` | Decision log at D-027, lessons journal live. |
| `packages/seed`, `packages/protocol` | Done. |
| `apps/worker/src/chambers/*.ts` | Done. All four chambers: generation, state, facts, world enumeration. |
| `apps/worker/src/reducer.ts` | Done end to end, ENTRY through **ESCAPED**. `ambiguityFor` is now exported, for the CONCORD route. |
| `apps/worker/src/views.ts`, `pilot.ts`, `manual.ts` | Done. `pilot.ts` also exports `inTheRoom`, the one phase gate the frame and the meter share. |
| `apps/worker/src/Session.ts` | Done. Read routes, machine state on every response, `/socket` (D-025) and `/concord` (D-027). |
| `apps/game/src/webmcp/*` | Done. Adapter, three-tier director, all 12 tools. The director gained `onCallStart`, which lights KEEPER's visor while a call is in flight. |
| `apps/game/src/net/*` | Done. `sessionClient` gained `concord()`; the socket is unchanged. |
| `apps/game/src/render/palette.ts` | The 14 locked colours, and the one place a channel becomes a colour. |
| `apps/game/src/render/rooms.ts` | **Pure.** All four rooms as geometry, from one `PilotView`. Takes no other input, by design and by type. |
| `apps/game/src/render/hud.ts` | **Pure.** Timer, meter fill, truncation, legend, band coordinates. |
| `apps/game/src/render/scenes.ts` | `LandingScene` and `ChamberScene`. The only file that touches Phaser's API. Paints; decides nothing. |
| `apps/game/src/render/station.ts` | The boot. Dynamic `import("phaser")`, the scene model, the CONCORD poll. |
| `apps/game/src/ui.ts` | The DOM shell: gate screen, canvas mount, prompt card, PILOT's buttons. The operator console is gone. |
| `tests/possible-worlds.test.ts` | Done and passing for all four chambers. The headline proof, honestly scoped. |
| `apps/spike/` | Built and **run** (Chrome 151, headless, 2026-08-28): 24 checks, 1 failing, 3 awaiting a model. |
| `apps/archive/`, `bench/` | Rules files only, no code. |

---

## Do this next

In order. Each item ends somewhere the pipeline is green and the repo is committable.

### 1. The declarative notepad, and the empty registry it threatens

`write_note` / `read_note` as a real `<form>` in the room (doc 03 section 8). It was deferred out of 1.4 because it is not a rendering problem: it is the one tool registered declaratively, and it interacts with the ending.

**Read D-024 before writing it.** Aborting a signal does not remove a declaratively registered tool; its lifetime is its form element's. `ToolDirector.endSession()` must remove the form from the DOM as well, or the game's final beat lands on a registry holding one tool. That is invisible until the demo.

### 2. Play a session, and run the spike in ChatGPT's in-app browser [needs a human]

Everything needed for a real session now exists and has been driven end to end in headless Chrome 151. What is left needs a person and a model.

**In ChatGPT's in-app browser**, on GPT-5.6 Sol or Terra (Luna has site tools disabled), re-run the spike. Two rows decide things: `crossorigin.delegation`, which flips `ARCHIVE_ORIGIN` from `same` to `cross`, and `declarative.agentinvoked`, which the notepad's per-line authorship depends on.

**With a model, in either browser**, fill doc 11 sections 6 and 7: whether a one-tool page gets discovered unprompted, whether `untrustedContentHint` changes behaviour, and the latency distribution that sizes Chamber III's window.

### 3. `apps/archive`, and moving `read_manual` and `read_station_log` to it

D-017 and D-020 record exactly what moves. One shape to know in advance: the vandalised Signal Room page is drawn from the session seed and the archive origin holds no storage binding, so it will serve static section text and fetch the session-scoped annotation from the worker.

### 4. Art, once the greybox has been playtested

Not before. Every room is flat rectangles and 8px monospace today, which is the point (doc 06 section 11). The layout constants in `rooms.ts` and `hud.ts` are the whole vertical budget and the tests hold them; a sprite pass changes what is drawn, not where.

---

## Things that will bite you

- **The registry is not empty at the ending once the notepad exists** (D-024). Aborting a signal does not remove a *declaratively* registered tool. `endSession()` must remove the form from the DOM as well.
- **Never import Phaser statically outside `render/station.ts`** (D-026). One top-level import moves 358KB into the entry chunk, and nothing about the page looks wrong. `apps/game/scripts/check-bundle.mjs` fails the build, which is the only thing that will tell you.
- **Captions are wider than their pieces.** A caption is centred under its piece and routinely overhangs it, so the caption is what collides with the next piece, runs past the grate, or falls out of the room band. Three separate layout bugs in this phase were all this one thing, and all three were invisible to a test that measured rectangles. The tests now measure caption extents; keep it that way.
- **The server writes for an agent, not for a 172-pixel panel.** `start full` answers with a paragraph. Anything from a tool response that reaches the HUD goes through `truncate` first, or it draws straight through the panel beside it.
- **`execute` takes one argument and no `AbortSignal`** in Chrome 151, reversing D-007. The plumbing is kept, typed optional and documented as unimplemented (D-024).
- **A host invocation delivers input as an object; the page-side `executeTool` helper wants a JSON string** (D-024). The game is only ever host-invoked. The benchmark harness will have to serialise.
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
- **Nothing puzzle-critical goes into the DOM.** What is left in the DOM is the starter prompt and buttons whose labels name actions, never facts.
- **`tests/` is a workspace package** (`@semaphore/tests`); import `@semaphore/worker/chambers/airlock`, not a relative path.
- **`pnpm-workspace.yaml` needs `allowBuilds`** for `esbuild` and `workerd`.
- **D1 migrations are not automatic.** Run both the local and `--remote` `wrangler d1 execute` from `apps/worker/`.
- Never weaken an asymmetry check to go green. It is the one class of change that is never accepted.

---

## Waiting on

| Item | Owner | Note |
|---|---|---|
| Spike in ChatGPT's in-app browser | Human | The only thing keeping `ARCHIVE_ORIGIN` at `same`. Chrome already passes cross-origin delegation. |
| Socket behaviour through Cloudflare's edge | Human | Verified against local `workerd` only. Watch a deployed session through one full chamber before rehearsing the demo on it. |
| A real agent session | Human | Everything needed exists and has been driven in headless Chrome. Doc 11 sections 6 and 7 stay empty until a model meets the page. |
| Playtesters | Human | Doc 08 section 0.1 wants six. The greybox is now playable, so this unblocks. The only task that does not parallelise. |
| Repo made public | Human | Deliberately deferred to just before the deadline. |
| Doc 03 section 10 wording fix | Whoever writes submission copy | It claims "server-generated ID"; the real guarantee is zero PII (D-023). Say what is true. |

---

## How to leave this file

Before you stop working, rewrite **Status**, **Do this next** and **Waiting on** so they describe the repo as it is, not as you found it. Add to **Things that will bite you** only what genuinely cost you time. Keep the whole file under roughly 120 lines: a handoff nobody reads because it is long is worse than no handoff.
