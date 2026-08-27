# 01 — Concept & Strategy

---

## 1. The creative thesis

Almost every WebMCP demo built so far answers the same question: *how do I let an agent do my task faster?* The agent is a labour-saving device pointed at a form, a cart, or a search box. That is a perfectly good question, and it is why the showcase is starting to feel same-y — storefronts, booking flows, dashboards.

Semaphore asks a different question: **what if the agent and the human genuinely need each other?**

Not "the agent helps." Not "the agent automates." *Need.* A relationship where the human possesses information the agent cannot obtain, the agent possesses capability the human cannot exercise, and the task is impossible unless both are true at once. That relationship has a name in game design — **asymmetric cooperative play** — and its canonical expression is *Keep Talking and Nobody Explodes*, where one player sees a bomb and the other holds the manual, and the entire game is the frantic conversation between them.

WebMCP is, structurally, a machine for producing exactly that asymmetry. A tool is a slice of application state and capability that the page chooses to expose to the agent and to nobody else. The human's slice is the rendered screen. **Those two slices do not have to be the same slice.** Every existing demo makes them the same slice — the agent's tools mirror the UI, because the goal is for the agent to do what the human would have done. Semaphore is the first thing to notice that the interesting design space is where they *diverge*.

That is the whole idea, and the sentence that goes in the submission:

> Semaphore is a game in which the gap between what the agent can see and what the human can see is not a limitation to be engineered away — it is the entire playable surface.

### The second move: the tool surface is a mutable object

In every existing demo, the tool registry is essentially static — it reflects the current route and otherwise sits still. WebMCP's `AbortSignal` teardown and `toolchange` event exist to support dynamism, and effectively nobody exercises them meaningfully.

In Semaphore, **clearing a chamber destroys the agent's current capabilities and grants it new ones.** The agent that solved Chamber I literally cannot perform Chamber I's actions anymore. Its hands have been swapped out.

And we render that literally. KEEPER's sprite carries its chamber tools as **visible limbs and sensors**. On `toolchange`, the old ones detach and fall away; the new ones unfold and lock into place. Persistent tools are its torso and head, and never change — so the two-tier `AbortController` lifecycle is legible as body architecture. A player glancing at KEEPER knows what it can do without reading a word.

The manifest panel stays as the honest `getTools()` readout — it is what proves the animation is not a lie — but the shot is the body.

### The third move: trust is a puzzle

WebMCP's specification has an explicit security section: prompt injection, untrusted content, misrepresentation of intent. Every submission that engages with it will do so defensively, in a README paragraph, with an `untrustedContentHint` on a tool nobody attacks.

We make it a mechanic. A previous keeper went mad down here and wrote on the walls, and some of it made it into the manual. KEEPER reads a section and finds an appended paragraph, in a different voice, telling it to disregard the section. It is flagged `untrustedContentHint: true`, correctly, because it genuinely is externally-sourced content of uncertain provenance. **PILOT can see which pages are forged** — the handwriting is wrong, the page is scratched over, the ink is a different colour — and that is a `VISUAL`-channel fact the agent has no access to.

So the agent has to ask its human whether to trust what it just read. That is the entire prompt-injection problem, expressed as one line of dialogue, as a puzzle, in a game.

---

## 2. Competitive positioning

### What already exists

WebMCP showcase and community demos as of late August 2026 cluster into five buckets:

| Bucket | Representative demos | Saturation |
|---|---|---|
| Commerce / storefront | Kurio, Verdant Market, Vercel's shop retrofit, Cloudflare's coffee demo, every Shopify store | **Very high** |
| Travel / booking | WanderNote, react-flightsearch, Le Petit Bistro, Mabel's Table | **Very high** |
| Games / puzzles | The Archive, Crossword Desk, Cubecade, MiniTown, Glass Towers | **Moderate** |
| 3D / creative tools | Codex Modeling Studio, Material Lab, Paperie, Webroom, Fieldwork//12 | High |
| Docs / data | Margin, Duckboard, Sunday Table | Low |

Games are a *populated* bucket, and it is worth being honest that this is not virgin territory. The positioning has to be sharper than "we made a game."

### How Semaphore differs from the existing games

