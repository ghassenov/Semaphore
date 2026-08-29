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
- **`results/` is committed, and regenerated rather than edited.** `pnpm --filter @semaphore/bench ablation` rewrites all three files from one run. A hand-corrected number in `ablation.md` that no longer matches `ablation.jsonl` is the exact failure the rule about publishing raw logs exists to prevent.
- **The ablation's solo condition is a ceiling, not a sample** (D-040). It draws uniformly from `consistentWorlds` at every step, so it beats any real model, and the gap it reports is a lower bound. Do not replace it with a sampled backend: add the backend to the Cooperative Benchmark, which is where per-model numbers belong.
- **A partner is what its description left behind, never a sentence** (D-041). A scripted PILOT is modelled as the subset of the consistent world set the agent still holds afterwards, plus the delay the answer cost. Authoring description strings and parsing them back would measure the parser.
- **A metric that does not vary across the axis is deleted, not reported.** Grounding latency measured 1.0 for all four partners and was removed rather than dressed up; a metric no agent's judgement can move (caution rate, clarifying questions, token spend) is printed as absent with the reason, because a column of constants reads as a measurement.
- **Compare a partner against `oracle`, never against another partner.** How often `vague` and `wrong` mislead the agent is set by their own parameters, so their ordering measures those parameters. Only the ratio to `oracle` is partner-sensitivity.
- **`slow` is a pacing measurement wearing a partner's name.** It degrades nothing informational, so its row is a second reading of Chamber II's drift cliff. Say that wherever its number appears.
- **Report the agent's pacing with any number that depends on it.** `gapMs` is the one free parameter here and doc 11 sections 6 and 7 have not fixed it yet. Chamber II's cooperative ceiling falls from 4.00 to 2.00 between a four-second and a nine-second rhythm, so a completion figure quoted without its pace is not a figure.

## Change Log

| Date | Author | What changed |
|---|---|---|
| 2026-08-27 | Ahmed Saad | Created. Benchmark rules recorded ahead of the build. |
| 2026-08-29 | Ahmed Saad | The ablation is built (D-040). Added the rules on regenerating `results/`, on keeping the solo condition a possible-worlds ceiling, and on always quoting the agent's pacing. |
| 2026-08-29 | Ahmed Saad | The Cooperative Benchmark is built (D-041). Added the rules on how a partner is modelled, on deleting a metric that does not vary, on comparing only against `oracle`, and on what `slow` actually measures. |
