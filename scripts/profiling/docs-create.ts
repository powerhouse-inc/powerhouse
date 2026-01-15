#!/usr/bin/env tsx
/**
 * Script to create N documents
 * Usage: tsx docs-create.ts [N] [--endpoint <url>] [--documentType <type>]
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

function parseArgs(args: string[]): {
  count: number;
  endpoint: string;
  documentType?: string;
} {
  let count = 10;
  let endpoint = DEFAULT_ENDPOINT;
  let documentType: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[++i];
    } else if (arg === "--documentType" && args[i + 1]) {
      documentType = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx docs-create.ts [N] [options]

Arguments:
  N                      Number of documents to create (default: 10)

Options:
  --endpoint <url>       GraphQL endpoint (default: ${DEFAULT_ENDPOINT})
  --documentType <type>  Document type (default: first available)
  --help, -h             Show this help message

Examples:
  tsx docs-create.ts 10
  tsx docs-create.ts 100 --endpoint http://localhost:4001/graphql
  tsx docs-create.ts 50 --documentType powerhouse/document-model
`);
      process.exit(0);
    } else if (!isNaN(Number(arg))) {
      count = Number(arg);
    }
  }

  return { count, endpoint, documentType };
}

async function main() {
  const { count, endpoint, documentType: docTypeArg } = parseArgs(
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

  // Create documents
  console.log(`\nCreating ${count} documents...`);
  const startTime = Date.now();

  for (let i = 0; i < count; i++) {
    await createDocument(client, documentType, `doc-${i + 1}`);
    process.stdout.write(`\r  Progress: ${i + 1}/${count}`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✓ Created ${count} documents in ${duration}s`);
}

main().catch((error) => {
  console.error("Error:", error.message ?? error);
  process.exit(1);
});
