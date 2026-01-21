#!/usr/bin/env tsx
/**
 * Script to delete all documents
 * Usage: tsx docs-reset.ts [--endpoint <url>]
 */

import { GraphQLClient, gql } from "graphql-request";

const DEFAULT_ENDPOINT = "http://localhost:4001/graphql";
const BATCH_SIZE = 50;

const FIND_DOCUMENTS = gql`
  query FindDocuments($search: SearchFilterInput!, $paging: PagingInput) {
    findDocuments(search: $search, paging: $paging) {
      items {
        id
      }
      hasNextPage
      cursor
    }
  }
`;

const GET_DOCUMENT_MODELS = gql`
  query GetDocumentModels {
    documentModels {
      items {
        id
      }
    }
  }
`;

const DELETE_DOCUMENTS = gql`
  mutation DeleteDocuments($identifiers: [String!]!) {
    deleteDocuments(identifiers: $identifiers)
  }
`;

interface FindDocumentsResponse {
  findDocuments: {
    items: Array<{ id: string }>;
    hasNextPage: boolean;
    cursor?: string | null;
  };
}

interface DocumentModelsResponse {
  documentModels: { items: Array<{ id: string }> };
}

async function getDocumentTypes(client: GraphQLClient): Promise<string[]> {
  const res = await client.request<DocumentModelsResponse>(GET_DOCUMENT_MODELS);
  return res.documentModels.items.map((m: { id: string; name: string }) => m.id);
}

async function getAllDocumentIds(client: GraphQLClient): Promise<string[]> {
  const types = await getDocumentTypes(client);
  const ids: string[] = [];

  for (const type of types) {
    let cursor: string | undefined;

    do {
      const res = await client.request<FindDocumentsResponse>(FIND_DOCUMENTS, {
        search: { type },
        paging: { limit: 100, ...(cursor && { cursor }) },
      });

      ids.push(...res.findDocuments.items.map((d: { id: string }) => d.id));
      cursor = res.findDocuments.hasNextPage
        ? (res.findDocuments.cursor ?? undefined)
        : undefined;
    } while (cursor);
  }

  return ids;
}

async function deleteDocuments(
  client: GraphQLClient,
  ids: string[],
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);

    try {
      await client.request(DELETE_DOCUMENTS, { identifiers: batch });
      deleted += batch.length;
    } catch {
      failed += batch.length;
    }

    process.stdout.write(`\r  Progress: ${i + batch.length}/${ids.length}`);
  }

  console.log();
  return { deleted, failed };
}

function parseArgs(args: string[]): { endpoint: string } {
  let endpoint = DEFAULT_ENDPOINT;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx docs-reset.ts [options]

Options:
  --endpoint <url>   GraphQL endpoint (default: ${DEFAULT_ENDPOINT})
  --help, -h         Show this help message

Examples:
  tsx docs-reset.ts
  tsx docs-reset.ts --endpoint http://localhost:4001/graphql
`);
      process.exit(0);
    }
  }

  return { endpoint };
}

async function main() {
  const { endpoint } = parseArgs(process.argv.slice(2));

  console.log(`Endpoint: ${endpoint}\n`);

  const client = new GraphQLClient(endpoint);
  const startTime = Date.now();

  // Get all document IDs
  console.log("Fetching documents...");
  const ids = await getAllDocumentIds(client);
  console.log(`Found ${ids.length} documents\n`);

  if (ids.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // Delete in batches
  console.log("Deleting documents...");
  const { deleted, failed } = await deleteDocuments(client, ids);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\nCompleted in ${duration}s`);
  console.log(`  Deleted: ${deleted}`);
  if (failed > 0) {
    console.log(`  Failed: ${failed}`);
  }
}

main().catch((error) => {
  console.error("Error:", error.message ?? error);
  process.exit(1);
});
