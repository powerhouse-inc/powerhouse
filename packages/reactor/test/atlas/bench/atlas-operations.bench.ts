import type { BaseDocumentDriveServer } from "document-drive";
import {
  ReactorBuilder as DriveReactorBuilder,
  InMemoryCache,
  MemoryStorage,
} from "document-drive";
import { PrismaClient } from "document-drive/storage/prisma/client";
import { PrismaStorage } from "document-drive/storage/prisma/prisma";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Bench } from "tinybench";
import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type {
  BatchMutationRequest,
  IReactor,
} from "../../../src/core/types.js";
import { JobStatus } from "../../../src/shared/types.js";
import {
  type RecordedOperation,
  buildBatchMutationRequest,
  getDocumentModels,
  processBaseServerMutation,
  processReactorMutation,
} from "../test/recorded-operations-helpers.js";
import { truncateAllTables } from "../test/truncate-db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const recordedOpsContent = readFileSync(
  path.join(__dirname, "../test/recorded-operations.json"),
  "utf-8",
);
const operations: RecordedOperation[] = JSON.parse(recordedOpsContent);
const mutations = operations.filter((op) => op.type === "mutation");

const DATABASE_URL = "postgresql://postgres:postgres@localhost:5400/postgres";
const cache = new InMemoryCache();

async function setupBaseServer() {
  const prismaClient = new PrismaClient({
    datasources: {
      db: {
        url: DATABASE_URL,
      },
    },
  });

  await truncateAllTables(prismaClient);

  const baseServerStorage = new PrismaStorage(prismaClient as any, cache);
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
  console.log("Building batch mutation request...");

  const documentModels = getDocumentModels();
  const batchRequest: BatchMutationRequest = buildBatchMutationRequest(
    documentModels,
    mutations,
  );

  console.log(
    `Batch request built with ${Object.keys(batchRequest.jobs).length} jobs\n`,
  );

  const bench = new Bench({ time: 60000 });

  let reactorLegacyStorage: IReactor | null;
  let reactorNoLegacyStorage: IReactor | null;
  let reactorBatchSubmission: IReactor | null;
  let legacyReactor: BaseDocumentDriveServer | null;

  bench
    .add(
      "Reactor (Legacy Storage) - Process all operations",
      async () => {
        // sequentially process all operations
        for (const mutation of mutations) {
          await processReactorMutation(mutation, reactorLegacyStorage!);
        }
      },
      {
        beforeEach: async () => {
          const prismaClient = new PrismaClient({
            datasources: {
              db: {
                url: DATABASE_URL,
              },
            },
          });

          await truncateAllTables(prismaClient);

          const documentModels = getDocumentModels();
          reactorLegacyStorage = await new ReactorBuilder()
            .withDocumentModels(documentModels)
            .withFeatures({
              legacyStorageEnabled: true,
            })
            .withLegacyStorage(new PrismaStorage(prismaClient as any, cache))
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
        // sequentially process all operations
        for (const mutation of mutations) {
          await processReactorMutation(mutation, reactorNoLegacyStorage!);
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
            // not used
            .withLegacyStorage(new MemoryStorage())
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
    )
    .add(
      "Reactor (Batch Submission) - Submit all mutations with queue hints",
      async () => {
        const batchResult =
          await reactorBatchSubmission!.mutateBatch(batchRequest);
        const jobIds = Object.values(batchResult.jobs).map((job) => job.id);

        const timeout = 60000;
        const interval = 50;
        const startTime = Date.now();

        while (true) {
          const statuses = await Promise.all(
            jobIds.map((jobId) => reactorBatchSubmission!.getJobStatus(jobId)),
          );

          const allCompleted = statuses.every(
            (status) => status.status === JobStatus.READ_MODELS_READY,
          );
          const anyFailed = statuses.some(
            (status) => status.status === JobStatus.FAILED,
          );

          if (anyFailed) {
            const failedJobs = statuses.filter(
              (status) => status.status === JobStatus.FAILED,
            );
            throw new Error(
              `Batch jobs failed: ${failedJobs.map((job) => `${job.id}: ${job.error?.message}`).join(", ")}`,
            );
          }

          if (allCompleted) {
            break;
          }

          if (Date.now() - startTime > timeout) {
            throw new Error("Timeout waiting for batch jobs to complete");
          }

          await new Promise((resolve) => setTimeout(resolve, interval));
        }
      },
      {
        beforeEach: async () => {
          const documentModels = getDocumentModels();
          reactorBatchSubmission = await new ReactorBuilder()
            .withDocumentModels(documentModels)
            .withFeatures({
              legacyStorageEnabled: false,
            })
            // not used
            .withLegacyStorage(new MemoryStorage())
            .build();
        },
        afterEach: () => {
          reactorBatchSubmission?.kill();
        },
      },
    );

  await bench.run();

  console.log("\nAtlas Operations Processing Benchmark\n");
  console.table(bench.table());
}

main().catch(console.error);
