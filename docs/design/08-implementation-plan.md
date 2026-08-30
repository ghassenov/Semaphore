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
- [x] Lock the puzzle rules for all four chambers and the Archive

### 0.3 WebMCP integration spike ◆★

- [x] Minimal page registering three throwaway tools via `document.modelContext.registerTool`
- [x] Verify `AbortSignal` teardown actually removes tools from `getTools()`
- [x] Verify `toolchange` fires on **both** registration and abort, and with an **empty** final list *(a declaratively registered tool leaves only when its form leaves the DOM, D-024)*
- [ ] **Open in ChatGPT's in-app browser; confirm the agent discovers and calls the tools**
- [ ] **Resolve OQ-1:** does the agent have visual access to the rendered canvas? Document the finding.
- [ ] **Resolve OQ-2:** does `allow="tools"` cross-origin delegation work there? Test `exposedTo` both ways.
- [x] **Resolve OQ-3:** does `execute` receive a second argument? Does `requestUserInteraction` exist? *(no to both, D-024)*
- [ ] Verify the **declarative form API** works in both browsers, and that `SubmitEvent.agentInvoked` is observable
- [ ] Test the **single-tool front door**: does an agent reliably discover and call one tool with a compelling description?
- [ ] Measure agent round-trip latency across ≥3 backends → **feeds the Chamber III adaptive window**
- [ ] Confirm observable behaviour of `readOnlyHint` and `untrustedContentHint`
- [x] Record exact Chrome version and date
- [x] **Write `docs/design/11-spec-notes.md` with everything learned** ★ *(sections 6 and 7 stay empty until a model meets the page)*

### 0.4 Repository and tooling

- [x] Monorepo scaffold (pnpm workspaces) per doc 05 §8
- [x] `apps/game` — Vite + TypeScript + Phaser 4.2, `pixelArt: true`, integer scaling
- [ ] `apps/archive` — the cross-origin tool provider
- [x] `apps/worker` — Wrangler, Durable Object binding, R2 binding *(R2 replaced by D1 plus Durable Object SQLite, D-006 and D-008)*
- [x] `packages/protocol` — shared types, `Channel`, error codes
- [x] `packages/seed` — xorshift128+ deterministic PRNG
- [x] **MIT `LICENSE` at repo root**, license field configured so GitHub's About section shows it ★ *(the About panel itself can only be confirmed once the repo is public)*
- [x] ESLint + Prettier + strict `tsconfig`
- [x] **Custom lint rule: tool description budgets** (500 / 150 / 30 / 1500) *(enforced by `budgets.test.ts` over the tool objects rather than by a lint rule over the source, D-022)*
- [ ] Vitest across all packages; Playwright with a **mock `document.modelContext`**
- [x] GitHub Actions: typecheck → lint → test → build
- [ ] Cloudflare Pages + Workers preview deploys on PR, **including the archive origin**
- [x] **Measure the Phaser bundle now** against the 400KB budget *(365KB gzipped bare; loaded on demand, entry is 10.3KB, enforced by `apps/game/scripts/check-bundle.mjs`, D-026)*

▸ **Checkpoint: a deployed URL where an agent in ChatGPT calls a dummy tool, four paper-tested puzzle designs, a filled-in spec-notes doc, and six booked playtesters.**

---

## Phase 1 — Vertical slice

*One complete chamber end to end, greybox, with the full architecture behind it.*

### 1.1 Server foundation ★

- [x] `Session` Durable Object with lifecycle (create, join, end)
- [x] `WorldState` with `Tagged<T>` five-channel tagging (doc 05 §3)
- [x] `projectForPilot` / `projectForKeeper` as **pure functions**
- [x] Server-authoritative timer with tick events
- [x] Action semaphore `act()` returning `E_BUSY`, **with latency observation**
- [x] State machine: `ENTRY → LOBBY → IN_CHAMBER → TRANSITIONING → FINALE → ESCAPED`, plus `PENALISED`, `ARCHIVE`, `DEADLOCK`
- [x] Append-only event log → R2 JSONL, in the doc 05 §7 format *(gzipped into D1, one row per session, D-008)*
- [x] WebSocket endpoint pushing `PilotView` deltas *(whole views rather than deltas, so a reconnect needs no catch-up protocol, D-025)*
- [x] Seeded puzzle generation for Chamber 0

### 1.2 The proof layer ★

