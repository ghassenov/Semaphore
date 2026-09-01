/**
 * The audit, and the worked example that ships with the kit.
 *
 * The example is tested rather than merely present because it is the thing a
 * reader runs first, and a broken example is worse than none: it is the kit
 * saying its own claim does not hold.
 */

import { describe, expect, it } from "vitest";
import { audit, check, formatAudit } from "./report.ts";
import type { PerceptionModel } from "./perception.ts";
import type { Space } from "./worlds.ts";

type Channel = "SIGHT" | "TOUCH" | "BOTH";
const MODEL: PerceptionModel<"HUMAN" | "AGENT", Channel> = {
  HUMAN: ["SIGHT", "BOTH"],
  AGENT: ["TOUCH", "BOTH"],
};

interface Lamp {
  readonly position: number;
  readonly label?: string;
}

const positions = [0, 1, 2, 3];

const lamp: Space<Lamp, Channel> = {
  id: "lamp",
  facts: (s) => ({
    position: { value: s.position, channel: "SIGHT" },
    warm: { value: s.position >= 2, channel: "TOUCH" },
  }),
  candidates: () => positions.map((position) => ({ position })),
  correctAction: (s) => `set ${s.position}`,
};

const subject = { name: "lamp", model: MODEL, checks: [check(lamp, [{ position: 3 }])] };

describe("audit", () => {
  it("finds nothing for the party that cannot see", () => {
    const result = audit({ ...subject, parties: ["AGENT"] as const });
    expect(result.findings).toEqual([]);
    expect(result.rows[0]).toEqual({
      space: "lamp",
      party: "AGENT",
      states: 1,
      minWorlds: 2,
      minActions: 2,
      minBits: 1,
      maxBits: 1,
    });
  });

  it("reports the party whose view determines the answer", () => {
    const result = audit({ ...subject, parties: ["HUMAN"] as const });
    expect(result.findings.map((f) => f.kind)).toContain("determined");
  });

  it("reports a space whose candidates do not contain the state", () => {
    // The defect this catches is in the space, not in the party: every number
    // computed from a set that does not span its own state is unreliable.
    const narrow: Space<Lamp, Channel> = { ...lamp, candidates: () => [{ position: 0 }] };
    const result = audit({
      name: "narrow",
      model: MODEL,
      checks: [check(narrow, [{ position: 3 }])],
      parties: ["AGENT"] as const,
    });
    expect(result.findings.map((f) => f.kind)).toContain("unspanned");
  });

  it("reports a concealed value that appears verbatim, and can be allowed by name", () => {
    const leaky: Space<Lamp, Channel> = {
      ...lamp,
      facts: (s) => ({
        secret: { value: "Carrick Lane", channel: "SIGHT" },
        summary: { value: `heading for Carrick Lane`, channel: "TOUCH" },
        position: { value: s.position, channel: "SIGHT" },
      }),
    };
    const one = { name: "leaky", model: MODEL, checks: [check(leaky, [{ position: 3 }])] };
    const found = audit({ ...one, parties: ["AGENT"] as const });
    expect(found.findings.some((f) => f.kind === "verbatim")).toBe(true);

    const allowed = audit({ ...one, parties: ["AGENT"] as const, allowVerbatim: ["secret"] });
    expect(allowed.findings.some((f) => f.kind === "verbatim")).toBe(false);
  });

  it("audits every party in the model when none are named", () => {
    const result = audit(subject);
    expect(result.rows.map((r) => r.party).sort()).toEqual(["AGENT", "HUMAN"]);
  });
});

describe("formatAudit", () => {
  it("prints the table and says plainly when there is nothing to report", () => {
    const text = formatAudit(audit({ ...subject, parties: ["AGENT"] as const }));
    expect(text).toContain("| lamp | AGENT |");
    expect(text).toContain("No findings.");
  });

  it("prints every finding it was given", () => {
    const text = formatAudit(audit({ ...subject, parties: ["HUMAN"] as const }));
    expect(text).toContain("1 finding(s)");
    expect(text).toContain("**determined**");
  });
});

describe("the support console example", () => {
  it("holds: the agent cannot reconstruct the address", async () => {
    const example = (await import("../examples/support-console.ts")).default;
    const result = audit(example);
    expect(result.findings).toEqual([]);
    // Four streets the courier serves, so the operator supplies two bits.
    expect(result.rows[0]?.maxBits).toBe(2);
  });
});
