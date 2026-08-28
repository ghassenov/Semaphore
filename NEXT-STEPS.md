# NEXT STEPS

**The handoff file.** Whoever stops working updates this before they stop. Whoever starts working reads this first and nothing else.

It answers three questions and only three: where the repo is right now, what to pick up next, and what will bite you if nobody warns you. It is not a changelog ([docs/decision-log.md](docs/decision-log.md) is), not a journal ([docs/lessons-learned.md](docs/lessons-learned.md) is), and not a plan ([docs/design/08-implementation-plan.md](docs/design/08-implementation-plan.md) is).

---

## Status

| | |
|---|---|
| **Last updated** | 2026-08-28, Ahmed Saad |
| **Branch** | `main`, clean, pushed |
| **Pipeline** | Green: 238 tests, typecheck, lint, format, real `wrangler deploy --dry-run` against the live account |
| **Verify with** | `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` |
| **Cloudflare** | Logged in (`npx wrangler login`). Real D1 database `semaphore-sessions` provisioned and migrated, both local and remote. |

### What exists

| Path | State |
|---|---|
| `docs/design/` | Numbered set 00-12, complete. |
| `docs/` | Decision log at D-017, lessons journal live, both beside the set. |
| `packages/seed`, `packages/protocol` | Done. |
| `apps/worker/src/chambers/*.ts` | Done. **All four chambers** modelled: generation, state, facts, world enumeration. |
| `apps/worker/src/archive/*.ts` | Done, **temporarily placed** (D-017): the Archive beat's logic and one generated ghost fixture, living in `apps/worker` until `apps/archive` exists to host it properly on its own origin. |
| `apps/worker/src/{projection,worlds}.ts` | Done. `projectForPilot`/`projectForKeeper`, `consistentWorlds`, `measure`, `concordBits`. |
| `apps/worker/src/{latency,semaphore,machine}.ts` | Done. Stamina window calc, the action semaphore, the full session state machine. |
| `apps/worker/src/reducer.ts` | **Done end to end: a full-mode session now completes all four chambers**, verified by tracing it. |
| `apps/worker/src/{log,Session,index}.ts` | Done. Event persistence, the Durable Object shell, the router. |
| `apps/worker/migrations/0001_sessions.sql` | Done. Applied to the real D1 database, local and remote. |
| `tests/possible-worlds.test.ts` | **Done and passing for all four chambers.** The headline proof, honestly scoped (see below). |
| `apps/spike/` | Built, **never run**. Needs a WebMCP browser. |
| `apps/game/`, `apps/archive/`, `bench/` | Rules files only, no code. |

---

## Do this next

In order. Each item ends somewhere the pipeline is green and the repo is committable.

### 1. Run the spike [needs a human with a browser]

Still the only task nobody can automate, and it still gates real architecture. Unchanged from before: see "How to run this" in `apps/spike/index.html`, or `apps/spike/CLAUDE.md`.

**The row that matters is `toolchange.empty`.** If `toolchange` does not fire when the registry drains to zero, the game's ending does not exist and Chamber III's finale needs redesigning. Check that one first. Second: `crossorigin.delegation`, which decides whether `apps/archive` is a real deployment or `ARCHIVE_ORIGIN=same`.

### 2. The server-authoritative timer

The only mechanical gap left in the worker. Nothing fires `TIMER_EXPIRED` anywhere. Needs a Durable Object alarm (`state.storage.setAlarm`), not a client-driven tick, since the timer must be tamper-proof (doc 05 section 1). Chamber II's gauge drift (doc 02 section 3.3) is the other thing waiting on it.

Note that Chamber III did **not** need this: its stamina window and lockout are derived from timestamps passed into the pure reducer, so the whole finale is testable without any alarm. Prefer that pattern where it fits, before reaching for a real alarm.

### 3. The WebMCP client layer

`apps/game/src/webmcp/adapter.ts` first, then `director.ts` with the three-tier `AbortController` lifecycle, then `begin_shift` wired to `fetch("/session/:id/begin_shift")`. The briefing text already exists verbatim in `reducer.ts`'s `briefing()` function; do not retype it.

