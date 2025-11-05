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

async function setupReactor() {
  const documentModels = getDocumentModels();
  const reactor = await new ReactorBuilder()
    .withDocumentModels(documentModels)
    .build();

  return { reactor };
}

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

  bench
    .add("Reactor - Process all operations", async () => {
      let reactor: IReactor | undefined;

      try {
        const setup = await setupReactor();
        reactor = setup.reactor;
        const driveIds: string[] = [];

        for (const mutation of mutations) {
          await processReactorMutation(mutation, reactor, driveIds);
        }
      } finally {
        if (reactor) {
          reactor.kill();
        }
      }
    })
    .add("BaseServer - Process all operations", async () => {
      const { baseServerDriveServer } = await setupBaseServer();

      for (const mutation of mutations) {
        await processBaseServerMutation(mutation, baseServerDriveServer);
      }
    });

  await bench.run();

  console.log("\nAtlas Operations Processing Benchmark\n");
  console.table(bench.table());
}

main().catch(console.error);
