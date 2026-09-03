# Contributing

Semaphore is a submission to [The WebMCP Challenge](https://webmcp.devpost.com/), and the
repository is MIT-licensed and public so anyone can read, run and build on it. This file explains
how the codebase actually works, in case you want to.

## Before the judging period ends (2026-09-21)

Per [CLAUDE.md](CLAUDE.md), the submission is **frozen** from the deadline until winners are
announced: no changes to the repository, the live site, or the submission itself during judging.
Bug reports and questions are welcome (see [SECURITY.md](SECURITY.md) for anything sensitive) but
will not be acted on until the freeze lifts. If you want to build on the project before then, fork
it — the license permits it outright.

## After the freeze lifts

Pull requests are welcome. A few things make one land faster.

### Read the law first

[CLAUDE.md](CLAUDE.md) is repo-wide law, and every directory that holds code has its own
`CLAUDE.md` with local rules layered on top. The single rule that matters most:

> The asymmetry is enforced by the type system and the server, never by convention. Every fact in
> world state carries a `Channel`. Tool responses derive exclusively from `projectForKeeper`.
> Rendered frames derive exclusively from `projectForPilot`. Neither may reach around the other.
> A change that makes an asymmetry check pass by weakening the check is not a fix — it is the one
> class of change this project never accepts.

[ARCHITECTURE.md](ARCHITECTURE.md) and [DESIGN.md](DESIGN.md) explain why the codebase is shaped
the way it is; [docs/decision-log.md](docs/decision-log.md) is the day-by-day record of every
decision behind that shape, with the options considered and the reasoning kept rather than only
the conclusion.

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

### Code rules, in brief

The full list is in [CLAUDE.md](CLAUDE.md#5-code-rules) section 5; the ones that surprise people
coming from elsewhere:

- **Clean and modular. Single-responsibility modules, small functions, explicit names, type hints
  on every public function, a docstring on every module, class and function.**
- **Comments explain intent and the why**, not what the line below them already says.
- **Never commit** an empty function, a `pass`/TODO stub, or dead code. Code lands implemented and
  tested, or it doesn't land.
- **No em dashes, no emoji, anywhere** — code, docs, comments, commit messages.
- **All contact with the WebMCP spec goes through one adapter module** per app
  (`apps/game/src/webmcp/adapter.ts`). The spec is a moving draft; churn should cost one file, not
  fifty call sites.
- **Puzzle-critical values never reach the DOM.** They render to canvas, or they don't render to
  PILOT at all. This is checked by test, not by review alone.
- **Every tool error returns text an agent can act on.** A bare rejection teaches nothing and
  produces flailing retries.

### Git conventions

- Conventional Commits: `type(scope): summary` — types `feat`, `fix`, `docs`, `test`, `chore`,
  `refactor`, `bench`; scope is the directory touched (`game`, `worker`, `archive`, `protocol`,
  `bench`, `docs`), omitted only for repo-wide changes.
- One logical change per commit. Branch names: `type/short-topic`. Never commit directly to
  `main`.
- No AI attribution in commit messages or pull request bodies, regardless of what wrote the code.
  Commits are authored by the person (or account) that opened the PR.

### Tests

`pnpm test` runs the full Vitest suite, including the possible-worlds proof
(`tests/possible-worlds.test.ts`) that every reachable state and seed is genuinely underdetermined
from the agent's side. `tests/cross-origin-delegation.ts` is a separate browser proof driven over
the Chrome DevTools Protocol — see [ARCHITECTURE.md](ARCHITECTURE.md#testing-strategy) for how to
run it against a live worker and both Pages projects.

A pull request that weakens an asymmetry check to make it pass, rather than fixing what the check
found, will not be merged. This is the one rule in the project with no exceptions.

### Questions

Open an issue. There is no other channel for this project.
