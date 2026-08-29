# 06 — Art Direction & Brand

> **Revised 2026-08-29 for the 3D interface (D-042 to D-045).** The governing
> idea, the channel law, KEEPER's anatomy, the motion language and the asset
> discipline are unchanged; they were always about the game rather than about
> pixels, which is why they transferred without argument. What changed is the
> medium: the station is a lit three-dimensional model rather than a 16px tile
> grid, so a colour is a material under a light rather than a fill, and the
> palette is two locked sets rather than one. The pixel-art sections of the v2
> document are superseded and the reasoning is kept where it still holds.

---

## 1. The governing idea: colour *is* the information architecture

The single art decision everything else hangs from, and a design decision before
it is an aesthetic one.

> **Lamplight means only PILOT can perceive this. Tidewater means only KEEPER
> can perceive this. Pearl means both.**

This holds absolutely, everywhere, without exception — room lighting, prop
emission, HUD chrome, both avatars, the logo, the loading screen, the favicon.
It never bends for a nice-looking frame.

The payoff: the entire epistemics of the game become legible without a word of
explanation. A judge watching four seconds of the video sees a warm-lit glyph
panel and a cold-lit grate on opposite walls and *already understands the game*.
A player entering a new chamber immediately knows which parts are theirs to read
and which are their partner's to touch. And when Chamber III splits a single
secret across both channels, the two colours meet at one object for the first
time in the whole game — which lands as a visual event because the rule has been
kept honestly for fourteen minutes.

**In three dimensions a channel is a light, not a fill.** A room whose puzzle is
only PILOT's to read is *lit* warm; a room only KEEPER can act in is lit cold; a
room both parties work in is lit neutral. That is the same law applied to the
building, and it is the first thing on screen in a chamber: the Blind Panel is
visibly a cold blue room before a single gauge has been read.

**The `AUDIBLE` channel gets pearl with a soft double-ring**, because it is the
one thing both parties perceive but differently. It appears rarely and it should
read as a small event when it does.

It also happens to be one of the better colourblind-safe pairings available:
warm gold against cold blue sits on the blue-yellow axis, which is preserved
under both common deficiencies. A happy consequence rather than the reason, and
it does not excuse us from shape redundancy (§9).

---

## 2. Palette — "Low Tide"

Twenty colours in two locked sets. *(Amended 2026-08-29, D-043: was fourteen
flat colours. The lock is unchanged — a twenty-first is a decision-log entry,
not a judgement call, and `palette.test.ts` asserts the count.)*

**Why the set grew.** In a pixel renderer a colour is a fill, so fourteen is a
complete vocabulary. In a lit scene a colour is a material under a light: the
same wall is six values between its shadow and its highlight before anybody
chooses anything, and four steps of grey band visibly across four metres of
stone. Every one of the extra six is a ground or material step. None of them may
carry a fact.

### Channel colours — these carry information

| Role | Hex | Use |
|---|---|---|
| **Lamplight deep** | `#6E4A22` | PILOT-channel shadow, unlit fixture |
| **Lamplight** | `#E8B26A` | **PILOT channel primary.** The light it casts, the halo it wears |
| **Lamplight bright** | `#FFE6C0` | Where emission saturates: the filament, not the glow |
| **Tidewater deep** | `#263A63` | KEEPER-channel shadow, unlit fixture |
| **Tidewater** | `#8AA9E0` | **KEEPER channel primary** |
| **Tidewater bright** | `#D3E1FA` | KEEPER-channel highlight, visor pulse |
| **Pearl** | `#EDE7DC` | Shared information, text, success flash |
| **Pearl dim** | `#8E9299` | Secondary text, inactive UI |

**Why not amber and cyan.** The old pair was a correct choice that read as a
preset: cyan at that saturation is the default colour of every science-fiction
interface ever shipped, and against a mid-saturation amber it produced a frame
with no quiet in it. Tidewater is a cold moonlight blue with a violet lean,
which is *further* from lamplight on the hue circle than cyan was, so the two
channels separate harder in exactly the frames where they meet.

The channel colours are also deliberately soft. Every one of these surfaces is
emissive under a filmic tone curve, so the source blows out toward white and it
is the halo around it that carries the hue. A high-chroma base only makes the
halo orange.

### Ground and material colours — these carry nothing

