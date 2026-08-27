# 08 — Implementation Plan

The full build, sequenced so **every phase ends with something demoable**. If work stops at the end of any phase, what exists is coherent rather than half-finished.

Three rules govern the ordering:

1. **De-risk before you invest.** The things that can kill this are bad puzzles (R1), agent disengagement (R2), and spec assumptions that turn out to be wrong (R6, R9). All are resolved in Phase 0, before a line of game code is written.
2. **Greybox before art.** Every chamber is playable and playtested in flat rectangles before a single final sprite is drawn (R8).
3. **The video drives priority.** Doc 09 is storyboarded before Phase 3. Anything unshowable in three minutes is deprioritised.

Legend: **★** critical path · **◆** de-risking · **▸** demoable checkpoint

---

## Phase 0 — Foundations and de-risking

*Prove the riskiest assumptions before committing to anything expensive.*

### 0.1 Recruit playtesters ◆★

- [ ] Line up **six people** who can each give 45 minutes, in pairs, across the build
- [ ] Schedule three tuning windows now — the build schedules around them, not the reverse
- [ ] This is the only task that does not speed up with more compute. Do it first.

### 0.2 Paper prototypes ◆★

- [ ] Print Chamber 0: room diagram, airlock manual page
- [ ] Print Chamber I: six glyph cards, glyph/stroke table, signal-room rule, **and a vandalised variant of the page**
- [ ] Print Chamber II: gauge board, target plate, four dial cards, a scrambled mapping key held by neither player
- [ ] Print Chamber III: ciphertext card, cipher wheel, **the bolt sequence and a stamina token that depletes**
- [ ] Print the Archive: a fake ghost log (paper) and a fake ghost room diagram
- [ ] **Play everything with two humans**, one holding only the manual, one seeing only the room, back to back
- [ ] Record: time to solve, where they stalled, where they laughed, where they gave up
- [ ] **Gate:** if a chamber is not fun on paper, redesign it now. Do not code a chamber that failed here.
- [ ] Second paper pass with fresh testers after redesign
- [ ] **Build the glyph-description corpus** — show 12 glyphs to 10 people cold, record every phrase used
- [ ] Lock the puzzle rules for all four chambers and the Archive

### 0.3 WebMCP integration spike ◆★

- [ ] Minimal page registering three throwaway tools via `document.modelContext.registerTool`
- [ ] Verify `AbortSignal` teardown actually removes tools from `getTools()`
- [ ] Verify `toolchange` fires on **both** registration and abort, and with an **empty** final list
- [ ] **Open in ChatGPT's in-app browser; confirm the agent discovers and calls the tools**
- [ ] **Resolve OQ-1:** does the agent have visual access to the rendered canvas? Document the finding.
- [ ] **Resolve OQ-2:** does `allow="tools"` cross-origin delegation work there? Test `exposedTo` both ways.
- [ ] **Resolve OQ-3:** does `execute` receive a second argument? Does `requestUserInteraction` exist?
- [ ] Verify the **declarative form API** works in both browsers, and that `SubmitEvent.agentInvoked` is observable
- [ ] Test the **single-tool front door**: does an agent reliably discover and call one tool with a compelling description?
- [ ] Measure agent round-trip latency across ≥3 backends → **feeds the Chamber III adaptive window**
- [ ] Confirm observable behaviour of `readOnlyHint` and `untrustedContentHint`
- [ ] Record exact Chrome version and date
- [ ] **Write `docs/11-spec-notes.md` with everything learned** ★

### 0.4 Repository and tooling

- [ ] Monorepo scaffold (pnpm workspaces) per doc 05 §8
- [ ] `apps/game` — Vite + TypeScript + Phaser 4.2, `pixelArt: true`, integer scaling
- [ ] `apps/archive` — the cross-origin tool provider
- [ ] `apps/worker` — Wrangler, Durable Object binding, R2 binding
- [ ] `packages/protocol` — shared types, `Channel`, error codes
- [ ] `packages/seed` — xorshift128+ deterministic PRNG
- [ ] **MIT `LICENSE` at repo root**, license field configured so GitHub's About section shows it ★
- [ ] ESLint + Prettier + strict `tsconfig`
- [ ] **Custom lint rule: tool description budgets** (500 / 150 / 30 / 1500)
- [ ] Vitest across all packages; Playwright with a **mock `document.modelContext`**
- [ ] GitHub Actions: typecheck → lint → test → build
- [ ] Cloudflare Pages + Workers preview deploys on PR, **including the archive origin**
- [ ] **Measure the Phaser bundle now** against the 400KB budget

