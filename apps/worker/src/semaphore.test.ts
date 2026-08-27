import { describe, expect, it } from "vitest";
import { GameError } from "@semaphore/protocol";
import { ActionSemaphore } from "./semaphore.js";

/** A promise plus the function that resolves it, for controlling interleaving. */
const defer = () => {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
};

describe("ActionSemaphore", () => {
  it("rejects a second action while the first is in flight", async () => {
    const sem = new ActionSemaphore();
    const gate = defer();

    const first = sem.act("first", async () => {
      await gate.promise;
      return "done";
    });

    await expect(sem.act("second", async () => "sneaked in")).rejects.toThrow(GameError);
    gate.release();
    await expect(first).resolves.toBe("done");
  });

  it("names the action currently running in the E_BUSY message, not the rejected one", () => {
    // "KEEPER is still turning dial 2", never "KEEPER is still X" for
    // whatever the second, rejected caller happened to ask for.
    return (async () => {
      const sem = new ActionSemaphore();
      const gate = defer();
      const first = sem.act("turning dial 2", () => gate.promise);

      await expect(sem.act("aligning bolt 3", async () => 1)).rejects.toMatchObject({
        code: "E_BUSY",
        message: expect.stringContaining("turning dial 2"),
      });

      gate.release();
      await first;
    })();
  });

  it("releases the permit after a throwing action", async () => {
    const sem = new ActionSemaphore();
    await expect(
      sem.act("exploding", () => {
        throw new Error("chamber exploded");
      }),
    ).rejects.toThrow("chamber exploded");

    expect(sem.busy).toBe(false);
    await expect(sem.act("recovered", async () => "recovered")).resolves.toBe("recovered");
  });

  it("serialises sequential actions without complaint", async () => {
    const sem = new ActionSemaphore();
    const order: number[] = [];
    for (const n of [1, 2, 3]) {
      await sem.act(`step ${n}`, async () => void order.push(n));
    }
    expect(order).toEqual([1, 2, 3]);
  });

  it("starts with no observed latency", () => {
    expect(new ActionSemaphore().latencies).toEqual([]);
  });

  it("records one latency per completed action, in completion order", async () => {
    const sem = new ActionSemaphore();
    await sem.act("a", async () => {});
    await sem.act("b", async () => {});
    await sem.act("c", async () => {});
    expect(sem.latencies).toHaveLength(3);
  });

  // A tool call that errors still took real wall-clock time, and that time is
  // a genuine measurement of the agent's response speed, not noise to filter.
  it("records latency even when the action throws", async () => {
    const sem = new ActionSemaphore();
    await expect(
      sem.act("fails", () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow();
    expect(sem.latencies).toHaveLength(1);
  });

  it("does not record a latency for a call rejected by E_BUSY", async () => {
    // The rejected caller never ran, so it has no round trip to report.
    const sem = new ActionSemaphore();
    const gate = defer();
    const first = sem.act("first", () => gate.promise);
    await expect(sem.act("second", async () => {})).rejects.toThrow(GameError);
    expect(sem.latencies).toHaveLength(0);
    gate.release();
    await first;
    expect(sem.latencies).toHaveLength(1);
  });

  it("reports non-negative latency values", async () => {
    const sem = new ActionSemaphore();
    await sem.act("quick", async () => {});
    expect(sem.latencies[0]).toBeGreaterThanOrEqual(0);
  });
});
