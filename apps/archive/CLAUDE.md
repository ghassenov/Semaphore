# apps/archive/

A minimal page on a **second origin** that registers the station's document tools and exposes them back to the game. This is the rarest part of the WebMCP spec that anyone exercises, and the fiction demanded it before the spec feature justified it: the manual physically lives on the machine deck, it is not part of the station's control system, and nobody audited what previous keepers wrote in the margins.

## Local rules

- **This app registers exactly two tools:** `read_manual` and `read_station_log`. Nothing else belongs on this origin. If a tool mutates game state, it is a control tool and lives in the game app.
- **`exposedTo` is pinned to the game origin, one entry.** Never a wildcard, never a convenience list. The parent embeds this page with `<iframe src="..." allow="tools" hidden>`; both gates must be satisfied, and the consumer still asks for it via `fromOrigins`.
- **Both tools carry `untrustedContentHint: true` and `readOnlyHint: true`,** and both are honest annotations rather than hygiene. The manual is annotated by a keeper who went mad and the logs were written by a pair who failed. In Chamber I this content actively attacks the agent.
- **Returned content is never interpolated into a tool name, title, or description.** It is returned as clearly delimited content and only as content. This is the tool-poisoning vector the spec names first.
- **The single-origin fallback must ship green.** Build flag `VITE_ARCHIVE_ORIGIN`, unset for the fallback. Cross-origin is verified in Chrome (152, D-074/D-075) and is the flag the production deployment ships with; ChatGPT's in-app browser is not yet separately confirmed. Both paths must stay green regardless.
- **This origin holds no content and no state of its own.** Both tools are fulfilled by fetching this session's routes on the worker (D-033). One of them could never have been static: `read_station_log` records that an entry was read, and that record is what `leave_archive` checks. The archive never gets a storage binding, and now has nothing that would want one.
- **Tool lifetime belongs to the game's `ToolDirector`, not to this page.** The parent sends the complete set that should exist now over `postMessage` and `Registrar` diffs it, so `read_manual` still lasts the shift and `read_station_log` still exists only during the Archive beat. One `AbortController` per tool, never one per message: rebuilding the pair each time would take KEEPER's manual away and give it back at every door.
- **Both ends check the origin, and this end also checks the tool name.** A hidden frame receives messages from anything that can reach it. `isArchiveTools` refuses any name outside the two, which is the "exactly two tools" rule above enforced at the boundary rather than by convention.

## Running it

Three servers and a browser, from the repository root. Ports are arguments: on
localhost a second origin is a second port, in production a second hostname.

```bash
cd apps/worker  && npx wrangler dev --port 8790
cd apps/archive && npx vite --port 5175 --strictPort
cd apps/game    && VITE_ARCHIVE_ORIGIN=http://localhost:5175 \
                   VITE_WORKER_ORIGIN=http://127.0.0.1:8790 \
                   npx vite --port 5173 --strictPort
```

`apps/worker/.dev.vars` needs `ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5175`,
or the frame's fetches are refused and the manual silently does not exist. It
is git-ignored, so every checkout writes its own.

`tests/cross-origin-delegation.ts` proves the whole path against that setup,
and again with `VITE_ARCHIVE_ORIGIN` unset for the fallback. Run both before
touching anything here.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. Cross-origin delegation rules recorded ahead of the build. |
| 2026-08-28 | Ahmed Saad | Archive holds no storage binding; ghost logs are read through the worker, which owns D1. |
| 2026-08-29 | Ahmed Saad | Built. The static-content rule is amended: this origin holds no content either, because `read_station_log` mutates the session and could never have been an asset (D-033). Rules added for parent-owned tool lifetime and the message guards, and the local run recorded. |
| 2026-09-03 | Ahmed Saad | Cross-origin delegation confirmed live in production on the real custom domains (D-074, D-075); the fallback rule updated to say so rather than pointing at the now-consolidated `docs/design/11-spec-notes.md`. |
