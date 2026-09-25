import {
  ChannelScheme,
  DriveCollectionId,
  ReactorBuilder,
  type InProcessReactorModule,
} from "@powerhousedao/reactor";
import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  actionSignerIdentity,
  actionSigningTarget,
  type Action,
  type ISigner,
} from "@powerhousedao/shared/document-model";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk/crypto";
import { documentModelDocumentModelModule, type ILogger } from "document-model";
import type { ConnectTestConfig } from "./types.js";

/** A fresh key per client: the switchboard creates v2-required documents. */
export async function createClientSigner(): Promise<ISigner> {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return new RenownCryptoSigner(crypto, "load-test-connect");
}

/** `actions` signed for the logs they are written to. */
export function signActions(
  signer: ISigner,
  actions: Action[],
  documentId: string,
  branch: string,
): Promise<Action[]> {
  return Promise.all(
    actions.map(async (action) => {
      const signature = await signer.signAction(
        action,
        actionSigningTarget(action, documentId, branch),
      );
      return {
        ...action,
        context: {
          ...action.context,
          signer: { ...actionSignerIdentity(signer), signatures: [signature] },
        },
      };
    }),
  );
}

export async function createReactorWithSync(
  config: ConnectTestConfig,
  signer: ISigner,
  logger?: ILogger,
): Promise<InProcessReactorModule> {
  const builder = new ReactorBuilder()
    .withDocumentModelSources([
      driveDocumentModelModule,
      reactorDriveDocumentModelModule,
      documentModelDocumentModelModule,
    ])
    .withChannelScheme(ChannelScheme.CONNECT)
    .withSigner(signer)
    .withSignalHandlers();

  if (config.maxSkipThreshold !== undefined) {
    builder.withExecutorConfig({ maxSkipThreshold: config.maxSkipThreshold });
  }

  if (logger) {
    builder.withLogger(logger);
  }

  const module = await builder.buildModule();

  const sync = module.syncModule?.syncManager;
  if (!sync) {
    throw new Error("Sync module not initialized");
  }

  const remoteName = crypto.randomUUID();
  const collectionId = DriveCollectionId.forDrive(config.driveId);

  if (config.verbose) {
    console.log(`[SYNC] Adding remote: name=${remoteName}`);
    console.log(`[SYNC] collectionId=${collectionId.key}`);
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
  module: InProcessReactorModule,
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
