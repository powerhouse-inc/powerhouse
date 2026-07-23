import type { API } from "@powerhousedao/reactor-api";
import {
  requireAuth,
  type NodeHandler,
  type RequireAuthOptions,
} from "./auth.js";

export type HttpMethod = "DELETE" | "GET" | "HEAD" | "POST" | "PUT";

/**
 * Mount a Node-style attachment route with `requireAuth` applied unconditionally.
 * When `api.authService` is undefined (auth disabled), the handler still runs
 * through `requireAuth` and receives the anonymous actor context — that is the
 * only way to opt out of bearer verification. To register a route without auth
 * wrapping you must call `api.httpAdapter.mountNodeRoute` directly.
 *
 * `allowAnonymous` is reserved for routes whose handlers make a per-document
 * authorization decision themselves; identity-only routes must not use it.
 */
export function mountAuthenticatedNodeRoute(
  api: Pick<API, "httpAdapter" | "authService">,
  method: HttpMethod,
  path: string,
  handler: NodeHandler,
  options?: RequireAuthOptions,
): void {
  api.httpAdapter.mountNodeRoute(
    method,
    path,
    requireAuth(api.authService, handler, options),
  );
}
