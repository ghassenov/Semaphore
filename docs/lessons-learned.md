# Lessons Learned

A running journal. Append as we go: what we found out, what it cost us, what we would tell someone starting this project tomorrow.

This is deliberately separate from the other documents. [decision-log.md](decision-log.md) records **decisions and their reasoning**. [11-spec-notes.md](11-spec-notes.md) records **empirically observed browser behaviour**. This file records **everything else we learned the hard way**, including things that turned out to be wrong, dead ends worth remembering, and feedback on our own process.

Newest entries at the top of each section. Every entry is dated.

---

## Platform and hosting

### 2026-08-28 - Pick a free tier on its rate limits, not its storage headline

Having established that R2 needs a card, the first replacement we reached for was Workers KV, because 1 GB of storage looked like plenty. That was reading the wrong number off the table.

| | DO SQLite | Workers KV | D1 |
|---|---|---|---|
| Stored data (free) | 5 GB | 1 GB | 5 GB |
| **Writes per day (free)** | 100k rows | **1,000 keys** | 100k rows |
| Reads per day (free) | 5M rows | 100k keys | 5M rows |
| Queryable across records | No | No | Yes, SQL |

KV has the second-largest store and by far the smallest write allowance: **1,000 writes per day**. One write per finished session sounds fine until you remember a benchmark sweep is three backends times twenty seeds times retries, which is a few hundred sessions in an afternoon, and the ablation adds more. We would have hit the wall during the one activity the whole Impact argument depends on, and the failure mode is silent data loss at 00:00 UTC boundaries.

The general lesson: **for anything write-heavy, the daily operation cap binds long before the storage cap does.** Storage is the number vendors advertise because it is the flattering one. Work out your write rate first and read the table from that column.

D1 also turned out to be a better fit than R2 had been, which is the part worth remembering. The benchmark wants questions like "every session on seed 7 across all backends", which against an object store is a list-and-fetch loop and against D1 is one query. We were going to end up building an index over R2 objects; D1 is that index with the data already inside it. **Losing the obvious choice forced a better design**, which happens more often than it feels like at the time.

**Also: Cloudflare's own docs disagree with themselves, and the docs lost.** D1's pricing page lists 5 GB of stored data on the free plan; D1's limits page lists "10 GB (Workers Paid) / 500 MB (Free)". We initially sized against the smaller number. Checking the actual Cloudflare account settled it at **5 GB**, so the limits page is the stale one.

The generalisable bit is not "take the smaller number", which is what we did and it was wrong. It is: **when a vendor's own pages disagree, the account dashboard is the only authority.** Docs describe intent, dashboards describe entitlement. One look at the console beat two documentation pages and a careful reading.

Full reasoning is D-008.

### 2026-08-27 - R2 is the one Cloudflare product that demands a card

We assumed the whole Cloudflare stack was card-free. It is not, and the exception is exactly the piece doc 05 leaned on for session logs.

| Product | Free tier | Payment method required |
|---|---|---|
| Pages | Unlimited sites, 500 builds/month | No |
| Workers | 100,000 requests/day | No |
| Durable Objects (SQLite backend) | 100k req/day, 13k GB-s/day, 5M rows read/day, 100k rows written/day, 5 GB stored | **No** |
| Workers KV | 100k reads/day, 1k writes/day, 1 GB stored | No |
| D1 | 5M rows read/day, 100k rows written/day, 5 GB stored | No |
| **R2** | 10 GB-month, 1M Class A, 10M Class B, free egress | **Yes: activation requires an R2 subscription and a linked payment method** |

Two things worth remembering beyond this project:

1. **"Free tier" and "no signup friction" are different claims.** Cloudflare's marketing line ("no credit card required") is true of the developer platform generally and false of R2 specifically, because R2 activation runs a checkout flow even at zero cost. Check the activation path, not the pricing table.
2. **Durable Objects being free at all is recent and conditional.** They are on the Workers Free plan only with the **SQLite storage backend**. The older KV-backed DO class still requires Workers Paid. Our `wrangler.toml` already used `new_sqlite_classes`, so we were accidentally on the right side of this. Anyone copying an older DO tutorial would not be.

