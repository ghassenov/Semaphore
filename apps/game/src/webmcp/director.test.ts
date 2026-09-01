/**
 * The three-tier lifecycle, proved.
 *
 * The claims under test are the ones the whole WebMCP Leverage argument rests
 * on: the front door closes behind you and cannot reopen, a chamber's tools
 * do not survive the chamber, `read_manual` does survive every one of them,
 * and the registry ends the session empty.
 *
 * The fake registry stands in for the browser (see `fake-registry.ts` for what
 * that trades away). What is being proved here is the director's logic, not
 * the specification's behaviour, which is `apps/spike`'s job.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAMBER_ORDER, DOCUMENT_TOOL_NAMES } from "@semaphore/protocol";
import type { Phase, PilotView } from "@semaphore/protocol";
import { SessionClient, type StateSummary } from "../net/sessionClient.js";
import { ToolDirector } from "./director.js";
import { installFakeRegistry, type FakeRegistry } from "./fake-registry.js";

let registry: FakeRegistry;

/** A response body in the shape the worker returns, carrying machine state. */
function body(phase: Phase, chamber: StateSummary["chamber"] = null, text = "ok") {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        content: [{ type: "text", text }],
        state: { phase, chamber, designation: "KEEPER", remainingMs: null },
      }),
  } as unknown as Response;
}

function state(
  phase: Phase,
  chamber: StateSummary["chamber"] = null,
  blackout = false,
): StateSummary {
  return { phase, chamber, designation: "KEEPER", remainingMs: null, blackout };
}

beforeEach(() => {
  registry = installFakeRegistry();
  vi.stubGlobal("performance", { now: () => 0 });
});

