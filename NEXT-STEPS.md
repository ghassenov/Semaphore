# NEXT STEPS

**The handoff file.** Whoever stops working updates this before they stop. Whoever starts working reads this first and nothing else.

It answers three questions and only three: where the repo is right now, what to pick up next, and what will bite you if nobody warns you. It is not a changelog ([docs/decision-log.md](docs/decision-log.md) is), not a journal ([docs/lessons-learned.md](docs/lessons-learned.md) is), and not a plan ([docs/design/08-implementation-plan.md](docs/design/08-implementation-plan.md) is).

---

## Status

| | |
|---|---|
| **Last updated** | 2026-08-28, Ahmed Saad |
| **Branch** | `feat/webmcp-tool-layer`, off `main` at `0f65aad`, **not pushed** |
| **Pipeline** | Green: 365 tests, typecheck, lint, format, `vite build`, real `wrangler deploy --dry-run` |
| **Verify with** | `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` |
| **Run it** | `cd apps/worker && npx wrangler dev` in one shell, `cd apps/game && pnpm dev` in another. Vite proxies `/session` to `127.0.0.1:8787`. |
| **Cloudflare** | Logged in. D1 database `semaphore-sessions` provisioned and migrated, local and remote. |

### What exists

| Path | State |
|---|---|
| `docs/design/` | Numbered set 00-12, complete. |
| `docs/` | Decision log at D-023, lessons journal live. |
| `packages/seed`, `packages/protocol` | Done. |
| `apps/worker/src/chambers/*.ts` | Done. All four chambers: generation, state, facts, world enumeration. |
| `apps/worker/src/reducer.ts` | Done end to end. A full-mode session now runs ENTRY through **ESCAPED**: `open_the_door` was the missing terminal action, so `session_end` is written for the first time. |
| `apps/worker/src/views.ts` | Done. `describe_chamber`, `inspect`, `read_ciphertext`, `get_lock_state` as pure `projectForKeeper` projections (D-019). |
| `apps/worker/src/manual.ts` | Done. The station manual, all seven sections, including the seeded vandalised page. **Temporarily placed** (D-020), like `archive/` (D-017). |
| `apps/worker/src/{projection,worlds,latency,semaphore,machine,log,Session,index}.ts` | Done. `chamberSeed` moved to `machine.ts`; `Session` gained the read routes and puts machine state on every response. |
| `apps/game/src/webmcp/adapter.ts` | Done. The only file touching the spec. Degrades to nulls, never throws. |
| `apps/game/src/webmcp/director.ts` | Done. The three-tier `AbortController` lifecycle, ending in an empty registry. **The file a judge reads first.** |
| `apps/game/src/webmcp/tools.*.ts` | Done. All 12 tools: `begin_shift`, four persistent, the chamber sets, the Archive's, `open_the_door`. |
| `apps/game/src/net/sessionClient.ts` | Done. Never rejects except on abort; announces machine state to the director (D-021). |
| `apps/game/src/ui.ts` | Gate screen done. Operator console is deliberate greybox scaffolding, replaced by Phase 1.4. |
| `tests/possible-worlds.test.ts` | Done and passing for all four chambers. The headline proof, honestly scoped. |
| `apps/spike/` | Built, **never run**. Needs a WebMCP browser. |
| `apps/archive/`, `bench/` | Rules files only, no code. |

---

## Do this next

In order. Each item ends somewhere the pipeline is green and the repo is committable.

### 1. Run the spike [needs a human with a browser]

Unchanged and now overdue: it is the only task nobody can automate, and the tool layer is built on three behaviours it has not yet confirmed. See `apps/spike/CLAUDE.md`.

**The row that matters is `toolchange.empty`.** `director.ts` ends the session by aborting into an empty registry, and that is the game's last beat. Second: `crossorigin.delegation`, which decides whether `apps/archive` is a real deployment or `ARCHIVE_ORIGIN=same`.

Then play a session in ChatGPT's in-app browser. Everything needed for one now exists.

### 2. The client foundation (plan §1.4)

Phaser boot at 320x180 with integer snap, `LandingScene` with the starter prompt card, greybox `ChamberScene`, the PILOT avatar, and the two `toolchange` renderings the console currently fakes with a `<ul>`: `ManifestPanel` and `KeeperBody`, both from one listener reading `getTools()`.

This also needs the WebSocket the client does not have yet: a `/session/:id/socket` endpoint on the Durable Object pushing `projectForPilot` deltas. Nothing renders a puzzle until it exists, which is why the console shows only machine state today.

The declarative notepad (`write_note`/`read_note`, doc 03 §8) belongs here rather than in the tool layer, because it is a real form in the room and needs one.

### 3. `apps/archive`, and moving `read_manual` and `read_station_log` to it

