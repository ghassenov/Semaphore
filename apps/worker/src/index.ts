import { Session, type Env } from "./Session.js";
import { allowedOrigins, corsHeaders, preflight, withCors } from "./cors.js";

export { Session };

/**
 * The router. Everything stateful lives in the Durable Object (doc 05
 * section 2); this file's only job is turning a URL into the right one, and
 * deciding whether a browser on another origin is allowed to hear the answer.
 *
 * `/session/:id/...` addresses one session by an opaque, server-generated id.
 * `idFromName` is what makes that id string double as the Durable Object's
 * identity and, inside `Session.ts`, its PRNG seed (doc 05 section 9) -
 * `state.id.name` there recovers exactly the string used here.
 *
 * CORS is applied here rather than inside `Session`, so that no route can
 * forget it and the Durable Object stays a thing that answers questions
 * rather than a thing that knows about origins. The allowlist is a
 * configuration var (`ALLOWED_ORIGINS`); empty means same-origin only, which
 * is the correct default for a local `wrangler dev` behind the Vite proxy.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowed = allowedOrigins(env.ALLOWED_ORIGINS);
    const headers = corsHeaders(request.headers.get("origin"), allowed);

    // Answered before routing: a preflight names the route it is asking
    // about in a header, not in a method the router could dispatch on.
    const options = preflight(request, allowed);
    if (options) return options;

    const url = new URL(request.url);
    const match = /^\/session\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!match) return withCors(new Response("Not found", { status: 404 }), headers);

    const sessionId = match[1] as string;
    const id = env.SESSIONS.idFromName(sessionId);
    return withCors(await env.SESSIONS.get(id).fetch(request), headers);
  },
} satisfies ExportedHandler<Env>;
