# 05 — Technical Architecture

---

## 1. Stack decisions, with justification

Each was a real choice with a real alternative. Recording why matters more than recording what.

### Renderer: **Phaser 4.2 + TypeScript + Vite**

*Alternatives: KAPLAY, Excalibur.js, PixiJS, hand-rolled canvas.*

Phaser 4 shipped stable in April 2026 ("Caladan") — a ground-up WebGL2 renderer rewrite that kept the v3 API. It is the most feature-complete HTML5 framework available: tilemaps, tweens, particles, audio, scene management, asset loading, all batteries-included.

Decisive factors: **stability and Safari performance** (judges may open this on anything); **documentation density**, which materially improves AI coding assistance accuracy on a build this size; and the fact that PixiJS would mean building scene management and input ourselves. KAPLAY is pleasant and optimised for jam speed, which is explicitly not what we are optimising for.

`pixelArt: true` plus `Phaser.Scale.FIT` with integer snapping gives crisp nearest-neighbour upscaling, non-negotiable for the art direction.

**Measure the bundle in Phase 0, not Phase 6.** Doc 07 budgets 400KB gzipped. Phaser 4 tree-shaken is plausible but tight, and you want to know before four chambers of scene code are written against the API.

### Authority: **Cloudflare Workers + Durable Objects**

*Alternatives: pure client-side, a Node service on Render, Vercel functions.*

The most consequential decision in the project, driven by five requirements only server authority satisfies:

1. **The solution must not be in the client.** Client-side state means DevTools reveals the answer, hollowing out the premise. One Durable Object per session holds authoritative truth; `HIDDEN` fields never leave it.
2. **The timer must be tamper-proof.** A client timer is one `debugger` from infinite. Server time also makes benchmark measurements trustworthy.
3. **The action mutex needs a single serialisation point.** DOs are single-threaded per instance by design — the concurrency semantics we need are the platform's default rather than something we build.
4. **Session logs come free.** Every action already flows through one place; persisting it gives us the replay viewer, the benchmark corpus, and the Archive's ghosts in one move.
5. **The CONCORD meter needs server-side world enumeration.** Computing `|W(s)|` requires the `HIDDEN` fields. It has to run where they live.

Cloudflare is also a challenge sponsor offering credits — minor, but non-zero.

**Latency check:** edge Workers return simple transitions well under 100ms p95. The action mutex serialises calls anyway, and a human describing six glyphs is the rate-limiting step by two orders of magnitude.

### Transport: **WebSocket for state push, `fetch` for tool actions**

Tool `execute` handlers `fetch` the DO and await the authoritative result — request/response is the right shape for an action. But PILOT's view must update when KEEPER acts, when the timer ticks, when gauges drift, and when CONCORD changes. That is push, and the DO's WebSocket support handles it. One connection per session, carrying `PilotView` deltas.

### Audio: **Web Audio API directly, not Phaser's sound manager**

Adaptive tension layers need sample-accurate crossfading and precise scheduling, easier with raw `AudioContext` than through an abstraction. Phaser handles one-shot SFX; the music bed and the `AUDIBLE` channel are ours.

### The archive: **a second origin**

`archive.<domain>` is a separate Pages project serving a minimal page that registers `read_manual` and `read_station_log` (doc 03 §7). It reads the same R2 bucket as the game. Behind a build flag so a single-origin fallback ships green.

---

## 2. System diagram

