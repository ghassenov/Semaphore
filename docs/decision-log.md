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

---

### D-018 The chamber timer is a stored deadline settled on read, with the alarm as a second caller

**Decision.** `PersistedSession.chamberDeadlineMs` holds the server clock at which the current chamber deadlocks. `reduce()` calls `settleSession(session, nowMs)` before every action; that pure function is the entire timer. The Durable Object alarm calls the same function, and does nothing else. Time penalties are subtracted from the deadline rather than modelled as a `PENALISED` phase, and Chamber II's gauge drift is interleaved into the existing history replay rather than ticked.

**Options considered.**
1. A Durable Object alarm as the primary mechanism: the alarm fires, mutates the session, and the request path trusts what it finds.
2. A stored deadline compared against the clock wherever the session is read, with no alarm at all.
3. Option 2 as the mechanism, plus an alarm whose only job is to run the same settle when no call arrives.

**Why.** Option 1 makes the timer untestable without a workerd runtime and puts the rule in a place no pure test can reach, which is the opposite of how the rest of `apps/worker` is built: `concord_lock.ts` already derives the finale's grip window and its 30-second lockout from timestamps passed into the pure reducer, and that is why the whole finale is testable with no Durable Object at all. It also makes the alarm load-bearing for correctness, so a missed or delayed alarm would hand the pair free time.

Option 2 is correct and tamper-proof on its own: the deadline is server-set, server-stored and server-compared, and a client that stops calling gains nothing, because the expiry is found on its next call. What it cannot do is stamp the `failure` event at the moment time actually ran out. That timestamp is read by the replay timeline and by the benchmark's completion-rate metric, so it has to be true rather than merely eventual.

Option 3 keeps the rule in one pure function and adds the alarm purely as a second caller of it. If the alarm never fires, the game is still correct and only the stamp is late; if it fires early, `settleSession` returns no events and it is a no-op. There is no second implementation of the rule to drift.

**Penalties as subtraction, not a phase.** Doc 02 section 8's wording is that a wrong action "costs 15-30 seconds against a timer", and doc 02 sections 3.1 and 3.2 give the amounts: 20 seconds for a wrong lever, 15 for a wrong key, 30 when the third wrong key in a row makes it a RACE CONDITION. Chamber III's only per-action cost is the LOCKOUT seal, which `concord_lock.ts` already models. Subtracting from the deadline is the literal reading, keeps the timer a pure function of stored timestamps, and produces one `state_delta` log line a replay can redraw the timer from. The `PENALISED` phase in `machine.ts` is deliberately left unused by the reducer: a phase entered and left inside a single `reduce()` call would be theatre, and doc 06 section 4 describes the penalty as a two-frame visual beat, not a lockout.

**Drift is derived, never ticked.** Chamber II's gauges fall toward zero at one mark per twenty seconds (doc 02 section 3.3). Every rotation now records the instant it was commanded and the state records the instant it was last settled to, so `replay()` interleaves the drift due between them. Drift totals are counted from `enteredAtMs` each time rather than from the previous event, because a per-gap `Math.floor` would discard a remainder at every rotation and lose whole marks over a six-minute chamber. Because drift is uniform across all four gauges and depends only on elapsed time, it is identical under all 384 candidate wirings and cannot narrow the world set by itself; two new tests in `tests/possible-worlds.test.ts` assert that rather than assuming it.

**The failure card quotes actions, not worlds.** Doc 06 section 5's draft copy reads "Time ran out with 4 worlds still consistent." Printing the world count beside the bits figure would print two numbers that disagree, because `bits` is `log2(actions)` by deliberate design (`worlds.ts`: worlds that agree on what to do next are ambiguity that costs the pair nothing). Chamber 0 is the clearest case: six consistent worlds, three courses of action, 1.58 bits. The card reads back the count the bits are actually computed from.

**Result.** `DEADLOCK` and `RETRY` are reachable in play for the first time. A deadlocked session answers every action except `retry_chamber` with the failure card rather than a thrown error, because the settle that produced the deadlock has state and a log line to persist and a throw would discard both. `retry_chamber` is a PILOT action for the same reason `grip_bar` is: an agent that cannot see the chamber cannot decide to restart it. The first retry preserves the seed and the second re-randomises (doc 02 section 7), with `preservesSeed` as the single definition of which is which. 273 tests pass, up from 238.

---

### D-019 The read-only tools are pure functions, outside the semaphore and outside the log

**Decision.** `describe_chamber`, `inspect`, `read_ciphertext`, `get_lock_state` and `read_manual` are served by pure functions in `apps/worker/src/views.ts` and `manual.ts`, reached over `GET`. They do not take the action semaphore, they append no `tool_call` event, and they write no storage.

**Options considered.**
1. Route every tool through `reduce()` and the semaphore, so there is one path for everything.
2. Reads as pure projections, served outside both, with mutation keeping the existing path.
3. Option 2, but still appending a `tool_call` event so the benchmark sees reads.

**Why.** Option 1 has an active cost, not just an overhead. The semaphore exists to serialise mutation (doc 05 section 5), and a look cannot conflict with anything, so making one block behind a turning dial would return `E_BUSY` for a call that was always safe. That teaches an agent to stop calling `get_status` under time pressure, which is exactly when doc 04's briefing tells it to call `get_status`. It would also make every read a storage write.

Option 3 is the one worth revisiting. Doc 02 wants "did the agent read the manual before acting" to be measurable, and today it is not: the log records `read_station_log` (a mutating action, because it tracks which entries have been read) and nothing else that KEEPER looked at. The cost of adding it is a storage write and a `seq` bump on every read, for a benchmark that does not exist until Phase 7.3. Deferred deliberately, not overlooked, and recorded here and in NEXT-STEPS so the benchmark's author finds the decision rather than the gap.

Gathering the read projections in one module is what makes the design law checkable by reading one file: everything in `views.ts` derives from `projectForKeeper`, appends nothing, and changes nothing. `describe_chamber` moved there out of `reducer.ts` and now answers every phase with a next action instead of throwing, because an agent that has lost the thread needs somewhere to go, which is the same rule `E_STALE_TOOL`'s message follows.

**Result.** `views.ts`, `manual.ts` and 21 tests, whose leak assertions are the point: the possible-worlds proof establishes that the channel *tags* are right, and these establish that the prose built on top of them did not reach around the tags with a template string. `open_the_door` also landed in this change: `FINALE` was reachable and had no exit, so `session_end` was never written and the registry could never drain to empty.

---

### D-020 The station manual ships inside `apps/worker` for now, next to the ghost log

**Decision.** The manual's seven sections live in `apps/worker/src/manual.ts` and are read over a session-scoped `GET`. Doc 03 section 7 puts `read_manual` on the cross-origin archive origin, and it will move there, exactly as D-017 planned for `read_station_log`.

**Options considered.**
1. Build `apps/archive` now, so `read_manual` lands in its final home first time.
2. Ship the manual in the worker, move it with `read_station_log` when `apps/archive` is built.
3. Register `read_manual` against nothing and fill it in later.

**Why.** Option 3 is not available: Chamber 0 cannot be solved without the manual naming the spiral, and the briefing's last line tells the agent to start with `read_manual('index')`. A registered tool that returns nothing would be a stub, and the briefing would be pointing at a lie.

Option 1 is the correct end state and is blocked on something real. `apps/archive` needs the client to exist to embed it, and cross-origin delegation is still unverified because the Phase 0.3 spike has not been run in a browser, so `ARCHIVE_ORIGIN` would have to ship as `same` regardless. Building the origin before either is settled means building it twice.