Resolution is D-006, amended by D-008: session logs live in DO SQLite while a session runs and are written to D1 when it ends. R2 stays out of the build. The property doc 05 actually cared about, that one artifact is simultaneously the replay source, the benchmark corpus and the Archive's ghosts, is a property of the **log format**, not of the storage product. That was worth noticing before writing an R2 binding.

---

## The WebMCP specification

### 2026-08-27 - Two of our three disputed spec claims resolve against doc 03

Read directly from the W3C draft IDL rather than from memory. Both corrections matter, and one of them invalidates a sentence we had written into our own architecture document.

**`execute` receives two arguments, not one.** The callback signature is `(object inputObject, ToolExecuteCallbackOptions options)`, and `options` carries `required AbortSignal signal`. Doc 03 section 1 lists "execute receives a single argument" as a high-confidence claim. It is wrong.

**`requestUserInteraction` does not exist.** The second argument is not an agent handle. It contains a cancellation signal and nothing else. So the conditional plan in doc 02 section 3.4 ("if it turns out to exist it goes on `speak_passphrase`") resolves to the no-change branch, and the caution behaviour around the one irreversible action stays exactly what it was: state the consequence in the description, provide `get_lock_state` for verification, enforce no ordering in code, and let the benchmark measure which models check first.

The consolation prize is real, though: **that `AbortSignal` is a genuine capability we had not planned for.** A tool execution can now be cancelled by the agent or the user mid-flight, and we can observe it. That is a legitimate thing to wire into the action semaphore, and a small extra Leverage exhibit that costs almost nothing.

**What was confirmed:** `document.modelContext` is canonical (Chrome 150 deprecates the `navigator` alias, so keep the fallback but do not lead with it); there is no `unregisterTool` and `AbortSignal` teardown is the only removal path; `toolchange` fires on register and unregister; `annotations` carries exactly `readOnlyHint` and `untrustedContentHint`, both defaulting false; `getTools()` takes `fromOrigins` and `registerTool` takes `exposedTo`; the return value is `Promise<any>` put through "serialize a JavaScript value to a JSON string", which confirms that the MCP-shaped `{ content: [...] }` object is a passed-through convention rather than an enforced schema.

**One discrepancy to verify in a browser:** the captured hackathon reference says `executeTool` takes input as a JSON string; the spec IDL says `optional object inputObject = {}`. Only matters if we ever drive tools ourselves, which today only the spike does.

**Process lesson.** Doc 03 marked exactly one row DISPUTED and got the disputed row right (it genuinely was unsettled) while getting a row marked **High confidence** wrong. Confidence labels applied from memory are not evidence. The fix is not to relabel: it is that nothing enters an architecture document without a link to spec text or an observed result. That is what [11-spec-notes.md](11-spec-notes.md) is for, and why its rule is that unverified rows stay blank.

### 2026-08-27 - There is an open spec issue about the exact thing our game is made of

