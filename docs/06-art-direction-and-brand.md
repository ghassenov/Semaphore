# 06 — Art Direction & Brand

---

## 1. The governing idea: colour *is* the information architecture

The single art decision everything else hangs from, and a design decision before it is an aesthetic one.

> **Amber means only PILOT can perceive this. Cyan means only KEEPER can perceive this. Bone-white means both.**

This holds absolutely, everywhere, without exception — room lighting, prop highlights, HUD chrome, both avatars, the logo, the loading screen, the favicon. It never bends for a nice-looking frame.

The payoff: the entire epistemics of the game become legible without a word of explanation. A judge watching four seconds of the video sees an amber-lit glyph panel and a cyan-lit grate on opposite walls and *already understands the game*. A player entering a new chamber immediately knows which parts are theirs to read and which are their partner's to touch. And when Chamber III splits a single secret across both channels, amber and cyan meet at one object for the first time in the whole game — which lands as a visual event because the rule has been kept honestly for fourteen minutes.

**The `AUDIBLE` channel gets bone-white with a soft double-ring**, because it is the one thing both parties perceive but differently. It appears rarely and it should read as a small event when it does.

It also happens to be one of the better colourblind-safe pairings available: amber/cyan sits on the blue-yellow axis, preserved under common red-green deficiencies. A happy accident rather than the reason, and it does not excuse us from shape redundancy (§9).

---

## 2. Palette

Fourteen colours, locked before any sprite work. The lock is scope control as much as aesthetics — an unlocked palette is an invitation to keep fiddling.

| Role | Hex | Use |
|---|---|---|
| **Void** | `#0D0F14` | Deepest shadow, letterbox, negative space |
| **Hull** | `#1A1F2B` | Wall base, station structure |
| **Hull light** | `#2E3646` | Wall highlight, floor, mid-tone masonry |
| **Rust** | `#4A3B32` | Corrosion, pipework, wear |
| **Amber deep** | `#8C5A1B` | PILOT-channel shadow |
| **Amber** | `#F0A830` | **PILOT channel primary** |
| **Amber bright** | `#FFD98E` | PILOT-channel highlight, lamp glow |
| **Cyan deep** | `#14606E` | KEEPER-channel shadow |
| **Cyan** | `#3BC9DB` | **KEEPER channel primary** |
| **Cyan bright** | `#A5F3FC` | KEEPER-channel highlight, visor pulse |
| **Bone** | `#F2EFE6` | Shared information, text, success flash |
| **Bone dim** | `#A8A296` | Secondary text, inactive UI |
| **Alarm** | `#E5484D` | Penalties, DEADLOCK, lockout — **sparingly, never for information** |
| **Brass** | `#C9A227` | Mechanism accents, the manifest plate, KEEPER's limb joints |

Deliberately absent: green. Success is a **bone-white flash and a shape change**, never green, because red/green signalling is the most common accessibility failure in puzzle games and we would rather not have the option available.

---

## 3. Resolution and rendering

- **Native canvas: 320 × 180.** Chunky enough to feel hand-placed, roomy enough for six glyphs and readable text.
- **Integer scaling only.** ×4 → 1280×720, ×6 → 1920×1080. `pixelArt: true`, `roundPixels: true`, `Phaser.Scale.FIT` with an integer-snap step. Non-integer scaling produces shimmering half-pixel artefacts that instantly read as "someone didn't care."
- **Tile grid: 16 × 16.** Avatars **16 × 24** — a proportion that reads as a person rather than a mascot.
- **Game motion on a 12 fps animation grid**; UI and camera at 60 fps. The mismatch is intentional: sprites feel hand-drawn, interface feels responsive.

---

## 4. PILOT

**Amber, 16×24.** A figure in a heavy longcoat, hood down, carrying a hand lamp on a raised arm. Rounded silhouette, slightly hunched, deliberately ordinary. The raised lamp is the read: **this is someone whose whole job is looking.** In dark chambers the lamp casts a genuine radial light mask, so PILOT physically illuminates what they inspect — moving the avatar changes what is visible, which makes movement meaningful rather than decorative.