```
┌───────────────────────────── BROWSER ──────────────────────────────┐
│                                                                    │
│   ┌─────────────────┐         ┌──────────────────────────────┐     │
│   │  Phaser 4 Scene │◀────────│  PilotView store (readonly)  │     │
│   │  (canvas WebGL2)│         └──────────────▲───────────────┘     │
│   └────────┬────────┘                        │ WS deltas           │
│            │ input                           │                     │
│            ▼                                 │                     │
│   ┌─────────────────┐         ┌──────────────┴───────────────┐     │
│   │  Pilot actions  │────────▶│      Session client          │     │
│   └─────────────────┘         └──────────────┬───────────────┘     │
│                                              │ fetch               │
│   ┌──────────────────────────────┐           │                     │
│   │  WebMCP ToolDirector         │───────────┤                     │
│   │  document.modelContext       │           │                     │
│   │  · entry   AbortController   │           │                     │
│   │  · session AbortController   │           │                     │
│   │  · chamber AbortController   │           │                     │
│   │  · toolchange → manifest     │           │                     │
│   │  · toolchange → KEEPER body  │           │                     │
│   └──────────────▲───────────────┘           │                     │
│                  │                           │                     │
│   ┌──────────────┴───────────────┐           │                     │
│   │  <iframe allow="tools">      │           │                     │
│   │  archive.<domain>            │           │                     │
│   │  read_manual, read_station_log           │                     │
│   │  exposedTo: [game origin]    │           │                     │
│   └──────────────────────────────┘           │                     │
└──────────────────┬───────────────────────────┼─────────────────────┘
                   │ execute()                 │
            ┌──────┴──────┐                    ▼
            │  AI AGENT   │      ┌─────────────────────────────┐
            │ (ChatGPT /  │      │  Cloudflare Worker (router) │
            │  Chrome)    │      └──────────────┬──────────────┘
            └─────────────┘                     │
                                 ┌──────────────▼──────────────┐
                                 │  Durable Object: Session    │
                                 │  · authoritative WorldState │
                                 │  · channel tags             │
                                 │  · action semaphore (n=1)   │
                                 │  · server timer             │
                                 │  · projectForPilot/Keeper   │
                                 │  · consistentWorlds() → CONCORD │
                                 │  · latency observer → Ch.III window │
                                 │  · append-only event log    │
                                 └──────────────┬──────────────┘
                                                │
                                 ┌──────────────▼──────────────┐
                                 │  R2: session logs           │
                                 │  (replay · benchmark ·      │
                                 │   the Archive's ghosts)     │
                                 └─────────────────────────────┘
```

The single most important property: **`projectForKeeper` runs on the server.** The agent's perceptual surface is computed in a place the browser cannot reach around. The second most important: **R2 holds one artifact that is simultaneously the replay corpus, the benchmark corpus, and the game's ghosts.**

---

## 3. Data model

```ts
type Channel = "VISUAL" | "TACTILE" | "AUDIBLE" | "SHARED" | "HIDDEN";
interface Tagged<T> { value: T; channel: Channel; }

interface WorldState {
  sessionId: string;
  seed: string;
  difficulty: Difficulty;
  designation: string;                                   // what the agent named itself

  // SHARED
  chamber: Tagged<ChamberId>;
  timerMs: Tagged<number>;
  strikes: Tagged<number>;
  doorState: Tagged<"sealed" | "opening" | "open">;
  actionLog: Tagged<ActionLogEntry[]>;
  concordBits: Tagged<number>;                           // log2(|W(s)|)
  notepad: Tagged<NoteLine[]>;                           // each line carries its author

  // Derived telemetry, not perceptual
  observedLatencyMs: number[];                           // feeds the Chamber III window

  airlock?: {
    glyphByLever:  Tagged<Record<LeverId, GlyphId>>;     // VISUAL
    leverFeel:     Tagged<Record<LeverId, string>>;      // TACTILE
    correctLever:  Tagged<LeverId>;                      // HIDDEN
  };

  signalRoom?: {
    glyphByPosition: Tagged<Record<number, GlyphId>>;    // VISUAL
    manualPageState: Tagged<"clean" | "vandalised">;     // VISUAL — PILOT sees the handwriting
    vandalismText:   Tagged<string | null>;              // TACTILE — KEEPER reads it
    strokeTable:     Tagged<Record<GlyphId, number>>;    // TACTILE (it is in the manual)
    pressedSequence: Tagged<number[]>;                   // SHARED
    correctSequence: Tagged<number[]>;                   // HIDDEN
  };

  blindPanel?: {
    gaugeValues:  Tagged<number[]>;                      // VISUAL
    targets:      Tagged<number[]>;                      // VISUAL (engraved plate)
    dialDetents:  Tagged<number[]>;                      // TACTILE (felt by hand)
    lastClicks:   Tagged<number | null>;                 // AUDIBLE — heard by both
    dialToGauge:  Tagged<number[]>;                      // HIDDEN
    inversions:   Tagged<boolean[]>;                     // HIDDEN
    crossLink:    Tagged<[number, number]>;              // HIDDEN
  };

  concordLock?: {
    cipherOffset:      Tagged<number>;                   // VISUAL (the wheel)
    ciphertext:        Tagged<string>;                   // TACTILE
    boltsAligned:      Tagged<number>;                   // SHARED
    staminaMs:         Tagged<number | null>;            // SHARED — null when not armed
    staminaWindowMs:   Tagged<number>;                   // SHARED — derived from latency
    lockedOutUntilMs:  Tagged<number | null>;            // SHARED
    passphrase:        Tagged<string>;                   // HIDDEN
  };
}
```

