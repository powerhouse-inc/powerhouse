import type { AuthContext, AuthService } from "@powerhousedao/reactor-api";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Verified actor context for authenticated attachment handlers. The user comes
 * exclusively from bearer verification: when auth is disabled (OPEN mode)
 * `user` is undefined and `authEnabled` is false, and handlers must treat the
 * caller as anonymous. Caller-supplied identity headers are never consulted.
 */
export type AttachmentActorContext = {
  user: AuthContext["user"];
  authEnabled: boolean;
};

const ANONYMOUS_ACTOR: AttachmentActorContext = {
  user: undefined,
  authEnabled: false,
};

export type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body?: unknown,
  actor?: AttachmentActorContext,
) => Promise<void> | void;

export type RequireAuthOptions = {
  /**
   * Let requests without a bearer identity through as anonymous actors
   * instead of answering 401, so the handler's own document authorization
   * decides. A bearer that IS supplied must still verify — an invalid token
   * is rejected, never downgraded to anonymous.
   */
  allowAnonymous?: boolean;
  /**
   * Whether the deployment has said it accepts no anonymous callers at all
   * (`REQUIRE_AUTHENTICATED_CALLER`). It overrides `allowAnonymous`, because
   * the two answer different questions: `allowAnonymous` says "this handler
   * authorizes per document, so it does not need identity to decide", while
   * this says "this server does not serve callers it cannot name". A route can
   * be happy to decide without identity and still not be allowed to.
   *
   * These routes are mounted straight on the HTTP adapter, so the fetch chain's
   * own require-auth middleware never sees them — this is how the same floor
   * reaches them.
   */
  requireAuthenticatedCaller?: boolean;
};

/**
 * Wrap a Node-style handler so that, when `authService` is provided and auth is
 * enabled, the request must carry a verifiable Bearer token. The handler always
 * receives an actor context: the verified bearer user when auth is enabled, or
 * the anonymous context when it is disabled. With `allowAnonymous`, a missing
 * bearer yields an anonymous actor with `authEnabled: true` instead of a 401 —
 * unless `requireAuthenticatedCaller` says the deployment refuses anonymous
 * callers outright, which overrides it.
 *
 * With no `authService` there is no bearer to read and every caller is
 * anonymous, so nothing is refused here. That combination cannot carry the
 * floor: `assertRequireAuthenticatedCallerAllowed` refuses to boot with
 * `REQUIRE_AUTHENTICATED_CALLER` set and no identity resolution, and identity
 * resolution is what builds the service.
 */
export function requireAuth(
  authService: AuthService | undefined,
  handler: NodeHandler,
  options?: RequireAuthOptions,
): NodeHandler {
  if (!authService) {
    return (req, res, body) => handler(req, res, body, ANONYMOUS_ACTOR);
  }

  return async (req, res, body) => {
    let result;
    try {
      result = await authService.verifyBearer(req.headers.authorization);
    } catch {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal authentication error" }));
      return;
    }

    if (result instanceof Response) {
      const body = await result.text();
      res.statusCode = result.status;
      const contentType = result.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      res.end(body);
      return;
    }

    if (!result.user) {
      const refuse =
        options?.requireAuthenticatedCaller === true ||
        (result.auth_enabled && !options?.allowAnonymous);
      if (refuse) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Authentication required" }));
        return;
      }
    }

    await handler(req, res, body, {
      user: result.user,
      authEnabled: result.auth_enabled,
    });
  };
}