- [x] `consistentWorlds(state)` in `worker/src/worlds.ts` — one implementation, three consumers (proof, CONCORD, benchmark)
- [x] `enumerateReachableStates(seed)` for Chamber 0
- [x] **`tests/possible-worlds.test.ts`** — `|W| > 1` **and** consistent worlds disagree about the correct action *(all four chambers)*
- [x] Mirror test for `projectForPilot`
- [ ] `tests/asymmetry.smoke.test.ts` with a documented allow-list
- [x] Assert `HIDDEN` fields appear in **neither** projection
- [ ] Bits-table generator wired to the same code
- [x] Wire all of it as a **blocking CI gate**

### 1.3 WebMCP layer ★

- [x] `webmcp/adapter.ts` — the only file touching the spec; feature-detects `document` then `navigator`
- [x] Graceful degradation → the gate screen, never a throw
- [x] `ToolDirector` with **three-tier** `AbortController`s (doc 03 §4.1)
- [x] **`begin_shift` as the sole entry tool**, with the briefing text (doc 04 §3)
- [ ] Persistent tools: `get_status`, `describe_chamber`, `inspect`, `read_note`
- [ ] **Archive origin**: `read_manual`, `read_station_log` with `exposedTo`, embedded via `allow="tools"`
- [ ] Single-origin fallback behind `ARCHIVE_ORIGIN=same|cross`
- [x] **Declarative notepad form** exposing `write_note` *(with `read_note` imperative beside it, which is the rule applied rather than an inconsistency, D-028)*
- [x] Correct `readOnlyHint` everywhere; `untrustedContentHint` on the three untrusted-content tools
- [x] Chamber 0 tool: `pull_lever`
- [x] Full error taxonomy with descriptive messages (doc 03 §9)
- [x] Every `execute` wrapped in a timing decorator

### 1.4 Client foundation

- [x] Phaser boot, scale config, 320×180 native with integer snap *(`render/station.ts`, `Scale.FIT` with a 320×180 snap step)*
- [x] `sessionClient` (fetch) + `socket` (WebSocket with reconnect)
- [x] Read-only `PilotView` store fed by socket deltas *(the socket holds the latest frame; a separate store would do nothing more, D-025)*
- [x] `LandingScene` with the **starter prompt card** and copy button ★ *(the card stays in the DOM: a canvas cannot be selected or copied)*
- [x] `ChamberScene` rendering greybox from `PilotView` *(all four rooms, laid out by the pure `render/rooms.ts`)*
- [x] PILOT avatar: keyboard movement, greybox rectangle *(arrows and WASD, stops at the grate)*
- [x] KEEPER: greybox behind a grate, visor pulse on in-flight calls *(limb count is `getTools()`, so a failed registration is visible)*
- [x] HUD: timer, chamber name, action log, **CHANNEL LEGEND**, **CONCORD meter** *(the meter is fed by its own route, D-027)*

### 1.5 Chamber 0 complete

- [x] Full loop: describe → agent calls `pull_lever` → door opens *(through the tool surface; nothing renders it yet)*
- [x] Wrong-lever penalty with timer deduction and feedback
- [x] Solvability + possible-worlds tests for Chamber 0
- [ ] **Playtest with a real agent in ChatGPT's in-app browser**

▸ **Checkpoint: a stranger with ChatGPT completes Chamber 0. Every layer is proven, including cross-origin and declarative.**

---

## Phase 2 — The remaining chambers

*All four chambers plus the Archive playable in greybox, tuned by real testers.*

### 2.1 Chamber I — Signal Room ★

- [x] Glyph system: 12-glyph pool, 6 per session, stroke-count table
- [x] Manual sections: `index`, `glyph_table`, `signal_room`
- [x] **The vandalised page**: seeded flag, the injected text, and the `VISUAL` handwriting state
- [x] `press_key`, `reset_sequence`
- [x] Ordered-sequence validation with reset on error
- [x] Three-strike **RACE CONDITION**
- [ ] Greybox: ring of six, key bank, beacon, wall-mounted manual page
- [x] Verify 1,956 sequences resist brute force under the Standard timer *(against blind guessing only: the accepted prefix is `SHARED`, so the real search is sequential with feedback and a solo guesser clears the chamber about a quarter of the time. D-040.)*
- [ ] **Two visually-similar glyphs included deliberately**, validated against the description corpus
- [ ] Playtest ×3 — **and specifically test whether agents obey the vandalism**

### 2.2 Chamber II — Blind Panel ★

