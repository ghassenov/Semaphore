# Decision Log

Append-only. One row per significant decision. Never rewrite a past entry: add a new one that supersedes it and say so.

Format: date, decision, options considered, why, result.

---

## 2026-08-27

### D-001 Delete the v1-shaped scaffold rather than migrate it

**Decision.** Remove `packages/protocol`, `apps/worker` and `apps/game` in full. Keep `packages/seed`.

**Options considered.**
1. Migrate the existing code in place, editing the channel enum and the error taxonomy.
2. Delete the incompatible modules and rewrite them against the v2 document set.
3. Keep the scaffold and layer v2 alongside it behind a flag.

**Why.** The scaffold was written against document set v1 and its data model is wrong at the root, not at the edges. `Channel` was a four-value enum (`VISUAL | TOOL | SHARED | SERVER_ONLY`) where v2 requires five (`VISUAL | TACTILE | AUDIBLE | SHARED | HIDDEN`); `AUDIBLE` is not a rename, it is a channel both parties perceive differently and it carries puzzle information in Chamber II. The error taxonomy was missing `E_STALE_TOOL` and `E_NO_SESSION` and carried a stale `E_WRONG_CHAMBER`. `Phase` was missing `ENTRY`, `ARCHIVE` and `FINALE`. The action semaphore was correct in concept but had no latency observation, which doc 05 section 6 makes load-bearing for Chamber III's adaptive window. Migrating would have meant touching every line anyway while carrying v1 assumptions forward invisibly. Option 3 violates the no-dead-code rule for no benefit.

`packages/seed` survives untouched because xorshift128+ seeded from the session id is exactly what doc 05 section 9 specifies, it is fully tested, and its output sequence is a contract that future replays and benchmark runs depend on.

**Result.** Repo reduced to `packages/seed` plus root tooling. `pnpm-lock.yaml` regenerated to match the smaller workspace. CI stays green throughout.

---

### D-002 Rules live in `CLAUDE.md`, addressed twice via an `AGENTS.md` symlink

**Decision.** One `CLAUDE.md` per rules-bearing directory, with `AGENTS.md` as a symlink to it in the same directory.

**Options considered.**
1. Two real files per directory, kept in sync by hand or by a hook.
2. A single root file only.
3. One real file plus a symlink.

**Why.** Claude Code reads `CLAUDE.md` and several other agents read `AGENTS.md`. Two real files drift the moment someone edits one, and a drifted rule is worse than no rule. A root-only file forces every agent to load rules for directories it is not working in, which wastes the context budget the workflow rules exist to protect. The symlink gives one source of truth under both names at no maintenance cost.

**Result.** Eight rules directories: root, `docs`, `apps/game`, `apps/worker`, `apps/archive`, `packages`, `tests`, `bench`. Repo-wide rules appear only at the root; subdirectory files carry local law only.

---

### D-003 Directories exist before their code does

**Decision.** `apps/game`, `apps/worker`, `apps/archive`, `tests` and `bench` are created now, holding only their rules files.

**Options considered.**
1. Create each directory when its first source file lands.
2. Create the full structure now with rules in place.

**Why.** The rules that govern a directory are the constraints its code has to be written against, and they are most valuable before the code exists rather than after. Writing down "the client never possesses the solution" while the client is empty costs nothing; discovering it after three chambers of scene code is expensive. This also makes the target structure legible to anyone cloning the repo cold.

**Result.** Structure declared. No placeholder source, no stub modules, no `TODO` files.

---

### D-004 Build the full plan, do not pre-emptively reduce scope

**Decision.** Follow doc 08 phase by phase at full scope. Doc 08's cut order is held in reserve and applied only if something is actually observed to be at risk, not in advance.

**Options considered.**
1. Follow doc 08 phase by phase at full scope.
2. Decide a reduced scope up front and build only that.

**Why.** Seven days remain (2026-08-27 to 2026-09-03, 13:00 PDT) against a nine-phase plan, so this was raised as a scope question. The user's call is that the timeline is not the binding constraint: the team has delivered comparable scope in less time and is running agent-assisted. Option 2 was rejected because doc 08 is already sequenced so that every phase ends demoable, which means the plan degrades gracefully on its own. Deciding cuts in advance would discard work that may well land, and the never-cut list (possible-worlds proof, the `toolchange` sequence with KEEPER's body, the ablation, the starter prompt card, ChatGPT verification, the MIT license, the video) is front-loaded in the phase order regardless.

