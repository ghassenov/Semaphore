# Changelog

A readable, milestone-level history. [docs/decision-log.md](decision-log.md) is the
day-by-day record with every option considered and the reasoning kept; this file is the shorter
version for a reader who wants to know what happened and when, not why.

The project does not tag releases — it is a single continuous build toward one submission — so
entries are grouped by date and theme rather than by version number.

## 2026-09-01 to 2026-09-03 — Deployment, game-feel, and the documentation pass

- **Deployed to Cloudflare for the first time**, on its own custom domain: the worker, and both
  the game and archive Pages projects. Found and fixed a production-only routing bug that only a
  real deployment could surface (D-074, D-075).
- **The possible-worlds proof extracted as a standalone package**, `packages/asymmetry`: zero
  dependencies, a CLI, and a worked example unrelated to the game (D-080).
- **The Blackout**: a window in the Blind Panel where perception and agency invert between PILOT
  and KEEPER, with the proof itself confirming that chamber is the only one of the four that
  survives the inversion (D-081).
- **A stalled pair gained one exit**: a capped, escalating intercom both parties hear, rather than
  a hint delivered to one side alone (D-078).
- **The ending grades the shift** on three separate marks — pace, precision, resolve — rather than
  a single score that would silently favour whichever half of the room it happened to measure
  (D-076).
- **Every room says what it's for**, on PILOT's rail and inside KEEPER's `get_status`, from one
  authored line per chamber (D-077).
- **The station became a place you can hear**: cues and KEEPER's own sound spatialised to their
  source, with per-room acoustics (D-082).
- **The gate screen shows the asymmetry itself**, drawing the same recorded session twice — as
  PILOT saw it and as KEEPER perceived it — rather than only showing the game working (D-083).
- **This documentation pass**: the twelve-document `docs/design/` planning set consolidated into
  `ARCHITECTURE.md` and `DESIGN.md`; `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` and
  this file added; the `LICENSE` restored to plain MIT text with the typeface carve-out moved to
  `NOTICE.md` so GitHub's own license detector reads it correctly (D-087).

## 2026-08-31 — The web layer redesigned

- The console and landing screen rebuilt from scratch as `apps/game/src/ui/`, with the landing
  screen as a surface laid over the console rather than a card inside its deck (D-066).
- An editorial pass: a self-hosted display typeface (the one deliberate exception to "no asset
  files"), scroll-driven reveals, a cursor-reactive light, bounded card tilt (D-068, D-069).
- The ambiguity gauge given tooltips, a guided-tour beat and a durable explainer, after being
  reported as hard to understand in the moment it mattered (D-071).

## 2026-08-30 — Accessibility, the replay viewer, and the judge path

- Full accessibility layer: a screen-reader mirror (off by default, never naming a glyph), high
  contrast derived from the locked palette, reduced motion read every frame, and colourblind
  verification by simulation on every test run (D-058 to D-061).
- The replay viewer, `/replay?id=`, as a projection of the session log that deliberately drops
  every `HIDDEN`-channel field before a browser ever sees it.
- The judge path: attract mode, a spectate recording, chamber deep links, all sharing one
  recorded-session renderer with the Archive's own monitor.
- Sound: adaptive tension layers and a real `AUDIBLE` channel with a text equivalent for every
  cue, synthesised with no asset file of any kind (D-050, D-051).
- Every door standing in an actual opening, and PILOT able to walk back through one (D-053 to
  D-055) — found by playing the game, not by a test.

## 2026-08-29 — The interface rebuilt in real-time 3D

- Phaser and the tile renderer replaced with a Three.js cutaway model: every room open at the top
  and on its south face, camera always to the south, four lights and no post-processing (D-042 to
  D-045).
- The cross-origin archive: `apps/archive` on a genuinely separate origin, registering
  `read_manual` and `read_station_log` and exposing them back to the game via `exposedTo` and
  `allow="tools"` (D-033).
- The ablation (agent alone, human alone, together) and the Semaphore Cooperative Benchmark, both
  built and run over twenty fixed seeds (D-040, D-041).
- Multiple playtesting passes each found defects that hundreds of passing tests had not — the
  origin of this project's own rule that the game is the test.

## 2026-08-27 to 2026-08-28 — The build begins

- Repository scaffolded: pnpm workspaces, strict TypeScript, ESLint, Prettier, Vitest, GitHub
  Actions.
- The core architecture landed: the channel-tagged world state, the two pure projection functions,
  the possible-worlds proof, the session Durable Object and its action semaphore, the seeded PRNG.
- All four chambers implemented against the worker: the Airlock, the Signal Room (with its
  vandalised manual page), the Blind Panel (the dial-to-gauge permutation), and the Concord Lock
  (the adaptive stamina window, sized from measured latency).
- The WebMCP tool layer: the three-tier `AbortController` lifecycle, the declarative notepad, and
  the manifest driven from one real `toolchange` listener.
- Relicensed from Apache-2.0 to MIT before any code beyond the scaffold existed.

## 2026-08-27 — Design

- The initial commit: the twelve-document `docs/design/` planning set (superseded 2026-09-03, see
  above), the captured hackathon specification, and the repository's own working rules.
