/**
 * The document tools, and the boundary between the two origins that serve
 * them.
 *
 * Two claims are worth pinning. The specs must stay one definition, because
 * the whole reason they live here is that `apps/game` and `apps/archive` both
 * register them and agent-facing copy that drifts is two subtly different
 * tools wearing one name. And the bridge's guards must refuse anything that
 * is not a document tool, because the archive origin is a document origin:
 * a parent that asked it for `press_key` would be asking a page with no
 * business moving the station to move the station.
 */

import { describe, expect, it } from "vitest";
import {
  ARCHIVE_CHANNEL,
  DOCUMENT_TOOLS,
  DOCUMENT_TOOL_NAMES,
  READ_MANUAL,
  READ_STATION_LOG,
  isArchiveReady,
  isArchiveRegistered,
  isArchiveTools,
} from "./tools.js";

describe("the document tools", () => {
  it("are exactly the two the archive origin is allowed to serve", () => {
    expect(DOCUMENT_TOOL_NAMES).toEqual(["read_manual", "read_station_log"]);
    expect(DOCUMENT_TOOLS).toEqual([READ_MANUAL, READ_STATION_LOG]);
  });

  it("are both read-only and both flagged as untrusted content", () => {
    // Not hygiene: the manual is annotated by a keeper who went mad and the
    // logs were written by a pair who failed. Both are live channels.
    for (const spec of DOCUMENT_TOOLS) {
      expect(spec.annotations.readOnlyHint).toBe(true);
      expect(spec.annotations.untrustedContentHint).toBe(true);
    }
  });

  it("declare closed schemas with every parameter described", () => {
    for (const spec of DOCUMENT_TOOLS) {
      expect(spec.inputSchema.additionalProperties).toBe(false);
      for (const property of Object.values(spec.inputSchema.properties)) {
        expect(property.description.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("isArchiveTools", () => {
  it("accepts a set drawn from the document tools", () => {
    expect(isArchiveTools({ channel: ARCHIVE_CHANNEL, tools: [] })).toBe(true);
    expect(isArchiveTools({ channel: ARCHIVE_CHANNEL, tools: ["read_manual"] })).toBe(true);
    expect(isArchiveTools({ channel: ARCHIVE_CHANNEL, tools: DOCUMENT_TOOL_NAMES })).toBe(true);
  });

  it("refuses a tool this origin has no business registering", () => {
    expect(isArchiveTools({ channel: ARCHIVE_CHANNEL, tools: ["press_key"] })).toBe(false);
    expect(
      isArchiveTools({ channel: ARCHIVE_CHANNEL, tools: ["read_manual", "open_the_door"] }),
    ).toBe(false);
  });

  it("refuses anything off the channel, which is most of what a frame receives", () => {
    expect(isArchiveTools({ tools: ["read_manual"] })).toBe(false);
    expect(isArchiveTools({ channel: "other", tools: ["read_manual"] })).toBe(false);
    expect(isArchiveTools(null)).toBe(false);
    expect(isArchiveTools("read_manual")).toBe(false);
    expect(isArchiveTools({ channel: ARCHIVE_CHANNEL })).toBe(false);
    expect(isArchiveTools({ channel: ARCHIVE_CHANNEL, tools: "read_manual" })).toBe(false);
  });
});

describe("the other two message shapes", () => {
  it("recognise their own and nothing else", () => {
    expect(isArchiveReady({ channel: ARCHIVE_CHANNEL, ready: true })).toBe(true);
    expect(isArchiveReady({ channel: ARCHIVE_CHANNEL, ready: false })).toBe(false);
    expect(isArchiveReady({ channel: ARCHIVE_CHANNEL, tools: [] })).toBe(false);

    expect(isArchiveRegistered({ channel: ARCHIVE_CHANNEL, registered: [] })).toBe(true);
    expect(isArchiveRegistered({ channel: ARCHIVE_CHANNEL, ready: true })).toBe(false);
    expect(isArchiveRegistered(undefined)).toBe(false);
  });
});
