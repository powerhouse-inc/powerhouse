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
    ) => void | Promise<void>,
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

const INTERNAL_SERVER_ERROR = JSON.stringify({
  jsonrpc: "2.0",
  error: { code: -32603, message: "Internal server error" },
  id: null,
});

/** @internal Injected in tests to avoid relying on constructor mock semantics. */
type TransportFactory = (opts: {
  sessionIdGenerator: undefined;
}) => InstanceType<typeof StreamableHTTPServerTransport>;

export async function setupMcpServer(
  options: SetupMcpServerOptions,
  httpAdapter: NodeRouteAdapter,
  // Allow tests to inject a factory function instead of relying on `new vi.fn()`
  // constructor semantics, which differ between macOS and Linux environments.
  createTransport: TransportFactory = (opts) =>
    new StreamableHTTPServerTransport(opts),
): Promise<void> {
  httpAdapter.mountNodeRoute(
    "POST",
    "/mcp",
    async (req: IncomingMessage, res: ServerResponse, body?: unknown) => {
      // Stateless mode: every request owns its McpServer + transport so
      // concurrent or slow handlers cannot collide on a shared Protocol
      // instance (which throws "Already connected to a transport").
      try {
        const server = await createServer(options);
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
}
