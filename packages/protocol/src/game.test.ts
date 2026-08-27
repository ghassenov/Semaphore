import { describe, expect, it } from "vitest";
import {
  CHAMBER_NAMES,
  CHAMBER_ORDER,
  CHAMBER_TIMER_MS,
  DIFFICULTIES,
  MODE_CHAMBERS,
  PHASES,
  nextChamber,
  timerFor,
  type ChamberId,
  type Difficulty,
} from "./game.js";

const DIFFICULTY_NAMES = Object.keys(DIFFICULTIES) as Difficulty[];

describe("chambers", () => {
  it("plays four chambers in a fixed order", () => {
    expect(CHAMBER_ORDER).toEqual(["airlock", "signal_room", "blind_panel", "concord_lock"]);
  });

  it("names and times every chamber", () => {
    for (const id of CHAMBER_ORDER) {
      expect(CHAMBER_NAMES[id]).toBeTruthy();
      expect(CHAMBER_TIMER_MS[id]).toBeGreaterThan(0);
    }
  });

  it("walks the order and terminates", () => {
    expect(nextChamber("airlock")).toBe("signal_room");
    expect(nextChamber("blind_panel")).toBe("concord_lock");
    expect(nextChamber("concord_lock")).toBeNull();
  });

  it("reaches every chamber by walking from the first", () => {
    const walked: ChamberId[] = [];
    let at: ChamberId | null = CHAMBER_ORDER[0] ?? null;
    while (at) {
      walked.push(at);
      at = nextChamber(at);
    }
    expect(walked).toEqual([...CHAMBER_ORDER]);
  });

  it("gives later chambers at least as long as earlier ones", () => {
    // The difficulty curve is in the kind of collaboration, not only in the
    // timer, but a chamber should never get less time than its predecessor.
    const times = CHAMBER_ORDER.map((id) => CHAMBER_TIMER_MS[id]);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("difficulty presets", () => {
  it("makes standard the neutral configuration the benchmark reports against", () => {
    expect(DIFFICULTIES.standard).toEqual({ timerScale: 1, driftScale: 1, penaltyScale: 1 });
  });

  it("turns the timer off in practice, and only in practice", () => {
    expect(DIFFICULTIES.practice.timerScale).toBeNull();
    for (const name of DIFFICULTY_NAMES.filter((d) => d !== "practice")) {
      expect(DIFFICULTIES[name].timerScale).not.toBeNull();
    }
  });

  it("orders the presets from most forgiving to least", () => {
    const timed: Difficulty[] = ["relaxed", "standard", "deadline"];
    const scales = timed.map((d) => DIFFICULTIES[d].timerScale as number);
    expect([...scales].sort((a, b) => b - a)).toEqual(scales);
  });

  it("scales chamber timers, and reports none when untimed", () => {
    expect(timerFor("signal_room", "standard")).toBe(300_000);
    expect(timerFor("signal_room", "relaxed")).toBe(450_000);
    expect(timerFor("signal_room", "deadline")).toBe(210_000);
    expect(timerFor("signal_room", "practice")).toBeNull();
  });

  it("returns a whole number of milliseconds for every pairing", () => {
    for (const chamber of CHAMBER_ORDER) {
      for (const difficulty of DIFFICULTY_NAMES) {
        const ms = timerFor(chamber, difficulty);
        if (ms !== null) expect(Number.isInteger(ms)).toBe(true);
      }
    }
  });

  it("removes drift and penalties in practice, so exploration is free", () => {
    expect(DIFFICULTIES.practice.driftScale).toBe(0);
    expect(DIFFICULTIES.practice.penaltyScale).toBe(0);
  });
});

describe("session modes", () => {
  it("plays every chamber in full", () => {
    expect(MODE_CHAMBERS.full).toEqual(CHAMBER_ORDER);
  });

  // BRIEF exists for a judge under review load, so it has to keep the two
  // beats that carry the submission: the trust puzzle and the finale.
  it("keeps the trust puzzle and the finale in brief", () => {
    expect(MODE_CHAMBERS.brief).toContain("signal_room");
    expect(MODE_CHAMBERS.brief).toContain("concord_lock");
  });

  it("drops only Chamber II in brief", () => {
    const dropped = CHAMBER_ORDER.filter((id) => !MODE_CHAMBERS.brief.includes(id));
    expect(dropped).toEqual(["blind_panel"]);
  });

  it("keeps every mode's chambers in the canonical order", () => {
    for (const chambers of Object.values(MODE_CHAMBERS)) {
      const canonical = CHAMBER_ORDER.filter((id) => chambers.includes(id));
      expect(chambers).toEqual(canonical);
    }
  });
});

describe("phases", () => {
  it("lists every phase exactly once", () => {
    expect(new Set(PHASES).size).toBe(PHASES.length);
  });

  // ENTRY is a real state, not a rendering detail: it is the landing page
  // where the registry holds exactly one tool, and begin_shift is the only
  // edge out of it. Collapsing it into LOBBY would erase the front door.
  it("separates ENTRY from LOBBY, so the front door is a state", () => {
    expect(PHASES).toContain("ENTRY");
    expect(PHASES).toContain("LOBBY");
  });

  it("has a phase for the Archive, which is not a chamber", () => {
    expect(PHASES).toContain("ARCHIVE");
    expect(CHAMBER_ORDER).not.toContain("archive" as ChamberId);
  });
});
