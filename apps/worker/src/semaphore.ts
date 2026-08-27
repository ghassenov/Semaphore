/**
 * The action semaphore (doc 05 section 5), n=1.
 *
 * Durable Objects are single-threaded per instance, but an in-flight `await`
 * still yields, so a second `fetch()` can begin running before the first has
 * committed its state. The permit here is what actually serialises a
 * read-modify-write cycle across that gap: without it, two concurrent tool
 * calls could each read the same pre-mutation state and one write would
 * silently overwrite the other's result.
 *
 * Every mutating tool routes through `act()`. It buys us serialised state
 * transitions and the anti-brute-force pressure of doc 02 section 8.
 *
 * Contention rejects rather than queues: an agent firing a call before the
 * previous one resolves should be told it is doing something wrong, not
 * quietly serialised, which is what `errors.busy`'s message says.
 *
 * **`latencies` here is server processing time, and it is not the sample
 * Chamber III's stamina window is sized from.** This class measures how long
 * the guarded function itself took to run, which for the synchronous reducer
 * in `reducer.ts` is microseconds. Useful for spotting a stuck or unusually
 * slow mutation; useless for measuring agent rhythm. That measurement is
 * `PersistedSession.observedLatencyMs`, the gap between one response and the
 * next request, computed in `reducer.ts` and consumed by `latency.ts`. D-010
 * records a version of this file where the two were conflated, and the
 * confusion it caused.
 */

import { errors } from "@semaphore/protocol";

export class ActionSemaphore {
  #busy = false;
  #currentLabel = "";
  #latenciesMs: number[] = [];

  get busy(): boolean {
    return this.#busy;
  }

  /** Round trips observed so far, in the order they completed. */
  get latencies(): readonly number[] {
    return this.#latenciesMs;
  }

  /**
   * Run `fn` under the single permit.
   *
   * `label` names the action currently in flight, for example "turning
   * dial 2", so a caller rejected while it runs sees "KEEPER is still turning
   * dial 2." The label describes what is running, not what the rejected
   * caller asked for, so it is captured before `fn` starts and read back from
   * the semaphore's own state on rejection rather than from the argument the
   * second caller passed.
   *
   * Latency is recorded whether `fn` succeeds or throws: an errored call
   * still took real wall-clock time, and that time is a genuine measurement
   * of the agent's response speed, not a defect to be excluded.
   */
  async act<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (this.#busy) throw errors.busy(this.#currentLabel);
    this.#busy = true;
    this.#currentLabel = label;
    const startedAt = Date.now();
    try {
      return await fn();
    } finally {
      this.#busy = false;
      this.#latenciesMs.push(Date.now() - startedAt);
    }
  }
}
