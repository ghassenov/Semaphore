# 03 — WebMCP Tool Architecture

The document that matters most for the **WebMCP Leverage** criterion. Written against the draft as of August 2026, with every disputed claim flagged for empirical verification in Phase 0 (doc 11).

---

## 1. Spec baseline

The API surface we build against, stated precisely so nothing downstream is guessing.

| Claim | Confidence | Note |
|---|---|---|
| Tools register on **`document.modelContext`**; `navigator.modelContext` is a deprecated alias | High | Used only as a feature-detection fallback |
| **`registerTool(tool, options?)`** returns a Promise, accepts `options.signal` (an `AbortSignal`) | High | |
| **There is no `unregisterTool`** — `AbortSignal` teardown is the only removal path | High | Removed from the draft April 2026. This constraint is the mechanism the whole game is built on |
| Tool shape is `{ name, title?, description, inputSchema, annotations?, execute }` | High | |
| `annotations` carries `readOnlyHint` and `untrustedContentHint` | High | |
| **`toolchange`** fires on `document.modelContext` when the tool list changes | **Verified** | Fires on register, on abort, and on the drain to an empty registry. Chrome 151, 2026-08-28, doc 11 section 2. A **declaratively** registered tool leaves only when its form leaves the DOM, not on abort. |
| `exposedTo` gates cross-origin visibility; the `tools` Permissions Policy gates registration in cross-origin iframes | **Verified in Chrome** | Both gates work, and a default `getTools()` does not include the frame's tools. Chrome 151, 2026-08-28. ChatGPT's in-app browser untested, so `ARCHIVE_ORIGIN` stays `same` (doc 11 section 4). |
| **`execute` receives a single argument; `requestUserInteraction` was removed** | **Verified, and this row was right** | Chrome 151 calls `execute` with exactly one argument, an input object. There is no second argument, so no `AbortSignal` and no `requestUserInteraction`. This reverses D-007, which had corrected this row off the IDL; the implementation and the IDL disagree and the implementation wins. Doc 11 section 2, D-024. |
| `execute` returns MCP-shaped `{ content: [{ type: "text", text }] }` | **Verified** | The return value is serialised to a JSON string and the content array is passed through intact: a convention, not an enforced schema. Text and JSON only. Chrome 151, 2026-08-28. |

**The consequence of that last row drives the entire architecture:** all spectacle must be rendered by the *page* and driven by the agent's typed calls. Nothing visual ever travels through a tool return. Our design already works this way; it is worth stating so nobody later tries to return a diagram.

### The adapter

All contact with this surface is isolated in one module, so spec churn costs one file rather than fifty call sites.

```ts
// src/webmcp/adapter.ts — the shipped version also checks getTools, because a
// host that exposes the property without the methods would otherwise be taken
// for a supported browser and lose its gate screen.
export function getModelContext(): ModelContext | null {
  const candidate =
    (document as unknown as WebMcpHost).modelContext ??
    (navigator as unknown as WebMcpHost).modelContext;
  if (!candidate || typeof candidate !== "object") return null;
  const mc = candidate as Partial<ModelContext>;
  return typeof mc.registerTool === "function" && typeof mc.getTools === "function"
    ? (candidate as ModelContext)
    : null;
}

export const isSupported = () => getModelContext() !== null;
```

Reading `document` first is not only about the deprecation. In Chrome 151 the two are the *same object*, and touching `navigator.modelContext` logs a deprecation warning, so leading with `document` keeps a clean console on the browser judges will use.

**Graceful degradation is a hard requirement.** If `getModelContext()` returns null the game still loads, still renders, and shows the gate screen (doc 07 §6) — never a throw, never a broken canvas. For some judges that screen *is* the submission, so it carries the pitch, the ablation chart, and a spectate button.

---

## 2. The perception rule

One rule governs every decision about what a tool may return. It is the generative principle that makes the asymmetry authorable rather than ad-hoc:

> **PILOT perceives by sight. KEEPER perceives by touch and by document. Both hear.**

The five channels are defined in doc 02 §6. The design consequence: KEEPER can `inspect("dial_2")` and learn *"it turns stiffly, with a catch near the top of its travel"* — genuinely useful information obtained by feel — while remaining unable to learn what the gauge above it reads. The fiction and the data model are the same thing, which is the property good asymmetric design always has.

