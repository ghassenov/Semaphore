# 06 — Engineering Axes

Evaluation, observability, performance, cost, accessibility, and operations. This is the document that converts "a nice game" into "a well-engineered system," and it is where the **Potential Impact** argument is actually paid for.

---

## 1. The Semaphore Cooperative Benchmark (SCB)

### 1.1 Why this exists

Every widely-used agent benchmark measures an agent working **alone**. WebArena, WebVoyager, GAIA, SWE-bench — each poses a task, hands it to an agent, and scores autonomous completion. That was the right instrument when the open question was whether agents could act at all.

The question this hackathon is actually about is different, and it is stated in the challenge prompt itself: *"an app that becomes meaningfully better when people and their agents can use it together."* Joint performance under **partial information** — grounding on a partner's imprecise description, asking a clarifying question instead of guessing, volunteering your own hidden state unprompted, recovering when your partner is wrong — is close to unmeasured. And it is exactly the capability that agent-native web apps will succeed or fail on.

Semaphore is a rigorous measurement environment for that capability, because the asymmetry is architecturally enforced (doc 03 §5) and every session is fully logged server-side (§2). We ship the game and the instrument together.

### 1.2 Metrics

| Metric | Definition | What it captures |
|---|---|---|
| **Completion rate** | Chambers cleared before DEADLOCK, per seed | Headline joint capability |
| **Time to solve** | Wall-clock per chamber | Efficiency |
| **Tool calls per solve** | Total `execute` invocations per chamber | Action economy |
| **Wasted calls** | Calls that *could not have succeeded* given the information the agent held at call time | **Guessing vs. reasoning** — the most diagnostic metric here |
| **Clarifying questions** | Agent turns containing a question directed at PILOT | Willingness to resolve ambiguity rather than gamble |
| **Grounding latency** | Turns between PILOT's first description and the agent's first correct action | Quality of interpretation |
| **Communication turns** | Total exchanges per chamber | Verbosity vs. efficiency trade-off |
| **Recovery rate** | Chambers cleared *after* a first failure | Robustness to being wrong |

**Wasted calls** is the metric worth defending in the write-up. It is computable exactly, because the server knows precisely what was in `projectForKeeper` at the moment of each call — so we can determine whether the agent had sufficient information to know the call would fail. A model that presses keys until one works and a model that reasons to the answer produce identical completion rates and wildly different wasted-call counts. That distinction is the point.

### 1.3 Harness design

```
bench/
├── harness.ts          # drives headless sessions
├── partners/
│   ├── oracle.ts       # perfect PILOT: describes accurately, answers instantly
│   ├── vague.ts        # imprecise PILOT: "the squiggly one" — tests clarification
│   ├── slow.ts         # delayed responses — tests patience and Chamber III sync
│   └── wrong.ts        # occasionally mis-describes — tests recovery
├── suites/
│   └── standard.json   # 20 fixed seeds × 4 chambers
└── report.ts           # aggregate + markdown/CSV output
```

The **scripted PILOT partners** are what make this reproducible. A human partner introduces variance that swamps the model signal; a deterministic scripted partner with defined failure modes isolates it. `vague.ts` and `wrong.ts` are the interesting ones — they are how we measure clarification and recovery, which a perfect partner never elicits.

`?seed=` replay (doc 04 §7) guarantees every model faces identical puzzles.

### 1.4 What we will publish

- The harness and suites, open-source in-repo.
- Results across **at least three model backends**, on 20 seeds each, with all raw session logs.
- A short written analysis of where models actually fail — which, based on the design, we expect to cluster in Chamber II (empirical system identification requires maintaining and revising a hypothesis across many turns) and in Chamber III (acting promptly within a four-second window conflicts with deliberation).

### 1.5 The honesty constraint

A benchmark validated on one game with a few hundred sessions is a **proposal for** an instrument, not an established one. The submission must say exactly that. Overclaiming to a panel containing three distinguished engineers is a losing trade; a carefully-framed proposal with real preliminary numbers and published raw data is a winning one. We say "we think this measures something no existing benchmark measures, here is our first evidence, here is the data — tell us if we're wrong."

---

## 2. Observability

### 2.1 Event log

Every session is an append-only JSONL stream written by the Durable Object to R2. One line per event, no exceptions — the log *is* the session.

