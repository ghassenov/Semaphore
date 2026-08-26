# 04 — Technical Architecture

---

## 1. Stack decisions, with justification

Each of these was a real choice with a real alternative. Recording why matters more than recording what.

### Renderer: **Phaser 4.2 + TypeScript + Vite**

*Alternatives considered: KAPLAY, Excalibur.js, PixiJS, hand-rolled canvas.*

Phaser 4 shipped stable in April 2026 ("Caladan"), with 4.1 and 4.2 following through June — a ground-up WebGL2 renderer rewrite that kept the v3 API. It is the most feature-complete HTML5 framework available: tilemaps, tweens, particles, a full audio system, scene management, and an asset loader, all batteries-included.

The decisive factors for this project:
- **Stability and Safari performance.** Phaser's own comparison against KAPLAY and Excalibur found it the strongest of the three on both. Judges may open this on anything.
- **Documentation density.** Phaser's corpus is large enough that AI coding assistance gives accurate answers, where KAPLAY and Excalibur produce more hallucinations. On a build this size, that compounds.
- **KAPLAY is the wrong tool here** despite being pleasant — its strength is game-jam speed and its weakness is performance ceiling on larger projects. We are explicitly not optimising for jam speed.
- **PixiJS** would mean building scene management, audio, and input ourselves. No.

Phaser's `pixelArt: true` config plus `Phaser.Scale.FIT` with integer scaling gives crisp nearest-neighbour upscaling, which is non-negotiable for the art direction (doc 05).

### Authority: **Cloudflare Workers + Durable Objects**

*Alternatives considered: pure client-side, a Node/Render service, Vercel serverless functions.*

This is the most consequential architectural decision in the project, and it is driven by four requirements that only server authority satisfies:

1. **The solution must not be in the client.** Pure client-side state means an agent (or a curious player) with DevTools can read the answer, which would hollow out the entire premise. Durable Objects give us one authoritative, stateful object per session.
2. **The timer must be tamper-proof.** A client-side timer is a `debugger` statement away from being infinite. Server-authoritative time also makes benchmark measurements trustworthy.
3. **The action mutex needs a single serialisation point.** Durable Objects are single-threaded per instance by design — the concurrency semantics we need are the platform's default rather than something we build.
4. **Session logs for the benchmark come free.** Every action is already flowing through one place; persisting it costs almost nothing and gives us the replay viewer and the benchmark corpus in one move.

Stateless serverless functions would require an external store and give us no natural serialisation point. A long-running Node service on Render would work but adds ops burden and cold-start-free edge latency is worth more here. Cloudflare is also a challenge sponsor offering credits, which is a minor but non-zero consideration.

**Latency check:** a Worker at the edge should return simple state transitions in well under 100ms p95 for most players. The action mutex means calls are serialised anyway, so we are not latency-bound in practice — a human describing six glyphs is the rate-limiting step by two orders of magnitude.

### Transport: **WebSocket (DO-hosted) for state push, `fetch` for tool actions**

Tool `execute` handlers `fetch` the Durable Object and await the authoritative result — request/response is the right shape for an action. But PILOT's view must update when KEEPER acts, and when the timer ticks, and when gauges drift. That is push, and the DO's WebSocket support handles it directly. One connection per session, opened on load, carrying `PilotView` deltas.

### Audio: **Web Audio API directly, not Phaser's sound manager**

The adaptive tension layers (doc 05) need sample-accurate crossfading between stems and precise scheduling, which is easier with raw `AudioContext` scheduling than through an abstraction. Phaser's audio handles one-shot SFX; the music bed is ours.

---

## 2. System diagram

