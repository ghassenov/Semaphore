# @semaphore/asymmetry

**Prove that an agent's tool surface does not determine what only the screen was meant to show.**

An agent's tool surface and a human's UI surface do not have to be the same
surface. Once they diverge on purpose - the agent gets aggregates while the
screen shows rows, the agent is scoped to less than the operator beside it -
somebody has to be able to check that the divergence is real.

Grepping a tool response for the secret is not that check. **Absence of a
literal value is not absence of information.** The claim worth making is that
the agent's *entire perceptual surface* does not determine the answer, and that
is an information-theoretic statement:

```
W(s) = { w in candidates(s) : project(facts(w), party) == project(facts(s), party) }
```

Every world the agent's view is compatible with. The assertion is that `|W| > 1`
**and** that those worlds disagree about what to do next. The second half
carries the weight: ambiguity that does not change the correct action costs
nobody anything. What is left over, `log2(distinct actions)`, is how much the
human still has to supply - in bits.

## Use it

Tag your state by channel, say who perceives which channel, and say what else
the world could have been:

```ts
import { check, type Space, type PerceptionModel } from "@semaphore/asymmetry";

type Channel = "SCREEN" | "TOOL" | "BOTH" | "INTERNAL";

const model: PerceptionModel<"OPERATOR" | "AGENT", Channel> = {
  OPERATOR: ["SCREEN", "BOTH"],
  AGENT: ["TOOL", "BOTH"],
};

const dispatch: Space<Ticket, Channel> = {
  id: "dispatch",
  facts: (t) => ({
    reference: { value: t.reference, channel: "BOTH" },
    city: { value: t.city, channel: "TOOL" },
    street: { value: t.street, channel: "SCREEN" },
  }),
  candidates: (t) => STREETS.map((street) => ({ ...t, street })),
  correctAction: (t) => `dispatch to ${t.street}`,
};

export default { name: "support console", model, checks: [check(dispatch, [ticket])] };
```

Then run it as a gate:

```
$ node --experimental-strip-types src/cli.ts examples/support-console.ts

| Surface  | Party | States | Min worlds | Min actions | Min bits | Max bits |
|----------|-------|-------:|-----------:|------------:|---------:|---------:|
| dispatch | AGENT |      1 |          4 |           4 |     2.00 |     2.00 |

No findings. Every surface is underdetermined for every party audited.
```

Two bits: four streets the courier serves, and the agent cannot pick one without
being told. Exit code 0.

Now add the convenience field a refactor always adds - a summary line on the
agent's payload with the address inside the sentence:

```
$ LEAK=1 node --experimental-strip-types src/cli.ts examples/support-console.ts

## 2 finding(s)

- **determined** dispatch / AGENT: 1 consistent world(s) over 1 distinct action(s)
- **verbatim** dispatch / AGENT: concealed field "street" appears verbatim in the AGENT view
```

Exit code 1. That is the regression a hundred green unit tests do not see.

## What it reports

| Finding | Meaning |
|---|---|
| `determined` | The party's view pins the answer down. The asymmetry does not hold there. This is the finding the kit exists for. |
| `unspanned` | `candidates(s)` did not contain `s`. The space does not span what it claims to, so every number under it is unreliable - a defect in the space, not a fact about a party. |
| `verbatim` | A concealed value appears literally inside the projection. The cheap smoke check: fragile in both directions, never the headline, free. |

## `invert`

`invert(model)` exchanges a two-party model. Running your own proof with the
roles swapped answers a question worth asking: is the asymmetry architecture, or
does it only hold in the one direction you happened to build? An unperceived
channel stays unperceived under inversion, because exchanging two lists cannot
invent a channel neither list names.

## Where it came from

Extracted from [Semaphore](../../README.md), a cooperative game built on WebMCP
in which a human sees a room an agent cannot, and the agent holds tools the
human cannot reach. There it is a build gate, a live ambiguity meter and a
benchmark, all over this one implementation.

Zero dependencies. MIT.
