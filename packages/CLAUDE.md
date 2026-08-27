# packages/

Code imported by more than one app. If exactly one app uses it, it does not belong here.

## Local rules

- **Pure and environment-free.** No DOM, no Workers globals, no `fetch`, no filesystem, no clock, no ambient randomness. These modules must run identically in the browser, in the Durable Object, in Vitest, and in the benchmark harness.
- **One definition of every shared name.** Channel tags, error codes and wire types exist in `protocol` and nowhere else. A duplicated type is how the client and the server quietly stop agreeing.
- **Determinism is a load-bearing property, not a nicety.** `seed` is what makes `?seed=` replays reproduce, model-versus-model comparison fair, and a playtester's bug reproducible. Any change to the PRNG's output sequence invalidates every recorded session and every benchmark number, so it is a decision-log entry and a version bump, never a tidy-up.
- Packages are consumed from source through `workspace:*` and `exports`. There is no build step and none is wanted.
- Everything here is covered by unit tests, because there is no integration layer to catch a mistake later.

## Current contents

| Package | Holds |
|---|---|
| `seed/` | xorshift128+ PRNG seeded from a session id, with unbiased `int()` and Fisher-Yates `shuffle()`. |
| `protocol/` | Channel tags, `Tagged<T>`, error taxonomy, wire types. To be written against the v2 five-channel model. |

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. Covers `seed` and the pending `protocol` rewrite. |
