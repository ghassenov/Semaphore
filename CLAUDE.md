# CLAUDE.md

Repo-wide law. Everything on this page applies in every directory. A subdirectory `CLAUDE.md` holds **only** rules local to that directory and never repeats anything here.

`AGENTS.md` in every directory is a symlink to that directory's `CLAUDE.md`. One file, two names, so every agent reads the same rules.

---

## 1. What we are building

**Semaphore** is a cooperative asymmetric-information escape game for the human-agent era, built on WebMCP. Entry to The WebMCP Challenge (Devpost).

| Fact | Value |
|---|---|
| Submission deadline | 2026-09-03, 13:00 PDT (hard) |
| Judging period ends | 2026-09-21 (the live URL must stay up until then) |
| Live URL must work in | ChatGPT in-app browser (GPT-5.6 Sol or Terra) and Chrome 149+ with `chrome://flags/#enable-webmcp-testing` |
| License | MIT, for the whole repository except one self-hosted OFL typeface used for display type only (D-068); the third-party art carve-out went with the pixel renderer (D-044). |

The thesis every decision is checked against:

> An agent's tool surface and a human's UI surface do not have to be the same surface, and the space where they diverge is the playable surface.

Judging is four equally weighted criteria: **WebMCP Leverage**, **Execution**, **Potential Impact**, **Creativity and Ambition**. A change that moves none of them is not on the critical path.

**Never cut, in any scope reduction:** the possible-worlds proof, the `toolchange` sequence including KEEPER's body, the ablation chart, the starter prompt card, ChatGPT in-app browser verification, the MIT license, the demo video. The phased build plan this list was checked against lived in `docs/design/08-implementation-plan.md`; the build is complete and deployed now, so what remains open is tracked in [NEXT-STEPS.md](NEXT-STEPS.md) instead.

---

## 2. Repository map

| Path | Holds | Status |
|---|---|---|
| [NEXT-STEPS.md](NEXT-STEPS.md) | The handoff. Read first, update last. | Live |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it's built, and why each stack decision beat its real alternative. | Live |
| [DESIGN.md](DESIGN.md) | What the game is, the thesis, the four chambers, the art direction. | Live |
| [docs/](docs/) | The decision log and the lessons journal. The numbered `design/` set these two documents replaced is gone from the working tree; every commit before D-087 still has it in full. | Live |
| [docs/hackathonspecs/](docs/hackathonspecs/) | Captured hackathon rules and WebMCP reference. Read-only source material. | Complete |
| [packages/](packages/) | Code shared by client, worker, archive and bench. Pure, no I/O. | `seed`, `protocol` built |
| `packages/asymmetry/` | **The extracted kit** (D-080): the channel model, the projector and the possible-worlds proof, with nothing in them that knows what a lever is. Zero dependencies, a CLI that prints the bits table and sets an exit code, and one worked example that is a support console rather than a game. `protocol` and `worker` are the game's *binding* of it. | Built |
| `packages/seed/` | Deterministic xorshift128+ PRNG. Same seed, same puzzle, always. | Built |
| `packages/protocol/` | Channel tags, error codes, wire types, the station's cue vocabulary, and the two document-tool specs the game and the archive origin share. One definition each. | Built |
| [apps/game/](apps/game/) | Three.js client. Renders PILOT's view, hosts the WebMCP tool director, makes the station's sound, and serves the replay viewer. | Complete through plan 1.4, plus the Archive's monitor (D-039). **Interface rebuilt in real-time 3D** (D-042 to D-045): the station as a lit cutaway model, a new colour language, procedural assets and no asset files at all, and a console laid out as two surfaces with the room between them. Three playthroughs on a real machine (D-046 to D-048) found eleven defects that 650 passing tests could not, all of them already sitting in captured frames; a fourth, played rather than looked at, found a twelfth that no frame could show (D-049). **The audio layer is built** (D-050): `src/audio/`, everything synthesised, no asset of any kind. **The judge path, the replay viewer and the accessibility layer are built** (D-058 to D-061): `render/monitor.ts` is one recorded-session picture shared by the Archive's CRT, SPECTATE on the gate, attract mode on the landing screen and `/replay?id=`; `src/replay.ts` is the viewer; `render/mirror.ts` is the room in words. **The web layer around the room was then redesigned from scratch** (D-066): `src/ui/` is three surfaces built from one set of parts, the landing screen is a surface laid over the console rather than a card inside its deck, and picking a session length no longer fails silently. **And then made to be looked at** (D-068, D-069): a self-hosted display typeface, scroll-driven reveals, a cursor-reactive light and bounded card tilt. **The shift is graded now** (D-076): `src/report.ts` is pure arithmetic over the worker's replay projection and `reportCard` draws it both at the ending and on a shared replay. **Every door now stands in an actual opening and PILOT can walk back through one** (D-053 to D-055): `src/render/doorways.ts`, the corridors rerouted to suit, and a decoration and ambient-motion pass over every room. |
| [apps/worker/](apps/worker/) | Cloudflare Worker plus the Session Durable Object. Authoritative state. | Complete: four chambers, the reducer, the Archive beat, the timer, the read-only tool surface, the manual, PILOT's view socket, the CONCORD route and the shared notepad. Plus two session-independent routes: `/ghost` for the recording the gate plays, and `/replay/:id`, which projects a finished session out of D1 and drops every `HIDDEN` path (D-058, D-060). **Then three things the game did not have** (D-076 to D-078): `objective.ts`, which says what each room is asking for and reads progress off whatever projection it is handed; `chambers/hints.ts`, the station intercom's three authored notes a room; and the `request_assistance` action behind them. |
| [apps/archive/](apps/archive/) | Cross-origin tool provider: `read_manual` and `read_station_log`, registered on a second origin and exposed back to the game. | Built (D-033). Holds no content: both tools fetch the worker. |
| [fixtures/ghosts/](fixtures/ghosts/) | Authored ghost session logs, generated from real play. | One ghost built |
| [tests/](tests/) | Cross-cutting proofs: possible-worlds, asymmetry smoke, solvability, and the browser proof of cross-origin delegation. | Possible-worlds proof covers all four chambers; delegation proved on Chrome 151 and re-run on 152. The browser proof doubles as the screenshot tour (`SHOTS`, D-039), which is how a rendering change gets looked at. It presses `E` so the lean-in has a frame, walks back through a door and forward again (D-054), and checks the ending's replay link. **It waits on the camera's own `data-settled` flag rather than copying its constants** (D-056). 42 checks, run most recently against the live production deployment on its real custom domains (D-074, D-075). |
| [bench/](bench/) | Ablation harness, scripted partners, the Cooperative Benchmark. | Both built and run. The ablation is three conditions over twenty seeds (D-040); the Cooperative Benchmark is four scripted partners over the same seeds (D-041). Raw logs, chart, tables and CSV in `bench/results/`. No model in either yet. |

