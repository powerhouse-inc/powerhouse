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
  mutation MutateDocument($documentIdentifier: String!, $actions: [JSONObject!]!) {
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
      input: { description: `Description for document ${docIndex}, operation ${opIndex}` },
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

async function performOperations(
  client: GraphQLClient,
  documentId: string,
  docIndex: number,
  operationCount: number,
  totalDocs: number,
  onProgress: (opNum: number) => void,
): Promise<void> {
  for (let i = 0; i < operationCount; i++) {
    const action = createOperation(docIndex, i + 1);
    await client.request(MUTATE_DOCUMENT, {
      documentIdentifier: documentId,
      actions: [action],
    });
    onProgress(i + 1);
  }
}

function parseArgs(args: string[]): {
  count: number;
  operations: number;
  endpoint: string;
  documentType?: string;
} {
  let count = 10;
  let operations = 0;
  let endpoint = DEFAULT_ENDPOINT;
  let documentType: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[++i];
    } else if (arg === "--documentType" && args[i + 1]) {
      documentType = args[++i];
    } else if ((arg === "--operations" || arg === "-o") && args[i + 1]) {
      operations = Number(args[++i]);
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx docs-create.ts [N] [options]

Arguments:
  N                         Number of documents to create (default: 10)

Options:
  --operations, -o <M>      Number of operations to perform on each document (default: 0)
  --endpoint <url>          GraphQL endpoint (default: ${DEFAULT_ENDPOINT})
  --documentType <type>     Document type (default: first available)
  --help, -h                Show this help message

Process flow:
  1. Create N documents
  2. For each document, perform M operations (cycling through metadata operations)

Examples:
  tsx docs-create.ts 10
  tsx docs-create.ts 10 --operations 5
  tsx docs-create.ts 100 --operations 10 --endpoint http://localhost:4001/graphql
  tsx docs-create.ts 50 --documentType powerhouse/document-model -o 3
`);
      process.exit(0);
    } else if (!isNaN(Number(arg))) {
      count = Number(arg);
    }
  }

  return { count, operations, endpoint, documentType };
}

async function main() {
  const { count, operations, endpoint, documentType: docTypeArg } = parseArgs(
    process.argv.slice(2),
  );

  const client = new GraphQLClient(endpoint);

  // Determine document type
  let documentType = docTypeArg;
  if (!documentType) {
    documentType = await getDefaultDocumentType(client);
    if (!documentType) {
      console.error("No document types available");
      process.exit(1);
    }
    console.log(`Using document type: ${documentType}`);
  }

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
  console.log(`\n  Created ${count} documents in ${createDuration}s (avg: ${msPerDoc}ms/doc)`);

  // Phase 2: Perform operations on each document
  if (operations > 0) {
    console.log(`\nPhase 2: Performing ${operations} operations on each document...`);
    const opsStartTime = Date.now();
    const totalOps = count * operations;

    for (let i = 0; i < documentIds.length; i++) {
      const docNum = i + 1;
      const docId = documentIds[i];
      const docStartTime = Date.now();
      await performOperations(
        client,
        docId,
        docNum,
        operations,
        count,
        (opNum) => {
          process.stdout.write(`\r  [${docNum}/${count}] ${docId}: ${opNum}/${operations} ops`);
        }
      );
      const docDurationMs = Date.now() - docStartTime;
      const docDuration = (docDurationMs / 1000).toFixed(2);
      const msPerOp = (docDurationMs / operations).toFixed(0);
      process.stdout.write(` (${docDuration}s, ${msPerOp}ms/op)\n`);
    }

    const opsDurationMs = Date.now() - opsStartTime;
    const opsDuration = (opsDurationMs / 1000).toFixed(2);
    const avgMsPerOp = (opsDurationMs / totalOps).toFixed(0);
    console.log(`  Completed ${totalOps} operations in ${opsDuration}s (avg: ${avgMsPerOp}ms/op)`);
  }

  // Summary
  const totalDuration = ((Date.now() - createStartTime) / 1000).toFixed(2);
  console.log(`\nDone! Total time: ${totalDuration}s`);
}

main().catch((error) => {
  console.error("Error:", error.message ?? error);
  process.exit(1);
});