One part of the manual will not move cleanly, and it is better to know that now. The Signal Room's page is vandalised on roughly half of seeds (doc 02 section 3.2), the flag is drawn from the session seed, and `apps/archive` holds no storage binding by its own rules. So the archive origin will serve static section text and fetch the session-scoped annotation from this worker. That is recorded here so it is a known shape rather than a surprise during the move.

**Result.** `manual.ts`, sharing `chamberSeed` with the reducer's generator so the vandalised page reads identically before the room is entered and inside it. That equality is asserted rather than assumed: a page that changed between reads would read as a rendering fault instead of as something a previous keeper did, and the whole trust mechanic depends on PILOT being able to confirm what KEEPER just read.

---

### D-021 The registry follows the server's machine state, carried on every response

**Decision.** Every worker response carries a small machine-state summary (phase, chamber, designation, remaining time). `SessionClient` announces it to watchers at the one place every response passes through, and `ToolDirector.applyState` is the only thing that decides which controller tier is mounted.

**Options considered.**
1. The client tracks what it did and infers the tier: after `pull_lever` succeeds, mount the Signal Room.
2. The director polls `/status` after every tool call.
3. The server's state rides on every response and the client follows it.

**Why.** Option 1 is the parallel-guess anti-pattern doc 03 section 4.2 rejects for the manifest panel, applied one layer lower and with worse consequences: the panel would be honest about a registry that was itself wrong. The client cannot infer the tier anyway, because chambers auto-advance inside a single `reduce()` call and the Archive beat sits between two of them.

Option 2 is correct and doubles the request count, and it still misses things: PILOT grips the release bar, resets a deadlocked chamber and leaves the Archive without any tool call existing, so a poll hung off tool calls would lag every one of those.

Option 3 costs four fields on a response the client was already receiving and covers both parties, because PILOT's actions go through the same client. Nothing about it weakens the asymmetry: phase and chamber are `SHARED` by construction (both parties always know which room they are in) and no chamber fact reaches the summary. Rendering still derives exclusively from `projectForPilot`, over a socket that is a separate channel and a later phase.

**Result.** No polling anywhere in the client, and `applyState` is idempotent by tier, so it is safe to call after every response and only a genuine tier change fires a `toolchange`. `applyState` serialises through a promise chain, because two responses landing together could otherwise register a tier twice.

---

### D-022 Tool character budgets are enforced by a test over the tool objects, not by a lint rule

**Decision.** `apps/game/src/webmcp/budgets.test.ts` asserts Chrome's published budgets (30 characters per name, 500 per description, 150 per parameter description) against every tool the director will register, together with the schema and annotation invariants.

**Options considered.**
1. A custom ESLint rule, as doc 03 section 10 and `apps/game/CLAUDE.md` both say.
2. A test that imports the tool factories and checks the objects.

**Why.** Option 2 is a stronger check for less machinery. A lint rule reads source text, so it can only see a description written as one literal; the tools here are built by factories and several descriptions are assembled from concatenated strings, which a rule would either miss or have to constant-fold. The test reads the objects the registry will actually receive, which is the thing the budget is about.

It also covers what a lint rule could not reach at all: that exactly the mutating tools carry `readOnlyHint: false`, that exactly the two genuinely adversarial channels carry `untrustedContentHint`, that every schema is closed with every property described, and that no tool name, title or description contains an interpolation hole. That last one is the tool-poisoning vector the spec names first, and it is worth an assertion rather than a convention.

**Result.** 20 assertions over 12 tools, in CI with everything else. `apps/game/CLAUDE.md`'s line about lint is updated to point here.

---

### D-023 The session id is generated by the client and doubles as the seed

**Decision.** `sessionIdFrom()` returns `?seed=` when present and a `crypto.randomUUID()` otherwise. The worker creates the Durable Object record on first contact, as it already did.

**Options considered.**
1. A `POST /session` route that mints an id server-side, as doc 03 section 10's phrase "an opaque server-generated ID" reads.
2. The client generates it, and `?seed=` overrides.

**Why.** The property doc 03 section 10 is actually claiming is that a session carries no personal data, and a v4 UUID satisfies that exactly as well as a server-minted string: no accounts, no email, no profile, nothing derived from the person. That is what makes post-submission ARCHIVE mode safe, and it is untouched.

What option 1 costs is a round trip before the front door and a route outside the `/session/:id` pattern the router is built on. What it does not buy is control over the seed, because doc 05 section 9 already requires `?seed=` to reproduce a session exactly, and that is how a bug is reproduced, a demo is rehearsed, and two models are compared on the same four chambers. An id the client cannot choose would have to be overridable anyway.

**Result.** No new route. Doc 03 section 10's wording is the one thing to correct before submission: the guarantee is zero PII, not server-minted ids, and the copy should say what is true.

---

### D-024 The spike has been run: `execute` takes one argument, and the ending needs the notepad form removed

**Decision.** Doc 11 is filled from a real Chrome 151 run (2026-08-28). Three findings change what we believed. `execute` receives **one** argument and no `AbortSignal`, reversing D-007. A **declaratively** registered tool does not leave the registry on abort, only when its form leaves the DOM, which the empty-registry ending depends on. Cross-origin delegation **works**, so `apps/archive` is viable, though `ARCHIVE_ORIGIN` stays `same` until ChatGPT's in-app browser is tested too.

**How it was run.** `apps/spike` served on two ports, Chrome 151 headless with `--enable-features=WebMCPTesting` and a throwaway profile, the report read out of the DOM over the DevTools Protocol. The spike's own checks answered most of it. Two questions its `mc.executeTool` path could not answer honestly - what an *agent* invocation looks like from inside `execute` - were settled by invoking through the CDP `WebMCP` domain (`WebMCP.invokeTool`), which is the closest available stand-in for a host. Both paths agreed on the argument count.

**Finding 1: `execute(input)`, one argument.** D-007 corrected doc 03 off the IDL, which specifies `(object inputObject, ToolExecuteCallbackOptions options)` with a required `AbortSignal`. Chrome 151 does not implement the second parameter. Doc 03's original text, which D-007 overturned, was right about the shape and wrong about the reason.

The input shape resolved a second discrepancy in our favour. Doc 11 section 0 flagged that the IDL says object and our captured hackathon reference says JSON string; both are true of different callers. A host invocation delivers a **plain object**, and the page-side `executeTool` helper requires a **JSON string**. The game's tools are only ever host-invoked, so `apps/game` reading `input.designation` off an object is correct as written. The benchmark harness, when it drives tools directly, will have to serialise.

**Options considered for the now-dead cancellation path.**
1. Delete it: the `ExecuteContext` type, the `signal` parameter threaded through `GameTool.run` into `fetch`, the director's `cancelled` outcome, and `ToolCancelEvent` in `packages/protocol`.
2. Keep it, typed optional, documented as unimplemented.

Option 2, on three grounds. The signal is in the IDL, so this is a gap in one implementation rather than a settled answer about the standard. ChatGPT's in-app browser is a required target and has not been tested; deleting on one browser's evidence and restoring on another's is churn. And the cost is genuinely one optional parameter and one `instanceof`: nothing is executed, nothing is slower, and no caller is complicated by it. What was **not** acceptable was leaving the claim standing: `adapter.ts`, `director.ts`, `sessionClient.ts`, the fake registry, the cancellation test and NEXT-STEPS all said or implied the signal was live, and all now say what is true.

`fake-registry.ts` was itself wrong and is fixed. It passed a second argument unconditionally, which would have let a tool reading `context.signal` look supported. It now passes one argument unless a caller explicitly asks for a signal, which is what the browser does.