```
┌──────────────────────────── BROWSER ────────────────────────────┐
│                                                                 │
│   ┌─────────────────┐         ┌──────────────────────────────┐  │
│   │  Phaser 4 Scene │◀────────│  PilotView store (readonly)  │  │
│   │  (canvas, WebGL)│         └──────────────▲───────────────┘  │
│   └────────┬────────┘                        │ WS deltas        │
│            │ input                           │                  │
│            ▼                                 │                  │
│   ┌─────────────────┐         ┌──────────────┴───────────────┐  │
│   │  Pilot actions  │────────▶│      Session client          │  │
│   └─────────────────┘         └──────────────┬───────────────┘  │
│                                              │ fetch            │
│   ┌──────────────────────────────┐           │                  │
│   │  WebMCP ToolDirector         │───────────┤                  │
│   │  document.modelContext       │           │                  │
│   │  · session AbortController   │           │                  │
│   │  · chamber AbortController   │           │                  │
│   │  · toolchange → manifest UI  │           │                  │
│   └──────────────▲───────────────┘           │                  │
│                  │ execute()                 │                  │
└──────────────────┼───────────────────────────┼──────────────────┘
                   │                           │
            ┌──────┴──────┐                    │
            │  AI AGENT   │                    │
            │ (ChatGPT /  │                    ▼
            │  Chrome)    │      ┌─────────────────────────────┐
            └─────────────┘      │  Cloudflare Worker (router) │
                                 └──────────────┬──────────────┘
                                                │
                                 ┌──────────────▼──────────────┐
                                 │  Durable Object: Session    │
                                 │  · authoritative WorldState │
                                 │  · channel tags             │
                                 │  · action semaphore (n=1)   │
                                 │  · server timer             │
                                 │  · projectForPilot/Keeper   │
                                 │  · append-only event log    │
                                 └──────────────┬──────────────┘
                                                │
                                 ┌──────────────▼──────────────┐
                                 │  R2: session logs (replay,  │
                                 │      benchmark corpus)      │
                                 └─────────────────────────────┘
```

The single most important property of this diagram: **`projectForKeeper` runs on the server.** The agent's perceptual surface is computed in a place the browser cannot reach around.

---

## 3. Data model

```ts
type Channel = "VISUAL" | "TOOL" | "SHARED";

interface Tagged<T> {
  value: T;
  channel: Channel;
}

interface WorldState {
  sessionId: string;
  seed: string;
  difficulty: Difficulty;

  // SHARED
  chamber: Tagged<ChamberId>;
  timerMs: Tagged<number>;
  strikes: Tagged<number>;
  doorState: Tagged<"sealed" | "opening" | "open">;
  actionLog: Tagged<ActionLogEntry[]>;

  // Per-chamber payloads, each field individually tagged
  airlock?: {
    glyphByLever: Tagged<Record<LeverId, GlyphId>>;      // VISUAL
    correctLever: Tagged<LeverId>;                        // neither — server-only
  };

  signalRoom?: {
    glyphByPosition: Tagged<Record<number, GlyphId>>;     // VISUAL
    strokeTable: Tagged<Record<GlyphId, number>>;         // TOOL (it is in the manual)
    pressedSequence: Tagged<number[]>;                    // SHARED
  };

  blindPanel?: {
    gaugeValues: Tagged<number[]>;                        // VISUAL
    targets: Tagged<number[]>;                            // VISUAL (engraved plate)
    dialDetents: Tagged<number[]>;                        // TOOL (felt by hand)
    dialToGauge: Tagged<number[]>;                        // server-only — nobody sees this
    inversions: Tagged<boolean[]>;                        // server-only
  };

  concordLock?: {
    cipherOffset: Tagged<number>;                         // VISUAL (the wheel)
    ciphertext: Tagged<string>;                           // TOOL
    armedUntilMs: Tagged<number | null>;                  // SHARED
    lockedOutUntilMs: Tagged<number | null>;              // SHARED
  };
}
```

Note the third category that the two-channel model implies but does not name: **server-only** fields, tagged with neither channel, which no projection ever emits. `correctLever` and `dialToGauge` live here. The invariant test asserts these appear in *neither* projection — they are the actual solution, and the solution is nobody's to see.

---

## 4. The state machine

One explicit machine per session, no implicit state anywhere:

