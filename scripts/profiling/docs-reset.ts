#!/usr/bin/env tsx
/**
 * Script to delete all documents and reset Switchboard to its starting state
 * Usage: tsx scripts/docs-reset.ts [--endpoint <url>] [--deleteDrives]
 *
 * @example
 *   tsx scripts/docs-reset.ts
 *   tsx scripts/docs-reset.ts --endpoint http://localhost:4001/graphql
 *   tsx scripts/docs-reset.ts --deleteDrives
 */

import { GraphQLClient, gql } from "graphql-request";

interface Document {
  id: string;
  name?: string;
  documentType: string;
}

interface FindDocumentsResponse {
  findDocuments: {
    items: Document[];
    totalCount: number;
    hasNextPage: boolean;
    cursor?: string | null;
  };
}

interface DocumentModelsResponse {
  documentModels: {
    items: Array<{
      id: string;
      name: string;
    }>;
  };
}

interface DeleteDocumentResponse {
  deleteDocument: boolean;
}

interface DeleteDocumentsResponse {
  deleteDocuments: boolean;
}

interface DriveDocumentResponse {
  driveDocument: {
    id: string;
  } | null;
}

interface DrivesResponse {
  drives: string[];
}

interface DriveDocumentsResponse {
  driveDocuments: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
}

const FIND_DOCUMENTS_QUERY = gql`
  query FindDocuments($search: SearchFilterInput!, $paging: PagingInput) {
    findDocuments(search: $search, paging: $paging) {
      items {
        id
        name
        documentType
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

const DELETE_DOCUMENT_MUTATION = gql`
  mutation DeleteDocument($identifier: String!) {
    deleteDocument(identifier: $identifier)
  }
`;

const DELETE_DOCUMENTS_MUTATION = gql`
  mutation DeleteDocuments($identifiers: [String!]!) {
    deleteDocuments(identifiers: $identifiers)
  }
`;

const GET_DRIVES_QUERY = gql`
  query GetDrives {
    drives
  }
`;

const GET_DRIVE_DOCUMENTS_QUERY = gql`
  query GetDriveDocuments {
    driveDocuments {
      id
      name
      slug
    }
  }
