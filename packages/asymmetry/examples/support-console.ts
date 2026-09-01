/**
 * A worked example that is not a game: a support console.
 *
 * An operator has a customer record on screen. An agent beside them has tools
 * for looking things up and dispatching a courier. The company's rule is that
 * the agent may act on an address without ever being able to reconstruct one -
 * it gets the city for routing and nothing finer, and the operator reads out
 * the rest when a dispatch actually needs it.
 *
 * That is a policy, and a policy is worth exactly as much as the check behind
 * it. This file is the check. Run it:
 *
 *     node --experimental-strip-types src/cli.ts examples/support-console.ts
 *
 * and again with `LEAK=1` to watch it fail the way a real regression fails: a
 * convenience field added to the agent's payload, carrying the address inside
 * a sentence, with every other test in the suite still green.
 */

import {
  check,
  type PerceptionModel,
  type Space,
  type Subject,
  type Tagged,
} from "../src/index.ts";

/** Where a fact is allowed to appear. `INTERNAL` is nobody's to see. */
type Channel = "SCREEN" | "TOOL" | "BOTH" | "INTERNAL";

const MODEL: PerceptionModel<"OPERATOR" | "AGENT", Channel> = {
  OPERATOR: ["SCREEN", "BOTH"],
  AGENT: ["TOOL", "BOTH"],
};

/** The streets the courier serves in this city. The space of possible answers. */
const STREETS = ["Aldgate Row", "Bellfield Way", "Carrick Lane", "Dunmore Rise"] as const;

interface Ticket {
  readonly reference: string;
  readonly city: string;
  readonly street: (typeof STREETS)[number];
  /** Set by `LEAK=1`: the summary line a well-meaning refactor put on the tool payload. */
  readonly summaryLeaks: boolean;
}

const tag = <T>(value: T, channel: Channel): Tagged<T, Channel> => ({ value, channel });

const dispatch: Space<Ticket, Channel> = {
  id: "dispatch",
  facts: (t) => ({
    // Both surfaces need the reference to talk about the same ticket at all.
    reference: tag(t.reference, "BOTH"),
    // The agent routes on the city and is meant to stop there.
    city: tag(t.city, "TOOL"),
    // The address is on screen for a person to read out loud, and nowhere else.
    street: tag(t.street, "SCREEN"),
    // The convenience field. Correct on the left, a regression on the right.
    summary: tag(
      t.summaryLeaks ? `Ticket ${t.reference} for ${t.street}, ${t.city}` : `Ticket ${t.reference}`,
      "TOOL",
    ),
  }),
  // Holding the ticket fixed, the address could have been any street served.
  candidates: (t) => STREETS.map((street) => ({ ...t, street })),
  // What the pair has to agree on before the courier moves.
  correctAction: (t) => `dispatch to ${t.street}`,
};

const ticket: Ticket = {
  reference: "T-4417",
  city: "Ravensmoor",
  street: "Carrick Lane",
  summaryLeaks: process.env["LEAK"] === "1",
};

const subject: Subject<Channel, "OPERATOR" | "AGENT"> = {
  name: "support console",
  model: MODEL,
  checks: [check(dispatch, [ticket])],
  // The operator is not the party under audit here: they are supposed to be
  // able to read the address, so of course their view determines the dispatch.
  // Auditing only the agent is the honest scoping, and saying so is the point.
  parties: ["AGENT"],
};

export default subject;
