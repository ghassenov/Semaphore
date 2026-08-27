# apps/archive/

A minimal page on a **second origin** that registers the station's document tools and exposes them back to the game. This is the rarest part of the WebMCP spec that anyone exercises, and the fiction demanded it before the spec feature justified it: the manual physically lives on the machine deck, it is not part of the station's control system, and nobody audited what previous keepers wrote in the margins.

## Local rules

- **This app registers exactly two tools:** `read_manual` and `read_station_log`. Nothing else belongs on this origin. If a tool mutates game state, it is a control tool and lives in the game app.
- **`exposedTo` is pinned to the game origin, one entry.** Never a wildcard, never a convenience list. The parent embeds this page with `<iframe src="..." allow="tools" hidden>`; both gates must be satisfied, and the consumer still asks for it via `fromOrigins`.
- **Both tools carry `untrustedContentHint: true` and `readOnlyHint: true`,** and both are honest annotations rather than hygiene. The manual is annotated by a keeper who went mad and the logs were written by a pair who failed. In Chamber I this content actively attacks the agent.
- **Returned content is never interpolated into a tool name, title, or description.** It is returned as clearly delimited content and only as content. This is the tool-poisoning vector the spec names first.
- **The single-origin fallback must ship green.** Build flag `ARCHIVE_ORIGIN=same|cross`. Cross-origin is the default only once it is verified in both ChatGPT's in-app browser and Chrome, and that verification is recorded in `docs/11-spec-notes.md` with a date. If it is unverified, the flag is `same`.
- This origin reads the same R2 bucket as the worker. It holds no state of its own.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. Cross-origin delegation rules recorded ahead of the build. |