**Finding 2: the declarative tool and the empty registry.** This is the one that changes a design. The spike's `toolchange.empty` row came back `[info]` rather than `[pass]`: the event fired, but `getTools()` still held one tool, the form-registered `spike_write_note`. Aborting a signal does not remove a declarative tool, because its lifetime is the element's. A follow-up probe confirmed the rest: removing the `<form>` from the DOM removed the tool, fired a second `toolchange`, and left `getTools()` returning **zero**.

So the ending is real and reachable, and it now has a precondition. `ToolDirector.endSession()` aborts controllers, which is sufficient today only because the notepad does not exist yet. When Phase 1.4 lands `write_note` as a form, that method must remove the form from the document as well, or the game's final beat ends on a registry holding one tool. The requirement is recorded in `endSession`'s own docstring, in doc 11, and in NEXT-STEPS, because it is the kind of thing that is invisible until the demo.

**Finding 3: cross-origin works.** Two tools registered from a second origin with `exposedTo` pinned to the parent, embedded with `allow="tools"`, were visible to the parent via `getTools({ fromOrigins })` and absent from a default `getTools()`. This clears the largest architectural risk hanging over `apps/archive` (R9). It also tells the manifest panel something: the default view is not the whole registry, so a panel that wants to show the archive's tools has to ask for them by origin rather than assume.

**Result.** Doc 11 sections 1, 2, 3, 4, 5, 8, 9 and 10 filled; doc 03's spec baseline table updated, with two rows moving from Medium and DISPUTED to Verified. What remains empty in doc 11 is exactly what a browser cannot answer: whether a model discovers a one-tool page, whether `untrustedContentHint` changes its behaviour, its latency distribution, and `SubmitEvent.agentInvoked`, which needs a real agent submission rather than a synthetic one. Those need a model and, for the second browser, ChatGPT.

---

### D-025 PILOT's view is pushed whole, over a hibernatable socket, gated on phase

**Date.** 2026-08-28

**Decision.** `/session/:id/socket` on the `Session` Durable Object pushes a complete `PilotView` on connect and after anything that settles state. It is accepted through the WebSocket hibernation API. The view is built by `apps/worker/src/pilot.ts`, the mirror of `views.ts`, and it carries chamber facts only in the phases where PILOT is actually standing in the room.

**Options considered, on the payload.**
1. Deltas, as doc 05 section 1 words it.
2. Whole views.

Whole views. The view is four machine fields and at most nine projected facts, so a delta saves nothing worth measuring. What a delta would cost is a version handshake: a client that reconnects, or that drops one frame, has to be told how to catch up, and until it is told it is not stale but wrong. Pushing the whole view makes a reconnect self-healing, which matters because the hibernation API means the Durable Object is *expected* to be evicted mid-session.

**Options considered, on accepting the socket.**
1. `server.accept()` plus a `Set` of live connections in the instance.
2. `state.acceptWebSocket(server)` and `state.getWebSockets()`.

Option 2. Hibernation is the reason: a session sits idle while two people talk, and an evicted Durable Object with an in-memory `Set` comes back having silently dropped every viewer. It is also less code, because the runtime owns the set and prunes closed sockets itself, so there is no `onclose` bookkeeping to get wrong.

**No inbound handler, deliberately.** There is no `webSocketMessage` on the server and nothing is ever sent from the client. Every action goes through HTTP and the action semaphore; a socket that accepted commands would be a second route into the state machine that does not serialise against the first.

**The phase gate is a real finding.** `machine.chamber` stays set through `ARCHIVE`, `TRANSITIONING` and `DEADLOCK` so the machine knows which room was last entered. A first pass keyed the facts on that field alone, and the Archive beat therefore rendered the solved Blind Panel behind the ghost monitor. Facts now require `IN_CHAMBER`, `PENALISED` or `DEADLOCK`; `DEADLOCK` is included because PILOT has to see the chamber to decide to reset it, which is a thing only PILOT can do.

**Result.** 31 new tests, 396 total. `pilot.test.ts` checks each chamber against its own `facts()` rather than a hand-written field list, so a field added later is covered on the day it is added. Verified against a real workerd as well as the fakes: the upgrade lands, the greeting arrives, an action pushes a frame unasked, and no `TACTILE` or `HIDDEN` field appears on the wire. What the unit tests cannot cover is the `101` response itself, because Node's `Response` rejects that status and workerd requires it; the live run is what covers it.

**Not done here.** The CONCORD meter reads `concordBits`, which for the Blind Panel enumerates 384 candidates and replays the rotation history under each. That is too much to run on every push, so it stays out of `PilotView` until the HUD needs it and can ask for it on its own terms.

---

### D-026 Phaser is fetched on demand, not bundled

**Date.** 2026-08-28

**Decision.** `apps/game` depends on Phaser 4.2.1, and imports it through a dynamic `import()` inside `render/station.ts` rather than statically. A build-time script, `apps/game/scripts/check-bundle.mjs`, fails `pnpm build` if the eager entry chunk exceeds 400KB gzipped.

**The measurement, first.** Plan section 0.4 said measure before writing four chambers of scene code against the API, and that turned out to be the whole decision. Phaser 4.2.1 with four bare imports and no scene code is **365KB gzipped** against doc 07's 400KB budget: 91% of the budget spent before a single rectangle is drawn. The rest of the client was 7.3KB at the time.

**Options considered.**
1. Bundle it eagerly, as one chunk.
2. Bundle it eagerly and raise the budget.
3. Load it on demand, when a session actually begins.
4. Drop Phaser and render with the Canvas 2D API directly.

Option 3. Option 1 leaves 28KB for four chambers, a HUD and the two `toolchange` renderings, which is not a budget so much as a countdown. Option 2 gives up the only number that would have told us the client had got heavy. Option 4 is genuinely tempting - the greybox is flat rectangles and 8px text, which Canvas 2D does in a fraction of the code - but it contradicts docs 05, 06 and 10, and gives up scene lifecycle, tweens and asset loading that later phases assume.

What makes option 3 more than a trick is that it is *correct* independently of the budget: a browser without WebMCP gets the gate screen and never reaches a canvas at all. Downloading a game engine in order to tell somebody they cannot play is 365KB spent on nothing, and for some judges that screen is the entire submission.

**Result.** The eager entry is **10.3KB gzipped**, 2.6% of budget. Phaser lands in a 358KB chunk fetched when `startStation` runs, alongside a 2.2KB chunk holding the scenes. Verified in Chrome 151 against a live `wrangler dev`: the canvas comes up at 320x180, the registry moves from `begin_shift` through the airlock's tier to the Signal Room's, and the console is clean.

The budget script exists because this arrangement is one careless top-level `import Phaser from "phaser"` away from being undone, and nothing about the resulting page would look wrong.

---

### D-027 The CONCORD meter gets a route, not a field on the frame

**Date.** 2026-08-28

**Decision.** `GET /session/:id/concord` answers `{ chamber, bits, worlds, actions }`, computed on demand from the same `measure()` the possible-worlds proof uses. The HUD polls it every 2.5 seconds. It is not on `PilotView` and not on `/status`.

**Why not the socket.** D-025 left this open with the reason: `concordBits` enumerates every world consistent with what KEEPER knows and replays the rotation history under each. For the Blind Panel that is 384 candidates. Running it inside every socket push would put that work behind every lever pull, every timer tick and every gauge drift, on the path that has to stay cheap enough to be pushed unasked.

**Why not `/status`.** `get_status` is the agent's re-orientation call, designed to stay cheap under a long session because a confused agent needs to be able to afford it. Hanging a 384-world enumeration off it would make the one tool an agent reaches for under pressure the most expensive one on the surface.

**Options considered.**
1. A route of its own, polled.
2. On `PilotView`, pushed.
3. Computed client-side from a rotation history sent over the socket.

Option 1. Option 3 was rejected outright: it puts a solution-adjacent derivation in the browser, which this app's rules forbid, and the enumeration needs the chamber parameters that are `HIDDEN` by construction.

