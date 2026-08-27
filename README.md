# SEMAPHORE

### Two processes. One lock. Don't deadlock.

A cooperative asymmetric-information escape game for the human-agent era, built on WebMCP. Entry to [The WebMCP Challenge](https://webmcp.devpost.com/).

> An agent's tool surface and a human's UI surface do not have to be the same surface, and the space where they diverge is a design space nobody has explored.

You and your AI agent are locked in a derelict signal station. You each control an avatar in the same room, but you perceive different worlds. **You** see glyphs on a panel, needles on gauges, a symbol carved into a door. **Your agent** cannot see any of it. It has the station's maintenance manual, the ability to reach mechanisms behind the walls, and the hands you do not have. Neither of you escapes alone. Each chamber you clear rewrites the agent's tool surface in real time.

---

## Status

Pre-implementation. The design set is complete and the workspace is scaffolded; the game is not yet built.

| Component | State |
|---|---|
| Design documents (00-12) | Complete |
| `packages/seed` deterministic PRNG | Built and tested |
| `packages/protocol`, `apps/*`, `tests/`, `bench/` | Rules recorded, code to be written |

The previous scaffold was written against document set v1 and was removed rather than migrated. The reasoning is in [docs/decision-log.md](docs/decision-log.md) under D-001.

---

## Reading order

Start at [docs/design/00-README.md](docs/design/00-README.md), which indexes the set and states the six decisions that define the project. [CLAUDE.md](CLAUDE.md) holds the working rules for this repository.

---

## Development

Requires Node 22 or later and pnpm 11.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

---

## License

MIT. See [LICENSE](LICENSE).
