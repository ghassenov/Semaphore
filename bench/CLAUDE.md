# bench/

The measurement layer. This is where the Potential Impact argument is paid for with numbers rather than asserted.

## Local rules

- **Run the ablation first, always.** Agent alone, human alone, together. It is the cheapest thing in the suite because both solo conditions terminate fast, and three bars with two on the floor is worth more than every other metric combined. Nothing else in this directory starts until it has run.
- **The agent-alone condition must be genuine.** Full tool access, a briefing that states there is no partner, and enough turns to exhaust reasonable strategies. Publishing a crippled agent's zero would be worthless and this panel would smell it. Publish the raw logs so anyone can check.
- **Scripted partners do not replace the human.** `oracle`, `vague`, `slow` and `wrong` hold the human's information **content** fixed so we can vary its **quality**. What is reported is partner-sensitivity: how much joint performance degrades as the partner degrades. State that framing before anyone else finds the apparent contradiction with our own thesis.
- **Lead with the gap, not the ceiling.** The interesting number is `vague` divided by `oracle`. A model scoring 95 percent with a perfect partner and 30 percent with a vague one is worse, for real collaboration, than one scoring 80 and 70.
- **The CONCORD meter is disabled in the Standard suite.** A HUD element must not contaminate the measurement of what the agent inferred on its own.
- **Every model faces identical puzzles.** Fixed seed list, replayed by id. A benchmark that re-randomises per run measures noise.
- **Report it as a proposal, not an instrument.** One game and a few hundred sessions is preliminary evidence. The sentence is: we think this measures something no existing benchmark measures, here is our first evidence, here is the raw data, tell us if we are wrong.
- **Record token spend per run.** LLM tokens are the only real cost centre in this project. Budget before running, not after.
- `wasted` calls are computed from `keeperViewHash`, which captures what the agent actually knew at call time. That is what separates a model that reasons from a model that enumerates, and the two produce identical completion rates.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. Benchmark rules recorded ahead of the build. |
