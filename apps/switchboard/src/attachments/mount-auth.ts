import type { API } from "@powerhousedao/reactor-api";
import { requireAuth, type NodeHandler } from "./auth.js";

export type HttpMethod = "DELETE" | "GET" | "HEAD" | "POST" | "PUT";

/**
 * Mount a Node-style attachment route with `requireAuth` applied unconditionally.
 * When `api.authService` is undefined (auth disabled), `requireAuth` returns the
 * handler unchanged — that is the only way to opt out. To register a route
 * without auth wrapping you must call `api.httpAdapter.mountNodeRoute` directly.
 */
export function mountAuthenticatedNodeRoute(
  api: Pick<API, "httpAdapter" | "authService">,
  method: HttpMethod,
  path: string,
  handler: NodeHandler,
): void {
  api.httpAdapter.mountNodeRoute(
    method,
    path,
    requireAuth(api.authService, handler),
  );
}
