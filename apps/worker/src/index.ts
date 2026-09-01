import { Session, type Env } from "./Session.js";
import { allowedOrigins, corsHeaders, preflight, withCors } from "./cors.js";
import { ghostForGate } from "./archive/index.js";
import { gunzipJsonl } from "./log.js";
import { projectReplay } from "./replay.js";

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

    // The one route with no session behind it.
    //
    // The gate screen and the landing screen both play a recorded session:
    // SPECTATE on demand, and attract mode when nobody has touched the page
    // (doc 08 phase 4). Neither has a session and the gate cannot start one -
    // it is the screen a browser without WebMCP gets - so this cannot address
    // a Durable Object. It does not need to: the ghost is a constant, and both
    // halves of it are pure projections of that one log.
    //
    // **This route carries both halves and the in-game Archive still does
    // not.** The gate draws them side by side, which is the whole thesis in
    // one picture: a room with a person in it, and a list of calls with a hole
    // where the room would be. In a live session that would be a catastrophe -
    // `pilotTrack` and `keeperEntries` are a matched pair and widening either
    // hands one party the other's half - so the Archive's CRT keeps getting
    // its track on the `PilotView` and nothing else changes. What makes this
    // safe is that nobody is playing: there is no session behind this route, no
    // pair to hand anything to, and the ghost's own seed was spent when the
    // fixture was authored. `index.test.ts` asserts both directions.
    //
    // Read-only, so it takes no semaphore and is not logged (D-019).
    if (url.pathname === "/ghost") {
      return withCors(
        Response.json(ghostForGate(), {
          // Immutable in the sense that matters: the fixture changes only when
          // somebody regenerates it and redeploys.
          headers: { "cache-control": "public, max-age=3600" },
        }),
        headers,
      );
    }

    // The replay viewer's source (doc 08 phase 7.2).
    //
    // Outside `/session/:id` because a finished session is no longer in a
    // Durable Object: it was flushed to D1 as one gzipped row when the machine
    // reached ESCAPED, and that row is the artifact the benchmark queries and
    // the ghosts are cut from. Read-only, and projected: `replay.ts` says at
    // length why the raw log may not leave the server even though the session
    // is over.
    const replay = /^\/replay\/([^/]+)$/.exec(url.pathname);
    if (replay) {
      return withCors(await replayResponse(env, replay[1] as string), headers);
    }

    const match = /^\/session\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!match) return withCors(new Response("Not found", { status: 404 }), headers);

    const sessionId = match[1] as string;
    const id = env.SESSIONS.idFromName(sessionId);
    return withCors(await env.SESSIONS.get(id).fetch(request), headers);
  },
} satisfies ExportedHandler<Env>;

/**
 * One finished session, read back out of D1 and projected.
 *
 * A missing row is a 404 with words rather than a bare status: the two ways to
 * get one are a mistyped link and a session that has not finished yet, and
 * those want different things from the reader.
 */
async function replayResponse(env: Env, sessionId: string): Promise<Response> {
  const row = await env.SESSIONS_DB.prepare(`SELECT log_gzip FROM sessions WHERE session_id = ?`)
    .bind(sessionId)
    // D1 returns a BLOB as an array of byte numbers. `gunzipJsonl` takes
    // that shape as well as the two it is more often assumed to be.
    .first<{ log_gzip: number[] }>();

  if (!row) {
    return Response.json(
      {
        error: "E_NO_REPLAY",
        message:
          "No finished session with that id. A session is written when it escapes, " +
          "so one still in progress or one that was abandoned has nothing to replay.",
      },
      { status: 404 },
    );
  }

  const replay = projectReplay(await gunzipJsonl(row.log_gzip));
  if (!replay) {
    return Response.json(
      { error: "E_NO_REPLAY", message: "That session's log has no start event." },
      { status: 404 },
    );
  }
  return Response.json(replay, { headers: { "cache-control": "public, max-age=600" } });
}
