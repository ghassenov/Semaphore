# Lessons Learned

A running journal. Append as we go: what we found out, what it cost us, what we would tell someone starting this project tomorrow.

This is deliberately separate from the other documents. [decision-log.md](decision-log.md) records **decisions and their reasoning**. [11-spec-notes.md](design/11-spec-notes.md) records **empirically observed browser behaviour**. This file records **everything else we learned the hard way**, including things that turned out to be wrong, dead ends worth remembering, and feedback on our own process.

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

### 2026-08-28 - The IDL was not the answer, and the testing helper was not the agent path

The entry below this one settled a disputed claim by reading the W3C draft IDL carefully, concluded that `execute` receives two arguments with an `AbortSignal`, and recorded it as D-007. Running the spike against Chrome 151 today found that `execute` receives **one** argument and no signal. The IDL says one thing; the only shipping implementation does another.

That is not a criticism of reading the IDL, which was the right thing to do with no browser available. It is a lesson about how long a spec reading is allowed to stand unverified. D-007 sat for a day and had already been written into `apps/game`'s adapter types, its director, its session client, its fake registry, a test, and the handoff. None of it was broken - the parameter was optional throughout - but six places claimed a capability the browser does not provide, and every one of them had to be corrected. **A spec reading is a hypothesis with a shelf life. Mark it as one, and go and measure it before it has propagated into six files.**

The sharper half of the lesson is about *what* you measure with. The spike's own check drove tools through `mc.executeTool(tool, input)`, the page-side helper, and found the argument count that way. It also found something odd: `executeTool` **rejects an input object** and requires a JSON string, which contradicted the IDL a second time. Both observations came from a path the game never uses. Invoking the same tool the way a host does, through the DevTools Protocol's `WebMCP.invokeTool`, showed the truth: an agent invocation delivers a plain **object**, and the JSON-string requirement belongs to the testing helper alone. Had we stopped at the first result we would have "fixed" the client to parse a JSON string it will never receive, breaking every tool.

**When a platform gives you two ways to invoke your own code, the one your users take is the one that defines the contract.** A convenience or testing entry point can differ from the real one in ways that look like the API and are not, and a diagnostic that only exercises the convenient path will confidently report the wrong answer. Worth asking of any instrument, not just this one: is this the path production takes, or the path that was easy to call?

A third finding came free from the same run, and it is the one that changes a design rather than a claim: **a declaratively registered tool does not leave the registry when its `AbortSignal` aborts.** Its lifetime is its form element's, so it goes when the form leaves the DOM. Our whole ending is a registry draining to empty, and the spike's `toolchange.empty` row came back with one tool still registered. The event had fired correctly; the registry simply was not empty, because the two registration APIs have two different lifetimes and we had only thought about one. **When a platform offers two ways to create the same kind of thing, check that they are destroyed the same way too.** It is the sort of asymmetry that is invisible until the demo.

All three are recorded in D-024 and in doc 11 section 2.

### 2026-08-27 - Two of our three disputed spec claims resolve against doc 03

Read directly from the W3C draft IDL rather than from memory. Both corrections matter, and one of them invalidates a sentence we had written into our own architecture document.

**`execute` receives two arguments, not one.** The callback signature is `(object inputObject, ToolExecuteCallbackOptions options)`, and `options` carries `required AbortSignal signal`. Doc 03 section 1 lists "execute receives a single argument" as a high-confidence claim. It is wrong. *(Superseded 2026-08-28: Chrome 151 passes one argument and no signal. Doc 03 was right and this reading was not. See the entry above and D-024.)*

**`requestUserInteraction` does not exist.** The second argument is not an agent handle. It contains a cancellation signal and nothing else. So the conditional plan in doc 02 section 3.4 ("if it turns out to exist it goes on `speak_passphrase`") resolves to the no-change branch, and the caution behaviour around the one irreversible action stays exactly what it was: state the consequence in the description, provide `get_lock_state` for verification, enforce no ordering in code, and let the benchmark measure which models check first.

The consolation prize is real, though: **that `AbortSignal` is a genuine capability we had not planned for.** A tool execution can now be cancelled by the agent or the user mid-flight, and we can observe it. That is a legitimate thing to wire into the action semaphore, and a small extra Leverage exhibit that costs almost nothing.

