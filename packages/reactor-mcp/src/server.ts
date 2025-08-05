import { createReactorMcpProvider } from "#mcp/reactor.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type IDocumentDriveServer } from "document-drive";

export async function createServer(reactor: IDocumentDriveServer) {
  // Create an MCP server for document model operations.
  // For document model creation tasks, consider using the document-model-creator agent
  // which provides a more guided experience.
  const server = new McpServer(
    {
      name: "reactor-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {
          subscribe: true,
          listChanged: true,
        },
        prompts: {
          listChanged: true,
        },
      },
    },
  );

  const reactorProvider = await createReactorMcpProvider(reactor);

  const { callback, ...toolSchema } = reactorProvider.tools.getDocumentModels;
  // server.registerTool("getDocumentModels", toolSchema, callback);
  Object.entries(reactorProvider.tools).forEach(
    ([toolName, { callback, ...schema }]) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      server.registerTool(toolName, schema as any, callback as any);
    },
  );

  return server;
}