**Two things the route inherits rather than reinvents.** It is gated by `pilot.inTheRoom`, exported for this and shared with the frame, so the meter cannot report a room the pair has already left - `machine.chamber` outlives the room. And it takes no semaphore permit, appends no event and writes no storage, following D-019: a meter that could return `E_BUSY` would punish the pair for looking at it.

**The scale is per-room, deliberately.** `meterFill` normalises against the largest reading seen in the current chamber rather than a fixed maximum. The Airlock opens at log2(3) = 1.58 bits and the Signal Room at 10.93; on a fixed scale the Airlock would read as permanently near-empty and teach the player nothing. The label stays REMAINING AMBIGUITY, because the server cannot hear the pair talk and the meter therefore does not move when PILOT merely explains something (doc 02 section 5).

**Result.** Verified live: 1.58 bits and 3 courses of action on entering the Airlock, dropping to 1.00 bits and 2 after a wrong lever eliminates a world, and 10.93 bits on arrival in the Signal Room.

---

### D-028 The notepad is declarative, and the ending needs two mechanisms

**Date.** 2026-08-28

**Decision.** `write_note` is a real `<form>` carrying `toolname`, created and owned by `ToolDirector`. `read_note` is imperative and rides the session tier. Notes live in the Durable Object's session state and ride every pushed frame. `endSession()` and `#enterFinale()` both remove the form element as well as aborting controllers.

**The rule the pair of them demonstrates**, which is doc 03 section 8's and is the project's own contribution rather than something the spec says:

> Declarative for a tool that is a form the human can also submit, where agent and human do the same thing through the same affordance. Imperative for a tool that is pure agent capability, where the agent does something the human structurally cannot.

`write_note` is on the first side: PILOT types into the textarea and presses the button, KEEPER invokes the tool and the host submits the same form, and `SubmitEvent.agentInvoked` is the only thing that tells them apart. `read_note` is on the second, and that is the rule being applied rather than an inconsistency: reading the pad is not a submission. PILOT reads it by looking at the wall, which is not an affordance an agent can share.

**Where the state lives.** Server-side, which was not obvious. Three reasons that are the same reason: the pad is the only in-game record of what the pair actually said to each other, which makes it the most valuable thing the session log carries for the benchmark; the replay viewer needs it or the pad reads empty on playback; and a client-side pad is lost on a reload, which happens to a pair fifteen minutes into a session.

**Two things it deliberately does not do.** It does not update `lastRespondedAtMs`, so notes never enter the gap sample Chamber III's stamina window derives from (D-010): a note is the pair talking rather than the agent acting, and folding notes in would deflate the median every time they communicated well. And the server does not verify the author, because it cannot: the client asserts it from `agentInvoked`. The pad is a shared scratchpad rather than a puzzle surface, so the worst a forged author buys is a line in the wrong colour, and an unrecognised value is attributed to PILOT because a human hand is the safer default to show.

**The ending, which is the part that mattered.** D-024 found that aborting a signal does not remove a declaratively registered tool: its lifetime is its element's. `endSession()` aborted three controllers and nothing else, so the moment the notepad existed the game's last beat would have landed on a registry holding exactly one tool - the worse failure, because it looks almost right. The director now owns the element and removes it, and the two halves are both load-bearing: without the abort the registry keeps eleven tools, without the removal it keeps one.

`fake-registry.ts` now models this, unioning imperative tools with every `form[toolname]` in the document and firing `toolchange` on a `MutationObserver`, so the claim is a CI test rather than a docstring. That needed a DOM, so `happy-dom` joins the dev dependencies for the one test file that uses it.

**Result.** Verified live in Chrome 151 across a full session: `getTools()` returns zero after `open_the_door` and no form remains in the document. A staleness bug surfaced on the way and is fixed here too: the view socket now drives `applyState`, because a chamber deadlocked by the Durable Object's alarm produces a pushed frame and no response at all, and without it the registry keeps `press_key` on a room that cannot answer.

---

### D-029 The art is authored as pixels in source, and the glyphs are load-bearing

**Date.** 2026-08-28

**Decision.** Sprites are arrays of strings in `apps/game/src/render/sprites.ts`, one character per pixel, mapped to the locked palette and turned into textures at boot with `putImageData`. No asset files, no loader, no third-party art.

**Options considered.**
1. Source a free pixel-art pack and adapt it.
2. Author PNGs and load them through Phaser's loader.
3. Author the pixels in TypeScript.

Option 3, on three grounds. **The palette cannot drift**: a character maps to a `PALETTE` key, so a fifteenth colour cannot arrive through an image editor without passing this log first, and an imported PNG can hold any colour it likes with nothing to notice. **It costs nothing**: no requests, no atlas, a few kilobytes of source against a budget Phaser has already spent 358KB of. **The provenance is clean**: the submission is MIT-licensed and every pixel was authored in one file, so there is no third-party licence to track, attribute, or get wrong.

**The glyphs are not decoration.** This is the part worth recording. The greybox drew each glyph as its *name* - a lever captioned "spiral" - and that quietly deleted the Airlock and most of the Signal Room, because reading a label aloud is not describing a shape. The whole chamber is PILOT getting a shape across a gap to a partner holding a table of names. So the twelve glyphs are drawn, the name appears nowhere on PILOT's side, and the pieces carry the lever's *position* and the key's *number* instead, which is what KEEPER can actually be told to act on.

`wave` and `knot` are deliberately alike at a glance, honouring `confusableWith` in the chamber's glyph table: a good agent asks a clarifying question there and a bad one guesses, and the benchmark measures the difference. `sprites.test.ts` asserts they overlap substantially without being the same drawing, so the pair cannot drift apart and quietly make the chamber easier.

**Result.** 503 tests. The bodies are 16x24, which reads as a person rather than a mascot (doc 06 section 3); PILOT is bone rather than amber, because the human is not a fact only the human can perceive and painting them in the channel colour would make the legend lie.

---

### D-030 The greybox playtest, run as a scripted full session

**Date.** 2026-08-28

**What was done.** A driver plays a complete session against the live client in Chrome 151: KEEPER acts only through registered tools, PILOT reads only the pushed view feed, and the Blind Panel's wiring is discovered by experiment rather than read from the parameters. It finishes in about seventeen seconds and screenshots every beat.

This is the solvability proof as well as the playtest. If it cannot finish, the chambers are not solvable from the information the two parties actually hold, which is a claim the possible-worlds proof does not make: that one shows each chamber is *underdetermined* for KEEPER alone, not that a pair can get out.

**What it found.**

The last frame of the game read **"NO ROOM HERE"**. Accurate, and it reads as a rendering fault at exactly the moment the game should be landing. Every roomless phase now says what is happening; `ESCAPED` says "THE DOOR IS OPEN".

The Blind Panel announced **"1 CLICKS REGISTERED"**. The count is puzzle-critical in that room - it is how KEEPER learns a linkage hit its bound - so the line carrying it should not read like a placeholder.

The CONCORD meter showed **the previous room's ambiguity** for the couple of seconds after a chamber change, because the route is polled. 1.58 bits in the Signal Room is not a stale number, it is a wrong one; a reading whose `chamber` does not match the current room is now discarded rather than drawn.

Three layout collisions, all one cause and all invisible to the tests that existed: a caption is centred under its piece and is routinely wider than it, so the caption is what collides with the next piece, runs past the grate, or falls out of the room band. The tests now measure caption extents.

**What it cannot do.** It cannot tell us whether the game is *fun*, whether the glyph vocabulary survives a cold player's description, or whether the Signal Room's vandalised page actually fools anybody. Doc 08 section 0.1 wants six human playtesters and still does. What this buys is that they will not spend their session finding "1 CLICKS".

