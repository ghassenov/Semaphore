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

---

### D-041 The Cooperative Benchmark models a partner as what a description leaves behind

**Date.** 2026-08-29

**Decision.** `bench/` gains the Semaphore Cooperative Benchmark (doc 07 section 2, doc 08 phase 7.3): `harness.ts` drives the Standard suite, `suites/standard.json` fixes the twenty seeds, `partners.ts` holds the four scripted PILOTs, and `report.ts` aggregates into markdown and CSV. A partner is modelled as a function from the consistent world set to the subset the agent is still holding, plus the delay its answer cost. Nothing in it is a sentence.

**Options considered.**
1. Author a description string per chamber per partner and have the executor parse it.
2. Model a partner by its effect on the agent's belief: which worlds the description ruled out.
3. Put a language model behind the tool surface and script PILOT as chat turns.

Option 2. Option 1 builds a natural-language layer whose only reader is a parser we also wrote, which measures the parser. Option 3 is the real instrument and is what doc 07 section 2.4 wants, but it is gated on doc 11 sections 6 and 7 and on a token budget, and the harness has to exist before a backend can be pointed at it. Option 2 is exactly the part of a description this project can measure without inventing anything: the consistent world set is already enumerated for the possible-worlds proof and for the CONCORD meter, so "how much ambiguity did that sentence remove" is a subtraction. `bitsDelivered` is that subtraction, and it is doc 07 section 2.2's bits-per-question with the one honest change that it counts descriptions rather than questions, because there is no model here to ask one.

**Four of the ten metrics are absent rather than zero.** Clarifying questions, caution rate, injection resistance as a behavioural choice, and token spend are properties of an agent's judgement. The agent here is D-040's possible-worlds ceiling, which has none: it never forgets, never misreads a description, never reads prose at all. A column of constants for those would invite a reader to think they were measured. `report.ts` prints a section saying which are missing and why, because four silently-dropped rows read as inconvenience rather than as impossibility.

**Grounding latency was built, measured at 1.0 for every partner, and removed.** The closest quantity this harness can compute is the first call in a room the server did not mark `wasted`, and a first action in an unexplored room is informative whether or not it was right. What replaced it is calls per chamber cleared, which separates the partners by a factor of two.

**Three findings.**

*A partner who is confidently wrong a quarter of the time clears exactly what a perfect one does, and pays for it in calls.* `wrong` scores 3.80 chambers of four against `oracle`'s 3.80, and needs 54 mutating calls per run against 33, with its descriptions carrying a third of the information. Standard difficulty at a six-second rhythm absorbs the mistakes; a shorter timer or an irreversible chamber would not. This is the argument for measuring a pair on more than its completion rate, produced by the harness against itself, and it is why the report leads the second table with it.

*An imprecise partner is much more expensive than an occasionally wrong one*, at these parameters: `vague` clears 2.60 against `oracle`'s 3.80, a partner-sensitivity of 0.68. But `vague` is imprecise on every description and `wrong` is mistaken on one in four, so their ordering measures those two numbers rather than the two archetypes. The report says so and compares each partner only against `oracle`, which is this directory's standing rule about leading with the gap.

*`slow` is a second, independent measurement of Chamber II's drift cliff, and not a finding about patience.* It says what `oracle` says six seconds later, so it degrades nothing informational; it runs the session at a twelve-second rhythm and Chamber II falls to 0%. D-040 measured that cliff at 2.00 of four by nine seconds. Both numbers stay provisional until doc 11 sections 6 and 7 fix the pace.

**The suite is the ablation's seed list**, so this file's `oracle` row and the ablation chart's `together` bar are the same measurement and cannot drift apart. The partner axis was added to `session.ts` without moving a single published ablation number: a partner that settles the room draws nothing from the run's random stream, and `oracle` and the two partnerless conditions keep the unsuffixed seed key, which was verified by regenerating `ablation.md` and diffing it byte for byte.

**One file rather than the four-file `partners/` directory doc 07 section 2.3 sketches.** Forty lines of partner across four files is scaffolding; the sketch was naming the concepts, not the file system.

**Result.** 633 tests. `bench/results/` gains `benchmark.jsonl`, `benchmark.csv` and `benchmark.md`, regenerated by `pnpm --filter @semaphore/bench benchmark`. Zero tokens, for the same reason the ablation's run was: there is still no model in it, and putting one there is the next run of this same file.

---

### D-042 The interface is rebuilt in real-time 3D on Three.js

**Date.** 2026-08-29

**Decision.** Phaser and the top-down tile renderer are replaced by a Three.js
scene. The station is drawn as a lit **cutaway model**: every room is open at
the top and open on its south face, the camera always stands to the south, and
the pair are figures inside it. This supersedes the drawing half of D-026,
D-031, D-035, D-037 and D-038. `apps/game/src/render/` keeps its name and its
split; almost none of its contents survive.

**Why at all.** The brief was that the interface was not good enough and the
colours were wrong, and that is a fair reading of what shipped. The tile
renderer was correct - it obeyed every rule in this log, and D-035 through D-038
are a genuine sequence of improvements - and it was still a floor plan of a
place rather than the place. Doc 02 section 1 asks for a station that is
"melancholy and beautiful", doc 06 section 6 gives every room a distinct
*silhouette and lighting signature*, and a 16px top-down grid can render neither
of those: a ceiling height is not a thing a floor plan has, and light is not a
thing a tile has.

The deciding argument is that this game is *about* perception. PILOT perceives
by sight and that is the whole of the human's half. A renderer in which sight is
one flat layer of sprites is a renderer that cannot dramatise the one thing the
player is for.

**Options considered.**
1. Keep Phaser and improve the tile art and palette.
2. A 2.5D pass: isometric projection, prop height, fake lighting on the same
   sprite pipeline.
3. Real-time 3D on Three.js.
4. Pre-rendered dioramas composited in 2D.

Option 3. Option 1 is the small diff and it does not reach the problem: the
complaint was not that the tiles were badly chosen. Option 2 buys depth and
keeps the constraint that a light is a drawing somebody authored, which is
exactly the constraint worth losing. Option 4 gives the best still frame and the
worst everything else - `toolchange` is a live event with a body attached to it,
and a pre-rendered room cannot grow an arm.

**What the cost actually was, measured.** Three.js tree-shaken is **143KB
gzipped** against Phaser's 358KB, so the on-demand chunk more than halved. The
eager entry is unchanged at 16.9KB of a 400KB budget, because the dynamic-import
discipline D-026 established is untouched: `station.ts` still imports the engine
inside a function, and a browser without WebMCP still gets the gate screen
without downloading a renderer.

**The one rule the whole look rests on.** Every room is open at the top and open
on its south face, and the camera never leaves the south side. That is not a
trick for seeing past a wall. It is D-031's cutaway section arrived at again
with a camera instead of a tile grid, and it is what makes the fiction legible:
two operators who never occupy the same room read very differently when you can
see both rooms at once. It also makes everything else cheap - no wall needs
hiding, no room needs a special case, the shadows all fall one way, and the wide
shot is the same scene from further back rather than a second way of drawing the
building. `camera.test.ts` asserts the camera is south of and above every room
at every window shape, because the instant it is not, a wall that was
deliberately not built becomes a hole in the world.

**No post-processing, deliberately.** There is no bloom pass. Every glow is an
emissive material with an additive sprite behind it, under an ACES filmic tone
curve. A real post chain looks marginally better on a desktop GPU and costs a
full-screen pass at a resolution nobody controls, on a target list that includes
ChatGPT's in-app browser on a phone. The tone curve is the part that actually
matters and it is free: highlights roll off instead of clipping, so an emissive
lamp reads as bright rather than as a white rectangle and the halo carries the
hue.

**What survived unchanged, and why that is the finding.** Every design rule the
tile renderer was built on transferred without argument, which is the strongest
evidence that those rules were about the game rather than about pixels:

- **Devices step toward the server and never play a sequence** (D-037). In three
  dimensions this is an eased joint angle rather than a frame index, and the
  reason is identical: a door caught half-open by an update that shuts it turns
  round rather than finishing.
- **Walls resolve from the floor in one pass** (D-038). `stationCells` moved
  from `room.ts` to `plan.ts` and is otherwise the same idea: a doorway is not a
  feature anybody places, it is the absence of a wall where two floors meet.
- **A glyph's name never appears on PILOT's side**, and captions stay inside the
  canvas as sprites, because several of them carry `VISUAL` facts.
- **The registry drives KEEPER's body from a real `getTools()`**, never a guess.
- **The wide shot is a parameter, not a phase**, because `TRANSITIONING` never
  reaches a client.

**Result.** 623 tests. Driven in Chrome 152 against a live worker: 17 of 17
browser checks green on the single-origin path, a full session played end to end
through all four chambers, the Archive and the ending, and the registry draining
to empty. Every frame of that tour was looked at, and the four defects it found
are in the 2026-08-29 entry in `lessons-learned.md`.

---

### D-043 A new colour language: lamplight, tidewater and pearl

**Date.** 2026-08-29

**Decision.** The fourteen flat colours doc 06 section 2 locked are replaced by
twenty, split into two sets with different jobs. **Channel colours** - lamplight
for PILOT, tidewater for KEEPER, pearl for shared, each with a deep and a bright
variant - carry information. **Ground and material colours** carry none and
exist so that the two channel hues are the only saturated things in a frame. The
law is unchanged: one party's colour means only that party perceives the thing.

**Options considered.**
1. Keep amber and cyan, and restyle everything around them.
2. Keep the channel *meanings* and choose new hues for them.
3. Signal channel mainly through form and light direction, with colour secondary.

Option 2, which is what was asked for. Option 3 was rejected on the spot: doc 12
section 11 lists colour-as-information-architecture among the things not to be
talked out of, and down-ranking it would weaken the accessibility argument aimed
squarely at one of the judges.

**Why the old pair had to go.** Amber `#F0A830` against cyan `#3BC9DB` is a
correct choice that reads as a preset. Cyan at that saturation is the default
colour of every science-fiction interface ever shipped, and against a
mid-saturation amber it produces a frame with no quiet in it. Lamplight
`#E8B26A` is softer and warmer; tidewater `#8AA9E0` is a cold moonlight blue
with a violet lean, which is *further* from lamplight on the hue circle than
cyan was, so the two channels separate harder in exactly the frames where they
meet.

**Why twenty rather than fourteen, and why that is not the lock loosening.** In a
pixel renderer a colour is a fill, so fourteen is a complete vocabulary. In a lit
scene a colour is a material under a light: the same wall is six values between
its shadow and its highlight before anybody chooses anything, and four steps of
grey band visibly across four metres of stone. The extra six are all ground and
material steps. The lock itself is untouched - a twenty-first is still a
decision-log entry - and `palette.test.ts` asserts the count, so the rule is
enforced rather than stated.

**What is unchanged, deliberately.** The pair still sits on the blue-yellow
axis, which is what protanopia and deuteranopia both preserve, and
`palette.test.ts` asserts the warm/cool separation rather than trusting it.
Every channel-coded element still carries its shape marker. **There is still no
green**, so success is a pearl flash and a shape change and red/green signalling
is not available to be got wrong.

**One consequence worth stating.** In three dimensions a channel is not a fill
but a *light*: a room whose puzzle is only PILOT's to read is lit warm, a room
only KEEPER can act in is lit cold, and a room both parties work in is lit
neutral. That is the same law applied to the building, and it is the first thing
on screen in a chamber - the Blind Panel is visibly a cold blue room before a
single gauge is read.

**Result.** `scripts/check-palette.mjs` parses `palette.ts` and `style.css` and
fails the build when they disagree, in both directions. It replaces
`check-art.mjs`, which died with the art pack, and it guards the same class of
failure: two copies of a number, one of which can be edited alone.

---

### D-044 The art is procedural, and the repository is MIT again

**Date.** 2026-08-29

**Decision.** The vendored art pack under `apps/game/public/art/` is removed
with the tile renderer that read it. Every surface in the station is geometry
built in code, and every texture is drawn into a canvas at boot. **There are no
image files in this project at all.** This supersedes D-034 and restores D-029's
rule, by a different route.

**Options considered.**
1. Source free CC0 or permissive 3D models and vendor them, as D-034 did for the
   tiles.
2. Author and vendor low-poly GLTF meshes.
3. Procedural geometry and generated textures only.

Option 3, on three grounds, and the first is the one that decides it.

**The licence carve-out goes away.** D-034 recorded the cost honestly: the
repository is MIT and the pack was not, MIT grants redistribution and the pack's
terms withhold it, so `LICENSE` had to say which half of the tree it did not
reach. That is a real wart on an open-source submission and it is now gone.
`LICENSE` says so, and says what it would take to bring it back, so that
re-adding a carve-out is a decision somebody makes rather than a thing that
happens.

**It costs nothing and cannot drift.** No loader, no atlas, no request, no frame
counts for a build script to check. A colour reaches a surface through one of
`kit.ts`'s factories or it does not reach a surface, which is the same guarantee
D-029 wanted from authoring pixels in source and which an imported model file
cannot give.

**It is what a stylised 3D game actually needs.** Fidelity here comes from
lighting, composition, materials and fog, not from mesh density. A vendored
low-poly pack would have brought a house style that is not this one, and doc 06
section 6 is specific about the references being lighthouse interiors and
mid-century signalling equipment rather than generic anything.

**What D-029 got right and keeps.** The twelve glyphs stay authored as pixel
maps in source, unchanged, pixel for pixel. They are the shapes PILOT has to
describe, `wave` and `knot` are deliberately confusable in a way no pack could
know, and they are now the one thing in the station with hard edges: nearest
filtered, unlit, tinted with their channel, so the sharpest and most legible
thing in any frame is the thing the human has to get across in words. The two
bodies are geometry now rather than sprites, and the rules that shaped them
survive: PILOT is not lamplight-coloured, because the human is not a fact only
the human can perceive, and KEEPER has a visor band rather than eyes.

**Result.** `apps/game/public/` is empty of art, `scripts/check-art.mjs` is
deleted, and `apps/game/CLAUDE.md` loses its licence rule.

---

### D-045 The console is two surfaces with the room between them

**Date.** 2026-08-29

**Decision.** The DOM console is rebuilt. Three bays of roughly equal weight
around a square canvas become **two surfaces**: everything the human perceives on
the left, with the viewport at the top of it, and everything the agent can do on
the right. The viewport is wide rather than square. The rule governing what may
be a text node is unchanged.

**Why.** The old arrangement read as a dashboard with a game in it, and its
three columns made a claim the game does not make - that the station, the room
and the agent are three peers. They are not. There are two parties, and the room
is the thing between them that neither can perceive whole. Stating that as
furniture costs nothing and is the one piece of the argument a judge absorbs
without reading anything.

**Four changes that are usability rather than styling.**

*Progressive disclosure on the controls.* All four of PILOT's actions used to be
on screen for the whole session, which meant three of them were an error message
waiting to happen at any moment and a cold player could not tell the one that
mattered from the three that did not. Each now appears only in the phase where
it does something. Nothing is leaked by hiding them: phase and chamber are
`SHARED` by construction.

*The start card is over the room, and goes away.* Before a session exists it is
the only thing on the page worth touching. Afterwards it was three buttons that
could no longer do anything.

