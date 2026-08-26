# 07 — Implementation Checklist

The full build, sequenced so that **every phase ends with something demoable**. If work stops at the end of any phase, what exists is coherent rather than half-finished.

Two rules govern the ordering:

1. **De-risk before you invest.** The two things that can kill this project are bad puzzles (R1) and a WebMCP integration that doesn't behave as expected (R3, OQ-1). Both are resolved in Phase 0, before a line of game code is written.
2. **Greybox before art.** Every chamber is playable and playtested in flat rectangles before a single final sprite is drawn (R7).

Legend: **★** = critical path · **◆** = de-risking task · **▸** = demoable checkpoint

---

## Phase 0 — Foundations and de-risking

*Goal: prove the two riskiest assumptions before committing to anything expensive.*

### 0.1 Paper prototypes ◆★

- [ ] Print the Chamber 0 room diagram and the airlock manual page
- [ ] Print Chamber I: six glyph cards, the glyph/stroke table, the signal-room rule
- [ ] Print Chamber II: gauge board, target plate, four dial cards, a scrambled mapping key held by neither player
- [ ] Print Chamber III: ciphertext card, cipher wheel, release-bar timing card
- [ ] **Play all four chambers with two humans**, one holding only the manual, one seeing only the room, in separate rooms or back-to-back
- [ ] Record: time to solve, where they stalled, where they laughed, where they gave up
- [ ] **Gate:** if a chamber is not fun on paper, redesign it now. Do not proceed to code on a chamber that failed here.
- [ ] Second paper pass with fresh testers after redesign
- [ ] Lock the puzzle rules for all four chambers

### 0.2 WebMCP integration spike ◆★

- [ ] Minimal page registering three throwaway tools via `document.modelContext.registerTool`
- [ ] Verify `AbortSignal` teardown actually removes tools from `getTools()`
- [ ] Verify `toolchange` fires on both registration and abort
- [ ] **Open it in ChatGPT's in-app browser and confirm the agent discovers and calls the tools**
- [ ] **Resolve OQ-1:** determine empirically whether the agent has visual access to the rendered canvas. Document the finding.
- [ ] Test in Chrome with `chrome://flags/#enable-webmcp-testing`
- [ ] Measure agent round-trip latency for a trivial tool call → **feeds the Chamber III window tuning (OQ-2)**
- [ ] Confirm behaviour of `annotations.readOnlyHint` and `untrustedContentHint` in practice
- [ ] Record the exact Chrome version tested against
- [ ] Write `docs/spec-notes.md` capturing everything learned

### 0.3 Repository and tooling

- [ ] Monorepo scaffold (pnpm workspaces) per doc 04 §6
- [ ] `apps/game` — Vite + TypeScript + Phaser 4.2, `pixelArt: true`, integer scaling
- [ ] `apps/worker` — Wrangler, Durable Object binding, R2 binding
- [ ] `packages/protocol` — shared types, `Channel`, error codes
- [ ] `packages/seed` — xorshift128+ deterministic PRNG
- [ ] **MIT `LICENSE` at repo root**, license field configured so GitHub's About section shows it
- [ ] ESLint + Prettier + strict `tsconfig`
- [ ] Vitest configured across all packages
- [ ] Playwright configured with a **mock `document.modelContext`** for CI
- [ ] GitHub Actions: typecheck → lint → test → build
- [ ] Cloudflare Pages + Workers preview deploys on PR

▸ **Checkpoint: a deployed URL where an agent in ChatGPT can call a dummy tool, and four paper-tested puzzle designs.**

---

## Phase 1 — Vertical slice

*Goal: one complete chamber, end to end, greybox, with the full architecture behind it. This proves every layer talks to every other layer.*

### 1.1 Server foundation ★

- [ ] `Session` Durable Object with lifecycle (create, join, end)
- [ ] `WorldState` with `Tagged<T>` channel tagging (doc 04 §3)
- [ ] `projectForPilot` / `projectForKeeper` as **pure functions**
- [ ] Server-authoritative timer with tick events
- [ ] Action semaphore (`act()`), returning `E_BUSY` on contention
- [ ] State machine: `LOBBY → IN_CHAMBER → TRANSITIONING → ESCAPED`, plus `PENALISED` and `DEADLOCK`
- [ ] Append-only event log → R2 JSONL
- [ ] WebSocket endpoint pushing `PilotView` deltas
- [ ] Seeded puzzle generation for Chamber 0

### 1.2 The Asymmetry Invariant ★

