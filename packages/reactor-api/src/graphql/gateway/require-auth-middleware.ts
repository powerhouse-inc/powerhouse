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
 */
export function createRequireAuthFetchMiddleware(): RequireAuthFetchMiddleware {
  return (next: FetchHandler): FetchHandler =>
    async (request: globalThis.Request): Promise<globalThis.Response> => {
      if (request.method === "OPTIONS") {
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