---

### D-031 The station is drawn as a cutaway section, at 320x320

**Date.** 2026-08-28

**Decision.** The native canvas becomes **320x320** and the client draws the whole station as a section: every floor stacked, the floor the pair is standing in at working size, the rest as silhouette strips, and KEEPER's machine deck as a column down the right of all of them. **This amends doc 06 section 3**, which locked 320x180.

**What was wrong with one room at a time.** Three things, and a section fixes all three. The station never read as a *building*, so "which room are we in" was a caption rather than a place. The phases between chambers had nothing to draw and said so, which meant the Archive - a designed beat - and the finale both rendered as two lines of text. And progress was invisible: a pair four rooms in saw exactly what a pair one room in saw.

**The floors are deliberately unequal.** The Signal Room needs six glyph keys in two rows with captions, which is about seventy pixels. Five equal floors on a 320-tall canvas give it forty-six. So the active floor takes whatever the strips leave, and the strips are twenty-six each. That is not a flourish to save space: it is the only arrangement in which the tallest chamber fits at all, and it happens to put the eye exactly where the game wants it.

**Room layouts became floor-local.** `roomLayout` now takes the band's height and emits coordinates from its top-left. The same four chambers therefore draw at working size in one frame and inside a strip in the next, and no chamber knows where it sits in the building. That is a better shape than the absolute constants it replaced regardless of the section, because it is what makes the layout tests measure a room rather than a canvas.

**The palette is untouched, and that was the important call.** The reference that prompted this is warm: salmon walls, orange floors, purple lower storey. Adopting those hues would kill the amber channel, because amber reads as "only PILOT perceives this" only against a cold neutral ground. Colour is this game's information architecture (doc 06 section 2), so the composition and the flat-shape technique are taken and the fourteen locked colours are not. Rust and brass already carry warmth where it is safe.

**Prop density is held back for the same reason.** The reference is beautiful because it is full of things. Here every visible object is either a channel-coded fact or noise that makes the facts harder to find, and finding them is the whole task. Silhouettes on inactive floors carry a shape and nothing readable, which is enough to say "a room, and not the one you are in".

**Options considered.**
1. Keep 320x180 and one room, take only the flat-shape treatment and a border.
2. Square 256x256, still one room, drawn floor to ceiling.
3. The section.

Option 3. Option 1 is much the cheapest and leaves the station illegible as a place; option 2 buys the framing without the progress display or the fix for the empty transitions.

**Cost.** Every chamber relaid out, a new HUD budget, a new pure module (`cutaway.ts`) with its own tests, and this amendment. `PilotView` gained `mode`, because BRIEF drops Chamber II and a station drawn with a floor nobody will enter is a station promising a room that does not exist.

**Result.** 518 tests. Verified by a full scripted session in Chrome 151: all four chambers, the Archive, the finale, and a registry that ends empty. Integer scaling holds at x2 = 640 and x3 = 960; the stage's CSS max-width is pinned to 640 because the scale manager snaps to whole multiples of 320 and a box one pixel narrower falls back to x1.

---

### D-032 Every POST drains its body before answering

**Date.** 2026-08-28

**Decision.** `Session.fetch` reads the request body once, at the top of the POST branch, and hands the parsed object to every route.

**The bug.** Several actions take no parameters - `grip_bar`, `release_bar`, `leave_archive`, `retry_chamber`, `reset_sequence`, `open_the_door` - and answered without ever reading the body. The client posts `{}` to all of them regardless. A response sent while the request stream is still open is a real fault: workerd raises `Can't read from request stream after response has been sent`, and in local development that takes down wrangler's proxy and with it the whole dev session.

**How it was found, which is the part worth recording.** Not by a test. The scripted playthrough started killing the dev worker every run, once it was exercising PILOT's own actions end to end. Every unit test in `reducer.test.ts` calls `reduce()` directly and never builds a `Request` with a body, and `Session.test.ts` builds requests only for the routes that already read one. The whole class of defect was invisible to the suite and obvious the moment a real client talked to a real runtime.

**Result.** Six near-identical parse lines removed and no route able to forget. `readBody` never throws: every route already defaults every field it reads, so a malformed body produces the game's own validation message rather than a 500.

---

### D-033 The archive origin is a delegation surface, not a second copy of the manual

**Decision.** `apps/archive` exists and registers `read_manual` and
`read_station_log` from its own origin, exposed back to the game. It holds no
content of its own: both tools are fulfilled by fetching this session's routes
on the worker. Tool lifetime stays with the game's `ToolDirector` and reaches
the frame over `postMessage`. `ARCHIVE_ORIGIN` is expressed as
`VITE_ARCHIVE_ORIGIN`, unset meaning `same`, and it stays unset.

**Options considered.**
1. Ship the six static manual sections inside `apps/archive` and fetch only the
   session-scoped vandalised page from the worker, as D-020 anticipated.
2. Register both tools on the archive origin and fulfil both by fetching the
   worker, so the origin holds no content at all.
3. Serve the archive page from the game's own origin in the fallback, so there
   is one code path instead of two.

**Why.** Option 2, and the deciding argument is that one of the two tools was
never going to be static. `read_station_log` mutates the session:
`archiveEntriesRead` is what `leave_archive` checks, and doc 02 section 4's
"required to progress, cannot be skipped" is that check. A static asset cannot
record that it was read. So the archive origin has to call the worker for at
least one of its tools whatever else is decided, and option 1 buys a shared
manual package, a second worker route and two content paths in exchange for
moving six paragraphs of text across the boundary.

The claim doc 03 section 7 makes is about *registration*, not about bytes. What
is rare in the spec is that a tool is registered by a different document on a
different origin and composed into this page at runtime through the `tools`
Permissions Policy and `exposedTo`. That is exactly what happens here, and
where the frame gets its text from is an implementation detail of the frame.
The fiction survives intact: the manual is still not part of the control
system, and it is still reached over a link.

Option 3 was rejected because the fallback's entire purpose is to survive
delegation not working. A fallback that also depends on a frame registering
tools into a parent registry is not a fallback.

`apps/archive/CLAUDE.md` said "manual sections are static content shipped with
the page". That rule is amended rather than quietly broken, and the rule it
was really protecting - this origin never gets a storage binding - is
unchanged and now enforced by the fact that it has nothing to store.

**Two things this cost that were not obvious.** A default `getTools()` does not
include a frame's tools even with both gates satisfied, so the manifest plate
had to start asking with `fromOrigins`; a plate that under-reports is worse
than no plate, because the plate exists to prove the registry is not a lie.
And the frame reports what it registered back to the parent, because whether a
cross-origin registration fires `toolchange` on the parent is a row doc 11
section 4 could not fill.

**Result.** `tests/cross-origin-delegation.ts` plays a full session in Chrome
151 twice, once through the archive origin and once through the fallback,
seventeen checks each, both green. `read_manual` returns the station's own
manual across two origin boundaries and a CORS preflight; `read_station_log`
called through the frame records itself, so the Archive's door opens; and the
registry still drains to one tool at the finale and to nothing at the end,
counting both origins together. The flag stays `same`: Chrome passes and
ChatGPT's in-app browser is still untested, and `apps/archive/CLAUDE.md`
requires both.

---

### D-034 Third-party art, licensed separately, replacing the authored pixels

**Date.** 2026-08-29

**Decision.** The room's art is LorisC's *[FREE] 16x16 Top Down Puzzle System*, vendored under `apps/game/public/art/` and described by one table in `src/render/atlas.ts`. This supersedes D-029's "no asset files, no third-party art" for everything except the twelve glyphs and the two bodies, which stay authored in `sprites.ts`.

