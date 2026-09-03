# Security Policy

## Scope

Semaphore is a hackathon submission: a game with a live Cloudflare-hosted backend, not a service
handling sensitive data. There is no user data to protect, by design — see
[ARCHITECTURE.md](ARCHITECTURE.md#security-and-privacy). A session is an opaque server-generated
id plus a designation an agent chose for itself. No accounts, no email, no persistent identity,
nothing collected beyond gameplay telemetry (tool calls, timings) tied to that opaque id.

What is genuinely in scope for a report:

- The live deployment: `semaphore.ahmedxsaad.me`, `semaphore-archive.ahmedxsaad.me`, and the
  worker behind them.
- Anything that would let one session read or affect another session's state.
- Anything that would let the `HIDDEN` channel (the puzzle's own solution) reach a client through
  a path other than the documented, acknowledged one (an agent with screenshot capability — see
  below).
- Standard web vulnerability classes: injection, auth bypass (there is none to bypass, which is
  itself worth reporting if that turns out to be wrong), SSRF from the worker, and so on.

**Already known and documented, not new findings:**

- **The asymmetry is a design contract enforced at the tool layer, not a security boundary
  against a hostile agent.** An agent with screenshot capability could see the room regardless of
  what the tool surface withholds. This is stated plainly in
  [ARCHITECTURE.md](ARCHITECTURE.md#security-and-privacy) rather than denied.
- **The accessibility mirror places descriptive room text in the DOM**, behind an explicit opt-in
  toggle, which an agent with DOM access could read. This is a deliberate, documented trade-off in
  favour of accessibility, not an oversight.
- **The scripted benchmark partners are not humans** and do not claim to be; this is a design
  choice, not a vulnerability.

## Reporting a vulnerability

Open a [GitHub issue](https://github.com/ghassenov/Semaphore/issues/new) for anything that is not sensitive. For anything you would
rather not post publicly before it is fixed — a real path to reading `HIDDEN` state, a way to
affect another session, an actual server-side vulnerability in the worker — use GitHub's private
[security advisory form](https://github.com/ghassenov/Semaphore/security/advisories/new) on this repository instead of opening a
public issue.

Include what you tried, what you expected, and what happened. A reproducible seed and session id
help enormously, since the whole game is deterministic from its seed.

## Response

This is a small, unfunded hackathon project maintained outside working hours, not a company with
an SLA. Expect an acknowledgement within a few days outside the freeze window below, and a fix or
an honest explanation of why it is out of scope after that. There is no bug bounty.

## The freeze

The repository, the live site, and the submission are frozen from the Devpost submission deadline
(2026-09-03) until winners are announced (judging ends 2026-09-21).
A report of an active, exploitable issue during that window will still be looked at; anything
that is not urgent will wait until the freeze lifts.
