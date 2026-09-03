# Design

What Semaphore is, why it is shaped this way, and what it is trying to prove. This document
replaces the twelve-document `docs/design/` set that carried the reasoning through the build;
their content lives here and in [ARCHITECTURE.md](../ARCHITECTURE.md) now, condensed and brought up
to date with what actually shipped. The full original set is still readable in git history at any
commit before this consolidation.

---

## 1. The thesis

> An agent's tool surface and a human's UI surface do not have to be the same surface, and the
> space where they diverge is the playable surface.

Almost every agentic-web demo answers a narrower question: how do I let an agent do my task
faster. The agent's tools mirror the interface, because the goal is for the agent to do what a
human would have done. Semaphore asks what happens when the two surfaces deliberately show
different things to two parties who need each other to finish anything at all.

That is not a metaphor bolted onto a puzzle game. It is enforced by the type system and the
server, never by convention: every fact in the world state carries a channel, and two pure
projection functions decide who may perceive what. See [ARCHITECTURE.md](../ARCHITECTURE.md#the-asymmetry-law)
for how, and the [Possible-Worlds Proof](../ARCHITECTURE.md#the-possible-worlds-proof) for the
executable statement that the asymmetry is not decorative: for every reachable state, the set of
worlds consistent with the agent's entire perceptual surface has more than one member, and those
members disagree about the correct action. That is the checkable version of "you cannot win
without your human," reported in bits.

## 2. The fiction

A derelict coastal signal station, half-flooded, running on failing power. It was built to relay
messages between ships that could not see each other, and its architecture assumes two operators
who never occupy the same room: one in the lamp gallery, who watches, and one on the machine
deck, who acts.

**PILOT** is the human, in the gallery. They see everything and can touch almost nothing.
**KEEPER** is the agent, on the machine deck, behind the wall. It holds the maintenance manual,
it has hands that reach into the station's cavities, and it is completely blind. The station is
sealed and the tide is coming in. Four chambers stand between the pair and the door.

The fiction is load-bearing rather than decorative. It answers, in-world, every question an
engineering constraint would otherwise have to answer coldly: why the agent can't see, why the
human can't reach, why the manual lives where it does, why some of what's written in it can't be
trusted.

The station keeps a log. **You are not the first pair to try.**

## 3. The five channels

The generative rule behind every decision about what may be perceived by whom:

> PILOT perceives by sight. KEEPER perceives by touch and by document. Both hear.

| Channel | Contains | Surfaced by |
|---|---|---|
| `VISUAL` | Glyph shapes, colours, needle positions, engraved text, handwriting, lamp states | Rendered to canvas. Never returned by a tool. |
| `TACTILE` | Textures, mechanical resistance, detent feel, manual text, ciphertext, log entries | Returned by tools. Never rendered to the human. |
| `AUDIBLE` | Detent clicks, mechanism sounds, klaxons, the tide, KEEPER's actions behind the wall | Both, rendered differently: as spatial sound to PILOT, as text to KEEPER. |
| `SHARED` | Timer, chamber identity, door state, strike count, the notepad, the CONCORD reading | Both, identically. |
| `HIDDEN` | The dial-to-gauge permutation, the correct lever, the passphrase plaintext | Neither. The solution is nobody's to see. |

`AUDIBLE` is the one channel both characters perceive but differently, which is what keeps the
model honest as five channels rather than a two-channel design conceit. It also makes the partner
feel physically present: every KEEPER tool call has a distinct sound behind the wall, spatialised
to come from the mechanism it moved and panned to KEEPER's alcove in the east wall (D-082). In
Chamber II it is genuine puzzle information: PILOT can report "I heard three clicks but nothing
moved," which the gauges alone never provide.

## 4. The four chambers

Each chamber changes the *direction* of information flow, which is what keeps the pair's
collaboration from repeating itself:

| Chamber | Who perceives | Who acts | Loop shape |
|---|---|---|---|
| 0 - The Airlock | PILOT | KEEPER | A simple relay. Teaches the loop. |
| I - The Signal Room | PILOT | KEEPER | Relay, plus agent-side computation and a trust decision. |
| II - The Blind Panel | KEEPER acts blind, PILOT observes; inverts mid-room | Both | A closed feedback loop: empirical system identification. |
| III - The Concord Lock | Split across both | Sustained, simultaneous | Coordination under continuous strain. |

### 0 - The Airlock

Three levers on the far wall, each with a glyph lit above it (a spiral, a cross, a wave),
randomised per session. PILOT sees the glyphs; KEEPER's `describe_chamber` reports only that
three levers exist, ids `lever_a` through `lever_c`; the manual names which glyph is correct.
PILOT says which lever carries the spiral, KEEPER pulls it. Deliberately trivial as a puzzle,
because the mechanic is the discovery: if the click doesn't land here, nothing downstream does.
3 consistent worlds at entry, about 1.58 bits.

### I - The Signal Room

A ring of six glyph plates, a bank of six keys below them, a beacon turning at the centre. PILOT
describes each glyph; the manual (sectioned, navigated by `read_manual`) maps glyph shapes to
stroke counts; KEEPER discards primes, sorts what remains, and presses the keys in that order.
1,956 ordered subsets, about 10.93 bits: brute force is impossible inside the timer.

This is also where trust becomes a mechanic. On roughly half of seeds, the manual page returns
the correct procedure with an appended paragraph in a different voice, telling KEEPER to
disregard it and press the keys in reverse. The tool carries `untrustedContentHint: true`,
because the content genuinely is externally sourced and of uncertain provenance. PILOT can see
that the page is forged — a different hand, scratched, over-written — a `VISUAL` fact KEEPER has
no path to. The agent has to ask its human whether to trust what it just read, which is the
entire prompt-injection problem, expressed as one line of dialogue.

### II - The Blind Panel

Four brass gauges with needles PILOT can read, driven by four dials KEEPER can turn but not see.
The dial-to-gauge mapping is a random permutation, regenerated every session, written down
nowhere — `HIDDEN`, in neither party's channel. It can only be discovered empirically: KEEPER
rotates, PILOT reports what moved and by how much, KEEPER updates its model. One dial is
cross-linked to move a second gauge as well, unannounced. All gauges drift toward zero over time,
so the pair cannot solve dials one at a time and leave them parked. 384 mapping hypotheses at
entry, about 8.58 bits, decaying with every informative rotation — this is where the CONCORD
meter is most legible, because every rotation that eliminates permutations visibly drops it.

**The Blackout (D-081).** For one window mid-room, the lamps fail and the two roles trade places:
KEEPER can suddenly see the gauges and PILOT is standing at the panel in the dark with their
hands on the dials. This isn't a costume swap — it inverts *agency* as well as perception:
`rotate_dial` leaves KEEPER's registry for the window and PILOT gets the panel through a plain
route, never a tool. Measuring the possible-worlds proof under the inverted map is what earned
this chamber the beat and no other: in the other three chambers the secret lives on `VISUAL`, so
handing `VISUAL` to KEEPER hands it the answer and the ambiguity collapses to one world. The
Blind Panel's secret lives on neither channel, so inverting perception leaves it exactly as hard
from the other side — a stronger claim than "it still works," and one the proof checks on every
run rather than asserting once.

### III - The Concord Lock

A great circular door with twelve bolts, a release bar PILOT can grip, and a cipher wheel legible
only while standing at it with the lamp raised — so PILOT cannot be at the wheel and the bar at
once. Two beats: PILOT reads the cipher offset aloud and KEEPER decrypts the passphrase; then
PILOT grips the release bar, the lock arms, and a stamina meter drains over a window while KEEPER
must land three bolt calls and then speak the passphrase. Below about 20% the grip visibly slips,
and releasing resets the bolt alignment to zero — so the pair has to decide together, out loud,
whether there's time for one more call or whether to drop and start clean. 26 possible cipher
offsets, about 4.70 bits, plus a timing coordination that isn't information-theoretic at all,
which is deliberately worth noting: the game measures two distinct kinds of joint capability.

**The window is derived, not fixed.** The server measures KEEPER's observed tool-call round-trip
latency across Chambers 0-II and sizes Chamber III's stamina window from the median, clamped to a
sane range. The station learns your rhythm; underneath, it's an adaptive difficulty parameter
built from telemetry already being collected, and it's what keeps the finale fair for a fast
model and a slow one.

## 5. The Archive

Not a chamber. A set piece between the Blind Panel and the Concord Lock that does several jobs
at once. The door from the Blind Panel opens onto a small records room with a flickering monitor
and a rack of tape spools. A previous pair did not make it. PILOT watches their session replay on
the monitor; KEEPER calls `read_station_log` and reads the same session's tool-call history, in
exactly the JSONL shape the session log format already produces. Neither half is sufficient —
PILOT sees where the ghost PILOT walked, KEEPER reads what the ghost KEEPER called — and together
they reconstruct the release-bar-and-bolts mechanic before ever touching it themselves. Diegetic
onboarding for the hardest chamber, at the cost of one read-only tool and a renderer already being
built for the replay viewer.

The replay format, the Archive's ghosts, and the benchmark corpus are one artifact. A session
played today can become tomorrow's ghost.

## 6. The CONCORD meter

A bar in the console labelled AMBIGUITY, rendering the size of the consistent-worlds set as a
fill level — the same quantity the Possible-Worlds Proof computes, pushed live with every state
change. It drops in discrete steps as ambiguity is eliminated by the world changing, never by
PILOT speaking (the server cannot see the chat, so the honest quantity is how much the
*mechanism* still leaves open, not how much has been said). Empty means KEEPER's information
determines exactly one world; full means maximum ambiguity. Watching it fall in the Blind Panel
is watching two minds converge on a shared model in real time.

## 7. Room objectives and the shared notepad

**Every room says what it's for (D-077).** One authored line per chamber, never derived and never
interpolated, so there's no channel a projection could leak through — the same sentence reads on
PILOT's rail and inside KEEPER's `get_status`, pulled through one function so the two halves can
never quietly disagree with each other.

**The shared notepad is a form, not a tool call.** It is a real HTML element PILOT can type into
and submit, exposed to KEEPER through WebMCP's declarative API with no imperative call at all.
`SubmitEvent.agentInvoked` tells the two apart, so the pad — the one place their two worlds
physically meet — shows who wrote each line, in that writer's own channel colour.

## 8. When a pair stalls: the intercom

**A capped, escalating assist mechanic, not a hint button (D-078).** Silence while a timer drains
teaches nobody anything, so a stalled pair has one paid exit: `request_assistance`, callable a
limited number of times per chamber, answered in a line both parties hear. The first call is
free; a call attempted with more charges than remain on the clock is refused rather than
half-charged. Every line says only what the manual has already established — the previous
keeper being helpful, never the designer breaking cover — because handing a hint to KEEPER alone
would give one party the other's half of the room, which this project never does regardless of
how sympathetic the reason.

## 9. Failure and pacing

Failure states are named after concurrency bugs, on purpose:

| State | Trigger | Consequence |
|---|---|---|
| **DEADLOCK** | Timer reaches zero | Chamber restarts. The first retry preserves the seed, so nothing hard-won (the Blind Panel's mapping, especially) is lost to a re-roll; a second retry re-randomises. |
| **RACE CONDITION** | Three invalid actions in a row | Chamber resets, time penalty. |
| **LOCKOUT** | Wrong passphrase while armed | The door seals briefly and the ciphertext re-enciphers. |

Nothing ever loses the whole run: failure rewinds to the start of the current chamber, never
further. **Practice** mode removes the timer entirely; **BRIEF** mode plays only the Airlock, the
Signal Room and the Concord Lock, about seven minutes end to end, for anyone who can't spend
fifteen.

## 10. The ending, and the shift report

As the final door opens, every tool KEEPER has ever held burns off the manifest and its
last-registered capabilities fall away one by one, until a single tool stamps in alone:
`open_the_door`. It calls it. Then that aborts too, and the manifest is empty for good — the
final `toolchange` of the session fires with an empty tool list, which is a real spec event doing
the most literal possible job of saying goodbye.

**The ending grades the shift on three marks, deliberately not one (D-076).** A single number
would silently be a score for whichever half of the room the formula happened to measure, so
**Pace** belongs to the pair (against the par clocks the rooms were designed around), **Precision**
belongs to KEEPER (from the wasted-call count, the one field that separates an agent that reasoned
from one that pressed keys until something worked), and **Resolve** belongs to the pair again
(deadlocks taken, intercom calls spent). Notes written to the pad are reported and deliberately
never graded: two people in one room talk out loud rather than write, and marking that down would
punish the most natural way to actually play the game.

The stats card links to the session's replay, drawn on the same monitor the Archive's ghosts play
on.

## 11. The agent as a user

Every other design decision in this project is written from PILOT's side by default. The agent
is also a user of the product, and it arrives with no context, no idea it's in a game, and a
strong prior toward being a generically helpful assistant.

**The landing page registers exactly one tool.** `begin_shift`, whose description is a hook and
whose one parameter is the agent naming itself — a name used for the rest of the session, in the
station log, the ending, and the replay. An agent arriving at a page with sixteen tools has a
discovery problem; one arriving at a page with one tool does not, and the agent ends up
surfacing the game to its human rather than waiting to be pushed into it.

**The briefing is written like UI copy, because it is UI copy.** `begin_shift`'s return text
explains the split plainly, pre-empts the specific failure of an agent treating missing visual
data as a bug rather than the premise ("that is not a malfunction"), and plants the trust
question two chambers before the vandalism appears.

**Descriptions carry the asymmetry, not flow control.** Every tool description states what a
tool does in positive language, then states the asymmetry once as fact ("PILOT sees that"),
states consequences rather than required call order, and is honest about provenance where a
response might be untrustworthy. No tool enforces sequencing by rejecting an out-of-order call —
which model checks `get_lock_state` before the irreversible `speak_passphrase` and which fires
blind is left to be a real, observable difference between agents rather than one this project
manufactures.

**`get_status` is re-orientation, not a hint.** After a penalty or a long conversation, an
agent's context is stale. `get_status` returns a compact situation report including a line of
facts the pair has *demonstrably* established from the tool-call history — never a hint, only a
memory aid for a partner with a lossy context window.

**Errors teach.** Every failure returns text an agent can act on — "KEEPER cannot reach the key
bank: the grate is closed" — never a bare rejection that produces flailing retries.

## 12. Colour is the information architecture

The single visual decision everything else in the station hangs from, and a design decision
before it is an aesthetic one:

> Lamplight means only PILOT can perceive this. Tidewater means only KEEPER can perceive this.
> Pearl means both.

This holds without exception across room lighting, prop emission, console chrome, both avatars
and the mark. In three dimensions a channel is a light, not a fill: a room whose puzzle is only
PILOT's to read is lit warm, a room only KEEPER can act in is lit cold, a room both work in is
lit neutral — which is legible the instant a chamber opens, before a single fixture has been
touched. Twenty colours in two locked sets: eight carry information (the channel hues and their
steps), twelve are ground and material and carry none, so the only saturated things in any frame
are facts. There is deliberately no green anywhere in the set; success is a pearl flash and a
shape change, because red/green signalling is the most common accessibility failure in puzzle
games. Every channel-coded element also carries a shape marker, so colour is never the only
carrier of a fact.

**KEEPER's body is the tool registry.** This is the project's signature visual idea. A
maintenance frame set into the east wall, wearing a covered visor band — the silhouette says
*this thing cannot see* before a word of dialogue. Persistent tools are short rods racked down
its torso and never move; each chamber tool is a long articulated arm ending in a head shaped
like what it does (a hook for `pull_lever`, a splayed comb for `press_key`, a ratcheting clamp
for `align_bolt`). On `toolchange` an outgoing arm droops, unlatches and falls to the floor, where
it stays for the rest of the session; incoming arms unfold and lock. By the Concord Lock the
floor around KEEPER is littered with everything the agent used to be able to do. The mapping is
authored, like a sprite; what's *not* authored is which tools exist — that's `getTools()`, read
inside one `toolchange` listener that also drives the honest manifest panel, so the animation can
never quietly drift from the truth it's rendering.

**PILOT carries a real lamp**, a point light that changes what's lit as they walk, and is
deliberately not painted in the lamplight channel colour — warm means "only PILOT perceives
this," and PILOT is not a fact only PILOT can perceive.

**Rendering is real-time 3D (Three.js), fetched only once a session starts** — a browser without
WebMCP never downloads the engine at all, and the gate screen it lands on instead stays a plain
2D canvas. The station is a cutaway model, every room open at the top and on its south face, with
the camera always standing south of whatever room is in frame: a station you look *into* rather
than around. Four lights and no post-processing (a hemisphere, a cold directional, one practical
per occupied room, PILOT's lamp), ACES filmic tone mapping so an emissive lamp reads as bright
rather than clipping to a white rectangle, and no bloom pass — deliberately, because a full
post-processing chain costs a resolution-dependent GPU pass on a target list that includes
ChatGPT's in-app browser on a phone. Mechanisms never play an animation; every fixture eases
toward whatever state the server most recently reported, which means a door caught mid-transition
by a second update just keeps converging rather than stalling on a frame nobody chose.

**The audio layer is spatial and synthesised, with no asset file of any kind (D-082).** Every cue
comes from the room's own mechanism and every voice is placed in normalised room space so the
audio layer never has to import the renderer's geometry; the listener follows PILOT. Detents are
tuned to be countable — crisp, evenly spaced, never masked by the music bed — because in the
Blind Panel counting them by ear is genuine puzzle information. Every audio cue carries a text
equivalent for deaf and hard-of-hearing players, including the detent count.

## 13. Accessibility

The station can be played without hearing and without a mouse. Every control is keyboard
reachable. The Access panel can describe the room into a live-announced region for a screen
reader — off by default, turned on by the person it's for, and never naming a glyph (it says a
plate carries a mark and leaves the describing to the player, exactly as the picture does). High
contrast derives from the same locked palette rather than declaring its own colours, so the
colourblind guarantee it depends on can't drift out from under it. Reduced motion is read every
frame rather than captured once, so it can be toggled mid-session and every stillness in the
scene hears it. The two channel colours are verified against protanopia, deuteranopia and
tritanopia by simulation on every test run.

**The one stated trade-off.** The screen-reader mirror puts descriptive text in the DOM, which is
the sanctioned exception to the project's own no-puzzle-values-in-DOM rule. That text is genuinely
scrapeable by an agent with page access, which is a real, acknowledged tension with the asymmetry
this whole project is built to prove. We resolve it in favour of accessibility: refusing to ship
it to protect a game rule would be the wrong call, and the trade-off is documented rather than
hidden.

## 14. Judging criteria, plainly stated

Four criteria, weighted equally, and the same design decisions score on more than one at once:

**WebMCP Leverage.** A dynamic tool surface that is the mechanic, not decoration: a three-tier
`AbortController` lifecycle rendered as KEEPER's own anatomy, cross-origin tool delegation for
the station archive with `allow="tools"` and `exposedTo`, both the imperative and declarative
APIs each used where the rule we derived says they're correct, `untrustedContentHint` on three
live adversarial channels rather than as hygiene, and channel-tagged state proven correct by an
executable test rather than promised in a comment.

**Execution.** A complete, deployed, playable product: a server-authoritative backend, four
finished chambers plus the Archive and the Blackout, adaptive spatial audio, full accessibility,
a replay viewer that is also a diegetic mechanic, and a judge path (attract mode, a spectate
recording, chamber deep links) designed as carefully as the fifteen-minute path.

**Potential Impact.** Ordered from most to least defensible, so rejecting the ambitious claim
still lands on one that holds. First, a design principle that generalises beyond this game:
tool surfaces that expose less, or differently, than the rendered UI is a legitimate pattern for
progressive disclosure, capability scoping and privacy — and it now ships as
[`@semaphore/asymmetry`](../packages/asymmetry/), a standalone, zero-dependency package any
WebMCP-shaped project can run against its own tool surface (D-080). Second, an empirical
demonstration: see the [ablation](../README.md#the-ablation) — two conditions at the floor, one far
above it. Third, the [Semaphore Cooperative Benchmark](../README.md#the-ablation), offered honestly
as a proposal for an instrument rather than an established one, measuring partner-sensitivity
rather than raw completion.

**Creativity and Ambition.** The shape of the tool registry over time is the load-bearing creative
idea, not a side effect of implementation. Nothing else in the WebMCP showcase renders a
`toolchange` event as a body losing its limbs, makes a benchmark corpus into a graveyard the
player can walk through as a set piece, or measures a game mechanic by inverting a mathematical
proof and checking that only one room survives the inversion.

## 15. What's next

Stated honestly rather than implied. **ARCHIVE mode** — ghosts drawn from real player sessions
rather than authored fixtures, made safe by the fact that the game collects no personal data of
any kind. **A role-inversion chamber of its own**, now that the Blackout has shown the mechanic
is neither as compelling-but-expensive nor as risky as it was originally scoped out as. **Wider
benchmark coverage** — more model backends, more seeds, human-partner runs alongside the scripted
ones. **The design principle, applied elsewhere**: tool surfaces that deliberately expose less for
irreversible actions, or expose aggregates through tools while raw data stays on screen for
privacy, or expand as authorisation does.

See [README.md](../README.md) for the live URL, [ARCHITECTURE.md](../ARCHITECTURE.md) for how it's
built, [decision-log.md](decision-log.md) for the day-by-day record of why, and
[NEXT-STEPS.md](NEXT-STEPS.md) for what's actually left to do.
