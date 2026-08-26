# 01 — Concept & Strategy

---

## 1. The creative thesis

Almost every WebMCP demo built so far answers the same question: *how do I let an agent do my task faster?* The agent is a labour-saving device pointed at a form, a cart, or a search box. That is a perfectly good question, and it is also why the showcase is starting to feel same-y — storefronts, booking flows, dashboards.

Semaphore asks a different question: **what if the agent and the human genuinely need each other?**

Not "the agent helps." Not "the agent automates." *Need.* A relationship where the human possesses information the agent cannot obtain, the agent possesses capability the human cannot exercise, and the task is impossible unless both are true at once. That relationship has a name in game design — **asymmetric cooperative play** — and its canonical expression is *Keep Talking and Nobody Explodes*, where one player sees a bomb and the other holds the manual, and the entire game is the frantic conversation between them.

WebMCP is, structurally, a machine for producing exactly that asymmetry. A tool is a slice of application state and capability that the page chooses to expose to the agent and to nobody else. The human's slice is the rendered screen. **Those two slices do not have to be the same slice.** Every existing demo makes them the same slice — the agent's tools mirror the UI. Semaphore is the first thing to notice that the interesting design space is where they *diverge*.

That is the whole idea, and it is worth stating in one sentence because it is the sentence that goes in the Devpost submission:

> Semaphore is a game in which the gap between what the agent can see and what the human can see is not a limitation to be engineered away — it is the entire playable surface.

### The second-order idea: the tool surface as a mutable object

There is a second creative move layered on top. In every existing demo, the tool registry is essentially static — it reflects the current route and otherwise sits still. WebMCP's `AbortSignal` teardown and `toolchange` event exist to support dynamism, and effectively nobody is exercising them meaningfully.

In Semaphore, **clearing a chamber destroys the agent's current capabilities and grants it new ones.** The agent that solved Chamber I literally cannot perform Chamber I's actions anymore. Its hands have been swapped out. This is dramatised on screen: a diegetic "TOOL MANIFEST" panel bolted to the wall of the station, driven by a real `toolchange` listener, which visibly burns away the old tool names and stamps in the new ones as the door grinds open.

That is the demo video's money shot, and it is a live, honest demonstration of the least-explored part of the spec.

---

## 2. Competitive positioning

### What already exists

The WebMCP showcase and community demos as of late August 2026 cluster into five buckets:

| Bucket | Representative demos | Saturation |
|---|---|---|
| Commerce / storefront | Kurio, Verdant Market, Luxe Leather, zaMaker, Shoe Store | **Very high** |
| Travel / booking | Wandernote, flight-search, Le Petit Bistro, Mabel's Table, L'Atelier | **Very high** |
| Games / puzzles | The Archive, Crossword Desk, Mystery Doors, WebMCP Maze, Cubecade, Blackjack | **Moderate** |
| 3D / creative tools | Codex Modeling Studio, Material Lab, Paperie, Webroom | High |
| Docs / data | Margin, Duckboard | Low |

Games are a *populated* bucket, which is worth being honest about — this is not virgin territory. So the positioning has to be sharper than "we made a game."

### How Semaphore differs from the existing games

- **The Archive / Mystery Doors** are single-thread narrative mysteries. The agent is a *solver* operating on information it can fully obtain through tools. There is no asymmetry; there is just a puzzle with a tool-shaped interface.
- **Crossword Desk / Blackjack / WebMCP Maze** are classic games with a tool wrapper. The agent could play them alone. The human is optional.
- **Semaphore is the only one where the human is load-bearing.** Remove the human and the agent is blind and cannot progress past the first panel. Remove the agent and the human has no manual and no hands for the hidden mechanisms. The game does not degrade without both — it *stops*.

That is a genuinely defensible differentiation claim and it should be stated explicitly in the submission text, because "we made a game" invites a shrug and "we made the only game where the agent cannot win without you" does not.

### The risk this positioning carries

Games score lower on **Potential Impact** by default. A judge asked "does this solve a real problem for a real audience?" has an easy time with a benefits-claim cockpit and a harder time with an escape room. This is the single biggest scoring vulnerability and it needs a real answer, not a hand-wave.

The answer is in §4.

---

## 3. Judging-criteria attack plan

### WebMCP Leverage — target: highest in the field

Concrete, verifiable claims we will be able to make:

