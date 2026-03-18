#!/usr/bin/env tsx
/**
 * Diagnostic variant of docs-create.ts that bypasses Apollo/GraphQL entirely.
 *
 * Documents are still created via GraphQL. Mutations are sent directly to
 * Express endpoints that call the reactor client with no GraphQL parsing,
 * schema validation, or federation overhead:
 *
 *   POST /reactor/mutate        — calls execute(), blocks until READ_READY
 *                                 (mirrors non-async GraphQL mutation)
 *   POST /reactor/mutate-async  — calls executeAsync(), returns jobId
 *                                 immediately (mirrors --async GraphQL mode)
 *
 * --async mode derives the async endpoint from --direct-endpoint by appending
 * "-async", so a single flag controls both.
 *
 * If client round-trip stays flat but docs-create.ts (GraphQL) grows,
 * Apollo is the bottleneck. If both grow, the bottleneck is inside the
 * reactor itself.
 *
 * Usage: tsx docs-create-direct.ts [N] [options]
 */

import { GraphQLClient } from "graphql-request";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { basename, dirname, join } from "node:path";

const DEFAULT_GRAPHQL_ENDPOINT = "http://localhost:4001/graphql";
const DEFAULT_DIRECT_ENDPOINT = "http://localhost:4001/reactor/mutate";
const GRAPHQL_TIMEOUT_MS = 30_000;

// Mirror the same action cycle as docs-create.ts, using native action format.
const ACTION_CONFIGS = [
  {
    name: "setModelName",
    buildAction: (docIndex: number, opIndex: number) => ({
      type: "SET_MODEL_NAME",
      scope: "global",
      input: { name: `Model-${docIndex}-op${opIndex}` },
    }),
  },
  {
    name: "setModelDescription",
    buildAction: (docIndex: number, opIndex: number) => ({
      type: "SET_MODEL_DESCRIPTION",
      scope: "global",
      input: {
        description: `Description for document ${docIndex}, operation ${opIndex}`,
      },
    }),
  },
  {
    name: "setAuthorName",
    buildAction: (docIndex: number, opIndex: number) => ({
      type: "SET_AUTHOR_NAME",
      scope: "global",
      input: { authorName: `Author-${docIndex}-op${opIndex}` },
    }),
  },
  {
    name: "setAuthorWebsite",
    buildAction: (docIndex: number, opIndex: number) => ({
      type: "SET_AUTHOR_WEBSITE",
      scope: "global",
      input: { authorWebsite: `https://example-${docIndex}-${opIndex}.com` },
    }),
  },
  {
    name: "setModelExtension",
    buildAction: (_docIndex: number, opIndex: number) => ({
      type: "SET_MODEL_EXTENSION",
      scope: "global",
      input: { extension: `.ext${opIndex}` },
    }),
  },
  {
    name: "setModelId",
    buildAction: (docIndex: number, opIndex: number) => ({
      type: "SET_MODEL_ID",
      scope: "global",
      input: { id: `org/model-${docIndex}-v${opIndex}` },
    }),
  },
];

interface CreateDocumentResponse {
  DocumentModel_createEmptyDocument: { id: string };
}

interface DirectMuteSyncResponse {
  durationMs: number;
}

