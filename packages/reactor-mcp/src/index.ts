import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { driveDocumentModelModule, ReactorBuilder } from "document-drive";
import {
  documentModelDocumentModelModule,
  generateId,
  type DocumentModelModule,
} from "document-model";
import { createServer } from "./server.js";

async function createReactor() {
  const builder = new ReactorBuilder([
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule[]);
  // .withStorage(
  //   new FilesystemStorage("./.ph/mcp/storage"),
  // );
  const reactor = builder.build();
  await reactor.initialize();

  return reactor;
}

export async function init(remoteDrive?: string) {
  const reactor = await createReactor();
  const server = await createServer(reactor);

  if (remoteDrive) {
    await reactor.addRemoteDrive(remoteDrive, {
      sharingType: "PUBLIC",
      availableOffline: true,
      listeners: [
        {
          block: true,
          callInfo: {
            data: remoteDrive,
            name: "switchboard-push",
            transmitterType: "SwitchboardPush",
          },
          filter: {
            branch: ["main"],
            documentId: ["*"],
            documentType: ["*"],
            scope: ["global"],
          },
          label: "Switchboard Sync",
          listenerId: generateId(),
          system: true,
        },
      ],
      triggers: [],
    });
  }

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