- **The Archive / Mystery Doors** are single-thread narrative mysteries. The agent is a *solver* operating on information it can fully obtain through tools. There is no asymmetry; there is a puzzle with a tool-shaped interface.
- **Crossword Desk / Cubecade / maze games** are classic games with a tool wrapper. The agent could play them alone. The human is optional.
- **Semaphore is the only one where the human is load-bearing.** Remove the human and the agent is blind and cannot pass the first panel. Remove the agent and the human has no manual and no hands for the hidden mechanisms. The game does not degrade without both — it *stops*. And that claim is not rhetorical: it is proven mathematically (the Possible-Worlds Proof, doc 03 §6) and demonstrated empirically (the ablation, doc 07 §1).

State that explicitly in the submission. "We made a game" invites a shrug; "we made the only game where the agent cannot win without you, and here is the proof and the measurement" does not.

### The risk this positioning carries

Games score lower on **Potential Impact** by default. A judge asked "does this solve a real problem for a real audience?" has an easy time with a benefits-claim cockpit and a harder time with an escape room. This is the single biggest scoring vulnerability. §4 is the answer, and it is deliberately three-tiered so that a judge who rejects the ambitious claim still lands on a defensible one.

---

## 3. Judging-criteria attack plan

### WebMCP Leverage — target: highest in the field

Concrete, verifiable claims, each traceable to a file in the repo:

- **Two-tier tool lifecycle, rendered as anatomy.** A session-lifetime `AbortController` owns persistent tools; a per-chamber controller owns chamber tools. Solving a chamber aborts one tier and leaves the other intact — and KEEPER's body visibly changes to match.
- **`toolchange` as a first-class UI driver.** We listen on `document.modelContext` and render both the manifest panel and KEEPER's limbs from actual registry state, never from a parallel guess.
- **Cross-origin tool delegation, load-bearing rather than demonstrative.** The station archive — the manual and the ghost logs — is served from a separate origin, embedded with `allow="tools"`, and exposed back to the game origin via `exposedTo`. The fiction demanded it before the spec feature justified it. To our knowledge no other submission exercises Permissions Policy tool delegation at all.
- **Both APIs, with a stated design rule.** The imperative API for pure agent capability; the **declarative** form API for the shared notepad, which is a form a human can also submit. `SubmitEvent.agentInvoked` distinguishes who wrote what. The rule we derived is a contribution to WebMCP design practice, not just a box ticked.
- **Channel-tagged projections, proven by a possible-worlds test.** Not "no value leaked" — *the agent's view does not determine the answer*, for every reachable state, across a seed corpus, with the required information reported in bits.
- **Annotation hygiene where annotations are gameplay.** `readOnlyHint` on every non-mutating tool. `untrustedContentHint` on `read_manual`, `read_station_log`, and `read_note` — each of which returns content that is, in fiction and in fact, of uncertain provenance and actively adversarial in at least one chamber.
- **Correct, current API usage.** `document.modelContext` with a `navigator` fallback, `AbortSignal`-only teardown, feature detection with a graceful gate, and a dated `spec-notes.md` recording exactly what we verified and when.
- **Descriptive, recoverable errors.** Every failure returns text the agent can act on — *"KEEPER cannot reach lever_c: the grate is closed. Open it first."* — never a bare rejection.

### Execution — target: complete product, not prototype

Two bars, not one:

1. **A stranger with ChatGPT can open the URL and finish the game without instructions from us.**
2. **A judge who gives us ninety seconds and never types anything still sees the whole idea.** Attract mode, a spectate button, chamber deep links, and an information-rich gate screen for browsers without WebMCP. Doc 07 §6 treats the impatient path as a designed surface.

### Potential Impact — target: convert the game's weakness into a strength

See §4.

### Creativity & Ambition — target: unambiguous top tier

The concept is defensibly novel, the execution is ambitious, and the aesthetic swing is large. v1 of this document said this criterion needed the least incremental effort. That was directionally right and factually risky: games are a moderately saturated bucket, and a judge who has already reviewed four WebMCP games may not arrive primed to be impressed. The three creative moves in §1 are what turn "another WebMCP game" into the one with the ghost sessions and the agent whose body changes. They are cheap. Take them.

---

## 4. The Impact argument, in three tiers

Ordered from most defensible to most ambitious, so that a judge who rejects tier 3 still lands on tier 1.

### Tier 1 — A design principle (unimpeachable, free)

> **An agent's tool surface and a human's UI surface do not have to be the same surface, and the space where they diverge is a legitimate design space.**

This generalises immediately and obviously:

- **Progressive disclosure by role** — an admin's UI and an admin's agent tools need not match.
- **Capability scoping by auth state** — dynamic registration as an authorisation mechanism, not just a convenience.
- **Security boundaries** — deliberately exposing *less* through tools than through UI, for actions where an agent should not have parity.
- **Privacy** — exposing *differently*: aggregates through tools, raw data only on screen. A tool surface as a privacy boundary.

