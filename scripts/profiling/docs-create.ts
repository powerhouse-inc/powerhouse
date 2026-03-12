#!/usr/bin/env tsx
/**
 * Script to create N documents and perform M operations on each via GraphQL API
 * Usage: tsx docs-create.ts [N] [--operations M] [--endpoint <url>]
 *
 * Process flow:
 *   1. Create N documents via DocumentModel_createEmptyDocument
 *   2. For each document, perform M operations via individual DocumentModel_* mutations
 *
 * Batch mode:
 *   - Use --batch-size <N> to send N operations per GraphQL request (using aliases)
 *   - Default is 1 (each operation in its own request)
 *   - Use this to measure per-request overhead vs batched execution
 */

import { GraphQLClient } from "graphql-request";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { basename, dirname, join } from "node:path";

const DEFAULT_ENDPOINT = "http://localhost:4001/graphql";
const GRAPHQL_TIMEOUT_MS = 30_000;

// Action configs for cycling through different operation types
const ACTION_CONFIGS = [
  {
    name: "setModelName",
    mutationName: "DocumentModel_setModelName",
    inputType: "DocumentModel_SetModelNameInput",
    buildInput: (docIndex: number, opIndex: number) => ({
      name: `Model-${docIndex}-op${opIndex}`,
    }),
  },
  {
    name: "setModelDescription",
    mutationName: "DocumentModel_setModelDescription",
    inputType: "DocumentModel_SetModelDescriptionInput",
    buildInput: (docIndex: number, opIndex: number) => ({
      description: `Description for document ${docIndex}, operation ${opIndex}`,
    }),
  },
  {
    name: "setAuthorName",
    mutationName: "DocumentModel_setAuthorName",
    inputType: "DocumentModel_SetAuthorNameInput",
    buildInput: (docIndex: number, opIndex: number) => ({
      authorName: `Author-${docIndex}-op${opIndex}`,
    }),
  },
  {
    name: "setAuthorWebsite",
    mutationName: "DocumentModel_setAuthorWebsite",
    inputType: "DocumentModel_SetAuthorWebsiteInput",
    buildInput: (docIndex: number, opIndex: number) => ({
      authorWebsite: `https://example-${docIndex}-${opIndex}.com`,
    }),
  },
  {
    name: "setModelExtension",
    mutationName: "DocumentModel_setModelExtension",
    inputType: "DocumentModel_SetModelExtensionInput",
    buildInput: (_docIndex: number, opIndex: number) => ({
      extension: `.ext${opIndex}`,
    }),
  },
  {
    name: "setModelId",
    mutationName: "DocumentModel_setModelId",
    inputType: "DocumentModel_SetModelIdInput",
    buildInput: (docIndex: number, opIndex: number) => ({
      id: `org/model-${docIndex}-v${opIndex}`,
    }),
  },
];

interface CreateDocumentResponse {
  DocumentModel_createEmptyDocument: { id: string };
}

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  rss: number;
}

interface Percentiles {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

interface OperationTiming {
  opIndex: number;
  durationMs: number;
  actionType: string;
}

interface OperationsResult {
  minOp: OperationTiming | null;
  maxOp: OperationTiming | null;
  durations: number[];
}

function getMemoryStats(): MemoryStats {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
  };
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}

function formatMemory(stats: MemoryStats): string {
  return `heap: ${formatBytes(stats.heapUsed)}/${formatBytes(stats.heapTotal)}, rss: ${formatBytes(stats.rss)}`;
}

function calculatePercentiles(durations: number[]): Percentiles | null {
  if (durations.length === 0) return null;

  const sorted = [...durations].sort((a, b) => a - b);
  const percentile = (p: number): number => {
    const pos = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(pos);
    const upper = Math.ceil(pos);
    const weight = pos - lower;

    if (lower === upper) return sorted[lower];
    return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
  };

  return {
    p50: percentile(50),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
  };
}

function formatPercentiles(p: Percentiles): string {
  return `p50: ${p.p50}ms, p90: ${p.p90}ms, p95: ${p.p95}ms, p99: ${p.p99}ms`;
}

