import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { driveDocumentModelModule, ReactorBuilder } from "document-drive";
import { FilesystemStorage } from "document-drive/storage/filesystem";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
} from "document-model";
import { createServer } from "./server.js";

async function createReactor() {
  const builder = new ReactorBuilder([
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule[]).withStorage(
    new FilesystemStorage("./.ph/mcp/storage"),
  );

  const reactor = builder.build();
  await reactor.initialize();

  return reactor;
}

export async function init() {
  const reactor = await createReactor();
  const server = await createServer(reactor);

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
