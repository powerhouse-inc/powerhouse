import { getAuthContext } from "./auth-middleware.js";
import type { FetchHandler } from "./types.js";

export type RequireAuthFetchMiddleware = (
  handler: FetchHandler,
) => FetchHandler;

/**
 * Returns a fetch middleware that rejects anonymous callers with a 401.
 *
 * This is the enforcement half of the resolve-and-don't-enforce split set up
 * by `RESOLVE_CALLER_IDENTITY`: the auth middleware must run before this
 * one — it verifies the bearer (an invalid token is still a 401 from
 * there) and records the resolved caller on the request. This middleware
 * then refuses the request when no caller was resolved, so under `OPEN`
 * (or `AUTH_ENABLED` with identity resolution) the whole generic surface —
 * document CRUD, sync, every custom subgraph — is reachable only by
 * authenticated callers, without locking out non-admins the way
 * `ADMIN_ONLY` does.
 *
 * It composes in one place in the fetch chain, so it covers every mounted
 * subgraph, the supergraph, and the SSE handler alike.
 *
 * OPTIONS is let through: a CORS preflight never carries a bearer, and
 * `AuthService.authenticateRequest` already answers it with an anonymous
 * context — refusing it would break every cross-origin client with a 401.
 *
 * Fails closed: a request that reaches this middleware without a resolved
 * context has no caller, and is rejected. The server never composes this
 * middleware without the auth middleware in the chain (see
 * `assertRequireAuthenticatedCallerAllowed` in `server.ts`).
 *
 * `exemptPaths` names the mounted paths that stay reachable anonymously — a
 * deployment whose product has a flow that runs before sign-in, such as
 * previewing an invitation from its code, needs somewhere to serve it from.
 * Each entry is a hole in the floor, so the match is deliberately the
 * narrowest one that works: the request's pathname, compared in full. A
 * prefix rule would exempt `/graphql/public-admin` along with
 * `/graphql/public`, and an exempt surface nobody can enumerate by reading
 * the configuration is not one anybody audits.
 */
export function createRequireAuthFetchMiddleware(
  exemptPaths: readonly string[] = [],
): RequireAuthFetchMiddleware {
  const exempt = new Set(exemptPaths.map(normalizeExemptPath));
  return (next: FetchHandler): FetchHandler =>
    async (request: globalThis.Request): Promise<globalThis.Response> => {
      if (request.method === "OPTIONS") {
        return next(request);
      }
      if (
        exempt.size > 0 &&
        exempt.has(normalizeExemptPath(new URL(request.url).pathname))
      ) {
        return next(request);
      }
      if (getAuthContext(request)?.user === undefined) {
        return new globalThis.Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401 },
        );
      }
      return next(request);
    };
}

/**
 * The form both sides of the comparison are reduced to: surrounding whitespace
 * gone, and one trailing slash gone, so `/graphql/public/` and
 * `/graphql/public` are the same path. A client that appends a slash is not
 * asking for a different route, and a configuration that carries one is not
 * asking for a different rule.
 *
 * Deliberately NOT normalized: case, percent-encoding, and a missing leading
 * slash. The first two would let two spellings of one path diverge from how
 * the router itself matches; the third is a configuration error, and
 * `assertRequireAuthenticatedCallerAllowed` refuses to boot on it rather than
 * leaving an exemption that silently never applies.
 */
function normalizeExemptPath(path: string): string {
  const trimmed = path.trim();
  return trimmed.length > 1 && trimmed.endsWith("/")
    ? trimmed.slice(0, -1)
    : trimmed;
}
