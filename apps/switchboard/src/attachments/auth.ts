import type { AuthService } from "@powerhousedao/reactor-api";
import type { IncomingMessage, ServerResponse } from "node:http";

export type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body?: unknown,
) => Promise<void> | void;

/**
 * Wrap a Node-style handler so that, when `authService` is provided and auth is
 * enabled, the request must carry a verifiable Bearer token.
 */
export function requireAuth(
  authService: AuthService | undefined,
  handler: NodeHandler,
): NodeHandler {
  if (!authService) return handler;

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

    if (body === undefined) {
      await handler(req, res);
    } else {
      await handler(req, res, body);
    }
  };
}