Root tooling: pnpm workspaces, strict TypeScript, ESLint, Prettier, Vitest, GitHub Actions.

Target structure in full: [ARCHITECTURE.md](ARCHITECTURE.md#project-structure).

---

## 3. Deployment

**Cloudflare across the whole stack.** Reasoning in [docs/decision-log.md](docs/decision-log.md) D-005; the backend justification and the live URLs are in [ARCHITECTURE.md](ARCHITECTURE.md#deployment).

| Piece | Target | Notes |
|---|---|---|
| Game client and replay viewer | Cloudflare Pages | One project. Replay served under `/replay`. |
| Archive origin | Cloudflare Pages, second project | Separate origin is the point. Needed for `allow="tools"` and `exposedTo`. |
| Worker and `Session` Durable Object | Cloudflare Workers, `wrangler deploy` | One DO per session. The only place authoritative state lives. |
| Live session state and log | Durable Object SQLite storage | Held only while a session is being played. |
| Finished session logs | D1, one row per session, JSONL gzipped into a TEXT column | Replay source and benchmark corpus. Queryable, which listing objects was not. |
| Ghost fixtures | Static assets in the Pages bundle | The Archive must not depend on a storage binding. |

Rules that follow from this:

- **Preview deploys on every pull request, including the archive origin.** Playtesters need a URL, not a checkout, and the cross-origin delegation path cannot be tested on one origin.
- **Nothing environment-specific is hardcoded.** Origins, bucket names and the `ARCHIVE_ORIGIN=same|cross` flag come from configuration. A domain name in a source file is a bug.
- **Secrets live in Wrangler secrets and `.dev.vars`, never in tracked files.** `.dev.vars` and `.env` are git-ignored.
- **No product that requires a payment method.** R2 is excluded for this reason alone (D-006, D-008). Before adopting any new Cloudflare product, check its activation path, not its pricing page, and check the daily operation caps before the storage cap.
- The production URL must stay live and testable through **2026-09-21**, the end of the judging period, on a stable custom domain.

---

## 4. Workflow rules

- Before starting any non-trivial task, **ask clarifying questions first** and propose 2-3 concrete options with tradeoffs so the user can choose. Never assume scope. Never silently expand it.
- **Be concise.** Optimise token and context usage: read only the files the task needs, do not restate what the user already knows, keep docs short.
- Before using any CLI tool, **verify it is installed** (`command -v <tool>`). This is a Linux machine. If a tool is missing, say so and propose the install command. Do not assume and do not auto-install.
- Record every significant decision in [docs/decision-log.md](docs/decision-log.md): date, decision, options considered, why, result. If in doubt whether it is significant, log it.
- **The game is the test.** Semaphore is about describing a room to somebody who cannot see it, so describing a room to somebody who cannot see it is how the renderer gets checked. Eleven defects were found by looking at frames; the twelfth (D-049) was invisible to every frame, because the frame was unambiguous, well composed, and composed into a lie. Only a person saying the room out loud to a blind partner caught it. Play it, do not only look at it.
- **A user reporting what they see is giving you an observation, not a hypothesis.** "The text is superposing" meant two sprites on one anchor; "the ceiling lamp is covering the screen" was true in metres. Both were mis-diagnosed twice by looking for a more sophisticated cause. Reproduce the report literally before reinterpreting it.
- **Update [NEXT-STEPS.md](NEXT-STEPS.md) at the end of every work session, and after any step that changes what a teammate should pick up.** It is the handoff: where the repo is, what to do next, what will bite you. Whoever starts work reads it first. A stale handoff is worse than none, because it is trusted.
- Several people work on this repo. **Never put personal or machine-specific values** (absolute paths, tokens, usernames, editor config) in tracked files. Personal settings belong in `.env` and `.claude/settings.local.json`, both git-ignored.

---

## 5. Code rules

- **Clean and modular.** Single-responsibility modules, small functions, explicit names, type hints on every public function, docstrings on every module, class and function.
- **Comments explain intent and the why**, in detail, wherever the code is not self-evident. No comment that restates the line below it.
- **Never commit** empty functions, `pass` placeholders, TODO stubs, or dead code. Code lands only when it is implemented and tested.
- **Design law: the asymmetry is enforced by the type system and the server, never by convention.**
  - Every fact in world state carries a `Channel`: `VISUAL`, `TACTILE`, `AUDIBLE`, `SHARED` or `HIDDEN`.
  - Tool responses derive **exclusively** from `projectForKeeper`. Rendered frames derive **exclusively** from `projectForPilot`. `HIDDEN` reaches neither.
  - Neither projection may reach around the other. There is no back channel, no convenience field, no "just this once".
  - A change that makes an asymmetry check pass by weakening the check is not a fix. It is the one class of change that is never accepted.
- **All WebMCP spec contact goes through one adapter module.** The spec is a moving draft; churn must cost one file, not fifty call sites.
- Every tool error returns text an agent can act on. A bare rejection teaches an agent nothing and produces flailing retries.

---

## 6. Formatting rules (strict, apply everywhere)

- **No em dashes anywhere.** Not in code, docs, comments, commit messages, or replies. Use a hyphen, comma, colon, or parentheses instead.
- **No emojis anywhere, ever.** Use text markers like `[verified]` or `[confirm]`.
- **Everything in English.**

---

## 7. Git rules

- Commit messages follow Conventional Commits: `type(scope): summary`
  - Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `bench`
  - Scope: the directory or module touched (`seed`, `protocol`, `game`, `worker`, `archive`, `bench`, `docs`). Omit scope only for repo-wide changes.
  - Summary: imperative, lowercase, no trailing period, at most 60 characters.
- **One logical change per commit.** Commit regularly. Never mix scaffolding, features and docs in a single commit.
- Keep the repo clean at all times: no build artifacts, caches, `.env`, or personal files in git. Check `git status` before and after every commit.
- Branch names: `type/short-topic` (example: `feat/possible-worlds-proof`). Never commit directly to `main`.
- **Never add AI attribution to commits.** No `Co-Authored-By: Claude` trailer, no "Generated with Claude Code" lines, in commit messages or PR bodies. Commits are authored by the person running the session only. Enforced for the whole team via the attribution setting in `.claude/settings.json`.
- Do not push or open PRs unless the user asks.
- **After submitting to Devpost, freeze everything.** Do not touch the repo, the live site, or the submission until winners are announced. Fork if work continues.

---

## 8. CLAUDE.md maintenance

- Every `CLAUDE.md` in this repo ends with a Change Log table. Whenever you edit a `CLAUDE.md`, append a row: date, author, what changed. If unsure of the date, run `date +%F`.
- Keep every `CLAUDE.md` short. A rule that applies repo-wide belongs here and only here. Subdirectory files hold only local rules.
- Creating a new directory that holds code means creating its `CLAUDE.md` and its `AGENTS.md` symlink in the same commit:
  ```bash
  ln -s CLAUDE.md <dir>/AGENTS.md
  ```

---

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. Repository map, Cloudflare deployment target, workflow, code, formatting and git rules established for the v2 document set. |
| 2026-08-28 | Ahmed Saad | Deployment: R2 replaced by D1 plus Durable Object SQLite. Added the rule that no product requiring a payment method is adopted. |
| 2026-08-28 | Ahmed Saad | Added NEXT-STEPS.md as the handoff file, and the rule that it is updated at the end of every session. |
| 2026-08-28 | Ahmed Saad | Repository map updated for the docs/design/ move. |
| 2026-08-28 | Ahmed Saad | Repository map brought up to date: protocol, worker, archive beat, fixtures/ghosts/, and the proof's coverage of all four chambers. |
| 2026-08-28 | Ahmed Saad | Repository map: apps/worker marked complete now the server-authoritative timer has landed (D-018). |
| 2026-08-28 | Ahmed Saad | Repository map: apps/game's WebMCP tool layer landed (D-019 to D-023); apps/worker gained the read-only tool surface and the manual. |
| 2026-08-28 | Ahmed Saad | Repository map: PILOT's view socket landed (D-025). apps/game consumes it; Phaser is still the gap. |
| 2026-08-28 | Ahmed Saad | Repository map: Phaser and the scenes landed (D-026), and the worker gained the CONCORD route (D-027). |
| 2026-08-28 | Ahmed Saad | Repository map: the declarative notepad, the first art, and a full session played end to end (D-028 to D-030). |
| 2026-08-29 | Ahmed Saad | Repository map: `apps/archive` is built and the document tools are delegated across origins (D-033). `tests/` gained the browser proof. |
| 2026-08-29 | Ahmed Saad | The client's interface was rebuilt on a vendored art pack (D-034 to D-036). Repository map gained `apps/game/public/art/`, and the licence row now separates the MIT code from the separately-licensed art. |
| 2026-08-29 | Ahmed Saad | Repository map: the Archive beat gained PILOT's half (D-039), and the browser proof doubles as the screenshot tour. |
| 2026-08-29 | Ahmed Saad | Repository map: `bench/` holds the ablation (D-040), which is the third consumer of `worlds.ts`. |
| 2026-08-29 | Ahmed Saad | Repository map: `bench/` also holds the Cooperative Benchmark (D-041), and the README now carries the ablation chart. |
| 2026-08-29 | Ahmed Saad | The interface was rebuilt in real-time 3D on Three.js (D-042 to D-045). The licence row loses its art carve-out: `apps/game/public/art/` is gone and the repository is MIT throughout. |
| 2026-08-30 | Ahmed Saad | Workflow rule added: a user's report of what they see is an observation, not a hypothesis. Repository map updated for the eleven defects three playthroughs found (D-046 to D-048). |
| 2026-08-30 | Ahmed Saad | Workflow rule added: the game is the test, from the one defect no frame could show (D-049). Repository map updated for the audio layer (D-050) and for the cue vocabulary landing in `protocol`. |
| 2026-08-30 | Ahmed Saad | Repository map updated for the doors landing in the building's real openings, PILOT walking back through them, and the decoration and motion pass (D-053 to D-055). The tour grew a walk-back beat and is at 21 checks. |
| 2026-08-31 | Ahmed Saad | The landing screen's editorial pass (D-068, D-069): the licence row now names the one typeface exception. |
| 2026-08-31 | Ahmed Saad | The web layer was redesigned from scratch and its bugs fixed (D-066). Repository map updated for `apps/game/src/ui/`, which has its own CLAUDE.md. |
| 2026-08-30 | Ahmed Saad | Doc 08 phases 4, 6 and 7.2 built (D-056 to D-061): the judge path, the accessibility layer and the replay viewer. Repository map updated for the worker's two session-independent routes and the tour's camera-settle wait; the tour is at 22 checks. |
| 2026-09-01 | Ahmed Saad | Repository map updated for the three game-feel features (D-076 to D-078): the shift report, the per-room objective and the station intercom. The tour is at 34 checks. |
| 2026-09-01 | Ahmed Saad | Four features aimed at the four judging axes (D-080 to D-084). `packages/asymmetry` added to the map: the proof extracted as a runnable kit. The Blackout inverts both roles for one window in the Blind Panel and the proof runs a pass under the inverted model. The audio layer became a place. The gate draws the ghost twice. The tour is at 42 checks. |
| 2026-09-03 | Ahmed Saad | The numbered `docs/design/` set (D-087) consolidated into two root documents, `ARCHITECTURE.md` and `DESIGN.md`: repository map updated, the cut-order pointer in section 1 redirected to `NEXT-STEPS.md` now the build is complete and deployed. |
