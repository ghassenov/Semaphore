import { describe, expect, it } from "vitest";
import { parseJsonl, toJsonl, type SessionEvent } from "./log.js";

const start: SessionEvent = {
  t: 0,
  seq: 0,
  type: "session_start",
  sessionId: "s_01",
  seed: "s_01",
  difficulty: "standard",
  mode: "full",
  designation: "KEEPER",
};

const call: SessionEvent = {
  t: 12_847,
  seq: 41,
  type: "tool_call",
  tool: "rotate_dial",
  input: { dial_id: 2, direction: "clockwise", clicks: 3 },
  result: "ok",
  latencyMs: 62,
  keeperViewHash: "a3f",
  concordBits: 6.32,
  wasted: false,
};

const audible: SessionEvent = { t: 13_502, seq: 44, type: "audible", cue: "detents", count: 3 };

describe("the session log format", () => {
  it("round trips one event", () => {
    expect(parseJsonl(toJsonl(call))).toEqual([call]);
  });

  it("round trips a whole log", () => {
    const log = [start, call, audible];
    expect(parseJsonl(log.map(toJsonl).join("\n"))).toEqual(log);
  });

  it("emits one line per event, with no embedded newlines", () => {
    expect(toJsonl(call)).not.toContain("\n");
  });

  it("tolerates a trailing newline, which every appender writes", () => {
    expect(parseJsonl(`${toJsonl(start)}\n`)).toEqual([start]);
  });

  it("tolerates blank lines without inventing events", () => {
    expect(parseJsonl(`${toJsonl(start)}\n\n${toJsonl(call)}\n`)).toHaveLength(2);
  });

  it("reads an empty log as no events", () => {
    expect(parseJsonl("")).toEqual([]);
    expect(parseJsonl("\n\n")).toEqual([]);
  });

  // A corrupted benchmark corpus that reads as merely short is far worse than
  // one that refuses to load, because the first silently changes a published
  // number and the second stops the run.
  it("refuses a malformed line rather than dropping it", () => {
    expect(() => parseJsonl(`${toJsonl(start)}\n{not json}\n`)).toThrow(/line 2/);
  });

  it("preserves sequence order, which is how replay reconstructs the session", () => {
    const parsed = parseJsonl([start, call, audible].map(toJsonl).join("\n"));
    expect(parsed.map((e) => e.seq)).toEqual([0, 41, 44]);
  });

  it("keeps optional fields optional rather than emitting null", () => {
    const withoutCount: SessionEvent = { t: 1, seq: 1, type: "audible", cue: "klaxon" };
    expect(toJsonl(withoutCount)).not.toContain("count");
  });

  // The log is the session: the same file is replay source, benchmark corpus
  // and the Archive's ghosts. Personal data would make ARCHIVE mode unsafe.
  it("carries no personal data, only an opaque id and a self-chosen designation", () => {
    const serialised = toJsonl(start);
    expect(serialised).toContain("s_01");
    expect(serialised).toContain("KEEPER");
    expect(serialised).not.toMatch(/email|name"|user|ip\b/i);
  });
});