**Animations:** idle (4f, coat sway, lamp flicker) · walk (6f) · inspect (4f, lamp raised toward object) · **grip** (2f, strained, for the Chamber III release bar) · slipping (2f, when stamina drops below 20%) · exhausted (idle variant when timer < 15%).

---

## 5. KEEPER — the body *is* the tool registry

**This is the project's signature visual idea and it replaces v1's text-list-only treatment.**

Doc 01 says the agent's *hands have been swapped out*. v1 rendered that as names charring off a brass plate. The plate is a good verification artifact and a mediocre image. So we render the metaphor literally.

**Cyan, 16×24.** Taller, thinner, angular, seen mostly as a shadow behind a grate or a hand emerging from a cavity. It wears a **wide visor band across the eyes** — not a stylish visor, a covered one. The silhouette says *this thing cannot see*, immediately and without dialogue.

### 5.1 Anatomy mapped to the registry

| Registry tier | Body part | Lifetime |
|---|---|---|
| **Persistent tools** | Torso, head, visor, the reading arm that holds the manual | Never change. Session controller. |
| **Chamber tools** | Attachment limbs and sensor heads at four hardpoints | Detach and regrow every chamber. Chamber controller. |
| **`begin_shift`** | The bare, limbless form on the landing screen | Aborts the moment the shift starts. |
| **`open_the_door`** | One final arm, alone, after everything else has fallen | The last thing it ever holds. |

Each chamber tool maps to a specific attachment, drawn to look like what it does:

| Tool | Attachment |
|---|---|
| `pull_lever` | A blunt hook |
| `press_key` | A splayed six-finger comb |
| `rotate_dial` | A knurled socket wrist |
| `align_bolt` | A ratcheting clamp |
| `read_ciphertext` | A slim reading stylus |
| `speak_passphrase` | A brass horn at the shoulder |
| `open_the_door` | A single long key-arm |

**On `toolchange`:** the outgoing attachments unlatch, fall, and clatter to the floor (they stay there, accumulating across the game as debris — a small, cheap, cumulative detail); the incoming ones unfold from the torso and lock with a brass thunk and a puff of dust. Same event, same listener, same `getTools()` output as the manifest panel. One is the proof, the other is the feeling.

**At the ending**, everything falls. For a beat KEEPER is a torso and a visor in an empty room. Then one arm stamps in. Then that goes too. The last `toolchange` of the session fires with an empty list and the body is bare — and that is the goodbye.

### 5.2 The thinking pulse

**KEEPER's visor pulses cyan-bright for the entire duration of an in-flight tool call.** The human sees, in real time, that their partner is doing something — turning invisible agent latency into legible, atmospheric anticipation. It is the cheapest possible fix for the "is it frozen or is it thinking" problem and it makes the agent feel present.

**Animations:** idle (4f, slow sway, visor dim pulse) · reach (6f, arm extending into a cavity) · **thinking** (2f, visor bright) · **attach / detach** (8f each, the `toolchange` sequence) · bare (2f, the ending).

### 5.3 Adjacency

The two avatars are adjacent exactly **five** times: the four chamber-doorway transitions and the ending. Everywhere else KEEPER is behind a wall, a grate, or a cavity — never co-present. Scarcity is what makes the ending land, and it keeps the fiction honest about why KEEPER cannot see.

---

## 6. Environment

Five spaces, each with a distinct silhouette and lighting signature so the video never shows two rooms that read alike:

| Space | Shape | Light | Signature detail |
|---|---|---|---|
| **0 — Airlock** | Cramped, low, wide | Single amber bulb, hard shadows | Water rising ankle-deep on failure |
| **I — Signal Room** | Tall, circular, vertiginous | Rotating beacon sweeping amber round the ring | The beacon lighting each glyph in turn — and, on vandalised seeds, catching the scratched-over page |
| **II — Blind Panel** | Wide, shallow, industrial | Flat amber over gauges, cyan seeping through the grate | Needle physics: gauges overshoot and settle |
| **The Archive** | Small, cluttered, close | One dying monitor, cyan flicker; everything else dark | Tape spools, and *THEY DIDN'T MAKE IT EITHER* scratched on the wall |
| **III — Concord Lock** | Vast, vertical, cathedral | Cold cyan from the door, warm amber pooled at the lamp | Twelve bolts, retracting in sequence |