// Build a single GraphQL mutation that sends batchSize operations using aliases.
// When asyncMutate is true, the *Async variant of each mutation is used.
// Async mutations return String! (job ID) so no selection set is included.
function buildBatchMutation(
  ops: Array<{ mutationName: string; inputType: string }>,
  asyncMutate: boolean,
): string {
  const varDecls = [
    "$docId: PHID!",
    ...ops.map((op, i) => `$input${i}: ${op.inputType}!`),
  ].join(", ");
  const body = ops
    .map((op, i) => {
      const name = asyncMutate ? `${op.mutationName}Async` : op.mutationName;
      const selection = asyncMutate ? "" : " { id }";
      return `  op${i}: ${name}(docId: $docId, input: $input${i})${selection}`;
    })
    .join("\n");
  return `mutation BatchOps(${varDecls}) {\n${body}\n}`;
}

async function createDocument(client: GraphQLClient): Promise<string> {
  const { DocumentModel_createEmptyDocument } =
    await client.request<CreateDocumentResponse>(
      `mutation CreateDocument { DocumentModel_createEmptyDocument { id } }`,
    );
  return DocumentModel_createEmptyDocument.id;
}

type RequestDescriptor = {
  mutation: string;
  variables: Record<string, unknown>;
  batchEnd: number;
  batchCount: number;
  actionType: string;
};

function buildRequests(
  documentId: string,
  docIndex: number,
  operationCount: number,
  batchSize: number,
  asyncMutate: boolean,
): RequestDescriptor[] {
  const requests: RequestDescriptor[] = [];
  for (let i = 0; i < operationCount; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, operationCount);
    const batchCount = batchEnd - i;
    const batchOps: Array<{ mutationName: string; inputType: string }> = [];
    const actionTypes: string[] = [];
    const variables: Record<string, unknown> = { docId: documentId };

    for (let j = i; j < batchEnd; j++) {
      const config = ACTION_CONFIGS[(j + 1) % ACTION_CONFIGS.length];
      batchOps.push({
        mutationName: config.mutationName,
        inputType: config.inputType,
      });
      actionTypes.push(config.name);
      variables[`input${j - i}`] = config.buildInput(docIndex, j + 1);
    }

    requests.push({
      mutation: buildBatchMutation(batchOps, asyncMutate),
      variables,
      batchEnd,
      batchCount,
      actionType: batchCount === 1 ? actionTypes[0] : `batch(${batchCount})`,
    });
  }
  return requests;
}

async function performOperations(
  client: GraphQLClient,
  documentId: string,
  docIndex: number,
  operationCount: number,
  batchSize: number,
  onProgress: (opNum: number, durationMs: number, batchCount: number) => void,
): Promise<OperationsResult> {
  let minOp: OperationTiming | null = null;
  let maxOp: OperationTiming | null = null;
  const durations: number[] = [];

  const requests = buildRequests(
    documentId,
    docIndex,
    operationCount,
    batchSize,
    false,
  );

  for (const req of requests) {
    const opStart = performance.now();
    await client.request(req.mutation, req.variables);
    const batchDurationMs = performance.now() - opStart;
    const perOpDurationMs = batchDurationMs / req.batchCount;

    for (let j = 0; j < req.batchCount; j++) {
      durations.push(perOpDurationMs);
    }

    const timing: OperationTiming = {
      opIndex: req.batchEnd,
      durationMs: perOpDurationMs,
      actionType: req.actionType,
    };

    if (minOp === null || perOpDurationMs < minOp.durationMs) minOp = timing;
    if (maxOp === null || perOpDurationMs > maxOp.durationMs) maxOp = timing;

    onProgress(req.batchEnd, batchDurationMs, req.batchCount);
  }

  return { minOp, maxOp, durations };
}

const JOB_STATUS_QUERY = `
  query GetJobStatus($jobId: String!) {
    jobStatus(jobId: $jobId) { status completedAt }
  }
`;
const TERMINAL_JOB_STATUSES = new Set(["WRITE_READY", "READ_READY", "FAILED"]);
const JOB_POLL_INTERVAL_MS = 5;

interface JobStatusResponse {
  jobStatus: { status: string; completedAt: string | null };
}

interface SampledJob {
  jobId: string;
  dispatchedAt: number; // performance.now() captured before the dispatch request
  batchEnd: number;
  batchCount: number;
  actionType: string;
  loopNum: number;
  reqNum: number;
}

