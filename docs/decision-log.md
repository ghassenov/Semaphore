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
| Stored data (free) | 5 GB | 1 GB | **5 GB** | 10 GB-month |
| Writes per day (free) | 100k rows | **1,000 keys** | **100k rows** | 1M Class A |
| Reads per day (free) | 5M rows | 100k keys | **5M rows** | 10M Class B |
| Queryable across sessions | No, per-object only | No | **Yes, SQL** | No, list and get |

KV's **1,000 writes per day** is the disqualifier. That is a thousand sessions before the store starts refusing writes, and a benchmark sweep across three backends and twenty seeds is a few hundred sessions in an afternoon. D1 gives 100k row writes per day for the same zero cost.

D1 also happens to be a better fit than R2 ever was. The benchmark wants to ask questions like "every session on seed 7 across all backends" or "completion rate by model on vandalised seeds". Against an object store that is a list-and-fetch loop; against D1 it is one query. We were going to build an index over R2 objects eventually, and D1 is that index with the data already in it.

Option 3 was rejected because a finished session should not need its Durable Object woken to be readable, and replay would then contend with live play. Option 4 was rejected because leaving the platform to recover an API shape we do not actually want is a poor trade, and it adds a second vendor, a second set of credentials and a second failure mode to the deploy story.

**Storage is 5 GB, verified in the account.** D1's pricing page says 5 GB and its limits page says 500 MB for free; the Cloudflare dashboard shows 5 GB, so the limits page is stale. At a few hundred KB per raw session that is roughly 25,000 sessions before compression, and **gzipping the JSONL before insert** takes it past 250,000. `CompressionStream("gzip")` is available in Workers, JSONL compresses about tenfold, and a compressed session is far inside D1's 2 MB per-row cap. The benchmark harness writes to local disk rather than D1 anyway, because a headless run wants files it can grep.

**Result.** No payment method anywhere in the stack. `wrangler.toml` gains a D1 binding and no R2 bucket. The log schema is unchanged, so the property that matters, one artifact in one format serving replay, benchmark and ghosts, survives intact. D-006's reasoning about R2 stands; only its choice of replacement is superseded.

---

### D-009 The possible-worlds proof is scoped to non-exhaustive play, and the scoping is published

**Decision.** The proof asserts clauses (a) and (b) over states reachable **without the agent having exhaustively eliminated alternatives**. States where brute force has already reduced the candidate set to one are excluded from the claim, tested explicitly as a known limit, and named in the write-up.

**Options considered.**
1. Assert both clauses over every reachable unsolved state.
2. Scope the claim to non-exhaustive play, and test the excluded region separately.
3. Redesign Chamber 0 so its search space cannot be exhausted inside the timer.

**Why.** Option 1 is what the test was written to do, and it failed on first run. The failure was correct. In Chamber 0 an agent that pulls two wrong levers has eliminated two of three candidates, and can then deduce the third with no help from PILOT. Clause (a) still holds, because it cannot tell which glyph sits on which remaining lever, but clause (b) fails, because the surviving worlds now agree about what to do.

**Nothing leaked.** No channel carried the answer, and `projectForKeeper` is unchanged. The agent paid for that certainty in wasted calls and time penalties. What the failure exposed is that our headline claim was stated more broadly than it is true: underdetermination is a property of the projection, and exhaustive search defeats it in any chamber whose space is small enough to exhaust.

That is exactly the division of labour doc 02 section 8 already describes. The projection guarantees the agent cannot *deduce* the answer; the search space and the timer are what stop it *enumerating* the answer. Chamber 0 has three candidates and is deliberately trivial and unfailable, because it is a ninety-second tutorial teaching the mechanic. Chambers I, II and III have 1,956, 384 and 26, and the timer makes enumeration hopeless there.

Option 3 was rejected because it would ruin the one chamber whose job is to be easy. A tutorial that punishes experimentation teaches the wrong instinct on the first screen.

