import type { AuthService } from "@powerhousedao/reactor-api";
import type { IncomingMessage, ServerResponse } from "node:http";

export type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void> | void;

/**
 * Wrap a Node-style handler so that, when `authService` is provided and auth is
 * enabled, the request must carry a verifiable Bearer token. AuthService skips
 * token verification for GET/OPTIONS, so we synthesize the verification call
 * with method=POST to force the verify path on every request.
 */
export function requireAuth(
  authService: AuthService | undefined,
  handler: NodeHandler,
): NodeHandler {
  if (!authService) return handler;

  return async (req, res) => {
    const authorization = req.headers.authorization ?? "";
    const url = `http://internal${req.url ?? "/"}`;
    const synthetic = new Request(url, {
      method: "POST",
      headers: authorization ? { authorization } : {},
    });

    const result = await authService.authenticateRequest(synthetic);

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

    await handler(req, res);
  };
}