- **Two-tier tool lifecycle.** A game-lifetime `AbortController` owns persistent tools (`get_timer`, `read_manual`, `describe_chamber`, `write_note`); a per-chamber controller owns chamber-specific tools. Solving a chamber aborts one tier while leaving the other intact. This is a nuanced use of a teardown mechanism most demos never touch.
- **`toolchange` as a first-class UI driver.** We listen to the event on `document.modelContext` and render the manifest panel from actual registry state, rather than maintaining a parallel guess.
- **Tool-scoped state projection, enforced by test.** The Asymmetry Invariant (doc 03) is an executable property, not a promise.
- **Annotation hygiene throughout.** `readOnlyHint: true` on every non-mutating tool; `untrustedContentHint: true` on `read_note` and any tool returning human-authored text, because the human is an untrusted content source relative to the agent — which in this game is not a hypothetical but a live gameplay consideration.
- **Correct, current API usage.** `document.modelContext` (not the Chrome-150-deprecated `navigator.modelContext`), `AbortSignal`-only unregistration (there is no `unregisterTool` in the current draft), feature detection with graceful degradation.
- **Descriptive, recoverable errors.** Every failure returns text the agent can act on — `"KEEPER cannot reach lever_c: the grate is closed. Open it first."` — rather than a bare rejection.

### Execution — target: complete product, not prototype

The bar we hold ourselves to: **a stranger can open the URL in ChatGPT's in-app browser and finish the game without reading any instructions from us.** That implies a real tutorial chamber, real onboarding, real audio, real failure/retry flows, real polish on the in-between moments. Doc 07's checklist treats "the 40 seconds between chambers" as a first-class deliverable rather than a transition.

### Potential Impact — target: convert the game's weakness into a strength

See §4. This is where the project either wins or gets marked down.

### Creativity & Ambition — target: unambiguous top tier

The concept is defensibly novel (§2), the execution is ambitious (server-authoritative multiplayer-style architecture for a single-player-plus-agent game), and the aesthetic swing is large. This criterion is the one we are least worried about, and consequently the one we should spend the *least* incremental effort on — the marginal return is higher elsewhere.

---

## 4. The Impact answer: Semaphore as an instrument

Here is the move that fixes the games-score-low-on-impact problem.

**Every agent benchmark that currently matters measures an agent working alone.** WebArena, WebVoyager, GAIA, SWE-bench — all of them pose a task, hand it to an agent, and measure whether the agent completed it autonomously. This made sense when the open question was "can agents do things at all."

But the actual near-future of agentic software is not autonomy. It is exactly what this hackathon's own prompt describes: *"an app that becomes meaningfully better when people and their agents can use it together."* And there is essentially **no standard instrument for measuring how well a human and an agent perform jointly when neither has complete information.** That capability — grounding on a partner's description, asking clarifying questions when a description is ambiguous, communicating one's own hidden state proactively, recovering from a partner's error — is close to unmeasured, and it is precisely the capability that agent-native web apps will live or die on.

Semaphore, because it is architecturally rigorous about the asymmetry and because every session is fully logged server-side, is a reproducible measurement environment for that capability. We ship it as the **Semaphore Cooperative Benchmark (SCB)**:

- A fixed suite of chamber configurations with seeded randomisation.
- A headless harness that drives sessions against different model backends with a scripted or human-in-the-loop partner.
- Metrics: chamber completion rate, tool calls per solve, *wasted* tool calls (calls that could not possibly have succeeded given the information the agent held), clarifying questions asked, time-to-solve, and communication turns.
- Published results comparing several current models, plus the raw session logs.

This reframes the entire submission. The Devpost text does not say "we made a game." It says:

> We built an instrument for measuring human–agent collaboration under information asymmetry — a capability no existing agent benchmark measures — and we made it a game so that people would actually generate data for it.

That is a credible, specific case for a real problem and a real audience (agent developers, evaluation researchers, and the WebMCP working group itself). And the "real audience" claim is verifiable, because we will publish the harness and the numbers.

**Important honesty constraint:** we must not overclaim. A benchmark validated on one game with a handful of sessions is a *proposal for* an instrument, not an established one. The write-up should say so. Overclaiming to a panel that includes three distinguished engineers is a losing trade; a well-framed proposal with real preliminary numbers is a winning one.

---

## 5. Naming and why it is unusually good

**Semaphore** carries two etymologies, and both are exactly the game:

1. **Greek** *sêma* (sign) + *-phoros* (bearer) — "sign-bearer." A semaphore is a signalling system for communicating across a distance when voice cannot carry: flags, arms, lamps. Two parties who cannot directly share their world, coordinating through an agreed code. That is the fiction.

