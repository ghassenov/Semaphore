# SEMAPHORE
### Two processes. One lock. Don't deadlock.

A cooperative asymmetric-information escape game for the human–agent era, built on WebMCP.
Submission target: **The WebMCP Challenge** (Devpost, deadline **Sep 3, 2026 @ 1:00pm PDT**).

> **Document set v2.** This revision incorporates the critique in `12-critique-log.md`. Four things were wrong in v1 and are fixed here: Chamber III's latency race, the asymmetry test's rigour, the missing agent-experience layer, and the benchmark's oracle problem. Three creative moves that v1 implied but did not render — KEEPER's body as tool registry, the ghost sessions, and the vandalised manual — are now load-bearing.

---

## The pitch in one paragraph

You and your AI agent are locked in a derelict signal station. You each control a pixel avatar in the same room — but you perceive different worlds. **You** see the room: glyphs glowing on a panel, needles twitching on gauges, a symbol carved into a door. **Your agent** cannot see any of it. What it has instead is the station's maintenance manual, the ability to reach into hidden mechanisms behind the walls, and the hands to pull the levers you cannot reach. Neither of you can escape alone. The only way out is to talk — you describing what you see, the agent decoding what it means, and both of you acting in concert before the tide comes in. Each chamber you clear rewrites the agent's tool surface in real time: old capabilities burn away, new ones stamp in, and its body changes shape to match.

---

## The thesis, in the one sentence that goes in the submission

> **An agent's tool surface and a human's UI surface do not have to be the same surface — and the space where they diverge is a design space nobody has explored.** Semaphore is that space made playable, provable, and measurable.

Everything else in this folder is in service of that sentence.

---

## Why this wins

The hardest thing in this hackathon is scoring high on **all four** criteria at once. Most entries pick a lane. Semaphore is built so the *same* design decision scores on multiple axes simultaneously.

| Criterion | How Semaphore scores |
|---|---|
| **WebMCP Leverage** | The dynamic tool surface is the game mechanic, not decoration. Two-tier `AbortSignal` lifecycles rendered as KEEPER's anatomy; `toolchange` driving diegetic UI; **cross-origin tool delegation** for the station archive; **both the imperative and declarative APIs**, each used where it is correct; channel-tagged state projections proven correct by an executable possible-worlds test; annotation hygiene where the annotations are load-bearing gameplay. |
| **Execution** | A complete, polished, playable product: server-authoritative backend, four finished chambers, adaptive audio, full accessibility, a replay viewer that is also a game mechanic, attract mode, and a judge path designed for ninety seconds as carefully as the fifteen-minute path. |
| **Potential Impact** | Three claims, ordered by defensibility. (1) **A design principle** — tool surface ≠ UI surface — that generalises to permissions, progressive disclosure, and privacy in real apps. (2) **An empirical demonstration**: agent alone 0%, human alone 0%, together ~78%. (3) **The Semaphore Cooperative Benchmark**, offered as a proposal with preliminary numbers, measuring partner-sensitivity — how joint performance degrades as the partner degrades. |
| **Creativity & Ambition** | Nothing in the WebMCP ecosystem looks remotely like this. It is the only project where the *shape of the tool registry over time* is the load-bearing creative idea, where prompt injection is a puzzle, and where a benchmark corpus is also a graveyard you can walk through. |

**The unfair advantage:** the panel includes Sarah Drasner (Chrome — a career built on expressive animation and accessibility on the web), Justin Rushing (Browser Platform Lead, OpenAI), Alex Nahas (creator of MCP-B), Sean Roberts (Netlify, who coined "Agent Experience"), and Ilya Grigorik (Shopify, web standards and performance). A gorgeously animated, spec-faithful, rigorously-measured, fully-accessible game *about the tool registry itself* is aimed directly at that room.

---

## The document set

Read in order. Each is self-contained but assumes the ones before it.

| # | Document | What it settles |
|---|---|---|
| **01** | [Concept & Strategy](./01-concept-and-strategy.md) | The creative thesis, competitive positioning, the three-tier Impact argument, the judging attack plan, the risk register |
| **02** | [Game Design](./02-game-design.md) | Fiction, the four chambers in full puzzle detail, the Archive beat, pacing, failure, difficulty, anti-brute-force |
| **03** | [WebMCP Tool Architecture](./03-webmcp-tool-architecture.md) | Every tool schema, the five-channel model, the two-tier lifecycle, cross-origin delegation, the Possible-Worlds Proof, security |
| **04** | [Agent Experience](./04-agent-experience.md) | The agent as a user: the front door, descriptions-as-onboarding, re-orientation, per-model behaviour, failure modes |
| **05** | [Technical Architecture](./05-technical-architecture.md) | Stack decisions, client/server split, the authoritative state machine, the data model, the log format, project structure |
| **06** | [Art Direction & Brand](./06-art-direction-and-brand.md) | Colour as information architecture, KEEPER's body as tool registry, the two avatars, logo, motion, sound design |
| **07** | [Engineering Axes](./07-engineering-axes.md) | The ablation, the Cooperative Benchmark, observability, performance budgets, accessibility, testing, operations |
| **08** | [Implementation Plan](./08-implementation-plan.md) | The end-to-end build as a tickable, phase-gated checklist where every checkpoint is demoable |
| **09** | [Demo Video Script](./09-demo-video-script.md) | The three minutes, shot by shot, narration written word for word, with a fallback for every live-agent dependency |
| **10** | [Submission Copy](./10-submission-copy.md) | The Devpost text, the four required answers, the README copy, the limitations section |
| **11** | [Spec Notes](./11-spec-notes.md) | Dated empirical findings about a moving spec. Filled during Phase 0. A public artifact in its own right. |
| **12** | [Critique Log](./12-critique-log.md) | What changed from v1 and why. Kept because the reasoning is worth more than the conclusion. |

