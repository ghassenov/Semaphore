# packages/

Code imported by more than one app. If exactly one app uses it, it does not belong here.

## Local rules

- **Pure and environment-free.** No DOM, no Workers globals, no `fetch`, no filesystem, no clock, no ambient randomness. These modules must run identically in the browser, in the Durable Object, in Vitest, and in the benchmark harness.
- **One definition of every shared name.** Channel tags, error codes and wire types exist in `protocol` and nowhere else. A duplicated type is how the client and the server quietly stop agreeing.
- **Determinism is a load-bearing property, not a nicety.** `seed` is what makes `?seed=` replays reproduce, model-versus-model comparison fair, and a playtester's bug reproducible. Any change to the PRNG's output sequence invalidates every recorded session and every benchmark number, so it is a decision-log entry and a version bump, never a tidy-up.
- Packages are consumed from source through `workspace:*` and `exports`. There is no build step and none is wanted.
- Everything here is covered by unit tests, because there is no integration layer to catch a mistake later.
- **`projectFacts` is the only sanctioned way to derive a view.** Reading `.value` off a `Tagged` by hand is how a leak gets introduced by someone in a hurry. Consumers compose the projector; they do not reimplement it.
- **`PERCEIVED_BY` has one definition and four consumers**: the worker's projections, the possible-worlds proof, the asymmetry smoke test, and the Blackout's inverted map. Forking it would let the proof pass while the game leaks. `INVERTED_PERCEPTION` is built from it by `invert()` and never written out by hand, because an inversion computed in two places is two things that can disagree about what the inverse of the design law is.
- **The mechanism lives in `asymmetry/` and this game's vocabulary lives in `protocol/`.** A `Channel` union, a `PILOT`, a `ChamberId` arriving in `asymmetry/` means the binding layer is doing too little. The check is whether that package's worked example still reads as a support console.
- The log schema in `protocol/src/log.ts` is a **published contract**. Renaming a field breaks the replay viewer, the benchmark and the Archive's ghosts at once.

## Current contents

| Package | Holds |
|---|---|
| `asymmetry/` | The application-agnostic core: `Tagged`, `PerceptionModel`, `project`, `invert`, `consistentWorlds`, `measure`, and the audit CLI. Knows nothing about this game, and has its own [CLAUDE.md](asymmetry/CLAUDE.md). |
| `seed/` | xorshift128+ PRNG seeded from a session id, with unbiased `int()` and Fisher-Yates `shuffle()`. |
| `protocol/` | Channel tags, `Tagged<T>`, `projectFacts`, the error taxonomy, session vocabulary, and the JSONL log schema. |

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. Covers `seed` and the pending `protocol` rewrite. |
| 2026-08-28 | Ahmed Saad | protocol implemented: five-channel model, projector, error taxonomy, session vocabulary, log schema. |
| 2026-09-01 | Ahmed Saad | `asymmetry/` added (D-080): the channel model, the projector and the possible-worlds proof extracted so they can run against an application that is not this game. `protocol/` is now the binding, and gained `INVERTED_PERCEPTION` for the Blackout (D-081). |