[webmachinelearning/webmcp#262](https://github.com/webmachinelearning/webmcp/issues/262), opened days before we started, argues that WebMCP loses semantic context when tools appear and disappear: the agent learns that `export_report` is gone but not *why* it is gone, and the reasons ("no permission", "not in your plan", "not ready yet") should drive very different agent behaviour. The author calls it semantic context blindness.

Semaphore is very likely the most aggressive implementation of dynamic tool registration anyone will show at this hackathon: three controller tiers, a full teardown and rebuild at every chamber boundary, and an ending whose whole point is a `toolchange` with an empty registry. We are going to hit every failure mode in that issue on purpose.

And our design already contains an answer to it, arrived at for narrative reasons rather than spec reasons:

- `get_status` exists precisely so a disoriented agent has one cheap call that reports its current capabilities and situation.
- `E_STALE_TOOL` returns *"That mechanism is behind you now. Call get_status to see where you are."* That is a stale-handle call receiving the semantic reason for its own staleness, which is what the issue asks the platform to provide.
- The `begin_shift` briefing tells the agent up front that its tools will change, so disappearance is expected rather than alarming.

**This is worth a contribution to the spec repo once we have run it against real models.** Not a proposal, and not before we have data: a short implementation report saying "here is what happens to agent behaviour when you tear down and rebuild a registry four times in fifteen minutes, here is what we had to build at the application layer to compensate, here is what the platform could have given us instead." Issue #256 shows the maintainers respond well to exactly that shape of contribution. Two of our judges are close to this repo, which is a happy accident and not the reason to do it.

### 2026-08-27 - Independent field evidence that agent discovery is unreliable

[webmachinelearning/webmcp#256](https://github.com/webmachinelearning/webmcp/issues/256) is a research note from someone who ran 100 trial slots across Codex, ChatGPT in Chrome, Antigravity and Edge during the origin trial. The finding that matters to us:

> Native discovery was irregular. Antigravity produced two server-confirmed invocations in five attempts, only one of which produced a usable resumption report. The observed ChatGPT/Chrome and Edge configurations produced **no confirmed native invocation**.

That is somebody else's data confirming risk R2 (agent disengagement) is the real one, and it is worse than our own documents assume. Every mitigation we designed for it, the single-tool front door, the copyable starter prompt, descriptions as onboarding, is now load-bearing rather than defensive polish. The same note also found that bounded tool results cut visible context by roughly 20 percent, which is independent support for the character budgets we are enforcing in lint.

The practical consequence: **the demo video must be pre-recorded, and the starter prompt card is not a cop-out.** Both were already decided. This is the evidence that they were decided correctly.

---

## Process

### 2026-08-27 - Delete beats migrate when the data model is wrong at the root

The v1 scaffold looked cheap to migrate: rename an enum, add two error codes. It was not, because `AUDIBLE` is not a fifth name in a list, it is a channel perceived by both parties differently, and it changes what a projection function is. Migrating would have carried v1's shape forward invisibly under v2's names.

The tell that a migration is actually a rewrite: **the change is to what the type means, not to what it is called.** Full reasoning in D-001.

Corollary that saved us anyway: `packages/seed` survived untouched because it had exactly one job and no dependency on the wrong model. Small pure packages are cheap to keep across a redesign. That is an argument for `packages/` discipline, not just tidiness.

---

## Puzzle and playtest findings

*(Nothing yet. Paper prototyping is Phase 0.2. Record here: where testers stalled, what phrases they used for each glyph, which chamber produced silence.)*

---

## Per-model agent behaviour

*(Nothing yet. Doc 04 section 7 holds the structured table. Record here the anecdotes and surprises that do not fit a table cell.)*

---

## Proofs and tests

### 2026-08-28 - The proof failed on first run, and it was right

`tests/possible-worlds.test.ts` was written to assert that for every reachable unsolved state, KEEPER's view is consistent with several worlds that disagree about the correct action. It failed immediately, on the state where an agent has pulled two of three wrong levers.

The instinct in that moment is to widen the test until it passes. That instinct is exactly what `tests/CLAUDE.md` forbids, and following it here would have shipped a false claim into the README, the video and the Devpost text, where the first person to think for ten seconds about a three-lever puzzle would have found it.

What the failure actually showed: **underdetermination is a property of the projection, and exhaustive search defeats it independently of the projection.** Our claim was stated more broadly than it was true. Nothing leaked, no channel carried the answer, and the agent paid for its certainty in wasted calls. The projection stops the agent *deducing*; only the search space and the timer stop it *enumerating*. Doc 02 section 8 already said that; we had just not noticed the proof was quietly claiming both jobs.

Three things worth carrying forward:

1. **Clause (b) is the one that does the work.** Clause (a) stayed true in the failing state: the agent still could not tell which glyph sat on which remaining lever. Only the "and those worlds disagree about the action" clause detected that the remaining ambiguity had stopped mattering. A version of this test with clause (a) alone would have passed and proven nothing.
2. **A test that has never failed has not been shown to be load-bearing.** This one earned its place in CI by catching a real overclaim on its first execution, before any of it reached a judge.
3. **Scoping a claim is only honest if the scoping is published.** The test now carries a block called "the limit of the claim, stated rather than hidden" that asserts the excluded region on purpose: that the deduction is possible, what it costs, and that clause (a) survives where clause (b) does not. Hiding the scope would make a true claim look stronger than it is, which is the same failure as making a false one.

Full reasoning is D-009. The submission copy has to be corrected to match.