**Result.** Full scope. Doc 08's ordering guidance governs any cut that becomes necessary, and any such cut gets its own entry here.

---

### D-005 Cloudflare is the deployment target across the whole stack

**Decision.** Host everything on Cloudflare: Pages for the game client, the replay viewer and the archive origin; Workers plus Durable Objects for authoritative state; R2 for session logs.

**Options considered.**
1. Cloudflare end to end (Pages, Workers, Durable Objects, R2).
2. A split host: Vercel or Netlify for the static client, Cloudflare for the stateful backend.
3. A Node service on Render behind any static host.

**Why.** Doc 05 section 1 already selects Workers and Durable Objects for the backend on five independent grounds, and four of them are properties no other option gives cheaply: one single-threaded Durable Object per session is exactly the serialisation point the action semaphore needs, the solution never leaves that boundary, the timer is tamper-proof server time, and the event log falls out for free. Once the backend is committed there, splitting the frontend across a second provider buys nothing and costs a cross-origin hop, a second deploy pipeline, and a second preview-URL story for playtesters. The archive origin in particular is a second Pages project on the same account, which keeps `exposedTo` and the `tools` Permissions Policy delegation testable in one place. Cloudflare is also a challenge sponsor offering credits, which is minor but not nothing.

**Result.** Cloudflare across the board. Recorded in the root `CLAUDE.md` deployment section so it is visible without opening doc 05. Preview deploys on every pull request, including the archive origin, because playtesters need a URL rather than a checkout.

---

### D-006 Drop R2; session logs live in Durable Object SQLite and flush to Workers KV

**Decision.** Remove R2 from the architecture. The event log is written to the `Session` Durable Object's SQLite storage while a session runs, and flushed as one JSONL value to Workers KV when the session ends. Ghost fixtures for the Archive ship as static assets in the Pages bundle.

**Options considered.**
1. R2 as specified in doc 05, and accept linking a payment method.
2. Durable Object SQLite for live logs, Workers KV for finished sessions.
3. Durable Object SQLite only, with replay reading back through the Worker.

**Why.** The user's constraint is that hosting must not require a credit card. Every other Cloudflare product we need clears that bar: Pages, Workers, and Durable Objects on the SQLite backend are all on the free plan with no payment method. R2 does not: activation runs a subscription checkout that requires a linked card even though free-tier usage is not billed. It is the single exception in the stack.

Option 3 was rejected because a finished session should not keep a Durable Object alive to be readable, and replay would then contend with live sessions for the same DO. Option 2 separates the two cleanly: the DO owns a session while it is being played, KV owns it forever after, and `/replay/:id` reads KV without touching a DO at all.

The free-tier headroom is sufficient by a wide margin. DO SQLite gives 5 GB stored and 100k row writes per day; KV gives 1 GB, 1,000 writes and 100,000 reads per day, and a 25 MB ceiling per value against session logs of a few hundred KB. One KV write per completed session means the write limit is a thousand sessions a day. Benchmark runs are the one thing that could exceed it, so the harness writes to local disk rather than KV, which is what a headless run wants anyway.

Nothing architectural is lost. The property doc 05 section 7 actually cares about is that **one artifact in one format** serves as replay source, benchmark corpus and the Archive's ghosts. That is a property of the log schema, not of the storage product behind it.

**Result.** No payment method needed anywhere in the stack. `wrangler.toml` gains a KV namespace binding and drops the R2 bucket binding when the worker is rewritten. Doc 05 sections 2, 7 and 11 mention R2 and are superseded by this entry.

---

### D-007 Correct the spec baseline: `execute` takes two arguments and there is no `requestUserInteraction`

**Decision.** Treat the `execute` callback as `(inputObject, { signal })`. Abandon the contingency plan that depended on `requestUserInteraction`. Wire the provided `AbortSignal` into the action semaphore as a real cancellation path.

**Options considered.**
1. Keep doc 03's single-argument assumption until the browser spike contradicts it.
2. Correct the baseline from the W3C draft IDL now, and let the spike confirm rather than discover.

