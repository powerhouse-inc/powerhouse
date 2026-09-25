import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Minimal interface for an HTTP adapter that supports Node.js-style route handlers. */
interface NodeRouteAdapter {
  mountNodeRoute(
    method: "DELETE" | "GET" | "POST",
    path: string,
    handler: (
      req: IncomingMessage,
      res: ServerResponse,
      body?: unknown,
    ) => void | Promise<void>,
  ): void;
}
import { logger } from "./logger.js";
import { createServer } from "./server.js";

/**
 * An authorized request names the subject its tools read as. Anonymous is an
 * empty subject, never the host's signer.
 */
export type McpAuthorizationResult =
  | { authorized: true; subject: AuthSubject }
  | { authorized: false; status: number; message: string };

/**
 * Authorizes an incoming /mcp request before it reaches the MCP transport.
 * MCP tools run with unrestricted reactor access, so this is the only gate;
 * an open endpoint must opt in by returning `authorized: true`.
 */
export type McpRequestAuthorizer = (
  req: IncomingMessage,
) => Promise<McpAuthorizationResult>;

export interface SetupMcpServerOptions {
  client: IReactorClient;
  syncManager?: ISyncManager;
  authorizeRequest: McpRequestAuthorizer;
}

function jsonRpcError(message: string, code = -32000): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

const METHOD_NOT_ALLOWED = jsonRpcError("Method not allowed.");

const INTERNAL_SERVER_ERROR = jsonRpcError("Internal server error", -32603);

/** @internal Injected in tests to avoid relying on constructor mock semantics. */
type TransportFactory = (opts: {
  sessionIdGenerator: undefined;
}) => InstanceType<typeof StreamableHTTPServerTransport>;

type NodeRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body?: unknown,
) => void | Promise<void>;

type AuthorizedRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  subject: AuthSubject,
) => void | Promise<void>;

/**
 * Authorizes the request before running the handler. Failures respond with
 * the authorizer's status and a JSON-RPC error; an authorizer fault fails
 * closed with a 500.
 */
function withAuthorization(
  authorize: McpRequestAuthorizer,
  handler: AuthorizedRouteHandler,
): NodeRouteHandler {
  return async (req: IncomingMessage, res: ServerResponse, body?: unknown) => {
    let result: McpAuthorizationResult;
    try {
      result = await authorize(req);
    } catch (error) {
      logger.error("Error authorizing MCP request: @error", error);
      if (!res.headersSent) {
        res
          .writeHead(500, { "Content-Type": "application/json" })
          .end(INTERNAL_SERVER_ERROR);
      }
      return;
    }
    if (!result.authorized) {
      res
        .writeHead(result.status, { "Content-Type": "application/json" })
        .end(jsonRpcError(result.message));
      return;
    }
    await handler(req, res, body, result.subject);
  };
}

export function setupMcpServer(
  options: SetupMcpServerOptions,
  httpAdapter: NodeRouteAdapter,
  // Allow tests to inject a factory function instead of relying on `new vi.fn()`
  // constructor semantics, which differ between macOS and Linux environments.
  createTransport: TransportFactory = (opts) =>
    new StreamableHTTPServerTransport(opts),
): Promise<void> {
  const { authorizeRequest } = options;

  httpAdapter.mountNodeRoute(
    "POST",
    "/mcp",
    withAuthorization(authorizeRequest, async (req, res, body, subject) => {
      // Stateless mode: every request owns its McpServer + transport so
      // concurrent or slow handlers cannot collide on a shared Protocol
      // instance (which throws "Already connected to a transport").
      try {
        const server = await createServer({
          client: options.client,
          syncManager: options.syncManager,
          subject,
        });
        const transport = createTransport({ sessionIdGenerator: undefined });
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (error) {
        logger.error("Error handling MCP request: @error", error);
        if (!res.headersSent) {
          res
            .writeHead(500, { "Content-Type": "application/json" })
            .end(INTERNAL_SERVER_ERROR);
        }
      }
    }),
  );

  // GET/DELETE always answer 405 in stateless mode and reach no MCP tool, so
  // they are intentionally left unauthorized.
  httpAdapter.mountNodeRoute(
    "GET",
    "/mcp",
    (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(405).end(METHOD_NOT_ALLOWED);
    },
  );

  httpAdapter.mountNodeRoute(
    "DELETE",
    "/mcp",
    (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(405).end(METHOD_NOT_ALLOWED);
    },
  );
  return Promise.resolve();
}
