#!/usr/bin/env tsx
/**
 * Script to count documents using cursor pagination
 * Usage: tsx docs-list.ts [--endpoint <url>] [--type <documentType>]
 */

import { GraphQLClient, gql } from "graphql-request";

const DEFAULT_ENDPOINT = "http://localhost:4001/graphql";

const FIND_DOCUMENTS = gql`
  query FindDocuments($search: SearchFilterInput!, $paging: PagingInput) {
    findDocuments(search: $search, paging: $paging) {
      items { id name }
      hasNextPage
      cursor
    }
  }
`;

const GET_DOCUMENT_MODELS = gql`
  query GetDocumentModels {
    documentModels {
      items { id }
    }
  }
`;

interface Document {
  id: string;
  name: string | null;
}

interface FindDocumentsResponse {
  findDocuments: {
    items: Document[];
    hasNextPage: boolean;
    cursor: string | null;
  };
}

interface DocumentModelsResponse {
  documentModels: { items: Array<{ id: string }> };
}

async function getDocumentTypes(client: GraphQLClient): Promise<string[]> {
  const res = await client.request<DocumentModelsResponse>(GET_DOCUMENT_MODELS);
  return res.documentModels.items.map((m) => m.id);
}

async function listDocumentsForType(
  client: GraphQLClient,
  documentType: string,
  countOnly: boolean = false,
): Promise<{ total: number; last10: Document[] }> {
  let total = 0;
  let last10: Document[] = [];
  let cursor: string | undefined;
  let hasNextPage = true;
  // Use larger page size when count-only for maximum efficiency
  const PAGE_SIZE = countOnly ? 5000 : 1000;

  while (hasNextPage) {
    try {
      const res = await client.request<FindDocumentsResponse>(FIND_DOCUMENTS, {
        search: { type: documentType },
        paging: { limit: PAGE_SIZE, ...(cursor && { cursor }) },
      });

      const items = res.findDocuments.items;
      if (items.length === 0) break;

      total += items.length;
      
      // Only store last10 if not in count-only mode
      if (!countOnly) {
        last10 = [...last10, ...items].slice(-10);
      }

      hasNextPage = res.findDocuments.hasNextPage;
      cursor = res.findDocuments.cursor ?? undefined;
    } catch (error) {
      console.error(`Error fetching documents for type ${documentType}:`, error);
      break;
    }
  }

  return { total, last10 };
}

async function listDocuments(
  client: GraphQLClient,
  type?: string,
  countOnly: boolean = false,
): Promise<{ total: number; last10: Document[] }> {
  const types = type ? [type] : await getDocumentTypes(client);
  
  // Process all document types in parallel for maximum speed
  const results = await Promise.all(
    types.map((t) => listDocumentsForType(client, t, countOnly))
  );

  // Aggregate results
  let total = 0;
  let last10: Document[] = [];
  
  for (const result of results) {
    total += result.total;
    if (!countOnly) {
      last10 = [...last10, ...result.last10].slice(-10);
    }
  }

  return { total, last10 };
}

function parseArgs(args: string[]): { endpoint: string; type?: string; countOnly: boolean } {
  let endpoint = DEFAULT_ENDPOINT;
  let type: string | undefined;
  let countOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[++i];
    } else if (arg === "--type" && args[i + 1]) {
      type = args[++i];
    } else if (arg === "--count-only") {
      countOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx docs-list.ts [options]

Options:
  --endpoint <url>   GraphQL endpoint (default: ${DEFAULT_ENDPOINT})
  --type <type>      Filter by document type
  --count-only       Only show the total count, skip listing documents
  --help, -h         Show this help message
`);
      process.exit(0);
    }
  }

  return { endpoint, type, countOnly };
}

async function main() {
  const { endpoint, type, countOnly } = parseArgs(process.argv.slice(2));
  const client = new GraphQLClient(endpoint);

  if (countOnly) {
    // In count-only mode, output only the number
    const { total } = await listDocuments(client, type, countOnly);
    console.log(total);
  } else {
    const startTime = Date.now();
    console.log("Listing documents...");
    
    const { total, last10 } = await listDocuments(client, type, countOnly);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✓ Total: ${total} documents (fetched in ${duration}s)`);
    
    if (last10.length > 0) {
      console.log("\nLast 10 documents:");
      last10.forEach((doc) => {
        console.log(`  - ${doc.name || doc.id} (${doc.id})`);
      });
    }
  }
}

main().catch((error) => {
  console.error("Error:", error.message ?? error);
  process.exit(1);
});
