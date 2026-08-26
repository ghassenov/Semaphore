import { GameError } from "@semaphore/protocol";

/**
 * The action semaphore (doc 04 §5), n=1.
 *
 * Durable Objects are single-threaded per instance, but an in-flight `await`
 * still yields — so the permit is real, not decorative. Every mutating tool
 * routes through `act()`, which buys us serialised state transitions and the
 * anti-brute-force pressure of doc 02 §6 in one primitive.
 *
 * Contention rejects rather than queues: an agent firing twenty parallel calls
 * should be told it is doing something wrong, not quietly serialised.
 */
export class ActionSemaphore {
  #busy = false;

  get busy(): boolean {
    return this.#busy;
  }

  async act<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#busy) {
      throw new GameError("E_BUSY", "KEEPER is still completing the previous action.");
    }
    this.#busy = true;
    try {
      return await fn();
    } finally {
      this.#busy = false;
    }
  }
}
