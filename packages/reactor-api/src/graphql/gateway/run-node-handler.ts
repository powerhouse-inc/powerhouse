import { childLogger } from "document-model";
import type http from "node:http";

const logger = childLogger(["reactor-api", "node-route"]);

export type NodeHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body?: unknown,
) => void | Promise<void>;

/**
 * Runs a node route handler without awaiting it. A throw or rejection is
 * logged and answered with a 500, or ends the socket if headers already went
 * out; it never reaches the process as an unhandled rejection.
 */
export function runNodeHandler(
  handler: NodeHandler,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: unknown,
): void {
  const fail = (err: unknown): void => {
    logger.error(
      "Node route handler failed for @method @url: @error",
      req.method,
      req.url,
      err,
    );
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Internal error" }));
  };

  let result: void | Promise<void>;
  try {
    result = handler(req, res, body);
  } catch (err) {
    fail(err);
    return;
  }
  if (result) {
    result.catch(fail);
  }
}
