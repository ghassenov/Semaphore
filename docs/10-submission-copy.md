# 10 — Submission Copy

Draft early, revise through the build. Copy written on the last day is worse copy. Everything here is paste-ready and maps directly onto the four questions the Devpost form requires.

---

## 1. Project name

**Semaphore**

The FAQ explicitly warns against generic AI-chosen names. This one earns itself twice: *sêma-phoros*, "sign-bearer" — a signalling system for parties who cannot share a world — and Dijkstra's semaphore, the primitive that lets two concurrent processes coordinate without corrupting shared state. The server genuinely runs a single-permit semaphore. The failure states are named after concurrency bugs.

**Tagline:** *Two processes. One lock. Don't deadlock.*

Always lock the wordmark to the tagline — "Semaphore" alone collides with a CI product in search.

---

## 2. Elevator description (the top of the Devpost page)

> **An agent's tool surface and a human's UI surface do not have to be the same surface. Semaphore is what happens when they aren't.**
>
> You and your AI agent are locked in a derelict signal station. You can see every room and touch almost nothing. Your agent holds the manual, has hands inside the walls, and is completely blind. Neither of you gets out alone — and that isn't a design conceit, it's a property we prove: for every state in the game, the set of worlds consistent with your agent's entire perceptual surface has more than one member, and those members disagree about what it should do.
>
> We ran it three ways. Agent alone: **0%**. Human alone: **0%**. Together: **78%**.

*(Ablation chart immediately below.)*

---

## 3. The four required answers

### 3.1 Why this use case is a strong fit for WebMCP

WebMCP's defining property is that a page chooses what to expose to an agent. Every demo built so far uses that to make the agent's tools *mirror* the UI — the goal being for the agent to do what a human would have done. That treats the divergence between the two surfaces as an implementation detail to be minimised.

Semaphore treats it as the design space. The agent's tools deliberately expose a **different slice of application state** than the rendered page: it can feel a dial's detents but never see the gauge above it; it holds the manual the human cannot read; it reaches mechanisms behind a grate. The human sees glyph shapes, handwriting, needle positions, and the colour of ink.

This is only possible with WebMCP. Screen-scraping or DOM-driving an agent gives it, by construction, exactly what the human has. A structured tool layer is the first web technology that lets a page grant an agent a *genuinely different* view of itself — and therefore the first that makes asymmetric human-agent collaboration expressible at all.

It also let us use the parts of the spec almost nobody exercises, because the fiction demanded them before the spec suggested them:

- **Dynamic tool sets as a mechanic.** Clearing a chamber tears down the agent's tools and grants new ones, via `AbortSignal` teardown and re-registration.
- **Cross-origin tool delegation.** The station's archive — the manual and the logs of previous keepers — is a different document in a different place, so it is served from a different origin and composed at runtime with the `tools` Permissions Policy and `exposedTo`.
- **`untrustedContentHint` as gameplay.** The manual has been annotated by keepers who were not well. That annotation is not hygiene here; it is an attack the agent survives by asking its human.

### 3.2 How it creates a better user experience

The experience it creates is *conversation with a partner*, rather than delegation to a tool.

Concretely, several deliberate pieces of Agent Experience design:

- **The landing page registers exactly one tool**, `begin_shift`, whose description is the hook. An agent arriving at sixteen tools has a discovery problem; an agent arriving at one does not. Its parameter is the agent's own chosen name, which is used for the rest of the session.
- **A visible, copyable starter prompt** in the station's own voice. Every agent-native app will need one; nobody has designed a good one. Ours is a first-class UI element, and what the agent is told is printed in the README.
- **`get_status` is a re-orientation tool**, returning a compact situation report including a server-derived summary of what the pair has *demonstrably* established. An agent-native app should help its agent remember.
- **Errors are recoverable, never bare.** *"KEEPER cannot reach the key bank: the grate is closed."*
- **The agent's latency is made legible.** KEEPER's visor pulses for the full duration of every in-flight tool call, so the human can see their partner thinking rather than wondering if it froze. Chamber III's timing window is then *sized at runtime from the agent's measured latency*, so the finale works for a fast model and a slow one.
- **Every tool call has a sound.** The human hears their partner working behind the wall — and in one chamber, counting those sounds is how the puzzle is solved.

And it is fully accessible: keyboard-only, screen-reader mirrored, text mode, colourblind-safe with shape redundancy, reduced motion, and a removable timer.

### 3.3 What people and agents can do together that was difficult or impossible before

Three things.

**Collaborate under genuine information asymmetry.** Before WebMCP, an agent operating a web page saw what the page rendered. There was no mechanism for a page to grant an agent a *different* view — richer in some dimensions, poorer in others. Chamber II is the clearest case: the mapping from dials to gauges exists only on the server, in neither party's view. The human can see the gauges but cannot reach the dials; the agent can turn the dials but cannot see the result. The mapping can only be discovered by two parties describing their halves to each other. That is a genuinely new interaction, and it is not a metaphor for the future — it runs today, in the browser.

**Defend against untrusted content by consulting a human who can see what the agent cannot.** The vandalised manual is a prompt injection the agent cannot detect from its own view, and a forgery the human can spot instantly from the handwriting. The architecture that makes the game possible also makes the defence possible — and it points at a real pattern for real applications.

**Measure joint performance.** Because the asymmetry is architecturally enforced and every session is fully logged, Semaphore is a reproducible environment for measuring how a human and an agent perform *together* under partial information — grounding, clarification, recovery, caution around irreversible actions, resistance to injection. We ship the harness and the numbers.

### 3.4 How we implemented WebMCP

