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

interface OperationsResult {
  timings: OperationTiming[];
  minOp: OperationTiming | null;
  maxOp: OperationTiming | null;
}

async function performOperations(
  client: GraphQLClient,
  documentId: string,
  docIndex: number,
  operationCount: number,
  totalDocs: number,
  onProgress: (opNum: number, action: object, durationMs: number) => void,
): Promise<OperationsResult> {
  const timings: OperationTiming[] = [];
  let minOp: OperationTiming | null = null;
  let maxOp: OperationTiming | null = null;

  for (let i = 0; i < operationCount; i++) {
    const action = createOperation(docIndex, i + 1);
    const opStart = Date.now();
    await client.request(MUTATE_DOCUMENT, {
      documentIdentifier: documentId,
      actions: [action],
    });
    const durationMs = Date.now() - opStart;

    const timing: OperationTiming = { opIndex: i + 1, durationMs, action };
    timings.push(timing);

    if (minOp === null || durationMs < minOp.durationMs) {
      minOp = timing;
    }
    if (maxOp === null || durationMs > maxOp.durationMs) {
      maxOp = timing;
    }

    onProgress(i + 1, action, durationMs);
  }

  return { timings, minOp, maxOp };
}

function parseArgs(args: string[]): {
  count: number;
  operations: number;
  endpoint: string;
  documentType?: string;
  verbose: boolean;
} {
  let count = 10;
  let operations = 0;
  let endpoint = DEFAULT_ENDPOINT;
  let documentType: string | undefined;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[++i];
    } else if (arg === "--documentType" && args[i + 1]) {
      documentType = args[++i];
    } else if ((arg === "--operations" || arg === "-o") && args[i + 1]) {
      operations = Number(args[++i]);
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx docs-create.ts [N] [options]

Arguments:
  N                         Number of documents to create (default: 10)

Options:
  --operations, -o <M>      Number of operations to perform on each document (default: 0)
  --endpoint <url>          GraphQL endpoint (default: ${DEFAULT_ENDPOINT})
  --documentType <type>     Document type (default: first available)
  --verbose, -v             Show detailed operation payloads
  --help, -h                Show this help message

Process flow:
  1. Create N documents
  2. For each document, perform M operations (cycling through metadata operations)

Examples:
  tsx docs-create.ts 10
  tsx docs-create.ts 10 --operations 5
  tsx docs-create.ts 100 --operations 10 --endpoint http://localhost:4001/graphql
  tsx docs-create.ts 50 --documentType powerhouse/document-model -o 3
  tsx docs-create.ts 5 -o 3 --verbose
`);
      process.exit(0);
    } else if (!isNaN(Number(arg))) {
      count = Number(arg);
    }
  }

  return { count, operations, endpoint, documentType, verbose };
}

async function main() {
  const {
    count,
    operations,
    endpoint,
    documentType: docTypeArg,
    verbose,
  } = parseArgs(process.argv.slice(2));

  const client = new GraphQLClient(endpoint);

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

  // Track memory
  const initialMemory = getMemoryStats();
  console.log(`\nInitial memory: ${formatMemory(initialMemory)}`);

  // Phase 1: Create documents
  console.log(`\nPhase 1: Creating ${count} documents...`);
  const createStartTime = Date.now();
  const documentIds: string[] = [];

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

  // Phase 2: Perform operations on each document
  if (operations > 0) {
    console.log(
      `\nPhase 2: Performing ${operations} operations on each document...`,
    );
    const opsStartTime = Date.now();
    const totalOps = count * operations;

    // Track overall min/max across all documents
    let overallMinOp: {
      docId: string;
      docNum: number;
      timing: OperationTiming;
    } | null = null;
    let overallMaxOp: {
      docId: string;
      docNum: number;
      timing: OperationTiming;
    } | null = null;

    for (let i = 0; i < documentIds.length; i++) {
      const docNum = i + 1;
      const docId = documentIds[i];
      const docStartTime = Date.now();

      if (verbose) {
        console.log(`  [${docNum}/${count}] ${docId}:`);
      }

      const result = await performOperations(
        client,
        docId,
        docNum,
        operations,
        count,
        (opNum, action, durationMs) => {
          if (verbose) {
            console.log(
              `    op ${opNum}/${operations}: ${durationMs}ms ${JSON.stringify(action)}`,
            );
          } else {
            process.stdout.write(
              `\r  [${docNum}/${count}] ${docId}: ${opNum}/${operations} ops`,
            );
          }
        },
      );

      // Update overall min/max
      if (
        result.minOp &&
        (overallMinOp === null ||
          result.minOp.durationMs < overallMinOp.timing.durationMs)
      ) {
        overallMinOp = { docId, docNum, timing: result.minOp };
      }
      if (
        result.maxOp &&
        (overallMaxOp === null ||
          result.maxOp.durationMs > overallMaxOp.timing.durationMs)
      ) {
        overallMaxOp = { docId, docNum, timing: result.maxOp };
      }

      const docDurationMs = Date.now() - docStartTime;
      const docDuration = (docDurationMs / 1000).toFixed(2);
      const msPerOp = (docDurationMs / operations).toFixed(0);

      const minMax =
        result.minOp && result.maxOp
          ? `, min: ${result.minOp.durationMs}ms, max: ${result.maxOp.durationMs}ms`
          : "";

      if (verbose) {
        console.log(`    Done: ${docDuration}s, ${msPerOp}ms/op${minMax}`);
      } else {
        process.stdout.write(` (${docDuration}s, ${msPerOp}ms/op${minMax})\n`);
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
    console.log(`  Memory: ${formatMemory(phase2Memory)}`);
  }

  // Summary
  const finalMemory = getMemoryStats();
  const totalDuration = ((Date.now() - createStartTime) / 1000).toFixed(2);
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
