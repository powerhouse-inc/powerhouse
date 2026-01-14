#!/usr/bin/env tsx
/**
 * Script to list all documents
 * Usage: tsx scripts/docs-list.ts [--endpoint <url>] [--driveId <id>]
 *
 * @example
 *   tsx scripts/docs-list.ts
 *   tsx scripts/docs-list.ts --driveId powerhouse
 *   tsx scripts/docs-list.ts --endpoint http://localhost:4001/graphql --driveId my-drive
 */

import { GraphQLClient, gql } from "graphql-request";

interface Document {
  id: string;
  name?: string;
  documentType: string;
  state: JSON;
}

interface FindDocumentsResponse {
  findDocuments: {
    items: Document[];
    totalCount: number;
    hasNextPage: boolean;
    cursor?: string | null;
  };
}

interface DriveDocumentResponse {
  driveDocument: {
    id: string;
  } | null;
}

interface DocumentModelsResponse {
  documentModels: {
    items: Array<{
      id: string;
      name: string;
    }>;
  };
}

const GET_DRIVE_DOCUMENT_QUERY = gql`
  query GetDriveDocument($idOrSlug: String!) {
    driveDocument(idOrSlug: $idOrSlug) {
      id
    }
  }
`;

const FIND_DOCUMENTS_QUERY = gql`
  query FindDocuments($search: SearchFilterInput!, $paging: PagingInput) {
    findDocuments(search: $search, paging: $paging) {
      items {
        id
        name
        documentType
        state
      }
      totalCount
      hasNextPage
      cursor
    }
  }
`;

const GET_DOCUMENT_MODELS_QUERY = gql`
  query GetDocumentModels {
    documentModels {
      items {
        id
        name
      }
    }
  }
`;

async function getAvailableDocumentTypes(
  client: GraphQLClient,
): Promise<string[]> {
  try {
    const response = await client.request<DocumentModelsResponse>(
      GET_DOCUMENT_MODELS_QUERY,
    );
    return response.documentModels.items.map((model) => model.id);
  } catch (error) {
    console.warn("Failed to query available document types:", error);
    return [];
  }
}

async function checkDriveExists(
  systemClient: GraphQLClient,
  driveIdOrSlug: string,
): Promise<boolean> {
  try {
    const response = await systemClient.request<DriveDocumentResponse>(
      GET_DRIVE_DOCUMENT_QUERY,
      {
        idOrSlug: driveIdOrSlug,
      },
    );
    return response.driveDocument !== null;
  } catch (error) {
    // If there's an error, assume the drive doesn't exist
    return false;
  }
}

async function getDriveDocumentId(
  systemClient: GraphQLClient,
  driveIdOrSlug: string,
): Promise<string> {
  const response = await systemClient.request<DriveDocumentResponse>(
    GET_DRIVE_DOCUMENT_QUERY,
    {
      idOrSlug: driveIdOrSlug,
    },
  );

  if (!response.driveDocument) {
    throw new Error(
      `Drive "${driveIdOrSlug}" not found. Please create the drive first or use a different driveId.`,
    );
  }

  return response.driveDocument.id;
}

async function listDocuments(
  client: GraphQLClient,
  systemClient: GraphQLClient,
  driveIdOrSlug: string | undefined,
  documentType?: string,
): Promise<Document[]> {
  // If no drive specified, list all documents by querying each document type
  if (!driveIdOrSlug) {
    // Get available document types if not specified
    let typesToQuery: string[] = [];
    if (documentType) {
      typesToQuery = [documentType];
    } else {
      const availableTypes = await getAvailableDocumentTypes(client);
      if (availableTypes.length === 0) {
        console.warn("No document types available to query");
        return [];
      }
      typesToQuery = availableTypes;
    }

    // Query documents for each type and combine results
    const allDocuments: Document[] = [];
    for (const type of typesToQuery) {
      let cursor: string | undefined;
      let hasNextPage = true;

      while (hasNextPage) {
        const response = await client.request<FindDocumentsResponse>(
          FIND_DOCUMENTS_QUERY,
          {
            search: {
              type,
            },
            paging: cursor
              ? {
                  cursor,
                  limit: 100,
                }
              : {
                  limit: 100,
                },
          },
        );

        allDocuments.push(...response.findDocuments.items);
        hasNextPage = response.findDocuments.hasNextPage;
        cursor = response.findDocuments.cursor || undefined;
      }
    }

    return allDocuments;
  }

  // Try to get the drive document ID from the drive ID/slug
  let driveDocumentId: string;
  try {
    driveDocumentId = await getDriveDocumentId(systemClient, driveIdOrSlug);
  } catch (error: any) {
    // If drive doesn't exist or is invalid, fall back to listing all documents
    console.warn(
      `\n⚠ Warning: Could not access drive "${driveIdOrSlug}": ${error.message}`,
    );
    console.warn(`   Listing all documents instead...\n`);
    return listDocuments(client, systemClient, undefined);
  }

  // Find all documents with this drive as their parent
  const allDocuments: Document[] = [];
  let cursor: string | undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await client.request<FindDocumentsResponse>(
      FIND_DOCUMENTS_QUERY,
      {
        search: {
          parentId: driveDocumentId,
        },
        paging: cursor
          ? {
              cursor,
              limit: 100,
            }
          : {
              limit: 100,
            },
      },
    );

    allDocuments.push(...response.findDocuments.items);
    hasNextPage = response.findDocuments.hasNextPage;
    cursor = response.findDocuments.cursor || undefined;
  }

  return allDocuments;
}