| Role | Hex | Use |
|---|---|---|
| **Abyss** | `#05070A` | Beyond the building. Clear colour, fog colour, deepest shadow |
| **Ink** | `#0B0F14` | The page, and the sea outside the windows |
| **Slate** | `#141A22` | Stone in shadow |
| **Stone** | `#1F2831` | Stone unlit. The station's base note |
| **Ash** | `#2E3A45` | Stone catching light |
| **Iron** | `#4C5A66` | Structural metal: frames, rails, the grate |
| **Mist** | `#7C8A99` | Distant haze, quietest text |
| **Brass** | `#B8873C` | Mechanism metal: joints, plates, handles |
| **Copper** | `#8C5A3C` | Corroded pipework, door leaves |
| **Rust** | `#5E3B2C` | Wear |
| **Glass** | `#0E1A20` | A dead screen, standing water |
| **Alarm** | `#E05A4F` | Penalties, DEADLOCK, lockout — **sparingly, never for information** |

**The aesthetic idea in one sentence: chroma is scarce.** The ground is
near-neutral and cold on purpose, so the only saturated things in any frame are
facts. Desaturate everything that is not information and the information lights
up on its own without being shouted.

**Brass sits close to lamplight in hue, and that is a managed risk.** Brass is
what a mechanism is made of; lamplight is a channel a fact belongs to; they meet
constantly. They are separated by chroma and by value rather than by hue — brass
is darker and duller, and it is never emissive — so a lit fact reads against a
brass mechanism the way a filament reads against its housing.

**Deliberately absent: green.** Success is a **pearl flash and a shape change**,
never green, because red/green signalling is the most common accessibility
failure in puzzle games and we would rather not have the option available.
`palette.test.ts` asserts that no entry in the set is dominantly green.

---

## 3. Rendering

- **Real-time 3D, Three.js, no post-processing.** *(Amended 2026-08-29, D-042:
  was Phaser at 320×320 with integer scaling.)* The engine is fetched on demand
  when a session begins, exactly as Phaser was: 143KB gzipped in its own chunk,
  and a browser without WebMCP never downloads it at all.
- **The station is a cutaway model.** Every room is open at the top and open on
  its south face, and the camera always stands to the south. This is D-031's
  side-on section arrived at again with a camera: a station you look *into* is a
  station whose rooms are obviously separate places, which is what the fiction
  needs most. It also makes everything else cheap — no wall needs hiding, no
  room needs a special case, the shadows all fall one way, and the wide shot is
  the same scene from further back.
- **Four lights, and no more.** A hemisphere for the shape of things, a cold
  directional for the moon and the shadows, one practical in whichever room the
  pair is standing in, and PILOT's lamp. Everything else that appears to be a
  light is an emissive material with an additive halo behind it.
- **ACES filmic tone mapping.** This is the single largest difference between "a
  lit 3D scene" and "a rendered image": highlights roll off instead of clipping,
  so an emissive lamp reads as bright rather than as a white rectangle.
- **No bloom pass**, deliberately. A real post chain looks marginally better on a
  desktop GPU and costs a full-screen pass at a resolution nobody controls, on a
  target list that includes ChatGPT's in-app browser on a phone. Additive halos
  give the same read for one draw call per lit thing. Bloom is future work, not
  an omission.
- **A long lens.** 32° vertical for a room, which is roughly 65mm on full frame:
  it compresses depth and keeps walls near-parallel. Wide lenses are what make
  3D look like an engine demo.
- **Mechanisms converge, they never play.** A fixture eases toward the state the
  server last reported, every frame, from wherever it is. See §10.

---

## 4. PILOT

**Pearl and iron, with a lamp.** A figure in a heavy coat, shoulders, and one
raised arm holding a hand lamp. Rounded silhouette, deliberately ordinary. The
raised lamp is the read: **this is someone whose whole job is looking.** The
lamp casts a real point light, so moving changes what is lit and walking a room
is worth doing rather than a control scheme nobody finished.

**PILOT is not lamplight-coloured**, and this is load-bearing rather than a
palette choice. Warm means "only PILOT can perceive this", and PILOT is not a
fact only PILOT can perceive: the human is looking at themselves. Painting the
body in the channel colour would make the legend lie the first time somebody
checked it against the screen. The lamp is the one warm thing, and it is a lamp.

---

## 5. KEEPER — the body *is* the tool registry

**This is the project's signature visual idea and doc 08's cut order says it may
never be cut.** Doc 01 says the agent's *hands have been swapped out* when a
chamber is cleared. In three dimensions that stops being a metaphor.

