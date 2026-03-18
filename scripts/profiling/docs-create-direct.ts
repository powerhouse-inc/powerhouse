#!/usr/bin/env tsx
/**
 * Diagnostic variant of docs-create.ts that bypasses Apollo/GraphQL entirely.
 *
 * Documents are still created via GraphQL. Mutations are sent directly to
 * POST /reactor/mutate-async, which calls reactorClient.executeAsync() with
 * no GraphQL parsing, schema validation, or federation overhead.
 *
 * The endpoint returns { jobId, durationMs } where durationMs is the
 * server-side time inside executeAsync(). The script also records the full
 * client round-trip so both can be compared to the GraphQL path.
 *
 * If client round-trip stays flat but the GraphQL path grows, Apollo is the
 * bottleneck. If both grow, the bottleneck is inside the reactor itself.
 *
 * Usage: tsx docs-create-direct.ts [N] [options]
 */

import { GraphQLClient } from "graphql-request";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { basename, dirname, join } from "node:path";

const DEFAULT_GRAPHQL_ENDPOINT = "http://localhost:4001/graphql";
const DEFAULT_DIRECT_ENDPOINT = "http://localhost:4001/reactor/mutate-async";
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

interface DirectMutateResponse {
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

interface RequestTiming {
  reqIndex: number;
  clientMs: number;
  serverMs: number;
  actionType: string;
}

interface LoopResult {
  minClient: RequestTiming | null;
  maxClient: RequestTiming | null;
  minServer: RequestTiming | null;
  maxServer: RequestTiming | null;
  clientDurations: number[];
  serverDurations: number[];
}

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

async function sendDirectMutation(
  directEndpoint: string,
  documentId: string,
  branch: string,
  actions: unknown[],
): Promise<DirectMutateResponse> {
  const res = await fetch(directEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, branch, actions }),
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<DirectMutateResponse>;
}

