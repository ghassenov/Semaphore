# SEMAPHORE

### Two processes. One lock. Don't deadlock.

A cooperative asymmetric-information escape game for the human-agent era, built on WebMCP. Entry to [The WebMCP Challenge](https://webmcp.devpost.com/).

> An agent's tool surface and a human's UI surface do not have to be the same surface, and the space where they diverge is a design space nobody has explored.

You and your AI agent are locked in a derelict signal station. You each control an avatar in the same room, but you perceive different worlds. **You** see glyphs on a panel, needles on gauges, a symbol carved into a door. **Your agent** cannot see any of it. It has the station's maintenance manual, the ability to reach mechanisms behind the walls, and the hands you do not have. Neither of you escapes alone. Each chamber you clear rewrites the agent's tool surface in real time.

---

## The ablation

Three conditions, twenty fixed seeds, four chambers each. Two bars near the floor is the whole
thesis, measured rather than asserted.

![Chambers cleared of four: agent alone 1.25, human alone 0.00, together 3.80](bench/results/ablation.svg)

| Condition | Setup | Chambers cleared, of 4 | Escaped |
|---|---|---:|---:|
| Agent alone | Every tool, no PILOT | 1.25 | 0% |
| Human alone | The whole room, no KEEPER | 0.00 | 0% |
| Together | Both, with an accurate partner | 3.80 | 90% |

The agent-alone figure is a **ceiling, not a sample**. It is not a language model having a bad
day: at every step it draws uniformly from the worlds its own tool surface provably cannot tell
apart, and acts as though that world were true. No agent does better than that, so the gap above
is a lower bound on the real one. Raw logs for every run are in
[bench/results/](bench/results/), and [docs/decision-log.md](docs/decision-log.md) D-040 explains
the choice and the two findings the run produced that were not the point of building it.

Beside it, the **Semaphore Cooperative Benchmark** measures the thing the ablation cannot: not
whether an agent can play, but how much joint performance degrades as the *partner* degrades.
Four scripted PILOTs - accurate, imprecise, late, occasionally mistaken - over the same twenty
seeds, reported in [bench/results/benchmark.md](bench/results/benchmark.md). It is offered as a
proposal for an instrument, with its raw data, not as an established one.

---

## Status

Playable end to end in Chrome 152 against a live worker: four chambers, the Archive, the finale
and the ending, rendered in real-time 3D. Not yet deployed, and not yet played by a model.

| Component | State |
|---|---|
| Design documents (00-12) | Complete |
| `packages/seed`, `packages/protocol` | Built and tested |
| `apps/worker` - Durable Object, reducer, four chambers, tool surface | Built |
| `apps/game` - Three.js client, WebMCP tool director, the station console | Built |
| `apps/archive` - the cross-origin tool provider | Built, proved on Chrome 151 |
| `tests/` - possible-worlds proof, cross-origin delegation | Green across all four chambers |
| `bench/` - the ablation and the Cooperative Benchmark | Built and published |
| Art - the station, both bodies, KEEPER's anatomy | Built, procedural, no asset files |
| Audio, full accessibility, the replay viewer | Not started |

[NEXT-STEPS.md](NEXT-STEPS.md) is the live handoff and says what is next and what will bite you.

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