**Result.** `tests/possible-worlds.test.ts` scopes the assertion and carries a block named "the limit of the claim, stated rather than hidden" that tests the excluded region on purpose: that the deduction is possible, what it costs, and that clause (a) survives where clause (b) does not. That last one is worth keeping because it demonstrates which clause does the real work.

Doc 03 section 6 and the submission copy must state the scoping. The sentence is: *for every state reachable without exhaustive elimination, the agent's view is consistent with several worlds that disagree about the correct action; where the search space is small enough to exhaust, enumeration is defeated by the timer rather than by the projection.* That is a weaker sentence than the one we had and it is the one we can defend, which in front of this panel is worth more.

---

## 2026-08-28 (continued)

### D-010 Chamber III's latency measures the gap between calls, not a call's own duration

**Decision.** `observedLatencyMs`, the sample Chamber III's adaptive stamina window is derived from, records the wall-clock gap between one mutating action's response and the next request arriving for the same session. It is computed inside the pure reducer from a `lastRespondedAtMs` field carried on `PersistedSession`, not measured by wrapping a call's own execution time.

**Options considered.**
1. Measure the duration of the server's own processing of each call, as sketched in doc 05 section 5 (`Date.now() - t0` around the semaphore's guarded function).
2. Measure the gap between consecutive calls arriving at the Durable Object for one session.
3. Have the client time its own round trip and report it back to the server.

**Why.** Option 1 was half-built before this was caught. `ActionSemaphore.act()` wraps a synchronous reducer call, so the measured duration is server compute time only, on the order of microseconds. Feeding that into `staminaWindowMs` (`6 * median`, clamped to 12 to 35 seconds) means the window always lands on the 12-second floor regardless of which model is playing, which defeats the entire point of an *adaptive* window. The fiction, "the station learns your rhythm," would be a lie: it would learn nothing.

The quantity doc 02 section 3.4 and doc 05 section 6 actually want is agent reasoning cadence: how long does this pair take, end to end, to produce its next action. The Durable Object cannot observe the agent's own reasoning time or network transit directly, since a WebMCP tool's `execute()` is a `fetch()` the client issues and the Worker only sees the request arrive and gets to respond. What the Worker *can* observe is option 2: the time between sending one response and receiving the next request for that session, which conflates reasoning time, client-side work and network transit into one number. That conflation is not a flaw here. It is exactly "how long until the next action lands," which is the number the stamina window needs to be sized against, and doc 05 section 1 already notes that this pair's rate-limiting step is human description time by two orders of magnitude, not server compute.

Option 3 was rejected because it requires the client to be trusted for a value that gates game difficulty, and a tamper-proof server-authoritative measurement is one of the reasons Durable Objects were chosen in the first place (doc 05 section 1, point 2).

**Result.** `PersistedSession.lastRespondedAtMs` is updated on every mutating action. `observedLatencyMs` is appended to only for chamber actions (`pull_lever` and its successors), not for the one-off `begin_shift` and `start` lifecycle calls, matching doc 05 section 6's "across Chambers 0-II" scope. `ActionSemaphore.latencies` still exists and still means something, server-side processing duration, useful for spotting a stuck or unusually slow mutation, but it is a distinct metric from `observedLatencyMs` and must never be substituted for it. The two are documented separately in `latency.ts` and `semaphore.ts` so a future reader cannot conflate them the way this pass almost did.

---

### D-011 `correctAction` must return the whole remaining plan for multi-step chambers

**Decision.** `ChamberWorlds.correctAction` returns the complete sequence of actions still needed to solve the chamber from the given state, encoded as one stable string, not just the single next action. `chambers/signal_room.ts`'s `correctAction` returns the remaining key sequence joined by commas (`"5,1,2,6"`), not the next key alone.

**Options considered.**
1. Return only the next single action, matching what a first reading of "the action that solves the chamber from here" suggests, and what Chamber 0 already does (correctly, since its answer is one lever).
2. Return the whole remaining plan.

