import type { Phase } from "@semaphore/protocol";
import { ActionSemaphore } from "./semaphore.js";

export interface Env {
  SESSIONS: DurableObjectNamespace;
  LOGS: R2Bucket;
}

/**
 * One session's authoritative truth (doc 04 §2).
 *
 * Scaffold only: it holds a seed and a phase and proves the wiring. The
 * WorldState, the channel-tagged projections, the state machine and the
 * server-authoritative timer arrive in Phase 1.1 — the important thing settled
 * here is that all of it lives behind this boundary, where the browser cannot
 * reach around it.
 */
export class Session {
  readonly #semaphore = new ActionSemaphore();
  readonly #storage: DurableObjectStorage;
  #seed = "";
  #phase: Phase = "LOBBY";

  constructor(state: DurableObjectState, _env: Env) {
    this.#storage = state.storage;
    state.blockConcurrencyWhile(async () => {
      // The session id doubles as the PRNG seed (doc 04 §7), so it must survive
      // eviction — a re-seeded session would silently change its puzzle.
      this.#seed = (await this.#storage.get<string>("seed")) ?? crypto.randomUUID();
      await this.#storage.put("seed", this.#seed);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.endsWith("/state")) {
      return Response.json({ seed: this.#seed, phase: this.#phase, busy: this.#semaphore.busy });
    }

    return new Response("Not found", { status: 404 });
  }
}
