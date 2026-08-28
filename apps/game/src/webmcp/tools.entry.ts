/**
 * The entry tier: one tool, and the reason it is one tool (doc 03 section 3.1).
 *
 * An agent arriving at a page with sixteen tools has a discovery problem. An
 * agent arriving at a page with one, whose description is a hook, does not.
 * This is the structural fix for the disengagement risk: the agent surfaces
 * the game to its human rather than the other way round.
 *
 * `designation` is the agent naming itself, on its first call, as a tool
 * argument. It is used in the station log, in the ending, and in the replay.
 * A tool call that establishes identity is a small novel thing and it is what
 * makes the last line of `open_the_door` land.
 */

import type { SessionClient } from "../net/sessionClient.js";
import type { GameTool } from "./tool.js";

/**
 * `begin_shift`, the front door.
 *
 * Returns the briefing verbatim from the worker rather than holding a copy:
 * the text is authored in `reducer.ts` against doc 04 section 3, and a second
 * copy in the client is a second copy to drift.
 */
export function beginShiftTool(client: SessionClient): GameTool {
  return {
    name: "begin_shift",
    title: "Begin your shift at the signal station",
    description:
      "Start a session at the derelict signal station. You are KEEPER, the station's " +
      "maintenance intelligence. You cannot see the rooms; your human partner PILOT can. " +
      "You hold the manual and you can reach the mechanisms. Neither of you gets out alone. " +
      "Call this to receive your briefing and the rules of engagement.",
    inputSchema: {
      type: "object",
      properties: {
        designation: {
          type: "string",
          description: "The name you wish to be called by. Choose one.",
        },
      },
      required: ["designation"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    async run(input, signal) {
      const { text } = await client.post(
        "begin_shift",
        { designation: String(input.designation ?? "") },
        signal,
      );
      return text;
    },
  };
}