afterEach(() => {
  registry.uninstall();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function director(): { director: ToolDirector; client: SessionClient } {
  const client = new SessionClient("s_test");
  return { director: new ToolDirector(client), client };
}

describe("the entry tier", () => {
  it("registers begin_shift and nothing else", async () => {
    const { director: d } = director();
    await d.mountEntry();
    expect(registry.names()).toEqual(["begin_shift"]);
  });

  it("closes the front door behind you and never reopens it", async () => {
    const { director: d } = director();
    await d.mountEntry();
    await d.applyState(state("LOBBY"));
    expect(registry.names()).not.toContain("begin_shift");

    // Even if the server somehow reported ENTRY again, the entry controller
    // is spent: `mountEntry` sees a tier that is not "entry" and re-arms it,
    // so this test pins the one behaviour we do *not* want to regress into.
    await d.applyState(state("IN_CHAMBER", "airlock"));
    expect(registry.names()).not.toContain("begin_shift");
  });

  it("does not open the front door onto a session the server says has ended", async () => {
    // The page's real startup order, and it is a race the page loses without
    // this guard. `main.ts` opens the view socket and then awaits the renderer,
    // which fetches an engine over the network; a frame for an already-finished
    // session arrives during that await, drains the registry as the ending
    // requires, and only then does `mountEntry` run.
    //
    // Reloading a finished session therefore showed `begin_shift` on a shift
    // that had ended - the ending un-happening, on the one beat doc 08 says may
    // never be cut. `mountEntry` is the client guessing that a fresh page is a
    // fresh session, and D-021's rule is that a guess loses to an observation.
    const { director: d } = director();
    await d.applyState(state("ESCAPED"));
    expect(registry.names()).toEqual([]);

    await d.mountEntry();
    expect(registry.names()).toEqual([]);
  });

  it("still opens the front door when the server itself says ENTRY", async () => {
    // The guard must not swallow the ordinary case: a page that hears ENTRY
    // before it mounts anything is a page at the front door.
    const { director: d } = director();
    await d.applyState(state("ENTRY"));
    await d.mountEntry();
    expect(registry.names()).toEqual(["begin_shift"]);
  });

  it("opens the front door when nothing has been heard from the server yet", async () => {
    const { director: d } = director();
    await d.mountEntry();
    expect(registry.names()).toEqual(["begin_shift"]);
  });
});

describe("the session tier", () => {
  it("brings up KEEPER's constant faculties when the shift begins", async () => {
    const { director: d } = director();
    await d.mountEntry();
    await d.applyState(state("LOBBY"));
    expect(registry.names().sort()).toEqual([
      "describe_chamber",
      "get_status",
      "inspect",
      "read_manual",
      "read_note",
      "request_assistance",
    ]);
  });

  it("survives every chamber transition, registered exactly once", async () => {
    const { director: d } = director();
    await d.mountEntry();
    await d.applyState(state("LOBBY"));
    for (const chamber of ["airlock", "signal_room", "blind_panel", "concord_lock"] as const) {
      await d.applyState(state("IN_CHAMBER", chamber));
      expect(registry.names()).toContain("read_manual");
    }
    // Re-registering a surviving tool on every transition would be a bug the
    // manifest panel would render as a flicker, so count the registrations.
    expect(registry.registrations.filter((n) => n === "read_manual")).toHaveLength(1);
  });
});

describe("the chamber tier", () => {
  it("gives each chamber its own mechanisms and no other chamber's", async () => {
    const { director: d } = director();
    await d.mountEntry();
    await d.applyState(state("IN_CHAMBER", "airlock"));
    expect(registry.names()).toContain("pull_lever");

    await d.applyState(state("IN_CHAMBER", "signal_room"));
    expect(registry.names()).toContain("press_key");
    expect(registry.names()).not.toContain("pull_lever");

    await d.applyState(state("IN_CHAMBER", "blind_panel"));
    expect(registry.names()).toContain("rotate_dial");
    expect(registry.names()).not.toContain("press_key");
  });

  /*
   * The Blackout (`apps/worker/src/blackout.ts`), from the registry's side.
   *
   * This is the only `toolchange` in the game that fires *inside* a room
   * rather than at its boundary, and it is the reason `sameTier` compares the
   * lamps as well as the chamber. The tool leaves rather than staying and
   * refusing: a tool that is present and always fails teaches an agent to keep
   * trying, and a tool that is gone tells it the room changed.
   */
  it("takes rotate_dial off KEEPER when the lamps fail, and gives it back", async () => {
    const { director: d } = director();
    await d.mountEntry();
    await d.applyState(state("IN_CHAMBER", "blind_panel"));
    expect(registry.names()).toContain("rotate_dial");

    await d.applyState(state("IN_CHAMBER", "blind_panel", true));
    expect(registry.names()).not.toContain("rotate_dial");
    // KEEPER keeps everything it perceives with. It has lost a hand, not a
    // sense, and `describe_chamber` is what tells it why.
    expect(registry.names()).toContain("describe_chamber");
    expect(registry.names()).toContain("get_status");

    await d.applyState(state("IN_CHAMBER", "blind_panel", false));
    expect(registry.names()).toContain("rotate_dial");
  });

  it("does not tear the room down when nothing but the lamps stayed the same", async () => {
    // The mirror of the test above: a repeated state must still register
    // nothing, or the registry churns on every frame.
    const { director: d } = director();
    await d.mountEntry();
    await d.applyState(state("IN_CHAMBER", "blind_panel", true));
    const before = registry.names();
    await d.applyState(state("IN_CHAMBER", "blind_panel", true));
    expect(registry.names()).toEqual(before);
  });

  it("gives the Archive its one read tool and no chamber mechanism", async () => {
    const { director: d } = director();
    await d.mountEntry();
    await d.applyState(state("IN_CHAMBER", "blind_panel"));
    await d.applyState(state("ARCHIVE", "blind_panel"));
    expect(registry.names()).toContain("read_station_log");
    expect(registry.names()).not.toContain("rotate_dial");
    // leave_archive is PILOT's decision, so it is not on the registry at all.
    expect(registry.names()).not.toContain("leave_archive");
  });

  it("takes the mechanisms away on a deadlock, because the room cannot answer", async () => {
    const { director: d } = director();
    await d.mountEntry();
    await d.applyState(state("IN_CHAMBER", "signal_room"));
    await d.applyState(state("DEADLOCK", "signal_room"));
    expect(registry.names()).not.toContain("press_key");
    expect(registry.names()).toContain("get_status");

    // And gives them back when PILOT resets it.
    await d.applyState(state("IN_CHAMBER", "signal_room"));
    expect(registry.names()).toContain("press_key");
  });

  it("holds what it has through TRANSITIONING, which carries no tools", async () => {
    const { director: d } = director();
    await d.mountEntry();
    await d.applyState(state("IN_CHAMBER", "airlock"));
    await d.applyState(state("TRANSITIONING", "airlock"));
    expect(registry.names()).toContain("pull_lever");
  });
});

describe("the ending", () => {
  it("burns everything off and leaves exactly one tool at the finale", async () => {
    const { director: d } = director();
    await d.mountEntry();
    await d.applyState(state("IN_CHAMBER", "concord_lock"));
    await d.applyState(state("FINALE"));
    expect(registry.names()).toEqual(["open_the_door"]);
  });

  it("drains the registry to empty, which is the last toolchange", async () => {
    const { director: d } = director();
    const changes: number[] = [];
    registry.addEventListener("toolchange", () => {
      void registry.getTools().then((tools) => changes.push(tools.length));
    });

    await d.mountEntry();
    await d.applyState(state("IN_CHAMBER", "concord_lock"));
    await d.applyState(state("FINALE"));
    await d.applyState(state("ESCAPED"));

    expect(registry.names()).toEqual([]);
    // The event fired, and the registry really was empty when it did.
    await Promise.resolve();
    expect(changes.at(-1)).toBe(0);
  });
});

describe("instrumentation", () => {
  it("returns the worker's text in the spec's envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(body("LOBBY", null, "SHIFT BRIEFING"));
    const { director: d } = director();
    await d.mountEntry();
    expect(await registry.call("begin_shift", { designation: "KEEPER" })).toBe("SHIFT BRIEFING");
  });

  it("moves the registry from the state the response carried, with no extra call", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(body("IN_CHAMBER", "airlock", "The door is shut."));
    const { director: d } = director();
    await d.mountEntry();

    await registry.call("begin_shift", { designation: "KEEPER" });
    // Let the queued tier change settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(registry.names()).toContain("pull_lever");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fires onRegistryMoved once on a genuine tier change and not on a repeat", async () => {
    // The substitute signal for a host that never fires `toolchange`
    // (D-085). It has to fire after `#register`/abort has resolved for the
    // tier that changed, and only then, or the fix it replaced regresses:
    // reading the registry before the transition finished, and refreshing on
    // every response instead of only when the registry actually moved
    // (D-086).
    vi.spyOn(globalThis, "fetch").mockResolvedValue(body("IN_CHAMBER", "airlock"));
    const moved: number[] = [];
    const client = new SessionClient("s_test");
    const d = new ToolDirector(client, { onRegistryMoved: () => moved.push(moved.length) });
    await d.mountEntry();
    expect(moved).toEqual([]);

    await registry.call("begin_shift", { designation: "KEEPER" });
    // Let the queued tier change settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(moved).toEqual([0]);

    // The same chamber reported again is not a tier change.
    await d.applyState(state("IN_CHAMBER", "airlock"));
    expect(moved).toEqual([0]);
  });

  it("reports every call to the page, with a duration", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(body("LOBBY"));
    const calls: string[] = [];
    const client = new SessionClient("s_test");
    const d = new ToolDirector(client, {
      onCall: (call) => calls.push(`${call.tool}:${call.outcome}`),
    });
    await d.mountEntry();
    await registry.call("begin_shift", { designation: "KEEPER" });
    expect(calls).toEqual(["begin_shift:ok"]);
  });

  it("announces a call before it runs, so the visor lights while it is in flight", async () => {
    // KEEPER's visor is the human's only cue that their partner is doing
    // something. A hook that fired on completion could only ever light it
    // after the work was over, which is the one moment it says nothing.
    const order: string[] = [];
    let release: (() => void) | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise((resolve) => {
          order.push("fetch");
          release = () => {
            resolve(body("LOBBY"));
          };
        }),
    );

    const client = new SessionClient("s_test");
    const d = new ToolDirector(client, {
      onCallStart: (tool) => order.push(`start:${tool}`),
      onCall: (call) => order.push(`done:${call.tool}`),
    });
    await d.mountEntry();

    const pending = registry.call("begin_shift", { designation: "KEEPER" });
    expect(order).toEqual(["start:begin_shift", "fetch"]);
    release?.();
    await pending;
    expect(order).toEqual(["start:begin_shift", "fetch", "done:begin_shift"]);
  });

  it("takes machine state from a pushed frame, not only from a response", async () => {
    // A chamber whose timer runs out with nobody calling is deadlocked by the
    // Durable Object's alarm (D-018): a frame arrives on the socket and there
    // is no response anywhere. `PilotView` is a structural superset of
    // `StateSummary`, so the same `applyState` handles both channels, and
    // without that the registry keeps `pull_lever` on a dead room.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(body("IN_CHAMBER", "airlock"));
    const { director: d } = director();
    await d.mountEntry();
    await d.applyState(state("IN_CHAMBER", "airlock"));
    expect(registry.names()).toContain("pull_lever");

    // A `PilotView`, not a `StateSummary`: this is the socket's own frame, and
    // it reaches `applyState` because the view is a structural superset.
    const frame: PilotView = {
      phase: "DEADLOCK",
      chamber: "airlock",
      designation: "KEEPER",
      remainingMs: 0,
      retries: 0,
      ghost: null,
      assist: null,
      blackout: false,
      objective: null,
      progress: null,
      seq: 0,
      facts: {},
      notes: [],
      mode: "full",
    };
    await d.applyState(frame);
    expect(registry.names()).not.toContain("pull_lever");
    expect(registry.names()).toContain("get_status");
  });

  it("hands a failed call text to act on rather than a rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));
    const { director: d } = director();
    await d.mountEntry();
    const text = await registry.call("begin_shift", { designation: "KEEPER" });
    expect(text).toContain("try the call again");
  });

  // Chrome 151 calls `execute` with one argument and no signal (doc 11 §2,
  // D-024), so this drives the branch by passing a signal directly rather
  // than pretending a browser would. It guards the plumbing, not a behaviour
  // any tested browser exhibits today.
  it("re-throws an abort and reports it as a cancellation, when a signal is given", async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    const calls: string[] = [];
    const client = new SessionClient("s_test");
    const d = new ToolDirector(client, { onCall: (call) => calls.push(call.outcome) });
    await d.mountEntry();

    const pending = registry.call("begin_shift", { designation: "KEEPER" }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(DOMException);
    expect(calls).toEqual(["cancelled"]);
  });
});

