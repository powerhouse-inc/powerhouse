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

// Minimal query for count-only mode - only fetches id to reduce payload size
const FIND_DOCUMENTS_COUNT = gql`
  query FindDocumentsCount($search: SearchFilterInput!, $paging: PagingInput) {
    findDocuments(search: $search, paging: $paging) {
      items { id }
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

interface RequestTiming {
  type: string;
  page: number;
  count: number;
  durationMs: number;
}

async function listDocumentsForType(
  client: GraphQLClient,
  documentType: string,
  countOnly: boolean = false,
  onProgress?: (count: number) => void,
  onTiming?: (timing: RequestTiming) => void,
): Promise<{ total: number; last10: Document[] }> {
  let total = 0;
  let last10: Document[] = [];
  let cursor: string | undefined;
  let hasNextPage = true;
  let page = 0;
  // Use larger page size when count-only for maximum efficiency
  const PAGE_SIZE = countOnly ? 5000 : 1000;
  const query = countOnly ? FIND_DOCUMENTS_COUNT : FIND_DOCUMENTS;

  while (hasNextPage) {
    try {
      page++;
      const requestStart = Date.now();
      const res = await client.request<FindDocumentsResponse>(query, {
        search: { type: documentType },
        paging: { limit: PAGE_SIZE, ...(cursor && { cursor }) },
      });
      const requestDuration = Date.now() - requestStart;

      const items = res.findDocuments.items;
      if (items.length === 0) break;

      total += items.length;

      // Report timing
      if (onTiming) {
        onTiming({
          type: documentType,
          page,
          count: items.length,
          durationMs: requestDuration,
        });
      }

      // Report progress
      if (onProgress) {
        onProgress(total);
      }

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

interface ListProgress {
  type: string;
  count: number;
}

async function listDocuments(
  client: GraphQLClient,
  type?: string,
  countOnly: boolean = false,
  onProgress?: (progress: ListProgress[]) => void,
  onTiming?: (timing: RequestTiming) => void,
): Promise<{ total: number; last10: Document[] }> {
  const types = type ? [type] : await getDocumentTypes(client);

  // Track progress per type
  const progressByType: Map<string, number> = new Map();
  types.forEach((t) => progressByType.set(t, 0));

  const reportProgress = () => {
    if (onProgress) {
      const progress = types.map((t) => ({ type: t, count: progressByType.get(t) || 0 }));
      onProgress(progress);
    }
  };

  // Process all document types in parallel for maximum speed
  const results = await Promise.all(
    types.map((t) =>
      listDocumentsForType(
        client,
        t,
        countOnly,
        (count) => {
          progressByType.set(t, count);
          reportProgress();
        },
        onTiming
      )
    )
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

function parseArgs(args: string[]): { endpoint: string; type?: string; countOnly: boolean; timing: boolean } {
  let endpoint = DEFAULT_ENDPOINT;
  let type: string | undefined;
  let countOnly = false;
  let timing = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[++i];
    } else if (arg === "--type" && args[i + 1]) {
      type = args[++i];
    } else if (arg === "--count-only") {
      countOnly = true;
    } else if (arg === "--timing" || arg === "-t") {
      timing = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx docs-list.ts [options]

Options:
  --endpoint <url>   GraphQL endpoint (default: ${DEFAULT_ENDPOINT})
  --type <type>      Filter by document type
  --count-only       Only show the total count, skip listing documents
  --timing, -t       Show per-request timing information
  --help, -h         Show this help message
`);
      process.exit(0);
    }
  }

  return { endpoint, type, countOnly, timing };
}

async function main() {
  const { endpoint, type, countOnly, timing } = parseArgs(process.argv.slice(2));
  const client = new GraphQLClient(endpoint);

  const timings: RequestTiming[] = [];
  const timingCallback = timing
    ? (t: RequestTiming) => {
        timings.push(t);
        console.log(
          `  [${t.type.split("/").pop()}] page ${t.page}: ${t.count} docs in ${t.durationMs}ms (${(t.durationMs / t.count).toFixed(0)}ms/doc)`
        );
      }
    : undefined;

  if (countOnly) {
    // In count-only mode, show progress then output the number
    const startTime = Date.now();
    const { total } = await listDocuments(
      client,
      type,
      countOnly,
      timing
        ? undefined
        : (progress) => {
            const totalSoFar = progress.reduce((sum, p) => sum + p.count, 0);
            process.stdout.write(`\rCounting... ${totalSoFar}`);
          },
      timingCallback
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    if (timing) {
      console.log(`\nTotal: ${total} (${duration}s)`);
    } else {
      process.stdout.write(`\r${total} (${duration}s)     \n`);
    }
  } else {
    const startTime = Date.now();
    console.log("Listing documents...");

    const { total, last10 } = await listDocuments(
      client,
      type,
      countOnly,
      timing
        ? undefined
        : (progress) => {
            const totalSoFar = progress.reduce((sum, p) => sum + p.count, 0);
            const typeProgress = progress
              .filter((p) => p.count > 0)
              .map((p) => `${p.type.split("/").pop()}: ${p.count}`)
              .join(", ");
            process.stdout.write(`\r  Found ${totalSoFar} documents (${typeProgress})     `);
          },
      timingCallback
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (timing && timings.length > 0) {
      const totalMs = timings.reduce((sum, t) => sum + t.durationMs, 0);
      const totalDocs = timings.reduce((sum, t) => sum + t.count, 0);
      console.log(`\nTiming summary: ${totalDocs} docs in ${totalMs}ms avg (${(totalMs / totalDocs).toFixed(0)}ms/doc)`);
    }

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
