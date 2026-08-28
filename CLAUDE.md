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
| License | MIT, visible in the GitHub About panel |

The thesis every decision is checked against:

> An agent's tool surface and a human's UI surface do not have to be the same surface, and the space where they diverge is the playable surface.

Judging is four equally weighted criteria: **WebMCP Leverage**, **Execution**, **Potential Impact**, **Creativity and Ambition**. A change that moves none of them is not on the critical path.

**Never cut, in any scope reduction:** the possible-worlds proof, the `toolchange` sequence including KEEPER's body, the ablation chart, the starter prompt card, ChatGPT in-app browser verification, the MIT license, the demo video. Cut order for everything else is in [docs/design/08-implementation-plan.md](docs/design/08-implementation-plan.md).

---

## 2. Repository map

| Path | Holds | Status |
|---|---|---|
| [NEXT-STEPS.md](NEXT-STEPS.md) | The handoff. Read first, update last. | Live |
| [docs/design/](docs/design/) | The numbered document set 00-12. Source of truth for every design decision. | Complete |
| [docs/](docs/) | The decision log and the lessons journal, beside the set rather than in it. | Live |
| [docs/hackathonspecs/](docs/hackathonspecs/) | Captured hackathon rules and WebMCP reference. Read-only source material. | Complete |
| [packages/](packages/) | Code shared by client, worker, archive and bench. Pure, no I/O. | `seed`, `protocol` built |
| `packages/seed/` | Deterministic xorshift128+ PRNG. Same seed, same puzzle, always. | Built |
| `packages/protocol/` | Channel tags, error codes, wire types, and the two document-tool specs the game and the archive origin share. One definition each. | Built |
| [apps/game/](apps/game/) | Phaser client. Renders PILOT's view, hosts the WebMCP tool director. | Complete through plan 1.4, plus the declarative notepad and first art. A full session has been played end to end in Chrome 151. |
| [apps/worker/](apps/worker/) | Cloudflare Worker plus the Session Durable Object. Authoritative state. | Complete: four chambers, the reducer, the Archive beat, the timer, the read-only tool surface, the manual, PILOT's view socket, the CONCORD route and the shared notepad |
| [apps/archive/](apps/archive/) | Cross-origin tool provider: `read_manual` and `read_station_log`, registered on a second origin and exposed back to the game. | Built (D-033). Holds no content: both tools fetch the worker. |
| [fixtures/ghosts/](fixtures/ghosts/) | Authored ghost session logs, generated from real play. | One ghost built |
| [tests/](tests/) | Cross-cutting proofs: possible-worlds, asymmetry smoke, solvability, and the browser proof of cross-origin delegation. | Possible-worlds proof covers all four chambers; delegation proved on Chrome 151 |
| [bench/](bench/) | Ablation harness, scripted partners, the Cooperative Benchmark. | To write |

Root tooling: pnpm workspaces, strict TypeScript, ESLint, Prettier, Vitest, GitHub Actions.

Target structure in full: [docs/design/05-technical-architecture.md](docs/design/05-technical-architecture.md) section 8.

---

## 3. Deployment

**Cloudflare across the whole stack.** Reasoning in [docs/decision-log.md](docs/decision-log.md) D-005; the backend justification is [docs/design/05-technical-architecture.md](docs/design/05-technical-architecture.md) sections 1 and 11.

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
