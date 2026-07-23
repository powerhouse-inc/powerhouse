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
};

/**
 * Wrap a Node-style handler so that, when `authService` is provided and auth is
 * enabled, the request must carry a verifiable Bearer token. The handler always
 * receives an actor context: the verified bearer user when auth is enabled, or
 * the anonymous context when it is disabled. With `allowAnonymous`, a missing
 * bearer yields an anonymous actor with `authEnabled: true` instead of a 401.
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

    if (result.auth_enabled && !result.user && !options?.allowAnonymous) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Authentication required" }));
      return;
    }

    await handler(req, res, body, {
      user: result.user,
      authEnabled: result.auth_enabled,
    });
  };
}