**Why.** Doc 03 section 1 records "execute receives a single argument; `requestUserInteraction` was removed" as a **DISPUTED** row, and separately treats the single-argument shape as settled. The draft IDL is unambiguous: the callback is `(object inputObject, ToolExecuteCallbackOptions options)` and `options` carries `required AbortSignal signal`. There is no agent handle and no `requestUserInteraction` anywhere in the specification.

Both halves therefore resolve, and in opposite directions from what doc 03 assumed. Doc 02 section 3.4's contingency ("if it exists it goes on `speak_passphrase` and becomes a Leverage exhibit") is dead, and the caution design around the one irreversible action is unchanged: state the consequence in the description, ship `get_lock_state` so a careful agent can verify, enforce no ordering in code, and let the benchmark report which models check first.

The `AbortSignal` is a gain we had not planned for. A tool execution can be cancelled mid-flight by the agent or the user, which is a real lifecycle event our action semaphore should honour rather than ignore, and observing cancellations is one more honest thing to report.

Correcting now rather than waiting costs nothing and prevents a wrong assumption propagating into tool signatures written before the spike runs. The spike still runs, and its job is to confirm the browser agrees with the text.

**Result.** Doc 03 section 1's table is superseded on those two rows. Recorded in [lessons-learned.md](lessons-learned.md) with the process lesson: a confidence label applied from memory is not evidence, and nothing enters an architecture document without a link to spec text or an observed result.

---

## 2026-08-28

### D-008 D1 replaces R2 as the session store, superseding the KV half of D-006

**Decision.** Finished sessions are written to **Cloudflare D1**, one row per session, with the JSONL event log gzipped into a TEXT column. The `Session` Durable Object's SQLite storage still holds a session while it is being played. Workers KV is dropped from the design. Ghost fixtures ship as static assets in the Pages bundle.

**Options considered.**
1. Workers KV, as chosen in D-006.
2. Cloudflare D1.
3. Durable Object SQLite only, with replay reading back through a Worker that wakes the session's DO.
4. Object storage off Cloudflare (Supabase Storage, Backblaze B2) to keep an R2-shaped API.

**Why.** D-006 reached for KV because it was the first card-free store that fit. Checking the numbers properly, it was the wrong one:

| | DO SQLite | Workers KV | **D1** | R2 |
|---|---|---|---|---|
| Payment method required | No | No | **No** | **Yes** |
| Stored data (free) | 5 GB | 1 GB | **500 MB** | 10 GB-month |
| Writes per day (free) | 100k rows | **1,000 keys** | **100k rows** | 1M Class A |
| Reads per day (free) | 5M rows | 100k keys | **5M rows** | 10M Class B |
| Queryable across sessions | No, per-object only | No | **Yes, SQL** | No, list and get |

KV's **1,000 writes per day** is the disqualifier. That is a thousand sessions before the store starts refusing writes, and a benchmark sweep across three backends and twenty seeds is a few hundred sessions in an afternoon. D1 gives 100k row writes per day for the same zero cost.

D1 also happens to be a better fit than R2 ever was. The benchmark wants to ask questions like "every session on seed 7 across all backends" or "completion rate by model on vandalised seeds". Against an object store that is a list-and-fetch loop; against D1 it is one query. We were going to build an index over R2 objects eventually, and D1 is that index with the data already in it.

Option 3 was rejected because a finished session should not need its Durable Object woken to be readable, and replay would then contend with live play. Option 4 was rejected because leaving the platform to recover an API shape we do not actually want is a poor trade, and it adds a second vendor, a second set of credentials and a second failure mode to the deploy story.

**The one real constraint is 500 MB.** Note a documentation discrepancy: D1's pricing page lists 5 GB stored data while its limits page lists "10 GB (Workers Paid) / 500 MB (Free)". We size against the smaller number. At a few hundred KB per raw session that would be roughly 2,500 sessions, which is already enough, and **gzipping the JSONL before insert** takes it to roughly 25,000. `CompressionStream("gzip")` is available in Workers, JSONL compresses about tenfold, and a compressed session is far inside D1's 2 MB per-row cap. The benchmark harness writes to local disk rather than D1 anyway, because a headless run wants files it can grep.

**Result.** No payment method anywhere in the stack. `wrangler.toml` gains a D1 binding and no R2 bucket. The log schema is unchanged, so the property that matters, one artifact in one format serving replay, benchmark and ghosts, survives intact. D-006's reasoning about R2 stands; only its choice of replacement is superseded.
