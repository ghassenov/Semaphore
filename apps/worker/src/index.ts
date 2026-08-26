import { Session, type Env } from "./Session.js";

export { Session };

/** Router. Everything stateful lives in the Durable Object (doc 04 §2). */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/session\/([^/]+)(\/.*)?$/.exec(url.pathname);

    if (!match) return new Response("Not found", { status: 404 });

    const id = env.SESSIONS.idFromName(match[1] as string);
    return env.SESSIONS.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;
