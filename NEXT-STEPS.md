# NEXT STEPS

**The handoff file.** Whoever stops working updates this before they stop. Whoever starts working reads this first and nothing else.

It answers three questions and only three: where the repo is right now, what to pick up next, and what will bite you if nobody warns you. It is not a changelog ([docs/decision-log.md](docs/decision-log.md) is), not a journal ([docs/lessons-learned.md](docs/lessons-learned.md) is), and not a plan ([docs/design/08-implementation-plan.md](docs/design/08-implementation-plan.md) is).

---

## Status

| | |
|---|---|
| **Last updated** | 2026-08-28, Ahmed Saad |
| **Branch** | `main`, clean, pushed |
| **Pipeline** | Green: 154 tests, typecheck, lint, format, real `wrangler deploy --dry-run` against the live account |
| **Verify with** | `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` |
| **Cloudflare** | Logged in (`npx wrangler login`). Real D1 database `semaphore-sessions` provisioned and migrated, both local and remote. |

### What exists

| Path | State |
|---|---|
| `docs/design/` | Numbered set 00-12, complete. |
| `docs/` | Decision log at D-010, lessons journal live, both beside the set. |
| `packages/seed` | Done. xorshift128+, unbiased `int()`, Fisher-Yates `shuffle()`. |
| `packages/protocol` | Done. Five-channel model, `projectFacts`, error taxonomy, session vocabulary, JSONL log schema. |
| `apps/worker/src/chambers/{glyphs,airlock}.ts` | Done. Chamber 0 fully modelled: generation, state, facts, world enumeration. |
| `apps/worker/src/{projection,worlds}.ts` | Done. `projectForPilot`/`projectForKeeper`, `consistentWorlds`, `measure`, `concordBits`. |
| `apps/worker/src/{latency,semaphore,machine}.ts` | Done. Stamina window calc, the action semaphore, the full session state machine. |
| `apps/worker/src/reducer.ts` | Done for Chamber 0. `begin_shift`, `start`, `pull_lever`. Extend by adding chambers the same way. |
| `apps/worker/src/{log,Session,index}.ts` | Done. Event persistence, the Durable Object shell, the router. |
| `apps/worker/migrations/0001_sessions.sql` | Done. Applied to the real D1 database, local and remote. |
| `tests/possible-worlds.test.ts` | **Done and passing.** The headline proof, honestly scoped (see below). |
| `apps/spike/` | Built, **never run**. Needs a WebMCP browser. |
| `apps/game/`, `apps/archive/`, `bench/` | Rules files only, no code. |

---

## Do this next

In order. Each item ends somewhere the pipeline is green and the repo is committable.

### 1. Run the spike [needs a human with a browser]

Still the only task nobody can automate, and it still gates real architecture. Unchanged from before: see "How to run this" in `apps/spike/index.html`, or `apps/spike/CLAUDE.md`.

**The row that matters is `toolchange.empty`.** If `toolchange` does not fire when the registry drains to zero, the game's ending does not exist and Chamber III's finale needs redesigning. Check that one first. Second: `crossorigin.delegation`, which decides whether `apps/archive` is a real deployment or `ARCHIVE_ORIGIN=same`.

### 2. Chamber I, the Signal Room

Follow `chambers/airlock.ts`'s shape exactly: a params type, a state type, `generate` / `initial` / `facts` / `candidates` / `correctAction`. Then:

- Add a `signalRoom` field to `PersistedSession` in `reducer.ts`, alongside `airlock`, never replacing it.
- Add `press_key` and `reset_sequence` actions to the `Action` union and to `Session.ts`'s routing.
- Add a Chamber I entry to `tests/possible-worlds.test.ts`'s chamber list, and confirm the published figure of 1,956 worlds and 10.93 bits falls out of `measure()` rather than being typed by hand.
- **Read D-009 before writing the proof's assertion.** The airlock proof is scoped to states reachable without exhaustive elimination; Chamber I's 1,956-sequence space makes that scoping almost never bind in practice, but the test should still filter the same way rather than asserting over every reachable state unconditionally.
- The vandalism flag is seeded (`manualPageState` is `VISUAL`, `vandalismText` is `TACTILE`). That split is the whole puzzle; do not let both land in the same projection.

### 3. Chamber transition and the timer

`TRANSITION_COMPLETE` and `TIMER_EXPIRED` exist in `machine.ts` and are tested, but nothing in `reducer.ts` or `Session.ts` fires them yet. `pull_lever` solving the airlock stops at `TRANSITIONING` and goes no further, honestly, because Chamber I doesn't exist to transition into. Once it does:
- Wire `TRANSITION_COMPLETE` into the reducer once a chamber is fully wrapped up.
- Server-authoritative timer: needs a Durable Object alarm (`state.storage.setAlarm`), not a client-driven tick, since the timer must be tamper-proof (doc 05 section 1).

### 4. The WebMCP client layer

`apps/game/src/webmcp/adapter.ts` first, then `director.ts` with the three-tier `AbortController` lifecycle, then `begin_shift` wired to `fetch("/session/:id/begin_shift")`. The briefing text already exists verbatim in `reducer.ts`'s `briefing()` function; do not retype it.

---

## Things that will bite you

- **Latency is the gap between calls, not a call's own duration.** `PersistedSession.observedLatencyMs` comes from `lastRespondedAtMs`, computed inside the pure reducer. `ActionSemaphore.latencies` is a *different*, much smaller number (server processing time) and must never be fed into `staminaWindowMs`. Full story: D-010. Any new mutating action must update `lastRespondedAtMs`, and if it is a chamber action, append to `observedLatencyMs`.
- **The possible-worlds proof is scoped, deliberately** (D-009). It excludes states where brute-force elimination has already determined the answer. Do not widen the scope to make a new chamber pass; if a chamber fails the proof, the chamber's design is wrong, not the test.
- **`PERCEIVED_BY` must never be forked.** One definition, three consumers: the projections, the proof, the smoke test.
- **`execute` takes two arguments**, `(inputObject, { signal })`, and `requestUserInteraction` does not exist (D-007). The `AbortSignal` is real and unused so far; wire it into `ActionSemaphore` as a cancellation path when the client layer lands.
- **No Cloudflare product that needs a card.** D1 plus DO SQLite is the store, both provisioned. Check a product's *activation* path before adopting it, not its pricing page, and check daily operation caps before the storage cap (D-006, D-008, the KV near-miss in lessons-learned.md).
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