▸ **Checkpoint: a deployed URL where an agent in ChatGPT calls a dummy tool, four paper-tested puzzle designs, a filled-in spec-notes doc, and six booked playtesters.**

---

## Phase 1 — Vertical slice

*One complete chamber end to end, greybox, with the full architecture behind it.*

### 1.1 Server foundation ★

- [ ] `Session` Durable Object with lifecycle (create, join, end)
- [ ] `WorldState` with `Tagged<T>` five-channel tagging (doc 05 §3)
- [ ] `projectForPilot` / `projectForKeeper` as **pure functions**
- [ ] Server-authoritative timer with tick events
- [ ] Action semaphore `act()` returning `E_BUSY`, **with latency observation**
- [ ] State machine: `ENTRY → LOBBY → IN_CHAMBER → TRANSITIONING → FINALE → ESCAPED`, plus `PENALISED`, `ARCHIVE`, `DEADLOCK`
- [ ] Append-only event log → R2 JSONL, in the doc 05 §7 format
- [ ] WebSocket endpoint pushing `PilotView` deltas
- [ ] Seeded puzzle generation for Chamber 0

### 1.2 The proof layer ★

- [ ] `consistentWorlds(state)` in `worker/src/worlds.ts` — one implementation, three consumers (proof, CONCORD, benchmark)
- [ ] `enumerateReachableStates(seed)` for Chamber 0
- [ ] **`tests/possible-worlds.test.ts`** — `|W| > 1` **and** consistent worlds disagree about the correct action
- [ ] Mirror test for `projectForPilot`
- [ ] `tests/asymmetry.smoke.test.ts` with a documented allow-list
- [ ] Assert `HIDDEN` fields appear in **neither** projection
- [ ] Bits-table generator wired to the same code
- [ ] Wire all of it as a **blocking CI gate**

### 1.3 WebMCP layer ★

- [ ] `webmcp/adapter.ts` — the only file touching the spec; feature-detects `document` then `navigator`
- [ ] Graceful degradation → the gate screen, never a throw
- [ ] `ToolDirector` with **three-tier** `AbortController`s (doc 03 §4.1)
- [ ] **`begin_shift` as the sole entry tool**, with the briefing text (doc 04 §3)
- [ ] Persistent tools: `get_status`, `describe_chamber`, `inspect`, `read_note`
- [ ] **Archive origin**: `read_manual`, `read_station_log` with `exposedTo`, embedded via `allow="tools"`
- [ ] Single-origin fallback behind `ARCHIVE_ORIGIN=same|cross`
- [ ] **Declarative notepad form** exposing `write_note`
- [ ] Correct `readOnlyHint` everywhere; `untrustedContentHint` on the three untrusted-content tools
- [ ] Chamber 0 tool: `pull_lever`
- [ ] Full error taxonomy with descriptive messages (doc 03 §9)
- [ ] Every `execute` wrapped in a timing decorator

### 1.4 Client foundation

- [ ] Phaser boot, scale config, 320×180 native with integer snap
- [ ] `sessionClient` (fetch) + `socket` (WebSocket with reconnect)
- [ ] Read-only `PilotView` store fed by socket deltas
- [ ] `LandingScene` with the **starter prompt card** and copy button ★
- [ ] `ChamberScene` rendering greybox from `PilotView`
- [ ] PILOT avatar: keyboard movement, greybox rectangle
- [ ] KEEPER: greybox behind a grate, visor pulse on in-flight calls
- [ ] HUD: timer, chamber name, action log, **CHANNEL LEGEND**, **CONCORD meter**

### 1.5 Chamber 0 complete

- [ ] Full loop: describe → agent calls `pull_lever` → door opens
- [ ] Wrong-lever penalty with timer deduction and feedback
- [ ] Solvability + possible-worlds tests for Chamber 0
- [ ] **Playtest with a real agent in ChatGPT's in-app browser**

▸ **Checkpoint: a stranger with ChatGPT completes Chamber 0. Every layer is proven, including cross-origin and declarative.**

---

## Phase 2 — The remaining chambers

*All four chambers plus the Archive playable in greybox, tuned by real testers.*

### 2.1 Chamber I — Signal Room ★

