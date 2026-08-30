# apps/game/src/tutorial

Local rules for the guided first shift. Everything repo-wide is in the root [CLAUDE.md](../../../../CLAUDE.md).

## The split

| File | Owns | Pure |
|---|---|---|
| `plan.ts` | What is taught, in what order, in what words. | Yes |
| `tour.ts` | The overlay, the spotlight, and setting `model.focus`. | No |

Same arrangement as `chamber.ts` against `stage.ts`, for the same reason: what a tutorial *says* is a design decision that can be wrong in a way nobody notices by looking, and it is the half worth testing. `tour.ts` chooses nothing.

## Rules

- **It may never name a glyph.** The law the chambers run on, and here it is also the argument: the tour points at a mark and says that putting it into words is the work. `plan.test.ts` checks every step's copy against `GLYPH_IDS`, and it has already caught one - "cross the room" contains `cross`, which is one of the twelve.
- **The split is taught before any key.** A player told the controls first learns a control scheme. A player shown the asymmetry first learns why there is a second player at all, which is the only thing here that looking at the screen does not tell them. Asserted, because it is the kind of ordering a later edit reshuffles for flow.
- **Both layers, because they teach different things.** The camera teaches the room: it is the only way to show a mark at the size PILOT actually has to describe it. The dimming layer teaches the console: a panel is a rectangle in a corner and no camera move can point at one.
- **A step names a fixture; only the stage can find one.** `plan.ts` is pure and knows nothing about where a room is standing. `focus` goes on `StationModel` and `stage.ts` resolves it, so a step naming a fixture the current room does not contain resolves to nothing and the camera carries on - which is what should happen when the tour is talking about the Airlock and the pair have walked out of it.
- **Console elements are marked by `data-tab`, never by a class.** A selector is a promise about markup in another file, and a class name is a promise a styling change is free to break. Asserted in `plan.test.ts`.
- **It runs once, on a first visit, and Escape ends it from any step.** Autoplaying anything is a cost imposed on somebody who did not ask for it. `Show me how it works` on the landing screen starts it again deliberately. Storage is wrapped, because a private window refuses it outright.
- **The copy waits for the camera.** Arriving together reads as one movement; arriving first reads as a caption that has lost its picture.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-31 | Ahmed Saad | Created with the guided first shift (D-063). |
