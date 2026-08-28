/**
 * Tool descriptions are agent-facing UI copy, and Chrome publishes budgets for
 * them (doc 03 section 10). This file is where those budgets are enforced.
 *
 * Doc 03 called for a lint rule. A test over the authored tool objects is the
 * same guarantee at a fraction of the machinery, and a stronger one: a lint
 * rule reads source text and would miss a description assembled at runtime,
 * while this reads the tools the registry will actually receive (D-021).
 *
 * The naming and annotation checks beside them are not style. `readOnlyHint`
 * on a tool that mutates is a lie an agent will plan around, and
 * `untrustedContentHint` is the annotation that marks this game's three live
 * adversarial channels rather than being applied as hygiene.
 */

import { describe, expect, it } from "vitest";
import { CHAMBER_ORDER } from "@semaphore/protocol";
import { SessionClient } from "../net/sessionClient.js";
import { BUDGETS, type GameTool } from "./tool.js";
import { beginShiftTool } from "./tools.entry.js";
import { persistentTools } from "./tools.persistent.js";
import { archiveBeatTools, chamberTools, finaleTools } from "./tools.chambers.js";

const client = new SessionClient("s_budgets");

/** Every tool the game will ever register, from the same factories the director uses. */
const ALL_TOOLS: readonly GameTool[] = [
  beginShiftTool(client),
  ...persistentTools(client),
  ...CHAMBER_ORDER.flatMap((chamber) => chamberTools(client, chamber)),
  ...archiveBeatTools(client),
  ...finaleTools(client),
];

/** The three channels doc 03 section 10 names as genuinely adversarial. */
const UNTRUSTED_CONTENT_TOOLS = ["read_manual", "read_station_log"];

/** Every tool that moves the station. Everything else must be read-only. */
const MUTATING_TOOLS = [
  "begin_shift",
  "pull_lever",
  "press_key",
  "reset_sequence",
  "rotate_dial",
  "align_bolt",
  "speak_passphrase",
  "open_the_door",
];

describe("character budgets", () => {
  it.each(ALL_TOOLS.map((tool) => [tool.name, tool] as const))(
    "%s stays inside every budget",
    (_name, tool) => {
      expect(tool.name.length).toBeLessThanOrEqual(BUDGETS.name);
      expect(tool.description.length).toBeLessThanOrEqual(BUDGETS.description);
      for (const property of Object.values(tool.inputSchema.properties)) {
        expect(property.description.length).toBeLessThanOrEqual(BUDGETS.parameterDescription);
      }
    },
  );
});

describe("schemas", () => {
  it.each(ALL_TOOLS.map((tool) => [tool.name, tool] as const))(
    "%s is closed, and every property is described",
    (_name, tool) => {
      // Over-parameterisation is the third risk the spec names. Closed schemas
      // and described properties are how a minimal surface stays minimal.
      expect(tool.inputSchema.additionalProperties).toBe(false);
      for (const [key, property] of Object.entries(tool.inputSchema.properties)) {
        expect(property.description, `${tool.name}.${key}`).toBeTruthy();
      }
      for (const required of tool.inputSchema.required ?? []) {
        expect(Object.keys(tool.inputSchema.properties)).toContain(required);
      }
    },
  );
});

describe("annotations", () => {
  it("marks exactly the tools that move the station as not read-only", () => {
    const mutating = ALL_TOOLS.filter((tool) => !tool.annotations.readOnlyHint).map((t) => t.name);
    expect(mutating.sort()).toEqual([...MUTATING_TOOLS].sort());
  });

  it("marks exactly the untrusted-content channels, and no others", () => {
    const untrusted = ALL_TOOLS.filter((tool) => tool.annotations.untrustedContentHint).map(
      (t) => t.name,
    );
    expect(untrusted.sort()).toEqual([...UNTRUSTED_CONTENT_TOOLS].sort());
  });
});

describe("tool metadata", () => {
  it("never names two tools the same thing", () => {
    const names = ALL_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("interpolates nothing into a name, title or description", () => {
    // Tool poisoning is the vector the spec names first, and the defence is
    // that no content from the manual, the ghost logs or the notepad ever
    // reaches metadata. A description built by hand cannot carry a template
    // hole, so the check is that none of them does.
    for (const tool of ALL_TOOLS) {
      for (const field of [tool.name, tool.title, tool.description]) {
        expect(field).not.toMatch(/\$\{|\[object |undefined|null/);
      }
    }
  });

  it("gives every tool a title an operator could read aloud", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.title).not.toBe(tool.name);
    }
  });
});
