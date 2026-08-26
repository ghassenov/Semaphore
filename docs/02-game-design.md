# 02 — Game Design Document

---

## 1. Fiction and framing

**Setting.** A derelict coastal signal station, half-flooded, running on failing power. It was built to relay messages between ships that could not see each other. Its architecture assumes two operators who never occupy the same room: one in the **lamp gallery**, who watches, and one in the **machine deck**, who acts. The station's entire design encodes that separation — sightlines are deliberately broken, and the maintenance manual lives on the machine deck where the person who can see the lamps will never read it.

**Premise.** You are PILOT, and you are in the gallery. You can see everything and touch almost nothing. KEEPER — your agent — is on the machine deck. It has the manual, it has hands inside the walls, and it is completely blind. The station is sealed and the tide is coming in. Four chambers stand between you and the door.

**Why this fiction is load-bearing.** It is not decoration. It gives an in-world reason for every architectural constraint — why the agent can't see, why the human can't reach, why the manual is where it is. When a player asks "why can't my agent just look at the screen?", the fiction answers before the engineering has to. Good asymmetric games always justify their asymmetry diegetically; *Keep Talking* puts the manual in a different room for exactly this reason.

**Tone.** Tense but warm. Not horror. The station is melancholy and beautiful, not threatening. The humour comes from the relationship — KEEPER is earnest, slightly formal, and occasionally says things like *"I am going to assume 'squiggly one' means the spiral."* The stakes feel real without being grim.

---

## 2. Core loop

```
   PILOT perceives  ──describes──▶  KEEPER interprets  ──acts──▶  World changes
        ▲                                                              │
        └──────────────────────  PILOT observes  ◀─────────────────────┘
```

Every chamber is a variation on this loop, but the *direction of information flow* changes between them, which is what keeps it from getting stale:

| Chamber | Who perceives | Who acts | Loop shape |
|---|---|---|---|
| 0 — Airlock | PILOT | KEEPER | Simple relay. Teaches the loop. |
| I — Signal Room | PILOT | KEEPER | Relay + agent-side computation. |
| II — Blind Panel | KEEPER acts blind, PILOT observes | Both | Closed feedback loop; empirical discovery. |
| III — Concord Lock | Split across both | **Simultaneous** | Coordination under time pressure. |

That progression — relay, then computation, then feedback, then synchrony — is the game's actual difficulty curve, and it is a curve in *kind* of collaboration, not just in puzzle hardness. That is what makes fifteen minutes feel like it earned itself.

---

## 3. The chambers

### Chamber 0 — THE AIRLOCK
**Target duration:** 60–90 seconds. **Timer:** generous (3:00) or off in Practice mode.

**Room.** A cramped airlock. Three levers on the far wall. Above each lever, a glyph is lit in amber: a **spiral**, a **cross**, a **wave**. Their assignment to levers is randomised per session.

**Information split.**
- PILOT sees: the three glyphs and which lever each sits above.
- KEEPER's `describe_chamber()` returns: *three levers exist, ids `lever_a`, `lever_b`, `lever_c`, positioned left, centre, right.* No glyph data whatsoever.
- KEEPER's `read_manual({ section: "airlock" })` returns: *"To equalise pressure, pull the lever bearing the SPIRAL. Pulling any other lever will vent the chamber and cost you time."*

**Solution.** PILOT says which lever has the spiral; KEEPER calls `pull_lever({ lever_id })`. Door opens.

**Design intent.** This chamber exists to teach three things in under ninety seconds: (1) KEEPER genuinely cannot see, (2) PILOT genuinely cannot act, (3) talking is the interface. It is deliberately trivial *as a puzzle* so the mechanic itself is the discovery. Getting this chamber right matters more than it looks — if a player doesn't feel the click here, nothing downstream lands.

**Failure.** Wrong lever: 20-second penalty, a loud vent hiss, the chamber floods ankle-deep (visual escalation, no mechanical effect). No lockout — this chamber cannot be failed permanently.

---

### Chamber I — THE SIGNAL ROOM
**Target duration:** 3 minutes. **Timer:** 5:00.