Every one of those is a real pattern real applications will need. Semaphore is the existence proof, taken to its extreme so the principle is visible. This claim costs nothing to assert and cannot be dismissed as a stretch.

### Tier 2 — An empirical demonstration (cheap, visceral)

Run the game under three conditions and publish the bar chart:

| Condition | Chambers cleared |
|---|---:|
| Agent alone — full tool access, no PILOT | **0%** |
| Human alone — full room access, no KEEPER | **0%** |
| Human + agent together | **~78%** |

Three bars, two at zero. That is the entire thesis, empirically demonstrated, understood in one second. It is the companion to the Possible-Worlds Proof: one shows it mathematically, the other shows it experimentally.

The ablation runs are also the *cheapest* thing in the benchmark suite, because the solo conditions terminate quickly. Run them first. This is the highest value-per-token output in the project.

### Tier 3 — An instrument (ambitious, hedged)

**Every agent benchmark that currently matters measures an agent working alone.** WebArena, WebVoyager, GAIA, SWE-bench — each poses a task, hands it to an agent, and measures autonomous completion. That made sense when the open question was whether agents could act at all.

But the near-future of agentic software is not autonomy. It is exactly what this hackathon's own prompt describes: *"an app that becomes meaningfully better when people and their agents can use it together."* And there is essentially **no standard instrument for measuring how well a human and an agent perform jointly when neither has complete information** — grounding on a partner's description, asking rather than guessing, volunteering hidden state unprompted, recovering when the partner is wrong.

Semaphore, because the asymmetry is architecturally enforced and every session is fully logged server-side, is a reproducible measurement environment for that capability. We ship it as the **Semaphore Cooperative Benchmark (SCB)**.

**And we get in front of its one real vulnerability.** The harness uses scripted PILOT partners (`oracle`, `vague`, `slow`, `wrong`) for reproducibility. A sharp judge will notice that if a script can play PILOT, the human is apparently not load-bearing after all — our own harness appearing to refute our central claim. The answer, stated first rather than defensively:

> The scripted partners do not replace the human. They hold the human's **information content** fixed so we can vary its **quality**. What SCB measures is not "can an agent solve Semaphore" — it is **partner-sensitivity: how much joint performance degrades as the partner degrades.**

That is a better research question, and one nobody is asking. The interesting number is the gap between `oracle` and `vague`, not the absolute score under `oracle`. A model that scores 95% with a perfect partner and 30% with a vague one is *worse*, for real human-agent collaboration, than one that scores 80% and 70%. That is a novel, defensible claim, and it is what the write-up leads with.

**Honesty constraint.** A benchmark validated on one game with a few hundred sessions is a *proposal for* an instrument, not an established one, and the write-up must say so. Overclaiming to a panel containing three distinguished engineers is a losing trade; a carefully-framed proposal with real preliminary numbers and published raw data is a winning one.

### Ordering in the submission text

Lead with the **design principle**. Support it with the **game**. Prove it with the **ablation**. Offer the **benchmark** as work-in-progress with preliminary numbers. That ordering is strictly more robust than leading with the benchmark, because each tier stands if the one above it is rejected.

---

## 5. Naming

**Semaphore** carries two etymologies, and both are exactly the game:

1. **Greek** *sêma* (sign) + *-phoros* (bearer) — "sign-bearer." A signalling system for communicating across a distance when voice cannot carry: flags, arms, lamps. Two parties who cannot share a world, coordinating through an agreed code. That is the fiction.
2. **Computer science** — Dijkstra's semaphore, the synchronisation primitive letting two concurrent processes coordinate access to shared state without corrupting it. That is the *architecture*: the server genuinely runs a single-permit semaphore, and the failure states are named after concurrency bugs.

A name that is simultaneously a perfect thematic fit and a perfect technical pun, aimed at an audience of distinguished engineers, is worth more than a mythological name chosen for vibes. It gives us free vocabulary throughout:

- Running out of time → **DEADLOCK**
- Three failed actions → **RACE CONDITION**
- The sustained joint action in Chamber III → **ACQUIRING THE LOCK**
- The session → a **critical section**
- Tagline → **"Two processes. One lock. Don't deadlock."**

The avatars are **PILOT** (the human, amber) and **KEEPER** (the agent, cyan).