**Why.** Running `measure()` against Chamber I's entry state with option 1 in place reported `actions: 6, bits: 2.58`, not the `actions: 1956, bits: 10.93` doc 02 section 3.2 and doc 03 section 6 publish. The reason is structural, not a bug in the arithmetic: a six-key ring has only six possible *first* moves no matter how large the underlying plan space is, so "how many distinct next actions are consistent with KEEPER's view" is capped at 6 regardless of scoping. That is a real and correct quantity, just not the one the published bits table means. The table's intended meaning, stated in doc 01 section 4 tier 2 and doc 03 section 6, is "how much information PILOT must supply for KEEPER to know what to do", which for a multi-step chamber is ambiguity over the *whole plan*, not ambiguity over the first step of it. Chamber 0's answer happens to be exactly one action, so both readings coincide there, which is presumably why the distinction was never surfaced before Chamber I existed.

Making `correctAction` return the full remaining plan fixes this without touching `worlds.ts`: `measure()`, `consistentWorlds`, and the CONCORD-meter machinery are unchanged, because they already treat `correctAction`'s return value as an opaque string to be counted, not interpreted. Verified by re-running `measure()` after the change: entry now reports `worlds: 1956, actions: 1956, bits: 10.9337` exactly, and the value collapses monotonically to 0 as the correct sequence is pressed, mirroring Chamber 0's collapse behaviour and matching what the CONCORD meter (doc 02 section 5) needs for step-by-step convergence.

**Result.** `worlds.ts`'s `ChamberWorlds.correctAction` docstring now states the requirement explicitly, naming Chamber I's first pass as the cautionary example, so Chambers II and III are implemented against the corrected contract rather than repeating the mistake.

---

### D-012 A witness-scoped `candidates()` must filter by history, not force it

**Decision.** `chambers/signal_room.ts`'s `candidates()` includes a witness only if that witness's *own* correct plan is consistent with the keys already accepted (`SHARED.pressedSequence`), rather than copying the observed state's `pressedSequence` onto every witness regardless of whether the witness's own answer would produce it.

**Options considered.**
1. Copy `state.pressedSequence` onto every generated witness verbatim (the first version written).
2. Filter witnesses to those whose own target sequence actually starts with the accepted prefix, and only then copy the (now-consistent) history across.

**Why.** Option 1 makes `consistentWorlds`'s filter trivially pass on the `pressedSequence` field for every witness, because every witness was built to already agree with the observed value rather than being checked against it. That defeats the entire point of the filter: mid-solve narrowing (the ambiguity dropping as correct keys land) would never actually happen, because nothing in the candidate set was ever excluded by play history. The bug did not surface in the entry-state assertions, since at entry the accepted prefix is empty and every witness trivially satisfies it; it was only caught by testing the *collapse* behaviour along the correct-solve path, the same kind of test that validated Chamber 0's narrowing.

Option 2 makes membership genuine: a candidate is a member of `W(s)` only if it is actually compatible with everything KEEPER's SHARED view has recorded, which is what "consistent world" is supposed to mean. Re-verified empirically after the fix: worlds drop from 1,956 at entry to 325, 64, 15, 1 across a four-key solve, monotonically, reaching exactly 0 bits at the solved state.

**Result.** The bug and its fix are documented in the function's own docstring in `signal_room.ts`, and the possible-worlds test suite asserts the collapse property directly (`collapses monotonically to zero as the correct sequence is pressed`) so a regression here fails loudly rather than silently passing an entry-only check.

---

### D-013 Chamber II's world-narrowing signal is registered clicks, derived by replaying the full rotation history

**Decision.** `chambers/blind_panel.ts` gives KEEPER exactly one channel through which the hidden dial-to-gauge wiring can narrow: `lastClicks`, the number of a rotation's commanded clicks that actually registered before the driven gauge (or, via the cross-link, either gauge) would have gone out of its 0-8 bounds. `PersistedSession` carries the full history of rotation commands rather than just the current gauge values, and both real play and `candidates()` derive gauge state and click registration by replaying that whole history from an all-zero start under a given wiring hypothesis.