interface DirectMuteAsyncResponse {
  jobId: string;
  durationMs: number;
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

// Mirrors OperationTiming from docs-create.ts, extended with server-side timing.
interface RequestTiming {
  opIndex: number;
  clientMs: number;
  serverMs: number;
  actionType: string;
}

// Mirrors OperationsResult from docs-create.ts, with dual timing arrays.
interface OperationsResult {
  minOp: RequestTiming | null;
  maxOp: RequestTiming | null;
  clientDurations: number[];
  serverDurations: number[];
}

interface JobStatusResponse {
  jobStatus: { status: string; completedAt: string | null };
}

interface SampledJob {
  jobId: string;
  dispatchedAt: number;
  batchEnd: number;
  batchCount: number;
  actionType: string;
  loopNum: number;
  reqNum: number;
}

const JOB_STATUS_QUERY = `
  query GetJobStatus($jobId: String!) {
    jobStatus(jobId: $jobId) { status completedAt }
  }
`;
const TERMINAL_JOB_STATUSES = new Set(["WRITE_READY", "READ_READY", "FAILED"]);
const JOB_POLL_INTERVAL_MS = 5;

function getMemoryStats(): MemoryStats {
  const mem = process.memoryUsage();
  return { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss };
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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

async function createDocument(client: GraphQLClient): Promise<string> {
  const { DocumentModel_createEmptyDocument } =
    await client.request<CreateDocumentResponse>({
      document: `mutation CreateDocument { DocumentModel_createEmptyDocument { id } }`,
      signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
    });
  return DocumentModel_createEmptyDocument.id;
}

async function sendMutate(
  endpoint: string,
  documentId: string,
  branch: string,
  actions: unknown[],
): Promise<DirectMuteSyncResponse> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, branch, actions }),
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<DirectMuteSyncResponse>;
}

async function sendMutateAsync(
  endpoint: string,
  documentId: string,
  branch: string,
  actions: unknown[],
): Promise<DirectMuteAsyncResponse> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, branch, actions }),
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<DirectMuteAsyncResponse>;
}

type RequestDescriptor = {
  actions: unknown[];
  batchEnd: number;
  batchCount: number;
  actionType: string;
};

function buildRequests(
  documentId: string,
  docIndex: number,
  operationCount: number,
  batchSize: number,
): RequestDescriptor[] {
  const requests: RequestDescriptor[] = [];
  for (let i = 0; i < operationCount; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, operationCount);
    const batchCount = batchEnd - i;
    const actions: unknown[] = [];
    const actionTypes: string[] = [];

    for (let j = i; j < batchEnd; j++) {
      const config = ACTION_CONFIGS[(j + 1) % ACTION_CONFIGS.length];
      actions.push(config.buildAction(docIndex, j + 1));
      actionTypes.push(config.name);
    }

    requests.push({
      actions,
      batchEnd,
      batchCount,
      actionType: batchCount === 1 ? actionTypes[0] : `batch(${batchCount})`,
    });
  }
  return requests;
}

async function performOperations(
  syncEndpoint: string,
  documentId: string,
  docIndex: number,
  operationCount: number,
  batchSize: number,
  branch: string,
  onProgress: (
    opNum: number,
    clientMs: number,
    serverMs: number,
    batchCount: number,
  ) => void,
): Promise<OperationsResult> {
  let minOp: RequestTiming | null = null;
  let maxOp: RequestTiming | null = null;
  const clientDurations: number[] = [];
  const serverDurations: number[] = [];

  const requests = buildRequests(
    documentId,
    docIndex,
    operationCount,
    batchSize,
  );

  for (const req of requests) {
    const t0 = performance.now();
    const response = await sendMutate(
      syncEndpoint,
      documentId,
      branch,
      req.actions,
    );
    const clientMs = performance.now() - t0;
    const serverMs = response.durationMs;
    const perOpClientMs = clientMs / req.batchCount;
    const perOpServerMs = serverMs / req.batchCount;

    for (let j = 0; j < req.batchCount; j++) {
      clientDurations.push(perOpClientMs);
      serverDurations.push(perOpServerMs);
    }

    const timing: RequestTiming = {
      opIndex: req.batchEnd,
      clientMs: perOpClientMs,
      serverMs: perOpServerMs,
      actionType: req.actionType,
    };

    if (minOp === null || perOpClientMs < minOp.clientMs) minOp = timing;
    if (maxOp === null || perOpClientMs > maxOp.clientMs) maxOp = timing;

    onProgress(req.batchEnd, clientMs, serverMs, req.batchCount);
  }

  return { minOp, maxOp, clientDurations, serverDurations };
}