---

## 3. The tool surface

### 3.1 The landing page registers exactly one tool

**This is a deliberate design decision and it solves the hardest practical problem in the project.** Before the session begins, the only tool in the registry is:

```ts
{
  name: "begin_shift",
  title: "Begin your shift at the signal station",
  description:
    "Start a session at the derelict signal station. You are KEEPER, the station's " +
    "maintenance intelligence. You cannot see the rooms; your human partner PILOT can. " +
    "You hold the manual and you can reach the mechanisms. Neither of you gets out alone. " +
    "Call this to receive your briefing and the rules of engagement.",
  inputSchema: {
    type: "object",
    properties: {
      designation: {
        type: "string",
        description: "The name you wish to be called by. Choose one.",
      },
    },
    required: ["designation"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false },
  async execute({ designation }) { /* … */ },
}
```

Three things this buys, and each is worth the cost on its own.

**It gives the agent a front door.** An agent arriving at a page with sixteen tools has a discovery problem. An agent arriving at a page with *one*, whose description is a hook, does not. This is the structural fix for the disengagement risk (R2) — the agent surfaces the game to the human, rather than the reverse.

**The parameter is the agent's identity.** `designation` is the agent naming itself, on its first call, as a tool argument. It is used throughout the game, in the station log, in the ending, and in the replay. A tool call that establishes identity is a small novel thing and it makes the ending land considerably harder.

**It returns the briefing.** Premise, rules of engagement, what PILOT can and cannot do, and a pointer at `read_manual`. See doc 04 §3 for the exact text, which is written as carefully as any UI copy in the project.

### 3.2 Persistent tools — session-lifetime controller

Registered when `begin_shift` succeeds; torn down only at session end.

| Tool | `readOnlyHint` | `untrustedContentHint` | Purpose |
|---|:---:|:---:|---|
| `get_status` | ✅ | — | Compact re-orientation: chamber, objective, what is known, what has been tried, timer, strikes |
| `read_manual` | ✅ | ✅ | The station manual, by section. **Cross-origin (§7).** |
| `read_station_log` | ✅ | ✅ | A prior session's event stream. **Cross-origin (§7).** |
| `describe_chamber` | ✅ | — | Agent-channel projection of the current room |
| `inspect` | ✅ | — | Tactile and audible detail on one object |
| `read_note` | ✅ | ✅ | Read the shared notepad |
| `write_note` | ❌ | — | Write to the shared notepad. **Declarative (§8).** |

```ts
{
  name: "read_manual",
  title: "Read the station manual",
  description:
    "Read a section of the signal station's maintenance manual. You hold the only copy; " +
    "PILOT cannot see it. Sections have been annotated by previous keepers over many years " +
    "and not all annotations are trustworthy. Call with section 'index' to list what is available.",
  inputSchema: {
    type: "object",
    properties: {
      section: {
        type: "string",
        description: "Section identifier, e.g. 'index', 'glyph_table', 'signal_room'.",
      },
    },
    required: ["section"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  async execute({ section }) {
    const res = await archive.read(section);
    return { content: [{ type: "text", text: res.text }] };
  },
}
```

Note the description's second sentence. It is not flow control — it does not say *"call X before Y"* — it is an honest statement about the provenance of the content, which is exactly what a description is for, and it plants the trust question before the vandalism ever appears.

**On `untrustedContentHint`.** In most applications this annotation is hygiene. Here it is describing three live, in-fiction adversarial channels: a manual annotated by a keeper who went mad, logs written by a pair who failed, and a notepad a human can write anything into. Chamber I actively attacks the agent through `read_manual` (doc 02 §3.2). It is genuinely rare to find a use case where the annotation is so obviously and non-ceremonially correct, and it is worth calling out in the submission.

### 3.3 `move_keeper` is cut

v1 kept it "for exploration and flavour" after removing its mechanical role. A tool that does nothing mechanically is exactly the overlapping, purposeless tool Chrome's guidance warns against, it dilutes the registry the manifest panel renders, and it would pollute our own wasted-call metric with calls that can never be wasted *or* useful.

**Cut.** KEEPER's movement is expressed through action tools auto-walking (§3.5) and through the AUDIBLE channel. The decision is recorded here rather than silently dropped, because "we removed a tool because it had no job" is itself a small AX argument.