**Options considered.**
1. Treat gauge values as the narrowing signal and let `candidates()` hold the current gauge values fixed, mirroring the shape of Chamber 0 and the first (buggy) version of Chamber I.
2. Give KEEPER a channel that depends only on the current state, not the history, updated incrementally on each rotation.
3. Derive both gauge values and the registered-click signal by replaying the full commanded-rotation history under each hypothesis, for both real play and the proof.

**Why.** Option 1 does not typecheck against the design at all: `gaugeValues` is `VISUAL`, doc 05 section 3's own field tag, so it structurally cannot reach `projectForKeeper` and cannot be the thing `consistentWorlds` filters on. Some *other* fact had to carry the information doc 02 section 5 promises ("an informative rotation" drops the CONCORD bar), and re-reading doc 02 section 3.3's own "I heard three clicks but nothing moved" line pointed at the answer: the number of clicks that actually register depends on whether the driven gauge is already near a bound, which depends on the hidden wiring and everything that has happened to that gauge so far.

Option 2 fails for the same structural reason D-012 already found in Chamber I: whether a given rotation's clicks register depends on the gauge's value *at that point in the sequence*, which in turn depends on the entire prior sequence of rotations under whichever wiring is being hypothesised. There is no way to check "is this candidate wiring still consistent" from the current instant alone; the check is only meaningful against the full history. Skipping that and updating some running summary incrementally would recreate exactly the D-012 bug: a hypothesis being kept alive because its *current* fields were copied to match the observation, rather than because replaying its own history against that observation would actually produce it.

