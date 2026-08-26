import { describe, expect, it } from "vitest";
import { GameError } from "@semaphore/protocol";
import { ActionSemaphore } from "./semaphore.js";

const defer = () => {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
};

describe("ActionSemaphore", () => {
  it("rejects a second action while the first is in flight", async () => {
    const sem = new ActionSemaphore();
    const gate = defer();

    const first = sem.act(async () => {
      await gate.promise;
      return "done";
    });

    await expect(sem.act(async () => "sneaked in")).rejects.toThrow(GameError);
    gate.release();
    await expect(first).resolves.toBe("done");
  });

  it("reports E_BUSY with a message the agent can act on", async () => {
    const sem = new ActionSemaphore();
    const gate = defer();
    const first = sem.act(() => gate.promise);

    await expect(sem.act(async () => 1)).rejects.toMatchObject({
      code: "E_BUSY",
      message: expect.stringMatching(/previous action/i),
    });

    gate.release();
    await first;
  });

  it("releases the permit after a throwing action", async () => {
    const sem = new ActionSemaphore();
    await expect(
      sem.act(() => {
        throw new Error("chamber exploded");
      }),
    ).rejects.toThrow("chamber exploded");

    expect(sem.busy).toBe(false);
    await expect(sem.act(async () => "recovered")).resolves.toBe("recovered");
  });

  it("serialises sequential actions without complaint", async () => {
    const sem = new ActionSemaphore();
    const order: number[] = [];
    for (const n of [1, 2, 3]) {
      await sem.act(async () => void order.push(n));
    }
    expect(order).toEqual([1, 2, 3]);
  });
});