| Feature | Implementation | Where to look |
|---|---|---|
| **Three-tier tool lifecycle** | An entry `AbortController` for `begin_shift`; a session controller for persistent tools; a chamber controller torn down and rebuilt at every transition. The final `toolchange` of a session fires with an **empty registry** — that is the game's ending. | `src/webmcp/director.ts` |
| **`toolchange` driving two renderers** | One listener, reading real `getTools()` output, feeds both the in-world brass manifest panel *and* KEEPER's body, where each chamber tool is a visible limb that detaches and regrows. Neither is a parallel guess. | `src/webmcp/manifest-panel.ts`, `src/entities/KeeperBody.ts` |
| **Cross-origin delegation** | The archive is a separate origin registering `read_manual` and `read_station_log` with `exposedTo: [game origin]`, embedded via `<iframe allow="tools">`. Load-bearing fiction, not a demonstration. | `apps/archive/src/main.ts` |
| **Both APIs, with a rule** | Imperative for pure agent capability. **Declarative** for the shared notepad, which is a form a human can also submit; `SubmitEvent.agentInvoked` distinguishes who wrote each line. Our rule: *declarative where the agent and human use the same affordance, imperative where the agent does something the human structurally cannot.* | `src/hud/Notepad.ts` |
| **Channel-tagged state projections** | Every field is tagged `VISUAL`, `TACTILE`, `AUDIBLE`, `SHARED`, or `HIDDEN`. Two pure functions derive each party's view, on the server. Tool responses derive exclusively from one; rendered frames from the other. | `worker/src/projection.ts` |
| **The Possible-Worlds Proof** | For every reachable state across a seed corpus, we enumerate the worlds consistent with the agent's entire perceptual surface and assert (a) there is more than one and (b) they disagree about the correct action. The bits-per-chamber table in this README is generated by that same code. | `tests/possible-worlds.test.ts`, `worker/src/worlds.ts` |
| **Annotation hygiene where annotations are gameplay** | `readOnlyHint` on every non-mutating tool. `untrustedContentHint` on the three tools returning content of uncertain provenance — one of which actively attacks the agent. | `src/webmcp/tools.persistent.ts` |
| **Error taxonomy** | Seven codes, each returning text an agent can act on. `E_STALE_TOOL` exists as a defensive backstop for cached handles and its message actively re-orients. | `worker/src/errors.ts` |
| **Budgets enforced in CI** | Chrome's recommended 500 / 150 / 30 / 1500-character limits on descriptions, parameter descriptions, names, and outputs, as a lint rule that fails the build. | `eslint-rules/tool-budgets.js` |

---

## 4. Built with

TypeScript · Phaser 4.2 · Vite · WebMCP (`document.modelContext`, imperative + declarative + `exposedTo`) · Cloudflare Workers · Durable Objects · R2 · Cloudflare Pages · Web Audio API · Vitest · Playwright

---

## 5. Limitations, stated honestly

*A short section in both the README and the Devpost text. This panel rewards it.*

- **The asymmetry is a design contract at the tool layer, not a security boundary.** Authoritative state is server-side, `HIDDEN` fields never leave the Durable Object, and puzzle-critical visuals render to canvas rather than DOM — but an agent with screenshot capability could see the room. We cannot prevent that and we do not claim to. The contract is enforced rigorously at the layer WebMCP is actually about.
- **The screen-reader mirror is a deliberate trade-off.** It puts descriptive text in the DOM, which an agent with DOM access could scrape. We resolve it in favour of accessibility: it ships behind an explicit toggle, and we would rather document the tension than refuse to ship accessibility to protect a game rule.
- **The benchmark is a proposal, not an established instrument.** One game, a few hundred sessions. We think it measures something no existing benchmark measures, we have published our first evidence and all raw logs, and we would like to be told if we are wrong.
- **The scripted benchmark partners are not humans.** They hold the human's information content fixed so we can vary its quality. What we report is partner-sensitivity — the degradation curve — not a claim that a script can replace a person.
- **The ghost sessions shipped in the Archive are authored**, recorded during our own playtesting. Drawing them from real player sessions is post-submission work, made safe by the fact that the game collects no personal data at all.
- **We built against a moving draft.** `docs/11-spec-notes.md` records exactly what we verified, in which browser, on which date, and which spec questions we found genuinely unsettled.

---

## 6. What's next

- **ARCHIVE mode** — ghosts drawn from real player sessions rather than authored ones, so the corpus grows as people play. Zero-PII by construction.
- **The role-inversion chamber** — one room where the human is blind and the agent can see.
- **Wider benchmark coverage** — more backends, more seeds, and human-partner runs alongside the scripted ones.
- **The design principle, applied elsewhere.** Tool surfaces that deliberately expose less than the UI for irreversible actions; that expose *differently* for privacy, returning aggregates through tools while raw data stays on screen; that expand as authorisation does. Semaphore is the extreme case that makes the pattern visible.

---

## 7. Submission checklist

- [ ] Live URL, working in ChatGPT's in-app browser **and** Chrome with the flag
- [ ] Public repo, **MIT license visible in GitHub's About section**
- [ ] YouTube video under 3:00, public, with audio narration
- [ ] Description covering all four required answers (§3)
- [ ] Testing instructions — including the starter prompt and the `?chamber=` deep links
- [ ] The six repo pointers linked directly
- [ ] Limitations section included (§5)
- [ ] Submitted **well before** Sep 3, 2026 @ 1:00pm PDT
- [ ] After submitting: **freeze everything.** Do not touch the repo, the site, or the submission until winners are announced. Fork if you want to keep building.