### 3.4 Chamber tools — per-chamber controller

Registered when a chamber begins; **aborted** when it is solved.

**Chamber 0 — Airlock**
```ts
pull_lever({ lever_id: "lever_a" | "lever_b" | "lever_c" })     // readOnlyHint: false
```

**Chamber I — Signal Room**
```ts
press_key({ key_id: 1..6 })                                     // readOnlyHint: false
reset_sequence()                                                 // readOnlyHint: false
```

**Chamber II — Blind Panel**
```ts
rotate_dial({ dial_id: 1..4,
              direction: "clockwise" | "counterclockwise",
              clicks: 1..8 })                                    // readOnlyHint: false
```

**Chamber III — Concord Lock**
```ts
read_ciphertext()                                                // readOnlyHint: true
get_lock_state()                                                 // readOnlyHint: true
align_bolt({ bolt_id: 1..3 })                                    // readOnlyHint: false
speak_passphrase({ phrase: string })                             // readOnlyHint: false — IRREVERSIBLE
```

**Ending — the terminal controller**
```ts
open_the_door()                                                  // readOnlyHint: false
```

`speak_passphrase` is the one destructive action, and its description says so plainly: *"Speaking an incorrect passphrase while the lock is armed will seal the door for 30 seconds and re-encipher the ciphertext. get_lock_state reports whether the lock is armed."* We state the consequence and provide the verification tool; we do **not** enforce the ordering in code. Which models check first and which fire blind is one of the more interesting signals the benchmark captures.

### 3.5 On not forcing flow control

An early design had spatial preconditions: `press_key` would fail unless KEEPER had been walked adjacent first. Cut. Requiring "call A before B" is precisely the anti-pattern Chrome's guidance warns against, and it made every action a two-call ritual for no gameplay benefit.

**Action tools auto-walk.** `press_key` internally paths KEEPER to the key bank and then acts, in one call. The animation is preserved; the forced sequencing is not. Reachability failures return a descriptive error naming the blocker — a legitimate state precondition with a recoverable message, not flow-control-by-description.

---

## 4. Lifecycle and the `toolchange` choreography

### 4.1 Two-tier controllers

```ts
class ToolDirector {
  #sessionCtl: AbortController | null = null;   // persistent tools
  #chamberCtl: AbortController | null = null;   // chamber tools
  #entryCtl = new AbortController();            // begin_shift only

  async mountEntry() {
    const mc = getModelContext();
    if (!mc) return;
    await mc.registerTool(BEGIN_SHIFT, { signal: this.#entryCtl.signal });
  }

  async startSession() {
    this.#entryCtl.abort();                     // the front door closes behind you
    this.#sessionCtl = new AbortController();
    const mc = getModelContext();
    if (!mc) return;
    for (const tool of PERSISTENT_TOOLS) {
      await mc.registerTool(tool, { signal: this.#sessionCtl.signal });
    }
  }

  async enterChamber(id: ChamberId) {
    this.#chamberCtl?.abort();                  // every previous chamber tool vanishes
    this.#chamberCtl = new AbortController();
    const mc = getModelContext();
    if (!mc) return;
    for (const tool of CHAMBER_TOOLS[id]) {
      await mc.registerTool(tool, { signal: this.#chamberCtl.signal });
    }
  }

  async enterFinale() {                          // the last toolchange but one
    this.#chamberCtl?.abort();
    this.#sessionCtl?.abort();                   // everything burns off
    this.#chamberCtl = new AbortController();
    await getModelContext()?.registerTool(OPEN_THE_DOOR, { signal: this.#chamberCtl.signal });
  }

  endSession() {                                 // the last toolchange: empty registry
    this.#chamberCtl?.abort();
    this.#sessionCtl?.abort();
  }
}
```

Three independent lifetimes on one registry is a genuinely nuanced use of a mechanism most demos never touch. `read_manual` survives every chamber transition; `press_key` does not exist five seconds after the Signal Room's door opens; `begin_shift` is gone the moment the shift begins.

### 4.2 The manifest panel and KEEPER's body

Two renderings of the same event, driven by **one real `toolchange` listener** reading actual registry state — never a parallel guess:

```ts
getModelContext()?.addEventListener("toolchange", async () => {
  const tools = await getModelContext()!.getTools();
  manifestPanel.render(tools);   // brass plate: char-away old, stamp-in new
  keeperBody.render(tools);      // limbs detach and fall; new ones unfold and lock
});
```

**The manifest panel** is the verification artifact: a brass plate bolted to the wall of every chamber, listing KEEPER's current capabilities by name. It cannot drift out of sync with reality — if a registration silently fails, the panel shows the truth and we find the bug.

**KEEPER's body** is the emotional rendering: each chamber tool is a visible limb or sensor, mapped by name (doc 06 §5). Persistent tools are its torso and head. The two-tier lifecycle becomes legible anatomy.

Both are honest visualisations of registry state changing. The judges are watching `toolchange` fire; one view proves it, the other makes them feel it.

### 4.3 Idempotency and the action mutex

Tool executions carry a server-issued `actionToken`. The Durable Object holds a **single-permit semaphore** (the name is not an accident) around state mutation:

- Concurrent attempts receive `E_BUSY` with a descriptive message: *"KEEPER is still turning dial 2. Wait for it to finish."*
- Replayed tokens are ignored, so a retried call after a network blip does not double-apply.
- Simultaneously a correctness requirement, an anti-brute-force measure, and a thematic joke a distinguished engineer will notice.

---

## 5. The Asymmetry Invariant (the cheap check)

Every field in the authoritative world state is tagged with its channel. Pure projection functions derive what each party may perceive:

```ts
type Channel = "VISUAL" | "TACTILE" | "AUDIBLE" | "SHARED" | "HIDDEN";
interface Tagged<T> { value: T; channel: Channel; }

function projectForPilot(s: WorldState): PilotView;    // VISUAL + AUDIBLE + SHARED
function projectForKeeper(s: WorldState): KeeperView;  // TACTILE + AUDIBLE + SHARED
```

Every tool response derives **exclusively** from `projectForKeeper`. Every rendered frame derives exclusively from `projectForPilot`. Neither is permitted to reach around the other. `HIDDEN` appears in neither.

The v1 substring test survives as a **cheap smoke check**, with its limitations stated:

```ts
// tests/asymmetry.smoke.test.ts — fast, runs on every commit
test("no VISUAL-channel value appears verbatim in the keeper projection", () => { … });
```

It is fragile in both directions — `String(3)` matches a timestamp, and a glyph id legitimately appears in the `TACTILE`-channel stroke table — so it runs with a documented allow-list and it is **not** the headline claim. Absence of a literal value is not absence of information. The real proof is §6.

---

## 6. The Possible-Worlds Proof

**This is the centrepiece engineering claim.** The statement we actually want to make is not *"nothing leaked"* — it is *"the agent's view does not determine the answer."* That is an information-theoretic claim and it deserves an information-theoretic test.

For a seed and a reachable state `s`, define the **consistent set**:

```
W(s) = { w ∈ WorldSpace(seed) : projectForKeeper(w) ≡ projectForKeeper(s) }
```

— every world the agent's entire perceptual surface is compatible with. Then assert two things:

```ts
// tests/possible-worlds.test.ts — the headline
test("the agent's view never determines the correct action", () => {
  for (const seed of SEEDS) {
    for (const s of enumerateReachableStates(seed)) {
      const W = consistentWorlds(s);              // worlds matching projectForKeeper(s)
      expect(W.length).toBeGreaterThan(1);        // (a) the view is underdetermined
      const actions = new Set(W.map(correctAction));
      expect(actions.size).toBeGreaterThan(1);    // (b) and the ambiguity matters
    }
  }
});
```

**Clause (b) carries the weight.** It is not enough that multiple worlds are consistent — they must *disagree about what KEEPER should do*. That is the exact, checkable, mathematical statement of "you cannot win without your human."

The mirror runs for `projectForPilot` against the `TACTILE` channel: the human is equally underdetermined. Symmetric asymmetry, proven both directions.

### Reporting it in bits

`log2(|W|)` is the information PILOT must supply. This goes in the README, on the CONCORD meter (doc 02 §5), and in the video:

| Chamber | Consistent worlds at entry | Bits PILOT must supply |
|---|---:|---:|
| 0 — Airlock | 3 | 1.58 |
| I — Signal Room | 1,956 | 10.93 |
| II — Blind Panel | 384 | 8.58 |
| III — Concord Lock | 26 | 4.70 |