async function main() {
  const args = process.argv.slice(2);
  let endpoint = "http://localhost:4001/graphql";
  let driveId: string | undefined;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[i + 1];
      i++;
    } else if (arg === "--driveId" && args[i + 1]) {
      driveId = args[i + 1];
      i++;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx scripts/docs-list.ts [options]

Options:
  --endpoint <url>     GraphQL endpoint (default: http://localhost:4001/graphql)
  --driveId <id>       Drive ID to filter by (optional, lists all documents by default)
  --help, -h           Show this help message

Examples:
  tsx scripts/docs-list.ts
  tsx scripts/docs-list.ts --driveId my-drive
  tsx scripts/docs-list.ts --endpoint http://localhost:4001/graphql --driveId my-drive
`);
      process.exit(0);
    }
  }

  // By default, list all documents (no drive filter)
  // Use --driveId to filter by a specific drive
  if (!driveId) {
    console.log("Listing all documents (no drive filter)");
  } else {
    console.log(`Listing documents from drive: ${driveId}`);
  }
  console.log(`Endpoint: ${endpoint}`);
  console.log();

  // Determine system endpoint
  let systemEndpoint: string;
  if (endpoint.endsWith("/graphql")) {
    systemEndpoint = endpoint.replace("/graphql", "/graphql/system");
  } else if (endpoint.endsWith("/graphql/system")) {
    systemEndpoint = endpoint;
  } else {
    systemEndpoint = endpoint + "/system";
  }

  const client = new GraphQLClient(endpoint, {
    fetch,
  });

  const systemClient = new GraphQLClient(systemEndpoint, {
    fetch,
  });

  const startTime = Date.now();

  try {
    if (driveId) {
      // Check if drive exists first
      console.log(`Checking if drive "${driveId}" exists...`);
      const driveExists = await checkDriveExists(systemClient, driveId);
      
      if (!driveExists) {
        console.error(`\n✗ Drive "${driveId}" not found.`);
        console.error(
          `   Please create the drive first using:\n   tsx scripts/docs-create.ts 0 --driveId ${driveId}`,
        );
        console.error(
          `   Or omit --driveId to list all documents: tsx scripts/docs-list.ts`,
        );
        process.exit(1);
      }
      
      console.log(`✓ Drive "${driveId}" exists`);
    }
    console.log("Fetching documents...");
    const documents = await listDocuments(client, systemClient, driveId);
    console.log(`✓ Found ${documents.length} documents`);

    if (documents.length === 0) {
      console.log("\nNo documents found.");
      return;
    }

    // Show summary
    console.log(`\n📊 Summary:`);
    console.log(`  Total documents: ${documents.length}`);

    // Show document list
    console.log(`\n📄 Documents:`);
    documents.forEach((doc, index) => {
      const state = doc.state as any;
      const name = doc.name || state?.name || "(unnamed)";
      const description = state?.description
        ? ` - ${state.description}`
        : "";
      const extension = state?.extension ? ` [.${state.extension}]` : "";
      console.log(`  ${index + 1}. ${name}${extension}${description}`);
      console.log(`     ID: ${doc.id}`);
      console.log(`     Type: ${doc.documentType}`);
    });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n✓ Completed in ${duration}s`);
  } catch (error) {
    console.error("\n✗ Error fetching documents:", error);
    throw error;
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