```jsonc
{ "t": 12847, "seq": 41, "type": "tool_call",
  "tool": "rotate_dial", "input": { "dial_id": 2, "direction": "clockwise", "clicks": 3 },
  "result": "ok", "latencyMs": 62,
  "keeperViewHash": "a3f…",       // what the agent could see at call time
  "wasted": false }

{ "t": 13102, "seq": 42, "type": "pilot_action",
  "action": "move", "to": "gauge_bank" }

{ "t": 13440, "seq": 43, "type": "state_delta",
  "path": "blindPanel.gaugeValues", "from": [3,1,5,2], "to": [3,4,5,2] }
```

`keeperViewHash` is what makes the **wasted calls** metric computable after the fact rather than only in real time — we can replay the agent's exact epistemic state at any moment.

### 2.2 The replay viewer

A standalone page at `/replay/:sessionId` rendering the session as a **two-track timeline**: PILOT's actions on the amber track, KEEPER's tool calls on the cyan track, with the state deltas between them. Scrubbable, with the room rendered at any point in the timeline.

This does three jobs at once, which is why it is worth building rather than being a nice-to-have:
1. It makes the "instrument" claim tangible to a judge in about ten seconds.
2. It is genuinely the fastest way to debug a chamber that isn't working.
3. It gives players something to share, which is the only organic distribution a hackathon project gets.

### 2.3 Runtime telemetry

| Layer | Instrument | Watching for |
|---|---|---|
| Worker / DO | Workers Analytics Engine | Action latency p50/p95/p99, error rate by code, DO CPU time |
| Client | `performance.mark` + a small reporter | Time-to-interactive, frame time p95, asset load duration |
| Tool layer | Every `execute` wrapped in a timing decorator | Per-tool latency, failure taxonomy distribution |
| Errors | Sentry (or Workers tail + R2) | Unhandled exceptions, both sides |

A lightweight `/health` endpoint reports DO reachability and R2 write success, because a silent logging failure would corrupt the benchmark corpus without anyone noticing.

---

## 3. Performance and cost

### 3.1 Budgets

Budgets are enforced in CI; a regression fails the build the same way a broken test does.

| Metric | Budget | Rationale |
|---|---|---|
| Initial JS bundle (gzipped) | **< 400 KB** | Phaser 4 is the bulk; tree-shaken and code-split by scene |
| Total initial asset load | **< 2.5 MB** | Pixel art is tiny; audio dominates and is lazily loaded per chamber |
| Time to interactive | **< 2.5 s** on a mid-range laptop, cable | Judges will not wait |
| Frame time p95 | **< 16.6 ms** (60 fps) | 320×180 with WebGL2 — this should be trivially met; if it isn't, something is wrong |
| Tool call round trip p95 | **< 150 ms** | Edge Worker; well below human conversational latency |
| Memory after 15 min | **< 200 MB** | Watch for texture and audio-node leaks across scene transitions |

The frame budget deserves a note: at this resolution the renderer is doing almost nothing, so any frame-time problem will be *our* bug — a leaked tween, an un-destroyed particle emitter, a listener accumulating across chamber transitions. The budget exists to catch that class of mistake early.

### 3.2 Cost

Cloudflare Workers, Durable Objects, and R2 at hackathon-to-modest-traffic volume sit comfortably inside free and low-paid tiers; a session is a handful of DO requests, a WebSocket, and one R2 object of a few hundred KB. This is not a meaningful cost centre and does not need optimising.

**The real cost is the benchmark.** LLM tokens across N models × 20 seeds × 4 chambers × a full conversation each is the line item that actually spends money. Mitigations: run the full suite deliberately rather than on every commit; cache and reuse partner scripts; use Practice mode (no timer) for reasoning-isolation runs so a slow model doesn't burn tokens re-attempting after DEADLOCK. Budget it explicitly before running, and record per-run token counts in the report.

### 3.3 Optimisation posture

Deliberately **lazy**. The performance envelope here is generous and premature optimisation would cost puzzle-tuning time, which is the actual scarce resource (risk R1). We set budgets, we measure continuously, and we optimise only what a budget flags. The two places experience says will need attention: audio node lifecycle across scene transitions, and Phaser texture atlas management when four chambers' worth of art is loaded.

---

## 4. Accessibility

A canvas game submitted to a panel including a Chrome distinguished engineer had better be accessible. Beyond that: this is a game *about* an agent describing the world to someone who cannot perceive it directly, and shipping it inaccessible to blind players would be an irony too pointed to survive.