`HIDDEN` is now an explicit channel rather than v1's implicit "untagged" category. The solution is nobody's to see, and saying so in the type system is better than saying it in a comment.

**`lastClicks` is the `AUDIBLE` channel in action.** It appears in both projections: PILOT's renderer turns it into detent sounds through the grate; KEEPER's `describe_chamber` reports it as *"you feel three detents pass under your hand."* Same fact, two renderings, one field.

---

## 4. The state machine

One explicit machine per session, no implicit state anywhere.

```
        ┌──────────┐
        │  ENTRY   │  begin_shift registered, nothing else
        └────┬─────┘
             │ begin_shift(designation)
        ┌────▼─────┐
        │  LOBBY   │  persistent tools mounted
        └────┬─────┘
             │ start(seed, difficulty, mode)
        ┌────▼─────────┐
   ┌───▶│  IN_CHAMBER  │◀────────────┐
   │    └──┬────┬───┬──┘             │
   │       │    │   │ invalid action │
   │       │    │   └─────────────┐  │
   │       │    │ archive beat    │  │
   │       │    ▼                 │  │
   │       │ ┌──────────┐    ┌────▼──┴─────┐
   │       │ │ ARCHIVE  │    │  PENALISED  │
   │       │ └────┬─────┘    └─────────────┘
   │       │ solved │
   │  ┌────▼───────▼────┐
   │  │  TRANSITIONING  │  chamber tools abort, new ones register
   │  └────┬────────────┘
   └───────┤ next chamber
           │ all chambers cleared
      ┌────▼─────┐   ┌──────────────┐
      │  FINALE  │   │   DEADLOCK   │◀── timer hits 0
      └────┬─────┘   └──────┬───────┘
           │ open_the_door   │ retry chamber
      ┌────▼─────┐          └──▶ IN_CHAMBER
      │  ESCAPED │  all controllers aborted, registry empty
      └──────────┘
```

Transitions are the only place `WorldState` mutates, they all run inside the action semaphore, and every one appends to the event log. Rendering and tool responses are pure functions of state; nothing else is allowed to write.

---

## 5. The action semaphore

```ts
// Inside the Durable Object. DOs are single-threaded per instance,
// but an in-flight await still yields — so the permit is real, not decorative.
class Session {
  #busy = false;

  async act<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#busy) {
      throw new GameError("E_BUSY", "KEEPER is still completing the previous action.");
    }
    this.#busy = true;
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      this.#busy = false;
      this.#observeLatency(Date.now() - t0);
    }
  }
}
```

Every mutating tool routes through `act()`. One primitive gives us: serialised transitions, anti-brute-force pressure, a natural pause for the avatar animation, latency observation for the adaptive Chamber III window, and a name that makes the project's pun land.

---

## 6. Latency observation and the adaptive window

The DO records round-trip time for every tool call in Chambers 0–II. On entering Chamber III:

```ts
const median = percentile(state.observedLatencyMs, 50);
const windowMs = clamp(6 * median, 12_000, 35_000);
```

Fiction: *the station learns your rhythm.* Engineering: an adaptive difficulty parameter derived from telemetry we already collect, which makes the finale work for a fast model and a slow one alike (R4).

The derived value is written into the session log so the benchmark can control for it, and it is shown on the stats card at the end — *"your rhythm: 3.2s. The station gave you 19 seconds."* — which is a quietly lovely detail.

---

## 7. The session log