- [ ] `collectVisualChannelValues` / `collectToolChannelValues` helpers
- [ ] `enumerateReachableStates(seed)` for Chamber 0
- [ ] **`tests/asymmetry.invariant.test.ts` — no VISUAL value in the keeper projection, no TOOL value in the pilot projection**
- [ ] Assert server-only fields (`correctLever`) appear in **neither** projection
- [ ] Wire as a **blocking CI gate**

### 1.3 WebMCP layer ★

- [ ] `webmcp/adapter.ts` — the only file touching the spec; feature-detects `document` then `navigator`
- [ ] Graceful degradation: no WebMCP → explanatory gate screen, never a throw
- [ ] `ToolDirector` with two-tier `AbortController`s (doc 03 §4.1)
- [ ] Persistent tools: `get_status`, `read_manual`, `describe_chamber`, `inspect`, `move_keeper`, `write_note`, `read_note`
- [ ] Correct `readOnlyHint` on every tool; `untrustedContentHint: true` on `read_note`
- [ ] Chamber 0 tool: `pull_lever`
- [ ] Full error taxonomy with descriptive messages (doc 03 §6)
- [ ] Every `execute` wrapped in a timing decorator for telemetry

### 1.4 Client foundation

- [ ] Phaser boot, scale config, 320×180 native with integer snap
- [ ] `sessionClient` (fetch) + `socket` (WebSocket with reconnect)
- [ ] Read-only `PilotView` store fed by socket deltas
- [ ] `ChamberScene` rendering greybox from `PilotView`
- [ ] PILOT avatar: keyboard movement, greybox rectangle
- [ ] KEEPER avatar: moves in response to tool-call events
- [ ] HUD: timer, chamber name, action log, **CHANNEL LEGEND**
- [ ] Chamber 0 greybox: three levers, three glyph placeholders

### 1.5 Chamber 0 complete

- [ ] Full loop playable: describe → agent calls `pull_lever` → door opens
- [ ] Wrong-lever penalty with timer deduction and feedback
- [ ] Solvability + unsolvability tests for Chamber 0
- [ ] Playtest with a real agent in ChatGPT's in-app browser

▸ **Checkpoint: a stranger with ChatGPT can complete Chamber 0. The whole architecture is proven.**

---

## Phase 2 — The remaining chambers

*Goal: all four chambers playable in greybox, tuned through real playtesting.*

### 2.1 Chamber I — Signal Room ★

- [ ] Glyph system: 12-glyph pool, 6 selected per session, stroke-count table
- [ ] Manual sections: `index`, `glyph_table`, `signal_room`
- [ ] `press_key`, `reset_sequence` tools
- [ ] Ordered-sequence validation with reset on error
- [ ] Three-strike **RACE CONDITION** handling
- [ ] Greybox: ring of six positions, key bank, beacon placeholder
- [ ] Verify search space (1,956 sequences) resists brute force under the Standard timer
- [ ] **Deliberately include two visually-similar glyphs to elicit clarifying questions**
- [ ] Playtest ×3 with fresh testers; tune glyph-description clarity

### 2.2 Chamber II — Blind Panel ★

- [ ] Dial→gauge permutation + inversion flags, seeded, **server-only**
- [ ] `rotate_dial` tool with detent semantics
- [ ] Gauge drift toward zero (1 mark / 20s, difficulty-scaled)
- [ ] Dial 4 cross-link to gauge 1 (the late complication)
- [ ] Simultaneous-target win condition
- [ ] `inspect("dial_n")` returns tactile info (detent count) but never mapping
- [ ] Greybox: four gauges, target plate, grate
- [ ] Verify the mapping is genuinely underdetermined from `projectForKeeper` alone
- [ ] Playtest ×3 — **this is the chamber most likely to frustrate; tune drift rate carefully**

### 2.3 Chamber III — Concord Lock ★

- [ ] Passphrase generation + Caesar encipherment, seeded
- [ ] Cipher wheel readable only at the wheel anchor with lamp raised
- [ ] Release bar: PILOT holds, arms lock for a **configurable** window (default 4s)
- [ ] `read_ciphertext`, `get_lock_state`, `speak_passphrase` tools
- [ ] Lockout on wrong phrase while armed: 30s seal + re-encipherment
- [ ] `E_NOT_ARMED` descriptive error when called unarmed
- [ ] Greybox: great door, bolt array, wheel, release bar
- [ ] **Tune the window from measured agent latency (OQ-2)** — do not guess
- [ ] Playtest ×3, specifically for the countdown-coordination moment