`;

const DELETE_DRIVE_MUTATION = gql`
  mutation DeleteDrive($id: String!) {
    deleteDrive(id: $id)
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

async function getAllDocuments(
  client: GraphQLClient,
): Promise<Document[]> {
  const allDocuments: Document[] = [];
  const availableTypes = await getAvailableDocumentTypes(client);

  for (const docType of availableTypes) {
    let cursor: string | undefined;
    let hasNextPage = true;
    
    while (hasNextPage) {
      const response = await client.request<FindDocumentsResponse>(
        FIND_DOCUMENTS_QUERY,
        {
          search: {
            type: docType,
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

async function deleteDocument(
  client: GraphQLClient,
  documentId: string,
): Promise<boolean> {
  try {
    const response = await client.request<DeleteDocumentResponse>(
      DELETE_DOCUMENT_MUTATION,
      {
        identifier: documentId,
      },
    );
    return response.deleteDocument;
  } catch (error: any) {
    const errorMsg =
      error?.message ||
      error?.response?.errors?.[0]?.message ||
      String(error);
    throw new Error(`Failed to delete document ${documentId}: ${errorMsg}`);
  }
}

async function deleteDocumentsBatch(
  client: GraphQLClient,
  documentIds: string[],
): Promise<boolean> {
  try {
    const response = await client.request<DeleteDocumentsResponse>(
      DELETE_DOCUMENTS_MUTATION,
      {
        identifiers: documentIds,
      },
    );
    return response.deleteDocuments;
  } catch (error: any) {
    const errorMsg =
      error?.message ||
      error?.response?.errors?.[0]?.message ||
      String(error);
    throw new Error(`Failed to delete documents batch: ${errorMsg}`);
  }
}

async function getAllDrives(
  systemClient: GraphQLClient,
): Promise<string[]> {
  try {
    // Try to get drives by slugs first
    const drivesResponse = await systemClient.request<DrivesResponse>(
      GET_DRIVES_QUERY,
    );
    
    // Also try to get drive documents
    let driveDocuments: Array<{ id: string; slug: string }> = [];
    try {
      const driveDocsResponse = await systemClient.request<DriveDocumentsResponse>(
        GET_DRIVE_DOCUMENTS_QUERY,
      );
      driveDocuments = driveDocsResponse.driveDocuments;
    } catch {
      // If this query fails, continue with just the slugs
    }
    
    // Combine both sources and deduplicate
    const allDriveIds = new Set<string>();
    drivesResponse.drives.forEach((slug) => allDriveIds.add(slug));
    driveDocuments.forEach((doc) => {
      allDriveIds.add(doc.id);
      if (doc.slug) allDriveIds.add(doc.slug);
    });
    
    return Array.from(allDriveIds);
  } catch (error) {
    console.warn("Failed to query drives:", error);
    return [];
  }
}

async function deleteDrive(
  systemClient: GraphQLClient,
  driveId: string,
): Promise<boolean> {
  try {
    const response = await systemClient.request<{ deleteDrive: boolean }>(
      DELETE_DRIVE_MUTATION,
      {
        id: driveId,
      },
    );
    return response.deleteDrive;
  } catch (error: any) {
    const errorMsg =
      error?.message ||
      error?.response?.errors?.[0]?.message ||
      String(error);
    throw new Error(`Failed to delete drive ${driveId}: ${errorMsg}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let endpoint = "http://localhost:4001/graphql";
  let deleteDrives = true; // Delete drives by default

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[i + 1];
      i++;
    } else if (arg === "--keepDrives") {
      deleteDrives = false; // Keep drives if this flag is set
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx scripts/docs-reset.ts [options]

Options:
  --endpoint <url>     GraphQL endpoint (default: http://localhost:4001/graphql)
  --keepDrives         Keep drives (default: delete all drives)
  --help, -h           Show this help message

Examples:
  tsx scripts/docs-reset.ts
  tsx scripts/docs-reset.ts --endpoint http://localhost:4001/graphql
  tsx scripts/docs-reset.ts --keepDrives
`);
      process.exit(0);
    }
  }

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

  console.log("🔄 Resetting Switchboard to starting state...");
  console.log(`Endpoint: ${endpoint}`);
  console.log();

  // Step 1: Get all documents
  console.log("📋 Fetching all documents...");
  const documents = await getAllDocuments(client);
  console.log(`✓ Found ${documents.length} documents`);
  console.log();

  // Step 2: Delete all documents
  if (documents.length > 0) {
    console.log(`🗑️  Deleting ${documents.length} documents...`);
    const documentIds = documents.map((doc) => doc.id);
    
    // Delete in batches of 50 to avoid overwhelming the server
    const batchSize = 50;
    let deleted = 0;
    let skipped = 0;
    const errors: Array<{ id: string; error: unknown }> = [];

    for (let i = 0; i < documentIds.length; i += batchSize) {
      const batch = documentIds.slice(i, i + batchSize);
      try {
        await deleteDocumentsBatch(client, batch);
        deleted += batch.length;
        process.stdout.write(`\r  Deleted ${deleted}/${documents.length} documents`);
      } catch (error) {
        // If batch deletion fails, try individual deletions
        for (const docId of batch) {
          try {
            await deleteDocument(client, docId);
            deleted++;
            process.stdout.write(`\r  Deleted ${deleted}/${documents.length} documents`);
          } catch (err: any) {
            const errorMsg =
              err?.message ||
              err?.response?.errors?.[0]?.message ||
              String(err);
            
            // Skip invalid documents (like drives missing CREATE_DOCUMENT operation)
            if (
              errorMsg.includes("no CREATE_DOCUMENT operation") ||
              errorMsg.includes("Failed to rebuild document")
            ) {
              skipped++;
              // These will be handled by drive deletion
            } else {
              errors.push({ id: docId, error: err });
            }
          }
        }
      }
      
      // Small delay between batches
      if (i + batchSize < documentIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    
    console.log(`\n✓ Deleted ${deleted} documents`);
    if (skipped > 0) {
      console.log(`⚠ Skipped ${skipped} invalid documents (will be handled by drive deletion)`);
    }
    
    if (errors.length > 0) {
      console.error(`\n✗ Failed to delete ${errors.length} documents`);
      errors.forEach(({ id, error }) => {
        const errorMsg =
          error instanceof Error
            ? error.message
            : String(error);
        console.error(`  - ${id}: ${errorMsg}`);
      });
    }
    console.log();
  } else {
    console.log("✓ No documents to delete");
    console.log();
  }

  // Step 3: Delete drives if requested
  if (deleteDrives) {
    console.log("📋 Fetching all drives...");
    const drives = await getAllDrives(systemClient);
    console.log(`✓ Found ${drives.length} drives`);
    console.log();

    if (drives.length > 0) {
      console.log(`🗑️  Deleting ${drives.length} drives...`);
      let deleted = 0;
      const errors: Array<{ id: string; error: unknown }> = [];

      for (const driveId of drives) {
        try {
          await deleteDrive(systemClient, driveId);
          deleted++;
          process.stdout.write(`\r  Deleted ${deleted}/${drives.length} drives`);
        } catch (error) {
          errors.push({ id: driveId, error });
        }
        
        // Small delay between deletions
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      
      console.log(`\n✓ Deleted ${deleted} drives`);
      
      if (errors.length > 0) {
        console.error(`\n✗ Failed to delete ${errors.length} drives`);
        errors.forEach(({ id, error }) => {
          const errorMsg =
            error instanceof Error
              ? error.message
              : String(error);
          console.error(`  - ${id}: ${errorMsg}`);
        });
      }
      console.log();
    } else {
      console.log("✓ No drives to delete");
      console.log();
    }
  }

  // Wait for deletions to propagate
  if (documents.length > 0) {
    console.log("⏳ Waiting for deletions to propagate (2 seconds)...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Final verification: Check if any documents remain
  console.log("🔍 Verifying reset...");
  let remainingDocuments = await getAllDocuments(client);
  let remainingDrives = deleteDrives ? await getAllDrives(systemClient) : [];

  // If documents still remain, try one more pass
  if (remainingDocuments.length > 0 && documents.length > 0) {
    console.log(`⚠ ${remainingDocuments.length} documents still remain. Attempting second deletion pass...`);
    const secondPassIds = remainingDocuments.map((doc) => doc.id);
    
    for (const docId of secondPassIds) {
      try {
        await deleteDocument(client, docId);
      } catch (err: any) {
        // Ignore errors on second pass - document might already be deleted
        const errorMsg =
          err?.message ||
          err?.response?.errors?.[0]?.message ||
          String(err);
        if (
          !errorMsg.includes("not found") &&
          !errorMsg.includes("no CREATE_DOCUMENT operation")
        ) {
          // Only log unexpected errors
        }
      }
    }
    
    // Wait again for propagation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    // Check again
    remainingDocuments = await getAllDocuments(client);
    if (deleteDrives) {
      remainingDrives = await getAllDrives(systemClient);
    }
  }

  console.log("✅ Switchboard reset complete!");
  console.log();
  console.log("Summary:");
  console.log(`  - Documents deleted: ${documents.length}`);
  console.log(`  - Documents remaining: ${remainingDocuments.length}`);
  if (deleteDrives) {
    console.log(`  - Drives remaining: ${remainingDrives.length}`);
  }
  
  if (remainingDocuments.length > 0) {
    console.warn(`\n⚠ Warning: ${remainingDocuments.length} documents still remain.`);
    console.warn(`   These may be system documents or documents in an invalid state.`);
    console.warn(`   You may need to check the system or run the script again.`);
  } else {
    console.log(`\n✓ All documents successfully deleted!`);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