**Options considered.**
1. Keep authoring pixels in source and hand-draw a fuller set.
2. Take the pack, tint one neutral copy to the palette at draw time.
3. Take the pack and use its own colour variants, one per channel.

Option 3. The pack ships every object in six colours, and Semaphore's information architecture *is* colour: amber is what only PILOT perceives, cyan is what only KEEPER perceives, bone is what both do. Yellow, blue and neutral map onto those three exactly, so the channel is chosen when a file is named rather than applied by a `setTint` somebody can forget. Option 2 was rejected because a flat multiply over one greyscale copy throws away the shading the artist put in and reads visibly cheaper than the colour versions sitting unused beside it.

**Two things this cost that were not obvious.**

The pack has **no neutral-coloured devices**. Levers, buttons, lamps and doors exist only in the five accent colours; the neutral colour covers the building. A `SHARED` fact may wear neither player's colour, so `shared/`'s devices are the purple ones with the hue removed - converted to luminance and rescaled so each sprite's brightest pixel lands on the palette's bone. That keeps the artist's shading and changes only the thing the game is not free to leave in. The pack permits modification; it does not permit redistribution.

Which is the second cost. **The repository is MIT and this art is not.** MIT grants redistribution and the pack's terms withhold it, so a reader who assumed one licence covered the whole tree would be wrong about the half that is not ours to grant. `LICENSE` now says so, and `apps/game/public/art/CREDITS.md` records what was taken, what was modified, and what was deliberately left out: the `.aseprite` source, the labelled documentation sheets, and three of the six colours. What ships is the subset this game draws with, inside the game, the way any game ships its art.

**What D-029 got right and keeps.** The glyphs are load-bearing and stay in source: they are the shapes PILOT has to describe, they are held to the palette by a test, and `wave` and `knot` are deliberately confusable in a way no pack could know. The bodies stay too, redrawn from above, because the pack has no characters and because PILOT must not be amber and KEEPER must not have eyes.

**Result.** 47 sheets, 17KB total, verified against the atlas on every build by `scripts/check-art.mjs`: a frame count that disagrees with the file does not throw at runtime, it hands out a frame that is half of two tiles and renders looking merely a bit wrong.

---

### D-035 The station is one room from above, not a section from the side

**Date.** 2026-08-29

**Decision.** `render/rooms.ts` and the side-on cutaway are replaced by `render/room.ts`: one chamber, drawn from above on the art pack's tile grid, with the whole 320x320 canvas to itself. This supersedes the drawing half of D-031. The resolution and the integer-scaling rule are untouched.

**Options considered.**
1. Keep the section and reskin only the props that read face-on.
2. Draw the active room top-down and keep the other floors as silhouette strips.
3. One room, top-down, and move progress off the canvas.

Option 3. Option 1 was the small diff and the wrong one: a top-down tileset drawn into a side elevation looks borrowed, and the tell is unmissable once a figure drawn from the side is standing on a floor drawn from above. Option 2 kept a compromise nobody was asking for.

**The section's real job was never drawing.** D-031 built it to answer three questions - which rooms this session has, which one we are in, which ones we have got out of - and those are progress, not geometry. They moved to the console as a floor list (`render/floors.ts`, which is the old `cutaway.ts` with its pixels removed and its tested logic intact). That is what freed the canvas.

**What the extra room bought.** The Signal Room's six keys had twenty-four pixels each in a 106-pixel band; they are now full 16px buttons in two rows of three, each wearing its glyph on a plate above it. The Blind Panel's gauges stopped being bars and became columns of lamps, which is the one place this rewrite changed what a chamber *is* rather than how it is drawn: the puzzle is read aloud one number at a time, and a column of lit lamps is countable across a room in a way a bar's height is not.

**Three bugs worth recording, all found by looking rather than by testing.** A door spread evenly across four tiles has a pillar in the middle of it, so doors are contiguous and there is now a test saying so. A caption is centred under its tile and is routinely wider than it, so `STRIKES` on a lamp one tile from the wall went through the wall; captions are clamped to the room, measured from the text object rather than estimated. And the decorative floor plates had to come out: in a game whose whole task is finding the channel-coded object, a floor pattern near the mechanism is one more rectangle for the eye to check.

**Result.** 197 tests. All four chambers played and looked at in Chrome against a live worker.

---

### D-036 The heads-up display leaves the canvas for a DOM console

**Date.** 2026-08-29

**Decision.** The clock, the floor list, the CONCORD meter, the audible strip, the activity log, the notepad, the manifest plate and the legend are DOM, laid out as a three-bay station console around the canvas. The canvas draws the room and nothing else.

**Why.** They were six panels packed into the seventy pixels above and below the section, at an estimated 4.8 pixels per character, with a test asserting the bands did not overlap. That test existed because the arrangement was one pixel from illegible. In the DOM the browser measures its own text, the panels are selectable and reachable by a screen reader, and the room gets the canvas back - which is most of what made the redesign possible at all.