**Tidewater and iron.** A maintenance frame set into an alcove in the wall,
against a lit recess so the body reads as a silhouette. It wears a **visor band
across the eyes** — not a stylish visor, a covered one. The silhouette says
*this thing cannot see*, immediately and without dialogue. It is never a
co-present body: it is behind the station's panels, reaching into every cavity
at once.

### 5.1 Anatomy mapped to the registry

| Registry tier | Body part | Lifetime |
|---|---|---|
| **Persistent tools** | Short rods racked down the torso. They *are* the body. | Never move. Session controller. |
| **Chamber tools** | Long articulated arms on four upper hardpoints: shoulder, upper, elbow, forearm, head. | Unfold and unlatch every chamber. Chamber controller. |
| **`begin_shift`** | The bare frame on the landing screen | Aborts the moment the shift starts. |
| **`open_the_door`** | One final arm, alone, after everything else has fallen | The last thing it ever holds. |

Each chamber tool's arm ends in a head drawn to look like what it does:

| Tool | Head |
|---|---|
| `pull_lever` | A blunt hook |
| `press_key` | A splayed six-finger comb |
| `reset_sequence` | A sweeping paddle |
| `rotate_dial` | A knurled socket |
| `read_ciphertext`, `get_lock_state` | A slim reading stylus |
| `align_bolt` | A ratcheting clamp |
| `speak_passphrase` | A brass horn |
| `open_the_door` | A single long key-arm |

The heads are not meant to be legible as tools from across a room — nothing in
the game requires that. They are meant to be visibly **different from each
other**, so a chamber change reads as the hands being swapped rather than as the
same hand moving.

**On `toolchange`:** an outgoing arm droops, dims, unlatches and **falls to the
floor, where it stays for the rest of the session**. Incoming arms unfold from
folded-against-the-torso and lock. By the Concord Lock the floor around KEEPER
is littered with everything the agent used to be able to do, and nobody has to be
told what the heap is.

**The mapping is authored; the content is the registry.** The table above is
presentation data, like a sprite. What is *not* authored is which tools exist:
that is `getTools()`, read inside the one `toolchange` listener. The mapping is
also **total** — a tool with no entry gets a rod on the spine rather than
vanishing, because a body that under-reports the registry would be the animation
telling the lie the manifest plate exists to catch.

**At the ending**, everything falls. For a beat KEEPER is a torso and a visor in
an empty room. Then one arm locks in. Then that goes too. The last `toolchange`
of the session fires with an empty list and the body is bare — and that is the
goodbye.

### 5.2 The thinking pulse

**KEEPER's visor brightens for the entire duration of an in-flight tool call**,
and breathes slowly when idle. The human sees, in real time, that their partner
is doing something — turning invisible agent latency into legible, atmospheric
anticipation. It is the cheapest possible fix for the "is it frozen or is it
thinking" problem and it makes the agent feel present. It is driven by the
director, not by the registry: it is a call being out, not a tool existing.

---

## 6. Environment

Five spaces, each with a distinct silhouette and lighting signature so the video
never shows two rooms that read alike. **In three dimensions the silhouette is a
real proportion rather than a floor outline**, which is most of what makes them
tell apart: a ceiling height is not a thing a floor plan has.

| Space | Interior (m) | Shape | Light | Signature detail |
|---|---|---|---|---|
| **0 — Airlock** | 12 × 8 × 3.6 | Cramped, low, wide | Pearl practical; three warm lever plates | Water rising ankle-deep on every wasted pull |
| **I — Signal Room** | 13 × 13 × 7.5 | Tall, vertiginous | Warm: the room is PILOT's | A ring of six glyph plates around the back, and a beacon turning at its centre lighting each in turn |
| **II — Blind Panel** | 15 × 7 × 4.2 | Wide, shallow, industrial | Cold: the only hands here are KEEPER's | Four gauge columns of eight countable cells, over a grate with the dials behind it |
| **The Archive** | 8 × 7 × 3.2 | Small, cluttered, close | One dying monitor; everything else dark | A CRT playing the ghost, and a tape spool turning against nothing |
| **III — Concord Lock** | 14 × 12 × 9 | Vast, vertical, cathedral | Pearl, cold from the door, warm at the lamp | Twelve bolts in a ring on a great door, retracting in thirds |

Throughout: fog, drifting dust, wet floors that catch every light in the room.
The station should feel *old and specific*, not generic-sci-fi. References are
lighthouse interiors and mid-century industrial signalling equipment, not
spaceships.

