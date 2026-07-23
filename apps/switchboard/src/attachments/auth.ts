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

/**
 * Wrap a Node-style handler so that, when `authService` is provided and auth is
 * enabled, the request must carry a verifiable Bearer token. The handler always
 * receives an actor context: the verified bearer user when auth is enabled, or
 * the anonymous context when it is disabled.
 */
export function requireAuth(
  authService: AuthService | undefined,
  handler: NodeHandler,
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

    if (result.auth_enabled && !result.user) {
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
