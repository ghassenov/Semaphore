# docs/

```
docs/
├── hackathonspecs/   captured Devpost and WebMCP reference, read-only
├── decision-log.md   append-only: date, decision, options, why, result
└── lessons-learned.md  the running journal
```

The numbered `design/` set that used to live here (00 through 12) was consolidated into two
root-level documents once the build was complete: [ARCHITECTURE.md](../ARCHITECTURE.md) for how
and [DESIGN.md](../DESIGN.md) for what and why (D-087). Their content lives there now, brought up
to date with what actually shipped rather than what was planned before it. The original set is
still readable in full at any commit before D-087, by number and section, unchanged.

**This document's older rule survives the move:** the design set was, and the two documents that
replaced it now are, the source of truth for **why**. The code is the source of truth for **what
runs**. When they disagree, one of them is a bug: decide which, fix it, and log the decision.

## Local rules

- [hackathonspecs/](hackathonspecs/) is **read-only captured source material**. Never edit it. If
  a fact there turns out to be stale, verify against the live Devpost pages and note the
  correction in the decision log.
- [decision-log.md](decision-log.md) is append-only. One row per decision: date, decision, options
  considered, why, result. Never rewrite a past row; add a new one that supersedes it.
- [lessons-learned.md](lessons-learned.md) is a running journal, not a design document. It records
  what a session found out, not what was decided.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. |
| 2026-08-28 | Ahmed Saad | Numbered set 00-12 moved into design/; layout recorded. |
| 2026-09-03 | Ahmed Saad | The numbered `design/` set consolidated into `ARCHITECTURE.md` and `DESIGN.md` at the repo root (D-087). This file rewritten: the design-set-specific rules are gone with it, and the "why lives here, what runs is the code" rule now points at the two replacement documents. |
