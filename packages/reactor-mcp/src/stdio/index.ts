import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { driveDocumentModelModule, ReactorBuilder } from "document-drive";
import {
  documentModelDocumentModelModule,
  generateId,
  type DocumentModelModule,
} from "document-model";
import { logger } from "../logger.js";
import { createServer } from "../server.js";
import { VitePackageLoader } from "./loader.js";

export interface IMcpOptions {
  remoteDrive?: string;
  root?: string;
  documentModelsDir?: string;
}

const baseDocumentModels = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
] as unknown as DocumentModelModule[];

async function createReactor(documentModels: DocumentModelModule[] = []) {
  const builder = new ReactorBuilder(baseDocumentModels.concat(documentModels));
  const reactor = builder.build();
  await reactor.initialize();

  return reactor;
}

export async function initStdioMcpServer(options?: IMcpOptions) {
  const {
    remoteDrive,
    root,
    documentModelsDir = "./document-models",
  } = options ?? {};

  // if root of project is passed then loads local document models
  let documentModelsLoader: VitePackageLoader | undefined;
  const documentModels: DocumentModelModule[] = [];

  if (root) {
    documentModelsLoader = new VitePackageLoader(root, documentModelsDir);
    try {
      const loadedModels = await documentModelsLoader.load();
      documentModels.push(...loadedModels);
      logger.log(
        "Loaded document models:",
        loadedModels.map((m) => m.documentModel.name).join(", "),
      );
    } catch (e) {
      logger.error(e);
    }
  }

  // initializes reactor with loaded document models
  const reactor = await createReactor(documentModels);

  // listens for changes in the local document models to update the reactor
  if (documentModelsLoader) {
    const unsubscribe = await documentModelsLoader.onDocumentModelsChange(
      (models) => {
        reactor.setDocumentModelModules(baseDocumentModels.concat(models));
      },
    );

    process.on("exit", () => {
      unsubscribe();
    });
  }

  // if a remote drive is passed then adds it to the reactor
  if (remoteDrive) {
    try {
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
    } catch (e) {
      throw new Error(
        `Failed to add remote drive "${remoteDrive}": ${e instanceof Error ? e.message : e}`,
        {
          cause: e,
        },
      );
    }
  }

  // starts the server
  const server = await createServer(reactor);

  // starts Stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
