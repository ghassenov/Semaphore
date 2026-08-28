/**
 * Cross-origin access to the session routes.
 *
 * The stack is deliberately split across origins twice over. The game is a
 * Pages project and the worker is a Worker, which are different hostnames in
 * production even though the Vite dev proxy hides that in development; and
 * `apps/archive` is a *third* origin by design, because the manual living
 * somewhere other than the control system is both the fiction and the rarest
 * part of the WebMCP spec anyone exercises (doc 03 section 7).
 *
 * So the worker has to answer browsers that are not on its own origin, and it
 * has to do that without becoming an open endpoint. The rule here is the
 * narrow one: reflect the request's `Origin` only when it appears in a
 * configured allowlist, and answer the preflight the archive's JSON `POST`
 * will trigger. No wildcard, and no origin written into a source file - the
 * list arrives as a `wrangler.toml` var, per the repo CLAUDE.md section 3.
 *
 * Credentials are never involved: a session is addressed by an opaque id in
 * the path, there are no cookies and no `Authorization` header anywhere in
 * this project, so `Access-Control-Allow-Credentials` is deliberately absent.
 */

/** Parse the configured allowlist. Comma-separated, blanks dropped. */
export function allowedOrigins(configured: string | undefined): readonly string[] {
  return (configured ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * The headers to add to a response for this request, which is empty for
 * anything the allowlist does not name.
 *
 * `Vary: Origin` is not optional: without it a cache that saw one allowed
 * origin's response would serve those headers to every other origin, which
 * turns a narrow allowlist into a wide one.
 */
export function corsHeaders(
  requestOrigin: string | null,
  allowed: readonly string[],
): Record<string, string> {
  if (!requestOrigin || !allowed.includes(requestOrigin)) return {};
  return {
    "access-control-allow-origin": requestOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

/**
 * The preflight answer, or null when this is not a preflight.
 *
 * A disallowed origin still gets a `204` here, just without the allow
 * headers, which is what makes the browser reject the real request. Answering
 * `403` instead would say the same thing in a way no fetch can read.
 */
export function preflight(request: Request, allowed: readonly string[]): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin"), allowed),
  });
}

/** Copy a response, adding the headers. Responses are immutable; this is the way. */
export function withCors(response: Response, headers: Record<string, string>): Response {
  if (Object.keys(headers).length === 0) return response;
  const merged = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) merged.set(key, value);
  // A `101` carries a `webSocket` the constructor cannot re-attach, and a
  // socket upgrade is same-origin by construction here, so it is passed
  // through untouched rather than rebuilt.
  if (response.status === 101) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}
