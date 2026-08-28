# fixtures/ghosts/

The authored ghost sessions the Archive reads from (doc 02 section 4). Data, not code: one JSONL file per ghost, in exactly the format `packages/protocol/src/log.ts` defines.

## Local rules

- **Every fixture here is generated, never hand-typed.** `apps/worker/scripts/generate-ghost.ts` plays a real session through the reducer and writes its real output. A hand-written JSONL file drifts from the schema the moment an event shape changes, silently, and nobody notices until the archive's tool response looks wrong. Regenerating after a reducer change is how that drift gets caught instead.
- **Regenerate, don't hand-edit, after any change to `SessionEvent` or a chamber's mechanics.** `npx tsx apps/worker/scripts/generate-ghost.ts` from the repo root, then diff.
- **A ghost's log ends mid-call, never with a synthetic failure event.** Doc 02 section 4: "the log ends mid-call." That is a literal absence of a final action, not a `type: "failure"` event manufactured to signal one, and it does not require the server timer to exist to be honest.
- **Zero PII, same as every session log.** An opaque session id and a self-chosen designation, nothing else. This is what doc 01 section 6 flags as the property that makes a future ARCHIVE mode (ghosts from real players) safe.
- **One ghost is the current scope.** Doc 08's cut order explicitly allows dropping to one; a second is future work, not a gap to silently fill with a duplicate of the first.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-28 | Ahmed Saad | Created alongside `ghost-01.jsonl` and its generator. |
