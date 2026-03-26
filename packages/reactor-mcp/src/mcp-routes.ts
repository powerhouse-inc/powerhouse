import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
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
    ) => void,
  ): void;
}
import { logger } from "./logger.js";
import { createServer } from "./server.js";

export interface SetupMcpServerOptions {
  client: IReactorClient;
  syncManager?: ISyncManager;
}

const METHOD_NOT_ALLOWED = JSON.stringify({
  jsonrpc: "2.0",
  error: { code: -32000, message: "Method not allowed." },
  id: null,
});

/** @internal Injected in tests to avoid relying on module-level mocking of the SDK. */
type TransportCtor = new (opts: {
  sessionIdGenerator: undefined;
}) => InstanceType<typeof StreamableHTTPServerTransport>;

export async function setupMcpServer(
  options: SetupMcpServerOptions,
  httpAdapter: NodeRouteAdapter,
  // Allow tests to inject a mock transport constructor instead of using vi.mock()
  // on the SDK deep-import path, which is unreliable across different environments.
  TransportClass: TransportCtor = StreamableHTTPServerTransport,
): Promise<McpServer> {
  const server = await createServer(options);

  httpAdapter.mountNodeRoute(
    "POST",
    "/mcp",
    (req: IncomingMessage, res: ServerResponse, body?: unknown) => {
      // In stateless mode, create a new instance of transport and server for each
      // request to ensure complete isolation. A single instance would cause request
      // ID collisions when multiple clients connect concurrently.
      try {
        const transport = new TransportClass({
          sessionIdGenerator: undefined,
        });
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
        void server.connect(transport);
        void transport.handleRequest(req, res, body);
      } catch (error) {
        logger.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" }).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32603, message: "Internal server error" },
              id: null,
            }),
          );
        }
      }
    },
  );

  // SSE notifications not supported in stateless mode
  httpAdapter.mountNodeRoute(
    "GET",
    "/mcp",
    (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(405).end(METHOD_NOT_ALLOWED);
    },
  );

  // Session termination not needed in stateless mode
  httpAdapter.mountNodeRoute(
    "DELETE",
    "/mcp",
    (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(405).end(METHOD_NOT_ALLOWED);
    },
  );

  return server;
}