async function performDirectOperations(
  directEndpoint: string,
  documentId: string,
  docIndex: number,
  operationCount: number,
  batchSize: number,
  branch: string,
  onProgress: (
    reqNum: number,
    totalReqs: number,
    clientMs: number,
    serverMs: number,
    batchCount: number,
  ) => void,
): Promise<LoopResult> {
  const result: LoopResult = {
    minClient: null,
    maxClient: null,
    minServer: null,
    maxServer: null,
    clientDurations: [],
    serverDurations: [],
  };

  const totalReqs = Math.ceil(operationCount / batchSize);
  let reqNum = 0;

  for (let i = 0; i < operationCount; i += batchSize) {
    reqNum++;
    const batchEnd = Math.min(i + batchSize, operationCount);
    const batchCount = batchEnd - i;
    const actions: unknown[] = [];
    const actionTypes: string[] = [];

    for (let j = i; j < batchEnd; j++) {
      const config = ACTION_CONFIGS[(j + 1) % ACTION_CONFIGS.length];
      actions.push(config.buildAction(docIndex, j + 1));
      actionTypes.push(config.name);
    }

    const actionType =
      batchCount === 1 ? actionTypes[0] : `batch(${batchCount})`;

    const t0 = performance.now();
    const response = await sendDirectMutation(
      directEndpoint,
      documentId,
      branch,
      actions,
    );
    const clientMs = performance.now() - t0;
    const serverMs = response.durationMs;

    result.clientDurations.push(clientMs / batchCount);
    result.serverDurations.push(serverMs / batchCount);

    const timing: RequestTiming = {
      reqIndex: batchEnd,
      clientMs: clientMs / batchCount,
      serverMs: serverMs / batchCount,
      actionType,
    };

    if (
      result.minClient === null ||
      timing.clientMs < result.minClient.clientMs
    )
      result.minClient = timing;
    if (
      result.maxClient === null ||
      timing.clientMs > result.maxClient.clientMs
    )
      result.maxClient = timing;
    if (
      result.minServer === null ||
      timing.serverMs < result.minServer.serverMs
    )
      result.minServer = timing;
    if (
      result.maxServer === null ||
      timing.serverMs > result.maxServer.serverMs
    )
      result.maxServer = timing;

    onProgress(reqNum, totalReqs, clientMs, serverMs, batchCount);
  }

  return result;
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
  verbose: boolean;
  percentiles: boolean;
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
  let verbose = false;
  let percentiles = false;
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
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--percentiles" || arg === "-p") {
      percentiles = true;
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

Arguments:
  N                         Number of documents to create (default: 10)

Options:
  --operations, -o <M>      Number of operations per loop (default: 0)
  --op-loops, -l <L>        Number of operation loops per document (default: 1)
  --batch-size, -b <N>      Actions per direct request (default: 1)
  --doc-id, -d <id>         Use existing document(s), skip creation
                            (can be specified multiple times)
  --endpoint <url>          GraphQL endpoint for document creation
                            (default: ${DEFAULT_GRAPHQL_ENDPOINT})
  --direct-endpoint <url>   Direct Express endpoint for mutations
                            (default: ${DEFAULT_DIRECT_ENDPOINT})
  --branch <name>           Document branch (default: main)
  --verbose, -v             Show per-request client and server timings
  --percentiles, -p         Show percentile statistics (p50/p90/p95/p99)
  --file [name]             Write output to a timestamped file
  --output, -O <file>       Write output to a specific file
  --help, -h                Show this help message

Timings reported:
  client ms  Full round-trip from before fetch() to after response
  server ms  Time inside executeAsync() as reported by the endpoint

Examples:
  tsx docs-create-direct.ts 1 -o 25 -l 1000
  tsx docs-create-direct.ts --doc-id <id> -o 25 -l 1000
  tsx docs-create-direct.ts 1 -o 25 -l 1000 --verbose
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
      "Error: Document count must be >= 1 when --doc-id is not provided.",
    );
    process.exit(1);
  }
  if (isNaN(operations) || operations < 0) {
    console.error("Error: --operations must be a non-negative integer.");
    process.exit(1);
  }
  if (isNaN(opLoops) || opLoops < 1) {
    console.error("Error: --op-loops must be >= 1.");
    process.exit(1);
  }
  if (isNaN(batchSize) || batchSize < 1) {
    console.error("Error: --batch-size must be >= 1.");
    process.exit(1);
  }
  if (operations === 0 && opLoops > 1) {
    console.warn("Warning: --op-loops has no effect when operations is 0.");
  }
  if (docIds.length > 0 && operations === 0) {
    console.warn(
      "Warning: --doc-id specified but no operations to perform (use --operations).",
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
    verbose,
    percentiles,
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
    verbose,
    percentiles: showPercentiles,
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
          pendingLine = part.split("\r").at(-1) ?? "";
        } else {
          outputStream!.write(
            pendingLine + (part.split("\r").at(-1) ?? "") + "\n",
          );
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
    console.log(`GraphQL endpoint: ${graphqlEndpoint}`);
    console.log(`Direct endpoint:  ${directEndpoint}`);

    const gqlClient = new GraphQLClient(graphqlEndpoint);
    const useExistingDocs = docIds.length > 0;

    const initialMemory = getMemoryStats();
    console.log(`\nInitial memory: ${formatMemory(initialMemory)}`);

    const overallStart = performance.now();
    let documentIds: string[];

    if (useExistingDocs) {
      documentIds = docIds;
      console.log(`\nUsing ${documentIds.length} existing document(s):`);
      documentIds.forEach((id) => console.log(`  - ${id}`));
    } else {
      console.log(`\nPhase 1: Creating ${count} documents via GraphQL...`);
      const createStart = performance.now();
      documentIds = [];
      for (let i = 0; i < count; i++) {
        const id = await createDocument(gqlClient);
        documentIds.push(id);
        process.stdout.write(`\r  Progress: ${i + 1}/${count}`);
      }
      const createMs = performance.now() - createStart;
      console.log(
        `\n  Created ${count} documents in ${(createMs / 1000).toFixed(2)}s (avg: ${(createMs / count).toFixed(0)}ms/doc)`,
      );
      console.log(`  Memory: ${formatMemory(getMemoryStats())}`);
    }

    if (operations > 0) {
      const docCount = documentIds.length;
      const loopLabel = opLoops > 1 ? ` x ${opLoops} loops` : "";
      const batchLabel = batchSize > 1 ? ` (batch size: ${batchSize})` : "";
      const phaseLabel = useExistingDocs ? "Operations" : "Phase 2";
      console.log(
        `\n${phaseLabel}: Performing ${operations} operations${loopLabel}${batchLabel} on each document (direct)...`,
      );

      const opsStart = performance.now();
      const totalOps = docCount * operations * opLoops;

      let overallMinClient: {
        docId: string;
        docNum: number;
        loop: number;
        timing: RequestTiming;
      } | null = null;
      let overallMaxClient: {
        docId: string;
        docNum: number;
        loop: number;
        timing: RequestTiming;
      } | null = null;
      let overallMinServer: {
        docId: string;
        docNum: number;
        loop: number;
        timing: RequestTiming;
      } | null = null;
      let overallMaxServer: {
        docId: string;
        docNum: number;
        loop: number;
        timing: RequestTiming;
      } | null = null;

      const allClientDurations: number[] = [];
      const allServerDurations: number[] = [];

      for (let i = 0; i < documentIds.length; i++) {
        const docNum = i + 1;
        const docId = documentIds[i];

        for (let loop = 1; loop <= opLoops; loop++) {
          const loopStart = performance.now();
          const loopPrefix = opLoops > 1 ? `loop ${loop}/${opLoops}: ` : "";
          const totalReqs = Math.ceil(operations / batchSize);

          if (verbose) {
            console.log(`  [${docNum}/${docCount}] ${docId} ${loopPrefix}:`);
          }

          const onProgress = (
            reqNum: number,
            _totalReqs: number,
            clientMs: number,
            serverMs: number,
            batchCount: number,
          ) => {
            const batchInfo = batchCount > 1 ? ` (${batchCount} ops)` : "";
            if (verbose) {
              console.log(
                `    req ${reqNum}: client=${clientMs.toFixed(1)}ms server=${serverMs.toFixed(1)}ms${batchInfo}`,
              );
            } else {
              process.stdout.write(
                `\r  [${docNum}/${docCount}] ${docId}: ${loopPrefix}${reqNum}/${totalReqs} reqs`,
              );
            }
          };

          const loopResult = await performDirectOperations(
            directEndpoint,
            docId,
            docNum,
            operations,
            batchSize,
            branch,
            onProgress,
          );

          if (loopResult.minClient) {
            if (
              overallMinClient === null ||
              loopResult.minClient.clientMs < overallMinClient.timing.clientMs
            )
              overallMinClient = {
                docId,
                docNum,
                loop,
                timing: loopResult.minClient,
              };
          }
          if (loopResult.maxClient) {
            if (
              overallMaxClient === null ||
              loopResult.maxClient.clientMs > overallMaxClient.timing.clientMs
            )
              overallMaxClient = {
                docId,
                docNum,
                loop,
                timing: loopResult.maxClient,
              };
          }
          if (loopResult.minServer) {
            if (
              overallMinServer === null ||
              loopResult.minServer.serverMs < overallMinServer.timing.serverMs
            )
              overallMinServer = {
                docId,
                docNum,
                loop,
                timing: loopResult.minServer,
              };
          }
          if (loopResult.maxServer) {
            if (
              overallMaxServer === null ||
              loopResult.maxServer.serverMs > overallMaxServer.timing.serverMs
            )
              overallMaxServer = {
                docId,
                docNum,
                loop,
                timing: loopResult.maxServer,
              };
          }

          if (showPercentiles) {
            allClientDurations.push(...loopResult.clientDurations);
            allServerDurations.push(...loopResult.serverDurations);
          }

          const loopMs = performance.now() - loopStart;
          const avgClientMs = (
            loopResult.clientDurations.reduce((a, b) => a + b, 0) /
            loopResult.clientDurations.length
          ).toFixed(1);
          const avgServerMs = (
            loopResult.serverDurations.reduce((a, b) => a + b, 0) /
            loopResult.serverDurations.length
          ).toFixed(1);

          const minMaxStr =
            loopResult.minClient && loopResult.maxClient
              ? `, client min/max: ${loopResult.minClient.clientMs.toFixed(1)}/${loopResult.maxClient.clientMs.toFixed(1)}ms`
              : "";
          const serverMinMaxStr =
            loopResult.minServer && loopResult.maxServer
              ? `, server min/max: ${loopResult.minServer.serverMs.toFixed(1)}/${loopResult.maxServer.serverMs.toFixed(1)}ms`
              : "";

          const loopPercentiles = showPercentiles
            ? calculatePercentiles(loopResult.clientDurations)
            : null;
          const percentilesStr = loopPercentiles
            ? `\n      client ${formatPercentiles(loopPercentiles)}`
            : "";

          if (verbose) {
            console.log(
              `    Done: ${(loopMs / 1000).toFixed(2)}s, avg client=${avgClientMs}ms/op server=${avgServerMs}ms/op${minMaxStr}${serverMinMaxStr}${percentilesStr}`,
            );
          } else {
            process.stdout.write(
              ` (${(loopMs / 1000).toFixed(2)}s, client avg=${avgClientMs}ms server avg=${avgServerMs}ms${minMaxStr})${percentilesStr}\n`,
            );
          }
        }
      }

      const opsMs = performance.now() - opsStart;
      const avgMsPerOp = (opsMs / totalOps).toFixed(0);
      const overallMinMaxStr =
        overallMinClient && overallMaxClient
          ? `, client min: ${overallMinClient.timing.clientMs.toFixed(1)}ms, max: ${overallMaxClient.timing.clientMs.toFixed(1)}ms`
          : "";
      const overallServerStr =
        overallMinServer && overallMaxServer
          ? `, server min: ${overallMinServer.timing.serverMs.toFixed(1)}ms, max: ${overallMaxServer.timing.serverMs.toFixed(1)}ms`
          : "";

      console.log(
        `  Completed ${totalOps} operations in ${(opsMs / 1000).toFixed(2)}s (avg client: ${avgMsPerOp}ms/op${overallMinMaxStr}${overallServerStr})`,
      );

      if (showPercentiles) {
        const cp = calculatePercentiles(allClientDurations);
        const sp = calculatePercentiles(allServerDurations);
        if (cp) console.log(`  Client percentiles: ${formatPercentiles(cp)}`);
        if (sp) console.log(`  Server percentiles: ${formatPercentiles(sp)}`);
      }

      console.log(`  Memory: ${formatMemory(getMemoryStats())}`);
    }

    const finalMemory = getMemoryStats();
    const totalDuration = ((performance.now() - overallStart) / 1000).toFixed(
      2,
    );
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
      if (pendingLine) outputStream.write(pendingLine + "\n");
      outputStream.end();
    }
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
