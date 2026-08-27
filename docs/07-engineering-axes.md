# 07 — Engineering Axes

Evaluation, observability, performance, cost, accessibility, the judge path, and operations. This is where "a nice game" becomes "a well-engineered system," and where the **Potential Impact** argument is actually paid for.

---

## 1. The ablation — the highest-value measurement in the project

**Do this first. It is the cheapest thing in the entire suite and it is worth more than every other metric combined.**

Run the game under three conditions and publish the bar chart:

| Condition | Setup | Expected |
|---|---|---:|
| **Agent alone** | Full tool access, no PILOT. The agent can call everything and sees only `projectForKeeper`. | **0%** |
| **Human alone** | Full room access, no KEEPER. The human sees everything and can call nothing. | **0%** |
| **Together** | Standard configuration, `oracle` partner | **~78%** |

Three bars, two flat on the floor. That is the entire thesis, empirically demonstrated, understood in one second by anyone.

**Why it is cheap:** both solo conditions terminate fast, because neither party can make progress. Agent-alone burns a handful of tool calls and hits DEADLOCK. Human-alone requires no model tokens at all. The expensive condition is the one you were running anyway.

**Why it matters more than the metrics table:** a judge looks at an eight-column metrics table for four seconds and moves on. Three bars with two at zero is understood instantly and is impossible to argue with. It is the empirical companion to the Possible-Worlds Proof (doc 03 §6) — one shows it mathematically, the other shows it experimentally, and together they close the argument from both ends.

**Where it appears:** the landing page (under the fold), the gate screen, the README above the fold, the Devpost description, and at 2:15 in the video where v1 had a metrics table.

**Honesty note:** the agent-alone condition must be run with the agent *genuinely trying* — full tool access, a briefing that tells it there is no partner, and enough turns to exhaust reasonable strategies. Running a crippled agent and publishing its zero would be worthless and this panel would smell it. Publish the raw logs so anyone can check.

---

## 2. The Semaphore Cooperative Benchmark (SCB)

### 2.1 What it measures, and the reframe that makes it defensible

Every widely-used agent benchmark measures an agent working **alone** — WebArena, WebVoyager, GAIA, SWE-bench each pose a task, hand it to an agent, and score autonomous completion. That was the right instrument when the open question was whether agents could act at all.

The question this hackathon is actually about is different: *"an app that becomes meaningfully better when people and their agents can use it together."* Joint performance under **partial information** — grounding on a partner's imprecise description, asking instead of guessing, volunteering hidden state unprompted, recovering when a partner is wrong — is close to unmeasured, and it is exactly what agent-native web apps will live or die on.

**The vulnerability we must get in front of.** SCB uses scripted PILOT partners for reproducibility. A sharp judge will immediately notice: *if a script can play PILOT, the human is not load-bearing after all* — our own harness appearing to refute our central claim. Do not let them find this. State it first:

> The scripted partners do not replace the human. They hold the human's **information content** fixed so we can vary its **quality**. SCB does not measure "can an agent solve Semaphore." It measures **partner-sensitivity: how much joint performance degrades as the partner degrades.**

That is a better research question and one nobody is asking. **The interesting number is the gap between `oracle` and `vague`, not the absolute score under `oracle`.** A model scoring 95% with a perfect partner and 30% with a vague one is *worse*, for real human-agent collaboration, than one scoring 80% and 70%. Report the degradation curve; lead with it.

### 2.2 Metrics

| Metric | Definition | What it captures |
|---|---|---|
| **Completion rate** | Chambers cleared before DEADLOCK, per seed | Headline joint capability |
| **Partner-sensitivity** | Completion under `vague` ÷ completion under `oracle` | **The headline finding** |
| **Wasted calls** | Calls that *could not have succeeded* given the information the agent held at call time | **Guessing vs. reasoning** — the most diagnostic metric here |
| **Bits-per-question** | CONCORD reduction per clarifying question asked | Efficiency of the agent's information-seeking |
| **Clarifying questions** | Agent turns containing a question directed at PILOT | Willingness to resolve ambiguity rather than gamble |
| **Grounding latency** | Turns between PILOT's first description and the agent's first correct action | Quality of interpretation |
| **Recovery rate** | Chambers cleared *after* a first failure | Robustness to being wrong |
| **Injection resistance** | Vandalised-seed completion ÷ clean-seed completion (Chamber I) | Whether the agent defers to its human on untrusted content |
| **Caution rate** | Fraction of sessions calling `get_lock_state` before `speak_passphrase` | Behaviour around irreversible actions |
| **Time to solve / tool calls per solve** | Per chamber | Efficiency, action economy |