**What was confirmed:** `document.modelContext` is canonical (Chrome 150 deprecates the `navigator` alias, so keep the fallback but do not lead with it); there is no `unregisterTool` and `AbortSignal` teardown is the only removal path; `toolchange` fires on register and unregister; `annotations` carries exactly `readOnlyHint` and `untrustedContentHint`, both defaulting false; `getTools()` takes `fromOrigins` and `registerTool` takes `exposedTo`; the return value is `Promise<any>` put through "serialize a JavaScript value to a JSON string", which confirms that the MCP-shaped `{ content: [...] }` object is a passed-through convention rather than an enforced schema.

**One discrepancy to verify in a browser:** the captured hackathon reference says `executeTool` takes input as a JSON string; the spec IDL says `optional object inputObject = {}`. Only matters if we ever drive tools ourselves, which today only the spike does.

**Process lesson.** Doc 03 marked exactly one row DISPUTED and got the disputed row right (it genuinely was unsettled) while getting a row marked **High confidence** wrong. Confidence labels applied from memory are not evidence. The fix is not to relabel: it is that nothing enters an architecture document without a link to spec text or an observed result. That is what [11-spec-notes.md](design/11-spec-notes.md) is for, and why its rule is that unverified rows stay blank.

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

### 2026-08-28 - The alarm we were told we needed turned out to be worth about one field

NEXT-STEPS had the chamber timer down as "needs a Durable Object alarm", and it had the reason right: a client timer is one `debugger` from infinite. What it had wrong was where the alarm sits in the design.

Writing it as an alarm-first mechanism means the rule lives somewhere no pure test can reach, and it means a missed alarm is a correctness bug that hands the pair free time. Writing it as a stored deadline that a pure function compares against the clock on every read makes the whole thing testable with no runtime at all, and makes tampering impossible for the same reason it was impossible before: the server holds the number.

Once that was written, the alarm shrank to about twenty lines whose only job is to call the same pure function when nobody else will, so the `failure` event carries the instant time actually ran out rather than the instant somebody next asked. That is a real requirement (the replay timeline and the benchmark both read that timestamp) and it is the *only* one the derivation could not meet.

**The generalisation: when a requirement arrives named after a mechanism, separate the requirement from the mechanism before building it.** "The timer must be tamper-proof" and "the timer must fire on its own" are different requirements with different costs, and only one of them needed the runtime. The same reframing had already happened once in this repo without being noticed as a pattern: Chamber III's grip window and lockout are both time-based and both pure, which is why the entire finale is testable without a Durable Object.

The cost of getting this backwards is not a rewrite, it is a permanent tax: every future test of anything downstream of the timer would have needed a workerd instance.


### 2026-08-28 - The proof failed on first run, and it was right

`tests/possible-worlds.test.ts` was written to assert that for every reachable unsolved state, KEEPER's view is consistent with several worlds that disagree about the correct action. It failed immediately, on the state where an agent has pulled two of three wrong levers.

The instinct in that moment is to widen the test until it passes. That instinct is exactly what `tests/CLAUDE.md` forbids, and following it here would have shipped a false claim into the README, the video and the Devpost text, where the first person to think for ten seconds about a three-lever puzzle would have found it.

What the failure actually showed: **underdetermination is a property of the projection, and exhaustive search defeats it independently of the projection.** Our claim was stated more broadly than it was true. Nothing leaked, no channel carried the answer, and the agent paid for its certainty in wasted calls. The projection stops the agent *deducing*; only the search space and the timer stop it *enumerating*. Doc 02 section 8 already said that; we had just not noticed the proof was quietly claiming both jobs.

Three things worth carrying forward:

1. **Clause (b) is the one that does the work.** Clause (a) stayed true in the failing state: the agent still could not tell which glyph sat on which remaining lever. Only the "and those worlds disagree about the action" clause detected that the remaining ambiguity had stopped mattering. A version of this test with clause (a) alone would have passed and proven nothing.
2. **A test that has never failed has not been shown to be load-bearing.** This one earned its place in CI by catching a real overclaim on its first execution, before any of it reached a judge.
3. **Scoping a claim is only honest if the scoping is published.** The test now carries a block called "the limit of the claim, stated rather than hidden" that asserts the excluded region on purpose: that the deduction is possible, what it costs, and that clause (a) survives where clause (b) does not. Hiding the scope would make a true claim look stronger than it is, which is the same failure as making a false one.