Once the client exists to embed it. D-017 and D-020 record exactly what moves. One shape to know in advance: the vandalised Signal Room page is drawn from the session seed and the archive origin holds no storage binding, so it will serve static section text and fetch the session-scoped annotation from the worker.

---

## Things that will bite you

- **The spike has still not been run, and more now rests on it.** `fake-registry.ts` implements the three behaviours the whole tool layer assumes. If a browser disagrees with any of them, that file is wrong and every director test is measuring the wrong thing. Its docstring says so; do not let that stay theoretical.
- **`describe_chamber` must answer every phase, not just the chambers.** It threw `E_NO_SESSION` for `FINALE` on the first pass, which the reducer's idempotent `start` path would have surfaced as a lie. An agent that has lost the thread needs a next action, not a diagnosis.
- **A read-only tool must not take the semaphore** (D-019). Blocking a look behind a turning dial returns `E_BUSY` for a call that was always safe, and teaches an agent to stop calling `get_status` under pressure, which is exactly when the briefing tells it to.
- **Read-only calls are not in the session log.** Deliberate (D-019), and it means "did the agent read the manual before acting" is not yet measurable. The benchmark's author should read that entry, not discover the gap.
- **The registry follows the server, never a guess** (D-021). Chambers auto-advance inside one `reduce()` call and PILOT moves the session without any tool call at all, so anything inferring a tier from what it just called will be wrong within one chamber.
- **A log event cannot honestly carry a field that is not yet chosen at the point it fires** (D-016). Check what is actually known at the moment an event fires, not at the moment it feels natural to emit it.
- **Generate fixtures from the real code path, not by hand** (the lesson behind D-016). `apps/worker/scripts/generate-ghost.ts` is the pattern to reuse for a second ghost.
- **Check a chamber's secret against what an adversary would actually try** (D-014), not just against its own rules.
- **A narrowing signal that depends on history must replay the whole history under each hypothesis** (D-013, generalising D-012). Ask this before writing a new chamber's `candidates()`.
- **`correctAction` must be the whole remaining plan, not the next single step** (D-011).
- **Latency is the gap between calls, not a call's own duration** (D-010). The director's own timing is the client's view for the action log; the number the game derives from is server-side.
- **The possible-worlds proof is scoped, deliberately** (D-009). If a chamber fails it, the chamber is wrong, not the test.
- **`PERCEIVED_BY` must never be forked.** One definition, three consumers.
- **`execute` takes two arguments**, `(input, { signal })` (D-007). The `AbortSignal` is now genuinely used: it reaches `fetch`, and an abort is the one thing `sessionClient` re-throws.
- **A `GameError` thrown out of `reduce()` discards everything that call settled.** A refusal that has state to persist has to come back as a normal `ReduceResult`, not a throw.
- **A Durable Object alarm must never be the only place a rule lives** (D-018). Derive from a stored timestamp first.
- **The failure card quotes courses of action, not consistent worlds** (D-018). Chamber 0: six worlds, three actions, 1.58 bits.
- **Nothing in `apps/game` outside `adapter.ts` may touch `modelContext`.** A grep that returns a second file is a defect.
- **Nothing puzzle-critical goes into the DOM.** The operator console prints machine and registry state only. When the chambers get real rendering it goes on a canvas.
- **`tests/` is a workspace package** (`@semaphore/tests`); import `@semaphore/worker/chambers/airlock`, not a relative path.
- **`pnpm-workspace.yaml` needs `allowBuilds`** for `esbuild` and `workerd`.
- **D1 migrations are not automatic.** Run both the local and `--remote` `wrangler d1 execute` from `apps/worker/`.
- **`generate-ghost.ts` does not format its own output.** Run `npx prettier --write apps/worker/src/archive/ghost-01.ts` after regenerating.
- Never weaken an asymmetry check to go green. It is the one class of change that is never accepted.

---

## Waiting on

| Item | Owner | Note |
|---|---|---|
| Spike results | Human with a WebMCP browser | Now blocking verification of a layer that is already built, not just its design. |
| A real agent session | Human | Everything needed for one exists. This is the first time that has been true. |
| Playtesters | Human | Doc 08 section 0.1 wants six. The only task that does not parallelise. |
| Repo made public | Human | Deliberately deferred to just before the deadline. |
| Doc 03 §10 wording fix | Whoever writes submission copy | It claims "server-generated ID"; the real guarantee is zero PII (D-023). Say what is true. |

---

## How to leave this file

Before you stop working, rewrite **Status**, **Do this next** and **Waiting on** so they describe the repo as it is, not as you found it. Add to **Things that will bite you** only what genuinely cost you time. Keep the whole file under roughly 120 lines: a handoff nobody reads because it is long is worse than no handoff.