One append-only JSONL stream per session, written by the DO to R2. One line per event. **The log is the session** — it is simultaneously the replay source, the benchmark corpus, and the Archive's ghosts.

```jsonc
{ "t": 12847, "seq": 41, "type": "tool_call",
  "tool": "rotate_dial", "input": { "dial_id": 2, "direction": "clockwise", "clicks": 3 },
  "result": "ok", "latencyMs": 62,
  "keeperViewHash": "a3f…",        // the agent's epistemic state at call time
  "concordBits": 6.32,             // ambiguity remaining after this call
  "wasted": false }

{ "t": 13102, "seq": 42, "type": "pilot_action", "action": "move", "to": "gauge_bank" }

{ "t": 13440, "seq": 43, "type": "state_delta",
  "path": "blindPanel.gaugeValues", "from": [3,1,5,2], "to": [3,4,5,2] }

{ "t": 13502, "seq": 44, "type": "audible", "cue": "detents", "count": 3 }
```

`keeperViewHash` makes the **wasted calls** metric computable after the fact — we can replay the agent's exact epistemic state at any moment. `concordBits` makes the CONCORD meter reconstructable in replay, so the ghost sessions show ambiguity collapsing exactly as it did live.

**Because this format is stable and zero-PII, the same file plays three roles.** That is not a coincidence to be pleased about; it is the reason the Archive was cheap to build.

---

## 8. Project structure

```
semaphore/
├── apps/
│   ├── game/                        # Phaser client (Vite)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── scenes/
│   │   │   │   ├── BootScene.ts
│   │   │   │   ├── LandingScene.ts       # front door, starter prompt, attract mode
│   │   │   │   ├── ColdOpenScene.ts
│   │   │   │   ├── ChamberScene.ts       # one scene, data-driven per chamber
│   │   │   │   ├── ArchiveScene.ts       # the ghost monitor
│   │   │   │   ├── TransitionScene.ts
│   │   │   │   └── EndingScene.ts
│   │   │   ├── entities/
│   │   │   │   ├── PilotAvatar.ts
│   │   │   │   ├── KeeperBody.ts         # ★ limbs driven by toolchange
│   │   │   │   └── props/
│   │   │   ├── hud/
│   │   │   │   ├── ManifestPanel.ts      # ★ driven by toolchange
│   │   │   │   ├── ConcordMeter.ts
│   │   │   │   ├── ChannelLegend.ts
│   │   │   │   ├── Notepad.ts            # ★ declarative form tool
│   │   │   │   └── ActionLog.ts
│   │   │   ├── webmcp/
│   │   │   │   ├── adapter.ts            # the ONLY file touching the spec
│   │   │   │   ├── director.ts           # ★ three-tier AbortController lifecycle
│   │   │   │   ├── tools.entry.ts        # begin_shift
│   │   │   │   ├── tools.persistent.ts
│   │   │   │   └── tools.chambers.ts
│   │   │   ├── net/ · audio/ · a11y/
│   │   │   └── replay/                   # shared renderer: /replay AND the Archive
│   │   └── public/assets/
│   │
│   ├── archive/                     # ★ the cross-origin tool provider
│   │   └── src/main.ts              #   read_manual, read_station_log, exposedTo
│   │
│   ├── replay/                      # standalone /replay/:id viewer
│   └── worker/
│       ├── src/
│       │   ├── index.ts             # router
│       │   ├── Session.ts           # the Durable Object
│       │   ├── machine.ts
│       │   ├── chambers/            # puzzle logic, one module each
│       │   ├── projection.ts        # projectForPilot / projectForKeeper
│       │   ├── worlds.ts            # ★ consistentWorlds() — proof + CONCORD
│       │   └── log.ts               # append-only event log → R2
│       └── wrangler.toml
│
├── packages/
│   ├── protocol/                    # shared types, channel tags, error codes
│   └── seed/                        # deterministic PRNG + puzzle generation
│
├── bench/
│   ├── harness.ts
│   ├── ablation.ts                  # ★ agent-alone / human-alone / together
│   ├── partners/                    # oracle · vague · slow · wrong
│   ├── suites/
│   └── report.ts
│
├── fixtures/ghosts/                 # the authored ghost sessions
├── tests/
│   ├── possible-worlds.test.ts      # ★ the centrepiece proof
│   ├── asymmetry.smoke.test.ts      # the cheap check
│   ├── chambers/
│   └── e2e/
└── docs/                            # this document set, shipped in-repo
```