**Room.** A tall circular chamber. Six illuminated glyphs arranged in a ring around the wall, numbered 1–6 clockwise from the top (the numbers are visible to PILOT). Below the ring, a bank of six brass keys. In the centre, a slowly rotating beacon that lights each glyph in turn.

**Information split.**
- PILOT sees: six distinct glyph shapes and their ring positions. The shapes are visually describable — *a three-armed spiral, a crossed circle, a broken wave, a stacked triangle, a horned arch, a knotted loop* — chosen from a pool of twelve, randomised per session.
- KEEPER can call `press_key({ key_id })` for keys 1–6.
- KEEPER's `describe_chamber()` returns only: *a ring of six positions, six corresponding keys, ids 1–6.*
- KEEPER's manual is **sectioned**, and the agent must navigate it:
  - `read_manual({ section: "index" })` → lists available sections.
  - `read_manual({ section: "glyph_table" })` → a table mapping glyph descriptions to **stroke counts**.
  - `read_manual({ section: "signal_room" })` → *"Depress the keys in ascending order of the stroke count of the glyph above them. Omit any glyph whose stroke count is a prime number."*

**Solution.** PILOT describes each of the six glyphs by appearance. KEEPER looks each up in the glyph table to get its stroke count, discards primes, sorts the remainder ascending, and presses the corresponding keys in that order.

**Why this is a good puzzle.** It requires all four collaboration behaviours we want the benchmark to measure:
- **Grounding** — PILOT's plain-language description must be matched to the manual's canonical name. "The squiggly one" is ambiguous; KEEPER should ask.
- **Clarification** — the glyph pool deliberately contains two similar shapes (*broken wave* and *knotted loop* read alike at a glance), so a good agent asks a disambiguating question and a bad one guesses.
- **Computation** — the prime filter and the sort are agent-side work PILOT cannot do without the table.
- **Sequencing** — order matters, so a partially-correct answer still fails, which forces care.

**Search space.** Ordered subsets of six keys: 1,956 possible sequences. Brute force is impossible inside the timer, which is the point (see §6).

**Failure.** Wrong key: the ring flashes red, a klaxon sounds, 15-second penalty, and the sequence resets to empty. Three wrong keys in a row: **RACE CONDITION** — the chamber resets with a fresh glyph randomisation and a 30-second penalty.

---

### Chamber II — THE BLIND PANEL
**Target duration:** 4 minutes. **Timer:** 6:00.

**Room.** A wall of four large brass pressure gauges, needles trembling. Beside them, an engraved plate showing a **target reading** for each gauge in tick-notation. Below the gauges, a rusted grate; behind it, four dials KEEPER can reach and nobody can see.

**Information split.**
- PILOT sees: the four gauge needles (values 0–8) and the target plate. PILOT cannot reach the dials.
- KEEPER can call `rotate_dial({ dial_id, direction, clicks })` for dials 1–4. KEEPER **cannot see the gauges at all** — `describe_chamber()` reports only that four dials exist behind the grate.
- The manual says: *"Each dial drives one gauge. The correspondence is set at installation and is not recorded here. One click of a dial moves its gauge by one mark. Direction of travel may be inverted on any given linkage."*

**The twist that makes this chamber.** The dial→gauge mapping is a **random permutation, regenerated every session, and written down nowhere.** Neither party has it. It must be discovered empirically: KEEPER rotates a dial, PILOT reports what moved and by how much, KEEPER updates its model. This is a system-identification problem that is *only* solvable through dialogue, and it is the chamber that most convincingly proves the two participants need each other.

**The late complication.** Dial 4 is cross-linked: rotating it moves its own gauge by one mark **and** gauge 1 by one mark in the opposite direction. Nothing announces this. A pair that has built a clean model in the first two minutes will suddenly find it breaking, and will have to notice, diagnose, and compensate. This is the single best moment in the game when it lands.

**The pressure.** All gauges **drift toward zero at one mark per 20 seconds.** You cannot solve the dials one at a time and leave them parked; the endgame requires setting the last two quickly and in the right order. This converts a leisurely logic puzzle into a tense one without adding any rules.

