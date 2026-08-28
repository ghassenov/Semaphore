/**
 * The manual's two obligations: it is complete enough to solve every chamber,
 * and it says the same thing to the same session every time it is read.
 *
 * The second is not pedantry. On vandalised seeds the Signal Room's page
 * carries a paragraph in another hand, and the whole trust mechanic rests on
 * PILOT being able to *see* that page on the wall and confirm it. A page that
 * changed between reads would read as a rendering fault, not as something a
 * previous keeper did.
 */

import { describe, expect, it } from "vitest";
import { GLYPHS, GLYPH_IDS } from "./chambers/glyphs.js";
import { VANDALISM_TEXT } from "./chambers/signal_room.js";
import { MANUAL_SECTIONS, isManualSection, manualSection } from "./manual.js";
import { newSession, reduce, type PersistedSession } from "./reducer.js";
import * as airlock from "./chambers/airlock.js";

const NOW = 1_000_000;

function begun(seed: string): PersistedSession {
  const s = reduce(
    newSession("s_manual", seed, NOW),
    {
      type: "begin_shift",
      designation: "KEEPER",
    },
    NOW,
  ).session;
  return reduce(s, { type: "start", difficulty: "standard", mode: "full" }, NOW).session;
}

/** The first seed of `seeds` whose Signal Room page is vandalised, or not. */
function seedWhere(vandalised: boolean): string {
  for (let i = 0; i < 50; i++) {
    const seed = `manual-${String(i)}`;
    const s = begun(seed);
    const inRoom = reduce(
      s,
      { type: "pull_lever", leverId: airlock.correctLever(s.airlock!.params) },
      NOW,
    ).session;
    if (inRoom.signalRoom!.params.vandalised === vandalised) return seed;
  }
  throw new Error(`No seed found with vandalised=${String(vandalised)}`);
}

describe("the section list", () => {
  it("names every section the index advertises", () => {
    const index = manualSection(begun("seed"), "index");
    for (const section of MANUAL_SECTIONS) {
      if (section === "index") continue;
      expect(index).toContain(section);
    }
  });

  it("recognises exactly the real section names", () => {
    for (const section of MANUAL_SECTIONS) expect(isManualSection(section)).toBe(true);
    expect(isManualSection("passphrase")).toBe(false);
    expect(isManualSection("")).toBe(false);
  });

  it("keeps every section inside Chrome's output budget", () => {
    const s = begun("seed");
    for (const section of MANUAL_SECTIONS) {
      expect(manualSection(s, section).length).toBeLessThanOrEqual(1500);
    }
  });
});

describe("the pages the chambers need", () => {
  it("names the airlock's target glyph, which is the whole chamber", () => {
    expect(manualSection(begun("seed"), "airlock")).toContain("SPIRAL");
  });

  it("renders the stroke table from the glyph pool rather than transcribing it", () => {
    const table = manualSection(begun("seed"), "glyph_table");
    for (const id of GLYPH_IDS) {
      expect(table).toContain(GLYPHS[id].canonicalName);
      expect(table).toMatch(
        new RegExp(`${GLYPHS[id].canonicalName}\\s+${String(GLYPHS[id].strokes)}\\b`),
      );
    }
  });

  it("states the Signal Room's rule, both halves of it", () => {
    const page = manualSection(begun("seed"), "signal_room");
    expect(page).toContain("ascending order");
    expect(page).toContain("prime");
  });

  it("warns that speaking a wrong passphrase is irreversible", () => {
    const page = manualSection(begun("seed"), "concord_lock");
    expect(page).toContain("WARNING");
    expect(page).toContain("get_lock_state");
  });
});

describe("the vandalised page", () => {
  it("appends the other hand's paragraph on a vandalised seed", () => {
    const page = manualSection(begun(seedWhere(true)), "signal_room");
    expect(page).toContain(VANDALISM_TEXT);
  });

  it("appends nothing on a clean seed, so reflexive distrust also costs", () => {
    const page = manualSection(begun(seedWhere(false)), "signal_room");
    expect(page).not.toContain(VANDALISM_TEXT);
  });

  it("reads the same before the room is entered as it does inside it", () => {
    // The load-bearing property: an agent that reads ahead during the Airlock
    // and reads again in the Signal Room sees one page, not two. Before entry
    // the flag is derived from the seed; after it, read off generated state.
    for (const vandalised of [true, false]) {
      const seed = seedWhere(vandalised);
      const before = begun(seed);
      const inside = reduce(
        before,
        { type: "pull_lever", leverId: airlock.correctLever(before.airlock!.params) },
        NOW,
      ).session;
      expect(inside.signalRoom).not.toBeNull();
      expect(manualSection(before, "signal_room")).toBe(manualSection(inside, "signal_room"));
    }
  });
});
