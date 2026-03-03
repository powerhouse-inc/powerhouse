import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import type { Express, Request, Response } from "express";
import { logger } from "./logger.js";
import { createServer } from "./server.js";

export interface SetupMcpServerOptions {
  client: IReactorClient;
  syncManager?: ISyncManager;
}

export async function setupMcpServer(
  options: SetupMcpServerOptions,
  app: Express,
): Promise<McpServer> {
  const server = await createServer(options);
  app.post("/mcp", (req: Request, res: Response) => {
    // In stateless mode, create a new instance of transport and server for each request
    // to ensure complete isolation. A single instance would cause request ID collisions
    // when multiple clients connect concurrently.
    try {
      const transport: StreamableHTTPServerTransport =
        new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      void server.connect(transport);
      void transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  // SSE notifications not supported in stateless mode
  app.get("/mcp", (req: Request, res: Response) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      }),
    );
  });

  // Session termination not needed in stateless mode
  app.delete("/mcp", (req: Request, res: Response) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method not allowed.",
        },
        id: null,
      }),
    );
  });

  return server;
}