### 2.4 Cross-chamber systems

- [ ] Chamber transitions with tool-set swap
- [ ] Difficulty presets: Practice / Relaxed / Standard / Deadline
- [ ] DEADLOCK → chamber retry (never full-run loss)
- [ ] Notepad: PILOT writes, `read_note` returns with `untrustedContentHint`
- [ ] Solvability + unsolvability tests for all four chambers, across 20 seeds
- [ ] `?seed=` URL parameter reproducing exact sessions

▸ **Checkpoint: the complete 15-minute game is playable in greybox, and has been tuned by real testers.**

---

## Phase 3 — The toolchange spectacle and game feel

*Goal: the moments that make it feel like a product rather than a prototype.*

### 3.1 TOOL MANIFEST panel ★

- [ ] `toolchange` listener on `document.modelContext`
- [ ] Panel renders from **actual `getTools()` output**, never a parallel guess
- [ ] Char-and-flake removal animation (~500ms)
- [ ] Stamp-in addition animation with overshoot
- [ ] Verify panel stays correct if a registration fails
- [ ] **This is the demo video's centrepiece — polish it disproportionately**

### 3.2 Transitions and framing

- [ ] Cold open: station, tide, door sealing (~10s)
- [ ] Onboarding card
- [ ] Between-chamber sequence: mechanism resolve → manifest rewrite → both avatars walk through → station log line
- [ ] Ending: balcony at dawn, both avatars at the rail
- [ ] Stats screen with link to replay viewer

### 3.3 Game feel

- [ ] KEEPER visor pulses for the full duration of every in-flight tool call
- [ ] Mechanism animations with settle-overshoot
- [ ] Penalty: alarm palette-swap + 2-frame screen shake (**no** blur or chromatic aberration)
- [ ] Success: single-frame bone-white flash
- [ ] PILOT lamp radial light mask
- [ ] Pause menu + settings

▸ **Checkpoint: the game has a beginning, an ending, and its signature moment works.**

---

## Phase 4 — Art and audio

*Only now. Nothing here begins until Phase 3 is signed off.*

### 4.1 Art

- [ ] **Lock the 14-colour palette** (doc 05 §2) before the first sprite
- [ ] PILOT sprite sheet (~22 frames)
- [ ] KEEPER sprite sheet (~22 frames, visor pulse included)
- [ ] Four chamber tilesets (~48 tiles each)
- [ ] Props: levers, keys, gauges, dials, cipher wheel, great door (~24 objects)
- [ ] 12 glyphs @ 16×16, verified visually distinct **and describable in plain language**
- [ ] HUD elements (~30)
- [ ] Shape markers (▪ / ◦) on every channel-coded element
- [ ] Split-lamp logo at 32×32, 16×16 favicon, and wordmark with lamp-`O`
- [ ] Verify the 16×16 mark is readable as a favicon
- [ ] Ambient particles: dust, drips, tide parallax

### 4.2 Audio

- [ ] Web Audio engine with layered stems
- [ ] Ambience bed: drip, tide, wind, beacon motor
- [ ] Four adaptive tension layers keyed to timer thresholds
- [ ] **Distinct behind-the-wall sound per KEEPER tool call**
- [ ] Mechanism SFX (~28 one-shots)
- [ ] Penalty klaxon, success chime, door resolve
- [ ] Subtitle equivalent for every cue in the action log
- [ ] Master volume, music/SFX split, mute

▸ **Checkpoint: it looks and sounds like a finished indie game.**

---

## Phase 5 — Accessibility

- [ ] Full keyboard control; verify **zero** mouse-only paths
- [ ] `aria-live` screen-reader mirror (toggleable)
- [ ] Text mode sharing `projectForPilot` with the canvas renderer
- [ ] High-contrast mode
- [ ] `prefers-reduced-motion` honoured + manual toggle
- [ ] Colourblind verification: simulate protanopia, deuteranopia, **tritanopia**
- [ ] Focus rings and focus trapping in menus
- [ ] Practice mode surfaced on the start screen, not buried
- [ ] **Test with an actual screen reader** (NVDA or VoiceOver)
- [ ] Document the DOM-mirror / asymmetry trade-off in the README

▸ **Checkpoint: playable without sight, without hearing, without a mouse, and without time pressure.**

---

## Phase 6 — Instrument: benchmark and replay

### 6.1 Replay viewer

