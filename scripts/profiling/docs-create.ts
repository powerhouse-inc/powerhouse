#!/usr/bin/env tsx
/**
 * Script to create N documents and perform M operations on each
 * Usage: tsx docs-create.ts [N] [--operations M] [--endpoint <url>] [--documentType <type>]
 *
 * Process flow:
 *   1. Create N documents
 *   2. For each document, perform M operations
 *
 * Documents are created without drive association due to server limitations
 * with drive initialization.
 */

import { GraphQLClient, gql } from "graphql-request";

const DEFAULT_ENDPOINT = "http://localhost:4001/graphql";

const CREATE_DOCUMENT = gql`
  mutation CreateDocument($documentType: String!) {
    createEmptyDocument(documentType: $documentType) {
      id
    }
  }
`;

const RENAME_DOCUMENT = gql`
  mutation RenameDocument($id: String!, $name: String!) {
    renameDocument(documentIdentifier: $id, name: $name) {
      id
    }
  }
`;

const MUTATE_DOCUMENT = gql`
  mutation MutateDocument(
    $documentIdentifier: String!
    $actions: [JSONObject!]!
  ) {
    mutateDocument(documentIdentifier: $documentIdentifier, actions: $actions) {
      id
    }
  }
`;

const GET_DOCUMENT_MODELS = gql`
  query GetDocumentModels {
    documentModels {
      items {
        id
        name
      }
    }
  }
`;

interface CreateDocumentResponse {
  createEmptyDocument: { id: string };
}

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  rss: number;
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

function createOperation(docIndex: number, opIndex: number): object {
  // Cycle through different operation types for variety
  const operations = [
    {
      type: "SET_MODEL_NAME",
      input: { name: `Model-${docIndex}-op${opIndex}` },
      scope: "global",
    },
    {
      type: "SET_MODEL_DESCRIPTION",
      input: {
        description: `Description for document ${docIndex}, operation ${opIndex}`,
      },
      scope: "global",
    },
    {
      type: "SET_AUTHOR_NAME",
      input: { authorName: `Author-${docIndex}-op${opIndex}` },
      scope: "global",
    },
    {
      type: "SET_AUTHOR_WEBSITE",
      input: { authorWebsite: `https://example-${docIndex}-${opIndex}.com` },
      scope: "global",
    },
    {
      type: "SET_MODEL_EXTENSION",
      input: { extension: `.ext${opIndex}` },
      scope: "global",
    },
    {
      type: "SET_MODEL_ID",
      input: { id: `org/model-${docIndex}-v${opIndex}` },
      scope: "global",
    },
  ];

  return operations[opIndex % operations.length];
}

interface DocumentModelsResponse {
  documentModels: { items: Array<{ id: string; name: string }> };
}

async function getDefaultDocumentType(
  client: GraphQLClient,
): Promise<string | null> {
  const { documentModels } =
    await client.request<DocumentModelsResponse>(GET_DOCUMENT_MODELS);
  return documentModels.items[0]?.id ?? null;
}

async function createDocument(
  client: GraphQLClient,
  documentType: string,
  name: string,
): Promise<string> {
  const { createEmptyDocument } = await client.request<CreateDocumentResponse>(
    CREATE_DOCUMENT,
    { documentType },
  );

  await client.request(RENAME_DOCUMENT, { id: createEmptyDocument.id, name });
  return createEmptyDocument.id;
}

interface OperationTiming {
  opIndex: number;
  durationMs: number;
  action: object;
}

