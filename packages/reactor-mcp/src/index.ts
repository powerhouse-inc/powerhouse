import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initDocumentModelMcp } from "./reactor.js";
import { createServer } from "./server.js";

export async function init() {
  const documentModelMcp = await initDocumentModelMcp();
  const server = createServer(documentModelMcp);

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