*The ambiguity meter moved into the rail, and ratchets.* It is a headline number
and belongs with the clock. Twelve discrete segments rather than a sliding bar,
because information arrives in quanta and doc 06 section 7 asks for a meter that
steps.

*The manifest is diffed rather than rebuilt.* Repainting the whole list on every
`toolchange` restarted the arrival animation on every row, which said the entire
registry had just been replaced. The point of the two-tier lifecycle is that
most of it did not.

**The gate screen gains the ablation.** Three bars, two on the floor, from
`bench/results/ablation.md`. Doc 07 section 6 has asked for this since the
numbers existed and phase 4 never landed it. For some judges this screen is the
whole submission, and it now carries the pitch, the split-lamp mark drawn as
inline SVG, the ablation and both browsers' setup routes.

**Result.** Entry chunk 16.9KB gzipped, CSS 2.9KB. The DOM audit in `ui.ts`'s
header is extended rather than re-reasoned, and the one new element it covers is
the caption band over the viewport: phase copy, derived from `view.phase`, which
the rail already prints.

### D-046 A room shot stands one room, and hidden masonry sinks

**2026-08-30.** The first playthrough of the 3D client on a real machine
produced one complaint five times over, in five different words: things
overflowing into other things.

Every instance was the same class of fault and none of them was visible to the
six hundred unit tests, because all six hundred check what a room *contains*
and none of them check what a frame *shows*.

**The station is a cutaway, and a cutaway leaks.** Every room is open at the top
and on its south face so the camera can look in. That also means a camera
standing in one chamber looks straight over its east wall into whatever is
beyond it, and what is beyond it is unlit. The neighbours arrived in frame as
flat black slabs crowding the room the player was actually in. `stationOwners`
now maps every floor cell to the room that owns it, corridors deliberately
excluded, and a room shot stands only that room's masonry and floor. `M` still
steps back and shows the whole building, which is the same rule the model was
already built on, applied one level further in.

**Hidden means gone, not flat.** The first attempt hid an instance by scaling it
to 0.0001 in y. That is not hidden: the box keeps a full-size top face, fully
lit, and a grid of them reads as pale plates lying in the void. The corridor
walls either side of the Signal Room's south doorway became two such plates
sitting between the camera and the room. Hidden blocks now sink below the world.

**KEEPER's alcove is reserved.** KEEPER is drawn in the east wall of whatever
room the pair is in, and that placement was made once, in the renderer. No room
plan knew about it, so the Archive stood a 4.6m rack of tape reels exactly where
the body is and the two largest objects in the room drew through each other.
`KEEPER_ALCOVE` and `keeperAlcove` name the reservation once; the renderer
places the body from it and the tests check every room against it.

**Low is not zero.** Room ambient was 0.42 so that the practical and the
emissive facts would do the work. Anything the practical did not reach came back
as flat black, and a rack of shelves in a dark corner was reported as a
rendering bug rather than as a dark corner - which is the correct reading. 0.62,
still well under a third of the wide shot's fill.

*What this cost, and the lesson.* Four of these five were found by looking at
frames; the fifth was found by measuring the geometry by hand. None was found by
a test, and two of them were introduced by the fix for another. **A renderer's
defects are in the frame, and the only instrument that sees them is a frame.**
The overlap test that existed did not catch the Archive because it compared
centre points and skipped any fixture above 1.4m - which is to say it was
written around the shape of the bug it had already found. It now measures real
extents against every fixture.

### D-047 A caption is sized to the frame, and there is only ever one

**2026-08-30.** Two faults in the same object, both of which had been visible in
every screenshot since the 3D client landed and neither of which was named
correctly by anybody looking at them, including me.

**Every fixture was carrying two captions.** The constructor built one inline
and left the field that tracks it null, so the first state update saw no caption
and wrote a second. The first was never removed. On screen this is a caption
that looks washed out and very slightly doubled, and where a fixture's label
changes it is two different strings stacked - `DIAL 1` printed over `0/7`. It
was reported as text superposing, which is exactly what it was, and I twice
looked for the cause in layout. The caption now has one path in.

**A caption was a fixed height in metres.** So how large it is on screen was
whatever the camera happened to be doing: sized to read at the twenty-five
metres a room shot stands at, the same caption at the six metres the lean-in
stands at was four times too big and washed across the door it labelled.
`captionHeight` solves the perspective relation for a constant fraction of the
viewport, clamped so the wide shot cannot lay a billboard across the station.
This is also the answer to captions being hard to read in the first place:
legibility stops being a function of where the camera is.

**The lean-in now has a frame in the tour.** `E` is the one camera move the
human drives and the tour never pressed it, so it was being verified by
arithmetic - the exact kind of proof the tour exists to replace. It is held
through a real CDP `rawKeyDown`, because the stage listens on `globalThis` and a
synthetic `KeyboardEvent` would not prove the browser path works. The frame it
produced is the best in the game and it is the one nobody had ever looked at.

### D-048 The last frame of the game is a frame nobody had looked at

**2026-08-30.** The Archive and the finale were the two beats the screenshot
tour reached last and the two nobody had inspected closely. Between them they
held six defects, and the largest of them had been shipping since the 3D client
landed.

**The finale drew an empty room.** The machine clears `chamber` on the way into
`FINALE` and again into `ESCAPED`, and the worker sends no facts for a phase
with no puzzle left in it. `roomPlan` asked the chamber, found null, and
returned nothing: the Concord Lock's bare shell with THE DOOR IS OPEN written
over it, and no door, no bolts, no columns and nobody standing there. It is the
payoff of the whole game and it was a grey box for two beats.

The finale is now a plan of its own, the way the Archive already was. *The
mechanisms are absent rather than zeroed*, which is the part worth recording: a
cipher wheel reading `WHEEL 0` where it read `WHEEL 14` is not a stale number,
it is a false one. What is left is what is still true - twelve bolts home, and a
door standing open.

**A door announced as open showed a crack.** The seam of light between the two
leaves was tuned when it was a five-centimetre crack in a shut door, and it grew
to 0.45m of a 3.2m opening. It now fills the doorway, at an emissive held under
the tone curve's shoulder so the opening keeps its colour rather than clipping
to flat white.

**The bolt ring floated over the lintel**, at radius 2.5 about y 3.4 on a door
2.9m tall, reading as a row of lamps on blank masonry rather than as the bolts
holding a door shut. And bolt 0 is at the *bottom* of that ring, so its
`N/3 ALIGNED` caption clamped to the same floor height as the door's own sign
directly beneath it. Two captions, one anchor, printed over each other - the
third distinct way this client has managed that.

**The room lit itself at full strength with the outer door open**, which came
back as a pale warehouse with a bright rectangle in it. The doorway only reads
as bright if the room around it stays dark, so the practical drops to a quarter
once that door is open.

**And a pendant lamp hung between the camera and the Archive's monitor.** Same
fault as D-046's beams, in the same room, one fitting later. So this one is
*measured*: `chamber.test.ts` takes the real camera from `camera.ts`, the real
plan from `chamber.ts`, and continues a ray to every hanging piece on to the
plane of the screen, at three window shapes. Two pendants flanking the monitor
now, which is a sightline decision before it is a symmetry one.

*The lesson, which is the same one D-046 wrote down and is worth writing twice.*
Every one of these was visible in a screenshot that had already been taken.
Frames were being generated and not looked at, which is worse than not
generating them, because it produces the feeling of having checked. The tour is
only an instrument if somebody reads the output; three of these six were found
by cropping one PNG and looking at the corner of it.

**Result across D-046 to D-048.** 657 tests, up from 623: the additions are the
checks that would have caught these, which is the only kind of test worth adding
after the fact. Entry chunk 18.8KB gzipped against a 400KB budget, Three.js
still a 148KB chunk fetched only when a shift starts. Driven in Chrome 152
against a live worker: 17 of 17 browser checks, and ten frames written and *read*
- the Archive's monitor unobstructed, the lean-in framed at eye height with the
glyphs legible, and an ending that is a dark cathedral with a shaft of sea light
across the floor instead of a grey box.

---

### D-049 The dial bank was claiming which gauge it drives

**2026-08-30.** A fourth sitting, and the first with somebody playing KEEPER
over the tool surface while somebody else watched the room. The Blind Panel
gave up a defect in the first minute of being played rather than looked at.

PILOT reported the chamber as "dial 1 has 0/2, dial 2 has 0/1, dial 3 has 0/6,
dial 4 has 0/6", and then, after a probe, "dial 4 now turned from 0/6 to 1/6" -
about a gauge that dial 4 does not drive. Nothing was wrong with the reporting.
The renderer had told them that.

**The dials were built inside the gauge loop, at the gauge's own `x`.** So
`DIAL n` stood directly beneath `GAUGE n` for every n, in matched columns, in
the one chamber whose entire secret is that the dial-to-gauge wiring is a random
permutation. The renderer cannot know that wiring - it is `HIDDEN` and no
projection carries it - so any alignment between the two banks is a claim the
renderer is not entitled to make. This one was also false: the tour's own dump
for the session played that afternoon reads `2>4, 4>2`.

Two more faults fell out of the same shared loop and coordinate.

**A gauge had no name.** Its only caption was its reading, `0/6`, so PILOT had
no word for *which* `0/6` and the nearest handle in reach was the dial caption
underneath. The pair needs a shared noun for a thing whose *value* stays
PILOT's alone, and the server already had one: these are its own gauge ids. The
caption is `GAUGE 3  0/6` now.

**And a dial settled on the wrong gauge.** `buildDial` stops a settled dial
turning, which is a cue PILOT can act on, and `on` was keyed to `value ===
target` at the paired index - publishing the same false link, in motion, in
every session whose permutation is not the identity. It settles on the *room*
being solved now, which is a thing the renderer actually knows.

Separately, at the gauge bank's eleven-metre spacing the outer two dials stood
0.6m past the ends of a 9.5m grate, in a room whose own description puts every
dial behind it. `GRATE_WIDTH` is one number shared with `fixtures.ts` now rather
than two that disagreed, which is D-048's lesson about two positions measured
from different origins, arriving for the third time.

*Why no test saw it.* Every existing check was about a fixture's own fields -
levels inside the scale, ids unique, no glyph in a caption. Not one was about
the relation between two fixtures, which is where this lived. The three added
are written as relations rather than as the coordinates that happen to be right
today: no dial within 0.75m of a gauge's column, every dial inside the grate,
and no dial `on` while the room is unsolved.

*And the lesson, which is new.* The previous eleven defects were all found by
looking at a frame. This one was found by **playing**, and it could not have
been found by looking: the frame is unambiguous and perfectly composed, and it
is composed into a lie. What exposed it was a second person having to *say the
room out loud* to somebody who could not see it. That is the one instrument
this project had not used on its own renderer, and it is the cheapest one it
has: the game is about describing a room to somebody blind, so describing a
room to somebody blind is the test.

---

### D-050 The station has a voice

**2026-08-30.** Doc 06 section 11 and plan phase 5.2, built in full: the eight
mechanism cues, the ambience bed, the four adaptive tension layers, the
behind-the-wall sound of a KEEPER tool call, and the mix. It was the largest
hole left in the art direction - the station looked like a place and sounded
like nothing - and it is the half of the `AUDIBLE` channel that did not exist.

**Options.** The `AUDIBLE` channel alone, roughly one module; cues plus the
ambience bed; or all of 5.2 including the timer-keyed score. The last was
chosen. The first two were the cheaper answers and the argument for them was
that the music half moves no judging criterion the cues do not already move.

**Everything is synthesised, and that is not a flourish.** D-044 took the last
asset out of the bundle, and the client fetches no images, no fonts and no
media at all. A reverb tail is exponentially decaying noise, which is cheaper
to generate than to download. Entry chunk 16.9KB to 22.1KB gzipped of a 400KB
budget; no new request of any kind.

**Two of these are puzzle mechanisms rather than atmosphere.**

The detents. Doc 02 section 3.3 has PILOT counting clicks through the grate to
learn what KEEPER's rotation actually registered, so they are 180ms apart, never
overlapped, identical every time, and the score ducks 6dB under them. A rotation
that registers *nothing* is silent - which is itself the information, since it
says the linkage is against a bound - and the tool call's own muffled thump is
what still says KEEPER did something. That is the whole reason doc 06 asks for a
per-tool-call sound, and it only became obvious while wiring the two together.

And the tool call. PILOT cannot see what KEEPER is doing and can always hear
that it is doing something, pitched off a hash of the tool name so a new tool
gets its own note without anybody maintaining a table.

**`PilotView` gains `seq`, without which none of it works.** Cues fire on the
event counter, never on a diff of the facts. Two rotations that each register
three clicks produce frames identical in every field, and PILOT has to hear six
detents rather than three: "sound it only when something changed" hears the
second rotation as silence, in the one chamber where the count *is* the puzzle.
It leaks nothing - KEEPER already knows how many calls it has made.

**The worker picks the cue, from the same branch that writes the subtitle.**
Each chamber's `lastSound` returns a cue and its prose together, so a cue with
no text equivalent cannot be added without deleting the other half on purpose.
Doc 06 requires that and deaf players depend on it; making it structural was
cheaper than remembering it. The vocabulary lives in `@semaphore/protocol`,
because a vocabulary held separately at each end is a vocabulary that drifts.

**The split that made it testable.** Web Audio does not exist in the test
environment and never will, so every decision is in `audio/plan.ts` and is
checked, and `voices.ts` decides nothing and only knows how a bolt sounds. This
is the same pure/impure split `chamber.ts` and `stage.ts` already use, and it is
the reason there are eleven tests here rather than none.

**Sound is the one subsystem allowed to be absent.** A machine with no audio
device throws on `new AudioContext()`, and a headless browser is one - the
screenshot tour clicks the same launch card. It fails to silence rather than
taking the session down.

**Result.** 671 tests, up from 657. Pipeline green, palette check green, both
builds green. Driven in Chrome 151 against a live worker: 17 of 17 browser
checks, twice, with no console error from the audio graph.

One thing the frames caught that no test would have: the three faders rendered
as three identical unlabelled sliders. The control that has to be findable is
the mechanism one, because a player who cannot hear the detents needs to turn
the score down off the answer. They are named in the frame now.

---

### D-051 A warm theme, against doc 06's chiptune

**2026-08-30.** Asked for directly: warm, instrumental, mysterious. Built as a
fifth continuous layer that is on from the first bar of a session to the last.

**It contradicts doc 06 section 11, and that is the decision rather than a side
effect.** That section asks for music that is "chiptune-adjacent but wet -
square and triangle waves through long convolution reverb". A warm instrumental
is not chiptune-adjacent. The reasoning for changing it: the chiptune direction
was written for the *tension* layers, where it is exactly right - the arpeggio
that arrives at a quarter of the clock is a square wave and should stay one -
but it left the resting state of the station with no music in it at all, only
ambience and a drone. A station that sounds like nothing until it is nearly out
of time is a station with no character for the eighty percent of a session when
nothing is going wrong.

So the two coexist rather than one replacing the other, which is also why this
cost one layer rather than a rewrite: **warm and unresolved while there is
time, chiptune urgency on top when there is not.**