- [ ] Glyph system: 12-glyph pool, 6 per session, stroke-count table
- [ ] Manual sections: `index`, `glyph_table`, `signal_room`
- [ ] **The vandalised page**: seeded flag, the injected text, and the `VISUAL` handwriting state
- [ ] `press_key`, `reset_sequence`
- [ ] Ordered-sequence validation with reset on error
- [ ] Three-strike **RACE CONDITION**
- [ ] Greybox: ring of six, key bank, beacon, wall-mounted manual page
- [ ] Verify 1,956 sequences resist brute force under the Standard timer
- [ ] **Two visually-similar glyphs included deliberately**, validated against the description corpus
- [ ] Playtest ×3 — **and specifically test whether agents obey the vandalism**

### 2.2 Chamber II — Blind Panel ★

- [ ] Dial→gauge permutation + inversions, seeded, **`HIDDEN`**
- [ ] `rotate_dial` with detent semantics
- [ ] **`AUDIBLE` channel: `lastClicks` in both projections** — sound for PILOT, text for KEEPER, and a visible pip counter for deaf players
- [ ] Gauge drift toward zero (1 mark / 20s, difficulty-scaled)
- [ ] Dial 4 cross-link to gauge 1 (the late complication)
- [ ] Simultaneous-target win condition
- [ ] `inspect("dial_n")` returns tactile info, never the mapping
- [ ] **CONCORD wired to live permutation elimination** — this is where the meter earns its place
- [ ] Verify the mapping is genuinely underdetermined from `projectForKeeper`
- [ ] Playtest ×3 — **most likely to frustrate; tune drift rate carefully**

### 2.3 The Archive ★

- [ ] Ghost session JSONL format finalised; **two ghost sessions authored** by recording real playtests
- [ ] `read_station_log({ entry })` on the archive origin
- [ ] `ArchiveScene` with the CRT monitor running the replay renderer at 1:4
- [ ] The split: PILOT sees ghost movement, KEEPER reads ghost calls, neither half sufficient
- [ ] Required-to-progress gating; teaches the Chamber III mechanic diegetically
- [ ] Playtest — **does the pair actually reconstruct the release-bar mechanic from it?**

### 2.4 Chamber III — Concord Lock ★

- [ ] Passphrase generation + Caesar encipherment, seeded
- [ ] Cipher wheel readable only at the wheel anchor with lamp raised
- [ ] **Release bar with a draining stamina meter**; grip, slip below 20%, release resets bolts
- [ ] **`staminaWindowMs` derived at runtime** from observed latency (doc 05 §6) — do not hardcode
- [ ] `read_ciphertext`, `get_lock_state`, `align_bolt`, `speak_passphrase`
- [ ] Lockout on wrong phrase while armed: 30s seal + re-encipherment
- [ ] `E_NOT_ARMED` descriptive error when called unarmed
- [ ] Greybox: great door, twelve bolts, wheel, release bar
- [ ] Playtest ×3, **specifically for whether the pair talks about remaining stamina**

### 2.5 Cross-chamber systems

- [ ] Chamber transitions with tool-set swap
- [ ] Difficulty presets: Practice / Relaxed / Standard / Deadline
- [ ] **BRIEF mode** (0, I, III + abridged Archive)
- [ ] DEADLOCK → chamber retry, **first retry preserves the seed**
- [ ] Notepad with per-line authorship via `agentInvoked`
- [ ] **The station-notices line** on repeated wasted calls
- [ ] Possible-worlds + solvability tests for everything, across 20 seeds
- [ ] `?seed=` and `?chamber=` URL parameters

▸ **Checkpoint: the complete game is playable in greybox and has been tuned by real testers.**

---

## Phase 3 — The `toolchange` spectacle and game feel

*The moments that make it a product rather than a prototype.*

### 3.1 The `toolchange` sequence ★★

- [ ] One `toolchange` listener on `document.modelContext`, feeding two renderers
- [ ] **Manifest panel** renders from **actual `getTools()`**, never a parallel guess
- [ ] Char-and-flake removal (~500ms); stamp-in with overshoot, brass ping, dust
- [ ] **KEEPER's body**: seven attachments, name-mapped, unlatch-and-fall / unfold-and-lock
- [ ] Fallen attachments persist on the floor as accumulating debris
- [ ] Verify both stay correct if a registration fails
- [ ] **This is the demo video's centrepiece — polish it disproportionately**

### 3.2 The ending ★

