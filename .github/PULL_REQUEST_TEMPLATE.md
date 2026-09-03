## Summary

<!-- What changed, and why. Link the decision-log entry if you added one. -->

## Checklist

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass locally
- [ ] If this touches `WorldState`, every new field is tagged with its `Channel`, and no change
      weakens an existing asymmetry check to make it pass
- [ ] If this changes a decision worth recording, it's in `docs/decision-log.md`
- [ ] If this changes what a teammate should pick up next, `NEXT-STEPS.md` is updated
- [ ] Commit messages follow Conventional Commits (`type(scope): summary`) and carry no AI
      attribution, per `CLAUDE.md`
- [ ] One logical change per commit

## Screenshots or a recording

<!-- For anything touching the renderer or the console: this project's own rule is "the game is
     the test" — a passing test suite has repeatedly missed defects a single screenshot caught.
     Run `SHOTS=<dir> node --experimental-strip-types tests/cross-origin-delegation.ts` and
     attach a frame or two if this PR changes anything on screen. -->