**Three devices, none of them a timbre.** It sits on a pedal - the drone
already held A and its fifth under the whole station, so the harmony moves over
a bass that never agrees to leave. Nothing resolves: A minor add9, F major
seventh, A minor add11, D minor ninth, four colours sharing most of their notes
and no dominant anywhere, so each change is a shift of light rather than a
progression arriving. And the mode has a hole in it: the melody draws on A C D
E F G, natural minor with the second taken out, which is what stops six notes
sounding like a tune with an answer.

Warm was then the easy part. Triangles rather than the squares and sawtooths
the tension layers use, slow attacks so nothing is struck, chords scheduled as
overlapping swells so the harmony is never *seen* to change, and a long send to
the same tower everything else rings in.

**The drone moved from sawtooth to triangle** in the same change, and it is not
cosmetic: it is the pedal the theme hangs over, so its timbre decides whether
the whole score reads as warm, and a sawtooth's partials buzz through the
lowpass and make the room sound electrical rather than old.

**It rides the ambience gain rather than carrying a level of its own**, so it
ducks with the bed under the heartbeat instead of competing in the last tenth.
It is never taken away. Two knobs that are always turned together are one knob
and a chance to forget the second.

*What the tests can and cannot do.* Nothing in this pipeline can hear - the
screenshot tour runs in a headless browser with no audio device - so the tests
hold the one thing a machine can check: every pitch is a real equal-tempered
note rather than a number near one, every pitch is in the mode, no chord
carries a leading note, and the second never appears in the melody. A mistyped
frequency is a wrong note, a wrong note is the entire difference between
mysterious and broken, and it would otherwise ship past every check in the
repository. Whether it is actually *good* is still unverified and needs an ear.

**Result.** 677 tests, up from 671. Entry 22.4KB gzipped of a 400KB budget, up
0.3KB. Still no asset files. 17 of 17 browser checks with the theme scheduling
on every step, and no console error.

**Heard, the same day.** D-050 and D-051 both shipped with the same open risk
recorded against them - built, proved not to throw, and never actually listened
to, because nothing in this pipeline has an ear. That risk is now closed: the
whole score was played on a real machine on 2026-08-30 and signed off, cues and
theme and tension layers together. It is worth recording that it took about a
minute to settle, against two entries' worth of hedging: **a subsystem nothing
in CI can perceive stays a guess until one person spends sixty seconds
perceiving it**, and the cost of not doing that is carrying the uncertainty
through every document that mentions it.

One narrow thing is deliberately *not* covered by that sign-off, because it is a
different question: whether eight detents at 180ms are countable by ear by
somebody who does not already know the answer. That is Chamber II's mechanism
and it needs a playtester rather than an author, so it stays with the playtest
item rather than with the audio one.

---

### D-052 The room is the page

**2026-08-30.** A design pass over the console, asked for directly: a mood, a
layout that does not overwhelm, panels on demand, a centred game screen, and an
avatar that is doing something.

**What was wrong.** The console was three bays of panels around the viewport -
six readouts, all open, all the time - and the room was letterboxed to 16:9
under a 66vh ceiling so it would leave them space. Every panel was reasonable on
its own and the sum of them was a dashboard with a game in the corner. In a game
whose whole task is *looking at a room and describing it*, that is the wrong
thing to be optimising.

**The layout.** The room fills the deck and carries no aspect of its own, which
is safe for the reason the old stylesheet comment already gave: `camera.ts` fits
the room against whatever aspect it is handed. Everything else folds into the
two edges - PILOT's two panels west, KEEPER's four east, which is the same
thesis the three-bay layout stated - behind labelled tabs, one open per edge,
closed again with Escape.

**A drawer overlays the deck and never pushes it, and that is a constraint
rather than a preference.** The camera frames against the viewport's measured
shape, so a panel that squeezed it would re-frame the shot every time somebody
opened one and the room would jump. Overlaying costs a little of the room and
re-frames nothing.

**Colour: the ground only.** Three options were on the table and the narrow one
was taken. Lamplight, tidewater and pearl are untouched, so the design law, the
3D scene and the blue-yellow separation that carries protanopia and deuteranopia
are all exactly as they were, and `check-palette.mjs` stayed green for free.
What changed is how the ground is *used*: three light sources falling off rather
than one flat dark colour, and a grain layer generated by an inline filter
because large flat gradients band on an 8-bit display. **This is worth recording
as a general finding: the palette was not what made the page feel flat.** The
existing set is a carefully argued noir palette (D-043) and changing its values
would mostly have made it worse. Depth, layering and motion were the missing
things, and none of them is a colour.

**Motion.** One slow pass of lamplight across the start card and the gate every
eight seconds - the beacon the station is named for, and the only thing on the
page that moves on its own - a staggered arrival, and a mark that breathes
between the two channels. All of it behind `prefers-reduced-motion`.

**The avatar.** Four poses, derived from what the stage already holds: the
stride, the fixture `E` is holding, and the room's own solved flag. Nothing new
travels to get there, so a pose cannot disagree with the room, and they ease
rather than snap for the same reason a fixture converges rather than playing an
animation (D-037).

The largest single improvement was the smallest change in it. At `speed` 0 every
walk term was exactly zero, so the figure stood *perfectly* still - not calm,
frozen, which at forty pixels tall reads as a rendering fault rather than as a
person waiting. A four-second breath cycle fixed more than the other three poses
combined. The flame flickers on two sines at unrelated periods: a random flicker
at frame rate reads as an artefact and a periodic one reads as a pulse, and two
slow ones that rarely agree read as a flame.

*Two things found on the way, both committed separately.* Typing into the shared
notepad walked PILOT across the room, because `stage.ts` added every keydown to
the held-key set with no target filter while `ui.ts` had guarded its own key
since it was written - two surfaces, one predicate, and only one of them grew
it. And `display: flex` beats the user agent's `[hidden]`, which is why the
first build of this layout came up with both drawers open and empty.

**Result.** 680 tests. Entry 22.4KB to 24.2KB gzipped of a 400KB budget. Still
no asset files: the grain is a filter, the mark is inline SVG, and the client
makes no request for anything. 17 of 17 browser checks, and the frames read.

---

### D-053 Every door in a hole you can walk through

**2026-08-30.** Asked for directly, as the ground the next decision stands on:
if PILOT is going to walk back through a door, the doors have to be where the
doors are.

**What was wrong.** Two systems decided where a room's openings were and neither
had ever been shown the other's answer. `plan.ts` rasterises the whole station's
floor to a one-metre grid and stands a wall on every cell that is not floor and
touches floor (D-038), so a doorway is not a thing anybody places: it is the gap
where a corridor meets a room. `chamber.ts` placed a `door` fixture wherever a
room's composition had space for one. So the Airlock announced DOOR OPEN on its
north wall, which is solid masonry, while the way to the Signal Room was an
unmarked three-metre gap in the east wall that no fixture stood in and nothing
named. The Signal Room had no door at all. Nothing was broken by this while a
door was only a success light.

**The corridors moved, not the doors.** That is the decision worth recording,
because the cheap version was available and wrong. Two of the five openings
could not carry a door at all: the Signal Room's corridor left through its
**south face**, and every south face in the station is open rather than walled
so the camera can see in - a 2.9m bulkhead standing there is exactly the
"hanging between the camera and the room" defect D-048 spent a pass removing.
The other arrived at the Blind Panel's north wall, which is eleven metres of
gauge bank. Bending the doors to those openings would have meant either
accepting both defects or rearranging the two chambers around their plumbing.
Bending the corridors cost three metres of extra run down the east side and
moved nothing anybody looks at. **The station's building shape is the cheapest
thing in the model to change and it was the last thing anybody thought of
changing.**

`doorways.ts` holds the openings as a wall and a distance along it, room-local,
so a room still does not know where it stands (D-035). It is its own module
because the fact belongs beside the corridors in `plan.ts` and `plan.ts` imports
`chamber.ts` for the room sizes, so putting it there would close a cycle. It is
authored, like the corridors it has to agree with, and `doorways.test.ts`
derives the real openings from `stationCells` and fails if a door is not
standing in one - the same shape as the flood-fill that proves the floor is one
connected space.

**KEEPER's alcove follows the door.** Three of the five east walls have a
doorway now, and the body was standing in every one of them: KEEPER is drawn
*inside* the wall, so a doorway at the same place is a torso in a doorframe. The
alcove moves to the far end of the wall from the door, chosen from the door
rather than authored, because the Concord Lock's doorway is on opposite halves
of the same wall in the two modes. The check that keeps the alcove clear now
covers doors as well as racks, with the doorframe's thickness included: a door's
anchor sits exactly on the alcove's outer edge, so with no depth every door in
the game clears every alcove by a hair and the check proves nothing.

### D-054 Walking back through a door already opened

**2026-08-30.** Asked for: the avatar can return to rooms it has solved, by
going through a door once that door is open.

**It is a camera feature, and that was the constraint the design was chosen
against.** Three shapes were on the table. Free-roam of the whole station, with
PILOT's position in real station metres and collision against the existing grid.
Door-triggered return, where a key at an open door changes the room. And telling
KEEPER where PILOT is standing, so the two can never be describing different
rooms. The second was chosen, with the clock left running.

Nothing crosses the wire. The server is not told, the chamber timer keeps
draining so backtracking costs time, `projectForKeeper` is untouched, and no
field was added to `PilotView`. A room the pair has left is drawn from the last
frame the server sent for it - the same projection that was already on screen -
held in a client-side map. **The gate is one function.** `doorLeadsTo` asks
three things: the door is open, it leads somewhere in play order, and the room
beyond is one the pair has already stood in. A room ahead of them has never been
drawn, so a door onto one answers null. That is what keeps this a camera feature
rather than a hole in the design law: no projection the server has not already
pushed can be reached through it.

`asCleared` opens the doors of a room the pair has left, and touches nothing
else. It exists because the Signal Room has no `solved` fact at all - the
correct sequence is a subset of the keys and only the server knows how long it
is - so that room alone cannot say from its own facts that it was got out of.
Having got out of a room is knowable without asking, because the pair is in the
next one.

**Two things fall out of the body and the session being in different rooms, and
both are better than the alternative.** KEEPER is not drawn in a room the
session has left: an empty alcove in the room behind you is the honest picture
and a good beat. And the console names the room the viewport is showing, with
the floor rail marking both, because a header naming one room over a picture of
another reads as a bug in whichever of the two the reader trusts less.

**The tour found four defects and all four were about the key.** Going through a
door was first laid on top of the lean-in - hold `E` at a door and you go
through - on the grounds that it is the same gesture. It is not. `E` near a door
stopped meaning "let me look at this", and the one frame in the tour that exists
to show a lean-in came back as the camera halfway out of the building. It is
`Q`, edge-triggered. Arriving in a chamber stood PILOT in its doorway, which
reads well alone and drags the camera with it, because the room shot follows the
body: every chamber opened with a third of the frame taken up by the outside of
a wall. Only walking through a door puts PILOT in one now. **A caption on a side
wall cannot be separated from another one horizontally**, because a wall running
away from the camera barely moves across the frame - three metres in the Signal
Room was a dozen pixels on screen, and BACK TO AIRLOCK printed across PAGE
MARKED. And the console grew a horizontal scrollbar the moment a room name got
eight characters longer, because its grid had no column and defaulted to `auto`,
which floors at the rail's min-content.

**Captions are checked in screen space now**, by projection through the real
camera, because the existing check measures anchors in metres and its own
comment says why that is not enough. It runs at 16:9 only, and that limit is
stated in the test: at 4:3 and 1:1 it finds the Blind Panel's own gauge and dial
banks touching, which is nobody's authoring mistake and predates every door
here. See NEXT-STEPS.

### D-055 The rooms move, and there is something in them to look at

**2026-08-30.** Asked for alongside D-054: better rooms, more animation, more
decoration.

**Dressing was allowed to move.** It is built once per room and never touched
again, on the stated grounds that it has no state and nothing to read. That is
still true, and it had quietly been doing duty for a second claim - that nothing
in it moves. A station a hundred metres down with a cable hanging dead still off
every beam is a photograph of a room. Cables and pendant bulbs swing off their
own ceiling anchors and vents have an extractor turning behind the louvres,
driven off each piece's position so nothing is tracked between frames and no two
pieces move together, and skipped entirely under `prefers-reduced-motion`.

**The two rooms that had never had a composition pass got one**, and they are
the same two doc 06 asks for height in - which nothing in either was measured
against. A nine-metre room and a four-metre room are the same picture from a
camera that frames each to fill the viewport. Both have a ladder now: a rung
every third of a metre is a human dimension laid up a wall, and it is the
cheapest thing in the model that says how big a room is. Plus a high pipe
gallery and long cable drops in the Signal Room, and in the Concord Lock a
service run above the door, charts between the columns, lockers framing the
great door and a pair of pendants off the centre line. Nothing goes on the floor
down the middle: that room's whole job is to make the last twelve metres feel
like a walk.

**A latent bug, found by the first long cable.** A cable's `length` was its
drop, in a type where `length` is a run along x and `height` is a rise - two
fields that exist precisely so that nothing reading a piece has to guess which a
number is. So the check that keeps dressing inside its room was measuring every
cable's drop out sideways through the wall, and passed only because no cable had
ever been hung near enough to one. The Archive's sightline check was reading the
same field and had to be corrected with it, or moving cables onto `height` would
have silently made that check see every cable as a point with no drop at all.

---

### D-056 The tour waits on the camera instead of copying its clock

**2026-08-30.** The browser tour slept a hand-typed `WALK_MS + SHOT_MS` before
every screenshot. That number lived in `tests/`, and the constants it was copied
from live in `apps/game/src/render/camera.ts`, so it could not hear them change.

It had already gone wrong. The Archive's first frame was taken at 2000ms against
a 2400ms arrival, and every tour since the doors landed photographed that beat
as the whole station seen from four hundred metres up - in runs whose twenty-one
assertions were all green. The file's own header states the rule the file was
breaking. That is the shape of this defect: not a wrong number, but a number
with no way to be told it is wrong.

**The stage now publishes `data-settled` on its canvas** once the walk hold and
the shot's easing are both over, and the tour polls it. A flag the camera sets
itself cannot drift, and it is the honest answer to "is the shot ready", because
the shot's own easing is the thing being asked about.

Two details the first attempt got wrong. Node reaches the line the moment *its*
socket saw the state change, and the browser has its own socket, so a poll with
no grace period reads a flag that still describes the previous shot; and a
single true reading can land inside a walk hold, so the flag has to stay true
for a quarter second before it counts. The tour also got a third faster, because
most beats no longer sleep out a fixed 2.8 seconds.

**Importing the constants was tried first and rejected.** `camera.ts` is pure,
but its siblings are imported with `.js` specifiers that Node's type stripping
does not resolve back to `.ts`, so it would have cost a loader to save a
comment.

---

### D-057 An absent field is reported as absent

**2026-08-30.** Playing KEEPER's half through the WebMCP surface rather than
over HTTP - which nothing in this repository had done for a mutating tool -
turned up the message an agent gets for `inspect({target})` when the parameter
is called `object_id`:

```
E_INVALID_INPUT: object_id must be one of lever_a, lever_b, lever_c. Received .
```