- [ ] `enterFinale()`: chamber + session controllers abort, everything falls, manifest empties
- [ ] `open_the_door` stamps in alone; KEEPER calls it; bolts retract
- [ ] `endSession()`: the **final `toolchange` fires with an empty registry**
- [ ] Balcony at dawn, both avatars at the rail. **Hold ten seconds. Let it breathe.**
- [ ] *Then* the stats card, including the derived stamina window and final CONCORD
- [ ] Link to `/replay/:id` — the same monitor the ghosts were on

### 3.3 Transitions and framing

- [ ] Cold open: station, tide, door sealing (~10s)
- [ ] Onboarding card
- [ ] Between-chamber sequence: mechanism resolve → `toolchange` → both avatars through the door → station log line
- [ ] DEADLOCK card with the CONCORD readback (*"KEEPER needed 2 more bits from you"*)

### 3.4 Game feel

- [ ] KEEPER's visor pulses for the full duration of every in-flight call
- [ ] Mechanism animations with settle-overshoot
- [ ] CONCORD ratchets in discrete steps with a mechanical sound
- [ ] Penalty: alarm palette-swap + 2-frame shake (**no** blur or chromatic aberration)
- [ ] Success: single-frame bone-white flash
- [ ] PILOT lamp radial light mask
- [ ] Pause menu + settings

▸ **Checkpoint: the game has a beginning, an ending, and its signature moment works.**

---

## Phase 4 — The judge path

*Cheap, high-leverage, and easy to forget until it is too late.*

- [ ] **Gate screen** for browsers without WebMCP: pitch, mark, ablation chart, SPECTATE, setup steps for both browsers with a copy button for the flag URL
- [ ] **Attract mode** — autoplay a ghost session after 20s idle on the landing screen
- [ ] **SPECTATE** — a 90-second highlight replay on demand
- [ ] `?chamber=N` deep links with prior state pre-solved
- [ ] Ablation chart placed on the landing page under the fold
- [ ] Starter prompt card polished to final art

▸ **Checkpoint: a judge who never types anything still understands the whole project.**

---

## Phase 5 — Art and audio

*Only now. Nothing here begins until Phase 3 is signed off.*

### 5.1 Art

- [ ] **Lock the 14-colour palette** before the first sprite
- [ ] PILOT sheet (~24 frames, incl. grip and slipping)
- [ ] KEEPER torso + visor (~14 frames)
- [ ] **Seven attachments × ~10 frames** — idle, attach, detach, act ★
- [ ] Five tilesets (~48 tiles each)
- [ ] Props (~28 objects): levers, keys, gauges, dials, wheel, bar, bolts, door, CRT
- [ ] 12 glyphs @ 16×16, visually distinct **and describable in plain language**
- [ ] **Manual pages: clean and vandalised states**
- [ ] HUD (~34 elements) incl. CONCORD housing and the pip counter
- [ ] Shape markers (▪ / ◦ / ◎) on every channel-coded element
- [ ] Split-lamp logo at 32×32, 16×16 favicon, wordmark with lamp-`O`, locked to the tagline
- [ ] Verify the 16×16 mark reads as a favicon
- [ ] Ambient particles: dust, drips, tide parallax

### 5.2 Audio

- [ ] Web Audio engine with layered stems
- [ ] Ambience bed: drip, tide, wind, beacon motor
- [ ] Four adaptive tension layers keyed to timer thresholds
- [ ] **Distinct behind-the-wall sound per KEEPER tool call**
- [ ] **Countable detents** — crisp, ~180ms spacing, music ducked 6dB during `AUDIBLE` events ★
- [ ] Mechanism SFX (~32 one-shots), penalty klaxon, success chime, door resolve, CONCORD ratchet
- [ ] Subtitle equivalent for every cue in the action log
- [ ] Master volume, music/SFX split, mute

▸ **Checkpoint: it looks and sounds like a finished indie game.**

---

## Phase 6 — Accessibility

- [ ] Full keyboard control; verify **zero** mouse-only paths
- [ ] `aria-live` screen-reader mirror (toggleable)
- [ ] Text mode sharing `projectForPilot` with the canvas renderer
- [ ] High-contrast mode
- [ ] `prefers-reduced-motion` honoured + manual toggle; `toolchange` retained at reduced amplitude
- [ ] **Deaf-accessible detent counts** — visible pip counter verified as puzzle-sufficient
- [ ] Colourblind verification: protanopia, deuteranopia, **tritanopia**
- [ ] Focus rings and focus trapping in menus
- [ ] Practice and BRIEF surfaced on the start screen
- [ ] **Test with an actual screen reader** (NVDA or VoiceOver)
- [ ] Document the DOM-mirror / asymmetry trade-off in the README

