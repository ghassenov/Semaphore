# SEMAPHORE
### Two processes. One lock. Don't deadlock.

A cooperative asymmetric-information escape game for the human–agent era, built on WebMCP.
Submission target: **The WebMCP Challenge** (Devpost, deadline **Sep 3, 2026 @ 1:00pm PDT**).

---

## The pitch in one paragraph

You and your AI agent are locked in a derelict signal station. You each control a pixel avatar in the same room — but you perceive different worlds. **You** see the room: glyphs glowing on a panel, needles twitching on gauges, a symbol carved into a door. **Your agent** cannot see any of it. What the agent has instead is the station's maintenance manual, the ability to reach into hidden mechanisms behind the walls, and the hands to pull the levers you cannot reach. Neither of you can escape alone. The only way out is to talk — you describing what you see, the agent decoding what it means, and both of you acting in concert before the timer runs out. Each chamber you clear rewrites the agent's tool surface in real time: old capabilities burn away, new ones stamp in.

---

## Why this wins

The single hardest thing to do in this hackathon is score high on **all four** criteria at once. Most entries pick a lane: a slick commerce demo scores Execution but not Creativity; a wild art piece scores Creativity but not Impact. Semaphore is built so that the *same* design decision scores on multiple axes simultaneously.

| Criterion | How Semaphore scores |
|---|---|
| **WebMCP Leverage** | The dynamic tool surface is the *game mechanic*, not decoration. Two-tier `AbortSignal` lifecycles, the `toolchange` event driving diegetic UI, tool-scoped state projection enforced by test, correct `readOnlyHint`/`untrustedContentHint` on every tool. This is the deepest possible use of the spec's rarest feature. |
| **Execution** | A complete, polished, playable product with a real server-authoritative backend, three finished chambers, sound, animation, accessibility, and a replay viewer — not a tech demo. |
| **Potential Impact** | The **Semaphore Cooperative Benchmark**: the game doubles as a reproducible instrument for measuring human–agent joint performance under information asymmetry, a thing no existing agent benchmark measures. This converts "it's just a game" into "it's an instrument that happens to be fun." |
| **Creativity & Ambition** | Nothing in the WebMCP ecosystem looks remotely like this. It is the only concept where the *shape of the tool registry over time* is the load-bearing creative idea. |

**The unfair advantage:** the judging panel includes Sarah Drasner (Distinguished Engineer, Chrome — whose public body of work is essentially "expressive animation on the web"), Justin Rushing (Browser Platform Lead, OpenAI), and Alex Nahas (creator of MCP-B). A gorgeously animated, spec-faithful, deeply-instrumented game about the tool registry itself is aimed directly at that room.

---

## The document set

Read in order. Each document is self-contained but assumes the ones before it.

| # | Document | What it settles |
|---|---|---|
| **01** | [Concept & Strategy](./01-concept-strategy.md) | The core creative thesis, competitive positioning against the existing showcase, the judging-criteria attack plan, and an honest risk register |
| **02** | [Game Design Document](./02-game-design.md) | Fiction, the three chambers in full puzzle detail, pacing, failure states, difficulty tuning, and the anti-brute-force design |
| **03** | [WebMCP Tool Architecture](./03-webmcp-tool-architecture.md) | Every tool schema, the two-tier lifecycle, the `toolchange` choreography, the Asymmetry Invariant, and the security model |
| **04** | [Technical Architecture](./04-technical-architecture.md) | Stack decisions with justification, client/server split, the authoritative state machine, data model, project structure |
| **05** | [Art Direction & Brand](./05-art-direction-brand.md) | Palette-as-information-architecture, the two avatars, logo, animation language, sound design |
| **06** | [Engineering Axes](./06-engineering-axes.md) | The Cooperative Benchmark, observability, performance & cost budgets, accessibility, testing strategy, deployment |
| **07** | [Implementation Checklist](./07-implementation-checklist.md) | The full end-to-end build plan as a tickable checklist, sequenced so every checkpoint is demoable |

---

## The three decisions that define the project

Everything else follows from these. They are argued in full in the documents above; stated here so the shape is clear from the start.

**1. The asymmetry is enforced by architecture, not by convention.**
Every fact in the world state carries a visibility channel — `VISUAL`, `TOOL`, or `SHARED`. Two pure projection functions derive what the human sees and what the agent's tools return. A test asserts that no `VISUAL`-channel field can ever escape through the agent projection. The game is *structurally incapable* of letting either party solve a chamber alone. (See [03](./03-webmcp-tool-architecture.md#the-asymmetry-invariant).)

**2. The authoritative state lives on the server, not the client.**
A Cloudflare Durable Object holds one session's truth. The client never possesses the solution, so no amount of DevTools spelunking or DOM scraping reveals it. This also makes the timer tamper-proof, gives us free replay logs for the benchmark, and lets the human play on a laptop while the agent drives from ChatGPT on a phone. (See [04](./04-technical-architecture.md).)

**3. Colour *is* the information architecture.**
Amber means "only the human can perceive this." Cyan means "only the agent can perceive this." Bone-white means shared. This holds across the entire game — room lighting, UI chrome, the two avatars, the logo. A judge watching the demo video understands the entire epistemics of the game in four seconds without being told. (See [05](./05-art-direction-brand.md).)

---

## Stack at a glance

- **Client:** Phaser 4.2 + TypeScript + Vite. Canvas/WebGL2 pixel rendering, `pixelArt: true`, integer-scaled.
- **Agent surface:** WebMCP imperative API — `document.modelContext.registerTool(tool, { signal })`, `AbortSignal`-only teardown, `toolchange` listener.
- **Server:** Cloudflare Workers + Durable Objects (one DO per session), WebSocket for state push.
- **Audio:** Web Audio API, adaptive chiptune tension layers.
- **Benchmark harness:** Node CLI driving headless sessions against multiple model backends.

---

## Status of this document set

These are design and planning documents, written before implementation. They record decisions and their justifications so that the build phase is execution rather than deliberation. Where a decision is genuinely uncertain, it is flagged as **OPEN** rather than papered over — see the risk register in [01](./01-concept-strategy.md#risk-register) and the open questions at the end of [04](./04-technical-architecture.md).

The one thing worth saying plainly up front: the biggest risk here is not technical, it is **puzzle quality**. Three excellent chambers beat ten mediocre ones, and no amount of engineering rigour rescues a puzzle that isn't fun to talk through. The checklist in [07](./07-implementation-checklist.md) front-loads paper prototyping and playtesting for exactly this reason.