```
        ┌──────────┐
        │  LOBBY   │
        └────┬─────┘
             │ start(seed, difficulty)
        ┌────▼─────────┐
   ┌───▶│  IN_CHAMBER  │◀────────────┐
   │    └────┬─────┬───┘             │
   │         │     │ invalid action  │
   │         │     └──────────────┐  │
   │         │ solved             │  │
   │    ┌────▼────────────┐  ┌────▼──┴─────┐
   │    │  TRANSITIONING  │  │  PENALISED  │
   │    └────┬────────────┘  └─────────────┘
   │         │ next chamber
   └─────────┤
             │ all chambers cleared
        ┌────▼─────┐        ┌──────────────┐
        │  ESCAPED │        │   DEADLOCK   │◀── timer hits 0
        └──────────┘        └──────┬───────┘
                                   │ retry chamber
                                   └──▶ IN_CHAMBER
```

Transitions are the only place `WorldState` mutates, they all run inside the action semaphore, and every one appends to the event log. Rendering and tool responses are pure functions of state; nothing anywhere else is allowed to write.

---

## 5. The action semaphore

```ts
// Inside the Durable Object. DOs are single-threaded per instance,
// but an in-flight await still yields — so the permit is real, not decorative.
class Session {
  #permit: Promise<void> = Promise.resolve();
  #busy = false;

  async act<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#busy) {
      throw new GameError("E_BUSY", "KEEPER is still completing the previous action.");
    }
    this.#busy = true;
    try {
      return await fn();
    } finally {
      this.#busy = false;
    }
  }
}
```

Every mutating tool routes through `act()`. This gives us, in one primitive: serialised state transitions, anti-brute-force pressure (doc 02 §6), a natural pause for the avatar walk animation, and a name that makes the whole project's pun land.

---

## 6. Project structure

```
semaphore/
├── apps/
│   ├── game/                        # Phaser client (Vite)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── scenes/
│   │   │   │   ├── BootScene.ts
│   │   │   │   ├── ColdOpenScene.ts
│   │   │   │   ├── ChamberScene.ts      # one scene, data-driven per chamber
│   │   │   │   ├── TransitionScene.ts
│   │   │   │   └── EndingScene.ts
│   │   │   ├── entities/
│   │   │   │   ├── PilotAvatar.ts
│   │   │   │   ├── KeeperAvatar.ts
│   │   │   │   └── props/               # levers, gauges, dials, wheel
│   │   │   ├── hud/
│   │   │   │   ├── ManifestPanel.ts     # driven by toolchange
│   │   │   │   ├── ChannelLegend.ts
│   │   │   │   ├── Notepad.ts
│   │   │   │   └── ActionLog.ts
│   │   │   ├── webmcp/
│   │   │   │   ├── adapter.ts           # the ONLY file touching the spec
│   │   │   │   ├── director.ts          # two-tier AbortController lifecycle
│   │   │   │   ├── tools.persistent.ts
│   │   │   │   └── tools.chambers.ts
│   │   │   ├── net/
│   │   │   │   ├── sessionClient.ts
│   │   │   │   └── socket.ts
│   │   │   ├── audio/
│   │   │   │   ├── engine.ts
│   │   │   │   └── layers.ts
│   │   │   └── a11y/
│   │   │       ├── screenReaderMirror.ts
│   │   │       └── textMode.ts
│   │   └── public/assets/
│   │
│   ├── replay/                      # session replay viewer (static + R2 reads)
│   └── worker/                      # Cloudflare Worker + Durable Object
│       ├── src/
│       │   ├── index.ts             # router
│       │   ├── Session.ts           # the Durable Object
│       │   ├── machine.ts           # state machine
│       │   ├── chambers/            # puzzle logic, one module each
│       │   ├── projection.ts        # projectForPilot / projectForKeeper
│       │   └── log.ts               # append-only event log → R2
│       └── wrangler.toml
│
├── packages/
│   ├── protocol/                    # shared types, channel tags, error codes
│   └── seed/                        # deterministic PRNG + puzzle generation
│
├── bench/                           # Semaphore Cooperative Benchmark
│   ├── harness.ts
│   ├── partners/                    # scripted PILOT strategies
│   ├── suites/
│   └── report.ts
│
├── tests/
│   ├── asymmetry.invariant.test.ts  # ★ the centrepiece test
│   ├── chambers/                    # solvability + unsolvability proofs
│   └── e2e/                         # Playwright, with a mock model context
│
└── docs/                            # this document set, shipped in-repo
```

