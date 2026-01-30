#!/usr/bin/env tsx
/**
 * Script to count documents using totalCount field (single request)
 * Usage: tsx docs-count.ts [--endpoint <url>] [--type <documentType>]
 *
 * This script uses the totalCount field returned by findDocuments
 * for a fast count without pagination, vs docs-list.ts which paginates.
 *
 * NOTE: totalCount may be buggy - compare results with docs-list.ts --count-only
 */

import { GraphQLClient, gql } from "graphql-request";

const DEFAULT_ENDPOINT = "http://localhost:4001/graphql";

// Uses totalCount for instant count
const COUNT_DOCUMENTS = gql`
  query CountDocuments($search: SearchFilterInput!, $paging: PagingInput) {
    findDocuments(search: $search, paging: $paging) {
      totalCount
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

interface CountDocumentsResponse {
  findDocuments: {
    totalCount: number;
  };
}

interface DocumentModelsResponse {
  documentModels: { items: Array<{ id: string }> };
}

async function getDocumentTypes(client: GraphQLClient): Promise<string[]> {
  const res = await client.request<DocumentModelsResponse>(GET_DOCUMENT_MODELS);
  return res.documentModels.items.map((m: { id: string }) => m.id);
}

async function countDocumentsForType(
  client: GraphQLClient,
  documentType: string,
): Promise<{ type: string; count: number; durationMs: number }> {
  const requestStart = Date.now();
  const res = await client.request<CountDocumentsResponse>(COUNT_DOCUMENTS, {
    search: { type: documentType },
    paging: { limit: 1 },
  });
  const durationMs = Date.now() - requestStart;

  return {
    type: documentType,
    count: res.findDocuments.totalCount,
    durationMs,
  };
}

function parseArgs(args: string[]): {
  endpoint: string;
  type?: string;
  verbose: boolean;
} {
  let endpoint = DEFAULT_ENDPOINT;
  let type: string | undefined;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[++i];
    } else if (arg === "--type" && args[i + 1]) {
      type = args[++i];
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx docs-count.ts [options]

Options:
  --endpoint <url>   GraphQL endpoint (default: ${DEFAULT_ENDPOINT})
  --type <type>      Filter by document type (counts all types if not specified)
  --verbose, -v      Show per-type timing
  --help, -h         Show this help message

This script uses the totalCount field for fast counting (single request per type).
Compare with docs-list.ts --count-only which paginates through all documents.
`);
      process.exit(0);
    }
  }

  return { endpoint, type, verbose };
}

async function main() {
  const { endpoint, type, verbose } = parseArgs(process.argv.slice(2));
  const client = new GraphQLClient(endpoint);

  const startTime = Date.now();

  if (type) {
    // Count single type
    const result = await countDocumentsForType(client, type);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`${result.count} (${duration}s)`);
  } else {
    // Count all types
    const types = await getDocumentTypes(client);

    if (types.length === 0) {
      console.log("No document types found");
      return;
    }

    // Count all types in parallel
    const results = await Promise.all(
      types.map((t) => countDocumentsForType(client, t)),
    );

    const total = results.reduce((sum, r) => sum + r.count, 0);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (verbose) {
      console.log("Counts by type (using totalCount field):");
      for (const result of results) {
        if (result.count > 0) {
          console.log(
            `  ${result.type}: ${result.count} (${result.durationMs}ms)`,
          );
        }
      }
      console.log(`\nTotal: ${total} (${duration}s)`);
      console.log("\nWARNING: totalCount may be inaccurate. Compare with:");
      console.log("  tsx docs-list.ts --count-only");
    } else {
      console.log(`${total} (${duration}s)`);
    }
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