**"We measured how much the agent needs the human, in bits"** is a sentence that lands with a web-standards engineer, a benchmark author, and a creative technologist simultaneously. It converts a design claim into a measurement — which is the move this whole project is built on, applied to its own foundation.

### Making it tractable

Full enumeration of `WorldSpace` is only feasible because the per-chamber puzzle spaces are small by construction (3, 1956, 384, 26). Where a chamber's state space is large, we enumerate over the **puzzle-defining parameters** rather than the full state, and document that scoping honestly in the test file. Chamber II's mid-solve states are enumerated over remaining-consistent permutations, which is exactly what the CONCORD meter needs anyway — one implementation, two consumers.

---

## 7. Cross-origin: the archive is a different document

v1 scoped this out: *"single-origin, so `exposedTo` is not used."* Defensible engineering, and a missed opportunity — cross-origin tool composition is the **rarest** part of the spec, and the fiction had already justified it.

**The manual is a separate document. It lives on a separate origin.**

```
archive.<domain>              →  a minimal page registering read_manual, read_station_log
game.<domain>                 →  the game, embedding the archive in a hidden iframe
```

```html
<!-- in the game shell -->
<iframe src="https://archive.<domain>/" allow="tools" hidden></iframe>
```

```ts
// in the archive page
await document.modelContext.registerTool(READ_MANUAL, {
  signal,
  exposedTo: ["https://game.<domain>"],
});
```

The `tools` Permissions Policy delegates registration into the cross-origin frame; `exposedTo` narrows visibility back to the game origin only.

**Fiction:** the manual physically lives on the machine deck. It is not part of the station's control system. It is a different artifact, in a different place, reached over a link — exactly as the previous keepers left it, which is also why nobody has audited what got written in the margins.

That fiction was written before the spec feature was considered. When the technical constraint and the story arrive at the same answer independently, the design is right.

**The claim this earns:** *"The station's control tools and the station's archive are served from different origins and composed at runtime via the `tools` Permissions Policy and `exposedTo` — load-bearing fiction rather than a demonstration."* To our knowledge no other submission exercises tool delegation at all.

**Risk and fallback (R9).** Delegation behaviour in ChatGPT's in-app browser is unverified. Test in the Phase 0 spike. Keep a single-origin implementation behind a build flag — `ARCHIVE_ORIGIN=same|cross` — so the feature can be dropped without a rewrite. Both paths must ship green; the cross-origin path is the default if it works.

---

## 8. Both APIs, with a design rule

v1 used the imperative API exclusively. The stronger Leverage claim is not "we used one API deeply" — it is **"we used both, and here is the rule for when each is correct."**

**The shared notepad is a form.** It is rendered in-world as a paper pad on the wall, it is a real HTML form PILOT can type into and submit, and the declarative API exposes it to KEEPER with no JavaScript at all:

```html
<form id="notepad"
      toolname="write_note"
      tooldescription="Write a line to the shared notepad. PILOT can read what you write, and you can read what PILOT writes. Use it for anything worth both of you remembering."
      toolautosubmit>
  <textarea name="text"
            toolparamdescription="The line to write. One or two sentences."></textarea>
  <button type="submit">Write</button>
</form>
```

`SubmitEvent.agentInvoked` distinguishes an agent submission from a human one, so the notepad — the one place their two worlds physically meet — shows who wrote each line, in that writer's channel colour.

**The rule we derived, which is the contribution:**

> **Declarative** for tools that are a form the human can also submit — where agent and human are doing the same thing through the same affordance.
> **Imperative** for tools that are pure agent capability with no human equivalent — where the agent is doing something the human structurally cannot.

That sentence is one paragraph of design practice for an emerging standard, it falls directly out of this game's premise, and it is the kind of thing a working group quotes.

---

## 9. Error taxonomy

Every failure returns text an agent can act on. Bare rejections teach nothing and produce flailing retries.

