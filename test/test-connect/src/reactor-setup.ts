import type { ILogger, ReactorModule } from "@powerhousedao/reactor";
import {
  ChannelScheme,
  driveCollectionId,
  ReactorBuilder,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "document-drive";
import { documentModelDocumentModelModule } from "document-model";
import type { ConnectTestConfig } from "./types.js";

export async function createReactorWithSync(
  config: ConnectTestConfig,
  logger?: ILogger,
): Promise<ReactorModule> {
  const builder = new ReactorBuilder()
    .withDocumentModels([
      driveDocumentModelModule,
      documentModelDocumentModelModule,
    ])
    .withChannelScheme(ChannelScheme.CONNECT)
    .withSignalHandlers();

  if (logger) {
    builder.withLogger(logger);
  }

  const module = await builder.buildModule();

  const sync = module.syncModule?.syncManager;
  if (!sync) {
    throw new Error("Sync module not initialized");
  }

  const remoteName = crypto.randomUUID();
  const collectionId = driveCollectionId("main", config.driveId);

  if (config.verbose) {
    console.log(`[SYNC] Adding remote: name=${remoteName}`);
    console.log(`[SYNC] collectionId=${collectionId}`);
    console.log(`[SYNC] url=${config.url}`);
  }

  const remote = await sync.add(remoteName, collectionId, {
    type: "gql",
    parameters: {
      url: config.url,
    },
  });

  remote.channel.deadLetter.onAdded((syncOps) => {
    for (const syncOp of syncOps) {
      console.error(
        `[SYNC] DEAD LETTER: documentId=${syncOp.documentId} ` +
          `jobId=${syncOp.jobId} branch=${syncOp.branch} ` +
          `operations=${syncOp.operations.length} ` +
          `error=${syncOp.error?.message ?? "unknown"} ` +
          `scopes=[${syncOp.scopes.join(",")}] ` +
          `dependencies=[${syncOp.jobDependencies.join(",")}]`,
      );
    }
  });

  if (config.verbose) {
    console.log("[SYNC] Remote added successfully, polling started");
  }

  return module;
}

export async function waitForDocument(
  module: ReactorModule,
  documentId: string,
  timeoutMs = 5_000,
  verbose = false,
): Promise<void> {
  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < timeoutMs) {
    attempt++;
    try {
      const doc = await module.reactor.get(documentId);
      if (doc) {
        if (verbose) {
          console.log(
            `[SYNC] Document ${documentId} found after ${attempt} attempts (${Date.now() - start}ms)`,
          );
        }
        return;
      }
    } catch {
      // Document not yet available, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timed out waiting for document ${documentId} to sync (${timeoutMs}ms)`,
  );
}
