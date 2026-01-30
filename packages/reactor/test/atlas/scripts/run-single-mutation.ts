import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import inspector from "node:inspector";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ReactorBuilder } from "../../../src/core/reactor-builder.js";
import type {
  BatchExecutionResult,
  IReactor,
} from "../../../src/core/types.js";
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

interface CliOptions {
  mode: ExecutionMode;
  profileOutput?: string;
}

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

function parseCliOptions(): CliOptions {
  const modeArg = process.argv.find((value) => value.startsWith("--mode="));
  const profileArg = process.argv.find((value) =>
    value.startsWith("--profile-output="),
  );

  const mode = modeArg ? modeArg.split("=")[1] : "sequential";

  if (mode !== "sequential" && mode !== "batch") {
    throw new Error(
      `Invalid mode "${mode}". Supported values are "sequential" or "batch".`,
    );
  }

  const profileOutput = profileArg ? profileArg.split("=")[1] : undefined;

  return { mode, profileOutput };
}

async function runSequential(
  reactor: IReactor,
  mutations: RecordedOperation[],
): Promise<void> {
  for (const mutation of mutations) {
    await processReactorMutation(mutation, reactor);
  }
}

async function waitForBatchCompletion(
  reactor: IReactor,
  batchResult: BatchExecutionResult["jobs"],
): Promise<void> {
  const jobIds = Object.values(batchResult).map((job) => job.id);
  const timeoutMs = 60000;
  const intervalMs = 50;
  const start = Date.now();

  for (;;) {
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
      (status) => status.status === JobStatus.READ_READY,
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
  const documentModels = await reactor.getDocumentModels();
  const batchRequest = buildBatchMutationRequest(
    documentModels.results,
    mutations,
  );
  const result = await reactor.executeBatch(batchRequest);
  await waitForBatchCompletion(reactor, result.jobs);
}

async function withProfiling<T>(
  outputPath: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!outputPath) {
    return fn();
  }

  const session = new inspector.Session();
  session.connect();

  const post = <TParams, TResult>(
    method: string,
    params?: TParams,
  ): Promise<TResult> =>
    new Promise((resolve, reject) => {
      session.post(
        method,
        // @ts-expect-error - ignore
        params ?? ({} as TParams),
        // @ts-expect-error - ignore
        (error, result: TResult) => {
          if (error) {
            reject(error as Error);
          } else {
            resolve(result);
          }
        },
      );
    });

  await post("Profiler.enable");
  await post("Profiler.start");

  try {
    const result = await fn();
    const { profile } = await post<undefined, { profile: unknown }>(
      "Profiler.stop",
    );

    const dir = path.dirname(outputPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(outputPath, JSON.stringify(profile));
    console.log(`CPU profile written to ${outputPath}`);

    return result;
  } finally {
    session.disconnect();
  }
}

async function run(): Promise<void> {
  const mutations = loadMutations();
  const { mode, profileOutput } = parseCliOptions();

  const reactor = await createReactor();

  console.log(`Initialized reactor (mode=${mode}).`);

  await withProfiling(profileOutput, async () => {
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
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
