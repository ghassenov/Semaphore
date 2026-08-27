# docs/

The design set is the source of truth for **why**. The code is the source of truth for **what runs**. When they disagree, one of them is a bug: decide which, fix it, and log the decision.

## Local rules

- **Document numbers are stable.** `00` through `12` are permanent addresses. Cross-references are made by number and section (`doc 03 section 6`), so renumbering breaks the whole set. A new document takes the next free number.
- **Do not rewrite the v2 set to satisfy a formatting rule.** These files predate the rules and are quoted in the submission copy. Repo formatting rules apply to new prose written here, not to a retroactive sweep.
- [11-spec-notes.md](11-spec-notes.md) is **empirical only**. Every row carries an observed value, a date and a browser version. Never fill it from memory or from the spec text. An unverified row stays blank.
- [12-critique-log.md](12-critique-log.md) is history. It records what changed from v1 and why. Do not edit it to match the current design.
- [hackathonspecs/](hackathonspecs/) is **read-only captured source material**. Never edit it. If a fact there turns out to be stale, verify against the live Devpost pages and note the correction in the decision log.
- [decision-log.md](decision-log.md) is append-only. One row per decision: date, decision, options considered, why, result. Never rewrite a past row; add a new one that supersedes it.

## Where things are settled

| Question | Document |
|---|---|
| Why this concept wins, and the risk register | 01 |
| Puzzle rules, channels, failure states | 02 |
| Tool schemas, lifecycle, the possible-worlds proof | 03 |
| How the agent is onboarded and kept in role | 04 |
| Stack, data model, state machine, log format | 05 |
| Palette, KEEPER's anatomy, motion, sound | 06 |
| Ablation, benchmark, budgets, accessibility, judge path | 07 |
| Build order and what to cut first | 08 |
| The three minutes, shot by shot | 09 |
| Paste-ready Devpost and README copy | 10 |

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. |