/**
 * Delegation to the archive origin (doc 03 section 7).
 *
 * The claim being defended is that moving `read_manual` and
 * `read_station_log` to a second origin changes **where** they are registered
 * and nothing about **when**. The tier tables stay the one place that says
 * how long a tool lives, and the director still reads that from the server's
 * machine state. So each test here has a same-origin twin above it, and the
 * two should agree on lifetime.
 */
describe("cross-origin delegation", () => {
  /** A director with both document tools handed to another origin. */
  function delegating(): { director: ToolDirector; sent: string[][] } {
    const sent: string[][] = [];
    const client = new SessionClient("s_test");
    return {
      director: new ToolDirector(client, {
        delegated: DOCUMENT_TOOL_NAMES,
        onDelegate: (tools) => sent.push([...tools]),
      }),
      sent,
    };
  }

  /** The most recent set asked of the other origin. */
  const latest = (sent: string[][]): string[] => sent[sent.length - 1] ?? [];

  it("does not register a delegated tool on this page", async () => {
    const { director: d } = delegating();
    await d.applyState(state("LOBBY"));
    expect(registry.names()).toContain("get_status");
    expect(registry.names()).not.toContain("read_manual");
  });

  it("asks the other origin for it instead, at the same moment", async () => {
    const { director: d, sent } = delegating();
    await d.mountEntry();
    expect(latest(sent)).toEqual([]);
    await d.applyState(state("LOBBY"));
    expect(latest(sent)).toEqual(["read_manual"]);
  });

  it("adds read_station_log for the Archive beat and takes it away after", async () => {
    const { director: d, sent } = delegating();
    await d.applyState(state("LOBBY"));
    await d.applyState(state("ARCHIVE"));
    expect(latest(sent)).toEqual(["read_manual", "read_station_log"]);

    await d.applyState(state("IN_CHAMBER", "concord_lock"));
    expect(latest(sent)).toEqual(["read_manual"]);
  });

  it("keeps read_manual across every chamber transition, as the session tier does", async () => {
    const { director: d, sent } = delegating();
    await d.applyState(state("LOBBY"));
    for (const chamber of CHAMBER_ORDER) await d.applyState(state("IN_CHAMBER", chamber));
    expect(latest(sent)).toEqual(["read_manual"]);
    // Never dropped and re-added along the way: a manual that flickered out
    // at each door would be the registry lying about KEEPER's faculties.
    expect(sent.every((set) => set.includes("read_manual") || set.length === 0)).toBe(true);
  });

  it("takes everything back at the finale, leaving one tool in the whole game", async () => {
    const { director: d, sent } = delegating();
    await d.applyState(state("LOBBY"));
    await d.applyState(state("FINALE"));
    expect(latest(sent)).toEqual([]);
    expect(registry.names()).toEqual(["open_the_door"]);
  });

  it("drains both origins to empty at the end, which is the last beat", async () => {
    const { director: d, sent } = delegating();
    await d.applyState(state("LOBBY"));
    await d.applyState(state("ARCHIVE"));
    await d.applyState(state("ESCAPED"));
    expect(latest(sent)).toEqual([]);
    expect(registry.names()).toEqual([]);
  });

  it("registers both document tools here when nothing is delegated", async () => {
    const { director: d } = director();
    await d.applyState(state("ARCHIVE"));
    expect(registry.names()).toContain("read_manual");
    expect(registry.names()).toContain("read_station_log");
  });
});
