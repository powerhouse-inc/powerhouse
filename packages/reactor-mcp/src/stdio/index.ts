import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { initFeatureFlags } from "../feature-flags.js";
import { logger } from "../logger.js";
import { createServer } from "../server.js";
import { VitePackageLoader } from "./loader.js";

export interface IMcpOptions {
  remoteDrive?: string;
  root?: string;
  documentModelsDir?: string;
}

const baseDocumentModels: DocumentModelModule<any>[] = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
];

async function createReactorClient(documentModels: DocumentModelModule[]) {
  const reactorBuilder = new ReactorBuilder().withDocumentModels(
    baseDocumentModels.concat(documentModels),
  );

  const module = await new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    .buildModule();

  return module;
}

export async function initStdioMcpServer(options?: IMcpOptions) {
  const {
    remoteDrive,
    root,
    documentModelsDir = "./document-models",
  } = options ?? {};

  // initialize feature flags
  await initFeatureFlags();

  // if root of project is passed then loads local document models
  let documentModelsLoader: VitePackageLoader | undefined;
  const documentModels: DocumentModelModule[] = [];

  if (root) {
    documentModelsLoader = new VitePackageLoader(root, documentModelsDir);
    try {
      const loadedModels = await documentModelsLoader.load();
      documentModels.push(...loadedModels);
      logger.info(
        "Loaded document models: @models",
        loadedModels.map((m) => m.documentModel.global.name).join(", "),
      );
    } catch (e) {
      logger.error("@error", e);
    }
  }

  // initializes reactor client with loaded document models
  const reactorModule = await createReactorClient(documentModels);
  const { client, reactor, reactorModule: rModule } = reactorModule;

  // listens for changes in the local document models to update the reactor
  if (documentModelsLoader && rModule?.documentModelRegistry) {
    const unsubscribe = await documentModelsLoader.onDocumentModelsChange(
      (models) => {
        rModule.documentModelRegistry.registerModules(
          ...baseDocumentModels.concat(models),
        );
      },
    );

    process.on("exit", () => {
      unsubscribe();
      reactor.kill();
    });
  }

  // if a remote drive is passed, log a warning since remote drives
  // are now handled at a different level (SyncManager)
  if (remoteDrive) {
    logger.warn(
      "Remote drive configuration via MCP is not supported in the new reactor. " +
        "Remote drives should be configured at the server level.",
    );
  }

  // starts the server
  // Note: syncManager is not available in stdio mode currently
  const server = await createServer({ client });

  // starts Stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