async function pollJobAsync(
  client: GraphQLClient,
  job: SampledJob,
  timeoutMs: number,
): Promise<{ result: OperationsResult; totalMs: number; timedOut: boolean }> {
  const deadline = performance.now() + timeoutMs;
  let timedOut = false;
  while (true) {
    // Check deadline before sleeping so timeouts shorter than
    // JOB_POLL_INTERVAL_MS still attempt at least one poll on the first
    // iteration rather than timing out in the sleep.
    if (performance.now() >= deadline) {
      timedOut = true;
      process.stderr.write(
        `\nWarning: job ${job.jobId} (req ${job.reqNum}) did not reach a terminal status within ${timeoutMs}ms — giving up.\n`,
      );
      break;
    }
    await new Promise<void>((resolve) =>
      setTimeout(resolve, JOB_POLL_INTERVAL_MS),
    );
    const { jobStatus } = await client.request<JobStatusResponse>(
      JOB_STATUS_QUERY,
      { jobId: job.jobId },
    );
    if (
      TERMINAL_JOB_STATUSES.has(jobStatus.status) ||
      jobStatus.completedAt !== null
    )
      break;
  }
  // Measures wall-clock time from before the dispatch request to when the
  // terminal poll response arrives — includes dispatch round-trip + processing
  // + one poll interval of overhead.
  const totalMs = performance.now() - job.dispatchedAt;
  const perOpMs = totalMs / job.batchCount;
  const durations = Array.from({ length: job.batchCount }, () => perOpMs);
  const timing: OperationTiming = {
    opIndex: job.batchEnd,
    durationMs: perOpMs,
    actionType: job.actionType,
  };
  return {
    result: { minOp: timing, maxOp: timing, durations },
    totalMs,
    timedOut,
  };
}

function parseArgs(args: string[]): {
  count: number;
  operations: number;
  opLoops: number;
  batchSize: number;
  endpoint: string;
  docIds: string[];
  asyncMutate: boolean;
  asyncPollRate: number;
  asyncTimeoutMs: number;
  verbose: boolean;
  percentiles: boolean;
  showActionTypes: boolean;
  output: string | undefined;
  outputTimestamp: boolean;
} {
  let count = 10;
  let operations = 0;
  let opLoops = 1;
  let batchSize = 1;
  let endpoint = DEFAULT_ENDPOINT;
  const docIds: string[] = [];
  let asyncMutate = false;
  let asyncPollRate = 100;
  let asyncTimeoutMs = 30_000;
  let verbose = false;
  let percentiles = false;
  let showActionTypes = false;
  let output: string | undefined = undefined;
  let outputTimestamp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[++i];
    } else if ((arg === "--operations" || arg === "-o") && args[i + 1]) {
      operations = Number(args[++i]);
    } else if ((arg === "--op-loops" || arg === "-l") && args[i + 1]) {
      opLoops = Number(args[++i]);
    } else if ((arg === "--batch-size" || arg === "-b") && args[i + 1]) {
      batchSize = Number(args[++i]);
    } else if ((arg === "--doc-id" || arg === "-d") && args[i + 1]) {
      docIds.push(args[++i]);
    } else if (arg === "--async") {
      asyncMutate = true;
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        const n = Number(nextArg);
        if (isNaN(n) || n <= 0 || !Number.isInteger(n)) {
          console.error(
            `Error: --async N must be a positive integer, got: ${nextArg}`,
          );
          process.exit(1);
        }
        asyncPollRate = n;
        i++;
      }
    } else if (arg === "--async-timeout" && args[i + 1]) {
      asyncTimeoutMs = Number(args[++i]);
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--percentiles" || arg === "-p") {
      percentiles = true;
    } else if (arg === "--show-action-types" || arg === "-a") {
      showActionTypes = true;
    } else if ((arg === "--output" || arg === "-O") && args[i + 1]) {
      output = args[++i];
      outputTimestamp = false;
    } else if (arg === "--file") {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        output = nextArg;
        i++;
      } else {
        output = "docs-create.txt";
      }
      outputTimestamp = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx docs-create.ts [N] [options]

Arguments:
  N                         Number of documents to create (default: 10)