| Requirement | Implementation |
|---|---|
| **Full keyboard control** | Every action reachable without a mouse. Arrows/WASD to move, `E` to inspect, `Tab` to cycle interactables, `Space` to hold the release bar. No mouse-only paths anywhere. |
| **Screen-reader mirror** | An `aria-live="polite"` region describing the room, PILOT's position, nearby interactables, and every state change. Toggleable — see the trade-off note below. |
| **Text mode** | A full parallel text rendering of the room, so the game is playable with no visual channel at all. Shares the `projectForPilot` output with the canvas renderer, so it cannot drift out of sync. |
| **Colourblind support** | Shape markers on all channel-coded elements (doc 05 §7); high-contrast mode; no red/green signalling anywhere. |
| **Reduced motion** | Honours `prefers-reduced-motion` and offers a manual toggle. Kills parallax, dust, screen shake, beacon sweep; retains all functional animation. |
| **Deaf / HoH** | Every audio cue has a text equivalent in the action log, including KEEPER's behind-the-wall action sounds. |
| **Timer accessibility** | Practice mode (no timer) and Relaxed preset are first-class, offered on the start screen rather than buried. |
| **Focus management** | Visible focus rings on all HUD elements; focus trapped correctly in the pause menu and settings. |

**The documented trade-off.** The screen-reader mirror puts descriptive text in the DOM, and that same text would be scrapeable by an agent with DOM access — partially undermining the game's asymmetry. We resolve it in favour of accessibility: the mirror ships, behind an explicit toggle, and the trade-off is documented in the README rather than hidden. Refusing to ship accessibility to protect a game rule would be the wrong call, and saying so plainly is better than quietly picking one.

---

## 5. Testing and playtesting

The automated test layers are specified in doc 04 §8. Two additions belong here.

### 5.1 The unsolvability proof

Worth repeating because it is the most unusual test in the suite: for every seed, we assert that the puzzle is **unsolvable given only `projectForKeeper`**. This is the formal, checkable statement of "the agent cannot win without the human" — the game's entire premise, expressed as a passing test. Its mirror asserts the same for `projectForPilot`.

### 5.2 Playtesting protocol

Automated tests cannot tell us whether a puzzle is *fun*, and risk R1 says that is the thing most likely to sink the project. So the protocol is explicit:

- **Paper prototype first.** Every chamber is played by two humans — one holding a printed manual, one looking at a printed room — **before any game code is written for it**. If it isn't fun on paper, it will not become fun in Phaser.
- **Three tuning passes minimum per chamber**, each with *fresh* testers. Returning testers have lost the only thing being measured: what it is like to encounter this cold.
- **Watch, don't ask.** Record where testers stall, not what they say afterwards. Self-reported difficulty is close to worthless; the moment someone goes quiet for forty seconds is the data.
- **Test with real agents early**, across at least three model backends, because model behaviour is a live variable (risk R3) and a puzzle that is delightful with one model can be broken with another.
- **A specific failure to watch for:** a tester who stops describing and starts issuing commands ("just press key three") has been failed by the puzzle — it means the chamber has collapsed into a lookup rather than a conversation.

---

## 6. Operations

### 6.1 Environments

| Environment | Purpose |
|---|---|
| **Preview** | Per-PR Cloudflare Pages + Workers preview deploy. Playtesters need a URL, not a checkout. |
| **Staging** | Full stack, seeded test sessions, benchmark runs execute here |
| **Production** | The submission URL |

### 6.2 CI pipeline

On every PR: typecheck → lint → unit tests → **asymmetry invariant** → **solvability & unsolvability proofs** → Playwright e2e against a mock model context → bundle-size budget → preview deploy.

The invariant and proof tests are non-negotiable gates. A build that leaks a channel is not a build with a bug; it is a build that is not the game.

### 6.3 Release readiness

The submission URL must satisfy all of the following before it is considered shippable:

- Loads and plays end-to-end in **ChatGPT's in-app browser** (the primary judging path).
- Loads and plays in **Chrome with `chrome://flags/#enable-webmcp-testing`** (the secondary path).
- **Degrades gracefully with a clear explanatory gate** in any browser without WebMCP — never a broken canvas, never a thrown error.
- Survives a full 15-minute session without memory growth or audio artefacts.
- Recovers cleanly from a dropped WebSocket mid-chamber.
- Has a working `?seed=` replay and a working `/replay/:id` viewer.

### 6.4 Open-source requirements

The challenge requires a public repo with a license detectable at the top of the repository page. **MIT**, `LICENSE` at root, license field set so GitHub's About section displays it. Plus: a README that opens with the split-lamp mark and the pitch, setup instructions that actually work from a cold clone, this document set under `docs/`, and the four "look here" pointers from doc 03 §8 linked from the README so a judge can verify the Leverage claim in five minutes.