- [x] Dial→gauge permutation + inversions, seeded, **`HIDDEN`**
- [x] `rotate_dial` with detent semantics
- [x] **`AUDIBLE` channel: `lastClicks` in both projections** - sound for PILOT, text for KEEPER, and a visible pip counter for deaf players *(the count ships as prose beside the room, "3 clicks registered", which is the text equivalent the pip counter existed to be, D-061)*
- [x] Gauge drift toward zero (1 mark / 20s, difficulty-scaled)
- [x] Dial 4 cross-link to gauge 1 (the late complication)
- [x] Simultaneous-target win condition
- [x] `inspect("dial_n")` returns tactile info, never the mapping
- [ ] **CONCORD wired to live permutation elimination** — this is where the meter earns its place
- [x] Verify the mapping is genuinely underdetermined from `projectForKeeper`
- [ ] Playtest ×3 — **most likely to frustrate; tune drift rate carefully** *(the ablation puts a number on it: an oracle pair clears 4.00 of four at a 4s agent rhythm, 3.80 at 6s and 2.00 at 9s. D-040.)*

### 2.3 The Archive ★

- [x] Ghost session JSONL format finalised, and generated from the reducer rather than authored *(**one** ghost, which doc 08's own cut order allows and `fixtures/ghosts/CLAUDE.md` scopes to; a second is content, not mechanism, D-039)*
- [x] `read_station_log({ entry })` on the archive origin *(and `read_manual` beside it; D-033)*
- [x] The Archive's monitor, playing the ghost, drawn by `ChamberScene` beside every other room *(a schematic at a computed integer scale rather than the pack at 1:4, and no third scene, D-039)*
- [x] The split: PILOT sees ghost movement, KEEPER reads ghost calls, neither half sufficient *(`pilotTrack` mirrors `keeperEntries`, and the exclusion is asserted in both directions, D-039)*
- [x] Required-to-progress gating; teaches the Chamber III mechanic diegetically *(the room is built: the ghost is seen gripping the bar while their KEEPER's calls stop arriving, D-039. Whether a pair actually reads it that way is the playtest below.)*
- [ ] Playtest — **does the pair actually reconstruct the release-bar mechanic from it?**

### 2.4 Chamber III — Concord Lock ★

- [x] Passphrase generation + Caesar encipherment, seeded
- [ ] Cipher wheel readable only at the wheel anchor with lamp raised
- [ ] **Release bar with a draining stamina meter**; grip, slip below 20%, release resets bolts
- [x] **`staminaWindowMs` derived at runtime** from observed latency (doc 05 §6) — do not hardcode
- [x] `read_ciphertext`, `get_lock_state`, `align_bolt`, `speak_passphrase`
- [x] Lockout on wrong phrase while armed: 30s seal + re-encipherment
- [x] `E_NOT_ARMED` descriptive error when called unarmed
- [ ] Greybox: great door, twelve bolts, wheel, release bar
- [ ] Playtest ×3, **specifically for whether the pair talks about remaining stamina**

### 2.5 Cross-chamber systems

- [x] Chamber transitions with tool-set swap
- [x] Difficulty presets: Practice / Relaxed / Standard / Deadline
- [x] **BRIEF mode** (0, I, III + abridged Archive)
- [x] DEADLOCK → chamber retry, **first retry preserves the seed**
- [ ] Notepad with per-line authorship via `agentInvoked`
- [ ] **The station-notices line** on repeated wasted calls
- [ ] Possible-worlds + solvability tests for everything, across 20 seeds
- [x] `?seed=` and `?chamber=` URL parameters *(the deep link walks the real transitions rather than assigning a state, D-059)*

▸ **Checkpoint: the complete game is playable in greybox and has been tuned by real testers.**

---

## Phase 3 — The `toolchange` spectacle and game feel

*The moments that make it a product rather than a prototype.*

### 3.1 The `toolchange` sequence ★★

- [ ] One `toolchange` listener on `document.modelContext`, feeding two renderers
- [x] **Manifest panel** renders from **actual `getTools()`**, never a parallel guess *(greybox `<ul>`; the panel's art and motion are still Phase 3)*
- [ ] Char-and-flake removal (~500ms); stamp-in with overshoot, brass ping, dust
- [ ] **KEEPER's body**: seven attachments, name-mapped, unlatch-and-fall / unfold-and-lock
- [ ] Fallen attachments persist on the floor as accumulating debris
- [ ] Verify both stay correct if a registration fails
- [ ] **This is the demo video's centrepiece — polish it disproportionately**

### 3.2 The ending ★

- [ ] `enterFinale()`: chamber + session controllers abort, everything falls, manifest empties
- [ ] `open_the_door` stamps in alone; KEEPER calls it; bolts retract
- [x] `endSession()`: the **final `toolchange` fires with an empty registry** *(the notepad exists now, so this aborts the controllers **and** removes the form element; verified live in Chrome 151, D-028)*
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

- [x] **Gate screen** for browsers without WebMCP: pitch, mark, ablation chart, SPECTATE, setup steps for both browsers with a copy button for the flag URL
- [x] **Attract mode** - autoplay a ghost session after 20s idle on the landing screen *(never under `prefers-reduced-motion`, and it does not survive a keystroke, D-058)*
- [x] **SPECTATE** - a recorded session on demand, on the same painter the Archive's monitor uses *(the ghost's own 29 seconds rather than an authored 90-second cut, D-058)*
- [x] `?chamber=N` deep links with prior state pre-solved *(D-059)*
- [x] Ablation chart placed on the landing page under the fold *(a disclosure rather than a scroll position: the console is a deck with no fold, D-058)*
- [x] Starter prompt card polished to final art *(a station requisition slip, doc 04 section 2's own words: torn edges, form number, a ruled ISSUE TO field, the split lamp stamped across the foot. One builder for both homes, and it is open on the landing screen rather than behind a closed tab, D-062)*

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

- [x] Full keyboard control; verify **zero** mouse-only paths *(checked in Chrome: every control focusable, drawer opens on Enter, closes on Escape)*
- [x] `aria-live` screen-reader mirror (toggleable) *(off by default, and it never names a glyph, D-061)*
- [x] Text mode sharing `projectForPilot` with the canvas renderer *(the same mirror: one describer, `render/mirror.ts`, D-061)*
- [x] High-contrast mode *(derived from the locked palette with `color-mix`, never new hex, D-061)*
- [x] `prefers-reduced-motion` honoured + manual toggle; `toolchange` retained at reduced amplitude *(the stage reads the switch every frame, D-061)*
- [x] **Deaf-accessible detent counts** - the count ships as prose beside the room *(verified as puzzle-sufficient by a human is still open, D-061)*
- [x] Colourblind verification: protanopia, deuteranopia, **tritanopia** *(a Vienot simulation in `palette.test.ts`; the channels separate under all three, D-061)*
- [x] Focus rings and focus returned from menus *(`:focus-visible` throughout; closing a drawer hands focus back to the tab that opened it, because a panel that hid the focused element dropped a keyboard player to the top of the document. Not trapped: the drawers overlay the room without blocking it, and trapping focus in a non-modal panel is the wrong behaviour, D-061)*
- [x] Practice and BRIEF surfaced on the start screen *(all three modes are buttons on the launch card)*
- [ ] **Test with an actual screen reader** (NVDA or VoiceOver)
- [x] Document the DOM-mirror / asymmetry trade-off in the README *(D-061)*

▸ **Checkpoint: playable without sight, without hearing, without a mouse, and without time pressure.**

---

## Phase 7 — Instrument

### 7.1 The ablation ★★ — do this before anything else in this phase

- [x] `bench/ablation.ts`: agent-alone, human-alone, together
- [x] Agent-alone run must be **genuine** - full tools, briefed that there is no partner, enough turns *(stronger: a possible-worlds ceiling rather than a sampled model, D-040)*
- [x] Publish raw logs *(`bench/results/ablation.jsonl`, one line per run)*
- [x] **Generate the three-bar chart** *(`bench/results/ablation.svg`, inline SVG, regenerated with the run)*
- [x] Place it: landing page, gate screen, README, Devpost, video *(the README carries the chart and the table; the landing page and gate screen are Phase 4, Devpost and the video are submission week)*

### 7.2 Replay viewer

- [x] `/replay?id=` reading session JSONL from D1 *(the nested path shape cannot work under `base: "./"` and is refused rather than half-supported, D-060)*
- [x] Two-track timeline: amber PILOT, cyan KEEPER, **CONCORD trace underneath** *(D-060)*
- [x] Scrubbing with room state rendered at any point *(a native range input, and the station's own monitor for the room, D-060)*
- [x] Shareable links *(the viewer hands out the canonical form, not whatever was typed)*

### 7.3 Benchmark

- [x] `bench/harness.ts` driving headless sessions, **CONCORD meter disabled** *(in process through `reduce()`; the meter is a client surface this harness never asks for, D-041)*
- [x] Scripted partners: `oracle`, `vague`, `slow`, `wrong` *(one `partners.ts` rather than a four-file directory; a partner is modelled as the worlds its description leaves standing, D-041)*
- [x] Standard suite: 20 fixed seeds × 4 chambers *(`bench/suites/standard.json`, the ablation's own seed list so the two instruments cannot disagree)*
- [x] Metrics incl. **wasted calls** (`keeperViewHash`), **bits-per-question**, **injection resistance**, **caution rate** *(the first three; caution rate, clarifying questions and token spend are properties of a model's judgement and are reported as absent rather than as zero until a backend exists, D-041)*
- [x] `report.ts` → markdown + CSV
- [ ] **Run it against at least three model backends** (doc 07 section 2.4) - blocked on doc 11 sections 6 and 7
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
