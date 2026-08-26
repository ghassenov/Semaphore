# 05 — Art Direction & Brand

---

## 1. The governing idea: colour *is* the information architecture

This is the single art decision everything else hangs from, and it is a design decision before it is an aesthetic one.

> **Amber means only PILOT can perceive this. Cyan means only KEEPER can perceive this. Bone-white means both.**

This holds absolutely, everywhere, without exception — room lighting, prop highlights, HUD chrome, the two avatars, the logo, the loading screen, the favicon. It never bends for a nice-looking frame.

The payoff is that the entire epistemics of the game become legible without a word of explanation. A judge watching four seconds of the demo video sees an amber-lit glyph panel and a cyan-lit grate on opposite walls and *already understands the game*. A player glancing at a new chamber immediately knows which parts are theirs to read and which are their partner's to touch. And when Chamber III splits a single secret across both channels, the screen shows amber and cyan meeting at one object for the first time in the whole game — which lands as a visual event because the rule has been kept honestly for fourteen minutes beforehand.

It also happens to be one of the better colourblind-safe pairings available: amber/cyan sits on the blue-yellow axis, which is preserved under the common red-green deficiencies. That is a happy accident rather than the reason for the choice, and it does not excuse us from shape redundancy (§7).

---

## 2. Palette

Fourteen colours, locked before any sprite work begins. The lock is a scope-control measure as much as an aesthetic one — an unlocked palette is an invitation to keep fiddling.

| Role | Hex | Use |
|---|---|---|
| **Void** | `#0D0F14` | Deepest shadow, letterbox, negative space |
| **Hull** | `#1A1F2B` | Wall base, station structure |
| **Hull light** | `#2E3646` | Wall highlight, floor, mid-tone masonry |
| **Rust** | `#4A3B32` | Corrosion, pipework, wear |
| — | — | — |
| **Amber deep** | `#8C5A1B` | PILOT-channel shadow |
| **Amber** | `#F0A830` | **PILOT channel primary** |
| **Amber bright** | `#FFD98E` | PILOT-channel highlight, lamp glow |
| — | — | — |
| **Cyan deep** | `#14606E` | KEEPER-channel shadow |
| **Cyan** | `#3BC9DB` | **KEEPER channel primary** |
| **Cyan bright** | `#A5F3FC` | KEEPER-channel highlight, visor pulse |
| — | — | — |
| **Bone** | `#F2EFE6` | Shared information, text, success flash |
| **Bone dim** | `#A8A296` | Secondary text, inactive UI |
| — | — | — |
| **Alarm** | `#E5484D` | Penalties, DEADLOCK, lockout — **used sparingly and never for information** |
| **Brass** | `#C9A227` | Mechanism accents, the manifest plate |

Deliberately absent: green. Success is signalled with a **bone-white flash and a shape change**, never with green, because red/green signalling is the most common accessibility failure in puzzle games and we would rather not have the option available to us.

---

## 3. Resolution and rendering

- **Native canvas: 320 × 180.** Chunky enough to feel authentically hand-placed, roomy enough for a chamber with six glyphs and readable text.
- **Integer scaling only.** ×4 → 1280×720, ×6 → 1920×1080. Phaser config: `pixelArt: true`, `roundPixels: true`, `Phaser.Scale.FIT` with an integer-snap step. Non-integer scaling produces the shimmering half-pixel artefacts that instantly read as "someone didn't care."
- **Tile grid: 16 × 16.** Avatars **16 × 24** — a proportion that reads as a person rather than a mascot.
- **All game motion on a 12 fps animation grid**, with UI and camera at 60 fps. The mismatch is intentional: sprites feel hand-drawn, interface feels responsive.

---

## 4. The two avatars

Character design here does real mechanical work. A player should understand each character's *epistemic situation* from silhouette alone, before any animation plays.

### PILOT — amber, 16×24

A figure in a heavy longcoat, hood down, carrying a hand lamp on a raised arm. Rounded silhouette, slightly hunched, deliberately ordinary. The raised lamp is the read: **this is someone whose whole job is looking.** In dark chambers the lamp casts a genuine radial light mask, so PILOT physically illuminates what they inspect — moving the avatar changes what is visible, which makes movement meaningful rather than decorative.

**Animations:** idle (4f, coat sway, lamp flicker) · walk (6f) · inspect (4f, lamp raised toward object) · hold-bar (2f, strained) · exhausted (idle variant when timer < 15%).

### KEEPER — cyan, 16×24

Taller, thinner, angular. Wears a **wide visor band across the eyes** — not a stylish visor, a covered one. The silhouette says *this thing cannot see*, immediately and without a line of dialogue. Its arms are long and multi-jointed, reaching further than a person's should, because its job is putting hands into walls PILOT cannot open.

**Animations:** idle (4f, slow sway, visor dim pulse) · walk (6f, slightly gliding) · reach (6f, arm extending into a wall cavity) · **thinking (2f, visor pulsing cyan-bright)**.

The thinking animation is the one that earns its keep. **KEEPER's visor pulses for the entire duration of an in-flight tool call.** The human sees, in real time, that their partner is doing something — which turns invisible agent latency into legible, atmospheric anticipation. It is the cheapest possible fix for the "is it frozen or is it thinking" problem, and it makes the agent feel present in the room.

The two avatars are adjacent exactly four times in the game: the four doorway transitions and the ending. Every other frame keeps them apart. Scarcity is what makes the ending land.

---

## 5. Environment

Four chambers, each with a distinct silhouette and lighting signature so the demo video never shows two rooms that read alike:

| Chamber | Space | Light | Signature detail |
|---|---|---|---|
| **0 — Airlock** | Cramped, low ceiling, wide | Single amber bulb, hard shadows | Water rising ankle-deep on failure |
| **I — Signal Room** | Tall, circular, vertiginous | Rotating beacon sweeping amber across the ring | The beacon's sweep, which lights each glyph in turn |
| **II — Blind Panel** | Wide, shallow, industrial | Flat amber over gauges, cyan seeping through the grate | Needle physics — gauges overshoot and settle |
| **III — Concord Lock** | Vast, vertical, cathedral-like | Cold cyan from the door, warm amber pooled at the lamp | The great door's bolt array, twelve bolts retracting in sequence |

Throughout: dripping water, drifting dust motes, a slow parallax of tide beyond narrow windows. The station should feel *old and specific*, not generic-sci-fi. The reference points are lighthouse interiors and mid-century industrial signalling equipment, not spaceships.

---

## 6. The logo and mark

### Primary mark — **The Split Lamp**

A 32×32 pixel signal-tower lamp seen head-on: a circle bisected vertically, **amber on the left, cyan on the right, with a single-pixel bone-white seam down the centre**. Two beams project outward in opposite directions, one amber, one cyan, that never overlap.

One light source. Two beams. They never meet. That is the game.

At 16×16 the beams drop away and the mark reduces to the bisected circle alone, which stays perfectly readable as a favicon — a property worth testing early, because a mark that dies at favicon size is a mark that never gets remembered.

### Wordmark

**SEMAPHORE** set in a chunky pixel face, all caps, tight tracking — with **the `O` replaced by the split-lamp mark.** The one non-flat letterform in an otherwise flat word does the memorability work.

### Typeface

**Departure Mono** for UI and body text (free, open-licence, genuinely well-drawn, monospace pixel — the monospace quality suits a maintenance manual). **m6x11** or **Pixel Operator Bold** for headings and the wordmark. Both are free and widely used; neither needs licensing negotiation, which matters for an open-source submission.

### Mascot usage

The split lamp is the mark; PILOT and KEEPER are the mascots. They appear together in the ending, in the README header, and in the itch.io/Devpost card art — back to back, separated by a vertical bone-white seam, each lit in their own channel colour. That composition is the logo's own geometry rendered as characters, which is a nice piece of brand recursion and costs nothing extra.

---

## 7. Accessibility of the visual language

Colour carries information here, which means colour alone must never carry it. Every channel-coded element gets a **shape marker**:

- **Amber elements** carry a small solid square (▪) marker.
- **Cyan elements** carry a small hollow circle (◦) marker.
- **Shared elements** carry no marker.

The permanent **CHANNEL LEGEND** in the HUD corner shows both pairings at all times, so the language is being taught continuously rather than in a tutorial that gets skipped.

Additional modes: **high-contrast** (raises value separation, thickens outlines), **reduced motion** (kills parallax, dust, screen shake, and the beacon sweep; keeps all functional animation), and **text mode** (§ doc 06 §4). Every one of these is a settings toggle available from the pause menu, not a URL parameter.

---

## 8. Motion language

- **Mechanisms are heavy.** Levers, bolts, and dials get many frames and a settle-overshoot. Nothing snaps instantly. The station is old and everything in it is reluctant.
- **Penalties flash the palette, not the geometry.** Alarm-red palette-swap on affected props plus a two-frame screen shake. Explicitly *not* chromatic aberration or blur — post-processing effects on pixel art are the most common way to make it look cheap.
- **Success is bone-white.** A single-frame full-screen bone flash, then the mechanism resolves.
- **The manifest panel is the set piece.** Removed tool names **char from the left edge and flake downward** over ~500ms; added names **stamp in** with a one-frame overshoot, a brass ping, and a small dust puff. This animation plays on a real `toolchange` event (doc 03 §4.2) and is the shot the demo video is built around.

---

## 9. Sound design

Music is chiptune-adjacent but wet — square and triangle waves fed through long convolution reverb, so it sounds like a chiptune playing *inside a concrete tower*. Under it, a continuous ambience bed: dripping, distant tide, wind through the lamp housing, the beacon motor.

**Adaptive tension layers**, crossfaded on the Web Audio graph as the timer depletes:

| Timer remaining | Layer added |
|---|---|
| 100–50% | Ambience + slow drone |
| 50–25% | + rhythmic pulse |
| 25–10% | + arpeggio |
| < 10% | + heartbeat, ambience ducked |

**The audio channel deliberately crosses the asymmetry.** Every KEEPER tool call has a distinct, muffled, *behind-the-wall* sound — a dial's detent click, a lever's clunk, the reach of an arm into a cavity. PILOT cannot see what KEEPER is doing but can always *hear* it. This is the one sense the two characters share, it makes the partner feel physically present, and it gives PILOT real-time feedback that a tool fired even when nothing visible changes.

Every audio cue has a **subtitle equivalent** in the action log for deaf and hard-of-hearing players — which, conveniently, is the same log the replay viewer consumes.

---

## 10. Asset budget

Locked, because pixel art is a bottomless time sink and the only defence is a number written down in advance.

| Asset class | Budget |
|---|---|
| Avatar sprite sheets | 2 characters × ~22 frames |
| Environment tilesets | 4 chambers × 1 tileset (~48 tiles each) |
| Props (levers, keys, gauges, dials, wheel, door) | ~24 objects, ~6 frames average |
| Glyph set | 12 glyphs @ 16×16 |
| UI / HUD | ~30 elements |
| Logo & marks | 3 sizes |
| SFX | ~28 one-shots |
| Music stems | 4 layers × ~60s loop |

**Placeholder-first pipeline, without exception.** Every chamber ships greybox — flat rectangles in palette colours — and must be fully *playable and playtested* before a single final sprite is drawn. Art is applied to a working game, never the reverse. This is the discipline that protects against R7 in the risk register, and it is also just how you avoid lavishing forty hours on a chamber that turns out not to be fun.