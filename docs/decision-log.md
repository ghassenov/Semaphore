# Decision Log

Append-only. One row per significant decision. Never rewrite a past entry: add a new one that supersedes it and say so.

Format: date, decision, options considered, why, result.

---

## 2026-08-27

### D-001 Delete the v1-shaped scaffold rather than migrate it

**Decision.** Remove `packages/protocol`, `apps/worker` and `apps/game` in full. Keep `packages/seed`.

**Options considered.**
1. Migrate the existing code in place, editing the channel enum and the error taxonomy.
2. Delete the incompatible modules and rewrite them against the v2 document set.
3. Keep the scaffold and layer v2 alongside it behind a flag.

**Why.** The scaffold was written against document set v1 and its data model is wrong at the root, not at the edges. `Channel` was a four-value enum (`VISUAL | TOOL | SHARED | SERVER_ONLY`) where v2 requires five (`VISUAL | TACTILE | AUDIBLE | SHARED | HIDDEN`); `AUDIBLE` is not a rename, it is a channel both parties perceive differently and it carries puzzle information in Chamber II. The error taxonomy was missing `E_STALE_TOOL` and `E_NO_SESSION` and carried a stale `E_WRONG_CHAMBER`. `Phase` was missing `ENTRY`, `ARCHIVE` and `FINALE`. The action semaphore was correct in concept but had no latency observation, which doc 05 section 6 makes load-bearing for Chamber III's adaptive window. Migrating would have meant touching every line anyway while carrying v1 assumptions forward invisibly. Option 3 violates the no-dead-code rule for no benefit.

`packages/seed` survives untouched because xorshift128+ seeded from the session id is exactly what doc 05 section 9 specifies, it is fully tested, and its output sequence is a contract that future replays and benchmark runs depend on.

**Result.** Repo reduced to `packages/seed` plus root tooling. `pnpm-lock.yaml` regenerated to match the smaller workspace. CI stays green throughout.

---

### D-002 Rules live in `CLAUDE.md`, addressed twice via an `AGENTS.md` symlink

**Decision.** One `CLAUDE.md` per rules-bearing directory, with `AGENTS.md` as a symlink to it in the same directory.

**Options considered.**
1. Two real files per directory, kept in sync by hand or by a hook.
2. A single root file only.
3. One real file plus a symlink.

**Why.** Claude Code reads `CLAUDE.md` and several other agents read `AGENTS.md`. Two real files drift the moment someone edits one, and a drifted rule is worse than no rule. A root-only file forces every agent to load rules for directories it is not working in, which wastes the context budget the workflow rules exist to protect. The symlink gives one source of truth under both names at no maintenance cost.

**Result.** Eight rules directories: root, `docs`, `apps/game`, `apps/worker`, `apps/archive`, `packages`, `tests`, `bench`. Repo-wide rules appear only at the root; subdirectory files carry local law only.

---

### D-003 Directories exist before their code does

**Decision.** `apps/game`, `apps/worker`, `apps/archive`, `tests` and `bench` are created now, holding only their rules files.

**Options considered.**
1. Create each directory when its first source file lands.
2. Create the full structure now with rules in place.

**Why.** The rules that govern a directory are the constraints its code has to be written against, and they are most valuable before the code exists rather than after. Writing down "the client never possesses the solution" while the client is empty costs nothing; discovering it after three chambers of scene code is expensive. This also makes the target structure legible to anyone cloning the repo cold.

**Result.** Structure declared. No placeholder source, no stub modules, no `TODO` files.

---

### D-004 Build the full plan, do not pre-emptively reduce scope

**Decision.** Follow doc 08 phase by phase at full scope. Doc 08's cut order is held in reserve and applied only if something is actually observed to be at risk, not in advance.

**Options considered.**
1. Follow doc 08 phase by phase at full scope.
2. Decide a reduced scope up front and build only that.

**Why.** Seven days remain (2026-08-27 to 2026-09-03, 13:00 PDT) against a nine-phase plan, so this was raised as a scope question. The user's call is that the timeline is not the binding constraint: the team has delivered comparable scope in less time and is running agent-assisted. Option 2 was rejected because doc 08 is already sequenced so that every phase ends demoable, which means the plan degrades gracefully on its own. Deciding cuts in advance would discard work that may well land, and the never-cut list (possible-worlds proof, the `toolchange` sequence with KEEPER's body, the ablation, the starter prompt card, ChatGPT verification, the MIT license, the video) is front-loaded in the phase order regardless.

**Result.** Full scope. Doc 08's ordering guidance governs any cut that becomes necessary, and any such cut gets its own entry here.

---

### D-005 Cloudflare is the deployment target across the whole stack

**Decision.** Host everything on Cloudflare: Pages for the game client, the replay viewer and the archive origin; Workers plus Durable Objects for authoritative state; R2 for session logs.

**Options considered.**
1. Cloudflare end to end (Pages, Workers, Durable Objects, R2).
2. A split host: Vercel or Netlify for the static client, Cloudflare for the stateful backend.
3. A Node service on Render behind any static host.

**Why.** Doc 05 section 1 already selects Workers and Durable Objects for the backend on five independent grounds, and four of them are properties no other option gives cheaply: one single-threaded Durable Object per session is exactly the serialisation point the action semaphore needs, the solution never leaves that boundary, the timer is tamper-proof server time, and the event log falls out for free. Once the backend is committed there, splitting the frontend across a second provider buys nothing and costs a cross-origin hop, a second deploy pipeline, and a second preview-URL story for playtesters. The archive origin in particular is a second Pages project on the same account, which keeps `exposedTo` and the `tools` Permissions Policy delegation testable in one place. Cloudflare is also a challenge sponsor offering credits, which is minor but not nothing.

**Result.** Cloudflare across the board. Recorded in the root `CLAUDE.md` deployment section so it is visible without opening doc 05. Preview deploys on every pull request, including the archive origin, because playtesters need a URL rather than a checkout.
