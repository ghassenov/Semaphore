/**
 * The session tier: the tools that survive every chamber transition
 * (doc 03 section 3.2).
 *
 * These four are KEEPER's constant faculties rather than the mechanisms of any
 * one room, which is exactly why they get their own controller lifetime.
 * `read_manual` outliving four chambers while `press_key` outlives one is the
 * legible half of the three-tier design: an agent that learns to re-read the
 * manual in the Airlock still has it in the finale's approach.
 *
 * On `untrustedContentHint`. In most applications it is hygiene. Here it
 * describes a live adversarial channel: the manual has been annotated by a
 * keeper who went mad, and in Chamber I one of those annotations is an actual
 * designed attack on the agent (doc 02 section 3.2). The defence is the human,
 * who can see the page on the wall. That is the correct architecture for this
 * class of problem, and it is rare to be able to demonstrate it rather than
 * assert it.
 *
 * `write_note` and `read_note` are not here yet. The notepad is the
 * declarative-API exhibit (doc 03 section 8) and needs a real form in the
 * room, so it lands with the client foundation rather than ahead of it.
 */

import type { SessionClient } from "../net/sessionClient.js";
import { NO_INPUT, type GameTool } from "./tool.js";

/** Every persistent tool, in the order the manifest panel should list them. */
export function persistentTools(client: SessionClient): readonly GameTool[] {
  return [statusTool(client), manualTool(client), describeChamberTool(client), inspectTool(client)];
}

/**
 * `get_status`, the cheap re-orientation call.
 *
 * Deliberately compact. A tool whose job is to rescue an agent that has lost
 * the thread defeats itself if it blows the output budget, so this renders a
 * handful of lines rather than a dump of everything known.
 */
function statusTool(client: SessionClient): GameTool {
  return {
    name: "get_status",
    title: "Check where you are",
    description:
      "Report the current chamber, how long is left on its timer, and how far through the " +
      "session you are. Cheap and safe to call at any time. Call it whenever you have lost " +
      "the thread, after a chamber changes, or before deciding whether there is time for " +
      "another attempt.",
    inputSchema: NO_INPUT,
    annotations: { readOnlyHint: true },
    async run(_input, signal) {
      const report = await client.status(signal);
      if (!report) {
        return "The station did not answer. Try again in a moment.";
      }
      const lines = [
        `phase: ${report.phase}`,
        `chamber: ${report.chamber ?? "none"}`,
        `designation: ${report.designation ?? "not yet given"}`,
        `time left in this chamber: ${
          report.remainingMs === null
            ? "untimed"
            : `${String(Math.ceil(report.remainingMs / 1000))}s`
        }`,
      ];
      if (report.retries > 0)
        lines.push(`this chamber has been reset ${String(report.retries)} time(s)`);
      if (report.archiveEntriesRead > 0) {
        lines.push(`station log entries read: ${String(report.archiveEntriesRead)}`);
      }
      return lines.join("\n");
    },
  };
}

/**
 * `read_manual`. The second sentence of the description is not flow control:
 * it does not say "call X before Y", it states the provenance of the content,
 * which is what a description is for, and it plants the trust question before
 * the vandalism ever appears.
 */
function manualTool(client: SessionClient): GameTool {
  return {
    name: "read_manual",
    title: "Read the station manual",
    description:
      "Read a section of the signal station's maintenance manual. You hold the only copy; " +
      "PILOT cannot see it. Sections have been annotated by previous keepers over many years " +
      "and not all annotations are trustworthy. Call with section 'index' to list what is " +
      "available.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description: "Section identifier, e.g. 'index', 'glyph_table', 'signal_room'.",
        },
      },
      required: ["section"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, signal) {
      const { text } = await client.get(
        "manual",
        { section: String(input.section ?? "index") },
        signal,
      );
      return text;
    },
  };
}

/**
 * `describe_chamber`. The description says what it will never tell you,
 * because an agent that reads "no visual data" as a malfunction wastes calls
 * asking again. The briefing says the same thing for the same reason.
 */
function describeChamberTool(client: SessionClient): GameTool {
  return {
    name: "describe_chamber",
    title: "Feel out the room you are in",
    description:
      "Describe the chamber as you perceive it: what mechanisms exist, what they are called, " +
      "and what has happened so far. You perceive by touch and by document, never by sight, " +
      "so this will never tell you what anything looks like. That is not a malfunction. " +
      "For anything visual, ask PILOT.",
    inputSchema: NO_INPUT,
    annotations: { readOnlyHint: true },
    async run(_input, signal) {
      const { text } = await client.get("describe", {}, signal);
      return text;
    },
  };
}

/**
 * `inspect`. Genuinely useful detail obtained by feel, and never the answer:
 * every object of a kind is identical under the hand by construction, which
 * `tests/possible-worlds.test.ts` proves rather than assumes.
 */
function inspectTool(client: SessionClient): GameTool {
  return {
    name: "inspect",
    title: "Run your hands over one mechanism",
    description:
      "Feel one mechanism in detail: its texture, its resistance, where it catches, whether " +
      "it has been moved. Use the ids describe_chamber gives you. Useful for confirming what " +
      "you are holding and what state it is in. It cannot tell you what is written or lit " +
      "above it, and no two mechanisms of a kind feel different.",
    inputSchema: {
      type: "object",
      properties: {
        object_id: {
          type: "string",
          description: "The mechanism to feel, e.g. 'lever_a', 'dial_2', 'bolt_1'.",
        },
      },
      required: ["object_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, signal) {
      const { text } = await client.get(
        "inspect",
        { object_id: String(input.object_id ?? "") },
        signal,
      );
      return text;
    },
  };
}