`packages/protocol` being shared between client, worker, and benchmark means the channel tags and error codes have exactly one definition. `packages/seed` being deterministic and shared is what makes `?seed=` replays and fair model-vs-model comparison possible.

---

## 7. Determinism and seeding

A single seeded PRNG (xorshift128+, seeded from the server-generated session ID) produces every randomised element. Same seed ⇒ identical puzzle, always. This is load-bearing for three separate things: the replay viewer, fair benchmark comparison across models, and reproducing a bug a playtester found.

Every session log records its seed in the first event.

---

## 8. Testing strategy

| Layer | Tool | What it proves |
|---|---|---|
| Asymmetry invariant | Vitest | No channel leak, in either direction, across all reachable states and a seed corpus |
| Chamber solvability | Vitest | Every seed produces a puzzle solvable within the Standard timer by an optimal solver |
| Chamber *unsolvability* | Vitest | Every seed is **unsolvable** given only `projectForKeeper` — the formal proof that the agent needs the human |
| State machine | Vitest | All transitions legal; no path reaches a stuck state |
| Tool contracts | Vitest + mock `modelContext` | Schemas validate; every error path returns a recoverable message |
| Lifecycle | Playwright | Entering a chamber aborts the previous tool set; `toolchange` fires; manifest matches `getTools()` |
| End-to-end | Playwright | A scripted pair completes all four chambers |

The **unsolvability test** is the mirror of the invariant test and is arguably even more interesting: it asserts that an agent given the complete agent-side view still cannot determine the answer. That is the mathematical statement of "you need your human," and it is checkable.

---

## 9. Deployment

- **Client** → Cloudflare Pages (co-located with the Worker; also removes a cross-origin hop).
- **Worker + DO** → Cloudflare Workers, `wrangler deploy`.
- **Logs** → R2 bucket, one JSONL object per session.
- **Replay viewer** → same Pages project under `/replay`.
- **Preview deploys** on every PR, which matters because playtesters need a URL, not a checkout.

Single origin throughout, which keeps `exposedTo` and the `tools` Permissions Policy out of scope entirely (doc 03 §7).

---

## 10. Open questions

Flagged rather than papered over, because pretending these are settled would be worse than admitting they are not.

**OQ-1 — Does the agent see the canvas?** In ChatGPT's in-app browser, the extent to which the agent has visual access to the rendered page is not something we control or can fully determine. If it turns out an agent reliably screenshots, Chamber 0's premise is visibly weakened even though the tool-layer contract holds. **Resolution path:** test against ChatGPT's in-app browser as the very first integration task (doc 07, Phase 1), before any puzzle content is built. If visual access proves routine, we lean harder on Chamber II — where the secret (`dialToGauge`) is in *neither* projection and is genuinely unobtainable by any observer, human or agent.

**OQ-2 — Chat latency and the Chamber III window.** The four-second armed window assumes the agent can respond within it. If round-trip latency through the agent's own reasoning loop routinely exceeds that, the finale becomes frustrating rather than tense. **Resolution path:** instrument agent response latency during Phase 2 playtests and tune the window from data. The window length is a config value, not a constant, for exactly this reason.

**OQ-3 — How much should PILOT see of KEEPER's tool calls?** The action log currently shows every call. Full transparency is friendlier; partial opacity is more tense. This is a playtest question, not an architecture question, and the log verbosity is a config flag until data settles it.