**Win condition.** All four gauges reading their target values simultaneously.

**Failure.** No per-action penalty here — exploration is *supposed* to be free, because the whole chamber is about experimentation. The timer and the drift are the only pressure. This asymmetry in failure design is deliberate: Chamber I punishes guessing, Chamber II rewards it. Different chambers should teach different instincts.

---

### Chamber III — THE CONCORD LOCK
**Target duration:** 4 minutes. **Timer:** 6:00.

**Room.** A great circular door. Set into the wall beside it: a **release bar** (PILOT can hold it; a depleting indicator shows a four-second window), and a **cipher wheel** — a brass disc showing a letter-offset, legible only when PILOT walks to it and raises the lamp.

**Information split — this chamber splits a single secret across both parties.**
- KEEPER can call `read_ciphertext()` → returns an enciphered passphrase, e.g. `"XLI XMHI XYVRW"`.
- The **key** is a Caesar offset shown on the cipher wheel, which only PILOT can read, and only while standing at the wheel with the lamp raised (so PILOT must physically move the avatar, and cannot simultaneously be at the release bar).
- KEEPER can call `get_lock_state()` (`readOnlyHint: true`) → reports whether the lock is currently `armed`, and how many seconds remain in the window.
- KEEPER can call `speak_passphrase({ phrase })` — the game's one genuinely irreversible action.

**Solution, in two beats.**
1. **Decode.** PILOT walks to the wheel, reads the offset aloud ("it's showing four"), KEEPER decrypts the ciphertext and now holds the passphrase.
2. **Synchronise.** PILOT walks to the release bar and holds it, arming the lock for four seconds. KEEPER must call `speak_passphrase` *within that window*. Because PILOT cannot be at the wheel and the bar at once, and because the window is short, this requires an actual verbal countdown — "ready… three, two, one, now."

**Why this is the right finale.** Every prior chamber was turn-based; this one demands simultaneity. It is the only moment in the game where the two participants must act *at the same instant*, and it is genuinely thrilling when it works. It is also, unavoidably, the moment that tests whether the agent can act promptly rather than deliberating — which is a real and interesting agent capability.

**Failure.** Calling `speak_passphrase` with a wrong phrase while armed triggers a **lockout**: the door seals for 30 seconds, klaxons, and the ciphertext re-enciphers with a new offset (so the pair must redo beat 1). Calling it while *not* armed simply returns a descriptive error and costs nothing — a well-behaved agent should check `get_lock_state()` first.

**A deliberate design note.** `speak_passphrase` is the one place we want the agent to be *cautious*, and we signal it three ways: the manual warns about lockout, the tool description says the action is irreversible, and `get_lock_state` exists specifically so a careful agent can verify before acting. Watching which models check first and which just fire is one of the more interesting things the benchmark surfaces.

---

## 4. Between-chamber moments

Roughly forty seconds of transition sits between each chamber, and it is a first-class part of the experience rather than a loading screen:

1. The chamber's mechanism completes with a satisfying physical resolution — bolts retract, water drains, a wall grinds aside.
2. **The TOOL MANIFEST panel rewrites itself.** Bolted to the wall of every chamber is an in-world brass plate listing KEEPER's current capabilities. As the door opens, the old tool names char and flake away, and the new ones stamp in with a percussive *thunk*. This panel is driven by a genuine `toolchange` listener reading actual registry state (doc 03 §4).
3. Both avatars walk through the doorway together. This is the only time they are ever adjacent, and it is the emotional beat of the whole game — the two of you, briefly in the same place, before the next room separates you again.
4. A single line of station log text fades in, advancing the fiction.

---

## 5. Failure, difficulty, and recovery

**Failure states** (named after concurrency bugs, per the brand):

| State | Trigger | Consequence |
|---|---|---|
| **DEADLOCK** | Timer reaches zero | Chamber restarts with fresh randomisation. Progress through prior chambers is retained. |
| **RACE CONDITION** | Three invalid actions in a row (Chamber I and III only) | Chamber resets, 30-second penalty. |
| **LOCKOUT** | Wrong passphrase while armed (Chamber III only) | 30-second seal, ciphertext re-enciphers. |