2. **Computer science** — Dijkstra's semaphore, the synchronisation primitive that lets two concurrent processes coordinate access to shared state without corrupting it. That is the *architecture*: the server genuinely uses an action mutex, and the failure states are named after concurrency bugs.

A name that is simultaneously a perfect thematic fit and a perfect technical pun, aimed at an audience of distinguished engineers, is worth a lot more than a mythological name chosen for vibes. It also gives us free vocabulary throughout the product:

- Running out of time → **DEADLOCK**
- Three failed actions → **RACE CONDITION**
- Both parties acting in the required simultaneous window → **ACQUIRING THE LOCK**
- The session → a **critical section**
- Tagline → **"Two processes. One lock. Don't deadlock."**

The avatars are **PILOT** (the human, amber) and **KEEPER** (the agent, cyan). Full brand treatment in doc 05.

---

## 6. Scope discipline

The stated intent is a production-quality, well-engineered build rather than a hackathon sprint, and the documents reflect that. But scope discipline still matters, and the governing principle is:

> **Three excellent chambers beat ten mediocre ones.**

Concretely, the following are **in scope**: a tutorial chamber plus three full chambers, server-authoritative state, full pixel art and animation, adaptive audio, accessibility, the replay viewer, and a first cut of the benchmark harness with real numbers for at least two model backends.

The following are explicitly **out of scope** for the submission and belong in a "future work" section: additional chambers beyond the third, the role-inversion chamber (compelling but expensive), multiplayer human-human-agent modes, a level editor, and mobile-optimised layouts beyond "it doesn't break."

Every item in doc 07's checklist is sequenced so that stopping at any checkpoint leaves a coherent, demoable product.

---

## Risk register

Stated plainly, with mitigations. These are ordered by how much they should worry us.

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R1** | **Puzzle quality.** The engineering can be flawless and the game still boring. Asymmetric puzzles are notoriously hard to tune — too easy is trivial, too hard is frustrating, and the failure is invisible until someone plays it. | **Critical** | Paper-prototype all three chambers with two humans (one playing "agent" reading a printed manual) *before writing any game code*. Doc 07 front-loads this. Budget at least three tuning passes with fresh testers. |
| **R2** | **Impact scoring.** Judges may still read it as "a game" and mark Impact down regardless of the benchmark framing. | High | Lead the Devpost text with the benchmark framing, not the game framing. Ship real numbers. Make the replay viewer prominent — it makes the instrument claim tangible. |
| **R3** | **Agent behavioural variance.** Different models will play very differently; a model that refuses to guess, or one that brute-forces, can make the game feel broken. Demo could fail live. | High | Design anti-brute-force into the rules (doc 02 §6). Tune manual text so it is unambiguous. Test against at least three model backends. Record the demo video rather than relying on a live run. |
| **R4** | **The agent "cheating" by reading the page.** An agent with DOM or screenshot access could bypass the asymmetry. | Medium | Server-authoritative state means the solution is not in the client at all. Puzzle-critical visuals render to canvas, not DOM. Residual risk (screenshots) is real and should be *documented honestly* rather than denied — see doc 03 §7. |
| **R5** | **Spec churn.** WebMCP is a moving draft; it has already moved `modelContext` from `navigator` to `document` and removed `unregisterTool` and `requestUserInteraction`. | Medium | Isolate all spec contact in a single adapter module (doc 04). Feature-detect both entry points. Pin and document the Chrome version tested against. |
| **R6** | **Canvas accessibility.** Pixel games are typically inaccessible, and one of the judges is a Chrome distinguished engineer. Shipping an inaccessible canvas game to that panel is a self-inflicted wound. | Medium | Full keyboard control, screen-reader mirror, colourblind-safe palette with shape redundancy, reduced motion, adjustable timer. Doc 06 §4. |
| **R7** | **Scope creep via art.** Pixel art is a bottomless time sink and the most tempting thing to keep polishing. | Medium | Fixed asset budget and a locked palette before any sprite work begins (doc 05). Placeholder-first pipeline: every chamber ships greybox and playable before any final art lands. |
| **R8** | **The three-minute video.** There is a lot to show and very little time. A bad video sinks a good project. | Medium | Storyboard the video *before* building, and let it drive feature priority — anything that cannot be shown in the video is a lower priority. Doc 07 has a dedicated video section. |