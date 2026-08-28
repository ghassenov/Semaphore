# NEXT STEPS

**The handoff file.** Whoever stops working updates this before they stop. Whoever starts working reads this first and nothing else.

It answers three questions and only three: where the repo is right now, what to pick up next, and what will bite you if nobody warns you. It is not a changelog ([docs/decision-log.md](docs/decision-log.md) is), not a journal ([docs/lessons-learned.md](docs/lessons-learned.md) is), and not a plan ([docs/design/08-implementation-plan.md](docs/design/08-implementation-plan.md) is).

---

## Status

| | |
|---|---|
| **Last updated** | 2026-08-28, Ahmed Saad |
| **Branch** | `main`, clean, pushed |
| **Pipeline** | Green: 201 tests, typecheck, lint, format, real `wrangler deploy --dry-run` against the live account |
| **Verify with** | `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` |
| **Cloudflare** | Logged in (`npx wrangler login`). Real D1 database `semaphore-sessions` provisioned and migrated, both local and remote. |

### What exists

| Path | State |
|---|---|
| `docs/design/` | Numbered set 00-12, complete. |
| `docs/` | Decision log at D-013, lessons journal live, both beside the set. |
| `packages/seed` | Done. xorshift128+, unbiased `int()`, Fisher-Yates `shuffle()`. |
| `packages/protocol` | Done. Five-channel model, `projectFacts`, error taxonomy, session vocabulary, JSONL log schema. |
| `apps/worker/src/chambers/{glyphs,airlock,signal_room,blind_panel}.ts` | Done. Chambers 0, I and II fully modelled: generation, state, facts, world enumeration. |
| `apps/worker/src/{projection,worlds}.ts` | Done. `projectForPilot`/`projectForKeeper`, `consistentWorlds`, `measure`, `concordBits`. |
| `apps/worker/src/{latency,semaphore,machine}.ts` | Done. Stamina window calc, the action semaphore, the full session state machine. |
| `apps/worker/src/reducer.ts` | Done for Chambers 0, I and II. `begin_shift`, `start`, `pull_lever`, `press_key`, `reset_sequence`, `rotate_dial`, auto-transition between implemented chambers. Extend by adding chambers the same way. |
| `apps/worker/src/{log,Session,index}.ts` | Done. Event persistence, the Durable Object shell, the router. |
| `apps/worker/migrations/0001_sessions.sql` | Done. Applied to the real D1 database, local and remote. |
| `tests/possible-worlds.test.ts` | **Done and passing** for Chambers 0, I and II. The headline proof, honestly scoped (see below). |
| `apps/spike/` | Built, **never run**. Needs a WebMCP browser. |
| `apps/game/`, `apps/archive/`, `bench/` | Rules files only, no code. |

---

## Do this next

In order. Each item ends somewhere the pipeline is green and the repo is committable.

### 1. Run the spike [needs a human with a browser]

Still the only task nobody can automate, and it still gates real architecture. Unchanged from before: see "How to run this" in `apps/spike/index.html`, or `apps/spike/CLAUDE.md`.

**The row that matters is `toolchange.empty`.** If `toolchange` does not fire when the registry drains to zero, the game's ending does not exist and Chamber III's finale needs redesigning. Check that one first. Second: `crossorigin.delegation`, which decides whether `apps/archive` is a real deployment or `ARCHIVE_ORIGIN=same`.

### 2. Chamber III, the Concord Lock

The finale, and the one with an actual server-authoritative timer requirement baked into the puzzle (the stamina window). Read D-011, D-012 and D-013 before writing `correctAction`/`candidates()`: this chamber's answer (a Caesar-shifted passphrase, doc 02 section 3.4) is again multi-part, so the same discipline applies. Two things specific to this chamber:

- `staminaWindowMs` (`latency.ts`) already exists and is tested; wire it in rather than hardcoding a window.
- The finale needs the timer (item 3 below) to be real, since the stamina countdown and the lockout penalty are both time-based. This is probably the point where the timer work stops being deferrable.

### 3. The server-authoritative timer

Still nothing fires `TIMER_EXPIRED` anywhere. Needs a Durable Object alarm (`state.storage.setAlarm`), not a client-driven tick, since the timer must be tamper-proof (doc 05 section 1). Chamber II's gauge drift (doc 02 section 3.3, one mark per 20 seconds) and Chamber III's stamina countdown both depend on this landing; the chambers built so far do not.

### 4. The WebMCP client layer

`apps/game/src/webmcp/adapter.ts` first, then `director.ts` with the three-tier `AbortController` lifecycle, then `begin_shift` wired to `fetch("/session/:id/begin_shift")`. The briefing text already exists verbatim in `reducer.ts`'s `briefing()` function; do not retype it.

---

## Things that will bite you

- **A narrowing signal that depends on history must replay the whole history under each hypothesis, not compare current state** (D-013, generalising D-012). The moment a chamber's evidence depends on "everything that happened so far" rather than "what's true right now" (Chamber II's registered-click count depends on the gauge's accumulated position), `candidates()` has to replay the full commanded-action sequence per hypothesis. Ask this question before writing a new chamber's `candidates()`, not after a collapse test fails.
- **`correctAction` must be the whole remaining plan, not the next single step, for any multi-step chamber** (D-011). `worlds.ts`'s `ChamberWorlds` interface docstring says this explicitly; read it before writing a new chamber's `correctAction`.
- **A witness-scoped `candidates()` must filter by accepted history, not copy it onto every witness** (D-012). Copying makes the history field trivially match everywhere, which silently disables mid-solve narrowing while every entry-state assertion keeps passing. Test the collapse, not just the start.
- **Latency is the gap between calls, not a call's own duration** (D-010). `PersistedSession.observedLatencyMs` comes from `lastRespondedAtMs`, computed inside the pure reducer. `ActionSemaphore.latencies` is a *different*, much smaller number and must never feed `staminaWindowMs`.
- **The possible-worlds proof is scoped, deliberately** (D-009). Chamber 0 excludes states where brute-force elimination has already determined the answer. Do not widen a scope to make a chamber pass; if a chamber fails the proof, the chamber's design is wrong, not the test.
- **`PERCEIVED_BY` must never be forked.** One definition, three consumers: the projections, the proof, the smoke test.
- **`execute` takes two arguments**, `(inputObject, { signal })`, and `requestUserInteraction` does not exist (D-007). The `AbortSignal` is real and unused so far; wire it into `ActionSemaphore` as a cancellation path when the client layer lands.
- **No Cloudflare product that needs a card.** D1 plus DO SQLite is the store, both provisioned. Check a product's *activation* path before adopting it, not its pricing page, and check daily operation caps before the storage cap (D-006, D-008).
- **`state.id.name` recovers a Durable Object's own session id.** It only works because `index.ts` creates ids via `idFromName(sessionId)`. Change that and every session id silently becomes an opaque hex string instead of the seed.
- **`tests/` is a workspace package** (`@semaphore/tests`), and `apps/worker` exports `./*` from source, so import `@semaphore/worker/chambers/airlock`, not a relative path.
- **`pnpm-workspace.yaml` needs `allowBuilds`** for `esbuild` and `workerd`, or wrangler's install fails non-interactively. Do not strip it again.
- **D1 migrations are not automatic.** After editing `migrations/*.sql`, run both `npx wrangler d1 execute semaphore-sessions --file=...` (local) and `--remote --file=...` (production) from `apps/worker/`.
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