Options:
  --operations, -o <M>      Number of operations per loop (default: 0)
  --op-loops, -l <L>        Number of operation loops per document (default: 1)
  --batch-size, -b <N>      Operations per GraphQL request using aliases (default: 1)
                            Use higher values to measure per-request overhead
  --doc-id, -d <id>         Use existing document(s) instead of creating new ones
                            (can be specified multiple times, skips document creation)
  --endpoint <url>          GraphQL endpoint (default: ${DEFAULT_ENDPOINT})
  --async [N]               Use *Async mutation variants; poll every Nth operation (default N=100)
  --async-timeout <ms>      Max ms to wait for a polled job to reach a terminal status (default: 30000)
  --verbose, -v             Show detailed operation timings
  --percentiles, -p         Show percentile statistics (p50, p90, p95, p99) per line
  --show-action-types, -a   Show action type names in min/max timings
  --file [name]             Write output to a timestamped file (default: docs-create.txt)
  --output, -O <file>       Write output to a specific file (no timestamp prefix)
  --help, -h                Show this help message

Process flow:
  1. Create N documents (skipped if --doc-id is provided)
  2. For each document, perform M operations L times (total: M * L ops per document)

Examples:
  tsx docs-create.ts 10
  tsx docs-create.ts 10 --operations 5
  tsx docs-create.ts 1 -o 25 -l 100    # 1 doc, 25 ops repeated 100 times (2500 total ops)
  tsx docs-create.ts --doc-id abc123 -o 25 -l 100  # ops on existing document
  tsx docs-create.ts -d doc1 -d doc2 -o 10        # ops on multiple existing documents
  tsx docs-create.ts 100 --operations 10 --endpoint http://localhost:4001/graphql
  tsx docs-create.ts 1 -o 100 -b 10      # 10 ops per GraphQL request (10 requests total)
  tsx docs-create.ts 5 -o 3 --verbose