Throughout: dripping water, drifting dust, a slow parallax of tide beyond narrow windows. The station should feel *old and specific*, not generic-sci-fi. References are lighthouse interiors and mid-century industrial signalling equipment, not spaceships.

### 6.1 The vandalised page

Chamber I's manual page is rendered on the wall. Clean seeds: neat brass-plate lettering, bone-white. Vandalised seeds: the lower third **scratched into the metal in alarm-red, at a wrong angle, over-writing the original** — different hand, different tool, visibly later. It should be obvious *once you look at it*, and completely invisible to anyone who doesn't. That is the whole puzzle.

### 6.2 The Archive monitor

A CRT in a dented housing, running the two-track replay renderer at 1:4 scale with heavy scanlines and cyan phosphor bloom. It is the same component as `/replay/:id`, dressed. When the ghost log ends mid-call, the monitor holds the last frame and the tape spool keeps turning against nothing.

---

## 7. The CONCORD meter

A horizontal bar in the HUD, amber fill on a brass housing, labelled **CONCORD** with a small numeric readout in bits.

Full = maximum ambiguity, KEEPER cannot know. Empty = KEEPER's information determines exactly one world.

**Motion:** it does not slide smoothly. It **drops in discrete steps** with a mechanical ratchet sound whenever the consistent-worlds set shrinks — because information arrives in discrete quanta and the game should feel that. In Chamber II, where each informative rotation eliminates permutations, watching it ratchet down is watching two minds converge, and it is the single most satisfying HUD element in the game.

On DEADLOCK it freezes at its final value and the failure card reads it back: *"Time ran out with 4 worlds still consistent. KEEPER needed 2 more bits from you."*

---

## 8. The logo and mark

### Primary mark — **The Split Lamp**

A 32×32 pixel signal-tower lamp seen head-on: a circle bisected vertically, **amber on the left, cyan on the right, with a single-pixel bone-white seam down the centre.** Two beams project outward in opposite directions, one amber, one cyan, that never overlap.

One light source. Two beams. They never meet. That is the game.

At 16×16 the beams drop away and the mark reduces to the bisected circle, which stays perfectly readable as a favicon — worth testing early, because a mark that dies at favicon size is a mark nobody remembers.

### Wordmark

**SEMAPHORE** in a chunky pixel face, all caps, tight tracking, with **the `O` replaced by the split-lamp mark.** The one non-flat letterform in an otherwise flat word does the memorability work. **Always lock it to the tagline** — *Two processes. One lock.* — because "Semaphore" alone collides with a well-known CI product in search.

### Typeface

**Departure Mono** for UI and body text (free, open-licence, well-drawn, monospace pixel — the monospace quality suits a maintenance manual). **m6x11** or **Pixel Operator Bold** for headings and the wordmark. Both free, widely used, no licensing negotiation — which matters for an open-source submission.

### Mascot usage

The split lamp is the mark; PILOT and KEEPER are the mascots. They appear together in the ending, the README header, and the Devpost card art — back to back, separated by a vertical bone-white seam, each lit in their own channel colour. That composition is the logo's geometry rendered as characters, which is a nice piece of brand recursion and costs nothing extra.

---

## 9. Accessibility of the visual language

Colour carries information here, so colour alone must never carry it. Every channel-coded element gets a **shape marker**:

- **Amber** elements carry a small solid square (▪).
- **Cyan** elements carry a small hollow circle (◦).
- **`AUDIBLE`** elements carry a double ring (◎).
- **Shared** elements carry no marker.

The permanent **CHANNEL LEGEND** in the HUD corner shows all pairings at all times, so the language is taught continuously rather than in a tutorial that gets skipped.

