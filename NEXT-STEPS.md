# NEXT STEPS

**The handoff file.** Whoever stops working updates this before they stop. Whoever starts working reads this first and nothing else.

It answers three questions and only three: where the repo is right now, what to pick up next, and what will bite you if nobody warns you. It is not a changelog ([docs/decision-log.md](docs/decision-log.md) is), not a journal ([docs/lessons-learned.md](docs/lessons-learned.md) is), and not a plan ([docs/design/08-implementation-plan.md](docs/design/08-implementation-plan.md) is).

---

## Status

| | |
|---|---|
| **Last updated** | 2026-08-28, Ahmed Saad |
| **Branch** | `main`, clean, pushed |
| **Pipeline** | Green: 181 tests, typecheck, lint, format, real `wrangler deploy --dry-run` against the live account |
| **Verify with** | `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` |
| **Cloudflare** | Logged in (`npx wrangler login`). Real D1 database `semaphore-sessions` provisioned and migrated, both local and remote. |

### What exists

| Path | State |
|---|---|
| `docs/design/` | Numbered set 00-12, complete. |
| `docs/` | Decision log at D-012, lessons journal live, both beside the set. |
| `packages/seed` | Done. xorshift128+, unbiased `int()`, Fisher-Yates `shuffle()`. |
| `packages/protocol` | Done. Five-channel model, `projectFacts`, error taxonomy, session vocabulary, JSONL log schema. |
| `apps/worker/src/chambers/{glyphs,airlock,signal_room}.ts` | Done. Chambers 0 and I fully modelled: generation, state, facts, world enumeration. |
| `apps/worker/src/{projection,worlds}.ts` | Done. `projectForPilot`/`projectForKeeper`, `consistentWorlds`, `measure`, `concordBits`. |
| `apps/worker/src/{latency,semaphore,machine}.ts` | Done. Stamina window calc, the action semaphore, the full session state machine. |
| `apps/worker/src/reducer.ts` | Done for Chambers 0 and I. `begin_shift`, `start`, `pull_lever`, `press_key`, `reset_sequence`, auto-transition between implemented chambers. Extend by adding chambers the same way. |
| `apps/worker/src/{log,Session,index}.ts` | Done. Event persistence, the Durable Object shell, the router. |
| `apps/worker/migrations/0001_sessions.sql` | Done. Applied to the real D1 database, local and remote. |
| `tests/possible-worlds.test.ts` | **Done and passing** for Chambers 0 and I. The headline proof, honestly scoped (see below). |
| `apps/spike/` | Built, **never run**. Needs a WebMCP browser. |
| `apps/game/`, `apps/archive/`, `bench/` | Rules files only, no code. |

---

## Do this next

In order. Each item ends somewhere the pipeline is green and the repo is committable.

### 1. Run the spike [needs a human with a browser]

Still the only task nobody can automate, and it still gates real architecture. Unchanged from before: see "How to run this" in `apps/spike/index.html`, or `apps/spike/CLAUDE.md`.

**The row that matters is `toolchange.empty`.** If `toolchange` does not fire when the registry drains to zero, the game's ending does not exist and Chamber III's finale needs redesigning. Check that one first. Second: `crossorigin.delegation`, which decides whether `apps/archive` is a real deployment or `ARCHIVE_ORIGIN=same`.

### 2. Chamber II, the Blind Panel

Follow `chambers/signal_room.ts`'s shape, not `airlock.ts`'s: Blind Panel's answer is a multi-value configuration (dial-to-gauge permutation plus inversions), so it needs the same care signal_room needed. Two rules earned the hard way, read before writing anything:

- **`correctAction` must return the whole remaining answer, not one step of it** (D-011). A single-value read produces a capped, wrong bits figure. Verify by actually running `measure()` before trusting the number; do not assume a number from the docs is correct until the code reproduces it (D-009, D-011 both caught this the same way).
- **If `candidates()` is scoped to witnesses rather than fully enumerated, filter by play history; never force it** (D-012). A witness must be excluded when its own answer disagrees with what `SHARED` state has already confirmed, or mid-solve narrowing silently stops working while every entry-state test still passes. Write the "does ambiguity collapse as play progresses" test, not just the entry-state test.
- The `AUDIBLE` channel (`lastClicks`, heard by both, rendered differently) is new here and genuinely carries puzzle information; see doc 02 section 3.3.
- Gauge drift toward zero needs the timer (see item 3) to mean anything; the pure dial-rotation mechanics do not.

### 3. Chamber transition and the timer

`TRANSITION_COMPLETE` and `TIMER_EXPIRED` exist in `machine.ts` and are tested; `TRANSITION_COMPLETE` is now wired for chambers with implemented mechanics (`settleTransition` in `reducer.ts`). Once Chamber II lands it will auto-advance into automatically. `TIMER_EXPIRED` is still unfired anywhere:
- Server-authoritative timer needs a Durable Object alarm (`state.storage.setAlarm`), not a client-driven tick, since the timer must be tamper-proof (doc 05 section 1).

### 4. The WebMCP client layer

`apps/game/src/webmcp/adapter.ts` first, then `director.ts` with the three-tier `AbortController` lifecycle, then `begin_shift` wired to `fetch("/session/:id/begin_shift")`. The briefing text already exists verbatim in `reducer.ts`'s `briefing()` function; do not retype it.

---

## Things that will bite you

- **`correctAction` must be the whole remaining plan, not the next single step, for any multi-step chamber** (D-011). Signal Room's first pass returned only the next key and silently capped its bits figure at `log2(key count)`. `worlds.ts`'s `ChamberWorlds` interface docstring now says this explicitly; read it before writing a new chamber's `correctAction`.
- **A witness-scoped `candidates()` must filter by accepted history, not copy it onto every witness** (D-012). Copying makes the history field trivially match everywhere, which silently disables mid-solve narrowing while every entry-state assertion keeps passing. Test the collapse, not just the start.
- **Latency is the gap between calls, not a call's own duration** (D-010). `PersistedSession.observedLatencyMs` comes from `lastRespondedAtMs`, computed inside the pure reducer. `ActionSemaphore.latencies` is a *different*, much smaller number and must never feed `staminaWindowMs`. Any new mutating action must update `lastRespondedAtMs`, and if it is a chamber action, append to `observedLatencyMs`.
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