Every route reads its arguments off a query string and coerces a missing one to
`""` on the way in, so the shared formatter rendered absence as an empty string.
The result is a sentence with a hole in it, and it asserts the wrong thing: that
an empty value was sent, when none was. Those are different repairs, and
misspelling a parameter name is the common way to arrive here, because
`inspect({target})` and `inspect({object_id})` are equally plausible guesses.

Fixed in the one helper all eleven call sites route through, rather than at the
eleven boundaries that each coerce differently. `undefined`, `null` and `""` all
report as `nothing`; a value that really was sent is still quoted back, zero
included.

---

### D-058 SPECTATE, attract mode and the replay are one picture

**2026-08-30.** Doc 08 phase 4 asks for a SPECTATE button and an attract mode,
and phase 7.2 asks for a replay viewer. All three play a recorded session, and
the station already had a surface that plays one: the Archive's monitor.

So the monitor's painter moved out of `stage.ts` into `render/monitor.ts` and
all three use it. It draws with a 2D context and nothing else, which is the
property that matters: nothing on that path imports Three.js, so **the gate
screen can show the game without fetching the 143KB engine** it exists to spare
that browser. Entry went from 25.4KB to 30.4KB of a 400KB budget across all of
phase 4, 6 and 7.2.

The worker gained `GET /ghost`, its one route with no session behind it, because
the gate screen has no session and cannot start one.

**One defect, and the first check passed on it.** In development the client asks
its own origin for `/ghost`, and the Vite proxy only forwarded `/session`, so
the monitor drew `NO TAPE`. That is a *prop*, not an error - it is what a null
track is meant to look like - so nothing anywhere reported a failure, and a
check asking "is anything lit" passed. It took a screenshot to notice. The check
now requires the recording to be the real one and to be moving.

---

### D-059 A deep link walks the real path

**2026-08-30.** `?chamber=N` (doc 08 phase 4), so a judge with ten minutes can
look at the Concord Lock without solving three chambers to reach it.

**It replays the transitions rather than assigning a state.** Each hop is the
same `CHAMBER_SOLVED` a chamber's own solve raises, the same `settleTransition`
that runs inside it, and the same `ARCHIVE_COMPLETE` that leaving the Archive
raises. A deep-linked session therefore arrives with the chamber's generated
puzzle state and its real deadline, and there is no second way into a chamber
for a proof or a test to disagree about. The alternative - writing the machine
state directly - would have been fewer lines and a second entry point that
nothing else in the project knows exists.

The skipped chambers are logged as entered and solved, because the session did
pass through them and a replay reading that log must not be told otherwise.
What records that they were not earned is `deepLinked` on the session, so the
benchmark corpus can tell a demonstration from a run without every consumer
re-deriving the rule from the timestamps.

`?chamber=` takes the id or the 1-based position. Anything else, including a
chamber the mode does not contain, starts a normal session: it is a URL people
hand-edit, not a trust boundary, and the server validates independently.

---

### D-060 The replay is a projection, and its URL is a query

**2026-08-30.** The replay viewer (doc 08 phase 7.2) reads the gzipped row D1
already holds and draws it as two tracks over one axis - amber for what PILOT
did and heard, cyan for what KEEPER called - with the CONCORD trace underneath.
A merged event list would have been a log viewer and would have said nothing
about the thing the game is about. The room beside it is the station's own
monitor, driven by the same `pilotTrack` projection the Archive's CRT plays, so
"the same monitor the ghosts were on" is true of the code and not only of doc 08
phase 3.2's copy.

**The raw log may not leave the server, and the session being over is exactly
the argument that would justify it.** `state_delta` events carry raw
`WorldState` paths, which include `HIDDEN` fields: Chamber II's permutation,
Chamber I's answer, Chamber III's passphrase. A seed is reproducible by
construction (doc 05 section 9) and a replay URL is meant to be shared, so a raw
replay of seed `s` is a solution key for every future session on seed `s`. The
projection drops them, and a test asserts the permutation cannot be found in the
payload.

**Three defects, all found by running it.**

D1 hands a BLOB back as a plain array of byte numbers, not the `ArrayBuffer` the
types suggest or the `Uint8Array` the write side produced. Passing that array to
`Blob` does not fail - it stringifies it - so the only symptom was
`TypeError: Decompression failed` from a line that looked correct.

`base: "./"` and a nested route are incompatible. That base exists so one build
works from a Pages project root and from a preview deployment's sub-path, which
means asset references resolve against the current URL's *directory*: at
`/replay/abc-123` the browser asks for `/replay/assets/index-*.js` and gets a
404. The page is blank in production and perfect in development, where Vite
serves an absolute `/src/main.ts`. Verified against a real build.

And the page and the API shared that URL, with the API answering with a
`cache-control` header, so a navigation to a URL the page had already fetched
was served the cached JSON instead of the app: one request, 200, no modules
loaded.

**So the canonical URL is `/replay?id=...`**, which has directory `/`, loads the
same assets the game does, and does not collide with the API. Doc 08 writes
`/replay/:sessionId`; that shape is refused rather than half-supported, because
accepting it would mean handing somebody a link that comes up blank. `_redirects`
routes only the shape that works, deliberately, since routing the other one would
turn an honest 404 into a blank page.

---

### D-061 The accessibility mirror, and what it costs

**2026-08-30.** Doc 08 phase 6. The Access panel carries three switches, all off
by default and all session-only.

**The mirror breaks the design law on purpose, and it is the one place that is
allowed.** Puzzle-critical visuals render to the canvas and never to the DOM,
because a text node holding a fixture is one an agent with page access can
scrape, and KEEPER not being able to see is the entire game. A blind player
needs exactly that text. `apps/game/CLAUDE.md` already sanctioned the exception;
this is it, and the README states it as a limitation rather than a footnote.

Three things keep it honest. It is off until the person it is for turns it on,
in a panel that says what it does before it does it. It **never names a glyph**:
it says a plate carries a mark and leaves the describing to the player, exactly
as the picture does, asserted for every chamber. And it changes nothing on the
server - it renders the same `projectForPilot` frame the canvas does, in a
different medium.

Contrast and motion are switches rather than only media queries, because a
system preference is not something somebody should have to change desktop-wide
to still one game. The stage reads the motion attribute every frame so the
switch works mid-session. The contrast palette is **derived from the locked set
with `color-mix` rather than declared as new hex**: `check-palette.mjs` rejected
the first attempt, correctly, and deriving turned out to be the better answer
anyway, because the channel hues carry the design law and the colourblind
guarantee and a contrast mode that quietly re-hued them would break the thing
its own users most need to stay stable.

**Colourblind verification is now measured rather than argued.** A Vienot
dichromat simulation covers protanopia, deuteranopia and tritanopia - the one
doc 08 bolds, because it destroys the blue-yellow axis the two channels were
chosen for. They survive it comfortably: the key tones separate by 265 under
tritanopia against 151 in normal vision, since the collapse sends them in
opposite directions. The tightest case anywhere is the bright pair under
protanopia at 59.3, and the test's floor is 40.

The detent count Chamber II is built on already had its text equivalent - "3
clicks registered" beside the room - so the pip counter doc 08 phase 2.2 asks
for is satisfied by prose rather than by pips.

---

### D-062 The starter prompt is a requisition slip

**2026-08-30.** Doc 08 phase 4's last line, and the element doc 02 section 12
and doc 04 section 2 both call the single most important one on the landing
screen: it is what makes an agent engage at all, and it is on the repo's
never-cut list.

Doc 04 already specified the art and it had simply never been built: "styled as
a station requisition slip, with a copy button". So the card is a form now - a
torn top and bottom edge, `STATION REQUISITION` against a form number, a ruled
`ISSUE TO` field naming KEEPER, the prompt typed into the body, and the split
lamp stamped across the foot beside the copy button.

**All of it is CSS and the mark's existing SVG.** No asset file (D-044), no web
font, and no colour outside the locked twenty: the paper is pearl mixed down
into the ink with `color-mix`, which is what a form looks like under a sodium
lamp rather than what it looks like in daylight, and the border and stamp are
the lamplight channel that already means "PILOT perceives this". A first pass
sat the paper at 7% and the slip read as one more panel in a column of panels,
which is the one thing it must not be; weight is how a page says which of six
boxes to read first.

**It was two hand-assembled copies, and they had already drifted.** The gate
screen's had no fallback line - "if your agent does not respond, ask it: what
tools does this page give you?" - which doc 04 asks for by name and which is the
recovery path for the exact failure the card exists to prevent. Both are built
from one function now, and the tour asserts the card is whole and on screen
rather than merely present.

**And it was behind a closed tab.** D-052 put every console panel behind one,
which left the most important element on the landing screen one click away from
a player who did not know it existed - while the start card told them to paste
the prompt on the right, and the right showed nothing. It is open on load now,
and it **hands the room over when the shift starts**, once: the room is the page
(D-052), so a panel overlaying its right third during play would be the console
talking over the game. Only if it is still the panel that was opened, because a
player who has moved to Faculties by then is reading something they chose.

The copy button also stopped being a one-way switch. It says what happened, is
announced to a screen reader, and returns to its label after a moment - a button
stuck on its own past tense stops reading as something that can be pressed
again, and a paste that went to the wrong window is exactly when somebody needs
to press it again.

---

### D-063 A guided first shift, in two layers, and a told opening

**2026-08-31.** Three things a player arriving cold was never given: a screen
that says what this is, a way to be shown how it works, and any sense that a
shift begins and ends rather than simply switching on.

**The landing screen led with "Start the shift" over three unnamed buttons.**
On a submission deadline every judge arrives cold, and that screen told them
nothing about what they had arrived at. It now leads with the thesis and proves
it in a picture: the same lever rendered the two ways the two players receive
it, the mark drawn by the game's own `glyphCanvas` and tinted to PILOT's
channel exactly as `kit.glyphPlane` tints it in the station, beside the real
shape of text the agent gets. The two channel colours do the job they do
everywhere else, so the graphic teaches the legend while it makes the argument,
and it never names the glyph - which is the design law and also the point. The
gate screen leads with the same two things, from the same code, and demotes
"this browser cannot reach the station" to a marked aside: doc 07 section 6 is
explicit that for some judges that screen *is* the submission, and a submission
should not open with an error.

**The tour is two layers because they teach different things.** The camera
teaches the room - it is the only way to show a mark at the size PILOT actually
has to describe it, and the third beat flies in until two glyph plates fill the
frame. The dimming layer teaches the console, because a panel is a rectangle in
a corner and no camera move can point at one. `plan.ts` holds the copy and the
order and is pure; `tour.ts` drives and chooses nothing.

*The order is the argument.* A player told the controls first learns a control
scheme; a player shown the asymmetry first learns why there is a second player,
which is the only thing here that looking at the screen does not tell them. It
is asserted, because it is exactly the ordering a later edit reshuffles for
flow. So is the rule that no step may name a glyph, and **that one has already
paid**: the walking beat said "cross the room", and `cross` is one of the twelve
glyphs. The test caught a leak in copy that nobody would have read as a leak.

**A step names a fixture and only the stage can find one.** `focus` goes on
`StationModel` and `stage.ts` resolves it against the live room, so a step
naming a fixture the current room does not contain resolves to nothing and the
camera carries on, rather than flying at the origin.

**The opening and the ending are told over the station, not in front of it.**
Four lines in, three out. A title-card sequence would have been cheaper and
would have looked like something else's opening; the station is already on
screen, lit, with a camera that moves. Reduced motion is honoured by showing the
words without the entrance rather than by skipping them: they carry the premise,
and somebody who asked their system for less movement did not ask to be told
less.

---

### D-064 The ground is retuned, and the palette lock had a hole

**2026-08-31.** The eleven ground and material colours are retuned for range and
legibility - `mist` carries most of the secondary text on the page and at
`#7c8a99` was too dim to read - and the type scale is lifted systematically,
compressed upward so the smallest labels gain the most. Panels get a 9px radius
and three named elevation steps. Sharp rectangles outlined in hairlines is most
of why this console read as test equipment.

**The channel set is untouched, deliberately.** Those hues are information, and
D-061 measured their separation under all three dichromacies. Retuning them
would be retuning the legend and the colourblind guarantee together.

**And the lock had a hole.** `check-palette.mjs` compared *declarations*:
`--name: #rrggbb` on one side against `palette.ts` on the other. A colour
written inline - in a gradient, a shadow, a border - is not a declaration, so it
was never checked, and twenty had accumulated. Eleven carried a hue, and when
the ground moved they silently stayed at the old values: the panels kept the
previous palette's blue while everything around them changed. That is precisely
the drift the script exists to prevent, arriving through the one door it had
left open. They are `color-mix` against tokens now, pure light and shadow are
`white` and `black` percentages so they cannot become a twenty-first colour by
the back door, and the script fails on any hex written into a rule.

---

### D-065 The page is the split, and the tutorial holds the wheel

**2026-08-31.** Three rounds of "this is not a redesign" before the note landed,
and it was right each time. Two passes changed the paint - ground colours by a
few points, type by a pixel and a half, then vivid channel hues and a floating
HUD - and left the landing screen's composition exactly where it had always
been: a centred column on black with a panel in it illustrating the asymmetry.

**So the page became the asymmetry.** Divided down the middle, the left field
lamplight and the right tidewater, a lit seam between them, and the words that
belong to both sitting across it. The halves lost their boxes: the page behind
them is already the division, and drawing a panel around each was drawing the
same line twice. *The lesson is that a redesign is a change of composition. A
change of palette on a fixed composition is a reskin, and calling it the other
thing does not make it one.*

The requisition slip moved out of a drawer that opened itself and into the cold
half - the most literal possible illustration of "what your agent gets". A copy
button was tried there first and was worse than either arrangement: a judge
could take the prompt without reading it, and the fallback line went off screen
with the text. The browser proof failed on exactly that, which is what it is
for.

**The guided shift did not hold the wheel.** Reported as "completely broken",
and it was: the player kept every key while the tour was speaking, so `WASD`
walked the body out from under a camera framing it, `M` yanked to the wide shot
mid-sentence, and `Q` walked out of the Airlock entirely - after which every
remaining step named a fixture the room no longer contained and the camera
simply stopped. A tutorial that can be steered off what it is teaching is not
one. Three more went with it: typing into the shared notepad advanced the tour
and skipped the opening, because both listen on `globalThis`; the spotlight was
measured once, so a drawer opening left it pointing at nothing; and a step
pointed at a shut drawer, making the lesson "look at this word".

**And the replay was a chart, not a replay.** Two tracks of tick marks and an
ambiguity trace say when and how much; they cannot say what happened. It now
carries the session as a list of what was done, in the two channel colours,
with the wasted-call metric shown in words where it applies. The list follows
the playhead and clicking a line seeks to it: the chart is how you find a
moment and the list is how you read one, so they are on screen together or
neither is much use.

*One thing a test could not have caught.* The first vivid tidewater was a cyan,
and the Blind Panel is lit through its own practical in the channel's colour -
so cyan fell on brass and the hazard chevrons came back green, in a palette
whose test forbids green so that success cannot be signalled with one. A lit
surface is not a palette entry. Moving the hue to a blue fixed it, and only the
frame could have said so.

---

### D-066 The web layer is rebuilt, and the start button did nothing

**2026-08-31.** Item 1 of the handoff, from a fresh session: redesign the web
page completely, and fix the bugs in it. The station itself is untouched -
`render/` has not been opened.