Additional modes: **high-contrast** (raises value separation, thickens outlines), **reduced motion** (kills parallax, dust, screen shake, beacon sweep; keeps all functional animation including the `toolchange` sequence, at reduced amplitude), and **text mode** (doc 07 §5). Every one is a settings toggle from the pause menu, not a URL parameter.

---

## 10. Motion language

- **Mechanisms are heavy.** Levers, bolts, and dials get many frames and a settle-overshoot. Nothing snaps instantly. The station is old and everything in it is reluctant.
- **Penalties flash the palette, not the geometry.** Alarm-red palette-swap on affected props plus a two-frame screen shake. Explicitly *not* chromatic aberration or blur — post-processing on pixel art is the most common way to make it look cheap.
- **Success is bone-white.** A single-frame full-screen bone flash, then the mechanism resolves.
- **CONCORD ratchets.** Discrete steps, never a smooth tween.
- **The `toolchange` sequence is the set piece.** Manifest names char from the left edge and flake downward over ~500ms; new names stamp in with a one-frame overshoot, a brass ping, and a dust puff. Simultaneously, KEEPER's attachments unlatch and fall (they stay on the floor) and new ones unfold and lock. **This plays on a real `toolchange` event reading real `getTools()` output, and it is the shot the demo video is built around.** Polish it disproportionately.

---

## 11. Sound design

Music is chiptune-adjacent but wet — square and triangle waves through long convolution reverb, so it sounds like a chiptune playing *inside a concrete tower*. Under it, a continuous ambience bed: dripping, distant tide, wind through the lamp housing, the beacon motor.

**Adaptive tension layers**, crossfaded on the Web Audio graph as the timer depletes:

| Timer remaining | Layer added |
|---|---|
| 100–50% | Ambience + slow drone |
| 50–25% | + rhythmic pulse |
| 25–10% | + arpeggio |
| < 10% | + heartbeat, ambience ducked |

### The `AUDIBLE` channel is real, not flavour

**Every KEEPER tool call has a distinct, muffled, behind-the-wall sound** — a dial's detent click, a lever's clunk, an arm reaching into a cavity. PILOT cannot see what KEEPER is doing but can always *hear* it.

In Chamber II this carries genuine puzzle information: **PILOT counts the detents.** Hearing three clicks while seeing no needle move is a real, useful fact that neither party could obtain alone. It is also the mechanism that reassures PILOT a call landed when nothing visible changes — solving a real UX problem with a diegetic solution.

Sound is therefore designed to be *countable*: detents are crisp, evenly spaced at ~180ms, and never masked by the music bed. The mix ducks the tension layers by 6dB during any `AUDIBLE` event.

**Every audio cue has a subtitle equivalent** in the action log for deaf and hard-of-hearing players — which is the same log the replay viewer consumes, so accessibility and instrumentation share one implementation.

---

## 12. Asset budget

Locked, because pixel art is a bottomless time sink and the only defence is a number written down in advance.

| Asset class | Budget |
|---|---|
| PILOT sprite sheet | ~24 frames |
| KEEPER torso + visor | ~14 frames |
| **KEEPER attachments** | 7 attachments × ~10 frames (idle, attach, detach, act) |
| Environment tilesets | 5 spaces × ~48 tiles |
| Props (levers, keys, gauges, dials, wheel, bar, bolts, door, monitor) | ~28 objects, ~6 frames average |
| Glyph set | 12 glyphs @ 16×16 |
| Manual pages | 2 states × 4 sections |
| UI / HUD | ~34 elements |
| Logo & marks | 3 sizes |
| SFX | ~32 one-shots |
| Music stems | 4 layers × ~60s loop |

**Placeholder-first pipeline, without exception.** Every chamber ships greybox — flat rectangles in palette colours — and must be fully *playable and playtested* before a single final sprite is drawn. Art is applied to a working game, never the reverse. This is the discipline that protects against R8, and it is also just how you avoid lavishing forty hours on a chamber that turns out not to be fun.