Full reasoning is D-009. The submission copy has to be corrected to match.

---

### 2026-08-28 - "Wrap the call and time it" is the wrong instinct for agent latency

Building the Session Durable Object, the natural first move was to time a call by measuring around it: start a clock, run the handler, stop the clock. That is the textbook way to measure latency, and it was wrong here.

The handler being timed was a pure, synchronous reducer call. Wrapping it in `Date.now()` measures server compute time, which is microseconds. Feeding microseconds into "6x the median, clamped to 12 to 35 seconds" means the clamp floor wins every time, for every model, forever. The adaptive window would not be adaptive. The bug would not throw, would not fail a test, and would look completely reasonable in code review, because "time the function call" is exactly what a reviewer expects to see.

The actual quantity needed was not "how long did my own code take" but "how long until the next thing happens", which is a different measurement taken from a different vantage point: the gap between one response leaving and the next request arriving. The server cannot see the agent think or the network carry a packet, but it can see exactly that gap, and that gap **is** the sum of both, which is what a fiction about "the station learning your rhythm" actually means.

The general lesson: **before timing a call, ask what you are actually trying to measure the rhythm of, not just wrap the nearest function.** A metric that always resolves to a constant, like every model getting the clamp floor, is a specific and checkable smell, and it would have been worth writing a test for even before implementing the fix, since "does the derived window ever vary across different latency samples" is exactly the property that failed silently here.

Recorded fully as D-010.

### 2026-08-28 - Two more bugs the proof caught, both from copying a pattern past where it applied

Chamber I reused Chamber 0's shape (`generate` / `initial` / `facts` / `candidates` / `correctAction`) almost exactly, and two places where the pattern quietly stopped being correct only showed up once the numbers were actually run.

**"The action from here" meant something different once the answer had more than one step.** Chamber 0's answer is a single lever, so "the action that solves it" and "the whole answer" are the same sentence. Chamber I's answer is a sequence of up to six keys, and `correctAction` returning only the *next* key capped the measured ambiguity at `log2(6)` no matter how large the real plan space was, because a six-key ring only ever has six possible first moves. The published figure (1,956 worlds, 10.93 bits) is about the whole plan, not the first step of it. The fix was one line (return the whole remaining sequence, not just its head), but finding it required actually running `measure()` and getting a suspiciously small, suspiciously round-looking wrong number (6 actions, exactly the key count) rather than trusting that copying a working pattern would keep working.

**A witness-based candidate set can quietly stop filtering anything.** `candidates()` built one representative state per achievable answer and copied the real session's play-history fields onto every one of them, including the accepted-key-sequence. That made every witness trivially agree with the observed history on that field, which meant `consistentWorlds` could never actually narrow the set as correct keys landed. The bug produced no wrong answer at the entry state (nothing has happened yet, so there was nothing to filter), and only appeared when a test walked the sequence forward and asked whether ambiguity was dropping. **A test that only checks the starting state cannot catch a bug in how a value changes over time.**

Both bugs share a lineage: they happened while extending working code by analogy rather than by re-deriving it, and both were invisible until a test exercised the SEQUENCE of states a real session actually visits, not just its first one. The general habit worth keeping: whenever a chamber's answer is more than one action long, write the "does this converge as play progresses" test before trusting the entry-state number, because the entry state is exactly the case where a missing filter or a truncated action can't yet show itself.

Full reasoning: D-011 (the action-scope fix) and D-012 (the candidate-filtering fix).

### 2026-08-28 - Finding the narrowing signal meant re-reading a throwaway line in the design doc

Chamber II's design doc says KEEPER cannot see the gauges at all, full stop. So what does "an informative rotation drops the CONCORD bar" (doc 02 section 5) actually mean, mechanically, if the one fact that changes when you rotate a dial (the gauge's value) is a channel KEEPER structurally cannot reach?

The answer was sitting in a sentence that reads like flavour text on a first pass: "PILOT can report 'I heard three clicks but nothing moved.'" That line is doing real mechanical work: it says the number of clicks that *actually register* can be less than the number commanded, because the gauge hit a physical limit. That is not a fact about sound for its own sake, it is the one thing KEEPER *can* perceive that depends on the hidden wiring, because whether a gauge is near its bound depends on which gauge a dial drives, whether the linkage is inverted, and everything that has happened to that gauge already.

Two things worth keeping from this:

1. **A design doc's illustrative example can be its load-bearing mechanic in disguise.** The sentence was written to make the room feel real, not to specify an algorithm, but it was the only sentence in the whole section that actually answered "what can the server compute." Read every concrete example in a spec for what it implies is *possible to observe*, not just for its color.
2. **The moment a narrowing signal depends on "what happened so far" rather than "what is true right now," the candidate-checking code has to replay history, not compare current state.** This is the same shape of bug D-012 caught in Chamber I, but here it was avoided from the first draft, because D-012 had already taught the shape of the mistake to watch for. That is the actual value of writing these lessons down: not that this exact bug recurs, but that the *pattern* ("does this depend on the whole sequence, or just the latest step") becomes a question asked before code is written, not after a test fails.

Verified with a probe before trusting it, same as every other bits figure this session: entry gives exactly 384 worlds and 8.585 bits, and rotating a resting gauge 8 clicks halves the consistent set on every fresh dial, in that order, for all twenty canonical seeds.

Full reasoning: D-013.

### 2026-08-28 - The finale's own worked example would have destroyed the finale

Chamber III is the last thing a judge sees and the one moment the design docs describe as amber and cyan finally meeting at one object: PILOT reads a Caesar offset off a wheel, KEEPER holds the enciphered passphrase, neither half is enough. Doc 02 section 3.4 illustrates it with `"XLI XMHI XYVRW"`.

That example breaks the chamber. Enumerating all 26 shifts takes one line of Python, and exactly one of them is `THE TIDE TURNS`. Any agent that knows English solves the whole chamber alone, in one turn, without ever asking what the wheel says. The published 4.70 bits is really 0 bits.

Nothing about this was a coding error. The design doc's mechanics are right, its channel tags are right, its bits arithmetic is right *given its stated assumption* that all 26 decryptions are equally plausible. The example quietly violated that assumption, because a human writing an illustrative ciphertext naturally reaches for a meaningful phrase, and meaning is exactly the thing that makes 25 of the candidates wrong.

Three things worth carrying:

1. **An asymmetry claim is only as strong as the least ambiguous instance the generator can produce.** It is not enough that the *space* has 26 members; every member has to be indistinguishable to the party who is supposed to be missing information. A single distinguishable case is not a rare bad seed, it is a general solution for the agent.
2. **The fix was to remove the attack, not to make it harder.** Pronounceable-but-meaningless nonsense was the tempting middle option, and it fails too: Caesar shifting does not preserve pronounceability, so an agent could still score the 26 and pick the structured one. Uniform random letters have no property that survives in the plaintext but not in the shifts, so there is nothing left to score.
3. **Check the doc's examples, not just its rules.** Every bits figure this session has been verified by running `measure()` before writing the assertion (D-009, D-011, D-013). This one needed a different check: enumerate what an adversary would actually try. Worth doing for any chamber whose secret is small enough to enumerate, which is all of them.

The correction is D-014, and the submission copy needs updating before it quotes doc 02's example.

### 2026-08-28 - Generating a fixture from real code found a bug the fixture had nothing to do with

Authoring the Archive's ghost session meant actually playing a session through the reducer rather than hand-writing JSONL, specifically so the fixture could never drift from the real event schema. The first attempt produced a session_start event reading `"mode":"full"` for a session played in BRIEF mode.

That was not a mistake in the generator script. It was a real, already-shipped bug: `session_start` fires inside `begin_shift()`, and `begin_shift()` happens before `start()`, which is the call that actually chooses the mode. The event's own field could not have been correct for any non-default mode, for every session that had ever been played, and every test passed anyway, because every test written so far happened to use full mode.

**Generating a fixture from the real system is itself a test, even when nothing was written with testing in mind.** The goal was fidelity (make sure the archive's data is genuine reducer output, not fiction), and the bug-finding was a side effect of that fidelity requirement, not a separate effort. This is the same shape of benefit doc 02's "the benchmark corpus is the game's archive" line is reaching for: an artifact built for one purpose (a ghost to read) turns out to load-bear a second one (a probe that would not have been written on purpose) for free.

The general habit worth keeping: **when a fixture, a demo, or an example needs to be authored, generate it from the real code path rather than writing it by hand**, even when the fixture's job has nothing to do with testing. Hand-authored fixtures are blind to exactly the class of bug real usage finds.