async function pollJobAsync(
  gqlClient: GraphQLClient,
  job: SampledJob,
  timeoutMs: number,
): Promise<{ totalMs: number; timedOut: boolean }> {
  const deadline = performance.now() + timeoutMs;
  let timedOut = false;
  while (true) {
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
    const { jobStatus } = await gqlClient.request<JobStatusResponse>({
      document: JOB_STATUS_QUERY,
      variables: { jobId: job.jobId },
      signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
    });
    if (
      TERMINAL_JOB_STATUSES.has(jobStatus.status) ||
      jobStatus.completedAt !== null
    )
      break;
  }
  return { totalMs: performance.now() - job.dispatchedAt, timedOut };
}

function parseArgs(args: string[]): {
  count: number;
  operations: number;
  opLoops: number;
  batchSize: number;
  graphqlEndpoint: string;
  directEndpoint: string;
  branch: string;
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
  let graphqlEndpoint = DEFAULT_GRAPHQL_ENDPOINT;
  let directEndpoint = DEFAULT_DIRECT_ENDPOINT;
  let branch = "main";
  const docIds: string[] = [];
  let asyncMutate = false;
  let asyncPollRate = 100;
  let asyncTimeoutMs = 30_000;
  let verbose = false;
  let percentiles = false;
  let showActionTypes = false;
  let output: string | undefined;
  let outputTimestamp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      graphqlEndpoint = args[++i];
    } else if (arg === "--direct-endpoint" && args[i + 1]) {
      directEndpoint = args[++i];
    } else if (arg === "--branch" && args[i + 1]) {
      branch = args[++i];
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
        output = "docs-create-direct.txt";
      }
      outputTimestamp = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx docs-create-direct.ts [N] [options]

Bypasses Apollo and calls POST /reactor/mutate-async directly.
Use this to isolate whether Apollo overhead is causing latency growth.
Documents are still created via GraphQL.

Arguments:
  N                         Number of documents to create (default: 10)

Options:
  --operations, -o <M>      Number of operations per loop (default: 0)
  --op-loops, -l <L>        Number of operation loops per document (default: 1)
  --batch-size, -b <N>      Actions per direct request (default: 1)
                            Use higher values to measure per-request overhead
  --doc-id, -d <id>         Use existing document(s) instead of creating new ones
                            (can be specified multiple times, skips document creation)
  --endpoint <url>          GraphQL endpoint for document creation and job polling
                            (default: ${DEFAULT_GRAPHQL_ENDPOINT})
  --direct-endpoint <url>   Sync Express endpoint: POST /reactor/mutate
                            (default: ${DEFAULT_DIRECT_ENDPOINT})
                            The async endpoint is derived automatically by
                            appending "-async" to this URL.
  --branch <name>           Document branch (default: main)
  --async [N]               Use POST /reactor/mutate-async and poll every Nth
                            request for E2E latency via GraphQL jobStatus
                            (default N=100).
  --async-timeout <ms>      Max ms to wait for a polled job to reach a terminal
                            status (default: 30000)
  --verbose, -v             Show detailed per-request timings
  --percentiles, -p         Show percentile statistics (p50, p90, p95, p99)
  --show-action-types, -a   Show action type names in min/max timings
  --file [name]             Write output to a timestamped file (default: docs-create-direct.txt)
  --output, -O <file>       Write output to a specific file (no timestamp prefix)
  --help, -h                Show this help message

Timings reported:
  client ms  Full HTTP round-trip from before fetch() to after response
  server ms  Time inside executeAsync() as reported by the endpoint
  async ms   Wall-clock from before dispatch to job reaching READ_READY (--async only)