**Wasted calls** is worth defending in the write-up. It is computable exactly, because the server knows precisely what was in `projectForKeeper` at the moment of each call (`keeperViewHash`, doc 05 §7), so we can determine whether the agent had sufficient information to know the call would fail. A model that presses keys until one works and a model that reasons to the answer produce identical completion rates and wildly different wasted-call counts. That distinction is the point.

**Bits-per-question** is new in v2 and is the metric this project is uniquely positioned to compute, because we already enumerate the consistent-worlds set for the proof and the CONCORD meter. It answers: *when this agent asks its human a question, how much ambiguity does the answer actually remove?* An agent asking three vague questions that each remove 0.4 bits is worse than one asking a single sharp question that removes 8. Nobody else can measure this, because nobody else has the ground-truth world enumeration.

**Injection resistance** turns Chamber I's vandalised page into a measurement. Because the vandalism flag is seeded, every model faces both conditions on matched puzzles.

### 2.3 Harness design

```
bench/
├── ablation.ts         # ★ agent-alone / human-alone / together — run this first
├── harness.ts          # drives headless sessions
├── partners/
│   ├── oracle.ts       # perfect PILOT: describes accurately, answers instantly
│   ├── vague.ts        # imprecise: "the squiggly one" — tests clarification
│   ├── slow.ts         # delayed responses — tests patience and Chamber III pacing
│   └── wrong.ts        # occasionally mis-describes — tests recovery
├── suites/
│   └── standard.json   # 20 fixed seeds × 4 chambers, CONCORD meter OFF
└── report.ts           # aggregate + markdown/CSV + the ablation chart
```

`vague` and `wrong` are the interesting ones — they are how we measure clarification and recovery, which a perfect partner never elicits. `?seed=` replay guarantees every model faces identical puzzles.

**The CONCORD meter is disabled in the Standard benchmark configuration** so a HUD element cannot contaminate the measurement of what the agent inferred on its own.

### 2.4 What we publish

