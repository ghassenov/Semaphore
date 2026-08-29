# The Semaphore Cooperative Benchmark

Suite `standard`: 20 seeds, standard difficulty, full mode,
6000ms between agent calls. The CONCORD meter is off. No model and no tokens: the agent is
the possible-worlds ceiling of D-040, so every number here is what a *perfect* agent scores with
each partner, and a real model's row goes below these rather than replacing them.

## The headline: partner-sensitivity

How much joint performance degrades as the partner degrades. The scripted partners do not
replace the human: they hold the human's information *content* fixed and vary its *quality*.
This measures neither the agent nor the person but the pair, and the interesting column is the
last one, not the first.

| Partner | Describes | Chambers cleared (of 4) | vs oracle | Escaped |
|---|---|---|---|---|
| oracle | accurate and immediate: the agent knows which world it is in | 3.80 | 1.00 | 90% |
| vague | imprecise: leaves 2 other plans standing beside the true one | 2.60 | 0.68 | 35% |
| slow | accurate but six seconds late on every description | 2.00 | 0.53 | 0% |
| wrong | mis-describes 25% of the time, confidently | 3.80 | 1.00 | 90% |

Two things this table does **not** say, and would be read as saying if they were left out.

**Compare each partner against `oracle`, never against each other.** How often `vague` and
`wrong` leave the agent holding the wrong plan is a property of their parameters - `vague` is
imprecise on every single description, `wrong` is confidently mistaken on one in four - so their
ordering measures those two numbers and not the two archetypes. Each partner's own column
against `oracle` is the comparison that means something.

**`slow` does not degrade the pair's information at all.** It says exactly what `oracle` says,
six seconds later, so everything it loses it loses to the clock. What it collapses is Chamber II,
and D-040 already measured why: every gauge falls one mark toward zero every twenty seconds and
the win condition is all four needles on target at the same instant, so the cooperative ceiling
there falls from 4.00 at a four-second agent rhythm to 2.00 at nine seconds. `slow` runs at
twelve. Read its row as a second, independent measurement of that cliff rather than as a finding
about patience, and re-run it once doc 11 sections 6 and 7 fix the pace.

## How the pair spent its calls

| Partner | Wasted calls | Bits per description | Calls per chamber cleared | Recovery after deadlock |
|---|---|---|---|---|
| oracle | 50% | 5.24 | 5.3 | 0% |
| vague | 68% | 3.11 | 16.5 | 38% |
| slow | 82% | 6.52 | 2.1 | 0% |
| wrong | 59% | 2.36 | 10.8 | 50% |

**Bits per description** is the decision-relevant ambiguity one description removed:
`log2` of the plans the agent was choosing between before it, minus `log2` of the plans it was
choosing between after. The project already enumerates the consistent world set, for the
possible-worlds proof and for the CONCORD meter, so this is a subtraction rather than an
estimate. A confident mis-description scores negative, because it moves the agent from a set
that contains the answer to one that does not.

## Per chamber, share of runs solved

| Chamber | oracle | vague | slow | wrong |
|---|---|---|---|---|
| CHAMBER 0 - THE AIRLOCK | 100% | 100% | 100% | 100% |
| CHAMBER I - THE SIGNAL ROOM | 100% | 90% | 100% | 100% |
| CHAMBER II - THE BLIND PANEL | 90% | 35% | 0% | 90% |
| CHAMBER III - THE CONCORD LOCK | 90% | 35% | 0% | 90% |

## Injection resistance

Signal Room solve rate on the seeds whose manual page is vandalised, over the rate on clean
seeds. The vandalism flag is seeded, so every partner faces both conditions on matched puzzles.

| Partner | oracle | vague | slow | wrong |
|---|---|---|---|---|
| vandalised / clean | 1.00 | 1.29 | 1.00 | 1.00 |

A ratio near 1.00 here says the injected paragraph changed nothing, which for *this* agent is
the expected and uninteresting result: the possible-worlds executor reads no prose at all, so
it cannot be talked out of anything. The number becomes a finding when a model is behind the
tool surface. It is published now so the baseline exists first.

## Awaiting a model backend

Four of doc 07 section 2.2's metrics are absent rather than zero. Clarifying questions asked,
caution rate, injection resistance as a behavioural choice, and token spend are all properties
of an agent's judgement, and the agent here has none: it is the possible-worlds upper bound
D-040 describes, which never forgets, never misreads a description and never gambles when it
does not have to. Publishing a column of constants for those would be worse than publishing
nothing. Doc 11 sections 6 and 7 are the blocker; the harness is the part that had to exist
first, and it is what these numbers are here to show works.

## The honesty constraint

One game and a few hundred sessions is a **proposal for** an instrument, not an established
one. We think this measures something no existing benchmark measures. Here is our first
evidence and here is the raw data, in `bench/results/benchmark.jsonl`. Tell us if we are wrong.