`packages/protocol` shared between client, archive, worker, and benchmark means channel tags and error codes have exactly one definition. `apps/game/src/replay/` being shared between `/replay/:id` and `ArchiveScene` is what makes the Archive nearly free.

---

## 9. Determinism and seeding

A single seeded PRNG (xorshift128+, seeded from the server-generated session ID) produces every randomised element, including the Chamber I vandalism flag and which ghost appears in the Archive. Same seed ⇒ identical puzzle, always. Load-bearing for three separate things: the replay viewer, fair model-vs-model comparison, and reproducing a playtester's bug.

Every session log records its seed in the first event. `?seed=` reproduces an exact session.

---

## 10. Testing strategy

| Layer | Tool | What it proves |
|---|---|---|
| **Possible-worlds proof** | Vitest | For every reachable state and seed, `|W| > 1` **and** the consistent worlds disagree about the correct action. The mathematical statement of "you need your human." |
| Asymmetry smoke test | Vitest | Fast per-commit check that no channel value leaks verbatim. Documented allow-list; not the headline. |
| Chamber solvability | Vitest | Every seed is solvable within the Standard timer by an optimal pair |
| Bits table generation | Vitest | The published bits-per-chamber table is generated from the same code the proof uses — it cannot drift |
| State machine | Vitest | All transitions legal; no path reaches a stuck state |
| Tool contracts | Vitest + mock `modelContext` | Schemas validate; every error path returns a recoverable message |
| Description budgets | ESLint rule | 500 / 150 / 30 / 1500 character limits enforced in CI |
| Lifecycle | Playwright | Entering a chamber aborts the previous set; `toolchange` fires; manifest matches `getTools()`; the final registry is empty |
| Cross-origin | Playwright | Archive tools are visible to the game origin and only to it |
| End-to-end | Playwright | A scripted pair completes all four chambers and the Archive |

---

## 11. Deployment

- **Client** → Cloudflare Pages.
- **Archive** → a second Pages project on `archive.<domain>`.
- **Worker + DO** → Cloudflare Workers, `wrangler deploy`.
- **Logs** → R2, one JSONL object per session.
- **Replay viewer** → same Pages project under `/replay`.
- **Preview deploys on every PR**, because playtesters need a URL, not a checkout.

---

## 12. Open questions

Flagged rather than papered over.

**OQ-1 — Does the agent see the canvas?** In ChatGPT's in-app browser we do not control or fully know the extent of the agent's visual access. **Resolution path:** first integration task in Phase 0, before any puzzle content exists. If visual access proves routine, we lean harder on Chamber II in the video, where the secret is `HIDDEN` — in neither projection — and genuinely unobtainable by any observer. The tool-layer contract holds regardless, and doc 03 §10 says so honestly.

**OQ-2 — Cross-origin tool delegation in ChatGPT's in-app browser.** Unverified. Gates the archive design (R9). **Resolution path:** Phase 0 spike, with a single-origin fallback behind a build flag.

**OQ-3 — Does `requestUserInteraction` exist in the shipping draft?** Our v1 docs said removed; other readings say present via a second `execute` argument. **Resolution path:** Phase 0. If present, it goes on `speak_passphrase` and becomes a Leverage exhibit; if absent, the current design is unchanged.

**OQ-4 — How much should PILOT see of KEEPER's tool calls?** The action log currently shows every call. Full transparency is friendlier; partial opacity is more tense; the `AUDIBLE` channel already gives PILOT *some* signal regardless. This is a playtest question, not an architecture question, and log verbosity stays a config flag until data settles it.

**OQ-5 — Does the CONCORD meter help or spoil?** It makes the theorem playable, and it might also tell an observant player more than the fiction should. Playtest with it on and off. It is a config flag, defaulting on, and it is off in the benchmark's Standard configuration so it cannot contaminate the measurement.