`);
      process.exit(0);
    } else if (!isNaN(Number(arg)) && arg.trim() !== "") {
      count = Number(arg);
    } else {
      console.error(`Error: Unrecognized argument: ${arg}`);
      console.error("Use --help for usage information.");
      process.exit(1);
    }
  }

  if (docIds.length === 0 && count < 1) {
    console.error(
      `Error: Document count must be a positive integer (>= 1) when --doc-id is not provided.`,
    );
    process.exit(1);
  }

  if (isNaN(operations) || operations < 0) {
    console.error(
      `Error: Invalid operations value: must be a non-negative integer.`,
    );
    process.exit(1);
  }

  if (isNaN(opLoops) || opLoops < 1) {
    console.error(
      `Error: Invalid op-loops value: must be a positive integer (>= 1).`,
    );
    process.exit(1);
  }

  if (isNaN(batchSize) || batchSize < 1) {
    console.error(
      `Error: Invalid batch-size value: must be a positive integer (>= 1).`,
    );
    process.exit(1);
  }

  if (
    isNaN(asyncTimeoutMs) ||
    asyncTimeoutMs < 1 ||
    !Number.isInteger(asyncTimeoutMs)
  ) {
    console.error(
      `Error: Invalid --async-timeout value: must be a positive integer (ms).`,
    );
    process.exit(1);
  }

  if (operations === 0 && opLoops > 1) {
    console.warn(
      `Warning: --op-loops=${opLoops} has no effect when operations is 0.`,
    );
  }

  if (operations === 0 && batchSize > 1) {
    console.warn(
      `Warning: --batch-size=${batchSize} has no effect when operations is 0.`,
    );
  }

  if (operations === 0 && asyncMutate) {
    console.warn(`Warning: --async has no effect when operations is 0.`);
  }

  if (docIds.length > 0 && operations === 0) {
    console.warn(
      `Warning: --doc-id specified but no operations to perform (use --operations).`,
    );
  }

  return {
    count,
    operations,
    opLoops,
    batchSize,
    endpoint,
    docIds,
    asyncMutate,
    asyncPollRate,
    asyncTimeoutMs,
    verbose,
    percentiles,
    showActionTypes,
    output,
    outputTimestamp,
  };
}

async function main() {
  const {
    count,
    operations,
    opLoops,
    batchSize,
    endpoint,
    docIds,
    asyncMutate,
    asyncPollRate,
    asyncTimeoutMs,
    verbose,
    percentiles: showPercentiles,
    showActionTypes,
    output: outputFile,
    outputTimestamp,
  } = parseArgs(process.argv.slice(2));

  // Set up output file tee if requested
  let outputStream: WriteStream | undefined;
  let pendingLine = "";
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  if (outputFile) {
    const outputPath = outputTimestamp
      ? join(
          dirname(outputFile),
          `${new Date().toISOString().replace(/[:.]/g, "-")}-${basename(outputFile)}`,
        )
      : outputFile;
    mkdirSync(dirname(outputPath), { recursive: true });
    console.log(`Writing output to: ${outputPath}`);
    outputStream = createWriteStream(outputPath);

    const fileWrite = (chunk: string | Uint8Array) => {
      const text =
        typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      const parts = text.split("\n");

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (i === parts.length - 1) {
          const crParts = part.split("\r");
          pendingLine = crParts[crParts.length - 1];
        } else {
          const crParts = part.split("\r");
          const finalPart = crParts[crParts.length - 1];
          outputStream!.write(pendingLine + finalPart + "\n");
          pendingLine = "";
        }
      }
    };

    type WriteCallback = (error?: Error | null) => void;
    process.stdout.write = (
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | WriteCallback,
      callback?: WriteCallback,
    ): boolean => {
      fileWrite(chunk);
      const encoding =
        typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
      const cb =
        typeof encodingOrCallback === "function"
          ? encodingOrCallback
          : callback;
      return origStdoutWrite(chunk, encoding, cb);
    };

    process.stderr.write = (
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | WriteCallback,
      callback?: WriteCallback,
    ): boolean => {
      fileWrite(chunk);
      const encoding =
        typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
      const cb =
        typeof encodingOrCallback === "function"
          ? encodingOrCallback
          : callback;
      return origStderrWrite(chunk, encoding, cb);
    };
  }

  try {
    console.log(
      `Command: tsx docs-create.ts ${process.argv.slice(2).join(" ")}`,
    );

    const client = new GraphQLClient(endpoint, { timeout: GRAPHQL_TIMEOUT_MS });
    const useExistingDocs = docIds.length > 0;

    const initialMemory = getMemoryStats();
    console.log(`\nInitial memory: ${formatMemory(initialMemory)}`);

    const overallStartTime = performance.now();
    let documentIds: string[];

    if (useExistingDocs) {
      documentIds = docIds;
      console.log(`\nUsing ${documentIds.length} existing document(s):`);
      documentIds.forEach((id) => console.log(`  - ${id}`));
    } else {
      console.log(`\nPhase 1: Creating ${count} documents...`);
      const createStartTime = performance.now();
      documentIds = [];

      for (let i = 0; i < count; i++) {
        const id = await createDocument(client);
        documentIds.push(id);
        process.stdout.write(`\r  Progress: ${i + 1}/${count}`);
      }

      const createDurationMs = performance.now() - createStartTime;
      const createDuration = (createDurationMs / 1000).toFixed(2);
      const msPerDoc = (createDurationMs / count).toFixed(0);
      const phase1Memory = getMemoryStats();
      console.log(
        `\n  Created ${count} documents in ${createDuration}s (avg: ${msPerDoc}ms/doc)`,
      );
      console.log(`  Memory: ${formatMemory(phase1Memory)}`);
    }

    if (operations > 0) {
      const docCount = documentIds.length;
      const loopLabel = opLoops > 1 ? ` x ${opLoops} loops` : "";
      const batchLabel = batchSize > 1 ? ` (batch size: ${batchSize})` : "";
      const phaseLabel = useExistingDocs ? "Operations" : "Phase 2";
      console.log(
        `\n${phaseLabel}: Performing ${operations} operations${loopLabel}${batchLabel} on each document...`,
      );
      const opsStartTime = performance.now();
      const totalOps = docCount * operations * opLoops;

      let overallMinOp: {
        docId: string;
        docNum: number;
        loop: number;
        timing: OperationTiming;
      } | null = null;
      let overallMaxOp: {
        docId: string;
        docNum: number;
        loop: number;
        timing: OperationTiming;
      } | null = null;
      const allDurations: number[] = [];
      let timedOutCount = 0;
      let sampledJobCount = 0;

      for (let i = 0; i < documentIds.length; i++) {
        const docNum = i + 1;
        const docId = documentIds[i];

        if (asyncMutate && operations > 0) {
          const totalRequests = opLoops * Math.ceil(operations / batchSize);
          const pollPromises: Promise<{
            result: OperationsResult;
            totalMs: number;
            timedOut: boolean;
            job: SampledJob;
          }>[] = [];
          let globalReqNum = 0;

          // Dispatch sequentially; start polling each sampled job immediately
          // (fire-and-forget into pollPromises) so results stream to stdout as
          // each poll resolves during dispatch rather than bursting at the end.
          for (let loop = 1; loop <= opLoops; loop++) {
            const loopDispatchStart = performance.now();
            const requests = buildRequests(
              docId,
              docNum,
              operations,
              batchSize,
              true,
            );
            for (const req of requests) {
              globalReqNum++;
              const dispatchedAt = performance.now();
              const result = await client.request<Record<string, string>>(
                req.mutation,
                req.variables,
              );
              // The batch mutation aliases each op; we sample the last one as
              // representative. Validate early so polling never runs against
              // "undefined".
              const resultValues = Object.values(result);
              if (resultValues.length === 0) {
                throw new Error(
                  `Empty mutation response for request ${globalReqNum}`,
                );
              }
              const jobId = resultValues.at(-1);
              if (typeof jobId !== "string" || jobId === "") {
                throw new Error(
                  `Invalid job ID in mutation response for request ${globalReqNum}: ${JSON.stringify(jobId)}`,
                );
              }
              if (
                globalReqNum % asyncPollRate === 0 ||
                globalReqNum === totalRequests
              ) {
                const job: SampledJob = {
                  jobId,
                  dispatchedAt,
                  batchEnd: req.batchEnd,
                  batchCount: req.batchCount,
                  actionType: req.actionType,
                  loopNum: loop,
                  reqNum: globalReqNum,
                };
                pollPromises.push(
                  pollJobAsync(client, job, asyncTimeoutMs).then((r) => {
                    const ms = Math.round(r.totalMs);
                    if (r.timedOut) {
                      process.stdout.write(
                        `\r  [${docNum}/${docCount}] ${docId}: op ${job.reqNum}/${totalRequests} TIMED OUT after ${ms}ms\n`,
                      );
                    } else {
                      process.stdout.write(
                        `\r  [${docNum}/${docCount}] ${docId}: op ${job.reqNum}/${totalRequests} (${ms}ms)\n`,
                      );
                    }
                    return { ...r, job };
                  }),
                );
              }
              if (!verbose) {
                process.stdout.write(
                  `\r  [${docNum}/${docCount}] ${docId}: dispatching ${globalReqNum}/${totalRequests}...`,
                );
              }
            }
            const loopDispatchMs = Math.round(
              performance.now() - loopDispatchStart,
            );
            const msPerOp = Math.round(loopDispatchMs / operations);
            process.stdout.write(
              `\r  [${docNum}/${docCount}] ${docId}: loop ${loop}/${opLoops} dispatched in ${loopDispatchMs}ms (${msPerOp}ms/op)\n`,
            );
          }

          // Wait for any polls still in flight after dispatch completes, then aggregate
          const allPollResults = await Promise.all(pollPromises);
          for (const { result, timedOut, job } of allPollResults) {
            // Skip timed-out jobs — their totalMs reflects the timeout cap, not
            // real processing time, and would skew min/max and percentiles.
            if (timedOut) {
              timedOutCount++;
              continue;
            }
            sampledJobCount++;
            if (
              result.minOp &&
              (overallMinOp === null ||
                result.minOp.durationMs < overallMinOp.timing.durationMs)
            )
              overallMinOp = {
                docId,
                docNum,
                loop: job.loopNum,
                timing: result.minOp,
              };
            if (
              result.maxOp &&
              (overallMaxOp === null ||
                result.maxOp.durationMs > overallMaxOp.timing.durationMs)
            )
              overallMaxOp = {
                docId,
                docNum,
                loop: job.loopNum,
                timing: result.maxOp,
              };
            if (showPercentiles) allDurations.push(...result.durations);
          }
        } else {
          for (let loop = 1; loop <= opLoops; loop++) {
            const loopStartTime = performance.now();
            const loopPrefix = opLoops > 1 ? `loop ${loop}/${opLoops}: ` : "";

            if (verbose) {
              console.log(`  [${docNum}/${docCount}] ${docId} ${loopPrefix}:`);
            }

            const onProgress = (
              opNum: number,
              durationMs: number,
              batchCount: number,
            ) => {
              const batchInfo = batchCount > 1 ? ` (${batchCount} ops)` : "";
              if (verbose) {
                console.log(
                  `    op ${opNum}/${operations}: ${durationMs}ms${batchInfo}`,
                );
              } else {
                process.stdout.write(
                  `\r  [${docNum}/${docCount}] ${docId}: ${loopPrefix}${opNum}/${operations} ops`,
                );
              }
            };
            const result = await performOperations(
              client,
              docId,
              docNum,
              operations,
              batchSize,
              onProgress,
            );

            if (
              result.minOp &&
              (overallMinOp === null ||
                result.minOp.durationMs < overallMinOp.timing.durationMs)
            ) {
              overallMinOp = { docId, docNum, loop, timing: result.minOp };
            }
            if (
              result.maxOp &&
              (overallMaxOp === null ||
                result.maxOp.durationMs > overallMaxOp.timing.durationMs)
            ) {
              overallMaxOp = { docId, docNum, loop, timing: result.maxOp };
            }
            if (showPercentiles) {
              allDurations.push(...result.durations);
            }

            const loopDurationMs = performance.now() - loopStartTime;
            const loopDuration = (loopDurationMs / 1000).toFixed(2);
            const msPerOp = (loopDurationMs / operations).toFixed(0);

            const minMax =
              result.minOp && result.maxOp
                ? showActionTypes
                  ? `, min: ${result.minOp.durationMs}ms (${result.minOp.actionType}), max: ${result.maxOp.durationMs}ms (${result.maxOp.actionType})`
                  : `, min: ${result.minOp.durationMs}ms, max: ${result.maxOp.durationMs}ms`
                : "";

            const loopPercentiles = showPercentiles
              ? calculatePercentiles(result.durations)
              : null;
            const percentilesStr = loopPercentiles
              ? `\n      ${formatPercentiles(loopPercentiles)}`
              : "";

            if (verbose) {
              console.log(
                `    Done: ${loopDuration}s, ${msPerOp}ms/op${minMax}${percentilesStr}`,
              );
            } else {
              process.stdout.write(
                ` (${loopDuration}s, ${msPerOp}ms/op${minMax})${percentilesStr}\n`,
              );
            }
          }
        }
      }

      const opsDurationMs = performance.now() - opsStartTime;
      const opsDuration = (opsDurationMs / 1000).toFixed(2);
      const avgMsPerOp = (opsDurationMs / totalOps).toFixed(0);
      const phase2Memory = getMemoryStats();
      const overallMinMax =
        overallMinOp && overallMaxOp
          ? showActionTypes
            ? `, min: ${overallMinOp.timing.durationMs}ms (${overallMinOp.timing.actionType}), max: ${overallMaxOp.timing.durationMs}ms (${overallMaxOp.timing.actionType})`
            : `, min: ${overallMinOp.timing.durationMs}ms, max: ${overallMaxOp.timing.durationMs}ms`
          : "";
      const timedOutStr =
        timedOutCount > 0 ? `, timed-out jobs: ${timedOutCount}` : "";
      const sampledStr =
        sampledJobCount > 0
          ? ` (stats from ${sampledJobCount} sampled jobs)`
          : "";
      console.log(
        `  Completed ${totalOps} operations in ${opsDuration}s (avg: ${avgMsPerOp}ms/op${overallMinMax}${timedOutStr})${sampledStr}`,
      );
      if (showPercentiles) {
        const percentiles = calculatePercentiles(allDurations);
        if (percentiles) {
          console.log(
            `  Overall percentiles: ${formatPercentiles(percentiles)}`,
          );
        }
      }
      console.log(`  Memory: ${formatMemory(phase2Memory)}`);
    }

    const finalMemory = getMemoryStats();
    const totalDuration = (
      (performance.now() - overallStartTime) /
      1000
    ).toFixed(2);
    const heapDelta = finalMemory.heapUsed - initialMemory.heapUsed;
    const rssDelta = finalMemory.rss - initialMemory.rss;
    console.log(`\nDone! Total time: ${totalDuration}s`);
    console.log(
      `Memory delta: heap: ${heapDelta >= 0 ? "+" : ""}${formatBytes(heapDelta)}, rss: ${rssDelta >= 0 ? "+" : ""}${formatBytes(rssDelta)}`,
    );
  } finally {
    if (outputStream) {
      process.stdout.write = origStdoutWrite;
      process.stderr.write = origStderrWrite;
      if (pendingLine) {
        outputStream.write(pendingLine + "\n");
      }
      outputStream.end();
    }
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
