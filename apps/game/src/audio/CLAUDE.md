# apps/game/src/audio

Local rules for the audio layer. Everything repo-wide is in the root [CLAUDE.md](../../../../CLAUDE.md).

## The split

| File | Owns | Pure |
|---|---|---|
| `plan.ts` | What should be playing, as arithmetic over a `PilotView`. | Yes |
| `engine.ts` | The `AudioContext`, the buses, the reverb, the mix. | No |
| `voices.ts` | How each cue, layer and bed is synthesised. | No |
| `index.ts` | The scheduler, and the one object the client drives. | No |

**Web Audio does not exist in the test environment**, so a decision left inside
a node graph is a decision nothing can check. Every choice belongs in
`plan.ts`; `voices.ts` chooses nothing and only knows how a bolt sounds. This
is the same split `chamber.ts` and `stage.ts` already use.

## Rules

- **`engine.ts` is the only file that creates an `AudioContext`.** A second one
  is a second output device as far as the browser is concerned: two masters,
  two mutes, and a mute button that silences half the station.
- **No audio files, ever.** D-044 took the last asset out of the bundle and the
  client fetches no media at all. A reverb tail is noise with an envelope on
  it, which is cheaper to generate than to download.
- **The cue vocabulary lives in `@semaphore/protocol`, and the worker picks the
  cue.** The client decides what a `klaxon` sounds like and never decides that
  something was a klaxon.
- **Every cue keeps its subtitle.** The chambers emit the cue and the prose
  from the same branch (`lastSound` in each chamber module returns both), so a
  cue with no text equivalent cannot be added without deleting the other half
  on purpose. Doc 06 section 11 requires this, and deaf players depend on it.
- **The detent is countable or the chamber is broken.** 180ms apart, never
  overlapped, identical every time, and the music ducks under it. Doc 02
  section 3.3 has PILOT counting these through a grate to learn what KEEPER's
  rotation registered. It is a puzzle mechanism that happens to be a sound.
- **Sound fires on `PilotView.seq`, never on a diff of the facts.** Two
  rotations that each register three clicks produce identical facts, and PILOT
  has to hear six detents.
- **Nothing here may read a fact KEEPER cannot perceive.** The audio layer
  consumes `projectForPilot` output like the renderer does, and `AUDIBLE` is
  the only channel it acts on.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-30 | Ahmed Saad | Created with the audio layer (doc 06 section 11, plan phase 5.2). |