**The worst thing on the page was not a design problem.** Picking a session
length did nothing at all. `start` answers `E_NO_SESSION: Your shift has not
started` until the agent has called `begin_shift`, and the landing card sent
that refusal to `onNote`, which writes to the activity log, which lives inside a
*closed drawer*. So a visitor clicked `full`, nothing whatsoever moved, and the
only conclusion available to them was that the page was broken. Every judge who
opened this without an agent already pointed at it met that. It survived because
no test drives the page's own buttons and the browser proof calls `begin_shift`
over HTTP first, which is a path nobody arriving at the page ever takes.

The choice is remembered now, the step says what it is waiting for and why, and
the shift starts by itself when the agent opens the door. Beside it is a second
path that opens its own door - a demonstration is allowed to, and the button
says so.

**Then the composition.** The landing screen *was the console*, with a card laid
over the viewport, and four separate defects came out of that one fact. It
inherited a rail reading `CONNECTING`, an ambiguity gauge with no session behind
it, seven tab stubs and three audio faders, all live, above the first sentence
about what the page is. It inherited the deck, which has a definite height and
clips rather than scrolls, so opening the ablation - never-cut - cut the bottom
off the chart and the requisition slip together. And it inherited the console's
breakpoints, which is most of why 430px was not merely unpolished but broken.

It is its own surface now, laid over everything, with its own scroll. The
console keeps its measured size underneath the whole time, because the camera
frames against the viewport's shape and a console hidden with `display: none`
comes back at zero by zero.

**A previous pass made the page the split and it was right about the idea.**
What it got wrong was that every element then had to live in one of two
arbitrary columns, and the two halves of the graphic carrying the entire pitch
were two hundred pixels out of vertical alignment with each other. *A comparison
whose two sides do not line up is not a comparison; it is two unrelated
illustrations.* So the split is the **graphic** - one full-bleed band, warm
field against cold, a lit seam with the mark on it - and the rest of the page is
a reading column. The two halves are `subgrid` rows of one grid, so the captions
share a line, the payloads share a row and the notes share a baseline whatever
either of them contains. That is structural rather than tuned, which is the
whole point: it cannot drift back out.

**Three bugs the split-into-modules found on its own.**

The requisition slip was on the gate screen **twice** - `promptCard()` called
directly and again inside the graphic that embeds it. D-062 made it one builder
to stop two copies drifting; nothing stopped one page rendering the builder
twice.

`.note`, `.eyebrow` and `.lede` were declared inside sections that the redesign
replaced, and each is used by a surface that was not being redesigned. The
replay viewer lost its type entirely. **A type role more than one surface uses is
declared once, globally**, and they are now.

And **CSS resolves ties by source order**, which cost two rounds: a narrow-window
block written next to the rule it was *about* sat six hundred lines above the
rule it was overriding, so the proof graphic never stacked on a phone and the
skip hint never cleared the foot. Overrides go below what they override, and the
comment in the file now says so.

**The tour found three more, and none of them was in a test.** The ending strip
owns the top edge of the viewport and the rail is laid over the same pixels, so
"the whole shift is on the station's log" printed straight through
SEMAPHORE - ESCAPED - AMBIGUITY. The caption band owns the bottom edge and the
mixer is laid over that, so "COLD AIR, AND THE SOUND OF THE SEA" lost its second
half behind the faders on the last frame of the game. And the caption's own side
padding did not clear the tab rails, so THE DOOR IS OPEN was missing its first
letter behind ACCESS. All three are the same shape - **two absolutely positioned
bands over one viewport have to be told which edge each one owns** - which this
file already recorded once and which recurred anyway because the rule was
written about two of the bands and there are five.

The skip hint stopped being pinned to an edge three other things share and moved
under the line it skips, where it belongs and where it cannot collide with
anything.

**The console chrome had never had a composition pass and it showed.** The two
tab rails were four rounded chips floating down each side with three tenths of a
rem between them; they are one framed rail with hairlines between members now.
A drawer pinned `top` *and* `bottom` was full height, so a five-line keyboard
legend opened a panel with six hundred pixels of empty box over the room - the
room being the thing the player is trying to look at. It takes what it needs.
The mix was four controls drifting along the foot and is a housing.

**Nothing in the design law moved.** The channel hues are untouched, so the
colourblind guarantee D-061 measured is untouched. The palette is the same
twenty colours and `check-palette.mjs` passed on every commit of this work,
including its rule that no hex may be written into a rule - everything new is a
token, a `color-mix` against one, or a white/black percentage. No asset file was
added. Puzzle-critical values are still canvas-only.

**Result.** 735 tests, typecheck, lint, format and both builds green. **25 of 25
browser checks** on Chrome 152 against live servers, and the frames read. Entry
39.0KB gzipped of a 400KB budget, up from 30.4KB, all of it stylesheet; Three.js
is still a chunk the gate screen never fetches. The start flow was verified the
only way it could be: a length chosen with no agent, then `begin_shift` called
from outside the page, and the shift opened itself into the Airlock.

*One thing worth keeping.* The browser proof's slip check failed after the
split, correctly, and for a reason no amount of looking at the design would have
found: there are two slips on the page and the console's is first in the
document. The instrument was right and the page was wrong. The proof now waits
for the landing screen to be gone before measuring, polling for the element
rather than sleeping a hand-typed duration - the same lesson as D-056, arriving
at a different band.

---

### D-067 The camera was compounding its own drift

**2026-08-31.** Found by playing, in the first two minutes, by the person who
owns the interface: *"when i press e then immediatly move after the camera is
super bugged and out of the map and when i keep pressing a button a long time it
is also out of the map."* Both reproduced literally on the first try. This is
the fifth time the instrument has been a person walking around rather than a
test, and the sixth thing it has found that 735 passing tests could not.

**Two faults, and they multiplied.**

`frame()` keyed the camera transition on the shot's **coordinates**. A room shot
leans toward PILOT, so its eye moves every frame anybody is walking - and every
one of those frames therefore read as a brand new shot. `shotAt` reset sixty
times a second, the easing sat permanently at zero, and the camera never
arrived anywhere. The follow, which is the whole reason `roomShot` takes a
`follow` argument, has never once worked.

On its own that would have been a camera that simply does not move. What made it
leave the building is the second fault: the idle drift is added straight into
`camera.position` at the end of each frame, and a restarting transition took its
starting point from `camera.position`. So each frame began from a position that
already had a drift on it and then had another added. **The drift compounded
instead of oscillating**, at 0.22 metres a frame, which is roughly thirteen
metres a second. Hold a movement key for two seconds and you are outside the
station looking at the sea. Press `E` and then move and the runaway starts from
a lean-in eye, which is why that one ends up inside the geometry.

The fix is one idea in two places. **The transition is keyed on the shot's
identity** - which room, which fixture, the wide shot - and the shot itself is
updated every frame, so a follow tracks continuously without being mistaken for
a new shot. And **`baseEye` holds the position with no drift on it**, which is
what a transition starts from; `camera.position` is that plus the drift, and the
drift is never an input to anything.

**The general rule, and it is the one worth carrying:** *a value the render loop
writes into a live object every frame must never be read back as a starting
point.* It is a feedback loop with no damping term, and the symptom is not a
wrong value - it is a value that leaves the world.

**The regression check is in the browser proof, and it was verified to fail
without the fix.** `data-settled` is the assertion because it is the exact thing
that was false: a transition that restarts every frame never settles. It is read
*while the movement key is still down*, because continuous tracking is not a
transition. Re-introducing the coordinate in the key takes the tour from 27 of 27
to 26 of 27.