- [ ] `/replay/:sessionId` reading session JSONL from R2
- [ ] Two-track timeline: amber PILOT track, cyan KEEPER track
- [ ] Scrubbing with room state rendered at any point
- [ ] Shareable links

### 6.2 Benchmark harness

- [ ] `bench/harness.ts` driving headless sessions
- [ ] Scripted partners: `oracle`, `vague`, `slow`, `wrong`
- [ ] Standard suite: 20 fixed seeds × 4 chambers
- [ ] Metric computation, including **wasted calls** via `keeperViewHash`
- [ ] `report.ts` → markdown + CSV
- [ ] **Run across ≥3 model backends**; record token spend
- [ ] Publish raw logs in-repo
- [ ] Write the results analysis, **framed as a proposal for an instrument, not an established one**

▸ **Checkpoint: the Potential Impact argument is paid for with real numbers.**

---

## Phase 7 — Submission

### 7.1 Release readiness (doc 06 §6.3)

- [ ] End-to-end playthrough in **ChatGPT's in-app browser** ★
- [ ] End-to-end playthrough in **Chrome with the WebMCP flag** ★
- [ ] Graceful gate in a browser without WebMCP
- [ ] 15-minute session with no memory growth or audio artefacts
- [ ] Clean recovery from a dropped WebSocket mid-chamber
- [ ] `?seed=` replay and `/replay/:id` both working
- [ ] All CI gates green, including invariant and unsolvability proofs
- [ ] Bundle and load-time budgets met
- [ ] Production deploy on a stable custom domain

### 7.2 Repository

- [ ] README opening with the split-lamp mark, the pitch, and a GIF of the manifest rewrite
- [ ] Setup instructions verified from a **cold clone on a clean machine**
- [ ] This document set under `docs/`
- [ ] The four "look here" pointers (doc 03 §8) linked prominently from the README
- [ ] Honest limitations section: the screenshot residual risk, the DOM-mirror trade-off, benchmark maturity
- [ ] MIT license visible in GitHub's About section ★

### 7.3 Demo video (< 3 minutes) ★

Storyboard it **before** Phase 3, and let it drive priority — anything unshowable in the video is lower priority.

- [ ] **0:00–0:20** — The hook. Split screen: the room on one side, the agent's tool list on the other. *"My agent cannot see this room. I cannot read the manual. Neither of us gets out alone."*
- [ ] **0:20–0:50** — Chamber 0 in real time. The describe → tool call → door loop, complete and unedited.
- [ ] **0:50–1:20** — **The manifest rewrite.** Slow-motion, sound up. Cut to Chrome DevTools showing the tool list actually changing. This is the shot that wins WebMCP Leverage.
- [ ] **1:20–1:50** — Chamber II. The empirical discovery loop, showing genuine back-and-forth reasoning.
- [ ] **1:50–2:15** — Chamber III. The countdown, the sync, the door.
- [ ] **2:15–2:40** — The instrument. Replay viewer scrub, then the benchmark results table.
- [ ] **2:40–3:00** — Ending shot, logo, URL.
- [ ] Clear audio narration throughout — the challenge requires it
- [ ] **Pre-record; do not rely on a live agent run** (R3)
- [ ] Upload public to YouTube

### 7.4 Devpost text

- [ ] **Lead with the instrument framing, not the game framing** (R2)
- [ ] *Why WebMCP fits:* the asymmetry only exists because tools expose a different slice of state than the UI — architecturally enforced and tested
- [ ] *Better UX:* the human is load-bearing, not optional; remove either party and the game stops
- [ ] *What's newly possible:* a dynamic tool surface as a game mechanic; measurable joint performance under information asymmetry
- [ ] *How implemented:* two-tier `AbortController` lifecycle, `toolchange`-driven UI, channel-tagged projections, annotation hygiene, descriptive error taxonomy
- [ ] Link the four repo pointers directly
- [ ] State the limitations honestly
- [ ] Submit **well before** Sep 3, 2026 @ 1:00pm PDT ★

---

## Ordering guidance

If time compresses, cut in this order — **from the bottom up**:

1. Chamber III's cross-link complication (Chamber II keeps its twist)
2. Benchmark backends: 3 models → 2
3. Text mode (keep the screen-reader mirror)
4. Ambient particle work
5. The replay viewer's scrubbing (keep the static timeline)

**Never cut:** the asymmetry invariant test, the manifest panel animation, ChatGPT in-app browser verification, the MIT license, or the demo video.

The last two have sunk more good hackathon projects than any technical problem ever has.