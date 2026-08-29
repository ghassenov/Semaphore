# The ablation

20 seeds, Standard difficulty, full mode, 6000ms between agent calls.

| Condition | Chambers cleared (of 4) | Escaped | Wasted calls |
|---|---|---|---|
| agent-alone | 1.25 | 0% | 50% |
| human-alone | 0.00 | 0% | 0% |
| together | 3.80 | 90% | 50% |

## Per chamber, share of runs solved

| Chamber | agent-alone | human-alone | together |
|---|---|---|---|
| CHAMBER 0 - THE AIRLOCK | 100% | 0% | 100% |
| CHAMBER I - THE SIGNAL ROOM | 25% | 0% | 100% |
| CHAMBER II - THE BLIND PANEL | 0% | 0% | 90% |
| CHAMBER III - THE CONCORD LOCK | 0% | 0% | 90% |

## What this says

Together clears 3.80 chambers of four and escapes in 90% of runs.
An agent with the same tools and no partner clears 1.25.
A human with the same room and no agent clears 0.00: there is no tool on PILOT's side of the grate.

The agent-alone figure is a ceiling, not a sample. It plays a uniform draw from the worlds its own
projection cannot distinguish, redrawn at every step, so it exploits every observation available to it
and never forgets one. No real model does better. See `bench/session.ts` for why that is the honest
way to run this condition and `bench/results/ablation.jsonl` for every run behind these numbers.

The cooperative ceiling is sensitive to how fast the agent moves, and only in Chamber II. Every
gauge falls one mark toward zero every twenty seconds and the win condition is all four on target at
the same instant, so a plan whose rotations span more than one drift interval has to aim each needle
above where it must finish. A gauge whose target is 8 has no room to do that. The sweep below is the
same 20 seeds under the same oracle partner at four agent rhythms:

| ms between agent calls | chambers cleared | escaped |
|---|---|---|
| 2000 | 4.00 | 100% |
| 4000 | 4.00 | 100% |
| 6000 | 3.80 | 90% |
| 9000 | 2.00 | 0% |

Which is a tuning finding about the game rather than about any agent: doc 08 phase 2.2 already flags
Chamber II's drift rate as the thing to tune carefully, and this says what to tune it against. Fix
the pace once doc 11 sections 6 and 7 carry measured round trips, and re-run.

The Concord Lock would be scored separately if it were reached: its release bar is PILOT's hand and
no tool of KEEPER's substitutes for it, which is a weaker claim than the other three chambers make.
In this run the solo condition never got that far, stopping in Chamber II, so the claim is not
part of the headline number either way.