**The ring in the Signal Room is doc 02 §3.2 taken literally**, and it is worth
noting that the tile renderer could not do it: six glyphs in a ring with a
beacon at the centre became two rows of three. A ring has an order you can point
along, which is exactly what PILOT has to describe.

### 6.1 The vandalised page

Chamber I's manual page hangs on the wall. Clean seeds: an even set of rules cut
into a brass plate. Vandalised seeds: a block scratched across the lower third
**at the wrong angle, in alarm-red, over the original** — a different hand, a
different tool, visibly later. It should be obvious *once you look at it*, and
completely invisible to anyone who does not. That is the whole puzzle.

### 6.2 The Archive monitor

A CRT in a dented housing. The tube plays a schematic of the ghost's session,
drawn to a canvas and updated live: the designation, a plan of the room they
were in at its true proportion, the ghost walking, a caption, a scrub bar, and
scanlines over all of it. When the log ends mid-call the monitor holds the last
frame and the spool keeps turning against nothing.

**A schematic rather than a rendered room**, for the reason D-039 gave and which
still holds: a recording of a room is a room at a fraction of its size, and what
a decade-old station monitor would actually show is a plan. The walk between two
beats is **interpolated, never recorded**: PILOT's position is client-local and
no session log has ever carried it.

---

## 7. The CONCORD meter

A segmented gauge in the console's top rail, brass on iron, labelled
**AMBIGUITY** with a numeric readout in bits.

Full = maximum ambiguity, KEEPER cannot know. Empty = KEEPER's information
determines exactly one world.

**Motion:** it does not slide. It **drops in discrete steps** whenever the
consistent-worlds set shrinks — because information arrives in discrete quanta
and the game should feel that. In Chamber II, where each informative rotation
eliminates permutations, watching it ratchet down is watching two minds
converge.

It sits with the clock rather than in a panel of its own, because it is a
headline number. It is scaled against the current room's own high-water mark:
the Airlock opens at log2(3) bits and the Signal Room at nearly eleven, so a
fixed scale would render the Airlock permanently near-empty and teach nothing.

On DEADLOCK it freezes and the failure card reads it back.

---

## 8. The logo and mark

### Primary mark — **The Split Lamp**

A signal lamp seen head-on: a circle bisected vertically, **lamplight on the
left, tidewater on the right, with a pearl seam down the centre.** Two beams
project outward in opposite directions, one warm, one cold, that never overlap.

One light source. Two beams. They never meet. That is the game.

Drawn as **inline SVG** rather than as an image, so it costs no request, scales
to any size, and takes its colours from the same custom properties everything
else does. Below about twenty pixels the beams are dropped and the bisected
circle carries it alone, which is the size a favicon has to work at.

### Wordmark

**SEMAPHORE** in a heavy tracked-out face, all caps, with the split-lamp mark
locked to its left. **Always lock it to the tagline** — *Two processes. One
lock.* — because "Semaphore" alone collides with a well-known CI product in
search.

### Typeface

System stacks, used deliberately, with no web font on the critical path: a
humanist sans for UI, and a monospace for every number and every tool name. The
monospace is not decoration — a tool name is an identifier and a clock is a
figure, and both are read faster in a face where the digits line up.

### Mascot usage

The split lamp is the mark; PILOT and KEEPER are the mascots. They appear
together in the ending, the README header and the Devpost card art — back to
back, separated by a vertical pearl seam, each lit in their own channel colour.
That composition is the logo's geometry rendered as characters.

---

## 9. Accessibility of the visual language

Colour carries information here, so colour alone must never carry it. Every
channel-coded element gets a **shape marker**:

- **Lamplight** elements carry a small solid diamond (◆).
- **Tidewater** elements carry a small filled circle (●).
- **Shared** elements carry a small square (■).

The permanent **CHANNEL LEGEND** in the console shows all pairings at all times,
so the language is taught continuously rather than in a tutorial that gets
skipped.

**Reduced motion is honoured in the scene, not only in the CSS.** Under
`prefers-reduced-motion` the camera stops drifting and the dust stops. Every
*functional* animation is kept, including the `toolchange` sequence, because it
is information rather than atmosphere.

Additional modes still to build: high-contrast, and text mode (doc 07 §5).

---

## 10. Motion language

- **Mechanisms are heavy.** A fixture converges on the server's state at a rate
  that puts a door most of the way open a quarter of a second after the call
  that opened it. Nothing snaps. The station is old and everything in it is
  reluctant.
