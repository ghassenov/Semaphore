# apps/game/src/ui/

The DOM around the room: the landing screen, the gate screen and the station
console. Three surfaces, one set of parts.

`parts.ts` holds everything more than one surface uses. `landing.ts` is the two
screens before a session. `console.ts` is the surface a session is played on.
The 3D room is not in here at all - it is `../render/`.

## Local rules

- **A part used by more than one surface is built here once.** The requisition
  slip is the reason this file exists: it was two hand-assembled copies that had
  already drifted, and the gate's had lost the fallback line that rescues the
  exact failure the card exists to prevent (D-062).
- **And it appears once per document.** The fix for the above introduced its
  sibling: the gate called `promptCard()` *and* embedded a graphic that also
  called it, so the never-cut element was on one page twice. Each surface calls
  it exactly once and the call site says where.
- **The landing screen is a surface, not a card in the deck** (D-066). It is
  laid over the whole console with its own scroll. It may not become a child of
  the viewport again: the deck has a definite height and clips, which is how the
  ablation chart and the slip came to be cut off together, and every readout on
  the console was live on a screen with no session behind it.
- **The console stays laid out underneath it.** Never `display: none`. The
  camera frames against the viewport's measured shape, so a hidden console comes
  back at zero by zero and frames the first room against nothing.
- **The landing screen is the console's *first* child.** It draws on top from
  its own stacking context wherever it sits, so DOM order is not about paint: it
  decides what "the first one" means to anything looking an element up. Appended
  last, its slip came second and `querySelector(".slip")` found the one stowed
  in the closed drawer. First is also what a screen reader should reach first.
- **The phase decides whether the landing screen is on the page, and the landing
  screen decides that for itself.** `console.ts` hands it the phase; it does not
  hand it a boolean. `ENTRY` and `LOBBY` are its business and everything after
  them is the game's.
- **A length chosen before the agent has begun is remembered, never dropped.**
  `start` answers `E_NO_SESSION` until `begin_shift` has been called, and that
  refusal used to go to the activity log inside a closed drawer - so the button
  did nothing, visibly, and the only conclusion available to a visitor was that
  the page was broken. The choice is held and fires itself on `LOBBY`.
- **A demonstration may open its own door, and must say so.** "Look around
  without an agent" calls `begin_shift` itself, which is normally the agent's
  move. That is allowed because its whole purpose is to show somebody the game
  before they have an agent pointed at it, and the button states it.
- **The two screens before a session are built from the same parts in the same
  order.** They described different games once. The gate swaps only the step
  that cannot be taken on it.

## What may be a text node

Unchanged, and it governs every file here: puzzle-critical visuals render to the
canvas, never to DOM. A text node holding a glyph is one an agent with page
access can scrape. `splitProof` draws its mark to a canvas and never names it,
which is both the design law and the argument the graphic is making.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-31 | Ahmed Saad | Created with the web-layer redesign (D-066). `ui.ts` split into `parts.ts`, `landing.ts` and `console.ts`; the landing screen became a surface of its own and the start flow stopped failing silently. |