**The rule this had to clear.** Puzzle-critical visuals render to canvas, never to DOM, because a text node holding a glyph is a text node an agent with page access can scrape. Every panel was checked individually against it and each passes for one of three reasons: **public copy** (the prompt, the legend, the room's name, the clock, which floors this session has), **KEEPER's own** (the manifest is the registry it can enumerate for itself; a log line is a call it just made, arguments already stripped), or **`SHARED`/`AUDIBLE` by construction** (the notepad, and the sound both parties perceive). Everything `VISUAL` stayed on the canvas: the glyphs, the needle values, the cipher offset, the state of the manual page. `ui.ts` carries that audit in its header, because the next person to move a panel needs to know the test it has to pass.

**A styling bug worth the paragraph.** Phaser sizes its canvas from the parent's *border* box, so a nine-sliced frame on the element it mounts into is a frame it cannot see: it scales to the full outer width, overflows the frame, and lands on a fractional 2.1x. Fractional scaling is the half-pixel shimmer D-031 exists to prevent, and it arrived here looking like a styling choice. The frame and the mount point are two elements now, and the stylesheet says why.

**Result.** Entry chunk 15.6KB gzipped against a 400KB budget. The console and the room paint from the same model, on a callback rather than a poll, so the readouts beside the canvas and the room on it cannot disagree about a frame.


---

### D-037 A room is a shape resolved from its neighbours, and its walls carry its channel

**Date.** 2026-08-29

**Decision.** Every floor and wall tile is chosen from the tiles around it rather than from its own position. `atlas.ts` gains two derived tables, `FLOOR_BY_EDGE` and the wall table behind `wallFrame`; `room.ts` gains `tilesFor`, which turns a chamber's box and the pieces cut out of it into resolved tiles; `scenes.ts`'s `paintFloor` and `paintWalls` collapse into one `paintTiles` that does not know what shape it is drawing. Each chamber declares an outline and an accent channel, and devices animate between frames.

**Options considered.**
1. Fix the floor tiling and leave the rooms as rectangles.
2. One room per canvas, with a real outline, a channel-coloured wall, and the pack's animations.
3. The whole station as one connected floor plan, every chamber and corridor visible at once.

Option 2. Option 3 is what the reference image actually shows, and it is the option D-035 already rejected under a different name: five rooms on a 320x320 canvas puts each chamber back to roughly 8x6 tiles, which is the band problem the top-down rewrite was done to escape. It only becomes possible if the canvas grows past the resolution D-031 pinned, and that is a bigger decision than a restyle.

**The bug underneath the restyle.** `GROUND_FILL` picked between frames 24, 25, 33, 34 and 42 per tile, documented as five interior frames "that differ by where their rivets sit". They are not rivet variants. They are one coherent bolted-floor set whose bolts are drawn to meet at *shared* tile corners, so choosing between them per tile broke every bolt into a stray fragment and stippled every floor in the game. The five were never wrong to vendor; they were wrong to shuffle.

**The tables are derived, not picked by eye.** Every frame of `shared/ground.png` was classified by sampling its own pixels for which of its four sides carries the pack's dark inset shading. That yields a complete sixteen-entry table with no duplicates, one frame per combination of edges, which is also the proof that the sheet holds exactly the cases a room built from rectangles can need. A frame index that is wrong by one is invisible in review and obvious on a screen, which is the reason not to guess.

**The constraint the art imposes on the shapes.** `walls-out` is a nine-slice of *convex* corners; the pack ships no concave wall corner in any colour. So a notch cut into the middle of an edge has to turn the wall inward and back out using two convex corners butted together, which draws the border twice and reads as a crack in the building. Six candidate outlines were rendered and looked at before this was understood. **A notch may only be cut from a corner of the box**, and `room.test.ts` both asserts the rule over every chamber and demonstrates the doubled border a mid-edge notch produces, so the next person gets the reason rather than the rule.

Two rows are load-bearing and are never cut: the bottom row, which is the floor PILOT walks across, and whichever row holds the door. Because the bottom row is spoken for, every notch is a top corner, and the four chambers are told apart by how wide and how deep their vestibule is rather than by where it is.

**The walls carry the channel.** The pack ships its walls in all six colours and three were already vendored and loading unused. A room whose puzzle is only PILOT's to read is walled in amber, a room only KEEPER can act in is walled in cyan, and a room both parties work in is bone. This is the existing colour law applied to the building instead of to a device: it costs no art, it cannot disagree with the devices inside it, and it is the first thing on screen in a chamber.

**Animation is a stepper, not a played animation.** A device walks its shown frame one step per 1/12s toward the frame the server says it is on. Phaser's animations were the native option and are the wrong one here: a played animation is a fixed sequence that has to be cancelled when the state changes underneath it, and a door caught halfway by a second update would either finish opening a door the server has shut or stall on a frame nobody chose. A stepper cannot disagree with the server - it is always walking toward the truth, and the worst case is arriving a frame late. A device seen for the first time is drawn at its real frame, so entering a room with a lever already thrown shows a thrown lever rather than one that throws itself on arrival.

**The check.** `room.test.ts` proves that every device, every caption row and every floor plate in all four chambers stands on floor, that the bottom row is whole, that the outline closes with no gap, and that no wall tile is stranded away from the room. The device test caught a real regression while the shapes were being cut: the Signal Room's top strike lamp ended up inside its own chamfer.

**Result.** 207 tests. Entry chunk 16.3KB gzipped against a 400KB budget; the art check still passes at 47 sheets.

---

### D-038 The station is one building, and the camera is what makes a room a room

**Date.** 2026-08-29

**Decision.** All five floors and the corridors between them are drawn as one connected floor plan in station coordinates. A Phaser camera frames the room the pair is standing in at 1x, and pulls back to half zoom to show the whole building. `render/plan.ts` is new and owns the building; `render/room.ts` keeps owning what is inside a room and still knows nothing about where that room is.

**Options considered.**
1. Grow the canvas so the whole plan is visible at 1x, always.
2. Build the whole plan and put a camera on it.
3. Draw the whole plan on the existing 320x320 canvas.

Option 2. Option 3 is the reference image taken literally and it is the option D-035 already rejected under another name: five rooms on a 320x320 canvas puts each chamber at roughly 8x6 tiles, which is the band problem the top-down rewrite was done to escape. Option 1 keeps the rooms full size and costs the 320x320 pin D-031 made and the console layout around it; at the resulting 1x the 8px captions are genuinely hard to read. The camera keeps both: the mechanism is exactly the size it was, and the building exists.

**The whole station is autotiled in one pass, and that is not an optimisation.** A corridor meeting a room is a junction. Resolved as two separate passes, each pass draws a wall the other one wanted open. Resolved together, the wall simply ends in a corner on each side of the opening, which is what a doorway is. So `tilesForCells` takes a set of cells rather than a rectangle, and `tilesFor` became a thin wrapper on it.

**A wall carries the channel of the room it borders**, which is why a wall tile has a channel of its own rather than the room having one: in the station a single wall run has an amber room on one side and a corridor on the other, and the tile is the only thing that knows which side it is on.

**The mistake worth recording.** The camera's wide shot was first keyed on the `TRANSITIONING` phase, which is exactly the moment it should fire and is a phase that never reaches a client. The worker settles it inside the same `reduce()` call that solved the chamber (doc 05 section 4, `settleTransition`), so it is a machine state and not a frame. Driving a live session found it; nothing else would have, because the code is correct and the beat simply never happens. `interlude()` has a `TRANSITIONING` case that has been dead for the same reason since D-035.

What replaced it is better than what was intended. The pair's room *changing* is the same event and it is one the client can see, so the camera holds the building for 1.6 seconds whenever the floor changes: the walk between chambers is a walk across a floor plan instead of a caption. And **holding M pulls back to the building at any time.** That is on the human's side of the split on purpose, and it is the thesis in one keystroke: PILOT can step back and look at the station, and there is no tool that lets KEEPER do the same. It is not a leak, because the building's shape is the same for every seed and a room the pair has not reached is an empty shell.

**What the tests carry.** Every number in `STATION_LAYOUT` was worked out by hand across five room sizes and four corridors, and hand arithmetic over that many coordinates is wrong about once per attempt. `plan.test.ts` floods the floor to prove each mode's station is one connected space and that every floor is reachable on foot from the Airlock, checks that no room or corridor overlaps another (against the rooms' full boxes, so a corridor into a chamfered corner is caught), that every device and caption still lands on floor once its room has been moved into the building, and that both buildings fit what the wide shot can show. A corridor off by one row still renders: it draws as a stub beside a sealed room, and the only way to notice by looking is to play far enough to be trapped.

**Half zoom rather than a fitted fraction.** The canvas is scaled to a whole multiple of 320 (D-031), so at the usual 2x a half puts exactly one source pixel on one device pixel. The layouts are authored to fit inside that rather than the zoom being fitted to the layouts, because a fractional zoom is the half-pixel shimmer D-031 exists to prevent.

**Known and left.** The Airlock's and the Concord Lock's doors are drawn in their rooms' north walls, which in the building faces the space outside rather than a corridor. It is not a regression - the single-room view has always drawn the door against the void - and it is only visible in the wide shot. Aligning corridors to doors means redesigning a layout whose connectivity is now proved, so it is a deliberate cosmetic debt rather than an oversight.

**Result.** 600 tests. Entry chunk 16.7KB gzipped against a 400KB budget. Driven in Chrome 151 against a live worker: the Airlock and the Signal Room framed and lit, the floor plan on M, and the walk between the two chambers.

---

### D-039 The Archive's monitor is PILOT's half of the ghost, and it is a schematic

**Date.** 2026-08-29

**Decision.** The Archive beat gets its half of the split: a room with a monitor in it, playing a prior session's log as PILOT would have perceived it. `pilotTrack` on the server is the mirror of `keeperEntries`; `PilotView` carries the resulting `GhostTrack` in the `ARCHIVE` phase and null everywhere else; `render/ghost.ts` decides what is on the screen at an instant and `scenes.ts` paints it. The recording is a flat schematic, not a shrunken room.

**Options considered.**
1. Fetch the ghost JSONL in the client and filter it there.
2. Project it on the server, beside the tool that reads the other half, and put it on the view.
3. Serve it from the archive origin, next to `read_station_log`.

