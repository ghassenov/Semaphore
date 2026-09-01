# packages/asymmetry

The extracted kit: the channel model, the projector and the possible-worlds
proof, with nothing in them that knows what a lever is. Everything repo-wide is
in the root [CLAUDE.md](../../CLAUDE.md); the shared-package rules are in
[packages/CLAUDE.md](../CLAUDE.md).

## Why it is a package

`packages/protocol` and `apps/worker` are the game's **binding** of this kit -
our five channels, our two parties, our chambers. The kit is the part that was
never about the game, and shipping it separately is what turns doc 01 section
4's tier-1 Impact claim ("an agent's tool surface and a human's UI surface do
not have to be the same surface") from a sentence into something another team
can run against their own application.

## Local rules

- **Nothing here may know what Semaphore is.** No `Channel` union, no `PILOT`,
  no `ChamberId`. A game-specific name arriving in this directory means the
  binding layer above it is doing too little. The check is whether the
  worked example in `examples/` still reads as a support console.
- **Zero dependencies, and it stays that way.** A reader picking this up should
  be able to copy the directory. That is also why `src/node.d.ts` declares four
  Node symbols by hand rather than pulling in `@types/node`.
- **Specifiers carry their real `.ts` extension.** The CLI is run by
  `node --experimental-strip-types`, which resolves literally. The flag that
  allows this is in `tsconfig.base.json` rather than here, because a package
  consumed from source is compiled under its consumer's configuration.
- **Absence of a literal value is not absence of information.** The `verbatim`
  finding is a smoke check and must never be presented as the proof. If a
  choice ever arises between making the smoke check louder and making the
  possible-worlds pass stronger, it is the second one.
- **A finding is actionable in one line or it is noise.** Every `detail` string
  names the state, the field and what to do about it, because the CLI's whole
  value is that somebody reads its output once in CI and knows what broke.
- **The example is tested.** A broken worked example is worse than no example:
  it is the kit saying its own claim does not hold.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-09-01 | Ahmed Saad | Created. The channel model, the projector, the possible-worlds proof and the audit CLI extracted out of `packages/protocol` and `apps/worker` so they can be run against an application that is not this game. |