### 4. `apps/archive`, and moving the Archive beat to it

Once the client exists to embed it, build the real cross-origin tool provider (doc 03 section 7) and move `read_station_log`'s logic there from `apps/worker/src/archive/` (D-017 documents exactly what moves). The data is already in the right place and format: `fixtures/ghosts/ghost-01.jsonl`.

---

## Things that will bite you

- **A log event cannot honestly carry a field that is not yet chosen at the point it fires** (D-016). `session_start`'s `mode` was wrong for every non-full-mode session until this was caught by generating a fixture from real play. If you add a field to an event type, check what is actually known at the moment that event fires, not just at the moment it feels natural to emit it.
- **Generate fixtures from the real code path, not by hand, even for something that is not a test** (the lesson behind D-016's discovery). The ghost fixture's job was fidelity; the bug-finding was free. `apps/worker/scripts/generate-ghost.ts` is the pattern to reuse for a second ghost.
- **Check a chamber's secret against what an adversary would actually try, not just against its own rules** (D-014). Chamber III's design doc used an English passphrase, which meant exactly one of its 26 decryptions was readable and an agent solved the finale alone: 0 bits, not the published 4.70.
- **A narrowing signal that depends on history must replay the whole history under each hypothesis, not compare current state** (D-013, generalising D-012). Ask this before writing a new chamber's `candidates()`, not after a collapse test fails.
- **`correctAction` must be the whole remaining plan, not the next single step, for any multi-step chamber** (D-011). `worlds.ts`'s `ChamberWorlds` interface docstring says this explicitly.
- **A witness-scoped `candidates()` must filter by accepted history, not copy it onto every witness** (D-012). Test the collapse, not just the start.
- **Latency is the gap between calls, not a call's own duration** (D-010). `ActionSemaphore.latencies` is a *different*, much smaller number and must never feed `staminaWindowMs`.
- **The possible-worlds proof is scoped, deliberately** (D-009). Do not widen a scope to make a chamber pass; if a chamber fails the proof, the chamber's design is wrong, not the test.
- **`PERCEIVED_BY` must never be forked.** One definition, three consumers: the projections, the proof, the smoke test.
- **`execute` takes two arguments**, `(inputObject, { signal })`, and `requestUserInteraction` does not exist (D-007). The `AbortSignal` is real and unused so far.
- **No Cloudflare product that needs a card.** D1 plus DO SQLite is the store, both provisioned. Check a product's *activation* path before adopting it, not its pricing page.
- **`state.id.name` recovers a Durable Object's own session id.** It only works because `index.ts` creates ids via `idFromName(sessionId)`.
- **`tests/` is a workspace package** (`@semaphore/tests`), and `apps/worker` exports `./*` from source, so import `@semaphore/worker/chambers/airlock`, not a relative path.
- **`pnpm-workspace.yaml` needs `allowBuilds`** for `esbuild` and `workerd`, or wrangler's install fails non-interactively.
- **D1 migrations are not automatic.** After editing `migrations/*.sql`, run both the local and `--remote` `wrangler d1 execute` from `apps/worker/`.
- **`apps/worker/scripts/generate-ghost.ts` does not format its own output.** Run `npx prettier --write apps/worker/src/archive/ghost-01.ts` after regenerating, or CI's format check fails.
- Never weaken an asymmetry check to go green. It is the one class of change that is never accepted.

---

## Waiting on

| Item | Owner | Note |
|---|---|---|
| Spike results | Human with a WebMCP browser | Blocks nothing yet, gates the archive design and the finale |
| Playtesters | Human | Doc 08 section 0.1 wants six people. The only task that does not parallelise. |
| Repo made public | Human | Deliberately deferred to just before the deadline. |
| Netlify credits | Done | Form submitted 2026-08-28. |

---

## How to leave this file

Before you stop working, rewrite **Status**, **Do this next** and **Waiting on** so they describe the repo as it is, not as you found it. Add to **Things that will bite you** only what genuinely cost you time. Keep the whole file under roughly 120 lines: a handoff nobody reads because it is long is worse than no handoff.