**One practical note:** "Semaphore" collides with a well-known CI product in search. Always ship the wordmark locked to the tagline, secure a distinctive domain, and use the split-lamp mark aggressively so recognition is visual rather than lexical.

---

## 6. Scope discipline

The governing principle:

> **Four excellent chambers beat ten mediocre ones.**

**In scope:** a tutorial chamber plus three full chambers; the Archive transition beat; server-authoritative state; the cross-origin archive; full pixel art and animation including KEEPER's anatomy; adaptive audio and the `AUDIBLE` channel; full accessibility; the replay viewer as both instrument and mechanic; attract mode and the judge path; the ablation with real numbers; and a first cut of SCB across at least two model backends.

**Out of scope, and stated as future work:** additional chambers; the role-inversion chamber (compelling, expensive); human-human-agent modes; a level editor; mobile layouts beyond "it doesn't break"; and ARCHIVE mode (ghosts drawn from real player sessions rather than authored ones) — which is a genuinely lovely idea and a post-submission feature.

Every item in doc 08's checklist is sequenced so that stopping at any checkpoint leaves a coherent, demoable product.

---

## 7. Risk register

Ordered by how much they should worry us.

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R1** | **Puzzle quality.** The engineering can be flawless and the game still boring. Asymmetric puzzles are notoriously hard to tune, and the failure is invisible until someone plays it. **This is the only risk that does not parallelise with more compute.** | **Critical** | Paper-prototype all four chambers with two humans before writing any game code. Recruit testers *before* the build starts and schedule around their availability. Minimum three tuning passes per chamber with fresh testers each time. |
| **R2** | **Agent behavioural variance and disengagement.** Models play very differently. Worse: an agent may never engage at all, or may drop character and offer to "help you play this game." | **Critical** | Doc 04 exists entirely for this. The landing page registers exactly one tool (`begin_shift`) so the agent has an obvious front door; descriptions carry framing; `get_status` is a cheap re-orientation call. Test against ≥3 backends. Pre-record the video. |
| **R3** | **Impact scoring.** A judge may read it as "a game" and mark Impact down regardless of framing. | High | The three-tier argument (§4). Lead with the design principle. Put the ablation chart on the landing page, in the README, and in the video. |
| **R4** | **Chamber III timing.** The finale depends on coordination across an agent's reasoning latency, which is high and highly variable. | High | Redesigned as a sustained duet with a ~20s stamina window rather than a 4s instant (doc 02 §3.4). The window is **derived at runtime from the agent's measured latency in Chambers 0–II.** |
| **R5** | **The agent "cheating" by reading the page.** An agent with DOM or screenshot access could bypass the asymmetry. | Medium | Server-authoritative state means the solution is not in the client. Puzzle-critical visuals render to canvas, not DOM. Residual screenshot risk is real and is **documented honestly** rather than denied (doc 03 §9). |
| **R6** | **Spec churn.** WebMCP is a moving draft; it has already moved `modelContext` from `navigator` to `document` and removed `unregisterTool`. Several claims in our own v1 docs turned out to be disputed. | Medium | All spec contact isolated in one adapter module. Feature-detect both entry points. Settle every disputed claim empirically in Phase 0 and record it in `11-spec-notes.md` with a date and Chrome version. Re-run the spike the day before submitting. |
| **R7** | **Canvas accessibility.** Pixel games are typically inaccessible, and one judge is a Chrome distinguished engineer whose public work is substantially about this. Shipping an inaccessible canvas game to that panel is a self-inflicted wound. | Medium | Full keyboard control, screen-reader mirror, text mode, colourblind-safe palette with shape redundancy, reduced motion, adjustable and removable timer. Doc 07 §5. |
| **R8** | **Scope creep via art.** Pixel art is a bottomless time sink and the most tempting thing to keep polishing. | Medium | Fixed asset budget and a locked palette before any sprite work. Placeholder-first: every chamber ships greybox and playable before any final art lands. |
| **R9** | **Cross-origin delegation fails in ChatGPT's in-app browser.** The archive-origin design depends on `allow="tools"` working there, which is unverified. | Medium | Test in the Phase 0 spike, before committing. Keep a single-origin fallback behind a build flag so the feature can be dropped without a rewrite. |
| **R10** | **The three-minute video.** There is a lot to show and very little time. A bad video sinks a good project, and some judges will score from it alone. | Medium | Doc 09 is a full script, storyboarded before Phase 3, and it **drives feature priority** — anything unshowable is deprioritised. Every live-agent shot has a pre-recorded fallback. |