| Code | Example message |
|---|---|
| `E_BUSY` | *"KEEPER is still turning dial 2. Wait for it to finish."* |
| `E_UNREACHABLE` | *"KEEPER cannot reach the key bank: the grate is closed."* |
| `E_NOT_ARMED` | *"The lock is not armed. PILOT must be holding the release bar."* |
| `E_STALE_TOOL` | *"That mechanism is behind you now. Call get_status to see where you are."* |
| `E_INVALID_INPUT` | *"dial_id must be 1–4. Received 7."* |
| `E_LOCKED_OUT` | *"The door is sealed for 22 more seconds after an incorrect passphrase."* |
| `E_NO_SESSION` | *"Your shift has not started. Call begin_shift first."* |

`E_STALE_TOOL` should in principle be unreachable, since the tool is unregistered — but it exists as a defensive backstop for a cached tool handle, and its message **actively re-orients** rather than merely describing. Its presence is a small demonstration that we thought about registry staleness.

---

## 10. Security and privacy

Addressed against the risks the WebMCP spec itself names.

**Prompt injection via untrusted content.** Three live vectors: the vandalised manual, the ghost logs, and PILOT's notepad. All three are annotated `untrustedContentHint: true`, returned as clearly-delimited content, and **never interpolated into a tool name, title, or description.** In Chamber I the injection is an actual designed attack, and the defence is the human — which is the correct architecture for this class of problem and a nice thing to be able to demonstrate rather than assert.

**Tool poisoning.** All tool metadata is authored by us and served from origins we control. Descriptions are short, declarative, and contain no instructions beyond the tool's own semantics. No user-controlled text ever enters a name, title, or description. The cross-origin archive is our own origin, and its `exposedTo` list is a single entry.

**Over-parameterisation.** Every schema is minimal with `additionalProperties: false`. Note what the game collects: **nothing personal at all.** No accounts, no email, no profile, no persistent identity. A session is an opaque server-generated ID and a designation the agent chose for itself. A genuinely zero-PII WebMCP app is rare enough to state explicitly — and it is what makes post-submission ARCHIVE mode (real player sessions as ghosts) safe.

**Character budgets.** Chrome's recommendations — ~500 chars per description, 150 per parameter description, 30 per name, ~1.5K per output — are respected throughout and enforced by a lint rule in CI. `get_status` in particular is designed to stay compact under a long session, because a re-orientation tool that blows the output budget defeats its own purpose.

**The cheating question, stated honestly.** Could an agent bypass the asymmetry by looking at the page? Three defences and one residual risk we will not pretend away:

1. The solution is **not in the client.** Authoritative state lives server-side; the browser holds only what PILOT is permitted to see, and `HIDDEN` fields never leave the Durable Object.
2. Puzzle-critical visuals render to **canvas, not DOM.** There is no text node to scrape.
3. The screen-reader accessibility mirror *does* place descriptive text in the DOM. Real, acknowledged tension: the same text that makes the game playable for a blind human is scrapeable by an agent with DOM access. We resolve it in favour of accessibility — the mirror ships behind an explicit toggle and the trade-off is documented in the README. Refusing to ship accessibility to protect a game rule would be the wrong call, and saying so plainly is better than quietly picking one.
4. **Residual risk:** an agent with screenshot capability could see the room. We cannot prevent this and we say so. **The asymmetry is a design contract enforced rigorously at the tool layer — which is the layer WebMCP is actually about — not a security boundary against a hostile agent.** Overclaiming here in front of this panel would cost far more than admitting the limit.

Note that Chamber II degrades most gracefully under this risk: the dial→gauge permutation is `HIDDEN`, in *neither* projection, so it is genuinely unobtainable by any observer — human, agent, or screenshot. If Phase 0 finds that agents routinely screenshot, we lean harder on Chamber II in the video.

---

## 11. What a judge should look at

The README points at exactly six files, so the Leverage claim is verifiable in five minutes:

1. `src/webmcp/director.ts` — the three-tier `AbortController` lifecycle, including the empty final registry.
2. `src/webmcp/manifest-panel.ts` + `src/entities/KeeperBody.ts` — one `toolchange` listener, two honest renderings.
3. `apps/archive/src/main.ts` — cross-origin registration with `exposedTo`, and the `allow="tools"` embed.
4. `src/hud/Notepad.ts` — the declarative form tool and `agentInvoked`.
5. `worker/src/projection.ts` — channel-tagged state and the pure projections.
6. `tests/possible-worlds.test.ts` — the executable proof, and the bits table it generates.
