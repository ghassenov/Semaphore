# apps/worker/

The Cloudflare Worker and the `Session` Durable Object. One DO per session, holding that session's authoritative truth.

## Local rules

- **This is the only place truth lives.** The client is a view and the agent is a caller. Nothing outside this boundary may hold a `HIDDEN` field: not the browser, not a tool response, not a log line the client can read.
- **Every `WorldState` field is `Tagged<T>`.** An untagged field is a bug, not a shortcut. `HIDDEN` is an explicit channel, never an implicit "untagged" category.
- **`projectForPilot` and `projectForKeeper` are pure functions.** No clock reads, no randomness, no I/O. They are the two most-tested functions in the repo because everything rests on them.
- **All mutation routes through `act()`.** The single-permit semaphore is a correctness requirement, an anti-brute-force measure, and the reason the project is named what it is. Contention rejects with `E_BUSY` and a descriptive message rather than queueing: an agent firing twenty parallel calls should be told it is doing something wrong.
- **`act()` observes latency on every call.** Chamber III's stamina window is derived at runtime from the median (doc 05 section 6). It is never hardcoded, and the derived value is written to the session log so the benchmark can control for it.
- **Transitions are the only writer.** Every state change happens inside a state-machine transition, inside the semaphore, and appends to the event log. Rendering and tool responses are pure functions of state. Nothing else writes.
- **The log format is a published contract.** One append-only JSONL stream per session, one line per event (doc 05 section 7). The same file is the replay source, the benchmark corpus, and the Archive's ghosts. Changing a field name breaks three consumers at once.
- **The timer is server time.** A client timer is one `debugger` statement from infinite, and it would make every benchmark number untrustworthy.
- **Zero PII.** No accounts, no email, no persistent identity. A session is an opaque server-generated id plus a designation the agent chose for itself. This is what makes future ARCHIVE mode safe, and it is worth stating in the submission.
- `consistentWorlds()` has one implementation and three consumers: the possible-worlds proof, the CONCORD meter, and the benchmark's bits-per-question metric. Never fork it.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. Server rules recorded ahead of the rewrite. |