**Nothing ever loses the whole run.** Failure always rewinds to the start of the current chamber. Punishing a fifteen-minute investment with a full restart would be hostile, and it would also make the benchmark harness far more expensive to run.

**Difficulty presets:**

| Preset | Timers | Drift rate | Penalties |
|---|---|---|---|
| **Practice** | Off | Off | None. For learning and for accessibility. |
| **Relaxed** | ×1.5 | ×0.5 | Halved |
| **Standard** | ×1.0 | ×1.0 | Full. The default and the benchmark configuration. |
| **Deadline** | ×0.7 | ×1.5 | Full. For repeat players. |

Practice mode is not just an accessibility feature — it is also the mode the benchmark harness uses when isolating reasoning quality from time pressure, so the two concerns share an implementation.

---

## 6. Anti-brute-force design

An agent with a cheap, fast tool and no cost for being wrong will simply enumerate. This would destroy the game, so it is designed against explicitly and at three levels:

1. **Wrong actions cost time.** Every invalid action in Chambers I and III costs 15–30 seconds against a timer measured in minutes. A handful of guesses is survivable; systematic enumeration is not.
2. **Search spaces are combinatorially deep.** Chamber I has 1,956 valid key sequences. Chamber II has 24 possible dial→gauge permutations *times* 16 direction-inversion combinations *times* the actual value-setting problem. Neither is enumerable inside the timer.
3. **The server enforces an action mutex.** Only one action may be in flight at a time (doc 04 §5). An agent cannot fire twenty parallel tool calls; concurrent attempts receive a descriptive error. This is both a correctness requirement and, pleasingly, a literal semaphore.

Chamber II is the deliberate exception where experimentation is *free* — because there, systematic probing is the intended solution, not an exploit. The design distinguishes between guessing (punished) and hypothesis-testing (rewarded), which is a distinction worth being explicit about.

---

## 7. Randomisation and replayability

Every session seeds: glyph assignment and pool selection (Ch. 0, I), stroke-count table subset (Ch. I), dial→gauge permutation and inversions (Ch. II), cross-link target (Ch. II), passphrase and cipher offset (Ch. III).

The seed is server-generated, logged, and **replayable by ID** — which matters enormously for the benchmark, since comparing two models fairly requires giving them identical puzzles. `?seed=` on the URL reproduces an exact session.

---

## 8. Onboarding

The player arrives with no idea what this is. Onboarding must be fast, diegetic, and mostly invisible:

- A ten-second cold open: the station, the tide, the door sealing. No text tutorial.
- A single on-screen card: *"Your agent is on the other side of that wall. It has the manual. It cannot see. Tell it what you see."*
- Chamber 0 teaches the rest by being nearly impossible to fail.
- A permanently-visible **CHANNEL LEGEND** in the HUD corner — amber square: *only you see this*; cyan square: *only KEEPER sees this* — which teaches the colour language in one glance and never needs explaining again.

---

## 9. Session shape

| Phase | Duration |
|---|---|
| Cold open + onboarding | 0:20 |
| Chamber 0 | 1:00 |
| Transition | 0:40 |
| Chamber I | 3:00 |
| Transition | 0:40 |
| Chamber II | 4:00 |
| Transition | 0:40 |
| Chamber III | 4:00 |
| Ending | 0:40 |
| **Total** | **≈ 15 minutes** |

Fifteen minutes is deliberate. It is long enough to earn a real difficulty curve and a real ending, short enough that a judge will actually finish it, and cheap enough that a benchmark run across several models is affordable.

---

## 10. Ending

The final door opens onto the lamp gallery at dawn. PILOT's avatar walks out onto the balcony. KEEPER's avatar — for the first and only time — is standing there already, having come up from the machine deck. The two sprites stand together at the rail, the lamp turning behind them.

The final screen shows the session's statistics: time, tool calls, wasted calls, clarifying questions asked — and a link to the **replay viewer**, which scrubs the whole run as a two-track timeline of what each of you did and when.

That last transition — from an intimate ending straight into a rigorous instrument — is the entire project's thesis in one screen.