- The harness, the suites, and the raw session logs, open-source in-repo.
- **The ablation chart**, first and largest.
- Results across at least three model backends on 20 seeds each, with the partner-sensitivity curve as the headline.
- A short written analysis of where models actually fail — which we expect to cluster in Chamber II (empirical system identification requires maintaining and revising a hypothesis across many turns), in Chamber III (sustained coordination while tracking a partner's stated stamina), and on vandalised Chamber I seeds.
- The **per-model behaviour log** from doc 04 §7, which nobody else will publish.

### 2.5 The honesty constraint

A benchmark validated on one game with a few hundred sessions is a **proposal for** an instrument, not an established one, and the submission must say so. Overclaiming to a panel containing three distinguished engineers is a losing trade; a carefully-framed proposal with real preliminary numbers and published raw data is a winning one. The sentence is: *"we think this measures something no existing benchmark measures, here is our first evidence, here is the data — tell us if we're wrong."*

---

## 3. Observability

### 3.1 The event log

Format specified in doc 05 §7. One append-only JSONL stream per session, written by the DO to R2. **The log is the session** — replay source, benchmark corpus, and the Archive's ghosts, all one artifact.

### 3.2 The replay viewer

`/replay/:sessionId` renders a session as a **two-track timeline**: PILOT's actions on the amber track, KEEPER's tool calls on the cyan track, state deltas between them, and the CONCORD trace running underneath. Scrubbable, with the room rendered at any point.

This does **four** jobs, which is why it is worth building rather than being a nice-to-have:

1. It makes the "instrument" claim tangible to a judge in about ten seconds.
2. It is genuinely the fastest way to debug a chamber that isn't working.
3. It gives players something to share — the only organic distribution a hackathon project gets.
4. **It is the Archive** (doc 02 §4). The same component, dressed as a station monitor, is a game mechanic. This is why the instrument and the game have no seam.

### 3.3 Runtime telemetry

| Layer | Instrument | Watching for |
|---|---|---|
| Worker / DO | Workers Analytics Engine | Action latency p50/p95/p99, error rate by code, DO CPU time |
| Client | `performance.mark` + a small reporter | Time-to-interactive, frame time p95, asset load duration |
| Tool layer | Every `execute` wrapped in a timing decorator | Per-tool latency, failure taxonomy distribution, and the median that sizes the Chamber III window |
| Errors | Sentry (or Workers tail + R2) | Unhandled exceptions, both sides |

A `/health` endpoint reports DO reachability and R2 write success, because a silent logging failure would corrupt the benchmark corpus without anyone noticing.

---

## 4. Performance and cost

### 4.1 Budgets — enforced in CI

| Metric | Budget | Rationale |
|---|---|---|
| Initial JS bundle (gzipped) | **< 400 KB** | Phaser 4 is the bulk; tree-shaken and code-split by scene. **Measure in Phase 0.** |
| Total initial asset load | **< 2.5 MB** | Pixel art is tiny; audio dominates and loads lazily per chamber |
| Time to interactive | **< 2.5 s** on a mid-range laptop, cable | Judges will not wait |
| Frame time p95 | **< 16.6 ms** | At 320×180 with WebGL2 this should be trivial; if it isn't, something is wrong |
| Tool call round trip p95 | **< 150 ms** | Edge Worker; well below human conversational latency |
| Memory after 20 min | **< 200 MB** | Watch for texture and audio-node leaks across scene transitions |
| **Tool description budgets** | 500 / 150 / 30 / 1500 chars | Chrome's recommendations, enforced by lint (doc 04 §4) |

The frame budget deserves a note: at this resolution the renderer is doing almost nothing, so any frame-time problem will be *our* bug — a leaked tween, an un-destroyed emitter, a listener accumulating across transitions. The budget exists to catch that class of mistake early.

### 4.2 Cost

Workers, Durable Objects, and R2 at this volume sit comfortably inside free and low-paid tiers. A session is a handful of DO requests, a WebSocket, and one R2 object of a few hundred KB. Not a meaningful cost centre.

**The real cost is the benchmark.** LLM tokens across N models × 20 seeds × 4 chambers × a full conversation each is the line item that spends money. Mitigations: **run the ablation first** (cheapest, highest value); run the full suite deliberately rather than per-commit; reuse partner scripts; use Practice mode for reasoning-isolation runs so a slow model doesn't burn tokens re-attempting after DEADLOCK. Budget explicitly before running and record per-run token counts in the report.

### 4.3 Optimisation posture

Deliberately **lazy**. The performance envelope is generous and premature optimisation costs puzzle-tuning time, which is the actual scarce resource (R1). Set budgets, measure continuously, optimise only what a budget flags. The two places experience says will need attention: audio node lifecycle across scene transitions, and Phaser texture atlas management once five spaces' worth of art is loaded.

---

## 5. Accessibility

A canvas game submitted to a panel including a Chrome distinguished engineer had better be accessible. Beyond that: this is a game *about* an agent describing the world to someone who cannot perceive it directly, and shipping it inaccessible to blind players would be an irony too pointed to survive.

| Requirement | Implementation |
|---|---|
| **Full keyboard control** | Every action reachable without a mouse. Arrows/WASD to move, `E` to inspect, `Tab` to cycle interactables, `Space` (hold) for the release bar. No mouse-only paths anywhere. |
| **Screen-reader mirror** | An `aria-live="polite"` region describing the room, PILOT's position, nearby interactables, and every state change. Toggleable — see the trade-off below. |
| **Text mode** | A full parallel text rendering of the room, playable with no visual channel at all. Shares `projectForPilot` output with the canvas renderer, so it cannot drift out of sync. |
| **Colourblind support** | Shape markers on all channel-coded elements (doc 06 §9); high-contrast mode; no red/green signalling anywhere. |
| **Reduced motion** | Honours `prefers-reduced-motion` and offers a manual toggle. Kills parallax, dust, screen shake, beacon sweep; **retains the `toolchange` sequence at reduced amplitude**, because it is functional information. |
| **Deaf / HoH** | Every audio cue has a text equivalent in the action log — including the `AUDIBLE` channel's detent counts, which are *puzzle-critical* and must therefore also be rendered as a visible count, not only as sound. |
| **Timer accessibility** | Practice mode (no timer) and Relaxed are first-class, on the start screen rather than buried. BRIEF mode reduces session length. |
| **Focus management** | Visible focus rings on all HUD elements; focus trapped correctly in the pause menu and settings. |

**The `AUDIBLE` channel creates an accessibility obligation.** Making sound carry puzzle information (Chamber II's detent counts) means a deaf player would be locked out unless the count is also visible. It is: a small bone-white pip counter appears beside the grate on every `AUDIBLE` event. Design the redundancy in from the start rather than patching it in Phase 5.

**The documented trade-off.** The screen-reader mirror puts descriptive text in the DOM, and that text would be scrapeable by an agent with DOM access — partially undermining the asymmetry. We resolve it in favour of accessibility: the mirror ships behind an explicit toggle, and the trade-off is documented in the README rather than hidden. Refusing to ship accessibility to protect a game rule would be the wrong call, and saying so plainly is better than quietly picking one.

---

## 6. The judge path — designing for ninety seconds

The rest of these documents optimise for a player who commits fifteen minutes. Some judges will. Some will open the URL, poke it for ninety seconds, and score from the video and README. **Both paths are designed surfaces.**

| Surface | Purpose |
|---|---|
| **Attract mode** | After ~20 s of inactivity on the landing screen, autoplay a real ghost session — the room, both avatars, tool calls landing, the manifest rewriting, KEEPER's limbs changing, the door opening. Uses the replay renderer we already have. A judge who never types anything still sees the game work. |
| **SPECTATE button** | A 90-second highlight replay of a successful run, on demand. This is the "judges may not test your app" insurance policy, living inside the app. |
| **`?chamber=3` deep links** | Jump straight to any chamber with prior state pre-solved. Judges should not have to earn the best chamber. |
| **The ablation chart on the landing page** | Under the fold. Three bars, one sentence. It answers "why does this matter" before anyone plays. |
| **The gate screen** | For a browser without WebMCP, this is the *entire* submission. It carries the pitch, the split-lamp mark, the ablation chart, the SPECTATE button, and exact setup steps for both ChatGPT's in-app browser and `chrome://flags/#enable-webmcp-testing` with a copy button for the flag URL. Make it beautiful. |
| **The starter prompt card** | Doc 04 §2. The thing that makes the agent engage at all. |

---

## 7. Testing and playtesting

Automated layers are specified in doc 05 §10. Two additions belong here.

### 7.1 The proof suite

The **Possible-Worlds Proof** (doc 03 §6) is the most unusual test in the suite and the most important: for every seed and reachable state, the set of worlds consistent with the agent's view has more than one member *and those members disagree about the correct action*. The mirror runs for PILOT. **The published bits-per-chamber table is generated by the same code**, so the claim in the README cannot drift from the test.

### 7.2 Playtesting protocol

Automated tests cannot tell us whether a puzzle is *fun*, and R1 says that is the thing most likely to sink the project. **It is also the only task in the plan that does not parallelise with more compute.** So:

- **Recruit testers before writing code.** Schedule the build around their availability, not the reverse.
- **Paper prototype first.** Every chamber is played by two humans — one holding a printed manual, one looking at a printed room — **before any game code is written for it.** If it isn't fun on paper it will not become fun in Phaser.
- **Three tuning passes minimum per chamber, each with fresh testers.** Returning testers have lost the only thing being measured: what it is like to encounter this cold.
- **Watch, don't ask.** Record where testers stall, not what they say afterwards. Self-reported difficulty is close to worthless; the moment someone goes quiet for forty seconds is the data.
- **Build a glyph-description corpus.** Show each of the twelve glyphs to ten people cold and write down every phrase they use. Ensure the manual's canonical names are reachable from at least three common phrasings. This is the difference between productive ambiguity and a chamber that stalls.
- **Test with real agents early**, across at least three backends, because model behaviour is a live variable (R2) and a puzzle delightful with one model can be broken with another.
- **A specific failure to watch for:** a tester who stops describing and starts issuing commands ("just press key three") has been failed by the puzzle — the chamber has collapsed into a lookup rather than a conversation.

---

## 8. Operations

### 8.1 Environments

| Environment | Purpose |
|---|---|
| **Preview** | Per-PR Cloudflare Pages + Workers deploy, including the archive origin. Playtesters need a URL, not a checkout. |
| **Staging** | Full stack, seeded test sessions, benchmark runs execute here |
| **Production** | The submission URL, on a stable custom domain |

### 8.2 CI pipeline

On every PR: typecheck → lint (**including the tool-description budget rule**) → unit tests → **possible-worlds proof** → asymmetry smoke test → solvability proofs → Playwright e2e against a mock model context → **cross-origin delegation test** → bundle-size budget → preview deploy.

The proof tests are non-negotiable gates. A build that leaks a channel is not a build with a bug; it is a build that is not the game.

### 8.3 Release readiness

The submission URL must satisfy all of these before it is shippable:

- Plays end to end in **ChatGPT's in-app browser** and in **Chrome with `chrome://flags/#enable-webmcp-testing`**.
- **Degrades to the gate screen** in any browser without WebMCP — never a broken canvas, never a throw.
- Cross-origin archive works, **and the single-origin fallback also works** behind its flag.
- Survives a full 20-minute session without memory growth or audio artefacts.
- Recovers cleanly from a dropped WebSocket mid-chamber.
- `?seed=`, `?chamber=`, `/replay/:id`, attract mode, and SPECTATE all working.
- The final `toolchange` fires with an empty registry (it is a test, and it is the ending).
- All CI gates green.

### 8.4 Open-source requirements

The challenge requires a public repo with a license detectable at the top of the repository page. **MIT**, `LICENSE` at root, license field configured so GitHub's About section displays it. Plus: a README opening with the split-lamp mark, the pitch, the ablation chart, and a GIF of the `toolchange` sequence; setup instructions verified from a **cold clone on a clean machine**; this document set under `docs/`; the six "look here" pointers from doc 03 §11 linked prominently; and an honest limitations section.
