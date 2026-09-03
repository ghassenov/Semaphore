# apps/spike/

The Phase 0.3 integration spike. A **diagnostic instrument, not game code**, and the only place in the repo allowed to look like one.

Its job was to answer, by exercising the live API rather than by reading the draft, the questions that carry the whole architecture: that `AbortSignal` teardown really removes a tool, that `toolchange` really fires when the registry drains to empty, and that cross-origin delegation really works in the browsers judges will use. The findings it produced are folded into [ARCHITECTURE.md](../../ARCHITECTURE.md#webmcp-tool-architecture) now; the spike stays in the repo as the instrument that produced them, and as the tool to re-run if the spec moves again.

## Local rules

- **Plain ES modules, no build, no dependencies.** It has to open in ChatGPT's in-app browser from any static file server. A build step is friction between us and an answer.
- **This directory is exempt from the no-dead-code rule, and from nothing else.** Checks for behaviour that turns out not to exist are the point: a `[FAIL]` row here is a finding, not a defect. Everything else applies, including the formatting rules.
- **Never copy code from here into an app.** The spike optimises for observing the API; the game optimises for using it correctly through one adapter. Sharing an idea is fine, sharing a file is not.
- **Record results in doc 11, not here.** The page has a Copy report button that emits Markdown for exactly that. This directory holds the instrument; the document holds the findings, with a date and a browser version.
- **Origins are runtime parameters.** The archive origin comes from `?archive=`, never from a constant. On localhost a second origin is a second port.
- **Re-run before submitting.** Doc 11 section 11 requires the whole spike again on the final Chrome version. That is what this exists for.

## Running it

```bash
python3 -m http.server 8787 --directory apps/spike   # game origin
python3 -m http.server 8788 --directory apps/spike   # archive origin
```

Then open `http://localhost:8787/?archive=http://localhost:8788` in Chrome 149+ with `chrome://flags/#enable-webmcp-testing`, or in the ChatGPT desktop app's in-app browser on GPT-5.6 Sol or Terra. Luna has site tools disabled.

Agent rows stay `[waiting]` until a model calls `spike_begin`.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-28 | Ahmed Saad | Created alongside the spike itself. |
| 2026-09-03 | Ahmed Saad | The link to `docs/design/11-spec-notes.md` retargeted to `ARCHITECTURE.md` now the design set is consolidated (D-087). |
