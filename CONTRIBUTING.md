# Contributing

Semaphore is a submission to [The WebMCP Challenge](https://webmcp.devpost.com/), and the
repository is MIT-licensed and public so anyone can read, run and build on it. This file explains
how the codebase actually works, in case you want to.

## Before the judging period ends (2026-09-21)

The submission is **frozen** from the deadline until winners are announced: no changes to the
repository, the live site, or the submission itself during judging. Bug reports and questions are
welcome (see [SECURITY.md](SECURITY.md) for anything sensitive) but will not be acted on until the
freeze lifts. If you want to build on the project before then, fork it — the license permits it
outright.

## After the freeze lifts

Pull requests are welcome. A few things make one land faster.

### Read the law first

[ARCHITECTURE.md](ARCHITECTURE.md) and [DESIGN.md](docs/DESIGN.md) explain what the game is and why the
codebase is shaped the way it is; [docs/decision-log.md](docs/decision-log.md) is the day-by-day
record of every decision behind that shape, with the options considered and the reasoning kept
rather than only the conclusion. The single rule that matters most, from
[ARCHITECTURE.md](ARCHITECTURE.md#the-asymmetry-law):

> The asymmetry is enforced by the type system and the server, never by convention. Every fact in
> world state carries a `Channel`. Tool responses derive exclusively from `projectForKeeper`.
> Rendered frames derive exclusively from `projectForPilot`. Neither may reach around the other.
> A change that makes an asymmetry check pass by weakening the check is not a fix — it is the one
> class of change this project never accepts.

### Setup

Requires Node 22+ and pnpm 11+.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

To run the full stack locally:

```bash
cd apps/worker && npx wrangler dev --port 8787   # shell one
cd apps/game    && pnpm dev                       # shell two, serves :5173
```

Vite proxies `/session` to the worker, WebSocket included. Open `http://localhost:5173/?seed=dev`
and paste the starter prompt from the console's own panel into whichever agent is playing KEEPER.

### How to work in this repository

- **Ask before assuming scope.** For anything non-trivial, state 2-3 concrete options with
  trade-offs rather than guessing which one is wanted. Never silently expand what a change touches.
- **Be concise.** Read only the files a task needs. Keep documentation short — this file included.
- **Verify a CLI tool is installed before using it** (`command -v <tool>`) rather than assuming it,
  and never auto-install one on somebody else's machine.
- **Record every significant decision** in [docs/decision-log.md](docs/decision-log.md): date,
  decision, options considered, why, result. If in doubt whether it's significant, log it.
- **The game is the test.** Semaphore is about describing a room to somebody who cannot see it, so
  describing a room to somebody who cannot see it is how the renderer actually gets checked. A
  passing test suite has repeatedly missed defects that were sitting in a single screenshot, and
  once, a defect that was invisible in every frame and caught only by a person describing the room
  out loud to a partner who could not see it (`docs/decision-log.md` D-049). Play a rendering
  change; don't only look at it, and don't only test it.
- **A report of what someone sees is an observation, not a hypothesis.** Reproduce it literally
  before reinterpreting it. Two real reports in this project's history read like exaggeration and
  were both exactly true once measured.
- **Update [NEXT-STEPS.md](docs/NEXT-STEPS.md)** after any change that affects what the next person
  should pick up. A stale handoff is worse than none, because it's trusted.
- **Never commit personal or machine-specific values** — absolute paths, tokens, usernames, editor
  config. Those belong in `.env` or a `.local` settings file, both git-ignored.

### Code rules

- **Clean and modular.** Single-responsibility modules, small functions, explicit names, type hints
  on every public function, a docstring on every module, class and function.
- **Comments explain intent and the why**, in detail wherever the code isn't self-evident — never
  a comment that just restates the line below it.
- **Never commit** an empty function, a `pass`/TODO stub, or dead code. Code lands implemented and
  tested, or it doesn't land.
- **Pure logic and side effects are kept in separate files, deliberately, everywhere in this
  codebase.** What a chamber contains (`chamber.ts`) is decided separately from what draws it
  (`stage.ts`); what a tutorial says (`tutorial/plan.ts`) is decided separately from the overlay
  that plays it (`tutorial/tour.ts`); what should be playing on the audio bus
  (`audio/plan.ts`) is decided separately from how it's synthesised (`audio/voices.ts`). The half
  that decides is pure and has no environment to fail in, which is also the half that carries the
  tests — a decision left inside a rendering call or an `AudioContext` node graph is a decision
  nothing can check.
- **All contact with the WebMCP spec goes through one adapter module** per app
  (`apps/game/src/webmcp/adapter.ts`). The spec is a moving draft; churn should cost one file, not
  fifty call sites.
- **Puzzle-critical values never reach the DOM.** They render to canvas, or they don't render to
  PILOT at all. This is checked by test, not by review alone — the one sanctioned, explicitly
  documented exception is the accessibility mirror (see
  [ARCHITECTURE.md](ARCHITECTURE.md#security-and-privacy)).
- **Every tool error returns text an agent can act on.** A bare rejection teaches nothing and
  produces flailing retries.
- **No em dashes, anywhere.** Code, docs, comments, commit messages. Use a hyphen, comma, colon or
  parentheses instead.
- **No emoji, anywhere.** Use a plain text marker like `[verified]` instead.
- **Everything in English.**

### Git conventions

- Conventional Commits: `type(scope): summary` — types `feat`, `fix`, `docs`, `test`, `chore`,
  `refactor`, `bench`; scope is the directory touched (`game`, `worker`, `archive`, `protocol`,
  `bench`, `docs`), imperative summary, lowercase, no trailing period, 60 characters or fewer.
  Scope is omitted only for repo-wide changes.
- **One logical change per commit.** Commit regularly; never mix scaffolding, features and docs in
  one commit.
- Keep the repository clean at all times: no build artifacts, caches, `.env` files or personal
  files tracked.
- Branch names: `type/short-topic` (for example `feat/possible-worlds-proof`). Never commit
  directly to `main`.
- **No AI attribution in commit messages or pull request bodies, regardless of what wrote the
  code.** No `Co-Authored-By: Claude` trailer, no "Generated with Claude Code" line. Commits are
  authored by the person or account that opened the PR.
- Don't push or open a PR unless asked to.

### Tests

`pnpm test` runs the full Vitest suite, including the possible-worlds proof
(`tests/possible-worlds.test.ts`) that every reachable state and seed is genuinely underdetermined
from the agent's side. `tests/cross-origin-delegation.ts` is a separate browser proof driven over
the Chrome DevTools Protocol — see [ARCHITECTURE.md](ARCHITECTURE.md#testing-strategy) for how to
run it, and against what.

**A proof gate is never skipped, marked as an expected failure, or weakened to make it pass.** A
change that makes an asymmetry check pass by loosening the check has found a real defect and not
fixed it; a pull request doing that will not be merged. This is the one rule in the project with
no exceptions.

**For anything touching the renderer, run the screenshot tour and look at the frames it writes**,
not only at whether the assertions pass:

```bash
SHOTS=/tmp/tour ARCHIVE="" GAME=http://localhost:5173 WORKER=http://127.0.0.1:8787 \
  node --experimental-strip-types tests/cross-origin-delegation.ts
```

Every renderer this project has shipped has gone green on its test suite and then produced real
defects in its first tour — a wall drawn over a screen, a caption wider than what it labels, two
sprites stacked on one anchor — that hundreds of passing unit tests did not see. Generating a
frame is not the same as looking at one; open what the tour writes and crop into the corners.

### Questions

Open an issue. There is no other channel for this project.