interface Percentiles {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
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

interface OperationsResult {
  minOp: OperationTiming | null;
  maxOp: OperationTiming | null;
  durations: number[];
}

async function performOperations(
  client: GraphQLClient,
  documentId: string,
  docIndex: number,
  operationCount: number,
  onProgress: (opNum: number, action: object, durationMs: number) => void,
): Promise<OperationsResult> {
  let minOp: OperationTiming | null = null;
  let maxOp: OperationTiming | null = null;
  const durations: number[] = [];

  for (let i = 0; i < operationCount; i++) {
    const action = createOperation(docIndex, i + 1);
    const opStart = Date.now();
    await client.request(MUTATE_DOCUMENT, {
      documentIdentifier: documentId,
      actions: [action],
    });
    const durationMs = Date.now() - opStart;
    durations.push(durationMs);

    const timing: OperationTiming = { opIndex: i + 1, durationMs, action };

    if (minOp === null || durationMs < minOp.durationMs) {
      minOp = timing;
    }
    if (maxOp === null || durationMs > maxOp.durationMs) {
      maxOp = timing;
    }

    onProgress(i + 1, action, durationMs);
  }

  return { minOp, maxOp, durations };
}

function parseArgs(args: string[]): {
  count: number;
  operations: number;
  opLoops: number;
  endpoint: string;
  documentType?: string;
  docIds: string[];
  verbose: boolean;
  percentiles: boolean;
} {
  let count = 10;
  let operations = 0;
  let opLoops = 1;
  let endpoint = DEFAULT_ENDPOINT;
  let documentType: string | undefined;
  const docIds: string[] = [];
  let verbose = false;
  let percentiles = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[++i];
    } else if (arg === "--documentType" && args[i + 1]) {
      documentType = args[++i];
    } else if ((arg === "--operations" || arg === "-o") && args[i + 1]) {
      operations = Number(args[++i]);
    } else if ((arg === "--op-loops" || arg === "-l") && args[i + 1]) {
      opLoops = Number(args[++i]);
    } else if ((arg === "--doc-id" || arg === "-d") && args[i + 1]) {
      docIds.push(args[++i]);
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--percentiles" || arg === "-p") {
      percentiles = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx docs-create.ts [N] [options]

Arguments:
  N                         Number of documents to create (default: 10)

Options:
  --operations, -o <M>      Number of operations per loop (default: 0)
  --op-loops, -l <L>        Number of operation loops per document (default: 1)
  --doc-id, -d <id>         Use existing document(s) instead of creating new ones
                            (can be specified multiple times, skips document creation)
  --endpoint <url>          GraphQL endpoint (default: ${DEFAULT_ENDPOINT})
  --documentType <type>     Document type for new documents (default: first available)
  --verbose, -v             Show detailed operation payloads
  --percentiles, -p         Show percentile statistics (p50, p90, p95, p99) per line
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
  tsx docs-create.ts 50 --documentType powerhouse/document-model -o 3
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

  // Validate numeric inputs
  if (count < 0) {
    console.error(`Error: Document count must be a non-negative integer.`);
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

  if (operations === 0 && opLoops > 1) {
    console.warn(
      `Warning: --op-loops=${opLoops} has no effect when operations is 0.`,
    );
  }

  return {
    count,
    operations,
    opLoops,
    endpoint,
    documentType,
    docIds,
    verbose,
    percentiles,
  };
}

async function main() {
  const {
    count,
    operations,
    opLoops,
    endpoint,
    documentType: docTypeArg,
    docIds,
    verbose,
    percentiles: showPercentiles,
  } = parseArgs(process.argv.slice(2));

  const client = new GraphQLClient(endpoint);
  const useExistingDocs = docIds.length > 0;

  // Track memory
  const initialMemory = getMemoryStats();
  console.log(`\nInitial memory: ${formatMemory(initialMemory)}`);

  const overallStartTime = Date.now();
  let documentIds: string[];

  if (useExistingDocs) {
    // Use existing documents
    documentIds = docIds;
    console.log(`\nUsing ${documentIds.length} existing document(s):`);
    documentIds.forEach((id) => console.log(`  - ${id}`));
  } else {
    // Determine document type
    let documentType = docTypeArg;
    if (!documentType) {
      const defaultType = await getDefaultDocumentType(client);
      if (!defaultType) {
        console.error("No document types available");
        process.exit(1);
      }
      documentType = defaultType;
      console.log(`Using document type: ${documentType}`);
    }

    // Phase 1: Create documents
    console.log(`\nPhase 1: Creating ${count} documents...`);
    const createStartTime = Date.now();
    documentIds = [];

    for (let i = 0; i < count; i++) {
      const id = await createDocument(client, documentType, `doc-${i + 1}`);
      documentIds.push(id);
      process.stdout.write(`\r  Progress: ${i + 1}/${count}`);
    }

    const createDurationMs = Date.now() - createStartTime;
    const createDuration = (createDurationMs / 1000).toFixed(2);
    const msPerDoc = (createDurationMs / count).toFixed(0);
    const phase1Memory = getMemoryStats();
    console.log(
      `\n  Created ${count} documents in ${createDuration}s (avg: ${msPerDoc}ms/doc)`,
    );
    console.log(`  Memory: ${formatMemory(phase1Memory)}`);
  }

  // Phase 2: Perform operations on each document
  if (operations > 0) {
    const docCount = documentIds.length;
    const loopLabel = opLoops > 1 ? ` x ${opLoops} loops` : "";
    const phaseLabel = useExistingDocs ? "Operations" : "Phase 2";
    console.log(
      `\n${phaseLabel}: Performing ${operations} operations${loopLabel} on each document...`,
    );
    const opsStartTime = Date.now();
    const totalOps = docCount * operations * opLoops;

    // Track overall min/max and all durations across all documents and loops
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

    for (let i = 0; i < documentIds.length; i++) {
      const docNum = i + 1;
      const docId = documentIds[i];

      for (let loop = 1; loop <= opLoops; loop++) {
        const loopStartTime = Date.now();
        const loopPrefix = opLoops > 1 ? `loop ${loop}/${opLoops}: ` : "";

        if (verbose) {
          console.log(`  [${docNum}/${docCount}] ${docId} ${loopPrefix}:`);
        }

        const result = await performOperations(
          client,
          docId,
          docNum,
          operations,
          (opNum, action, durationMs) => {
            if (verbose) {
              console.log(
                `    op ${opNum}/${operations}: ${durationMs}ms ${JSON.stringify(action)}`,
              );
            } else {
              process.stdout.write(
                `\r  [${docNum}/${docCount}] ${docId}: ${loopPrefix}${opNum}/${operations} ops`,
              );
            }
          },
        );

        // Update overall min/max and accumulate durations
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

        const loopDurationMs = Date.now() - loopStartTime;
        const loopDuration = (loopDurationMs / 1000).toFixed(2);
        const msPerOp = (loopDurationMs / operations).toFixed(0);

        const minMax =
          result.minOp && result.maxOp
            ? `, min: ${result.minOp.durationMs}ms, max: ${result.maxOp.durationMs}ms`
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

    const opsDurationMs = Date.now() - opsStartTime;
    const opsDuration = (opsDurationMs / 1000).toFixed(2);
    const avgMsPerOp = (opsDurationMs / totalOps).toFixed(0);
    const phase2Memory = getMemoryStats();
    const overallMinMax =
      overallMinOp && overallMaxOp
        ? `, min: ${overallMinOp.timing.durationMs}ms, max: ${overallMaxOp.timing.durationMs}ms`
        : "";
    console.log(
      `  Completed ${totalOps} operations in ${opsDuration}s (avg: ${avgMsPerOp}ms/op${overallMinMax})`,
    );
    if (showPercentiles) {
      const percentiles = calculatePercentiles(allDurations);
      if (percentiles) {
        console.log(`  Overall percentiles: ${formatPercentiles(percentiles)}`);
      }
    }
    console.log(`  Memory: ${formatMemory(phase2Memory)}`);
  }

  // Summary
  const finalMemory = getMemoryStats();
  const totalDuration = ((Date.now() - overallStartTime) / 1000).toFixed(2);
  const heapDelta = finalMemory.heapUsed - initialMemory.heapUsed;
  const rssDelta = finalMemory.rss - initialMemory.rss;
  console.log(`\nDone! Total time: ${totalDuration}s`);
  console.log(
    `Memory delta: heap: ${heapDelta >= 0 ? "+" : ""}${formatBytes(heapDelta)}, rss: ${rssDelta >= 0 ? "+" : ""}${formatBytes(rssDelta)}`,
  );
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