- **Nothing plays a sequence.** This is the rule, not a preference. A played
  animation is a fixed sequence that has to be cancelled when the state changes
  underneath it, and a door caught halfway by a second update either finishes
  opening a door the server has shut or stalls on a frame nobody chose. A
  converging fixture cannot: it is always walking toward the truth, and the
  worst case is arriving a moment late.
- **A fixture seen for the first time is placed, not animated.** Walking into a
  room with a lever already thrown shows a thrown lever, not one that throws
  itself on arrival.
- **Penalties flash the palette, not the geometry.** Alarm-red on affected props.
  Explicitly *not* chromatic aberration or blur.
- **Success is pearl.** A wash over the room's floor, then the mechanism
  resolves.
- **CONCORD ratchets.** Discrete steps, never a smooth tween.
- **The camera breathes.** A still camera in a still room reads as a paused
  game. It drifts a fraction of a metre over fourteen seconds, and stops
  entirely under reduced motion.
- **The `toolchange` sequence is the set piece.** Arms unlatch, droop and fall
  and stay fallen; new ones unfold and lock; the manifest plate stamps the new
  names in and leaves the surviving ones alone. **This plays on a real
  `toolchange` event reading real `getTools()` output, and it is the shot the
  demo video is built around.** Polish it disproportionately.

---

## 11. Sound design

*(Unchanged by the 3D rework, and unbuilt. Phase 5.2.)*

Music is chiptune-adjacent but wet — square and triangle waves through long
convolution reverb, so it sounds like a chiptune playing *inside a concrete
tower*. Under it, a continuous ambience bed: dripping, distant tide, wind
through the lamp housing, the beacon motor.

**Adaptive tension layers**, crossfaded on the Web Audio graph as the timer
depletes:

| Timer remaining | Layer added |
|---|---|
| 100–50% | Ambience + slow drone |
| 50–25% | + rhythmic pulse |
| 25–10% | + arpeggio |
| < 10% | + heartbeat, ambience ducked |

### The `AUDIBLE` channel is real, not flavour

**Every KEEPER tool call has a distinct, muffled, behind-the-wall sound.** PILOT
cannot see what KEEPER is doing but can always *hear* it.

In Chamber II this carries genuine puzzle information: **PILOT counts the
detents.** Hearing three clicks while seeing no cell light is a real, useful fact
that neither party could obtain alone. Sound is therefore designed to be
*countable*: detents crisp, evenly spaced at ~180ms, never masked by the music
bed, with the tension layers ducked 6dB during any `AUDIBLE` event.

**Every audio cue has a subtitle equivalent** in the console's audible strip,
which is also where the count appears for deaf and hard-of-hearing players. The
strip is on screen already and it carries the same string in every session.

---

## 12. Asset budget

Locked, because art is a bottomless time sink and the only defence is a number
written down in advance. *(Amended 2026-08-29, D-044: the budget was frames of
pixel art; it is now geometry and generated textures, and there are no asset
files at all.)*

| Asset class | Budget | Built |
|---|---|---|
| Generated textures | 4 kinds (grain, glow, labels, monitor) | Yes |
| Fixture geometries | 14 kinds | Yes |
| KEEPER: body + 8 arm heads | ~10 primitives each | Yes |
| PILOT | ~7 primitives | Yes |
| Glyph set | 12 glyphs @ 16×16, authored in source | Yes |
| Station geometry | Slabs plus one instanced wall mesh | Yes |
| Console (DOM) | ~12 components | Yes |
| Logo & marks | One SVG, two sizes | Mark yes, wordmark and favicon no |
| SFX | ~32 one-shots | No — phase 5.2 |
| Music stems | 4 layers × ~60s loop | No — phase 5.2 |

**Placeholder-first pipeline, without exception.** Every chamber ships playable
before it is dressed, and it is dressed against a live session rather than
against a still. That discipline is what protects against R8, and the 3D rework
was done to a game that was already playable end to end — which is the only
reason it was a week of rendering work rather than a rebuild.

**And look at it.** Every renderer this project has had produced defects that
six hundred unit tests could not see and one screenshot could: a wall drawn over
a monitor, a caption wider than its tile, a camera stuck in the wrong shot, four
gauges that were technically present and invisible. `SHOTS=<dir>` on
`tests/cross-origin-delegation.ts` plays a full session and writes a frame at
every beat in about a minute. Run it before calling a rendering change done.