Option 2. Option 1 is the client reaching around `projectForPilot` for a fact it wants to render, which is the one thing the design law forbids however convenient it looks, and it would put the ghost's tool calls in the page. Option 3 is where `read_station_log` lives and is the wrong place for this: the archive origin is KEEPER's surface, and PILOT's half arriving over the same socket every other rendered fact arrives on is what makes the two halves obviously symmetric.

**The exclusion is the mechanic.** `keeperEntries` keeps `tool_call` and drops everything else; `pilotTrack` drops `tool_call` and keeps what a body in the room produced. A monitor that showed the ghost's calls would hand PILOT KEEPER's half and leave nothing to reconstruct. `archive.test.ts` asserts it in both directions over the real fixture: no tool name, no argument value and no view hash appears anywhere in PILOT's half, and no `pilot_action` target appears in KEEPER's. `pilot.test.ts` asserts the same wall again over the wire, because the projection can be right while the view reaches past it.

`state_delta` is dropped too, and less obviously. Those events carry raw `WorldState` paths, which include `HIDDEN` fields like the Blind Panel's mapping. They are the replay viewer's business, behind a projection, and have no business on a screen PILOT reads directly.

**The walk is interpolated, and that is stated where it happens.** PILOT's position is client-local and was never logged, so the log knows the ghost gripped the release bar and not the path they took to it. Every position between two beats is `ghost.ts`'s invention. It is an honest one only because the beats themselves are real, and the module says so at the top rather than in a commit message.

**A schematic rather than a shrunken room.** Doc 08 asked for the replay renderer at 1:4. The pack's sprites are 16px tiles and can only be shrunk by a fractional scale, which is exactly the half-pixel shimmer D-031 exists to forbid, arriving on a smaller surface. A flat outline in two palette colours has no such constraint, is what a decade-old station monitor would actually show, and costs no art. The scale is computed from the tube and floored to whole pixels, so it cannot shimmer however the rooms are resized later; with the chambers as they are it lands at two pixels a tile, nearer 1:8 than 1:4, and the comment says so rather than repeating the doc.

**No `ArchiveScene`.** Doc 08 named one. Two scenes exist because the chambers differ in what they contain rather than in how they are drawn, and the Archive differs the same way: a room with furniture in it, drawn by the code that draws rooms with furniture in them. A third scene would buy a transition, and doc 07 section 6 names listener accumulation across transitions as this project's likely frame-time problem.

**Three things the frame found that no test could.** The tour was run against a live worker and looked at, and it was worth doing:
- The Archive's threshold plate was drawn *through* the monitor. Pooled tile images and the graphics object share a depth, so draw order decides, and it is decided by which pooled object was created first. The fix is that the Archive has no floor plate at all, which is also the right answer under this app's own rule: decoration that competes is not decoration.
- The designation and the caption both overflowed a six-tile tube. The tube is eight tiles wide now and the door above it lost its caption, which claimed back the row the schematic needed. `doorway` takes an optional label for that: a room with one exit and one monitor does not need the exit labelled.
- The first tour's frames were captured mid-camera-move, so three of them are the previous room with the next room's name over it. The camera holds the building for 1.6s on the walk and then pans for 0.7s, and the tour's default wait is the sum of the two.

**The tour is bolted to the browser proof, not to a file of its own.** Getting to the Archive means solving the Blind Panel, and the solvers that do it were already in `cross-origin-delegation.ts`. `SHOTS=<dir>` writes a screenshot at every beat and is a no-op without it, so the assertion run is unchanged and costs nothing.

**One ghost, deliberately.** Doc 08 section 2.3 wants two authored sessions. `fixtures/ghosts/CLAUDE.md` scopes the submission to one and doc 08's own cut order allows it, and a second ghost is content rather than mechanism: nothing here is built around there being exactly one. Left as future work rather than filled with a variation of the first.

**Result.** 621 tests. Entry chunk 16.8KB gzipped against a 400KB budget. Driven in Chrome 151 against a live worker: 17/17 browser checks green, and the Archive looked at three times across the recording - the ghost walking into the Signal Room, gripping the release bar, and the tape running out.

---

### D-040 The ablation's solo condition is a possible-worlds ceiling, not a sampled model

**Date.** 2026-08-29

**Decision.** `bench/` is built as doc 08 phase 7.1 asks: agent alone, human alone, together, over twenty fixed seeds, with the raw log, the three-bar chart and the report all generated by one command. The agent-alone condition contains no language model. It plays a uniform draw from `consistentWorlds(chamber, state)`, redrawn at every step.

**Options considered.**
1. Drive a real model through the tool surface over HTTP and report what it scored.
2. Play the session in process through `reduce()`, with the solo condition as an ideal Bayesian guesser over the consistent world set.
3. Hand-script a solo agent per chamber and report that.

Option 2. Option 1 is what the panel will assume we did, and it is the weakest of the three: any number it produces is a fact about one model on one day, and the obvious answer to a low bar is "a better model clears it". Option 3 is worse still, because the scripted agent's ceiling is whatever we happened to think of. The consistent world set is the honest bound: the worlds in it are by construction indistinguishable from inside `projectForKeeper`, so any rule for preferring one over another is a rule keyed on information the agent does not have. No agent beats a uniform draw over that set, and this one also never forgets, never misreads a description, and never repeats a call it has already learned from. The gap the chart reports is therefore a lower bound on the real gap.

It also makes `bench/` the third consumer of `worlds.ts`, which is the arrangement that module's own docstring names, over one implementation. The proof, the CONCORD meter and the benchmark now genuinely cannot disagree about what "underdetermined" means.

**Zero tokens, and that is a claim about this measurement only.** `bench/CLAUDE.md` requires token spend be budgeted before a run. This run has none, because there is no model in it. The per-model numbers that rule was written for belong to the Cooperative Benchmark (doc 08 phase 7.3), which measures partner-sensitivity across backends and is a different instrument.

**Two findings the harness produced that were not the point of building it.**

*Chamber II is unplayable at a slow agent rhythm, and the cliff is sharp.* Every gauge falls one mark toward zero every twenty seconds and the win condition is all four needles on target at the same instant, so a rotation plan spanning more than one drift interval has to aim each needle above where it must finish. A gauge whose target is 8 has no room to do that. With an oracle partner the same twenty seeds clear 4.00 of four at a two-second and a four-second rhythm, 3.80 at six seconds, and **2.00 at nine seconds**. Doc 08 phase 2.2 already flags the drift rate as the thing to tune carefully; this says what to tune it against, and it cannot be settled until doc 11 sections 6 and 7 carry measured round trips. The report prints the sweep rather than a single number, because a single number at an invented pace would hide the sensitivity instead of stating it.

*The Signal Room does not resist brute force the way doc 08 phase 2.1 assumes.* That line verifies 1,956 sequences against blind guessing. But `pressedSequence` is a `SHARED` fact, so a wrong key costs a reset and a penalty and never un-confirms the keys already accepted: the search is sequential with feedback, not over 1,956 flat. A solo guesser clears the chamber in about a quarter of runs at Standard. This is a real property of the mechanic rather than a leak - the accepted prefix is `SHARED` on purpose, both parties can see what has been tried - and no asymmetry check is weakened by saying so. It is left standing and reported rather than patched, because the fix is a design decision about the chamber and not a bug fix.

**The Airlock's solo pass rate is 100 percent and is not a defect.** Three levers, a twenty-second penalty and a three-minute timer. Doc 02 section 3.1 says the chamber is deliberately trivial because the mechanic is the discovery. Reporting the honest number here is what makes the zeros further down the table credible.

**Result.** 625 tests. `bench/results/` carries `ablation.jsonl` (one line per run, nothing aggregated), `ablation.svg` and `ablation.md`. At a six-second rhythm over twenty seeds: together 3.80 chambers of four and 90 percent escapes, agent alone 1.25 and no escapes, PILOT alone 0.00.
