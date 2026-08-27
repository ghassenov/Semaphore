import { Session, type Env } from "./Session.js";

export { Session };

/**
 * The router. Everything stateful lives in the Durable Object (doc 05
 * section 2); this file's only job is turning a URL into the right one.
 *
 * `/session/:id/...` addresses one session by an opaque, server-generated id.
 * `idFromName` is what makes that id string double as the Durable Object's
 * identity and, inside `Session.ts`, its PRNG seed (doc 05 section 9) -
 * `state.id.name` there recovers exactly the string used here.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/session\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!match) return new Response("Not found", { status: 404 });

    const sessionId = match[1] as string;
    const id = env.SESSIONS.idFromName(sessionId);
    return env.SESSIONS.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;
