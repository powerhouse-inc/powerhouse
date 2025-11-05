import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type { BatchMutationResult, IReactor } from "../../../src/core/types.js";
import { JobStatus } from "../../../src/shared/types.js";
import {
  type RecordedOperation,
  buildBatchMutationRequest,
  getDocumentModels,
  processReactorMutation,
} from "../test/recorded-operations-helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ExecutionMode = "sequential" | "batch";

function loadMutations(): RecordedOperation[] {
  const recordedOpsPath = path.join(
    __dirname,
    "../test/recorded-operations.json",
  );
  const fileContents = readFileSync(recordedOpsPath, "utf-8");
  const operations = JSON.parse(fileContents) as RecordedOperation[];
  return operations.filter((op) => op.type === "mutation");
}

async function createReactor(): Promise<IReactor> {
  const documentModels = getDocumentModels();
  return new ReactorBuilder().withDocumentModels(documentModels).build();
}

function parseExecutionMode(): ExecutionMode {
  const arg = process.argv.find((value) => value.startsWith("--mode="));
  if (!arg) {
    return "sequential";
  }

  const mode = arg.split("=")[1];
  if (mode !== "sequential" && mode !== "batch") {
    throw new Error(
      `Invalid mode "${mode}". Supported values are "sequential" or "batch".`,
    );
  }

  return mode;
}

async function runSequential(
  reactor: IReactor,
  mutations: RecordedOperation[],
): Promise<void> {
  const driveIds: string[] = [];
  for (const mutation of mutations) {
    await processReactorMutation(mutation, reactor, driveIds);
  }
}

async function waitForBatchCompletion(
  reactor: IReactor,
  batchResult: BatchMutationResult["jobs"],
): Promise<void> {
  const jobIds = Object.values(batchResult).map((job) => job.id);
  const timeoutMs = 60000;
  const intervalMs = 50;
  const start = Date.now();

  while (true) {
    const statuses = await Promise.all(
      jobIds.map((id) => reactor.getJobStatus(id)),
    );

    const failed = statuses.filter(
      (status) => status.status === JobStatus.FAILED,
    );
    if (failed.length > 0) {
      const messages = failed
        .map(
          (status) =>
            `${status.id}: ${status.error?.message ?? "unknown error"}`,
        )
        .join(", ");
      throw new Error(`Batch jobs failed: ${messages}`);
    }

    const allDone = statuses.every(
      (status) => status.status === JobStatus.COMPLETED,
    );
    if (allDone) {
      return;
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for batch jobs to finish.");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function runBatch(
  reactor: IReactor,
  mutations: RecordedOperation[],
): Promise<void> {
  const batchRequest = await buildBatchMutationRequest(mutations, reactor);
  const result = await reactor.mutateBatch(batchRequest);
  await waitForBatchCompletion(reactor, result.jobs);
}

async function run(): Promise<void> {
  const mutations = loadMutations();
  const mode = parseExecutionMode();

  const reactor = await createReactor();

  console.log(`Initialized reactor (mode=${mode}).`);

  try {
    if (mode === "batch") {
      await runBatch(reactor, mutations);
    } else {
      await runSequential(reactor, mutations);
    }
    console.log("Mutations processed successfully.");
  } finally {
    reactor.kill();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