*And a check written beside it was deleted as written and kept as measured.* It
claimed the camera was "still framing the same room" and read the room name off
the rail - which passed happily through the run where the camera was four
hundred metres outside the building. It measures that a held movement key does
not trip the edge-triggered door transit, which is worth asserting, so it says
that instead. A metric that does not separate the thing it names is not evidence
for it (D-040's rule, arriving in a new place).

*One stale fact found on the way.* `NEXT-STEPS.md` told the next person that the
worker's "route names are the tool names". They are not, for the read-only half:
`get_status` is `GET /status`, `describe_chamber` is `/describe`, `read_manual`
is `/manual?section=`. Corrected there, because the handoff is trusted and a
trusted handoff that is wrong costs more than no handoff.

---

### D-068 One typeface, deliberately

**2026-08-31.** Asked for directly, mid-session, after the constraint was
stated: "forget about the 3 constraints" - no asset files, no webfonts, no
images. The three are load-bearing for different reasons and were weighed
separately rather than dropped as a set.

**Images stayed off, for a reason that is not taste.** There is no way to
source photography or artwork in this environment with rights clean enough to
ship under MIT - no image-generation tool, no licensed stock access, and
downloading an arbitrary image off the web and redistributing it in a public
hackathon submission is a real liability, not a style choice. So the ceiling
this pass raises is typographic, not photographic: light, motion, composition
and one real typeface, which is also closer to what the "editorial poster"
direction (D-069) actually wanted.

**Fonts came back, once, for the landing screen's display type only.**
Fraunces, a variable typeface, SIL Open Font License 1.1. Self-hosted in
`apps/game/public/fonts/` as two `.woff2` files (the upright weight axis and
one italic cut) plus the licence text beside them, `font-display: swap`, and
one `--display` custom property so nothing structural - a control, a label, an
identifier - can quietly start depending on it. `LICENSE` carries the
carve-out this reintroduces, in the same place and the same voice D-044's
carve-out used to live, because that section exists precisely so this decision
would have to be written down rather than slipped in.

**What stayed exactly as it was.** No puzzle-critical value, no gameplay
geometry, no game texture depends on the font; removing the two files leaves
every fallback stack this project already had. `check-palette.mjs` and the
twenty-colour lock are untouched - this was never a colour question. And it is
real network weight the project's own performance target should know about:
roughly 150KB combined, fetched once and cached, behind `swap` so it never
blocks the headline from rendering - but it is not the zero the client's
`no asset requests for media` law used to guarantee, and the in-app-browser
spike (item 4, `NEXT-STEPS.md`) should note it when it runs.

---

### D-069 The landing screen, made to be looked at

**2026-08-31.** Asked for directly, after D-066: the structural redesign fixed
what was broken, and this pass is the one that makes the result something a
judge would call beautiful rather than merely correct. Three concrete
directions were put to the person who owns the interface with ASCII previews
rather than guessed at - cinematic (the live station as the hero background),
editorial (a designed poster), interactive-proof (the split graphic reacting
to the cursor) - because this project has already burned three sessions on
exactly this ambiguity (D-063 to D-065) and a fourth pass built on a guess
would have been the same mistake with better paint. **Editorial** was chosen.

**One typeface (D-068) and four signature moments**, also chosen from a menu
rather than assumed: scroll-driven reveals, a cursor-reactive light, redrawn
SVG motifs, and custom micro-interactions on the things a reader is actually
choosing between.

- **Scroll reveals** (`ui/reveal.ts`). One `IntersectionObserver`, every
  `[data-reveal]` element gets `.is-revealed` the first time it crosses in and
  never loses it again - a reveal is an entrance, not a toggle. Under
  `prefers-reduced-motion`, or with no `IntersectionObserver` at all, every
  element is marked visible synchronously and nothing is ever observed:
  verified against real `getComputedStyle().opacity`, not only the class, with
  no scroll performed at all.
- **The pointer light** (`ui/motion.ts`, `wirePointerLight`). Two custom
  properties written on `pointermove`, confined to the hero; everything about
  what the light actually looks like is `style.css`'s decision, which is the
  same split `wireReveals` keeps. The first pass measured as *functioning* -
  the coordinates genuinely tracked the pointer - and *invisible*: a single
  10% ring at 38rem read as nothing against the existing hero gradients. It is
  two rings now, a dense inner one and a faint outer one, verified by cropping
  the frame with and without a simulated pointer over the headline.
- **Redrawn motifs** (`sectionRule`, `parts.ts`). A rule between sections that
  grows from its centre and fades the split lamp up inside it on scroll,
  rather than a divider that was simply always there.
- **Bounded tilt** (`wireTilt`, `ui/motion.ts`). A five-degree lean toward the
  pointer on the three things a reader chooses between - the session-length
  cards, the "look around" offer, the requisition slip - one delegated
  listener per page rather than one per card. The slip's tilt rule is shared
  with the copy of the same card that lives in the console's drawer
  (`promptCard`, one builder, D-062): the custom properties it reads are unset
  there, so the rule is a no-op on that copy rather than a second rule to keep
  in step.
- **Typography.** `--display` (Fraunces) on the headline, the start section's
  subhead and its step numerals; one italic clause in the thesis - "the same
  room" - carrying the actual asymmetry the sentence turns on, which is doing
  with weight and slant what a spoken reading would do with stress.

**`heroBlock` and `whyAndKey` are shared between the landing screen and the
gate**, extracted rather than duplicated a third time, for the reason every
shared builder in `parts.ts` exists: this project has paid twice already
(D-062, D-066) for a composition existing as two copies that quietly stopped
agreeing.

**Nothing here touches the design law.** The channel hues, the twenty-colour
lock, `check-palette.mjs`, the canvas-only rule for puzzle-critical values -
none of it was in scope and none of it moved. The 3D station was never opened.

**Verified, not asserted.** Both cursor effects were checked with a simulated
pointer over CDP and their actual custom-property values read back, not just
"the code looks right" - the light's first version passed that check and was
still invisible, which is exactly why the check has to read pixels as well as
state. `wireReveals`, `wirePointerLight` and `wireTilt` each have unit tests
for their two branches (reduced-motion / coarse-pointer inert, otherwise
wired-and-disposed); what a real intersection or a real drag does on a real
screen is, as this file's own rule says, the browser tour's job, and the tour
stayed at 27 of 27 through every step of this pass. 747 tests, entry 40.5KB
gzipped of a 400KB budget (up from 39.0KB - the two new TypeScript modules,
not the fonts, which are not part of the JS bundle at all).

---

### D-070 The light was scoped to a box, and the buttons did not look like buttons

**2026-08-31.** Reported back after D-069, plainly and mid-session: "not bad
but... full of bugs," "the cursor is stuck in a little box where the effects
are only there," "lets the judges try it out in an easy way and see the
buttons easily." Two of the three were investigated literally before anything
was changed, which is the rule this file has stated before and is worth
restating: a report of what somebody sees is an observation, not a hypothesis.

**"Full of bugs" turned out to be true, and not one bug was in the redesign.**
The worker (`wrangler dev`) crashed twice mid-session with an internal
miniflare proxy error, both times traced to the same cause: roughly sixty
Chrome processes had accumulated from the session's own testing scripts, each
one a throwaway tab that opened a live game session, subscribed to its socket
and polled `/concord` every 2.5 seconds, and was never closed. Closing every
leftover tab on the two test browsers (never the user's own) brought the
process count back to normal and the worker has not crashed since. **Neither
crash cost the user's actual progress** - the Durable Object's local state
persists to disk across a `wrangler dev` restart - but each restart did drop
`?seed=play-1` from the user's own tab, because a lost HMR connection
resurfaces as a reload of the bare origin and `sessionIdFrom` mints a fresh
random id when there is no `seed` param. Both times the fix was a `Page.navigate`
back to the seeded URL, over CDP, on the user's own tab, done and reported
rather than done and left unmentioned.

**"The cursor is stuck in a little box" was checked before being reinterpreted,
and it was not a trapped click.** A grid sweep of the whole first viewport,
reading `document.elementFromPoint` at every cell, found every point
hit-testing to the real element underneath it - nothing was eating a click
meant for something else. What was true is that the pointer light
(`wirePointerLight`, D-069) was scoped to `.landing-head`, a box roughly the
height of the hero, and nowhere else on the page reacted to the cursor at all.
A light that exists in one rectangle reads as broken even though nothing is,
because the rest of the page then has no reason to have a cursor. It is wired
on `.landing` now - the fixed, full-viewport surface everything scrolls
inside - so it holds its position on screen while the reader scrolls past it,
like a ceiling lamp, verified by moving the pointer to the open background
space beside the session-length cards, well past the hero, and confirming the
glow appears there and not at the old default.

**"See the buttons easily" was a real gap, not a vibe.** The three
session-length buttons carried a name at the same size as their own caption,
no icon, and nothing marking which of the three a first-time visitor should
take. They are a CTA now rather than an information card: the name is a full
size step up and set in the display face, a chevron says "this goes
somewhere" the one time this page uses an icon at all, the card gets a lit
floor edge that reads as raised rather than flat, and Full Shift carries a
`RECOMMENDED` badge so three equally weighted options do not have to be
independently adjudicated by somebody who does not yet know the game.

**Nothing about the design law moved**, again: the twenty-colour lock, the
channel hues, `check-palette.mjs`, the canvas-only rule. 747 tests, 27 of 27
browser checks, entry 40.7KB gzipped of a 400KB budget.

*One operational lesson, for whoever runs the next long session against live
`wrangler dev` and `vite`.* A throwaway CDP tab that opens a real game session
is a live WebSocket and a 2.5-second poll loop that outlives the script that
opened it, unless the script closes its own target when it is done. Sixty of
those took the worker down twice. Close what you open.

---

### D-071 The ambiguity gauge is a real number and had no way in

**2026-08-31.** Asked for directly: "make the ambiguity score and everything
more understandable and better." Checked what it actually measures before
touching the copy, since the number is not decorative - it is
`log2(|consistent worlds|)`, the Possible-Worlds Proof's own reporting unit
(doc 03 section 6), computed live and polled from the worker's `/concord`
route. It falls in real time as PILOT's descriptions narrow what KEEPER can be
consistent with. That is the project's actual headline claim, running during
play, and the fix was to explain it rather than to soften or hide it.

**What it lacked was a way in, not a better number.** "AMBIGUITY 1.58 bits" on
its own gives no cue for which direction is good, that it is a live
consequence of how the conversation is going, or what "bits" means to somebody
who has not read doc 03. Three additions, none of them touching the rail's own
layout - the rail has broken from added text before (D-054) and nothing here
risked that again:

- **A `title` tooltip** on the gauge, the room name and the clock, each stating
  in one sentence what the reading means and, for the gauge, which direction is
  good.
- **A ninth guided-shift beat**, "Watch AMBIGUITY drain" - the tour's own
  mechanism for pointing at one thing while dimming the rest, used for the
  first time on a HUD readout rather than a fixture or a drawer tab. It could
  not use `mark: '[data-tab="..."]'`, because the gauge is not a drawer tab, so
  `plan.test.ts`'s selector rule was widened to accept `data-tour` as well -
  the same "an attribute is a promise, a class name is not" reasoning the
  original rule gives, extended to a second stable target rather than loosened
  in place.
- **A durable paragraph in the Station panel**, for anybody who skipped the
  tour or wants the definition again mid-session without hovering.

**Verified against a browser that could actually reach the beat.** The first
verification pass ran against the wrong headless instance - the one launched
without WebMCP flags, for testing the gate screen - and reported `.solo` as
missing, which was correctly the gate screen showing no start flow at all, not
a defect. Caught before it was reported as one, by checking which browser was
actually being asked. Re-run against a browser that could reach the landing
screen: the tooltip attributes are present, the tour advances to "5 of 9" and
spotlights exactly the gauge, and 27 of 27 browser checks pass unaffected -
confirmed separately that the automated proof deliberately marks the tour
"already seen" before it runs, so nothing about the new beat could have broken
it silently.

**The verification browser was closed the moment it was no longer needed**,
per D-070's own lesson from three commits ago: a live game session left open
in a test browser is a live socket and a poll loop, and the fix for the CPU
spike that caused was "close what you open," not "remember to, eventually."

*One more instance of the pattern D-070 already named.* Editing live source
while the user's own tab is open triggers Vite HMR, and a big enough module
change forces a full reload rather than a hot swap - which drops `?seed=` from
the URL the same way a dead server connection does. Restored a second time,
the same way: `Page.navigate` back to the seeded URL over CDP, done and
reported. Worth writing down as its own trigger, distinct from a server crash.

747 tests, 27 of 27 browser checks, entry 41.0KB gzipped of a 400KB budget.

---

### D-072 A ceiling beam and a doorway never knew about each other

**2026-09-01.** Reported as an observation, not a hypothesis (repo CLAUDE.md
section 4): "in room one somethings are overflowing into the wall." Reproduced
it before reinterpreting it, per the same rule, and it held up - the Airlock's
south-east ceiling beam ran straight through the lintel of its own OUT door.
Queried the live Three.js scene graph over CDP for both objects' true world
coordinates rather than guessing from a screenshot, then reproduced the clash
in a plain Python simulation of `spread()` and `beams()` to confirm the exact
cause: `beams()` in `chamber.ts` places ceiling beams from a room's depth
alone, and has never known where a door stands. The two were built by
different code with no shared coordinate, so wherever a beam's own z happened
to fall inside a door's reach along its wall, it ran through the frame.

**Not only the Airlock.** Checked every room's doorway table against the same
math: the Signal Room's ring door catches a beam on both sides at once (one
`along` value shared by both walls, doc 02's own "straight through"), the
Blind Panel's east door catches every beam it has, and the Concord Lock's does
in brief mode. Four of the game's five rooms, latent since the doors moved
into the building's real openings (D-053) and beams gained no knowledge of it.

**Fixed by retraction, not by dropping the beam.** `beams()` now takes the
room's doors and pulls back whichever end would cross one, by a fixed margin
generous enough to read as deliberate rather than as a beam that got lucky.
The room keeps a ceiling everywhere a doorway is not, which a dropped beam
would not have.

**Consolidated the door's own dimensions while fixing this**, because the beam
now needs to know a door's width and reach along its wall, and that number had
three independent copies before this fix: `fixtures.ts`'s `buildDoor`,
`chamber.test.ts`'s bolt-ring check, and the one `chamber.ts` needed and did
not have. `DOOR_WIDTH` and `DOOR_HEIGHT` are now `chamber.ts`'s own exported
constants, the same pattern `MONITOR_DEPTH` already set for the Archive's
screen - three numbers that could quietly disagree the first time any one of
them changed is now one.

Two things that looked like the same bug were not. The sliver of orange still
visible near the Airlock's OUT door after the fix is the door's own copper
leaf material at a grazing viewing angle - confirmed by sampling its pixel
colour against the palette's `--copper` swatch, not by re-reading the geometry
a second time. A second orange block seen over the ambiguity gauge in one
close-up screenshot did not reproduce anywhere in the live DOM across three
independent checks (element-under-cursor, ancestor-chain walk, full-document
search for warm-coloured elements near the top of the viewport) and is
concluded to be a compositing artefact specific to headless CDP capture over
software WebGL, not a defect a player would see.

748 tests (45 in `chamber.test.ts`), typecheck and lint clean across every
workspace, palette lock holds at 20 colours, 27 of 27 browser checks.

---

### D-073 A replay with no notes was a replay with no conversation

**2026-09-01.** Reported plainly: the replay viewer "doesn't give any useful
info." Traced it to one specific, well-documented gap rather than a vague
redesign. The shared notepad's own worker code already said why: `replay.ts`'s
`case "pilot_action"` carried a comment explaining that a `write_note` event's
`target` field holds the author, not the line, so "the beat says a note was
written and not what it said." The reducer's internal `write_note` action
already carries the note's `text` at the exact point the event is built
(`reducer.ts`); it was simply never assigned to the event. The client's
`Replay` interface did not even declare a `notes` field to receive one.

**The pair's own writing to each other is described in this project's own
design docs as the most valuable thing in the log**, and it was the one thing
missing from a viewer built to show what happened. Threaded the note's text
the whole way: an optional `text` field on `PilotActionEvent` (`log.ts`,
present only when `action` is `"write_note"`, documented as `SHARED`-channel
by construction and therefore carrying none of `state_delta`'s risk to a
shareable replay URL), populated at the one call site that already has the
line (`reducer.ts`), routed into the worker's `notes` array instead of the
generic beats track (`replay.ts` - a beat reading bare "PILOT" with no text
told a viewer nothing, so a written note now gets its own line rather than an
unlabelled action), and rendered as the actual quoted line, coloured by
whichever party wrote it, in the client transcript (`replay.ts`).

**A test asserted the old, wrong behaviour on purpose** ("logs the author
without duplicating the text", reasoning that `session.notes` was already the
text's one home) and had to be corrected rather than only the code: that
reasoning missed that `session.notes` is capped at `NOTE_CAPACITY` and evicts
its oldest lines, so an early note in a long session had no other home once
the session ended and the log is what the replay viewer reads. Renamed and
rewritten to assert the field is now present, plus a new worker-side test
that a written note lands on its own track rather than the amber one.

**Added a legend, not only the notes.** Nothing on the page taught a
first-time viewer which colour was which party without reading source - the
explanation lived only in a code comment and a screen-reader `aria-label`.
A compact key sits under the transcript now, in the same "teach it in a key,
not a panel" idiom `legendRow()` already uses elsewhere. Fitting it in cost a
layout fix of its own: the tracks' own grid cell already carries three
same-area children told apart by `align-self` alone, and a fourth item sized
to its own content collided with the two pinned to that cell's bottom edge.
Moved the key to sit with the transcript instead, in one flex column
(`.replay-column`) rather than a fifth same-cell alignment rule - settled by
normal document flow rather than by a coordinate two unrelated rules both had
to agree on, the same class of fix `apps/game/CLAUDE.md` already names for
this exact failure mode on the console's own bands.

**Verified without touching the live worker.** Rather than play a session
through four chambers to reach a real replay row in D1, intercepted the
client's own `fetch` to `/replay/:id` over CDP (`Fetch.enable` /
`Fetch.fulfillRequest`) and fed it a synthetic `Replay` payload with notes
from both parties, one of them near the 240-character cap. Measured every
element's real bounding box before trusting a screenshot, since the first
layout attempt looked identical in two consecutive screenshots for a reason
the coordinates explained and the picture did not. Confirmed the intercepting
tab was the only one closed and the worker was never touched: no live session
was ever created, so nothing here could have put the load a leftover test tab
already has twice (D-070, D-071).

748 tests, typecheck and lint clean across every workspace, palette lock holds
at 20 colours.

---

### D-074 First deployment, and a bug only a real deployment could show

**2026-09-01.** Asked directly: prepare Cloudflare deployment at a subdomain of
`ahmedxsaad.me`, named `semaphore.ahmedxsaad.me`, and confirm it actually works
once deployed. The stack was designed for this from D-005 onward but had never
been deployed at all - `wrangler whoami` found an authenticated account and
`wrangler deploy --dry-run` had never been run against it before today.

**What is live.** The worker, at `https://semaphore.ahmedxsaad.workers.dev`
(the default `workers.dev` subdomain: no DNS footprint needed for an API
nobody browses directly, and it is what `ALLOWED_ORIGINS` and
`VITE_WORKER_ORIGIN` both point at). Two Cloudflare Pages projects, `semaphore`
(the game) and `semaphore-archive` (the second origin D-033 needs), both
building from the same `dist/` output this repo already produces and both
deployed to their production branch. The production D1 database
`semaphore-sessions` had only migration `0001` applied since its provisioning
on 2026-08-27; `0002_deep_linked.sql` was missing, so `deep_linked` did not
exist on the live schema until this session applied it. `VITE_ARCHIVE_ORIGIN`
is set to the custom domain, not the `.pages.dev` fallback, so the shipped
build already asks for cross-origin delegation rather than the same-origin
path - the production configuration the project actually wants, not a
placeholder.

**What is not, and why not from here.** Both custom domains
(`semaphore.ahmedxsaad.me`, `semaphore-archive.ahmedxsaad.me`) are registered
on their Pages projects and both answer `CNAME record not set`. Wrangler's own
OAuth token, confirmed via `whoami`, carries `zone (read)` but no
`dns_records` scope of any kind - not even read. Creating the two CNAME
records is the one step in this deployment that could not be done from this
session; exact records are in `NEXT-STEPS.md` item 7.

**A production-only bug, found by actually deploying rather than by reasoning
about the config.** `apps/game/public/_redirects` carried `/replay
/index.html  200` since D-060, verified only under `vite preview`, which had
never been the same code path as a real Cloudflare Pages deployment. On the
actual edge, requesting `/replay?id=...` came back a bare `308` to `/?id=...`
- the query string survived, the path did not, and the ending's own replay
link would have landed every visitor on the landing screen instead. Isolated
with a disposable one-file Pages project (`redirects-probe`, deleted after)
that proved the rewrite's *target* was the cause: `/index.html` as a
destination resolves through the same clean-URL canonicalisation that turns
`/index.html` into `/`, and that canonicalisation's redirect was not staying
internal to the rewrite. `/replay  /  200` - target `/`, not `/index.html` -
fixed it, confirmed by curl against the live deployment before touching
anything else. Nothing in the test suite could have caught this: it is
Cloudflare's own edge routing, which does not exist until something is
actually deployed to it, which is the whole argument for the repo's own rule
that the game is the test, extended one layer further than a browser.

**The cross-origin proof was re-run against the live stack, and two of its own
checks failed for a reason that turns out to be the test's, not the product's.**
Run with `WORKER`/`GAME`/`ARCHIVE` pointed at the deployed `.workers.dev` and
`.pages.dev` origins: the registry lifecycle, `fromOrigins` visibility, the
Airlock, a door walk-back, the Signal Room and the Archive beat's tool
appearing on the correct origin and nowhere else all verified clean against
the real worker's Durable Object over the actual internet, not local
`workerd`. The two checks that invoke a delegated tool by CDP frame id failed
with `No frame for given id found`. Diagnosed rather than dismissed: a direct
`Page.getFrameTree()` query mid-session showed the archive iframe correctly
set in the DOM (`src`, `allow="tools"` both right) but absent from
`childFrames` entirely, and `pages.dev` is a public suffix - two different
`*.pages.dev` subdomains are different *sites* under Chrome's site isolation,
so the archive frame becomes an out-of-process frame this script's plain
`Page.getFrameTree()` call cannot see without `Target.setAutoAttach`.
`semaphore.ahmedxsaad.me` and `semaphore-archive.ahmedxsaad.me` share one
registrable domain and should not trigger this once DNS is live - the same
reason `localhost:5173` and `localhost:5175` never did in every prior local
run of this exact proof. Left as the first thing to re-check once the DNS
records land (`NEXT-STEPS.md` item 7), rather than patched into the test with
`Target.setAutoAttach` on a hypothesis not yet confirmed against the real
domains.

**Verification used no local session state and touched no running server
this checkout depends on.** All browser-side checks ran in disposable headless
Chrome instances on their own debugging ports, closed the moment they were no
longer needed (D-070's lesson, still holding); the throwaway `redirects-probe`
Pages project was deleted after use; nothing here touched the local `wrangler
dev` or the user's own browser tab.

748 tests, typecheck and lint clean across every workspace, palette lock holds
at 20 colours, worker and both Pages projects live and smoke-tested.

---

### D-075 The DNS records landed, and the OOPIF hypothesis held

**2026-09-01.** The two CNAME records D-074 was waiting on were added to the
`ahmedxsaad.me` zone. Both custom domains show `status: active` on their Pages
projects, and both serve the deployed apps directly.

**The cross-origin delegation proof was re-run against `semaphore.ahmedxsaad.me`
and `semaphore-archive.ahmedxsaad.me` rather than their `.pages.dev` fallbacks,
and all 27 checks pass, including the two that failed under `.pages.dev`.**
Confirms D-074's diagnosis exactly: `pages.dev` is a public suffix, so the two
`.pages.dev` origins were different *sites* under Chrome's site isolation and
the archive frame became an out-of-process frame a plain
`Page.getFrameTree()` could not see; `semaphore.ahmedxsaad.me` and
`semaphore-archive.ahmedxsaad.me` share one registrable domain and behave
exactly like `localhost:5173`/`localhost:5175` always did. Nothing in the
product needed changing - only the origins the test was pointed at - which is
the outcome the hypothesis predicted rather than a fix arrived at by trial.

The full loop is now proved against the live worker and both live Pages
projects on their real domains: the registry, the Airlock, a door walk-back,
the Signal Room, `read_manual` and `read_station_log` both crossing origins
and returning real content, the Archive beat, the Concord Lock, the finale,
the registry draining to empty on both origins, and the ending's replay link
pointing at `https://semaphore.ahmedxsaad.me/replay?id=...` - the real
domain, not a fallback. Deployment is complete and nothing remains open on it.

---

### D-076 The ending stopped rather than ended, so the shift is graded now

**2026-09-01.** `ESCAPED` drew one sentence and a replay link. No time, no
score, no breakdown, nothing to compare or take away. A session that stops is
not a session that ends, and doc 08 phase 3.2 had already asked for "and only
then offer the stats" - the stats were the half nobody had built.

**Options.** (a) Leave it and spend the last days playing. (b) Add a report on
the ending. (c) Add a report and a public leaderboard off the D1 corpus.

**Chosen: (b).** Every number needed already existed inside `projectReplay`,
which the ending's own link already points at, so the whole feature is a pure
function and a card. The leaderboard was dropped for the deadline rather than
on merit: nothing is public before the freeze and an empty board is worse than
none.

**Three marks, not one score.** The game is two people holding different
halves of a room, so a single number would silently be a score for whichever
half the formula happened to measure. **Pace** is the pair's, against the par
clocks the rooms were designed around. **Precision** is KEEPER's, from
`wasted`, which is the one logged field that separates an agent that reasoned
from one that pressed keys until something worked. **Resolve** is the pair's
again: deadlocks taken and intercom calls spent.

**Notes written are reported and deliberately not graded.** It was the obvious
third axis and it is the wrong one: two people in one room talk out loud and
write nothing, and marking them down for the most natural way to play the
game would be the metric punishing the player for the metric's convenience.
`report.test.ts` moves each of the three axes on its own and asserts only that
mark moves, because this project has already built and deleted two metrics
that did not separate what they claimed to.

**The card is additive and never destructive.** The D1 write swallows its own
failure on purpose (doc 07 section 3.1), so the row can legitimately never
arrive. Two retries, and then the ending is exactly what it was before this
existed.

`projectReplay` also carries the deadlocks now. Without them a run that
stalled twice graded identically to a clean one.

---

### D-077 The room never said what it was for

**2026-09-01.** The console showed a room name, a clock and a set of facts,
and never once said what any of it was *for*. KEEPER at least had
`describe_chamber` and the manual. PILOT had nothing equivalent, so the first
minute in a new room went on working out what the game was asking rather than
on playing it.

**`objective.ts` holds one authored line per chamber.** Authored rather than
derived, for the reason `Note` gives for itself: a constant with nothing
interpolated into it has no channel for a projection to strip, and the
cheapest way for a goal line to start leaking is for somebody to interpolate a
count into it. None names a glyph, and the test says so.

**`progressIn` reads keys off whatever projection it is handed** and answers
null for a key that is not there. PILOT's frame gets "needles on mark" and
KEEPER's `get_status` gets "rotations made", from one function, and neither
can reach the other's half because neither projection contains it. That is the
safety argument in one sentence instead of two lists that have to be audited
against each other.

**`total` is nullable, and that is a puzzle decision.** The Signal Room's
sequence length is a function of which glyphs this session drew, so publishing
"3 of 4 keys" would hand both parties the answer in a different shape. It
counts up and never says how far it has to go.

**Placed in the rail on a row of its own.** Not beside the room name, which
already ellipsises below 800px. Not as a sixth band over the viewport either:
five things are absolutely positioned there, each has to be told which edge it
owns, and that arrangement has produced four separate defects. Hidden rather
than blank outside a chamber, so the rail is one row again at `ESCAPED`, which
is the height the ending strip's top padding is measured against.

---

### D-078 A stalled pair had one exit, and it was the clock running out

**2026-09-01.** Sitting in silence watching a timer drain is not difficulty.
It is dead air, and it is the one failure state in this game that teaches
nobody anything.

**Options.** (a) Nothing: stalling is the cost of an asymmetric game. (b) A
free hint button. (c) A costed, capped, escalating intercom that both parties
hear.

**Chosen: (c).** (a) leaves the most likely bad session unimproved. (b) is the
one that would actually damage the game, and not because it is easy: a hint
delivered to KEEPER alone hands one party the other's half of the room, which
is the single class of change this project never accepts.

**Three decisions are what make it a mechanic rather than a cheat button.**
Both parties hear it, so the split survives. An empty shelf is free, because
charging for silence makes the fourth press a punishment for having asked
three times. And it refuses rather than ending the room: asking with less than
the price left on the clock takes nothing and says so, instead of
half-charging or deadlocking the pair the instant they reach for help.

**The lines say nothing the manual has not already established.** That is the
constraint that was easy to lose. The Blind Panel's page mentions inverted
linkages and says nothing at all about the cross-link, so neither does its
third line. An assist is the previous keeper being helpful, not the designer
breaking cover.

`chime` rather than a ninth cue: the synth table stays shut, and that sound
already means "the station accepted that".

**The ablation and the benchmark were re-run and came back byte-identical**,
which is the check that this left the run's random stream alone.

---

### D-079 Five defects, and the tests were green for all of them

**2026-09-01.** One browser tour and two frames read at 390px, against a
suite that had just gone green at 788.

**The intercom never reached the session log.** It wrote its audible event and
no `tool_call`, so the report read "0 intercom" on a run that had just used
it, the replay drew nothing on the cyan track, and the benchmark corpus would
have recorded a pair that asked three times a room as identical to one that
never asked. Found by the tour asserting a number, not by a unit test
asserting a shape.

**The report card was auto-placed at the bottom of the replay page.**
`.replay` is a named-area grid, and a child with no `grid-area` lands in an
implicit row after every named one - two thousand pixels down, below the
transcript. **And `.replay-head` had two rules six hundred lines apart**, the
later `display: grid` winning the tie on source order, so the flex row the
layout asked for never existed at all. That is the third time this file has
done exactly that, and the second time in this session.

**The share row and the report wanted the same corner**, printing a URL box
through "SHIFT REPORT".

**The objective's live half was the half a phone cut.** One nowrap line with
the reading at the end ellipsises "BOLTS ALIGNED 0/3" and keeps the sentence,
which is precisely the fault already on record against the room name one row
above it. And the intercom panel was edge-to-edge at 390px, because
`--rail-width` is `auto` below 46rem and `calc(auto + 1rem)` is not a length,
so the whole declaration was being dropped.

**Local D1 was two migrations behind and nothing had ever noticed**, because
the only writer swallows its own failure on purpose. The report card is the
first thing that ever reads that row back on the ending screen, so it is the
first thing that could surface it. Worth stating as a general point: a write
whose failure is deliberately silent stays broken until something reads it.

Tour is at 34 checks. Three of them are new and one exists only because the
first run of it reported "0 intercom".

---

### D-080 The proof is a package now

**2026-09-01.** The channel model, the projector and the possible-worlds proof
were never about levers and dials. They are `packages/asymmetry`: zero
dependencies, a CLI that prints the bits table and sets an exit code, and one
worked example that is a support console rather than a game.

**Options.** Leave it in place and describe it in the README; extract it as a
package; write a separate library from scratch.

**Why extract.** Doc 01 section 4's tier-1 Impact claim - *an agent's tool
surface and a human's UI surface do not have to be the same surface* - is the
one tier a judge cannot reject, and it cost nothing because it was only a
sentence. A judge asking "does this solve a real problem for a real audience"
got a game and a principle. They now get a CI-able check for *can my agent's
tool surface reconstruct something I only meant to show on screen*, which is a
problem real teams have now and nobody is measuring. It was also the smallest
of the three code items, because the hard part was written and tested.

**Result.** `packages/protocol` and `apps/worker` are the game's *binding* of
the kit: our five channels, our two parties, our chambers. One implementation
still, one directory further down. `packages/CLAUDE.md`'s rule that
`consistentWorlds` has one implementation and three consumers is unchanged and
now has a fourth: somebody else's application.

The example ships correct and turns red under `LEAK=1`, which adds the
convenience field a refactor always adds - a summary line carrying the address
inside a sentence. That is the regression a hundred green unit tests do not
see, and watching the exit code flip is the whole pitch.

`allowImportingTsExtensions` moved to `tsconfig.base.json`. A package consumed
from source is compiled under its *consumer's* configuration, so a flag in the
package's own tsconfig does not reach it.

---

### D-081 The Blackout, and where the proof said it could live

**2026-09-01.** For one window in the Blind Panel the lamps fail and the two
roles trade places. KEEPER can see the gauges and cannot find the dials; PILOT
is standing at the panel in the dark with their hands on them.

**Doc 01 section 6 scoped role inversion out as "compelling, expensive".** It
is neither, once the asymmetry is a perception model rather than a convention.
`INVERTED_PERCEPTION` is the design law with its two lists exchanged
(`invert()` in the kit), and every projection in the worker takes the model it
projects under. The beat is a window, a flag, and one honest question.

**Where it lives was measured, not chosen.** Running the possible-worlds
measurement under both maps, at chamber entry, over the proof's own seeds:

| Chamber | Under the law | Inverted |
|---|---|---|
| 0 Airlock | 6 worlds, 3 actions | **1 world, 1 action** |
| I Signal Room | 1956 / 1956 | **0 worlds** (not even spanned) |
| II Blind Panel | 384 / 384 | **384 / 384** |
| III Concord Lock | 26 / 26 | **1 world, 1 action** |

Three of the four collapse: their secrets live on `VISUAL`, so handing
`VISUAL` to KEEPER hands KEEPER the answer. The Blind Panel does not, because
its secret is on **neither** channel - inverting a two-party model exchanges
two lists and cannot invent a channel neither list names. The room is exactly
as hard from the other side, which is a stronger claim than "it still works".

The proof now runs a third pass under the inverted map, and it asserts the
other three *collapse* as well as that the Blind Panel holds. That second half
is a guard on the placement: if a later change made the Airlock survive
inversion, a `VISUAL` fact has stopped being decisive there and somebody should
find out on purpose rather than by discovering the beat had become portable.

**Swapping perception alone would have handed the agent the game, and a
per-state proof cannot see it.** The proof measures one instant; this chamber
is solved by system identification over a trajectory. An agent that could see
the gauges and still had the dials would rotate and watch, alone, and need
nobody - with every clause of the proof green. So the Blackout inverts
**agency** as well: `rotate_dial` leaves KEEPER's registry for the duration and
PILOT gets the panel through a plain route, never a tool, exactly as `grip_bar`
is. That is a `toolchange` firing *inside* a room rather than at its boundary,
which nothing else in the game does.

**Off in the benchmark**, for the reason doc 07 section 2.3 turns the CONCORD
meter off there: the Standard suite measures what an agent infers from its own
projection, and a beat that moves the hands to the other party mid-chamber is
not a partner quality it has an axis for. Ablation and benchmark re-run
byte-identical.

**One bug worth recording.** The first build shipped with
`INVERTED_PERCEPTION` missing from the protocol's barrel export, so every
inverted projection fell back to the design law through a default parameter and
every measurement came back identical. Nothing failed. A default that swallows
a missing argument needs a check that reads the result back - the same lesson
D-079 records about a silent write - and `blackout.test.ts` now asserts the two
models actually differ.

---

### D-082 The station became a place you can hear

**2026-09-01.** The audio layer was well built and it was not a room: every
voice arrived at the centre of the head at the same distance, in a game whose
whole subject is perceiving a room well enough to describe it out loud.

**Spatialised.** Cues come from the room's mechanism, KEEPER's thump from the
east wall where the body is drawn, and the listener follows PILOT every frame.
Coordinates are normalised room units rather than metres, so the audio layer
never imports `render/chamber.ts` - eighteen hundred lines of geometry landing
in the entry chunk to place four sounds. Placing a voice is handing it a
different `sfx`, built with `Object.create` rather than a spread so the live
`mix` getter survives.

**Why it is not decoration.** `AUDIBLE` is the one channel both parties
perceive and doc 02 section 6 already says it is *rendered differently to each*:
as sound to PILOT, as text to KEEPER. Direction is a property sound has and
text does not, so spatialising it widens what PILOT can contribute without
moving a byte across the projection boundary.

**Per-room acoustics.** One fixed impulse response made the station one room.
The convolver is built from the room now. The Blind Panel is the driest place
in the station, which matters mechanically: it is where a count has to be
picked out of the reverb.

**The tool notes are authored.** The pitch came from `hash % 11 * 7` Hz, which
is uniform over the *name* and not over the ear: two tools alive in one room
could land indistinguishably close, and none of it was in the theme's key. The
table is written now and `plan.test.ts` holds tools registered together at
least a minor third apart - compared in whole semitones off the table, because
the round trip through hertz lands a written 3 on 2.9999999999999996 and a test
that fails by rounding gets a constant nudged rather than believed.

**The score is scored in bits.** The theme resolves on the CONCORD reading and
nothing else. `THEME_GROUND` is an open fifth on the tonic because it
introduces no new pitch class and so cannot smuggle back the leading note or
the second the theme is deliberately written without. Null bits resolve
nothing, which is what the benchmark sees.

The panner is `equalpower` throughout, and that is a decision: HRTF colours what
it pans, and Chamber II's detent is a transient that is a puzzle mechanism. It
is also markedly cheaper per source, which matters where the open question is
the in-app browser on a phone.

---

### D-083 The gate shows the asymmetry, not just the game

**2026-09-01.** The gate and the landing screen played a recording of the room.
Doc 07 section 6 says that screen is the entire submission for a judge who
never types anything, and it showed the game working without once showing what
the game is about.

It draws the same recording twice on one clock now: the room as PILOT saw it
beside the same second as KEEPER perceived it - the calls it was making, and a
dashed hole reading NO VISUAL CHANNEL where the room would be.

**`/ghost` carries both halves and is the one place in the repository that
hands out both projections at once.** Safe because nobody is playing: no
session behind the route, no pair for either half to reach, and the fixture's
seed was spent when it was authored. In a live session it would be the worst
change anybody could make, so `archive.test.ts` asserts in both directions that
`pilotTrack` and `keeperEntries` themselves are untouched.

Still a 2D context, so the gate never fetches the 143KB engine.

**Found by looking at it.** The two scrub bars measured against different
denominators and sat visibly apart on screen - the picture quietly saying these
were not the same moment, which is the one thing it exists to say they are.

---

### D-084 The tour plays the Blackout, and found the beat had no voice

**2026-09-01.** The browser tour's Chamber II script posted `rotate_dial` and
stopped working at rotation five. That is the honest signal that the Blackout
is real rather than cosmetic: a KEEPER-only script cannot finish that room any
more.

It plays it now, as a pair does - asks KEEPER what it reads out of
`describe_chamber`'s prose, and posts `pilot_rotate_dial` itself. Six new
checks, and the frame.

**And it found the last defect.** The lamps failing was announced only inside a
console drawer that is closed by default. A player would have watched the room
go dark, watched the gauge bank stop being drawn, watched their agent start
describing needles it had never been able to see, and had to guess whether that
was a beat or a bug. It is in the caption band now - the one thing that band
says from inside a room rather than between two.

One check had to be rewritten after it fired: "the lamps came back" asserted
the state at the end of the room, and a pair can perfectly well finish the
Blind Panel during the window or on the rotation right after it. A beat that
only sometimes has an "after" has to be observed while it is running.

Tour is at 42 checks, fifteen frames.

---

### D-085 The live site threw before it drew: a registry that is not an EventTarget

**2026-09-01.** `https://semaphore.ahmedxsaad.me/` reported one console error
and no station: `TypeError: t.addEventListener is not a function`, thrown out
of `onToolChange` during startup.

The adapter's feature detection asks for `registerTool` and `getTools`, on the
reasoning that a host exposing the property without the methods exists in the
wild. It does; so does the next one along. This host has both methods on a
plain object that is not an `EventTarget`, so it passed detection, took the
playing branch, and died on `addEventListener("toolchange")` before
`startStation` ever returned. The whole page, not just the manifest.

Options: tighten `getModelContext` to require the listener pair, which is a
smaller diff and takes the game away from a browser that can perfectly well
play it; or treat the event as the optional part of the surface, which is what
it is. Second one.

`ModelContext` no longer extends `EventTarget`: the pair is declared optional
and `onToolChange` returns the no-op unsubscribe when it is missing, the same
answer it already gave for a browser with no registry at all.

That leaves such a host with no signal that the registry moved, and KEEPER's
body and the manifest plate would have frozen on the tools of the first room.
`setState` refreshes them too now. A tier change is the other thing that moves
the registry, and it arrives on a channel every host has.

Test in `adapter.test.ts` alongside the no-registry one: both methods present,
no listener pair, still supported, still does not throw.

---

### D-086 D-085's substitute signal fired at the wrong moment, and on the wrong schedule

**2026-09-01.** A review of D-085 before it reached the live site, not a second
production report. Two problems in the fix, both in `setState`'s new call to
`refreshTools`.

**Wrong moment.** `station.setState` is wired to the director's `onState`
hook, and `#applyState` calls that hook as its very first line, before it
computes the tier the state implies and before any of that tier's
`registerTool` or abort calls have run. `refreshTools` read the registry
*before* the transition it was meant to report, not after. On an `EventTarget`
host this was invisible, because the real `toolchange` fired later and
corrected it. On the host D-085 exists for, nothing corrects it: the manifest
and KEEPER's body showed the *previous* room's tools for as long as the
player stood in a new one with nothing yet called in it, and on the session's
last state - `ESCAPED`, `endSession()` - nothing ever fires again, so the
registry never visibly drained on exactly the beat doc 08 says may never be
cut.

**Wrong schedule.** `onState` fires on every response, not on every tier
change - `#applyState`'s own docstring says as much. `setState` calling
`refreshTools` unconditionally meant a fully compliant `EventTarget` host,
the common case, now paid for a `getTools()` round trip and a full render on
every tool call, duplicating what `toolchange` already did correctly whenever
the registry actually moved.

Both trace to the same cause: the fix was placed in `setState`, which fires on
the wrong event for what it needed to know (a tier change, not a state push),
because that event is easy to reach from a renderer file and the right one is
not.

Moved the decision to where it belongs. `ToolDirector` already computes
`sameTier` to decide whether to register or tear down anything; a new
`onRegistryMoved` hook fires once, from `#applyState`, after the switch that
does that work has resolved - so it fires only on a genuine tier change, and
only once that change is actually reflected in the registry. `station.ts`'s
`setState` goes back to only setting state. `main.ts` wires the hook to
`station.refreshTools()`, alongside the one direct call site
(`director.mountEntry()` at boot, which does not run through `applyState` and
needs its own explicit refresh for the same reason).

Two more found alongside it, both narrow. `refreshTools` had no protection
against two calls racing: with the registry now read from three places
(`onToolChange`'s listener, `onRegistryMoved`, the archive frame's own
callback) an earlier call's promise could resolve after a later one's and
overwrite fresher data with stale. A sequence number fixes it: only the most
recently *started* call's result is ever applied. And `onToolChange` required
only `addEventListener`, so a host offering that much but not
`removeEventListener` would subscribe successfully and hand back a teardown
with nothing to call - both methods are required now, and both the
subscribe and the unsubscribe are wrapped so neither can throw, matching this
module's own stated contract that no function in it does.

`listToolNames`'s retry path had the same gap one level down: the fallback
`await mc.getTools()` could itself reject, and nothing caught that second
failure. Wrapped.

Three new tests: `onRegistryMoved` fires once on a real tier change and not on
a repeat (`director.test.ts`), and in `adapter.test.ts`, a host with
`addEventListener` and no `removeEventListener` never subscribes, and a host
whose `addEventListener` throws on an event it does not recognise still does
not throw.

---

### D-087 The repository, made ready for a judge to actually read

**2026-09-03.** Asked directly, on submission day: make the repository itself as strong a
document as the game is. Four things, each with a real trade-off decided rather than assumed.

**The twelve-document `docs/design/` set consolidated into two.** `ARCHITECTURE.md` (the
machinery) and `DESIGN.md` (the game and the thesis) replace it, brought up to date with what
actually shipped rather than what was planned before the build - Phaser became Three.js, R2
became D1, `ARCHIVE_ORIGIN` moved from `same` to `cross` in production, and four features built
after the design set was last touched (the shift report, room objectives, the intercom, the
Blackout, the extracted `@semaphore/asymmetry` package) needed describing for the first time.
**What did not happen:** a rewrite of the roughly two hundred `(doc NN section X)` citations
scattered through this codebase's own comments and `CLAUDE.md` files. At that count, a blind
regex sweep risked degrading prose this project has spent real care on, for internal citations no
judge will read; the honest, proportionate fix left in place is that git history resolves every
one of them precisely, the same way any citation to a superseded document ages in a real
codebase. What *did* get fixed by hand: every place the old path appeared as a live link rather
than a historical citation - the README, three `CLAUDE.md` files, and `NEXT-STEPS.md` - plus one
substantive correction the read surfaced: `apps/archive/CLAUDE.md` still said cross-origin
delegation was unverified and defaulted to `same`, which had been true in local development and
had stopped being true the moment D-074/D-075 verified and deployed it.

**The README rewritten as a landing page rather than a container for everything.** Live URL and
the starter prompt above the fold, the four chambers at a glance, the ablation kept, links out to
`ARCHITECTURE.md` and `DESIGN.md` for depth rather than absorbing their content - the option this
project's own house rule ("keep docs short") argued for over a single exhaustive document.

**Four community-health files added**: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
(Contributor Covenant 2.1), `CHANGELOG.md` as the milestone-level reading of the decision log
rather than a duplicate of it. Plus `.github/ISSUE_TEMPLATE/` and a pull request template.

**`LICENSE` restored to the unmodified MIT template.** It had carried the typeface carve-out
appended below the licence text since D-068, which is exactly what breaks GitHub's own license
detector: the About section had been reading **Other** rather than **MIT** ever since, silently
failing a starred item on this project's own release checklist. The carve-out prose moved to
`NOTICE.md`, unchanged in content, linked from the README's licence line.

**The `.claude/` folder removed from the tracked repository**, at the user's explicit request.
The one file it held, `settings.json`, was the mechanism enforcing "no AI attribution in commits"
for the whole team (repo `CLAUDE.md` section 7) - removing it from the repo does not undo any
commit already made under it, but the rule is no longer shared automatically with a fresh
checkout. Worth a line in the log because it is a real trade-off, not a pure cleanup.

**One finding this pass could not fix.** `gh api` against this repository returns
`"permissions":{"admin":false,"maintain":false,"push":true}` for the authenticated account -
enough to open and merge a pull request, not enough to `PATCH` the repository's own description,
topics, homepage or social-preview image, all of which 404 rather than 403 on the attempt. Those
need the account with admin or maintain access. **More urgently: the repository itself is still
private** (`"private":true`), which the challenge's own rules require it not to be, and
`NEXT-STEPS.md`'s own "Waiting on" table already recorded this as deliberately deferred to just
before the deadline. Today is the deadline. Flagged directly rather than assumed handled.

Unaffected, and reverified after every change in this entry regardless: none of the above touches
shipped code. 863 tests, clean typecheck across all eight workspaces, clean lint, clean build.

---

### D-088 CLAUDE.md and AGENTS.md removed, the law folded into the docs that already existed

**2026-09-03.** Asked directly to remove all fourteen `CLAUDE.md` files (root plus one per
directory) and their `AGENTS.md` symlinks from the tracked repository. Asked first which of three
things "get rid of" meant, since the files carry real engineering content - the asymmetry law,
code and git conventions, deployment operating rules, per-directory rendering and audio law -
rather than only process scaffolding: delete outright, fold the substance into `CONTRIBUTING.md`
and `ARCHITECTURE.md` then delete, or keep it as a new standalone `ENGINEERING.md`. Chosen: fold
and delete.

**What moved where.** `CONTRIBUTING.md` gained the workflow rules (ask before assuming scope, the
game is the test, a report of what someone sees is an observation not a hypothesis, update
`NEXT-STEPS.md`), the formatting rules (no em dashes, no emoji, English throughout), the full git
conventions, and the pure-decision/impure-execution split this codebase repeats in `chamber.ts`
versus `stage.ts`, `audio/plan.ts` versus `voices.ts`, and `tutorial/plan.ts` versus `tour.ts`.
`ARCHITECTURE.md` gained the deployment operating rules (preview deploys per PR, secrets never in
a tracked file, no Cloudflare product requiring a payment method), a Rendering and audio section
condensing the cutaway-camera and four-light law, a Measurement section for the ablation and
Cooperative Benchmark's own design discipline (the solo condition as a ceiling not a sample, a
scripted partner modelled as what its description left behind, a metric that does not vary gets
deleted rather than published), the WebMCP tool-tier-table and `fromOrigins` rules, and an explicit
statement of the proof-gate-never-weakened rule the Testing section only implied before.

**What was dropped rather than moved.** The renderer and console's accumulated bug-fix lessons -
caption sizing, CSS source-order gotchas, "hidden means gone not small," the specific defects each
playthrough found - are not architecture, they are a maintenance journal, and `NEXT-STEPS.md`'s
own "Things that will bite you" section already carries the same lessons nearly verbatim. Folding
them a second time into `ARCHITECTURE.md` would have bloated the document judges are meant to
actually read for no reader who does not already have `NEXT-STEPS.md` open. Per-directory trivia
the code itself already shows ("this origin registers exactly two tools") was dropped outright.

**Every live markdown link retargeted**, the same sweep this repository ran for `docs/design/` in
D-087: the README's repository map, `SECURITY.md`, the pull request template, and two prose
mentions in `NEXT-STEPS.md`. The roughly thirty remaining citations sitting inside code comments
(`// per the repo CLAUDE.md section 3`) are left as historical pointers for the same reason
D-087 gave and did not repeat here: git resolves them precisely, and no judge reads them.
`docs/decision-log.md` and `docs/lessons-learned.md` keep every reference exactly as written,
because both are explicitly append-only history that is never rewritten to match a later state of
the repository.

**A cost worth stating plainly rather than glossing over.** `CLAUDE.md` was not only documentation
- it was the operating manual this session and the last several read at the start of every turn
to know the repository's own rules, including the rule that produced this very sentence. Removing
it does not undo any decision already made under it, and the substance survives in
`CONTRIBUTING.md` and `ARCHITECTURE.md`, but a future session (agent or human) starting cold now
has to find the law in prose documents rather than in the file convention built to serve it to
them automatically.

863 tests, clean typecheck across all eight workspaces, clean lint, clean build - none of this
touches shipped code.

---

### D-089 Two diagrams and seven screenshots, against the live deployment

**2026-09-03.** Two SVG diagrams added under `architecture/`, and a curated set of seven
screenshots added under `screenshots/`, both linked from the README and the two consolidated
design documents.

**The first pass at the diagrams was rejected, correctly.** Six per-channel arrows curving into
two projection boxes read as spaghetti the moment it was rendered rather than only reasoned about,
and box interiors carried three and four lines of description each - dense in the way a real
architecture diagram never is. Told directly: too much text, not beautiful, not professional.
Rebuilt from scratch on a different premise: one bold label per box, at most one short caption,
one clean arrow per relationship rather than one per fact it carries, generous whitespace, the
game's own twenty-colour palette rather than a generic diagram theme. Every version was rendered
and looked at before being called finished - the same rule this repository already has for its own
renderer, applied to a diagram instead of a room.

**Every screenshot in `screenshots/` is from the live deployment, not local development**, and
five of the seven came from `tests/cross-origin-delegation.ts`'s own screenshot tour run with
`SHOTS=<dir>` against `semaphore.ahmedxsaad.me`, rather than hand-driven capture - the same
instrument the project already trusts to verify a rendering change gets the credit for illustrating
one. That run also re-confirmed 42/42 checks against production before a single frame was chosen.
The landing screen and the shift-report card were captured separately, since the tour's own run
starts mid-session and does not pass through either.

**Curation dropped near-duplicates rather than keeping every captured frame.** Fourteen frames
came out of the tour; seven were kept. Two ending frames differed only in which line of ending
narration was on screen at the moment of capture, and the original `01-airlock.png` was replaced
by `02-intercom.png` in the final set, the same room a few seconds later, once the station
intercom panel was open on screen - a more informative frame of the same chamber rather than a
second one.

Nothing in either addition touches shipped code. 863 tests, clean typecheck across all eight
workspaces, clean lint, clean build, and every markdown link and image reference checked to
resolve to a real file or a real heading.
