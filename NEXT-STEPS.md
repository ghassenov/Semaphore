# NEXT STEPS

**The handoff file.** Whoever stops working updates this before they stop. Whoever starts working reads this first and nothing else.

It answers three questions and only three: where the repo is right now, what to pick up next, and what will bite you if nobody warns you. It is not a changelog ([docs/decision-log.md](docs/decision-log.md) is), not a journal ([docs/lessons-learned.md](docs/lessons-learned.md) is), and not a plan ([docs/design/08-implementation-plan.md](docs/design/08-implementation-plan.md) is).

---

## Status

| | |
|---|---|
| **Last updated** | 2026-08-28, Ahmed Saad |
| **Branch** | `main`, clean, pushed |
| **Pipeline** | Green: 86 tests, typecheck, lint, format, build |
| **Verify with** | `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` |

### What exists

| Path | State |
|---|---|
| `docs/design/` | Numbered set 00-12, complete. |
| `docs/` | Decision log at D-009, lessons journal live, both beside the set. |
| `packages/seed` | Done. xorshift128+, unbiased `int()`, Fisher-Yates `shuffle()`. |
| `packages/protocol` | Done. Five-channel model, `projectFacts`, error taxonomy, session vocabulary, JSONL log schema. |
| `apps/worker/src/chambers/glyphs.ts` | Done. Twelve glyphs, stroke counts, plain-name corpus, designed confusables. |
| `apps/worker/src/chambers/airlock.ts` | Done. Chamber 0: generation, state, facts, world enumeration. |
| `apps/worker/src/projection.ts` | Done. `projectForPilot` / `projectForKeeper`, canonicalisation, `viewHash`. |
| `apps/worker/src/worlds.ts` | Done. `consistentWorlds`, `measure`, `concordBits`, `isUnderdetermined`. |
| `tests/possible-worlds.test.ts` | **Done and passing.** The headline proof. |
| `apps/spike/` | Built, **never run**. Needs a WebMCP browser. |
| `apps/worker/src/{index,Session,machine,log}.ts` | Not written. |
| `apps/game/`, `apps/archive/`, `bench/` | Rules files only, no code. |

---

## Do this next

In order. Each item ends somewhere the pipeline is green and the repo is committable.

### 1. Run the spike [needs a human with a browser]

The only task here nobody can automate, and it gates real architecture.

```bash
python3 -m http.server 8787 --directory apps/spike   # game origin
python3 -m http.server 8788 --directory apps/spike   # archive origin
```

Open `http://localhost:8787/?archive=http://localhost:8788` in Chrome 149+ with `chrome://flags/#enable-webmcp-testing`, or the ChatGPT desktop in-app browser on GPT-5.6 Sol or Terra (Luna has site tools disabled). Press **Copy report**, paste into [docs/design/11-spec-notes.md](docs/design/11-spec-notes.md) under section 2 onward, and fill section 1 with the date and browser version.

**The row that matters is `toolchange.empty`.** If `toolchange` does not fire when the registry drains to zero, the game's ending does not exist and Chamber III's finale needs redesigning. Check that one first.

Second most important: `crossorigin.delegation`. If it fails in the ChatGPT browser, set `ARCHIVE_ORIGIN=same` and `apps/archive` becomes a module rather than a deployment.

### 2. The `Session` Durable Object

`apps/worker/src/Session.ts`, plus `machine.ts`, `log.ts` and `index.ts`. Everything it needs already exists.

- Action semaphore with **latency observation** on every call. It is not the v1 one, which had no timing; Chamber III's stamina window is derived from the median (doc 05 section 6) and must never be hardcoded.
- State machine over the `Phase` union already in `@semaphore/protocol`.
- Server-authoritative timer. `timerFor(chamber, difficulty)` is written and tested.
- Append-only event log using the `SessionEvent` union. Write `keeperViewHash` from `projectedHash(facts, "KEEPER")`, which is already implemented and is what makes the wasted-call metric computable later.
- Flush to D1 on session end, gzipped. **Do not add an R2 binding** (D-006, D-008).

### 3. Chamber I, the Signal Room

The chamber that carries the submission, because the vandalised page is the trust puzzle. Follow the `airlock.ts` shape exactly: `generate` / `initial` / `facts` / `candidates` / `correctAction`, then add it to the proof's chamber list and confirm the published figure of 1,956 worlds and 10.93 bits falls out of `measure()` rather than being typed in by hand.

The vandalism flag is seeded so the benchmark can measure both conditions on matched puzzles. `manualPageState` is `VISUAL` (PILOT sees the handwriting); `vandalismText` is `TACTILE` (KEEPER reads it). That split is the whole puzzle.

### 4. The WebMCP client layer

`apps/game/src/webmcp/adapter.ts` first, then `director.ts` with the three-tier `AbortController` lifecycle, then `begin_shift`. The briefing text is written word for word in doc 04 section 3.

---

## Things that will bite you

- **`execute` takes two arguments**, `(inputObject, { signal })`, and `requestUserInteraction` does not exist. Doc 03 section 1 says otherwise and is wrong; D-007 corrects it. Wire that `AbortSignal` into the semaphore as a real cancellation path.
- **No Cloudflare product that needs a card.** R2 is out. D1 plus DO SQLite is the store. Before adopting anything new, check its *activation* path, not its pricing page.
- **`PERCEIVED_BY` must never be forked.** One definition, three consumers: the projections, the proof, the smoke test. Forking it lets the proof pass while the game leaks.
- **The proof is scoped, deliberately** (D-009). It asserts over states reachable *without* exhaustive elimination, because an agent that brute-forces every alternative can deduce the answer legitimately. Do not widen the scope to make a new chamber pass. If a chamber fails the proof, the chamber is wrong.
- **Never weaken an asymmetry check to go green.** It is the one class of change that is never accepted.
- **The numbered docs live in `docs/design/` now**, not `docs/`. Working documents (decision log, journal) stay beside it. Links were retargeted and validated; if you add one, check it resolves.
- **`tests/` is a workspace package** (`@semaphore/tests`), and `apps/worker` exports `./*` from source, so import `@semaphore/worker/chambers/airlock`, not a relative path.
- **`pnpm-workspace.yaml` needs `allowBuilds`** for `esbuild` and `workerd`, or wrangler's install fails non-interactively. Do not strip it again.
- `wrangler.toml` has a placeholder `database_id`. Run `npx wrangler d1 create semaphore-sessions` and paste the real one before any deploy. Login is `npx wrangler login`.

---

## Waiting on

| Item | Owner | Note |
|---|---|---|
| Spike results | Human with a WebMCP browser | Blocks nothing yet, gates the archive design and the finale |
| Playtesters | Human | Doc 08 section 0.1 wants six people. The only task that does not parallelise. |
| Repo made public | Human | Before the deadline, not now. Deliberate. |
| Netlify credits | Done | Form submitted 2026-08-28. |

---

## How to leave this file

Before you stop working, rewrite **Status**, **Do this next** and **Waiting on** so they describe the repo as it is, not as you found it. Add to **Things that will bite you** only what genuinely cost you time. Keep the whole file under roughly 120 lines: a handoff nobody reads because it is long is worse than no handoff.
