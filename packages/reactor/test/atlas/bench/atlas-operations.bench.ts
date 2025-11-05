import type { BaseDocumentDriveServer } from "document-drive";
import {
  ReactorBuilder as DriveReactorBuilder,
  MemoryStorage,
} from "document-drive";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Bench } from "tinybench";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type { IReactor } from "../../../src/core/types.js";
import {
  type RecordedOperation,
  getDocumentModels,
  processBaseServerMutation,
  processReactorMutation,
} from "../test/recorded-operations-helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const recordedOpsContent = readFileSync(
  path.join(__dirname, "../test/recorded-operations.json"),
  "utf-8",
);
const operations: RecordedOperation[] = JSON.parse(recordedOpsContent);
const mutations = operations.filter((op) => op.type === "mutation");

async function setupBaseServer() {
  const baseServerStorage = new MemoryStorage();
  const documentModels = getDocumentModels();

  const baseServerBuilder = new DriveReactorBuilder(documentModels).withStorage(
    baseServerStorage,
  );
  const baseServerDriveServer =
    baseServerBuilder.build() as unknown as BaseDocumentDriveServer;
  await baseServerDriveServer.initialize();

  return { baseServerDriveServer };
}

async function main() {
  const bench = new Bench({ time: 60000 });

  let reactorLegacyStorage: IReactor | null;
  let reactorNoLegacyStorage: IReactor | null;
  let legacyReactor: BaseDocumentDriveServer | null;

  bench
    .add(
      "Reactor (Legacy Storage) - Process all operations",
      async () => {
        const driveIds: string[] = [];
        for (const mutation of mutations) {
          await processReactorMutation(
            mutation,
            reactorLegacyStorage!,
            driveIds,
          );
        }
      },
      {
        beforeEach: async () => {
          const documentModels = getDocumentModels();
          reactorLegacyStorage = await new ReactorBuilder()
            .withDocumentModels(documentModels)
            .withFeatures({
              legacyStorageEnabled: true,
            })
            .build();
        },
        afterEach: () => {
          reactorLegacyStorage?.kill();
        },
      },
    )
    .add(
      "Reactor - Process all operations",
      async () => {
        const driveIds: string[] = [];
        for (const mutation of mutations) {
          await processReactorMutation(
            mutation,
            reactorNoLegacyStorage!,
            driveIds,
          );
        }
      },
      {
        beforeEach: async () => {
          const documentModels = getDocumentModels();
          reactorNoLegacyStorage = await new ReactorBuilder()
            .withDocumentModels(documentModels)
            .withFeatures({
              legacyStorageEnabled: false,
            })
            .build();
        },
        afterEach: () => {
          reactorNoLegacyStorage?.kill();
        },
      },
    )
    .add(
      "BaseServer - Process all operations",
      async () => {
        for (const mutation of mutations) {
          await processBaseServerMutation(mutation, legacyReactor!);
        }
      },
      {
        beforeEach: async () => {
          const { baseServerDriveServer } = await setupBaseServer();
          legacyReactor = baseServerDriveServer;
        },
      },
    );

  await bench.run();

  console.log("\nAtlas Operations Processing Benchmark\n");
  console.table(bench.table());
}

main().catch(console.error);