Option 3 was verified before being written into a test, following the discipline D-009 and D-011 established: a probe script confirmed the entry state reports exactly 384 worlds and 8.585 bits (`log2(384)`), that querying a fresh dial by rotating it 8 clicks from a resting gauge halves the consistent set every time (384 to 192 to 96 to 48 to 24, since a fully-registering versus fully-blocked rotation identifies that dial's inversion bit exactly), that a repeat query on an already-saturated dial registers 0 new clicks and leaves the world count unchanged, and, structurally rather than just empirically, that the consistent set can never grow as history is appended, because matching a longer replayed sequence is never less restrictive than matching its prefix.

**Result.** The cross-link's effect on a *second* gauge is deliberately excluded from what `lastClicks` reports: it changes only that gauge's value, which is `VISUAL`, so it stays a pure-PILOT surprise exactly as doc 02 section 3.3 describes ("nothing announces this"). `wasted` for `rotate_dial` is defined as "this call eliminated no candidates" (`concordBits` unchanged), which is doc 02 section 5's own phrase for this chamber, rather than reusing Chamber 0 or Chamber I's repeat-of-a-failed-guess definitions, since rotation here has no pass/fail outcome to repeat. Drift toward zero (doc 02 section 3.3) is not modelled; it needs a Durable Object alarm that does not exist yet and is tracked in NEXT-STEPS.

---

### D-014 Chamber III's passphrase is uniform random letters, because an English one destroys the finale's asymmetry

**Decision.** `chambers/concord_lock.ts` generates the passphrase as uniform random letters in groups (for example `MAVQ KIAQ`), not as an English phrase. Doc 02 section 3.4's worked example is superseded.

**Options considered.**
1. An English passphrase, as doc 02 section 3.4's own example shows (`"XLI XMHI XYVRW"` deciphering at offset 4 to `THE TIDE TURNS`).
2. A pronounceable but meaningless passphrase, for flavour.
3. Uniform random letters.

**Why.** Option 1 does not work, and the reason is worth stating plainly because it would have shipped: **of the 26 possible decryptions of an English ciphertext, exactly one is English.** Any agent that knows English picks it instantly; so does frequency analysis; so does a human. The cipher wheel PILOT reads becomes decorative, and Chamber III's published figure of 26 consistent worlds and 4.70 bits is really one world and zero bits. That is the finale, the last thing a judge sees, and the chamber whose whole point is that amber and cyan finally meet at one object. Verified directly by enumerating all 26 shifts of the doc's own example before writing any code.

Option 2 fails for a subtler version of the same reason. Caesar shifting does not preserve pronounceability: if the plaintext has vowel-consonant structure and its 25 shifts do not, an agent can still score the candidates and pick the structured one. Any linguistic property that survives in the plaintext but not in the shifts is a channel PILOT is not needed for.

Option 3 removes the attack entirely rather than making it harder. With letters drawn uniformly, every one of the 26 decryptions is equally meaningless, no offset is privileged by any amount of language modelling, and the offset genuinely has to come from PILOT reading the wheel. That restores exactly what doc 02 intended and what the bits table claims.

A consequence worth noting: with a uniform-random passphrase, offset 0 (ciphertext equal to plaintext) becomes indistinguishable from any other offset, because the plaintext is no more meaningful than any shift of it. So the full 0-25 range is used, giving exactly 26 candidates and `log2(26) = 4.70` bits, matching the published figure precisely rather than approximately.

**Result.** Verified empirically before the assertions were written, per the discipline D-009 and D-011 established: entry reports exactly 26 worlds, 26 distinct actions and 4.7004 bits across all twenty canonical seeds. `tests/possible-worlds.test.ts` pins the fix with a block named "the asymmetry is real, not a language puzzle", asserting that the generated passphrase has no English structure, that every candidate produces the identical observed ciphertext, and that the offset never reaches KEEPER while the ciphertext never reaches PILOT. Doc 02 section 3.4's example needs correcting before the submission copy quotes it.

---

### D-015 Chamber III's `wasted` is "not a possible decryption", the sharpest definition in the game

**Decision.** A `speak_passphrase` call is wasted when the phrase is not among the passphrases still consistent with the ciphertext KEEPER holds.

**Options considered.**
1. Wasted when the phrase is simply wrong.
2. Wasted when the phrase is not one of the 26 decryptions of the observed ciphertext, minus those already rejected.

**Why.** Option 1 would mark 25 of 26 legitimate deductions as wasted, which inverts the metric's meaning: doc 07 section 2.2 defines a wasted call as one that *could not have succeeded given what the agent knew*, precisely to separate guessing from reasoning. An agent that correctly narrows to 26 candidates and tries one has reasoned well and may still be wrong; that is not waste, it is the cost of 4.70 bits it does not have.

Option 2 is exactly computable here, and more sharply than in any other chamber: KEEPER holds the ciphertext, so it can enumerate all 26 decryptions itself, and the rejected list is `SHARED`. A phrase outside that set is one the agent had everything it needed to rule out before calling. Chamber 0's and Chamber I's repeat-of-a-failed-guess rules are cruder proxies for the same idea; this chamber admits the real thing.

**Result.** Both directions are tested: a phrase that was never a candidate is wasted, and a wrong-but-possible decryption is not. The same distinction drives world narrowing, so a rejected candidate is eliminated from `candidates()` while an impossible phrase eliminates nothing, and both behaviours are asserted in the proof suite.

---

### D-016 `session_start` moves from `begin_shift` to `start`, where its own fields are actually true

**Decision.** The `session_start` log event is now emitted inside `start()`, not `beginShift()`. Its `mode` field carries the real chosen mode.

**Options considered.**
1. Leave it at `begin_shift`, hardcoding `mode: "full"` (the shipped code before this fix).
2. Leave it at `begin_shift`, with `mode` made optional or nullable until known.
3. Move the event to `start()`, where `seed`, `difficulty`, `mode` and `designation` are all simultaneously final.

**Why.** Found while generating the ghost fixture for D-017: `fixtures/ghosts/ghost-01.jsonl` is a BRIEF-mode session, and its `session_start` event read `"mode":"full"`, silently wrong, because option 1 was already what shipped. `mode` is not chosen until `start()` is called, two actions after `begin_shift`; the event's own type requires it, so it could not have been true at the point it was being emitted, for any session that was not full mode. Nobody had noticed because every test written so far happened to use full mode.

Option 2 was rejected because it weakens the type to paper over a timing problem rather than fixing the timing: every consumer of the log (the replay viewer, the benchmark, the Archive itself) would then have to handle a `session_start` with an unknown mode, for a session where the mode is knowable and simply was not asked for yet.

Option 3 fixes the actual problem: emit the event at the point every one of its fields is genuinely settled, rather than at the point that reads most naturally as "the shift began." `chamber_enter` for the first chamber already fires at `start()`, so this puts both of the session's opening events at the same, correct instant.

**Result.** `beginShift()` emits no event. `start()` emits `session_start` then `chamber_enter`, `seq` 0 and 1. The ghost fixture and its generator were regenerated after the fix; the log now correctly reads `"mode":"brief"`. Two reducer tests updated to assert the new sequencing.

---

### D-017 The Archive beat lives in `apps/worker` for now, not on a separate origin, and says so

**Decision.** `read_station_log` and the ARCHIVE-to-Concord-Lock progression are implemented as ordinary reducer actions inside `apps/worker`, reading a ghost session bundled as a TypeScript module. Doc 03 section 7's design, a static-asset tool served from a genuinely separate `apps/archive` origin, is not yet built.

**Options considered.**
1. Build `apps/archive` now, as a real second Cloudflare Pages project, before implementing the Archive beat at all.
2. Implement the beat's game logic in `apps/worker`, explicitly documented as a temporary placement, and move it once `apps/archive` exists.
3. Skip the Archive beat entirely until `apps/archive` is built.

**Why.** Option 1 is the eventual correct architecture and is not being abandoned; it is sequenced after the WebMCP client layer in NEXT-STEPS because a cross-origin tool provider has nothing to be cross-origin *from* until there is a client embedding it. Building it in isolation now, before `apps/game` exists to embed it, would mean building against a guess rather than a real consumer.

Option 3 was rejected because the gap it was covering for is real and blocking: solving Chamber II already leaves the machine parked in `ARCHIVE` with no way to progress, so full mode dead-ends today regardless of what `apps/archive` eventually looks like. Leaving that broken until a later phase would mean the possible-worlds proof, the reducer, and every full-mode test kept exercising a path that silently could not finish.

Option 2 unblocks full mode now and costs little to move later: the actual data (the ghost log, `fixtures/ghosts/ghost-01.jsonl`) is already in the format and location doc 05 specifies, and the reducer-level logic in `apps/worker/src/archive/index.ts` (filtering to KEEPER-readable entries, formatting one as text) is the same logic a static-asset tool on the archive origin would run, just invoked from a different place. Moving it later is deleting a `read_station_log` reducer action and standing up an equivalent tool registration in `apps/archive`, not a redesign.

Workers have no filesystem, which the first version of this fix did not account for: `fixtures/ghosts/ghost-01.jsonl` cannot be read at request time by `apps/worker`. `apps/worker/scripts/generate-ghost.ts` now emits both the JSONL fixture (the format contract, and what `apps/archive` will eventually serve directly) and a bundled TypeScript module (`apps/worker/src/archive/ghost-01.ts`, marked generated, not to be hand-edited) from one deterministic run, so the two cannot drift apart while both exist.

**Result.** Full mode now completes end to end, verified by tracing all four chambers through the Archive into the Concord Lock. `apps/worker/src/archive/index.ts` and `ghost-01.ts` carry a docstring stating the eventual move explicitly, so nobody mistakes the current placement for the intended one. `PersistedSession.archiveEntriesRead` and the `leave_archive` PILOT action (mirroring `grip_bar`'s pattern: the beat has no puzzle to auto-complete, so a human decides when to move on) are the two pieces of new reducer state this required.