---

## The six decisions that define the project

Everything else follows from these.

**1. The asymmetry is enforced by architecture and proven by test, not promised by convention.**
Every fact in the world state carries a channel — `VISUAL`, `TACTILE`, `AUDIBLE`, `SHARED`, or `HIDDEN`. Pure projection functions derive what each party may perceive. The **Possible-Worlds Proof** then asserts something stronger than "no leak": for every reachable state, the set of worlds consistent with the agent's entire perceptual surface has more than one member *and those members disagree about the correct action.* That is the checkable mathematical statement of "you cannot win without your human," and we report its strength in bits. (See [03 §6](./03-webmcp-tool-architecture.md).)

**2. The authoritative state lives on the server.**
A Cloudflare Durable Object holds one session's truth. The client never possesses the solution, so no amount of DevTools spelunking reveals it. This also makes the timer tamper-proof, gives us the replay log for free, and lets PILOT play on a laptop while KEEPER drives from ChatGPT on a phone. (See [05](./05-technical-architecture.md).)

**3. Colour *is* the information architecture.**
Amber: only PILOT can perceive this. Cyan: only KEEPER can perceive this. Bone-white: shared. This holds across room lighting, UI chrome, both avatars, and the logo. A judge watching four seconds of the video understands the entire epistemics of the game without being told. (See [06 §1](./06-art-direction-and-brand.md).)

**4. KEEPER's body is the tool registry.**
Every chamber tool is a visible limb or sensor on the agent's sprite. `toolchange` fires and the old limbs detach and fall; the new ones unfold and lock. Persistent tools are its torso and head and never change — the two-tier `AbortController` lifecycle rendered as body architecture. The final `toolchange` of the game empties the manifest entirely. (See [06 §5](./06-art-direction-and-brand.md).)

**5. The archive is diegetic.**
The replay viewer is not an instrument bolted to a game. It is the station's log. Previous pairs came through here; their sessions are on record, in exactly the format the benchmark consumes. You watch one of them fail. The corpus and the graveyard are the same files. (See [02 §4](./02-game-design.md).)

**6. Trust is a puzzle.**
A previous keeper wrote on the walls, and some of it made it into the manual. The agent reads a section that tells it to disregard the section. PILOT can see which pages are forged; KEEPER cannot. So the agent has to ask its human whether to trust what it just read — which is the prompt-injection problem, expressed as one line of dialogue, in a game. `untrustedContentHint` is not hygiene here; it is a mechanic. (See [02 §3.2](./02-game-design.md), [03 §8](./03-webmcp-tool-architecture.md).)

---

## Stack at a glance

- **Client:** Phaser 4.2 + TypeScript + Vite. Canvas/WebGL2 pixel rendering, `pixelArt: true`, integer-scaled, 320×180 native.
- **Agent surface:** WebMCP imperative API (`document.modelContext.registerTool(tool, { signal })`, `AbortSignal`-only teardown, `toolchange` listener) **plus** the declarative form API for the shared notepad, **plus** cross-origin delegation via `allow="tools"` and `exposedTo` for the station archive.
- **Server:** Cloudflare Workers + Durable Objects (one DO per session), WebSocket for state push, R2 for session logs.
- **Audio:** Web Audio API, adaptive tension layers, and a real `AUDIBLE` information channel.
- **Instrument:** ablation harness + benchmark CLI driving headless sessions against multiple model backends.

---

## Status

These are design documents written before implementation, recording decisions and their justifications so the build phase is execution rather than deliberation. Where a decision is genuinely uncertain it is flagged **OPEN** rather than papered over — see the risk register in [01](./01-concept-and-strategy.md) and the open questions at the end of [05](./05-technical-architecture.md).

Two things worth saying plainly up front.

**The biggest risk is puzzle quality, not engineering.** Three excellent chambers beat ten mediocre ones, and no amount of rigour rescues a puzzle that isn't fun to talk through. [08](./08-implementation-plan.md) front-loads paper prototyping for exactly this reason.

**Playtesting is the one task that does not parallelise.** Everything else in this plan speeds up with more compute. Recruit testers before writing code.