▸ **Checkpoint: playable without sight, without hearing, without a mouse, and without time pressure.**

---

## Phase 7 — Instrument

### 7.1 The ablation ★★ — do this before anything else in this phase

- [ ] `bench/ablation.ts`: agent-alone, human-alone, together
- [ ] Agent-alone run must be **genuine** — full tools, briefed that there is no partner, enough turns
- [ ] Publish raw logs
- [ ] **Generate the three-bar chart** and place it: landing page, gate screen, README, Devpost, video

### 7.2 Replay viewer

- [ ] `/replay/:sessionId` reading session JSONL from R2
- [ ] Two-track timeline: amber PILOT, cyan KEEPER, **CONCORD trace underneath**
- [ ] Scrubbing with room state rendered at any point
- [ ] Shareable links

### 7.3 Benchmark

- [ ] `bench/harness.ts` driving headless sessions, **CONCORD meter disabled**
- [ ] Scripted partners: `oracle`, `vague`, `slow`, `wrong`
- [ ] Standard suite: 20 fixed seeds × 4 chambers
- [ ] Metrics incl. **wasted calls** (`keeperViewHash`), **bits-per-question**, **injection resistance**, **caution rate**
- [ ] `report.ts` → markdown + CSV
- [ ] **Run across ≥3 backends**; record token spend
- [ ] Complete the **per-model behaviour log** (doc 04 §7)
- [ ] Write the analysis, leading with **partner-sensitivity**, framed as a proposal not an established instrument

▸ **Checkpoint: the Potential Impact argument is paid for with real numbers.**

---

## Phase 8 — Submission

### 8.1 Release readiness (doc 07 §8.3)

- [ ] End-to-end in **ChatGPT's in-app browser** ★
- [ ] End-to-end in **Chrome with the WebMCP flag** ★
- [ ] Gate screen in a browser without WebMCP
- [ ] Cross-origin archive works; single-origin fallback also green
- [ ] 20-minute session, no memory growth or audio artefacts
- [ ] Clean recovery from a dropped WebSocket mid-chamber
- [ ] `?seed=`, `?chamber=`, `/replay/:id`, attract mode, SPECTATE all working
- [ ] Final `toolchange` fires with an empty registry
- [ ] All CI gates green
- [ ] Production deploy on a stable custom domain
- [ ] **Re-run the spec spike** and update `11-spec-notes.md` with the final Chrome version

### 8.2 Repository

- [ ] README: split-lamp mark, pitch, **ablation chart**, GIF of the `toolchange` sequence
- [ ] Setup verified from a **cold clone on a clean machine**
- [ ] This document set under `docs/`
- [ ] The six "look here" pointers (doc 03 §11) linked prominently
- [ ] The **starter prompt** printed in the README (doc 04 §8 — what the agent is told is public)
- [ ] Honest limitations: screenshot residual risk, DOM-mirror trade-off, benchmark maturity, authored-not-real ghosts
- [ ] **MIT license visible in GitHub's About section** ★

### 8.3 Demo video

- [ ] Shoot to **doc 09**, which is a full script and was storyboarded before Phase 3
- [ ] **Pre-record; never rely on a live agent run** (R2)
- [ ] Clear audio narration throughout — required by the challenge
- [ ] Upload public to YouTube

### 8.4 Devpost

- [ ] Paste from **doc 10**, revised through the build rather than written on the last day
- [ ] **Lead with the design principle**, then the game, then the ablation, then the benchmark (R3)
- [ ] Link the six repo pointers directly
- [ ] State the limitations honestly
- [ ] Submit **well before** Sep 3, 2026 @ 1:00pm PDT ★

---

## Ordering guidance

If time compresses, cut from the bottom up:

1. The Chamber II cross-link complication (Chamber II keeps the permutation twist)
2. Benchmark backends: 3 models → 2
3. Text mode (keep the screen-reader mirror)
4. Ambient particle work
5. Replay scrubbing (keep the static timeline — the Archive needs only playback)
6. The second ghost session (one is enough)
7. Cross-origin archive → single-origin fallback (the flag exists for this)

**Never cut:** the possible-worlds proof, the `toolchange` sequence including KEEPER's body, the ablation, the starter prompt card, ChatGPT in-app browser verification, the MIT license, or the demo video.

The last two have sunk more good hackathon projects than any technical problem ever has.