Examples:
  tsx docs-create-direct.ts 1 -o 25 -l 1000
  tsx docs-create-direct.ts 1 -o 25 -l 1000 --async
  tsx docs-create-direct.ts --doc-id <id> -o 25 -l 1000
  tsx docs-create-direct.ts 1 -o 25 -l 1000 --verbose --percentiles
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
      "Error: Document count must be a positive integer (>= 1) when --doc-id is not provided.",
    );
    process.exit(1);
  }
  if (isNaN(operations) || operations < 0) {
    console.error(
      "Error: Invalid operations value: must be a non-negative integer.",
    );
    process.exit(1);
  }
  if (isNaN(opLoops) || opLoops < 1) {
    console.error(
      "Error: Invalid op-loops value: must be a positive integer (>= 1).",
    );
    process.exit(1);
  }
  if (isNaN(batchSize) || batchSize < 1) {
    console.error(
      "Error: Invalid batch-size value: must be a positive integer (>= 1).",
    );
    process.exit(1);
  }
  if (
    isNaN(asyncTimeoutMs) ||
    asyncTimeoutMs < 1 ||
    !Number.isInteger(asyncTimeoutMs)
  ) {
    console.error(
      "Error: Invalid --async-timeout value: must be a positive integer (ms).",
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
    graphqlEndpoint,
    directEndpoint,
    branch,
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
    graphqlEndpoint,
    directEndpoint,
    branch,
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
      `Command: tsx docs-create-direct.ts ${process.argv.slice(2).join(" ")}`,
    );
    console.log(
      `GraphQL endpoint (doc creation / job polling): ${graphqlEndpoint}`,
    );
    if (asyncMutate) {
      console.log(
        `Direct endpoint  (mutations, async):           ${directEndpoint}-async`,
      );
    } else {
      console.log(
        `Direct endpoint  (mutations, sync):            ${directEndpoint}`,
      );
    }

    const gqlClient = new GraphQLClient(graphqlEndpoint);
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
      console.log(`\nPhase 1: Creating ${count} documents via GraphQL...`);
      const createStartTime = performance.now();
      documentIds = [];

      for (let i = 0; i < count; i++) {
        const id = await createDocument(gqlClient);
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
        `\n${phaseLabel}: Performing ${operations} operations${loopLabel}${batchLabel} on each document (direct)...`,
      );
      const opsStartTime = performance.now();
      const totalOps = docCount * operations * opLoops;

      let overallMinOp: {
        docId: string;
        docNum: number;
        loop: number;
        timing: RequestTiming;
      } | null = null;
      let overallMaxOp: {
        docId: string;
        docNum: number;
        loop: number;
        timing: RequestTiming;
      } | null = null;
      const allClientDurations: number[] = [];
      const allServerDurations: number[] = [];
      let timedOutCount = 0;
      let sampledJobCount = 0;

      for (let i = 0; i < documentIds.length; i++) {
        const docNum = i + 1;
        const docId = documentIds[i];

        if (asyncMutate && operations > 0) {
          const totalRequests = opLoops * Math.ceil(operations / batchSize);
          const pollPromises: Promise<{
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
            );

            for (const req of requests) {
              globalReqNum++;
              const dispatchedAt = performance.now();
              const response = await sendMutateAsync(
                directEndpoint + "-async",
                docId,
                branch,
                req.actions,
              );
              const jobId = response.jobId;
              if (!jobId) {
                throw new Error(
                  `Missing jobId in response for request ${globalReqNum}`,
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
                  pollJobAsync(gqlClient, job, asyncTimeoutMs).then((r) => {
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
          for (const { totalMs, timedOut, job } of allPollResults) {
            if (timedOut) {
              timedOutCount++;
              continue;
            }
            sampledJobCount++;
            const perOpMs = totalMs / job.batchCount;
            const timing: RequestTiming = {
              opIndex: job.batchEnd,
              clientMs: perOpMs,
              serverMs: 0,
              actionType: job.actionType,
            };
            if (overallMinOp === null || perOpMs < overallMinOp.timing.clientMs)
              overallMinOp = { docId, docNum, loop: job.loopNum, timing };
            if (overallMaxOp === null || perOpMs > overallMaxOp.timing.clientMs)
              overallMaxOp = { docId, docNum, loop: job.loopNum, timing };
            if (showPercentiles) allClientDurations.push(perOpMs);
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
              clientMs: number,
              serverMs: number,
              batchCount: number,
            ) => {
              const batchInfo = batchCount > 1 ? ` (${batchCount} ops)` : "";
              if (verbose) {
                console.log(
                  `    op ${opNum}/${operations}: client=${clientMs.toFixed(1)}ms server=${serverMs.toFixed(1)}ms${batchInfo}`,
                );
              } else {
                process.stdout.write(
                  `\r  [${docNum}/${docCount}] ${docId}: ${loopPrefix}${opNum}/${operations} ops`,
                );
              }
            };

            const result = await performOperations(
              directEndpoint, // sync endpoint: /reactor/mutate
              docId,
              docNum,
              operations,
              batchSize,
              branch,
              onProgress,
            );

            if (
              result.minOp &&
              (overallMinOp === null ||
                result.minOp.clientMs < overallMinOp.timing.clientMs)
            ) {
              overallMinOp = { docId, docNum, loop, timing: result.minOp };
            }
            if (
              result.maxOp &&
              (overallMaxOp === null ||
                result.maxOp.clientMs > overallMaxOp.timing.clientMs)
            ) {
              overallMaxOp = { docId, docNum, loop, timing: result.maxOp };
            }
            if (showPercentiles) {
              allClientDurations.push(...result.clientDurations);
              allServerDurations.push(...result.serverDurations);
            }

            const loopDurationMs = performance.now() - loopStartTime;
            const loopDuration = (loopDurationMs / 1000).toFixed(2);
            const msPerOp = (loopDurationMs / operations).toFixed(0);

            const minMaxClient =
              result.minOp && result.maxOp
                ? showActionTypes
                  ? `, client min: ${result.minOp.clientMs.toFixed(1)}ms (${result.minOp.actionType}), max: ${result.maxOp.clientMs.toFixed(1)}ms (${result.maxOp.actionType})`
                  : `, client min: ${result.minOp.clientMs.toFixed(1)}ms, max: ${result.maxOp.clientMs.toFixed(1)}ms`
                : "";
            const minMaxServer =
              result.minOp && result.maxOp
                ? showActionTypes
                  ? `, server min: ${result.minOp.serverMs.toFixed(1)}ms (${result.minOp.actionType}), max: ${result.maxOp.serverMs.toFixed(1)}ms (${result.maxOp.actionType})`
                  : `, server min: ${result.minOp.serverMs.toFixed(1)}ms, max: ${result.maxOp.serverMs.toFixed(1)}ms`
                : "";

            const loopClientPercentiles = showPercentiles
              ? calculatePercentiles(result.clientDurations)
              : null;
            const loopServerPercentiles = showPercentiles
              ? calculatePercentiles(result.serverDurations)
              : null;
            const percentilesStr = loopClientPercentiles
              ? `\n      client ${formatPercentiles(loopClientPercentiles)}` +
                (loopServerPercentiles
                  ? `\n      server ${formatPercentiles(loopServerPercentiles)}`
                  : "")
              : "";

            if (verbose) {
              console.log(
                `    Done: ${loopDuration}s, ${msPerOp}ms/op${minMaxClient}${minMaxServer}${percentilesStr}`,
              );
            } else {
              process.stdout.write(
                ` (${loopDuration}s, ${msPerOp}ms/op${minMaxClient}${minMaxServer})${percentilesStr}\n`,
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
            ? `, min: ${overallMinOp.timing.clientMs.toFixed(1)}ms (${overallMinOp.timing.actionType}), max: ${overallMaxOp.timing.clientMs.toFixed(1)}ms (${overallMaxOp.timing.actionType})`
            : `, min: ${overallMinOp.timing.clientMs.toFixed(1)}ms, max: ${overallMaxOp.timing.clientMs.toFixed(1)}ms`
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

      if (showPercentiles && allClientDurations.length > 0) {
        const cp = calculatePercentiles(allClientDurations);
        if (cp) console.log(`  Client percentiles: ${formatPercentiles(cp)}`);
        if (!asyncMutate && allServerDurations.length > 0) {
          const sp = calculatePercentiles(allServerDurations);
          if (sp) console.log(`  Server percentiles: ${formatPercentiles(sp)}`);
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
